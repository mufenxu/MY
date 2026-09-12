package cn.pxyb.mycontrol.ui.feature.overview

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError

@Immutable
data class OverviewUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val overview: OverviewData?,
    val externalApplications: List<ExternalApplication>,
    val externalApplicationsLoading: Boolean = false,
    val incidents: List<IncidentInfo>,
    val offlineMode: Boolean,
    val cachedAtMillis: Long?,
    val homeQuickActionOrder: List<HomeQuickAction>,
    val hiddenHomeQuickActions: Set<HomeQuickAction>,
    val todoSnapshot: TodoSnapshot,
    val timetable: CampusTimetable?,
    val campusOverview: CampusOverview?,
    val unreadAlerts: Int,
    val assistantSnapshot: PersonalAssistantSnapshot?,
)

internal fun AppUiState.toOverviewUiState() = OverviewUiState(
    refreshing = isRefreshing(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus, DataSection.Todos),
    sectionError = sectionError(DataSection.Overview, DataSection.ExternalApplications, DataSection.Incidents, DataSection.Tasks, DataSection.Campus, DataSection.Todos),
    overview = overview,
    externalApplications = externalApplications,
    externalApplicationsLoading = sectionLoadStates[DataSection.ExternalApplications]?.refreshing == true,
    incidents = incidents,
    offlineMode = offlineMode,
    cachedAtMillis = cachedAtMillis,
    homeQuickActionOrder = homeQuickActionOrder,
    hiddenHomeQuickActions = hiddenHomeQuickActions,
    todoSnapshot = todoSnapshot,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.activeUnreadCount(),
    assistantSnapshot = assistantSnapshot,
)
