package cn.pxyb.mycontrol.ui.components.picker

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
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.util.Locale

internal fun formatMinutesToTime(minutes: Int): String {
    val h = (minutes / 60).coerceIn(0, 23)
    val m = (minutes % 60).coerceIn(0, 59)
    return String.format(Locale.ROOT, "%02d:%02d", h, m)
}

/**
 * 现代起止时段滚轮选择器卡片
 *
 * 特性：
 * - 左右双联大卡片，直观展示开始与结束时间；
 * - 点击任一卡片唤起毛玻璃滚轮弹窗；
 * - 支持时长合规性自动校验与徽标提示；
 * - 内置常用时长一键顺延推算药丸按钮（如 1小时、1.5小时、2小时、3小时、4小时）。
 */
@Composable
fun AppTimeRangePicker(
    startTime: String,
    endTime: String,
    onStartTimeChange: (String) -> Unit,
    onEndTimeChange: (String) -> Unit,
    sectionTitle: String = "时间时段",
    modifier: Modifier = Modifier,
    minStartTime: String = "08:00",
    maxStartTime: String = "20:45",
    minEndTime: String = "08:15",
    maxEndTime: String = "21:45",
    minuteStep: Int = 15,
    minDurationMinutes: Int? = 60,
    maxDurationMinutes: Int? = 240,
    quickDurationOptions: List<Int> = listOf(60, 90, 120, 180, 240),
    defaultAutoDurationMinutes: Int = 120,
) {
    var pickingTarget by remember { mutableStateOf<String?>(null) }

    val startMin = parseTimeToMinutes(startTime)
    val endMin = parseTimeToMinutes(endTime)
    val durationMin = if (startMin != null && endMin != null && endMin > startMin) endMin - startMin else null
    val hasDurationRule = minDurationMinutes != null || maxDurationMinutes != null
    val isDurationValid = durationMin != null && hasDurationRule &&
        (minDurationMinutes == null || durationMin >= minDurationMinutes) &&
        (maxDurationMinutes == null || durationMin <= maxDurationMinutes)
    val maxEndMin = parseTimeToMinutes(maxEndTime) ?: 1290

    if (pickingTarget != null) {
        val isStart = pickingTarget == "start"
        AppTimePickerModal(
            title = if (isStart) "选择开始时间" else "选择结束时间",
            currentTime = if (isStart) startTime else endTime,
            minTime = if (isStart) minStartTime else minEndTime,
            maxTime = if (isStart) maxStartTime else maxEndTime,
            minuteStep = minuteStep,
            onDismiss = { pickingTarget = null },
            onConfirm = { chosen ->
                if (isStart) {
                    onStartTimeChange(chosen)
                    val newStartMin = parseTimeToMinutes(chosen)
                    if (newStartMin != null) {
                        val currEndMin = parseTimeToMinutes(endTime)
                        val durationBroken = currEndMin == null || currEndMin <= newStartMin ||
                            (minDurationMinutes != null && (currEndMin - newStartMin) < minDurationMinutes) ||
                            (maxDurationMinutes != null && (currEndMin - newStartMin) > maxDurationMinutes)
                        if (durationBroken) {
                            val autoEndMin = (newStartMin + defaultAutoDurationMinutes).coerceAtMost(maxEndMin)
                            onEndTimeChange(formatMinutesToTime(autoEndMin))
                        }
                    }
                } else {
                    onEndTimeChange(chosen)
                }
            },
        )
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // 1. 顶部标题与时长状态徽标
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = sectionTitle,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (hasDurationRule && durationMin != null) {
                val hours = durationMin / 60
                val mins = durationMin % 60
                val durationText = "${if (hours > 0) "${hours}小时" else ""}${if (mins > 0) "${mins}分钟" else ""}"
                val statusColor = if (isDurationValid) Color(0xFF15803D) else MaterialTheme.colorScheme.error
                val statusBg = if (isDurationValid) Color(0xFFDCFCE7).copy(alpha = 0.55f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
                val ruleText = when {
                    minDurationMinutes != null && maxDurationMinutes != null ->
                        "需${minDurationMinutes / 60}~${maxDurationMinutes / 60}小时"
                    minDurationMinutes != null -> "至少${minDurationMinutes / 60}小时"
                    else -> "至多${(maxDurationMinutes ?: 0) / 60}小时"
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = statusBg,
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (isDurationValid) Icons.Outlined.CheckCircle else Icons.Outlined.WarningAmber,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = if (isDurationValid) "时长 $durationText (合规)" else "时长 $durationText ($ruleText)",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = statusColor,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        // 2. 双联时间大卡片
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 开始时间卡片
            Surface(
                onClick = { pickingTarget = "start" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "开始时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = startTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // 中间箭头指示
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }

            // 结束时间卡片
            Surface(
                onClick = { pickingTarget = "end" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "结束时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = endTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        // 3. 常用时长一键快速推算
        if (quickDurationOptions.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "快捷时长推算（从开始时间自动顺延）",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    quickDurationOptions.forEach { durationMinutes ->
                        val isCurrentDuration = durationMin == durationMinutes
                        Surface(
                            onClick = {
                                val curStartMin = parseTimeToMinutes(startTime) ?: 540
                                val targetEndMin = (curStartMin + durationMinutes).coerceAtMost(maxEndMin)
                                onEndTimeChange(formatMinutesToTime(targetEndMin))
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isCurrentDuration) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            border = BorderStroke(
                                1.dp,
                                if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f),
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(32.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = durationQuickLabel(durationMinutes),
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    fontWeight = if (isCurrentDuration) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun durationQuickLabel(minutes: Int): String {
    val hours = minutes / 60
    val rem = minutes % 60
    return when {
        rem == 0 -> "${hours}小时"
        rem == 30 -> "${hours}.5小时"
        else -> "${minutes}分钟"
    }
}
