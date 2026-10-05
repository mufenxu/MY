package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import kotlinx.coroutines.delay

private enum class ReservationTab(val label: String) {
    Single("单次预约"),
    My("已约空间"),
    Auto("自动任务"),
}

@Composable
fun ReservationScreen(
    state: ReservationUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadSpaces: () -> Unit,
    onLoadAutoCandidateSpaces: () -> Unit,
    onLoadMyReservations: () -> Unit,
    onOpenOfficialReservation: () -> Unit,
    onRefreshIdentityCode: () -> Unit,
    onQueryRulesAndAvailability: (Int, String) -> Unit,
    onQuerySpacesByTime: (String, String, String, String?) -> Unit,
    onSubmitReservation: (CampusReservationRequest, () -> Unit) -> Unit,
    onLoadAutoTasks: () -> Unit,
    onSaveAutoTask: (CampusAutoReservationTask, () -> Unit) -> Unit,
    onToggleAutoTask: (CampusAutoReservationTask) -> Unit,
    onDeleteAutoTask: (String) -> Unit,
    onCancelReservation: (String) -> Unit,
    onEndReservation: (String) -> Unit,
    onRescheduleReservation: (String, CampusReservationRequest, () -> Unit) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(ReservationTab.Single) }
    var showIdentityCodeDialog by rememberSaveable { mutableStateOf(false) }
    var rescheduleTarget by remember { mutableStateOf<CampusMyReservation?>(null) }

    LaunchedEffect(Unit) {
        onLoadSpaces()
        onLoadMyReservations()
        onLoadAutoTasks()
    }

    if (showIdentityCodeDialog) {
        IdentityCodeDialog(
            code = state.identityCode,
            loading = state.identityCodeLoading,
            error = state.identityCodeError,
            onRefresh = onRefreshIdentityCode,
            onDismiss = { showIdentityCodeDialog = false },
        )
    }

    rescheduleTarget?.let { target ->
        RescheduleReservationDialog(
            reservation = target,
            spaces = state.spaces,
            availableSpaces = state.availableSpaces,
            availableSpacesQueryText = state.availableSpacesQueryText,
            availableSpacesLoading = state.availableSpacesLoading,
            submitting = state.reschedulingReservationId == target.id,
            onQuerySpacesByTime = onQuerySpacesByTime,
            onDismiss = { if (state.reschedulingReservationId == null) rescheduleTarget = null },
            onConfirm = { request -> onRescheduleReservation(target.id, request) { rescheduleTarget = null } },
        )
    }

    val identityCodeExpiresAt = state.identityCode?.expiresAt
    LaunchedEffect(showIdentityCodeDialog, identityCodeExpiresAt) {
        if (!showIdentityCodeDialog || identityCodeExpiresAt == null) return@LaunchedEffect
        val expiresAtMillis = identityCodeExpiryMillis(identityCodeExpiresAt) ?: return@LaunchedEffect
        delay((expiresAtMillis - System.currentTimeMillis() - 1500).coerceAtLeast(1000))
        onRefreshIdentityCode()
    }

    AppSubPage(
        title = "研讨间预约",
        subtitle = "图书馆空间预约 · 自动任务",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing || state.spacesLoading || state.myReservationsLoading || state.autoTasksLoading,
        onRefresh = onRefresh,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.QrCode,
                contentDescription = "显示个人身份码",
                onClick = {
                    showIdentityCodeDialog = true
                    onRefreshIdentityCode()
                },
            )
            AppHeaderIconButton(
                icon = Icons.Outlined.Public,
                contentDescription = "打开学校官方预约",
                onClick = onOpenOfficialReservation,
            )
        },
    ) {
        item(key = "tab-selector", contentType = "tab") {
            AppSegmentedControl(
                options = ReservationTab.entries,
                selected = selectedTab,
                onSelect = { selectedTab = it },
                label = { it.label },
                count = { if (it == ReservationTab.My) state.myReservations.size.takeIf { size -> size > 0 } else null },
            )
        }

        state.message?.let { message ->
            item(key = "reservation-success-msg", contentType = "banner") {
                AppFeedbackBanner(message = message, error = false)
            }
        }

        state.error?.let { message ->
            item(key = "reservation-error-msg", contentType = "banner") {
                AppFeedbackBanner(
                    message = if (message.contains("登录") || message.contains("会话")) {
                        "学校账号登录已失效，请重新登录后再试。"
                    } else {
                        "操作失败：$message"
                    },
                    error = true,
                )
            }
        }

        when (selectedTab) {
            ReservationTab.Single -> {
                item(key = "single-reservation-form", contentType = "form") {
                    SingleReservationPanel(
                        spaces = state.spaces,
                        spacesLoading = state.spacesLoading,
                        queryLoading = state.queryLoading,
                        availableSpaces = state.availableSpaces,
                        availableSpacesQueryText = state.availableSpacesQueryText,
                        availableSpacesLoading = state.availableSpacesLoading,
                        submitLoading = state.submitLoading,
                        rules = state.rules,
                        availability = state.availability,
                        freeWindows = state.freeWindows,
                        busyWindows = state.busyWindows,
                        availabilitySpaceId = state.availabilitySpaceId,
                        availabilityDate = state.availabilityDate,
                        myReservations = state.myReservations,
                        onReloadSpaces = onLoadSpaces,
                        onQuery = onQueryRulesAndAvailability,
                        onQuerySpacesByTime = onQuerySpacesByTime,
                        onSubmit = onSubmitReservation,
                        onNavigateToMyReservations = { selectedTab = ReservationTab.My },
                        onClearFeedback = onClearFeedback,
                    )
                }
            }
            ReservationTab.My -> {
                item(key = "my-reservations-panel", contentType = "my") {
                    MyReservationsPanel(
                        reservations = state.myReservations,
                        loading = state.myReservationsLoading,
                        cancellingReservationId = state.cancellingReservationId,
                        endingReservationId = state.endingReservationId,
                        reschedulingReservationId = state.reschedulingReservationId,
                        onRefresh = onLoadMyReservations,
                        onGoToSingleReservation = { selectedTab = ReservationTab.Single },
                        onCancelReservation = onCancelReservation,
                        onEndReservation = onEndReservation,
                        onRescheduleReservation = { reservation -> rescheduleTarget = reservation },
                    )
                }
            }
            ReservationTab.Auto -> {
                item(key = "auto-reservation-panel", contentType = "auto") {
                    AutoReservationPanel(
                        spaces = (state.spaces + state.autoCandidateSpaces).distinctBy { it.id },
                        candidateSpaces = state.autoCandidateSpaces,
                        candidateSpacesReferenceDate = state.autoCandidateSpacesReferenceDate,
                        candidateSpacesCachedAt = state.autoCandidateSpacesCachedAt,
                        candidateSpacesLoading = state.autoCandidateSpacesLoading,
                        candidateSpacesError = state.autoCandidateSpacesError,
                        tasks = state.autoTasks,
                        tasksLoading = state.autoTasksLoading,
                        savingTask = state.savingTask,
                        deletingTaskId = state.deletingTaskId,
                        onLoadCandidateSpaces = onLoadAutoCandidateSpaces,
                        onSaveTask = onSaveAutoTask,
                        onToggleTask = onToggleAutoTask,
                        onDeleteTask = onDeleteAutoTask,
                        onClearFeedback = onClearFeedback,
                    )
                }
            }
        }
    }
}
