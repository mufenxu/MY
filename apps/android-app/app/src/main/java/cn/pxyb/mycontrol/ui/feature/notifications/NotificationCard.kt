package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.NotificationKind
import cn.pxyb.mycontrol.data.isHighPriority
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.kind
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.theme.AccentColors
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.util.DateTimeUtils.formatLocalDateTime
import java.time.Instant
import java.time.ZoneId
import kotlin.math.roundToInt

private val ARCHIVE_SWIPE_THRESHOLD = 96.dp

/**
 * 通知卡片。
 *
 * 交互约定：向左滑动超过 [ARCHIVE_SWIPE_THRESHOLD] 后松手归档（此前文案误写成"右滑"），
 * 卡片底部只保留「已读 / 标为未读」与「稍后」两个高频动作，来源与详情入口交给列表本身表达。
 */
@Composable
internal fun NotificationCard(
    alert: AppAlertRecord,
    onOpen: () -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    selected: Boolean = false,
) {
    var offsetX by remember(alert.id) { mutableFloatStateOf(0f) }
    var thresholdNotified by remember(alert.id) { mutableStateOf(false) }
    val thresholdPx = with(LocalDensity.current) { ARCHIVE_SWIPE_THRESHOLD.toPx() }
    val haptics = LocalHapticFeedback.current

    val kind = alert.kind()
    val accent = notificationKindColors(kind)
    val urgent = !alert.read && alert.isHighPriority()
    val snoozed = alert.isSnoozedAt()

    Box(contentAlignment = Alignment.CenterEnd) {
        if (offsetX < 0f) {
            val reached = -offsetX >= thresholdPx
            Box(
                modifier = Modifier
                    .matchParentSize()
                    .background(MaterialTheme.colorScheme.errorContainer, AppCardShape)
                    .padding(horizontal = 22.dp),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector = Icons.Outlined.Archive,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onErrorContainer,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = if (reached) "松开归档" else "左滑归档",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                    )
                }
            }
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .offset { IntOffset(offsetX.roundToInt(), 0) }
                .clip(AppCardShape)
                .pointerInput(alert.id) {
                    detectHorizontalDragGestures(
                        onHorizontalDrag = { _, dragAmount ->
                            if (dragAmount < 0f || offsetX < 0f) {
                                offsetX = (offsetX + dragAmount).coerceAtMost(0f)
                            }
                            val reached = -offsetX >= thresholdPx
                            if (reached && !thresholdNotified) {
                                thresholdNotified = true
                                AppHaptics.heavy(haptics)
                            } else if (!reached) {
                                thresholdNotified = false
                            }
                        },
                        onDragEnd = {
                            if (-offsetX >= thresholdPx) onArchive(alert.id)
                            offsetX = 0f
                            thresholdNotified = false
                        },
                        onDragCancel = {
                            offsetX = 0f
                            thresholdNotified = false
                        },
                    )
                }
                .clickable(onClick = onOpen),
            shape = AppCardShape,
            color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else glassCardColor(),
            border = BorderStroke(
                width = if (selected) 1.5.dp else if (urgent) 1.1.dp else 0.5.dp,
                color = when {
                    selected -> MaterialTheme.colorScheme.primary
                    urgent -> ColorTokens.Red.foreground
                    !alert.read -> MaterialTheme.colorScheme.primary.copy(alpha = 0.35f)
                    else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
                },
            ),
            shadowElevation = 0.dp,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 13.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppIconTile(
                        icon = notificationKindIcon(kind),
                        tint = accent.foreground,
                        background = accent.container,
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = alert.title,
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = if (alert.read) FontWeight.Medium else FontWeight.Bold,
                                    fontSize = 15.sp,
                                    letterSpacing = (-0.2).sp,
                                ),
                                color = if (alert.read) {
                                    MaterialTheme.colorScheme.onSurface.copy(alpha = 0.78f)
                                } else {
                                    MaterialTheme.colorScheme.onSurface
                                },
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                modifier = Modifier.weight(1f),
                            )
                            if (!alert.read) {
                                Spacer(Modifier.width(6.dp))
                                Box(
                                    modifier = Modifier
                                        .size(7.dp)
                                        .background(ColorTokens.Blue.foreground, CircleShape),
                                )
                            }
                        }
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            Text(
                                text = relativeTimeLabel(alert.createdAt),
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                maxLines = 1,
                            )
                            NotificationTag(text = kind.label, accent = accent)
                            if (urgent) NotificationTag(text = "高优先", accent = ColorTokens.Red)
                            if (snoozed) {
                                NotificationTag(
                                    text = snoozeTimeLabel(alert.snoozedUntil ?: 0L),
                                    accent = ColorTokens.Amber,
                                )
                            }
                        }
                    }
                }

                if (alert.body.isNotBlank()) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.5.sp, lineHeight = 19.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = if (alert.read) 0.72f else 0.92f),
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 2.dp),
                    )
                }

                if (alert.contentBlocks.isNotEmpty()) {
                    Row(
                        modifier = Modifier.padding(start = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Info,
                            contentDescription = null,
                            modifier = Modifier.size(13.dp),
                            tint = accent.foreground,
                        )
                        Text(
                            text = "包含 ${alert.contentBlocks.size} 项详细内容 · 点击查看",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Medium,
                                fontSize = 11.5.sp,
                            ),
                            color = accent.foreground,
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (snoozed) {
                        NotificationCardAction(
                            icon = Icons.Outlined.Restore,
                            text = "取消稍后",
                            accent = ColorTokens.Amber,
                            onClick = { onMarkUnread(alert.id) },
                        )
                    } else {
                        NotificationCardAction(
                            icon = if (alert.read) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead,
                            text = if (alert.read) "标为未读" else "已读",
                            accent = ColorTokens.Blue,
                            onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                        )
                        Spacer(Modifier.width(8.dp))
                        NotificationCardAction(
                            icon = Icons.Outlined.AccessTime,
                            text = "稍后",
                            accent = ColorTokens.Teal,
                            onClick = { onSnooze(alert.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
internal fun NotificationTag(text: String, accent: AccentColors, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(6.dp),
        color = accent.container,
        border = BorderStroke(0.5.dp, accent.border),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 10.5.sp),
            color = accent.foreground,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun NotificationCardAction(
    icon: ImageVector,
    text: String,
    accent: AccentColors,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    val shape = RoundedCornerShape(50)
    Surface(
        modifier = modifier
            .clip(shape)
            .clickable {
                AppHaptics.tick(haptics)
                onClick()
            },
        shape = shape,
        color = accent.container,
        border = BorderStroke(0.6.dp, accent.border),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(13.dp), tint = accent.foreground)
            Text(
                text = text,
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                color = accent.foreground,
            )
        }
    }
}

@Composable
internal fun notificationKindColors(kind: NotificationKind): AccentColors = when (kind) {
    NotificationKind.Alert -> ColorTokens.Red
    NotificationKind.Task -> ColorTokens.Amber
    NotificationKind.Schedule -> ColorTokens.Blue
    NotificationKind.Device -> ColorTokens.Green
    NotificationKind.Security -> ColorTokens.Purple
    NotificationKind.System -> ColorTokens.Sky
}

internal fun notificationKindIcon(kind: NotificationKind): ImageVector = when (kind) {
    NotificationKind.Alert -> Icons.Outlined.Warning
    NotificationKind.Task -> Icons.Outlined.Assignment
    NotificationKind.Schedule -> Icons.Outlined.Schedule
    NotificationKind.Device -> Icons.Outlined.Devices
    NotificationKind.Security -> Icons.Outlined.Security
    NotificationKind.System -> Icons.Outlined.Notifications
}

internal fun relativeTimeLabel(createdAt: Long, now: Long = System.currentTimeMillis()): String {
    val diff = now - createdAt
    return when {
        diff < 60_000L -> "刚刚"
        diff < 3_600_000L -> "${diff / 60_000L} 分钟前"
        diff < 86_400_000L -> "${diff / 3_600_000L} 小时前"
        diff < 7 * 86_400_000L -> "${diff / 86_400_000L} 天前"
        else -> formatLocalDateTime(createdAt)
    }
}

private fun snoozeTimeLabel(untilMillis: Long): String {
    val time = Instant.ofEpochMilli(untilMillis).atZone(ZoneId.systemDefault())
    return "稍后 %02d:%02d".format(time.hour, time.minute)
}
