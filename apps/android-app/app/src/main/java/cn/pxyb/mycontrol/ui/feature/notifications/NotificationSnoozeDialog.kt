package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.LocalDate
import java.time.ZoneId

private const val SNOOZE_SOON_MS = 30 * 60_000L

private const val SNOOZE_HOUR_MS = 60 * 60_000L

private const val SNOOZE_THREE_HOURS_MS = 3 * 60 * 60_000L

/** 稍后提醒预设：固定 1 小时改为可选档位，最后一档顺延到次日早上 8 点。 */
internal fun snoozeOptions(now: Long = System.currentTimeMillis()): List<Pair<String, Long>> {
    val tomorrowMorning = LocalDate.now()
        .plusDays(1)
        .atTime(8, 0)
        .atZone(ZoneId.systemDefault())
        .toInstant()
        .toEpochMilli()
    return listOf(
        "30 分钟后" to SNOOZE_SOON_MS,
        "1 小时后" to SNOOZE_HOUR_MS,
        "3 小时后" to SNOOZE_THREE_HOURS_MS,
        "明天 08:00" to (tomorrowMorning - now),
    )
}

@Composable
internal fun SnoozeDialog(onDismiss: () -> Unit, onPick: (Long) -> Unit) {
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AccessTime,
        iconTint = ColorTokens.Teal.foreground,
        iconBackground = ColorTokens.Teal.container,
        title = "稍后提醒",
        subtitle = "到点后会重新回到未读列表并再次提醒",
        footer = {
            AppDialogSecondaryButton("取消", onDismiss, Modifier.fillMaxWidth())
        },
    ) {
        snoozeOptions().forEach { (label, duration) ->
            AppActionRow(
                title = label,
                icon = Icons.Outlined.AccessTime,
                iconTint = ColorTokens.Teal.foreground,
                onClick = { onPick(duration) },
                trailingContent = null,
            )
        }
    }
}
