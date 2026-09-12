package cn.pxyb.mycontrol.ui.feature.workspace

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError

@Immutable
data class TodayUiState(
    val refreshing: Boolean,
    val calendarSyncing: Boolean,
    val sectionError: String?,
    val offlineMode: Boolean,
    val todoSnapshot: TodoSnapshot,
    val pendingTodoMutations: Int,
    val timetable: CampusTimetable?,
    val campusOverview: CampusOverview?,
    val unreadAlerts: Int,
    val resourceExpiries: List<ResourceExpiry>,
    val sharedTodoDraft: String?,
)

internal fun AppUiState.toTodayUiState() = TodayUiState(
    refreshing = isRefreshing(DataSection.Todos, DataSection.Campus, DataSection.Resources, DataSection.Incidents),
    calendarSyncing = "calendar-sync" in actions.running,
    sectionError = sectionError(DataSection.Todos, DataSection.Campus, DataSection.Resources),
    offlineMode = listOf(DataSection.Todos, DataSection.Campus, DataSection.Resources).any { sectionLoadStates[it]?.fromCache == true },
    todoSnapshot = todoSnapshot,
    pendingTodoMutations = pendingTodoMutations,
    timetable = campusTimetable,
    campusOverview = campusOverview,
    unreadAlerts = alerts.activeUnreadCount(),
    resourceExpiries = resourceExpiries,
    sharedTodoDraft = sharedTodoDraft,
)
