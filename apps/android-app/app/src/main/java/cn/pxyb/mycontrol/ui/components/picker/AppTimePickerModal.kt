package cn.pxyb.mycontrol.ui.components.picker

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
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
import cn.pxyb.mycontrol.util.DateTimeUtils.parseTimeMinutes
import java.util.Locale

/**
 * 现代时分双轮滚轮选择弹窗
 */
@Composable
fun AppTimePickerModal(
    title: String = "选择时间",
    currentTime: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    minTime: String = "00:00",
    maxTime: String = "23:59",
    minuteStep: Int = 1,
) {
    val minMin = (parseTimeMinutes(minTime) ?: 0).coerceIn(0, 1439)
    val maxMin = (parseTimeMinutes(maxTime) ?: 1439).coerceIn(minMin, 1439)
    val clampedCurrentMin = (parseTimeMinutes(currentTime) ?: minMin).coerceIn(minMin, maxMin)

    val currentH = clampedCurrentMin / 60
    val currentM = clampedCurrentMin % 60

    val minH = minMin / 60
    val maxH = maxMin / 60

    val hours = remember(minH, maxH) {
        (minH..maxH).map { String.format(Locale.ROOT, "%02d", it) }
    }

    val initHourIndex = remember(hours, currentH) {
        val found = hours.indexOfFirst { it.toIntOrNull() == currentH }
        if (found >= 0) found else 0
    }
    var selectedHourIndex by remember { mutableIntStateOf(initHourIndex) }

    val safeHourIndex = selectedHourIndex.coerceIn(0, (hours.size - 1).coerceAtLeast(0))
    val selectedHour = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }.toIntOrNull() ?: minH

    val minutesForHour = remember(selectedHour, minMin, maxMin, minuteStep) {
        val list = mutableListOf<String>()
        val startM = if (selectedHour == minH) minMin % 60 else 0
        val endM = if (selectedHour == maxH) maxMin % 60 else 59
        val step = minuteStep.coerceAtLeast(1)
        for (m in 0..59 step step) {
            if (m in startM..endM) {
                list.add(String.format(Locale.ROOT, "%02d", m))
            }
        }
        if (list.isEmpty()) {
            list.add(String.format(Locale.ROOT, "%02d", startM.coerceIn(0, 59)))
        }
        list
    }

    val initMinuteIndex = remember(minutesForHour, currentM) {
        val found = minutesForHour.indexOfFirst { (it.toIntOrNull() ?: 0) >= currentM }
        if (found >= 0) found else (minutesForHour.size - 1).coerceAtLeast(0)
    }
    var selectedMinuteIndex by remember(minutesForHour) { mutableIntStateOf(initMinuteIndex) }

    val safeMinuteIndex = selectedMinuteIndex.coerceIn(0, (minutesForHour.size - 1).coerceAtLeast(0))
    val chosenHourStr = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }
    val chosenMinuteStr = minutesForHour.getOrElse(safeMinuteIndex) { minutesForHour.firstOrNull() ?: "00" }
    val formattedTime = "$chosenHourStr:$chosenMinuteStr"

    val rangeHint = if (minTime != "00:00" || maxTime != "23:59") "（开放范围 $minTime - $maxTime）" else ""

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AccessTime,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = "当前选择：$formattedTime$rangeHint",
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
                        onConfirm(formattedTime)
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
                items = hours,
                selectedIndex = safeHourIndex,
                onSelectedIndexChanged = { selectedHourIndex = it },
                unitText = "时",
                modifier = Modifier.weight(1f),
            )
            AppWheelPicker(
                items = minutesForHour,
                selectedIndex = safeMinuteIndex,
                onSelectedIndexChanged = { selectedMinuteIndex = it },
                unitText = "分",
                modifier = Modifier.weight(1f),
            )
        }
    }
}
