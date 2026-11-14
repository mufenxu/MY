package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.EditCalendar
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusMyReservation
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.display.AppDivider

@Composable
internal fun MyReservationsPanel(
    reservations: List<CampusMyReservation>,
    loading: Boolean,
    cancellingReservationId: String?,
    endingReservationId: String?,
    reschedulingReservationId: String?,
    onRefresh: () -> Unit,
    onGoToSingleReservation: () -> Unit,
    onCancelReservation: (String) -> Unit,
    onEndReservation: (String) -> Unit,
    onRescheduleReservation: (CampusMyReservation) -> Unit,
) {
    val sortedReservations = remember(reservations) {
        val today = LocalDate.now()
        reservations.sortedWith(
            compareBy<CampusMyReservation>(
                { reservation ->
                    val date = runCatching {
                        LocalDate.parse(reservation.date.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
                    }.getOrNull()
                    date?.let { kotlin.math.abs(java.time.temporal.ChronoUnit.DAYS.between(today, it)) }
                        ?: Long.MAX_VALUE
                },
                { it.date },
                { it.startTime },
            )
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppPanel {
            Column(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text("我的已约空间", style = MaterialTheme.typography.titleLarge)
                        Text(
                            "学校图书馆研讨间系统当前已生效的个人预约凭证",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppHeaderIconButton(
                        icon = Icons.Outlined.Refresh,
                        contentDescription = "刷新已约记录",
                        onClick = onRefresh,
                        loading = loading,
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh,
                    )
                }

                if (sortedReservations.isEmpty() && !loading) {
                    AppEmptyState(
                        title = "暂无已预约的研讨间",
                        detail = "您在学校图书馆系统暂无生效中的个人预约记录",
                        icon = Icons.Outlined.EventAvailable,
                        actionText = "前往单次预约",
                        onAction = onGoToSingleReservation,
                    )
                }
            }
        }

        // 预约卡片与标题卡片并列排布，不再嵌套在同一张卡片里。
        if (useTwoPaneLayout()) {
            sortedReservations.chunked(2).forEach { rowReservations ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    rowReservations.forEach { reservation ->
                        Box(modifier = Modifier.weight(1f)) {
                            ReservationCard(
                                reservation = reservation,
                                cancellingReservationId = cancellingReservationId,
                                endingReservationId = endingReservationId,
                                reschedulingReservationId = reschedulingReservationId,
                                onCancel = onCancelReservation,
                                onEnd = onEndReservation,
                                onReschedule = onRescheduleReservation,
                            )
                        }
                    }
                    if (rowReservations.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        } else {
            sortedReservations.forEach { reservation ->
                ReservationCard(
                    reservation = reservation,
                    cancellingReservationId = cancellingReservationId,
                    endingReservationId = endingReservationId,
                    reschedulingReservationId = reschedulingReservationId,
                    onCancel = onCancelReservation,
                    onEnd = onEndReservation,
                    onReschedule = onRescheduleReservation,
                )
            }
        }
    }
}

@Composable
private fun ReservationCard(
    reservation: CampusMyReservation,
    cancellingReservationId: String?,
    endingReservationId: String?,
    reschedulingReservationId: String?,
    onCancel: (String) -> Unit,
    onEnd: (String) -> Unit,
    onReschedule: (CampusMyReservation) -> Unit,
) {
    val cancelling = cancellingReservationId == reservation.id
    val ending = endingReservationId == reservation.id
    val rescheduling = reschedulingReservationId == reservation.id
    val busy = cancellingReservationId != null || endingReservationId != null || reschedulingReservationId != null
    var pendingAction by remember { mutableStateOf<String?>(null) }
    val actionable = reservation.id.isNotBlank() &&
        !reservation.id.startsWith("local_") &&
        !reservation.id.startsWith("remote_") &&
        (reservation.canCancel || reservation.canEndUse || reservation.canReschedule)

    AppPanel {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    AppIconTile(
                        icon = Icons.Outlined.MeetingRoom,
                        tint = MaterialTheme.colorScheme.primary,
                        background = MaterialTheme.colorScheme.primaryContainer,
                    )
                    Column {
                        Text(
                            text = reservation.spaceName,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (reservation.id.isNotBlank() && !reservation.id.startsWith("local_") && !reservation.id.startsWith("remote_")) {
                            Text(
                                text = "单号：${reservation.id}",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                AppStatusBadge(label = reservation.statusText, semantic = AppStatusSemantic.Success)
            }

            AppDivider(paddingStart = 0.dp, paddingEnd = 0.dp)

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Outlined.CalendarMonth,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "${reservation.date}   ${reservation.startTime} - ${reservation.endTime}",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                if (reservation.title.isNotBlank()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Outlined.Description,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = reservation.title,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            if (actionable) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (reservation.canEndUse) {
                        AppDangerButton(
                            text = "结束使用",
                            onClick = { pendingAction = "end" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                            loading = ending,
                            height = 40.dp,
                        )
                    } else {
                        if (reservation.canReschedule) {
                            AppSecondaryButton(
                                text = "更改时间",
                                icon = Icons.Outlined.EditCalendar,
                                onClick = { onReschedule(reservation) },
                                modifier = Modifier.weight(1f),
                                enabled = !busy,
                                loading = rescheduling,
                                height = 40.dp,
                            )
                        }
                        if (reservation.canCancel) {
                            AppDangerButton(
                                text = "取消预约",
                                onClick = { pendingAction = "cancel" },
                                modifier = Modifier.weight(1f),
                                enabled = !busy,
                                loading = cancelling,
                                height = 40.dp,
                            )
                        }
                    }
                }
            }

        }
    }
    when (pendingAction) {
        "cancel" -> AppConfirmDialog(
            title = "取消预约",
            detail = "${reservation.spaceName} · ${reservation.date} ${reservation.startTime}-${reservation.endTime}\n取消后空间立即释放，需要重新提交申请。",
            confirmLabel = "确认取消",
            icon = Icons.Outlined.EventBusy,
            danger = true,
            busy = cancelling,
            onDismiss = { pendingAction = null },
            onConfirm = {
                pendingAction = null
                onCancel(reservation.id)
            },
        )
        "end" -> AppConfirmDialog(
            title = "结束使用",
            detail = "${reservation.spaceName} · ${reservation.date} ${reservation.startTime}-${reservation.endTime}\n结束后空间立即释放，其他同学可以预约。",
            confirmLabel = "结束使用",
            icon = Icons.Outlined.Stop,
            danger = true,
            busy = ending,
            onDismiss = { pendingAction = null },
            onConfirm = {
                pendingAction = null
                onEnd(reservation.id)
            },
        )
    }
}
