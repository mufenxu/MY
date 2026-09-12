package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusIdentityCode
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.data.CampusReservationTimeWindow

@Immutable
data class ReservationUiState(
    val refreshing: Boolean = false,
    val spaces: List<CampusReservationSpace> = emptyList(),
    val spacesLoading: Boolean = false,
    val rules: String? = null,
    val availability: String? = null,
    val freeWindows: List<CampusReservationTimeWindow> = emptyList(),
    val busyWindows: List<CampusReservationTimeWindow> = emptyList(),
    val availabilitySpaceId: Int? = null,
    val availabilityDate: String? = null,
    val availableSpaces: List<CampusReservationSpace> = emptyList(),
    val availableSpacesQueryText: String? = null,
    val availableSpacesLoading: Boolean = false,
    val queryLoading: Boolean = false,
    val submitLoading: Boolean = false,
    val autoTasks: List<CampusAutoReservationTask> = emptyList(),
    val autoTasksLoading: Boolean = false,
    val savingTask: Boolean = false,
    val deletingTaskId: String? = null,
    val myReservations: List<CampusMyReservation> = emptyList(),
    val myReservationsLoading: Boolean = false,
    val cancellingReservationId: String? = null,
    val identityCode: CampusIdentityCode? = null,
    val identityCodeLoading: Boolean = false,
    val identityCodeError: String? = null,
    val error: String? = null,
    val message: String? = null,
)
