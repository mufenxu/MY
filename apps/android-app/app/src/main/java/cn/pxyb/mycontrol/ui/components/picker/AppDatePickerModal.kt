package cn.pxyb.mycontrol.ui.components.picker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * 现代年月日/自然日滚轮选择弹窗
 */
@Composable
fun AppDatePickerModal(
    title: String = "选择日期",
    currentDate: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    today: LocalDate = LocalDate.now(),
    daysCount: Int = 30,
    pastDaysCount: Int = 2,
) {
    val dates = remember(today, daysCount, pastDaysCount) {
        (-pastDaysCount until daysCount).map { today.plusDays(it.toLong()) }
    }
    val currentLocalDate = remember(currentDate) {
        try {
            LocalDate.parse(currentDate.trim(), DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (_: Exception) {
            today
        }
    }
    val initIndex = remember(dates, currentLocalDate) {
        val found = dates.indexOfFirst { it == currentLocalDate }
        if (found >= 0) found else dates.indexOfFirst { it == today }.coerceAtLeast(0)
    }

    var selectedIndex by remember { mutableIntStateOf(initIndex) }
    val chosenDate = dates.getOrElse(selectedIndex) { today }
    val chosenDateStr = chosenDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
    val chosenWk = weekdayLabel(chosenDate)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.CalendarMonth,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = "当前选择：$chosenDateStr ($chosenWk)",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "确定",
                    onClick = {
                        onConfirm(chosenDateStr)
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            AppWheelPicker(
                items = dates,
                selectedIndex = selectedIndex,
                onSelectedIndexChanged = { selectedIndex = it },
                formatItem = { d ->
                    val prefix = when (d) {
                        today -> "今天 "
                        today.plusDays(1) -> "明天 "
                        today.plusDays(2) -> "后天 "
                        today.minusDays(1) -> "昨天 "
                        else -> ""
                    }
                    "$prefix${d.monthValue}月${d.dayOfMonth}日 ${weekdayLabel(d)}"
                },
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private fun weekdayLabel(date: LocalDate): String = when (date.dayOfWeek.value) {
    1 -> "周一"
    2 -> "周二"
    3 -> "周三"
    4 -> "周四"
    5 -> "周五"
    6 -> "周六"
    else -> "周日"
}
