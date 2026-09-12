package cn.pxyb.mycontrol.ui.feature.projects

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.Ct8Data
import cn.pxyb.mycontrol.data.PlatformUser
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources

@Immutable
data class ProjectsUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyActions: Set<String>,
    val user: PlatformUser?,
    val ct8: Ct8Data?,
)

internal fun AppUiState.toProjectsUiState() = ProjectsUiState(
    refreshing = isRefreshing(DataSection.Ct8),
    sectionError = sectionError(DataSection.Ct8),
    busyActions = actions.running.filter { "ct8" in actionResources(it) }.toSet(),
    user = user,
    ct8 = ct8,
)
