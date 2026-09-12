package cn.pxyb.mycontrol.ui.feature.tools

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources

@Immutable
data class ToolsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyActions: Set<String> = emptySet(),
    val user: PlatformUser?,
    val overview: OverviewData?,
    val iot: IotData?,
    val unreadAlerts: Int,
)

internal fun AppUiState.toToolsUiState() = ToolsUiState(
    refreshing = isRefreshing(DataSection.Iot),
    sectionError = sectionError(DataSection.Iot),
    busyActions = actions.running.filter { "iot" in actionResources(it) }.toSet(),
    user = user,
    overview = overview,
    iot = iot,
    unreadAlerts = alerts.activeUnreadCount(),
)
