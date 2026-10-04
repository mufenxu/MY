package cn.pxyb.mycontrol.ui.feature.campus.reservation

import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusRepository
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class ReservationStateHolder(
    parentScope: CoroutineScope,
    private val campus: CampusRepository,
    private val store: PersonalWorkspaceStore,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<ReservationUiState>(parentScope, ReservationUiState(), onSessionExpired) {
    private var autoCandidateSpacesJob: Job? = null

    override fun clearPendingState(current: ReservationUiState) = current.copy(
        spacesLoading = false,
        autoCandidateSpaces = emptyList(),
        autoCandidateSpacesReferenceDate = null,
        autoCandidateSpacesCachedAt = null,
        autoCandidateSpacesLoading = false,
        autoCandidateSpacesError = null,
        availableSpacesLoading = false,
        queryLoading = false,
        submitLoading = false,
        autoTasksLoading = false,
        savingTask = false,
        myReservationsLoading = false,
        deletingTaskId = null,
        cancellingReservationId = null,
        endingReservationId = null,
        reschedulingReservationId = null,
        identityCode = null,
        identityCodeLoading = false,
        identityCodeError = null,
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
        action = {
            campus.campusReservationSpaces().also {
                currentCoroutineContext().ensureActive()
                runCatching { store.writeReservationDirectory(it) }
                    .onFailure { showError("房间目录已加载，但本机缓存保存失败，请重试。") }
            }
        },
        success = { spaces -> copy(spaces = spaces, spacesLoading = false) },
        failure = { error -> copy(spacesLoading = false, error = error.message ?: "空间加载失败，请重试。") },
    )

    fun loadAutoCandidateSpaces() {
        if (mutableState.value.autoCandidateSpacesLoading) return
        autoCandidateSpacesJob?.cancel()
        mutableState.update {
            it.copy(
                autoCandidateSpacesLoading = true,
                autoCandidateSpacesError = null,
            )
        }
        autoCandidateSpacesJob = scope.launch {
            try {
                val cached = store.readReservationDirectory()
                if (cached != null && cached.spaces.isNotEmpty()) {
                    mutableState.update {
                        it.copy(
                            autoCandidateSpaces = cached.spaces,
                            autoCandidateSpacesReferenceDate = null,
                            autoCandidateSpacesCachedAt = cached.savedAtMillis,
                        )
                    }
                }
                // 选房目录不依赖目标日是否已开放；仅在无日期目录为空时查询当天作参考。
                var spaces = campus.campusReservationSpaces()
                var referenceDate: String? = null
                if (spaces.isEmpty()) {
                    referenceDate = LocalDate.now(ZoneId.of("Asia/Shanghai")).toString()
                    spaces = campus.campusReservationSpaces(date = referenceDate)
                }
                currentCoroutineContext().ensureActive()
                val cacheSaved = runCatching { store.writeReservationDirectory(spaces) }.isSuccess
                mutableState.update {
                    it.copy(
                        autoCandidateSpaces = spaces.ifEmpty { it.autoCandidateSpaces },
                        autoCandidateSpacesReferenceDate = if (spaces.isNotEmpty()) referenceDate else it.autoCandidateSpacesReferenceDate,
                        autoCandidateSpacesCachedAt = if (spaces.isNotEmpty()) null else it.autoCandidateSpacesCachedAt,
                        autoCandidateSpacesLoading = false,
                        autoCandidateSpacesError = when {
                            spaces.isEmpty() -> "暂未获取到房间目录，可使用历史房间或先保存待选房草稿。"
                            !cacheSaved -> "目录已加载，但本机缓存保存失败，请重试。"
                            else -> null
                        },
                    )
                }
            } catch (error: Throwable) {
                currentCoroutineContext().ensureActive()
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        autoCandidateSpacesLoading = false,
                        autoCandidateSpacesError = error.message ?: "候选研讨间加载失败，请重试。",
                    )
                }
            }
        }
    }

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
                coroutineScope {
                    val rulesDeferred = async {
                        campus.campusReservationRules(spaceId)
                    }
                    val availabilityDeferred = async {
                        campus.campusReservationAvailability(spaceId, date)
                    }
                    val rules = rulesDeferred.await()
                    val availability = availabilityDeferred.await()
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

    // excludeReservationId 用于改期查询：排除待改期预约自身占用的时段，该预约会在改期时先取消。
    fun queryAvailableSpacesByTime(
        date: String,
        startTime: String,
        endTime: String,
        excludeReservationId: String? = null,
    ) = launchAction(
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
        action = {
            campus.campusReservationSpaces(
                date = date,
                startTime = startTime,
                endTime = endTime,
                excludeReservationId = excludeReservationId,
            )
        },
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

    fun refreshIdentityCode() = launchAction(
        isBusy = { identityCodeLoading },
        start = { copy(identityCodeLoading = true, identityCode = null, identityCodeError = null) },
        action = { campus.campusIdentityCode() },
        success = { code -> copy(identityCode = code, identityCodeLoading = false) },
        failure = { error ->
            copy(
                identityCodeLoading = false,
                identityCodeError = error.message ?: "个人身份码获取失败，请重试。",
            )
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

    fun endMyReservation(reservationId: String, onSuccess: () -> Unit = {}) = launchAction(
        isBusy = { reservationId.isBlank() || endingReservationId != null },
        start = { copy(endingReservationId = reservationId, error = null, message = null) },
        action = { campus.endCampusReservation(reservationId) },
        success = {
            copy(
                endingReservationId = null,
                message = "已结束该研讨间使用。",
            )
        },
        failure = { error ->
            copy(
                endingReservationId = null,
                error = error.message ?: "结束使用失败，请重试。",
            )
        },
        afterSuccess = {
            loadMyReservations(force = true)
            onSuccess()
        },
    )

    // 学校预约系统没有修改预约的接口，改期由服务端按「先取消、再创建」执行。
    // 失败时可能是「原预约已取消、新预约未成功」，因此成功与失败都重新拉取列表以对齐学校系统。
    fun rescheduleMyReservation(
        reservationId: String,
        request: CampusReservationRequest,
        onSuccess: () -> Unit = {},
    ) {
        if (reservationId.isBlank() || mutableState.value.reschedulingReservationId != null) return
        scope.launch {
            mutableState.update {
                it.copy(reschedulingReservationId = reservationId, error = null, message = null)
            }
            try {
                campus.rescheduleCampusReservation(reservationId, request)
                mutableState.update {
                    it.copy(
                        reschedulingReservationId = null,
                        message = "已改期到 ${request.date} ${request.startTime} - ${request.endTime}。",
                    )
                }
                loadMyReservations(force = true)
                onSuccess()
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        reschedulingReservationId = null,
                        error = error.message ?: "更改预约时间失败，请重试。",
                    )
                }
                loadMyReservations(force = true)
            }
        }
    }

    fun loadAutoReservationTasks(force: Boolean = false) = launchAction(
        isBusy = { autoTasksLoading },
        start = {
            copy(
                autoTasks = store.readReservationDrafts() + autoTasks.filterNot { it.isLocalDraft },
                autoTasksLoading = true,
                error = null,
            )
        },
        action = { campus.campusAutoReservations() },
        success = { tasks -> copy(autoTasks = store.readReservationDrafts() + tasks, autoTasksLoading = false) },
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
            val drafts = store.readReservationDrafts()
            val existingDraft = drafts.firstOrNull { it.id == task.id }
            if (task.isLocalDraft) {
                require(task.id.isBlank() || existingDraft != null) { "已有正式任务不能改存为本机草稿。" }
                val draft = task.copy(
                    id = existingDraft?.id ?: "local-draft-${UUID.randomUUID()}",
                    enabled = false,
                    status = "draft",
                    statusText = "待选房草稿",
                )
                store.writeReservationDrafts(listOf(draft) + drafts.filterNot { it.id == draft.id })
            } else {
                require(task.candidates.isNotEmpty() && task.candidates.all { it.areaId > 0 }) { "请先补选研讨间，再创建正式任务。" }
                if (existingDraft != null || task.id.isBlank()) {
                    campus.createCampusAutoReservation(task.copy(id = ""))
                } else {
                    campus.updateCampusAutoReservation(task)
                }
                currentCoroutineContext().ensureActive()
                if (existingDraft != null) {
                    store.writeReservationDrafts(store.readReservationDrafts().filterNot { it.id == task.id })
                }
            }
        },
        success = {
            copy(
                autoTasks = store.readReservationDrafts() + autoTasks.filterNot { it.isLocalDraft },
                savingTask = false,
                message = if (task.isLocalDraft) "待选房草稿已保存在本机，不会自动预约；补选房间后再创建任务。" else "自动预约任务已保存。",
            )
        },
        failure = { error -> copy(savingTask = false, error = error.message ?: "自动预约任务保存失败。") },
        afterSuccess = {
            if (!task.isLocalDraft) loadAutoReservationTasks(force = true)
            onSuccess()
        },
    )

    fun toggleAutoReservationTask(task: CampusAutoReservationTask) {
        if (task.isLocalDraft) {
            showError("草稿不能直接启用，请编辑草稿并补选研讨间。")
            return
        }
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
                val drafts = store.readReservationDrafts()
                val isDraft = drafts.any { it.id == taskId }
                if (isDraft) {
                    store.writeReservationDrafts(drafts.filterNot { it.id == taskId })
                } else {
                    campus.deleteCampusAutoReservation(taskId)
                }
                currentCoroutineContext().ensureActive()
                mutableState.update {
                    it.copy(
                        autoTasks = it.autoTasks.filterNot { task -> task.id == taskId },
                        deletingTaskId = null,
                        message = if (isDraft) "本机草稿已删除。" else "自动预约任务已删除。",
                    )
                }
                if (!isDraft) loadAutoReservationTasks(force = true)
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
