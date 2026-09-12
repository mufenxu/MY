package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatOverview
import cn.pxyb.mycontrol.data.LibrarySeatReservationHistory
import cn.pxyb.mycontrol.data.LibrarySeatReservationRecord
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import cn.pxyb.mycontrol.data.LibrarySeatVenue
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistTask

@Immutable
data class LibrarySeatQuery(
    val venueId: String,
    val date: String,
    val startMinute: Int,
    val endMinute: Int,
    val floorId: String? = null,
    val power: Boolean = false,
    val window: Boolean = false,
)

@Immutable
data class LibrarySeatUiState(
    val query: LibrarySeatQuery? = null,
    val overview: LibrarySeatOverview = LibrarySeatOverview(),
    val overviewLoading: Boolean = false,
    val areas: List<LibrarySeatArea> = emptyList(),
    val areasLoading: Boolean = false,
    val seats: List<LibrarySeatStatus> = emptyList(),
    val seatsLoading: Boolean = false,
    val floorSeats: List<LibrarySeatFloorSeat> = emptyList(),
    val floorSeatsLoading: Boolean = false,
    val submitLoading: Boolean = false,
    val reservations: List<LibrarySeatReservationRecord> = emptyList(),
    val reservationsLoading: Boolean = false,
    val historyReservations: LibrarySeatReservationHistory = LibrarySeatReservationHistory(),
    val historyReservationsLoading: Boolean = false,
    val waitlists: List<LibrarySeatWaitlistTask> = emptyList(),
    val waitlistsLoading: Boolean = false,
    val waitlistSaving: Boolean = false,
    val waitlistDeletingId: String? = null,
    val selectedVenueId: String? = null,
    val selectedDate: String? = null,
    val selectedFloorId: String? = null,
    val selectedAreaId: String? = null,
    val selectedSeatId: String? = null,
    val error: String? = null,
    val message: String? = null,
) {
    val venues: List<LibrarySeatVenue> get() = overview.venues
    val dates: List<String> get() = overview.dates
    val refreshing: Boolean get() = overviewLoading || areasLoading || seatsLoading || floorSeatsLoading || submitLoading ||
        reservationsLoading || historyReservationsLoading
}
