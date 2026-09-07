package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.CampusRepository
import kotlinx.coroutines.CoroutineScope
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationAvailability
import cn.pxyb.mycontrol.data.CampusReservationRequest
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.supervisorScope

class ReservationStateHolder(
    parentScope: CoroutineScope,
    private val campus: CampusRepository,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<ReservationUiState>(parentScope, ReservationUiState(), onSessionExpired) {
    override fun clearPendingState(current: ReservationUiState) = current.copy(
        spacesLoading = false,
        availableSpacesLoading = false,
        queryLoading = false,
        submitLoading = false,
        autoTasksLoading = false,
        savingTask = false,
        myReservationsLoading = false,
        deletingTaskId = null,
        cancellingReservationId = null,
    )

    fun showError(message: String) {
        mutableState.update { it.copy(error = message) }
    }

    fun refreshReservation() {
        loadReservationSpaces(force = true)
        loadMyReservations(force = true)
        loadAutoReservationTasks(force = true)
    }

    fun loadReservationSpaces(force: Boolean = false) = launchAction(
        isBusy = { spacesLoading },
        start = { copy(spacesLoading = true, error = null) },
        action = { campus.campusReservationSpaces() },
        success = { spaces -> copy(spaces = spaces, spacesLoading = false) },
        failure = { error -> copy(spacesLoading = false, error = error.message ?: "空间加载失败，请重试。") },
    )

    fun queryReservationRulesAndAvailability(spaceId: Int, date: String) {
        if (spaceId <= 0 || date.isBlank() || mutableState.value.queryLoading) return
        scope.launch {
            mutableState.update {
                it.copy(
                    queryLoading = true,
                    rules = "查询中...",
                    availability = "查询中...",
                    freeWindows = emptyList(),
                    busyWindows = emptyList(),
                    availabilitySpaceId = null,
                    availabilityDate = null,
                    error = null,
                )
            }
            try {
                supervisorScope {
                    val rulesDeferred = async {
                        try {
                            campus.campusReservationRules(spaceId)
                        } catch (error: Throwable) {
                            handleRequestFailure(error)
                            null
                        }
                    }
                    val availabilityDeferred = async {
                        try {
                            campus.campusReservationAvailability(spaceId, date)
                        } catch (error: Throwable) {
                            handleRequestFailure(error)
                            null
                        }
                    }
                    val rules = rulesDeferred.await() ?: "暂无规则信息"
                    val availability = availabilityDeferred.await()
                        ?: CampusReservationAvailability(detail = "暂无时段占用信息")
                    mutableState.update {
                        it.copy(
                            rules = rules,
                            availability = availability.detail,
                            freeWindows = availability.freeWindows,
                            busyWindows = availability.busyWindows,
                            availabilitySpaceId = spaceId,
                            availabilityDate = date,
                            queryLoading = false,
                        )
                    }
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        rules = "查询失败",
                        availability = "查询失败",
                        freeWindows = emptyList(),
                        busyWindows = emptyList(),
                        availabilitySpaceId = null,
                        availabilityDate = null,
                        queryLoading = false,
                        error = error.message ?: "查询失败，请重试。",
                    )
                }
            }
        }
    }

    fun queryAvailableSpacesByTime(date: String, startTime: String, endTime: String) = launchAction(
        isBusy = {
            date.isBlank() || startTime.isBlank() || endTime.isBlank() || availableSpacesLoading
        },
        start = {
            copy(
                availableSpacesLoading = true,
                availableSpaces = emptyList(),
                availableSpacesQueryText = "$date $startTime - $endTime",
                error = null,
            )
        },
        action = { campus.campusReservationSpaces(date = date, startTime = startTime, endTime = endTime) },
        success = { spaces -> copy(availableSpaces = spaces, availableSpacesLoading = false) },
        failure = { error ->
            copy(
                availableSpacesLoading = false,
                error = error.message ?: "按时段查询空闲学习间失败，请重试。",
            )
        },
    )

    fun submitReservation(request: CampusReservationRequest, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { submitLoading },
        start = { copy(submitLoading = true, error = null, message = null) },
        action = { campus.submitCampusReservation(request) },
        success = {
            copy(
                submitLoading = false,
                message = "预约已提交成功，请以学校预约系统记录为准。",
            )
        },
        failure = { error -> copy(submitLoading = false, error = error.message ?: "预约提交失败，请重试。") },
        afterSuccess = {
            loadMyReservations(force = true)
            onSuccess()
        },
    )

    fun loadMyReservations(force: Boolean = false) = launchAction(
        isBusy = { myReservationsLoading },
        start = { copy(myReservationsLoading = true, error = null) },
        action = { campus.campusMyReservations() },
        success = { records -> copy(myReservations = records, myReservationsLoading = false) },
        failure = { error -> copy(myReservationsLoading = false, error = error.message ?: "预约记录加载失败，请重试。") },
    )

    fun cancelMyReservation(reservationId: String, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { reservationId.isBlank() || cancellingReservationId != null },
        start = { copy(cancellingReservationId = reservationId, error = null, message = null) },
        action = { campus.cancelCampusReservation(reservationId) },
        success = {
            copy(
                cancellingReservationId = null,
                message = "已成功取消该研讨间预约。",
                myReservations = myReservations.filter { it.id != reservationId },
            )
        },
        failure = { error ->
            copy(
                cancellingReservationId = null,
                error = error.message ?: "取消预约失败，请重试。",
            )
        },
        afterSuccess = {
            loadMyReservations(force = true)
            onSuccess()
        },
    )

    fun loadAutoReservationTasks(force: Boolean = false) = launchAction(
        isBusy = { autoTasksLoading },
        start = { copy(autoTasksLoading = true, error = null) },
        action = { campus.campusAutoReservations() },
        success = { tasks -> copy(autoTasks = tasks, autoTasksLoading = false) },
        failure = { error ->
            copy(
                autoTasksLoading = false,
                error = error.message ?: "自动预约任务加载失败。",
            )
        },
    )

    fun saveAutoReservationTask(task: CampusAutoReservationTask, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { savingTask },
        start = { copy(savingTask = true, error = null, message = null) },
        action = {
            if (task.id.isNotBlank()) {
                campus.updateCampusAutoReservation(task)
            } else {
                campus.createCampusAutoReservation(task)
            }
        },
        success = {
            copy(
                savingTask = false,
                message = "自动预约任务已保存。",
            )
        },
        failure = { error -> copy(savingTask = false, error = error.message ?: "自动预约任务保存失败。") },
        afterSuccess = {
            loadAutoReservationTasks(force = true)
            onSuccess()
        },
    )

    fun toggleAutoReservationTask(task: CampusAutoReservationTask) {
        scope.launch {
            try {
                campus.updateCampusAutoReservation(task.copy(enabled = !task.enabled))
                loadAutoReservationTasks(force = true)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(error = error.message ?: "任务状态更新失败。")
                }
            }
        }
    }

    fun deleteAutoReservationTask(taskId: String) {
        if (taskId.isBlank()) return
        scope.launch {
            mutableState.update { it.copy(deletingTaskId = taskId, error = null, message = null) }
            try {
                campus.deleteCampusAutoReservation(taskId)
                mutableState.update {
                    it.copy(
                        deletingTaskId = null,
                        message = "自动预约任务已删除。",
                    )
                }
                loadAutoReservationTasks(force = true)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        deletingTaskId = null,
                        error = error.message ?: "任务删除失败。",
                    )
                }
            }
        }
    }

    fun clearReservationFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

}
