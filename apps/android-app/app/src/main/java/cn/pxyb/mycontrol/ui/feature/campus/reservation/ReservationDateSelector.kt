package cn.pxyb.mycontrol.ui.feature.campus.reservation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import java.time.LocalDate

private val ReservationQuickDateLabels = listOf("今天", "明天", "后天", "大后天")

/**
 * 今天起四天的快捷日期选择，单次预约、自动任务与改期共用。
 *
 * 所选日期不在这四天内时不高亮任何一项，完整日期由相邻的 `AppPickerField` 展示。
 */
@Composable
internal fun ReservationQuickDateSelector(
    today: LocalDate,
    selectedDate: LocalDate?,
    onSelect: (LocalDate) -> Unit,
    modifier: Modifier = Modifier,
) {
    val dates = remember(today) { ReservationQuickDateLabels.indices.map { today.plusDays(it.toLong()) } }
    AppSegmentedControl(
        options = dates,
        selected = selectedDate,
        onSelect = { date -> date?.let(onSelect) },
        label = { date ->
            val name = ReservationQuickDateLabels.getOrNull(dates.indexOf(date)).orEmpty()
            if (date == null) name else "$name\n${weekdayName(date)}"
        },
        modifier = modifier,
    )
}
