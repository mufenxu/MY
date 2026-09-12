package cn.pxyb.mycontrol.ui.feature.campus

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError

@Immutable
data class FreeClassroomUiState(
    val refreshing: Boolean,
    val error: String?,
    val result: CampusFreeClassrooms?,
)

internal fun AppUiState.toFreeClassroomUiState() = FreeClassroomUiState(
    refreshing = isRefreshing(DataSection.FreeClassrooms),
    error = sectionError(DataSection.FreeClassrooms),
    result = freeClassroomResult ?: campusOverview?.freeClassrooms,
)
