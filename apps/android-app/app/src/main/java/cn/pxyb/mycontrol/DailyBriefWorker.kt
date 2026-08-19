package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import cn.pxyb.mycontrol.assistant.DailyBriefPeriod
import cn.pxyb.mycontrol.assistant.nextDailyBriefSchedule
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.accountStorageScope
import java.util.concurrent.TimeUnit

class DailyBriefWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val username = SessionStore(applicationContext).readActiveUsername() ?: return Result.success()
        val store = PersonalWorkspaceStore(applicationContext).apply { setAccount(username) }
        val preferences = store.readAlertPreferences()
        if (!preferences.dailyBriefEnabled) return Result.success()
        val snapshot = store.readAssistantSnapshot()
        val period = runCatching { DailyBriefPeriod.valueOf(inputData.getString(KEY_PERIOD).orEmpty()) }.getOrNull()
        if (snapshot != null && period != null && System.currentTimeMillis() - snapshot.generatedAtMillis <= SNAPSHOT_MAX_AGE_MS) {
            AlertNotifier(applicationContext).apply { setAccount(username) }.notifyDailyBrief(snapshot, period)
        }
        DailyBriefScheduler.schedule(applicationContext, username)
        return Result.success()
    }

    companion object {
        const val KEY_PERIOD = "period"
        private const val SNAPSHOT_MAX_AGE_MS = 48 * 60 * 60_000L
    }
}

object DailyBriefScheduler {
    fun schedule(context: Context, username: String?) {
        val scope = accountStorageScope(username) ?: return
        val store = PersonalWorkspaceStore(context).apply { setAccount(username) }
        val preferences = store.readAlertPreferences()
        val manager = WorkManager.getInstance(context)
        val workName = "my-control-daily-brief-$scope"
        if (!preferences.dailyBriefEnabled) {
            manager.cancelUniqueWork(workName)
            return
        }
        val schedule = nextDailyBriefSchedule(
            morningHour = preferences.morningBriefHour,
            eveningHour = preferences.eveningBriefHour,
        )
        val request = OneTimeWorkRequestBuilder<DailyBriefWorker>()
            .setInitialDelay((schedule.triggerAtMillis - System.currentTimeMillis()).coerceAtLeast(0L), TimeUnit.MILLISECONDS)
            .setInputData(workDataOf(DailyBriefWorker.KEY_PERIOD to schedule.period.name))
            .build()
        manager.enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request)
    }

    fun cancel(context: Context, username: String?) {
        accountStorageScope(username)?.let { scope ->
            WorkManager.getInstance(context).cancelUniqueWork("my-control-daily-brief-$scope")
        }
    }
}
