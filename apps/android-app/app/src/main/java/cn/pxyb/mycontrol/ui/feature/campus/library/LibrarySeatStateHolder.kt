package cn.pxyb.mycontrol.ui.feature.campus.library

import cn.pxyb.mycontrol.data.CampusRepository
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatReservationRequest
import cn.pxyb.mycontrol.data.LibrarySeatWaitlistRequest
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

class LibrarySeatStateHolder(
    parentScope: CoroutineScope,
    private val campus: CampusRepository,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<LibrarySeatUiState>(parentScope, LibrarySeatUiState(), onSessionExpired) {
    private var queryJob: Job? = null

    override fun clearPendingState(current: LibrarySeatUiState) = current.copy(
        overviewLoading = false,
        areasLoading = false,
        seatsLoading = false,
        floorSeatsLoading = false,
        submitLoading = false,
        reservationsLoading = false,
        historyReservationsLoading = false,
        waitlistsLoading = false,
        waitlistSaving = false,
        waitlistDeletingId = null,
    )

    fun showError(message: String) {
        mutableState.update { it.copy(error = message) }
    }

    fun clearLibrarySeatQuery() {
        queryJob?.cancel()
        queryJob = null
        mutableState.update {
            it.copy(
                query = null,
                areas = emptyList(),
                seats = emptyList(),
                floorSeats = emptyList(),
                areasLoading = false,
                seatsLoading = false,
                floorSeatsLoading = false,
                selectedAreaId = null,
                selectedSeatId = null,
            )
        }
    }

    fun refreshLibrarySeat() {
        loadLibrarySeatOverview(force = true)
        loadLibrarySeatReservations(force = true)
        loadLibrarySeatWaitlists(force = true)
    }

    fun loadLibrarySeatOverview(force: Boolean = false) {
        if (mutableState.value.overviewLoading && !force) return
        scope.launch {
            mutableState.update { it.copy(overviewLoading = true, error = null, message = null) }
            try {
                val overview = campus.librarySeatOverview()
                mutableState.update { current ->
                    val venueId = current.selectedVenueId.takeIf { selected ->
                        overview.venues.any { it.id == selected }
                    } ?: overview.venues.firstOrNull()?.id
                    val date = current.selectedDate.takeIf { selected ->
                        overview.dates.contains(selected)
                    } ?: overview.dates.firstOrNull()
                    current.copy(
                        overview = overview,
                        overviewLoading = false,
                        selectedVenueId = venueId,
                        selectedDate = date,
                    )
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        overviewLoading = false,
                        error = error.message ?: "座位场馆加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryLibrarySeatAreas(
        venueId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        floorId: String? = null,
        pageSize: Int = 50,
        currentPage: Int = 1,
        power: Boolean = false,
        window: Boolean = false,
    ) {
        if (
            venueId.isBlank() ||
            date.isBlank() ||
            startMinute < 0 ||
            endMinute <= startMinute
        ) return
        clearLibrarySeatQuery()
        val query = LibrarySeatQuery(venueId, date, startMinute, endMinute, floorId, power, window)
        queryJob = scope.launch {
            mutableState.update {
                it.copy(
                    query = query,
                    areasLoading = true,
                    areas = emptyList(),
                    error = null,
                    message = null,
                    selectedVenueId = venueId,
                    selectedDate = date,
                    selectedFloorId = floorId,
                    selectedAreaId = null,
                    selectedSeatId = null,
                    seats = emptyList(),
                )
            }
            try {
                val areas = campus.librarySeatAreas(
                    venueId = venueId,
                    date = date,
                    startMinute = startMinute,
                    endMinute = endMinute,
                    floorId = floorId,
                    pageSize = pageSize,
                    currentPage = currentPage,
                    power = power,
                    window = window,
                )
                if (!isActive || mutableState.value.query != query) return@launch
                mutableState.update {
                    it.copy(
                        areas = areas,
                        areasLoading = false,
                    )
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        areasLoading = false,
                        error = error.message ?: "阅览区查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun loadLibrarySeatSeats(
        roomId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        amPm: Int = 0,
    ) {
        if (roomId.isBlank() || date.isBlank() || endMinute <= startMinute) return
        val query = mutableState.value.query ?: return
        if (query.date != date || query.startMinute != startMinute || query.endMinute != endMinute) {
            showError("查询条件已变更，请重新查询阅览区。")
            return
        }
        queryJob?.cancel()
        queryJob = scope.launch {
            mutableState.update {
                it.copy(
                    seatsLoading = true,
                    seats = emptyList(),
                    error = null,
                    message = null,
                    selectedAreaId = roomId,
                    selectedDate = date,
                    selectedSeatId = null,
                )
            }
            try {
                val seats = campus.librarySeatSeats(roomId, date, startMinute, endMinute, amPm)
                if (!isActive || mutableState.value.query != query) return@launch
                mutableState.update {
                    it.copy(
                        seats = seats,
                        seatsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        seatsLoading = false,
                        error = error.message ?: "座位列表加载失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryLibrarySeatFloorSeats(
        venueId: String,
        floorId: String,
        date: String,
        startMinute: Int,
        endMinute: Int,
        minLabel: Int = 1,
        maxLabel: Int = 45,
    ) {
        if (
            venueId.isBlank() ||
            floorId.isBlank() ||
            date.isBlank() ||
            startMinute < 0 ||
            endMinute <= startMinute
        ) return
        clearLibrarySeatQuery()
        val query = LibrarySeatQuery(venueId, date, startMinute, endMinute, floorId)
        queryJob = scope.launch {
            mutableState.update {
                it.copy(
                    query = query,
                    floorSeatsLoading = true,
                    floorSeats = emptyList(),
                    selectedVenueId = venueId,
                    selectedFloorId = floorId,
                    selectedDate = date,
                    error = null,
                    message = null,
                )
            }
            try {
                val areas = campus.librarySeatAreas(
                    venueId = venueId,
                    date = date,
                    startMinute = startMinute,
                    endMinute = endMinute,
                    floorId = floorId,
                    pageSize = 50,
                    currentPage = 1,
                    power = false,
                    window = false,
                )
                val floorSeats = coroutineScope {
                    areas.map { area ->
                        async {
                            campus.librarySeatSeats(area.id, date, startMinute, endMinute, 0)
                                .map { seat -> LibrarySeatFloorSeat(area.id, area.name, seat) }
                        }
                    }.flatMap { it.await() }
                }.filter { floorSeat ->
                    (floorSeat.seat.label.toIntOrNull() ?: -1) in minLabel..maxLabel
                }.sortedWith(
                    compareBy<LibrarySeatFloorSeat> { it.seat.label.toIntOrNull() ?: Int.MAX_VALUE }
                        .thenBy { it.seat.label }
                        .thenBy { it.areaName },
                )
                if (!isActive || mutableState.value.query != query) return@launch
                mutableState.update {
                    it.copy(
                        floorSeats = floorSeats,
                        floorSeatsLoading = false,
                    )
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        floorSeatsLoading = false,
                        error = error.message ?: "二层座位查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun submitLibrarySeatReservation(request: LibrarySeatReservationRequest, onSuccess: () -> Unit = {}) {
        val current = mutableState.value
        val query = current.query
        val seat = current.seats.firstOrNull { it.id == request.seatId }
            ?: current.floorSeats.firstOrNull { it.seat.id == request.seatId }?.seat
        if (query == null || query.date != request.date || query.startMinute != request.startMinute ||
            query.endMinute != request.endMinute || seat?.isFree != true || current.seatsLoading || current.floorSeatsLoading
        ) {
            showError("座位查询结果已失效，请按当前日期与时段重新查询后提交。")
            return
        }
        launchAction(
            isBusy = { submitLoading },
            start = { copy(submitLoading = true, error = null, message = null) },
            action = { campus.submitLibrarySeatReservation(request) },
            success = {
                copy(
                    submitLoading = false,
                    message = "座位预约已提交成功，请以学校预约系统记录为准。",
                )
            },
            failure = { error -> copy(submitLoading = false, error = error.message ?: "座位预约提交失败，请重试。") },
            afterSuccess = {
                loadLibrarySeatReservations()
                onSuccess()
            },
        )
    }

    fun loadLibrarySeatReservations(force: Boolean = false) = launchAction(
        isBusy = { reservationsLoading && !force },
        start = { copy(reservationsLoading = true) },
        action = { campus.librarySeatReservations() },
        success = { records -> copy(reservations = records, reservationsLoading = false) },
        failure = { error ->
            copy(
                reservationsLoading = false,
                error = error.message ?: "座位预约记录加载失败，请重试。",
            )
        },
    )

    fun loadLibrarySeatReservationHistory(force: Boolean = false) = launchAction(
        isBusy = { historyReservationsLoading && !force },
        start = { copy(historyReservationsLoading = true) },
        action = { campus.librarySeatReservationHistory(page = 0, size = 20) },
        success = { history ->
            copy(
                historyReservations = history,
                historyReservationsLoading = false,
            )
        },
        failure = { error ->
            copy(
                historyReservationsLoading = false,
                error = error.message ?: "历史预约记录加载失败，请重试。",
            )
        },
    )

    fun loadLibrarySeatWaitlists(force: Boolean = false) = launchAction(
        isBusy = { waitlistsLoading && !force },
        start = { copy(waitlistsLoading = true) },
        action = { campus.librarySeatWaitlists() },
        success = { tasks -> copy(waitlists = tasks, waitlistsLoading = false) },
        failure = { error ->
            copy(
                waitlistsLoading = false,
                error = error.message ?: "候补任务加载失败，请重试。",
            )
        },
    )

    fun createLibrarySeatWaitlist(request: LibrarySeatWaitlistRequest, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { waitlistSaving },
        start = { copy(waitlistSaving = true, error = null, message = null) },
        action = { campus.createLibrarySeatWaitlist(request) },
        success = {
            copy(
                waitlistSaving = false,
                message = "候补监听已开启，检测到释放座位将自动预约。",
            )
        },
        failure = { error -> copy(waitlistSaving = false, error = error.message ?: "候补任务创建失败，请重试。") },
        afterSuccess = {
            loadLibrarySeatWaitlists(force = true)
            onSuccess()
        },
    )

    fun setLibrarySeatWaitlistEnabled(taskId: String, enabled: Boolean, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { waitlistSaving },
        start = { copy(waitlistSaving = true, error = null, message = null) },
        action = { campus.setLibrarySeatWaitlistEnabled(taskId, enabled) },
        success = {
            copy(
                waitlistSaving = false,
                message = if (enabled) "候补监听已重新开启。" else "已停止候补监听。",
            )
        },
        failure = { error -> copy(waitlistSaving = false, error = error.message ?: "候补任务状态更新失败，请重试。") },
        afterSuccess = {
            loadLibrarySeatWaitlists(force = true)
            onSuccess()
        },
    )

    fun deleteLibrarySeatWaitlist(taskId: String, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { taskId.isBlank() || waitlistSaving },
        start = {
            copy(
                waitlistSaving = true,
                waitlistDeletingId = taskId,
                error = null,
                message = null,
            )
        },
        action = { campus.deleteLibrarySeatWaitlist(taskId) },
        success = {
            copy(
                waitlistSaving = false,
                waitlistDeletingId = null,
                message = "候补任务已删除。",
            )
        },
        failure = { error ->
            copy(
                waitlistSaving = false,
                waitlistDeletingId = null,
                error = error.message ?: "候补任务删除失败，请重试。",
            )
        },
        afterSuccess = {
            loadLibrarySeatWaitlists(force = true)
            onSuccess()
        },
    )

    fun clearLibrarySeatFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

}
