package cn.pxyb.mycontrol.ui

import android.app.Application
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.DailyBriefScheduler
import cn.pxyb.mycontrol.SnoozedAlertScheduler
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationPreference
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.mergeHydratedAlerts
import cn.pxyb.mycontrol.data.mergeRemoteAlerts
import cn.pxyb.mycontrol.flushNotificationMutations
import java.time.Instant
import java.time.ZoneId
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class NotificationController(
    private val application: Application,
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val sessionStore: SessionStore,
    private val store: PersonalWorkspaceStore,
    private val notifier: AlertNotifier,
    private val appState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
    private val onSync: () -> Unit,
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    private val installationId = application.getSharedPreferences("app_notification_device", 0).let { preferences ->
        preferences.getString("installation_id", null) ?: UUID.randomUUID().toString().also { id ->
            preferences.edit().putString("installation_id", id).apply()
        }
    }
    private var deviceRegistered = false
    private val preferenceMutex = Mutex()

    fun cancelPending() = scope.coroutineContext.cancelChildren()

    fun reset() {
        cancelPending()
        deviceRegistered = false
    }

    fun markRead(id: String) {
        val record = appState.value.alerts.firstOrNull { it.id == id }
        updateAlerts { alerts -> alerts.map { if (it.id == id) it.copy(read = true) else it } }
        if (record?.origin == "remote") launch { request { api.markAppNotificationRead(id) } }
    }

    fun markAllRead() {
        val hasUnreadRemote = appState.value.alerts.any { it.origin == "remote" && !it.read }
        updateAlerts { alerts -> alerts.map { it.copy(read = true) } }
        if (hasUnreadRemote) launch { request { api.markAllAppNotificationsRead() } }
    }

    fun clearRead() {
        val hasReadRemote = appState.value.alerts.any { it.origin == "remote" && it.read }
        updateAlerts { alerts -> alerts.filterNot(AppAlertRecord::read) }
        if (hasReadRemote) launch { request { api.clearReadAppNotifications() }.onSuccess { onSync() } }
    }

    fun archive(id: String) {
        val record = appState.value.alerts.firstOrNull { it.id == id } ?: return
        updateAlerts { alerts -> alerts.filterNot { it.id == id } }
        if (record.origin == "remote") launch { request { api.archiveAppNotification(id) }.onFailure { onSync() } }
    }

    fun snooze(id: String, durationMillis: Long) {
        val record = appState.value.alerts.firstOrNull { it.id == id }
        val snoozedUntil = System.currentTimeMillis() + durationMillis
        updateAlerts { alerts -> alerts.map { if (it.id == id) it.copy(snoozedUntil = snoozedUntil) else it } }
        if (record?.origin == "remote") launch { request { api.snoozeAppNotification(id, snoozedUntil) } }
        SnoozedAlertScheduler.schedule(application, appState.value.user?.username, id, durationMillis)
    }

    /** 把提醒恢复为未读并取消稍后：稍后状态一并清除，保证它重新回到未读列表。 */
    fun restoreUnread(id: String) {
        val record = appState.value.alerts.firstOrNull { it.id == id } ?: return
        updateAlerts { alerts -> alerts.map { if (it.id == id) it.copy(read = false, snoozedUntil = null) else it } }
        SnoozedAlertScheduler.cancelOne(application, appState.value.user?.username, id)
        if (record.origin == "remote") launch { request { api.markAppNotificationUnread(id) } }
    }

    fun updateAlertPreferences(preferences: AlertPreferences, onComplete: (String?) -> Unit = {}) {
        val current = appState.value
        if (current.user == null || current.locked || current.busyAction == "logout") {
            onComplete("请先登录并解锁应用，再保存通知设置。")
            return
        }
        launch {
            try {
                preferenceMutex.withLock {
                    val previous = withStore { readAlertPreferences() }
                    if (previous.quietHoursEnabled != preferences.quietHoursEnabled ||
                        previous.quietStartHour != preferences.quietStartHour || previous.quietEndHour != preferences.quietEndHour
                    ) {
                        api.saveAppNotificationPreference(
                            AppNotificationPreference(
                                quietHoursEnabled = preferences.quietHoursEnabled,
                                quietStartHour = preferences.quietStartHour,
                                quietEndHour = preferences.quietEndHour,
                                timezoneOffsetMinutes = ZoneId.systemDefault().rules.getOffset(Instant.now()).totalSeconds / 60,
                            ),
                        )
                    }
                    withStore {
                        writeAlertPreferences(preferences)
                        DailyBriefScheduler.schedule(application, appState.value.user?.username)
                    }
                    appState.update { it.copy(alertPreferences = preferences, error = null, message = "提醒设置已保存。") }
                }
                onComplete(null)
            } catch (error: Exception) {
                if (error is kotlinx.coroutines.CancellationException) throw error
                onComplete(error.message ?: "通知设置保存失败，请重试。")
                throw error
            }
        }
    }

    fun updateNotificationPreferences(preferences: AlertPreferences) = updateAlertPreferences(preferences)

    fun reloadLocal() = launch {
        preferenceMutex.withLock {
            val (alerts, preferences) = withStore { readAlerts() to readAlertPreferences() }
            appState.update { it.copy(alerts = mergeHydratedAlerts(alerts, it.alerts), alertPreferences = preferences) }
        }
        onSync()
    }

    suspend fun sync() {
        flushNotificationMutations(api, store)
        val registrationError = if (!deviceRegistered) {
            request { api.registerAppDevice(installationId) }
                .onSuccess { deviceRegistered = true }
                .exceptionOrNull()
        } else null
        val remoteItems = supervisorScope {
            val notifications = async { api.allAppNotifications() }
            val preference = async {
                preferenceMutex.withLock {
                    request { api.withRequestMetadata(allowCache = false) { api.appNotificationPreference() }.value }.getOrNull()?.let { remote ->
                        val merged = withStore {
                            readAlertPreferences().copy(
                                quietHoursEnabled = remote.quietHoursEnabled,
                                quietStartHour = remote.quietStartHour.coerceIn(0, 23),
                                quietEndHour = remote.quietEndHour.coerceIn(0, 23),
                            ).also { writeAlertPreferences(it) }
                        }
                        appState.update { it.copy(alertPreferences = merged) }
                    }
                }
            }
            notifications.await().also { preference.await() }
        }
        val currentAlerts = appState.value.alerts
        val currentById = currentAlerts.associateBy(AppAlertRecord::id)
        remoteItems.forEach { remote ->
            val local = currentById[remote.id] ?: return@forEach
            if (local.read && !remote.read) request { api.markAppNotificationRead(remote.id) }
            val localSnooze = local.snoozedUntil
            if (localSnooze != null && localSnooze != remote.snoozedUntil) {
                request { api.snoozeAppNotification(remote.id, localSnooze) }
            }
        }
        val merged = mergeRemoteAlerts(appState.value.alerts, remoteItems)
        withStore {
            writeAlerts(merged)
            notifier.evaluateRemote(merged)
        }
        appState.update { it.copy(alerts = merged) }
        registrationError?.let { throw it }
    }

    private fun updateAlerts(transform: (List<AppAlertRecord>) -> List<AppAlertRecord>) {
        val alerts = transform(appState.value.alerts)
        appState.update { it.copy(alerts = alerts) }
        launch { withStore { writeAlerts(alerts) } }
    }

    private fun launch(block: suspend () -> Unit) {
        val current = appState.value
        if (current.user == null || current.locked || current.busyAction == "logout") return
        scope.launch {
            try {
                api.withRequestMetadata { block() }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, onSessionExpired)
                appState.update { it.copy(error = error.message ?: "通知同步失败，请稍后重试。") }
            }
        }
    }

    private suspend fun <T> request(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (error: Throwable) {
        handleFeatureRequestFailure(error, onSessionExpired)
        Result.failure(error)
    }

    private suspend fun <T> withStore(block: PersonalWorkspaceStore.() -> T): T {
        val session = api.http.currentSession()
        return withContext(Dispatchers.IO) { sessionStore.withRequestSession(session) { store.block() } }
    }
}
