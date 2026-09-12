package cn.pxyb.mycontrol.ui.feature.operations

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.DiagnosticData
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.feature.profile.NetworkHealth
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources

@Immutable
data class OperationsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyActions: Set<String> = emptySet(),
    val user: PlatformUser?,
    val overview: OverviewData?,
    val incidents: List<IncidentInfo>,
    val iot: IotData?,
    val resourceExpiries: List<ResourceExpiry>,
    val unreadAlerts: Int,
    val backup: BackupQuality?,
    val diagnostics: DiagnosticData?,
    val networkHealth: NetworkHealth = NetworkHealth(),
)

internal fun AppUiState.toOperationsUiState() = OperationsUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    sectionError = sectionError(DataSection.Overview, DataSection.Incidents, DataSection.Backup, DataSection.Iot, DataSection.Resources),
    busyActions = actions.running.filter { actionResources(it).any(setOf("incidents", "backup", "diagnostics")::contains) }.toSet(),
    user = user,
    overview = overview,
    incidents = incidents,
    iot = iot,
    resourceExpiries = resourceExpiries,
    unreadAlerts = alerts.activeUnreadCount(),
    backup = backup,
    diagnostics = diagnostics,
    networkHealth = networkHealth,
)
