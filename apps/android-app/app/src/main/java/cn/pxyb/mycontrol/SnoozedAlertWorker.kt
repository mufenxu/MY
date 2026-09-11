package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.accountStorageScope
import java.util.concurrent.TimeUnit

class SnoozedAlertWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ALERT_ID).orEmpty()
        val scope = inputData.getString(KEY_ACCOUNT_SCOPE)
        if (id.isBlank() || scope.isNullOrBlank()) return Result.failure()
        val sessionStore = SessionStore(applicationContext)
        val session = sessionStore.captureRequestSession()
        val username = session.username ?: return Result.success()
        if (session.accountScope != scope) return Result.success()
        return sessionStore.withRequestSession(session) {
            val store = PersonalWorkspaceStore(applicationContext).apply { setAccount(username) }
            val alerts = store.readAlerts()
            val alert = alerts.firstOrNull { it.id == id } ?: return@withRequestSession Result.success()
            val snoozedUntil = alert.snoozedUntil ?: return@withRequestSession Result.success()
            if (snoozedUntil > System.currentTimeMillis()) return@withRequestSession Result.retry()
            // 稍后到时重新提醒：恢复为未读并清除稍后状态，让它回到未读列表而不是静默消失。
            val restored = alert.copy(read = false, snoozedUntil = null)
            store.writeAlerts(alerts.map { if (it.id == id) restored else it })
            AlertNotifier(applicationContext).apply { setAccount(username) }.notifyRecord(restored)
            Result.success()
        }
    }

    companion object {
        const val KEY_ALERT_ID = "alert_id"
        const val KEY_ACCOUNT_SCOPE = "account_scope"
    }
}

object SnoozedAlertScheduler {
    fun schedule(context: Context, username: String?, alertId: String, delayMillis: Long) {
        val scope = accountStorageScope(username) ?: return
        val tag = "snoozed-alert-$scope"
        val request = OneTimeWorkRequestBuilder<SnoozedAlertWorker>()
            .setInitialDelay(delayMillis.coerceAtLeast(1_000L), TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder()
                .putString(SnoozedAlertWorker.KEY_ALERT_ID, alertId)
                .putString(SnoozedAlertWorker.KEY_ACCOUNT_SCOPE, scope)
                .build())
            .addTag(tag)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "$tag-$alertId",
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }

    fun cancel(context: Context, username: String?) {
        val scope = accountStorageScope(username) ?: return
        WorkManager.getInstance(context).cancelAllWorkByTag("snoozed-alert-$scope")
    }

    /** 取消单条提醒的稍后计划（用户手动恢复为未读时使用）。 */
    fun cancelOne(context: Context, username: String?, alertId: String) {
        val scope = accountStorageScope(username) ?: return
        WorkManager.getInstance(context).cancelUniqueWork("snoozed-alert-$scope-$alertId")
    }
}
