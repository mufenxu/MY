package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.TodoRepository
import cn.pxyb.mycontrol.data.mergeRemoteAlerts
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.buildGuardianAlerts
import cn.pxyb.mycontrol.widget.CourseWidgetProvider
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

class OperationalSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    private var syncFailed = false
    private var retryRequired = false

    override suspend fun doWork(): Result {
        MyControlWidgetProvider.refresh(applicationContext)
        CourseWidgetProvider.refresh(applicationContext)
        if (AppSessionLifecycle.isForeground) return Result.success()

        val sessionStore = SessionStore(applicationContext)
        if (!sessionStore.hasSession() || sessionStore.isLockEnabled()) return Result.success()
        val session = sessionStore.captureRequestSession()
        val accountUsername = session.username ?: return Result.success()
        val api = PlatformApi(sessionStore, ResponseSnapshotStore(applicationContext))
        val personalStore = PersonalWorkspaceStore(applicationContext).apply { setAccount(accountUsername) }
        val alertNotifier = AlertNotifier(applicationContext).apply { setAccount(accountUsername) }
        val syncPreferences = applicationContext.getSharedPreferences("operational_sync", Context.MODE_PRIVATE)
        val fullSyncKey = "full_sync_${session.accountScope}"
        val lastFullSync = syncPreferences.getLong(fullSyncKey, 0L)
        val now = System.currentTimeMillis()
        val fullSyncDue = inputData.getBoolean("force_full", false) || lastFullSync <= 0L ||
            lastFullSync > now || now - lastFullSync >= TimeUnit.HOURS.toMillis(1)

        return try {
            api.withRequestMetadata(allowCache = false) {
                sessionStore.withRequestSession(session) { }
                // 通知先独立同步，校园等服务暂不可用时仍可投递平台消息。
                optionalSync { flushNotificationMutations(api, personalStore) }
                val remoteNotifications = optionalSync { api.allAppNotifications() }
                if (remoteNotifications != null) {
                    val currentById = sessionStore.withRequestSession(session) {
                        personalStore.readAlerts().associateBy { it.id }
                    }
                    remoteNotifications.forEach { remote ->
                        val local = currentById[remote.id] ?: return@forEach
                        if (local.read && !remote.read) optionalSync { api.markAppNotificationRead(remote.id) }
                        val localSnooze = local.snoozedUntil
                        if (localSnooze != null && localSnooze != remote.snoozedUntil) {
                            optionalSync { api.snoozeAppNotification(remote.id, localSnooze) }
                        }
                    }
                    sessionStore.withRequestSession(session) {
                        val mergedAlerts = mergeRemoteAlerts(personalStore.readAlerts(), remoteNotifications)
                        personalStore.writeAlerts(mergedAlerts)
                        alertNotifier.evaluateRemote(mergedAlerts)
                    }
                }

                // 提醒、待办和课程保持 15 分钟同步；概要、设备和安全巡检每小时更新。
                val incidents = optionalSync { api.incidents() }
                val tasks = optionalSync { api.tasks().tasks }
                val syncedTodo = optionalSync { TodoRepository(applicationContext, api, sessionStore).sync(refresh = true).snapshot }
                val timetable = optionalSync { api.campus.campusTimetable() }
                val resources = optionalSync { api.resourceExpiries() }
                sessionStore.withRequestSession(session) {
                    if (incidents != null && tasks != null) alertNotifier.evaluate(incidents = incidents, tasks = tasks)
                    if (syncedTodo != null || timetable != null) {
                        alertNotifier.evaluatePersonal(syncedTodo ?: personalStore.readTodoSnapshot(), timetable)
                    }
                    if (resources != null) alertNotifier.evaluateResourceExpiries(resources)
                    if (timetable != null) CourseWidgetProvider.publish(applicationContext, timetable)
                }
                if (!fullSyncDue) return@withRequestMetadata syncResult()

                val overview = optionalSync { api.overview() }
                val iot = optionalSync { api.iot.dashboard(includeAutomations = false) }
                val backup = optionalSync { api.backupQuality() }
                val security = optionalSync { api.auth.security() }
                sessionStore.withRequestSession(session) {
                    val assistant = if (timetable != null && syncedTodo != null && incidents != null &&
                        resources != null && backup != null && security != null && remoteNotifications != null
                    ) {
                        buildPersonalAssistantSnapshot(
                            timetable = timetable,
                            todos = syncedTodo,
                            incidents = incidents,
                            alerts = personalStore.readAlerts(),
                            resources = resources,
                            backup = backup,
                            security = security,
                        ).also { personalStore.writeAssistantSnapshot(it) }
                    } else {
                        personalStore.readAssistantSnapshot()
                    }
                    val guardianAlerts = buildGuardianAlerts(backup = backup, security = security)
                    personalStore.appendAlerts(guardianAlerts)
                    guardianAlerts.forEach { alertNotifier.notifyRecord(it) }
                    if (overview != null && incidents != null && iot != null) {
                        MyControlWidgetProvider.publish(
                            applicationContext,
                            overview,
                            incidents.filter { it.status != "resolved" },
                            iot,
                            assistant,
                            personalStore.readQuickScene(),
                        )
                    }
                    if (!syncFailed) syncPreferences.edit().putLong(fullSyncKey, System.currentTimeMillis()).apply()
                }
                syncResult()
            }.value
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            if (error is IOException || error is ApiException && error.status >= 500) Result.retry() else Result.failure()
        }
    }

    private suspend fun <T> optionalSync(block: suspend () -> T): T? = try {
        block()
    } catch (error: Exception) {
        if (error is CancellationException || error is ApiException &&
            cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession(error.status, error.code)) throw error
        syncFailed = true
        retryRequired = retryRequired || error is IOException || error is ApiException && error.status >= 500
        null
    }

    private fun syncResult(): Result = when {
        retryRequired -> Result.retry()
        syncFailed -> Result.failure()
        else -> Result.success()
    }
}

object OperationalSyncScheduler {
    private const val WORK_NAME = "my-control-operational-sync"
    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<OperationalSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request,
        )
    }

    fun runNow(context: Context) {
        val request = OneTimeWorkRequestBuilder<OperationalSyncWorker>()
            .setInputData(androidx.work.workDataOf("force_full" to true))
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "$WORK_NAME-now",
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

}
