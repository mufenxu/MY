package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.EventBusy
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusAutoReservationTask
import cn.pxyb.mycontrol.data.CampusReservationSpace
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.formatPlatformTime
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
internal fun AutoTaskCard(
    task: CampusAutoReservationTask,
    spaces: List<CampusReservationSpace>,
    isDeleting: Boolean,
    onToggle: () -> Unit,
    onEdit: () -> Unit,
    onCopy: () -> Unit,
    onDelete: () -> Unit,
) {
    val spaceMap = remember(spaces) { spaces.associateBy({ it.id }, { it.name }) }
    val semantic = when (task.status) {
        "waiting", "ready", "running" -> AppStatusSemantic.Info
        "succeeded" -> AppStatusSemantic.Success
        "failed", "auth_required", "expired", "invalid" -> AppStatusSemantic.Warning
        else -> AppStatusSemantic.Neutral
    }
    val accent = when (semantic) {
        AppStatusSemantic.Info -> ColorTokens.Blue
        AppStatusSemantic.Success -> ColorTokens.Green
        AppStatusSemantic.Warning -> ColorTokens.Amber
        else -> null
    }
    val accentForeground = accent?.foreground ?: MaterialTheme.colorScheme.onSurfaceVariant
    val accentContainer = accent?.container ?: MaterialTheme.colorScheme.surfaceVariant
    val accentBorder = accent?.border ?: MaterialTheme.colorScheme.outlineVariant
    val statusIcon = when (task.status) {
        "waiting", "ready", "running" -> Icons.Outlined.AutoAwesome
        "succeeded" -> Icons.Outlined.CheckCircle
        "auth_required" -> Icons.Outlined.Lock
        "expired" -> Icons.Outlined.EventBusy
        "invalid", "failed" -> Icons.Outlined.WarningAmber
        else -> Icons.Outlined.Info
    }
    val terminalStatus = task.status in setOf("succeeded", "failed", "auth_required", "expired", "invalid", "disabled")

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)),
        color = glassCardColor(),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Surface(
                    shape = RoundedCornerShape(10.dp),
                    color = accentContainer,
                    border = BorderStroke(1.dp, accentBorder.copy(alpha = 0.7f)),
                    modifier = Modifier.size(36.dp),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = statusIcon,
                            contentDescription = null,
                            tint = accentForeground,
                            modifier = Modifier.size(19.dp),
                        )
                    }
                }

                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Text(
                        text = task.name,
                        style = MaterialTheme.typography.titleSmall.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    AppStatusBadge(label = task.statusText, semantic = semantic)
                }

                AppSwitch(
                    checked = task.enabled,
                    onCheckedChange = { _: Boolean -> onToggle() }.takeIf { !terminalStatus },
                )
            }

            // 目标 / 运行 / 下次运行
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                val taskWk = remember(task.reservationDate) {
                    try {
                        val d = LocalDate.parse(task.reservationDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
                        " ${weekdayName(d)}"
                    } catch (_: Throwable) {
                        ""
                    }
                }
                AppDetailRow(
                    label = "目标日期",
                    value = task.reservationDate.ifBlank { "--" } + taskWk,
                    icon = Icons.Outlined.CalendarMonth,
                    valueColor = MaterialTheme.colorScheme.onSurface,
                )

                val executeWk = remember(task.executeDate) {
                    try {
                        val d = LocalDate.parse(task.executeDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
                        " ${weekdayName(d)}"
                    } catch (_: Throwable) {
                        ""
                    }
                }
                val executeText = if (task.executeDate.isNotBlank()) {
                    "${task.executeDate}$executeWk ${task.executeTime}"
                } else {
                    "进入 3 天窗口后 ${task.executeTime}"
                }
                AppDetailRow(
                    label = "运行时间",
                    value = executeText,
                    icon = Icons.Outlined.AccessTime,
                )

                if (task.nextRunAt != null) {
                    AppDetailRow(
                        label = "下次运行",
                        value = formatPlatformTime(task.nextRunAt),
                        icon = Icons.Outlined.EventAvailable,
                        valueColor = MaterialTheme.colorScheme.primary,
                    )
                }
            }

            // 候选空间与时段：按优先级编号展示
            if (task.candidates.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.MeetingRoom,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(14.dp),
                        )
                        Text(
                            text = "候选空间与时段",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Surface(
                            shape = RoundedCornerShape(999.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                            border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Text(
                                text = "${task.candidates.size} 个",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = 7.dp, vertical = 1.dp),
                            )
                        }
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        task.candidates.forEachIndexed { index, candidate ->
                            val sName = spaceMap[candidate.areaId] ?: "空间${candidate.areaId}"
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(20.dp)
                                        .clip(CircleShape)
                                        .background(
                                            if (index == 0) {
                                                MaterialTheme.colorScheme.primaryContainer
                                            } else {
                                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.7f)
                                            },
                                        ),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Text(
                                        text = "${index + 1}",
                                        style = MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 10.5.sp,
                                            fontWeight = FontWeight.Bold,
                                        ),
                                        color = if (index == 0) {
                                            MaterialTheme.colorScheme.primary
                                        } else {
                                            MaterialTheme.colorScheme.onSurfaceVariant
                                        },
                                    )
                                }
                                Text(
                                    text = sName,
                                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.5.sp),
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Surface(
                                    shape = RoundedCornerShape(999.dp),
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                                    border = BorderStroke(
                                        0.6.dp,
                                        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.8f),
                                    ),
                                ) {
                                    Text(
                                        text = "${candidate.startTime} - ${candidate.endTime}",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            // 最近执行结果
            val resultText = when {
                task.lastStatus == null -> "尚未执行"
                task.lastStatus == "succeeded" -> "最近执行成功（命中了第 ${(task.lastCandidateIndex ?: 0) + 1} 个候选）"
                task.lastStatus == "expired" -> "任务已过期：${task.lastMessage ?: "预约目标日期已结束"}"
                task.lastStatus == "invalid" -> "任务配置无效：${task.lastMessage ?: "请重新编辑任务"}"
                task.lastStatus == "auth_required" -> "需重新登录学校账号：${task.lastMessage ?: "请重新登录后再试"}"
                else -> "最近执行未成功：${task.lastMessage ?: "未返回原因"}"
            }
            val resultAccent = when {
                task.lastStatus == "succeeded" -> ColorTokens.Green
                task.lastStatus == null -> null
                else -> ColorTokens.Amber
            }
            val resultForeground = resultAccent?.foreground ?: MaterialTheme.colorScheme.onSurfaceVariant
            val resultContainer = resultAccent?.container?.copy(alpha = 0.6f)
                ?: MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
            val resultBorder = resultAccent?.border?.copy(alpha = 0.7f)
                ?: MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                color = resultContainer,
                border = BorderStroke(1.dp, resultBorder),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = when {
                            task.lastStatus == "succeeded" -> Icons.Outlined.CheckCircle
                            task.lastStatus == null -> Icons.Outlined.Info
                            else -> Icons.Outlined.WarningAmber
                        },
                        contentDescription = null,
                        tint = resultForeground,
                        modifier = Modifier.size(15.dp),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = "最近执行结果",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.5.sp),
                            fontWeight = FontWeight.SemiBold,
                            color = resultForeground,
                        )
                        Text(
                            text = resultText,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            // 最近尝试明细
            if (task.lastAttempts.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "最近尝试",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
                        border = BorderStroke(
                            0.6.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                        ),
                    ) {
                        Column(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            task.lastAttempts.take(4).forEach { attempt ->
                                val attemptResult = when {
                                    attempt.status == "succeeded" -> "成功"
                                    attempt.conflict -> "已占用"
                                    attempt.transient -> "系统繁忙，已重试"
                                    else -> "失败"
                                }
                                val attemptDot = when {
                                    attempt.status == "succeeded" -> ColorTokens.Green.foreground
                                    attempt.conflict -> ColorTokens.Amber.foreground
                                    attempt.transient -> ColorTokens.Blue.foreground
                                    else -> ColorTokens.Red.foreground
                                }
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(6.dp)
                                            .clip(CircleShape)
                                            .background(attemptDot),
                                    )
                                    Text(
                                        text = "候选 ${attempt.candidateIndex + 1} · 第 ${attempt.attempt} 次 · $attemptResult${attempt.message?.let { "：$it" } ?: ""}",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        modifier = Modifier.weight(1f),
                                    )
                                }
                            }
                            if (task.lastAttempts.size > 4) {
                                Text(
                                    text = "其余 ${task.lastAttempts.size - 4} 次尝试已省略",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

            // 操作栏
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppButton(
                    text = "编辑",
                    onClick = onEdit,
                    modifier = Modifier.weight(1f),
                    height = 40.dp,
                )
                AppSecondaryButton(
                    text = "再次预约",
                    onClick = onCopy,
                    modifier = Modifier.weight(1f),
                    height = 40.dp,
                    compact = true,
                )
                AppDangerButton(
                    text = "删除",
                    onClick = onDelete,
                    enabled = !isDeleting,
                    loading = isDeleting,
                    modifier = Modifier.weight(1f),
                    height = 40.dp,
                    compact = true,
                )
            }
        }
    }
}
