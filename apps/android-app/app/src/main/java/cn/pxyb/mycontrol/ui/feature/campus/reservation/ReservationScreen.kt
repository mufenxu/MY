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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationRequest
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
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
    onLoadMyReservations: () -> Unit,
    onOpenOfficialReservation: () -> Unit,
    onRefreshIdentityCode: () -> Unit,
    onQueryRulesAndAvailability: (Int, String) -> Unit,
    onQuerySpacesByTime: (String, String, String) -> Unit,
    onSubmitReservation: (CampusReservationRequest, () -> Unit) -> Unit,
    onLoadAutoTasks: () -> Unit,
    onSaveAutoTask: (CampusAutoReservationTask, () -> Unit) -> Unit,
    onToggleAutoTask: (CampusAutoReservationTask) -> Unit,
    onDeleteAutoTask: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var selectedTab by rememberSaveable { mutableStateOf(ReservationTab.Single) }
    var showIdentityCodeDialog by rememberSaveable { mutableStateOf(false) }

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
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ReservationTab.entries.forEach { tab ->
                    val isSelected = selectedTab == tab
                    val badgeCount = if (tab == ReservationTab.My) state.myReservations.size else 0
                    Surface(
                        onClick = { selectedTab = tab },
                        shape = RoundedCornerShape(10.dp),
                        color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        border = BorderStroke(
                            1.dp,
                            if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                        ),
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxSize(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center,
                        ) {
                            Icon(
                                imageVector = when (tab) {
                                    ReservationTab.Single -> Icons.Outlined.MeetingRoom
                                    ReservationTab.My -> Icons.Outlined.EventAvailable
                                    ReservationTab.Auto -> Icons.Outlined.AutoAwesome
                                },
                                contentDescription = null,
                                tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp),
                            )
                            Spacer(Modifier.width(5.dp))
                            Text(
                                text = tab.label,
                                style = MaterialTheme.typography.titleSmall.copy(fontSize = 13.sp),
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                            if (badgeCount > 0) {
                                Spacer(Modifier.width(4.dp))
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer,
                                ) {
                                    Text(
                                        text = "$badgeCount",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                        color = if (isSelected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
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
                        onRefresh = onLoadMyReservations,
                        onGoToSingleReservation = { selectedTab = ReservationTab.Single },
                    )
                }
            }
            ReservationTab.Auto -> {
                item(key = "auto-reservation-panel", contentType = "auto") {
                    AutoReservationPanel(
                        spaces = state.spaces,
                        tasks = state.autoTasks,
                        tasksLoading = state.autoTasksLoading,
                        savingTask = state.savingTask,
                        deletingTaskId = state.deletingTaskId,
                        onReloadSpaces = onLoadSpaces,
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
