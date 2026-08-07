package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.todayTrendSample
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
        return try {
            val overview = api.overview()
            if (api.isOffline()) return Result.retry()
            val incidents = api.incidents()
            if (api.isOffline()) return Result.retry()
            val tasks = api.tasks().tasks
            if (api.isOffline()) return Result.retry()
            val iot = api.iot()
            if (api.isOffline()) return Result.retry()
            val personalStore = PersonalWorkspaceStore(applicationContext)
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

            val activeIncidents = incidents.filter { it.status != "resolved" }
            MyControlWidgetProvider.publish(applicationContext, overview, activeIncidents, iot)
            AlertNotifier(applicationContext).apply {
                evaluate(incidents = incidents, tasks = tasks)
                evaluatePersonal(syncedTodo, timetable)
                evaluateResourceExpiries(resources)
            }
            todayTrendSample(overview, incidents, tasks, iot)?.let(personalStore::upsertTrendSample)
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
