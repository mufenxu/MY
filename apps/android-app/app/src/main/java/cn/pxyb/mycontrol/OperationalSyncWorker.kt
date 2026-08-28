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
import cn.pxyb.mycontrol.data.mergeRemoteAlerts
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.buildGuardianAlerts
import cn.pxyb.mycontrol.widget.MyControlWidgetProvider
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

class OperationalSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        MyControlWidgetProvider.refresh(applicationContext)
        if (OperationalSyncScheduler.isAppForeground(applicationContext)) return Result.success()

        val sessionStore = SessionStore(applicationContext)
        if (!sessionStore.hasSession() || sessionStore.isLockEnabled()) return Result.success()

        val api = PlatformApi(sessionStore, ResponseSnapshotStore(applicationContext))
        val accountUsername = sessionStore.readActiveUsername()
        val personalStore = PersonalWorkspaceStore(applicationContext).apply { setAccount(accountUsername) }
        val alertNotifier = AlertNotifier(applicationContext).apply { setAccount(accountUsername) }
        if (accountUsername.isNullOrBlank()) return Result.success()
        return try {
            val overview = api.overview()
            if (api.isOffline()) return Result.retry()
            val incidents = api.incidents()
            if (api.isOffline()) return Result.retry()
            val tasks = api.tasks().tasks
            if (api.isOffline()) return Result.retry()
            val iot = api.iot()
            if (api.isOffline()) return Result.retry()
            val todo = api.todos()
            if (api.isOffline()) return Result.retry()
            val pending = personalStore.readPendingTodoMutations()
            val syncedTodo = if (pending.isEmpty()) {
                todo
            } else {
                try {
                    api.mutateTodos(todo.revision, pending)
                } catch (error: ApiException) {
                    if (error.code != "TODO_REVISION_CONFLICT") throw error
                    val latest = api.todos()
                    api.mutateTodos(latest.revision, pending)
                }
            }
            personalStore.writeTodoSnapshot(syncedTodo)
            if (pending.isNotEmpty()) personalStore.writePendingTodoMutations(emptyList())
            val timetable = api.campusTimetable()
            if (api.isOffline()) return Result.retry()
            val resources = api.resourceExpiries()
            if (api.isOffline()) return Result.retry()
            val backup = runCatching { api.backupQuality() }.getOrNull()
            val security = runCatching { api.security() }.getOrNull()
            flushNotificationMutations(api, personalStore)
            val remoteNotifications = api.allAppNotifications()
            val currentAlerts = personalStore.readAlerts()
            val currentById = currentAlerts.associateBy { it.id }
            remoteNotifications.forEach { remote ->
                val local = currentById[remote.id] ?: return@forEach
                if (local.read && !remote.read) runCatching { api.markAppNotificationRead(remote.id) }
                val localSnooze = local.snoozedUntil
                if (localSnooze != null && localSnooze != remote.snoozedUntil) {
                    runCatching { api.snoozeAppNotification(remote.id, localSnooze) }
                }
            }
            val mergedAlerts = mergeRemoteAlerts(currentAlerts, remoteNotifications)
            personalStore.writeAlerts(mergedAlerts)
            alertNotifier.evaluateRemote(mergedAlerts)

            val activeIncidents = incidents.filter { it.status != "resolved" }
            val assistant = buildPersonalAssistantSnapshot(
                timetable = timetable,
                todos = syncedTodo,
                incidents = incidents,
                alerts = mergedAlerts,
                resources = resources,
                backup = backup,
                security = security,
            )
            personalStore.writeAssistantSnapshot(assistant)
            val guardianAlerts = buildGuardianAlerts(backup = backup, security = security)
            personalStore.appendAlerts(guardianAlerts)
            guardianAlerts.forEach { alertNotifier.notifyRecord(it) }
            MyControlWidgetProvider.publish(
                applicationContext,
                overview,
                activeIncidents,
                iot,
                assistant,
                personalStore.readQuickScene(),
            )
            alertNotifier.evaluate(incidents = incidents, tasks = tasks)
            alertNotifier.evaluatePersonal(syncedTodo, timetable)
            alertNotifier.evaluateResourceExpiries(resources)
            Result.success()
        } catch (error: Throwable) {
            if (error is CancellationException) throw error
            if (error is IOException || error is ApiException && error.status >= 500) Result.retry() else Result.failure()
        }
    }
}

object OperationalSyncScheduler {
    private const val WORK_NAME = "my-control-operational-sync"
    private const val PREFERENCES = "operational_sync_state"
    private const val KEY_FOREGROUND = "app_foreground"
    private const val KEY_FOREGROUND_AT = "app_foreground_at"
    private const val FOREGROUND_STALE_MS = 10 * 60_000L

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
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "$WORK_NAME-now",
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    fun setAppForeground(context: Context, foreground: Boolean) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_FOREGROUND, foreground)
            .putLong(KEY_FOREGROUND_AT, System.currentTimeMillis())
            .apply()
    }

    fun isAppForeground(context: Context): Boolean {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        if (!preferences.getBoolean(KEY_FOREGROUND, false)) return false
        val recordedAt = preferences.getLong(KEY_FOREGROUND_AT, 0L)
        return recordedAt > 0L && System.currentTimeMillis() - recordedAt < FOREGROUND_STALE_MS
    }
}
