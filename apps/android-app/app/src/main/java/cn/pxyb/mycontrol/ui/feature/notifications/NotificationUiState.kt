package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing

@Immutable
data class NotificationCenterUiState(
    val refreshing: Boolean,
    val alerts: List<AppAlertRecord>,
    val preferences: AlertPreferences,
    val syncError: String?,
)

internal fun AppUiState.toNotificationCenterUiState() = NotificationCenterUiState(
    refreshing = isRefreshing(DataSection.Notifications),
    alerts = alerts,
    preferences = alertPreferences,
    syncError = sectionLoadStates[DataSection.Notifications]?.error,
)
