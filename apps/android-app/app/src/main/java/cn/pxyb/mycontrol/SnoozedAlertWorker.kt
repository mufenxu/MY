package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import java.util.concurrent.TimeUnit

class SnoozedAlertWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ALERT_ID).orEmpty()
        if (id.isBlank()) return Result.failure()
        val store = PersonalWorkspaceStore(applicationContext)
        val alert = store.readAlerts().firstOrNull { it.id == id } ?: return Result.success()
        val now = System.currentTimeMillis()
        val snoozedUntil = alert.snoozedUntil ?: return Result.success()
        if (snoozedUntil > now) return Result.retry()
        val restored = alert.copy(read = false, snoozedUntil = null)
        store.writeAlerts(store.readAlerts().map { if (it.id == id) restored else it })
        AlertNotifier(applicationContext).notifyRecord(restored)
        return Result.success()
    }

    companion object {
        const val KEY_ALERT_ID = "alert_id"
    }
}

object SnoozedAlertScheduler {
    fun schedule(context: Context, alertId: String, delayMillis: Long) {
        val request = OneTimeWorkRequestBuilder<SnoozedAlertWorker>()
            .setInitialDelay(delayMillis.coerceAtLeast(1_000L), TimeUnit.MILLISECONDS)
            .setInputData(Data.Builder().putString(SnoozedAlertWorker.KEY_ALERT_ID, alertId).build())
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            "snoozed-alert-$alertId",
            ExistingWorkPolicy.REPLACE,
            request,
        )
    }
}
