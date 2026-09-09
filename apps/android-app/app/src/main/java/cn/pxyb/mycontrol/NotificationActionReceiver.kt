package cn.pxyb.mycontrol

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.NotificationMutation
import cn.pxyb.mycontrol.data.NotificationMutationType
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.TodoRepository
import cn.pxyb.mycontrol.data.applyNotificationMutations
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            runCatching { applyAction(context.applicationContext, intent) }
            pendingResult.finish()
        }
    }

    private suspend fun applyAction(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val alertId = intent.getStringExtra(EXTRA_ALERT_ID)?.takeIf(String::isNotBlank) ?: return
        val sessionStore = SessionStore(context)
        val session = sessionStore.captureRequestSession()
        val username = session.username ?: return
        if (intent.getStringExtra(EXTRA_ACCOUNT_SCOPE) != session.accountScope) return
        val store = PersonalWorkspaceStore(context).apply { setAccount(username) }
        val api = PlatformApi(sessionStore, ResponseSnapshotStore(context))
        api.withRequestMetadata {
            val alerts = sessionStore.withRequestSession(session) { store.readAlerts() }
            val alert = alerts.firstOrNull { it.id == alertId }
            val remote = alert?.origin == "remote" || intent.getBooleanExtra(EXTRA_REMOTE, false)
            val mutation = when (action) {
                ACTION_MARK_READ -> NotificationMutation(NotificationMutationType.MarkRead, alertId)
                ACTION_SNOOZE -> NotificationMutation(
                    NotificationMutationType.Snooze,
                    alertId,
                    System.currentTimeMillis() + TimeUnit.HOURS.toMillis(1),
                )
                ACTION_ARCHIVE -> NotificationMutation(NotificationMutationType.Archive, alertId)
                ACTION_COMPLETE_TODO -> {
                    val id = intent.getStringExtra(EXTRA_SOURCE_ID)?.takeIf(String::isNotBlank)
                    if (id != null) {
                        TodoRepository(context, api, sessionStore).updateTask(id) { it.copy(completed = true) }
                    }
                    NotificationMutation(NotificationMutationType.Archive, alertId)
                }
                else -> return@withRequestMetadata
            }
            sessionStore.withRequestSession(session) {
                store.writeAlerts(applyNotificationMutations(store.readAlerts(), listOf(mutation)))
                if (remote) {
                    store.writeNotificationMutations(store.readNotificationMutations() + mutation)
                }
                if (mutation.type == NotificationMutationType.Snooze) {
                    SnoozedAlertScheduler.schedule(context, username, alertId, TimeUnit.HOURS.toMillis(1))
                }
                intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0).takeIf { it != 0 }?.let { notificationId ->
                    context.getSystemService(NotificationManager::class.java)?.cancel(notificationId)
                }
                OperationalSyncScheduler.runNow(context)
            }
        }
    }

    companion object {
        const val ACTION_MARK_READ = "cn.pxyb.mycontrol.notification.MARK_READ"
        const val ACTION_SNOOZE = "cn.pxyb.mycontrol.notification.SNOOZE"
        const val ACTION_ARCHIVE = "cn.pxyb.mycontrol.notification.ARCHIVE"
        const val ACTION_COMPLETE_TODO = "cn.pxyb.mycontrol.notification.COMPLETE_TODO"
        const val EXTRA_ALERT_ID = "alert_id"
        const val EXTRA_SOURCE_ID = "source_id"
        const val EXTRA_REMOTE = "remote"
        const val EXTRA_ACCOUNT_SCOPE = "account_scope"
        const val EXTRA_NOTIFICATION_ID = "notification_id"
    }
}

suspend fun flushNotificationMutations(api: PlatformApi, store: PersonalWorkspaceStore) {
    val pending = store.readNotificationMutations()
    if (pending.isEmpty()) return
    val remaining = mutableListOf<NotificationMutation>()
    pending.forEach { mutation ->
        val result = runCatching {
            when (mutation.type) {
                NotificationMutationType.MarkRead -> api.markAppNotificationRead(mutation.alertId)
                NotificationMutationType.Snooze -> api.snoozeAppNotification(
                    mutation.alertId,
                    mutation.snoozedUntilMillis ?: System.currentTimeMillis(),
                )
                NotificationMutationType.Archive -> api.archiveAppNotification(mutation.alertId)
            }
        }
        val error = result.exceptionOrNull()
        if (error is CancellationException || error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) throw error
        val missingRemoteRecord = (error as? ApiException)?.status == 404
        if (result.isFailure && !missingRemoteRecord) remaining += mutation
    }
    store.writeNotificationMutations(remaining)
}
