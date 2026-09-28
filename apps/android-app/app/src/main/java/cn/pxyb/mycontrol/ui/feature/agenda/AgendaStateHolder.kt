package cn.pxyb.mycontrol.ui.feature.agenda

import cn.pxyb.mycontrol.data.CampusRepository
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AgendaUiState(
    val loading: Boolean = false,
    val rooms: List<CampusMyReservation> = emptyList(),
    val seats: List<LibrarySeatReservationRecord> = emptyList(),
    val loaded: Boolean = false,
    val errors: List<String> = emptyList(),
)

class AgendaStateHolder(parentScope: CoroutineScope, private val campus: CampusRepository, onExpired: (String) -> Unit) :
    FeatureStateHolder<AgendaUiState>(parentScope, AgendaUiState(), onExpired) {
    fun refresh() {
        if (mutableState.value.loading) return
        scope.launch {
            mutableState.update { it.copy(loading = true, errors = emptyList()) }
            val errors = mutableListOf<String>()
            var rooms = mutableState.value.rooms
            var seats = mutableState.value.seats
            try { rooms = campus.campusMyReservations() } catch (error: Throwable) {
                handleRequestFailure(error)
                errors += "研讨间记录未更新：${error.message ?: "请稍后重试"}"
            }
            try { seats = campus.librarySeatReservations() } catch (error: Throwable) {
                handleRequestFailure(error)
                errors += "座位记录未更新：${error.message ?: "请稍后重试"}"
            }
            mutableState.update { it.copy(loading = false, rooms = rooms, seats = seats, loaded = true, errors = errors) }
        }
    }
    override fun clearPendingState(current: AgendaUiState) = current.copy(loading = false)
}
