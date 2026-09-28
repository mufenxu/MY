package cn.pxyb.mycontrol.ui.feature.agenda

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Event
import androidx.compose.runtime.*
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import java.time.LocalDate

@Composable
internal fun rememberReservationConflictGuard(timetable: CampusTimetable?, agenda: AgendaUiState): (String, Int, Int, String?, () -> Unit) -> Unit {
    var pending by remember { mutableStateOf<(() -> Unit)?>(null) }
    var detail by remember { mutableStateOf("") }
    if (pending != null) AppConfirmDialog("核对预约时间", detail, "已核对，继续预约", { pending = null }, {
        val action = pending
        pending = null
        action?.invoke()
    }, Icons.Outlined.Event)
    return { dateText, start, end, excludeId, action ->
        val date = runCatching { LocalDate.parse(dateText) }.getOrNull()
        val items = date?.let { buildAgenda(it, timetable, emptyList(), agenda.rooms, agenda.seats) }.orEmpty()
        val conflicts = date?.let { agendaConflicts(items, agendaInstant(it, start), agendaInstant(it, end), excludeId) }.orEmpty()
        val incomplete = date == null || agendaCourseWarning(timetable, date) != null || !agenda.loaded || agenda.loading || agenda.errors.isNotEmpty()
        if (conflicts.isEmpty() && !incomplete) action() else {
            detail = buildString {
                if (conflicts.isNotEmpty()) append("该时段与以下日程重叠：\n" + conflicts.joinToString("\n") { "${agendaTime(it.start)}—${agendaTime(it.end)} ${it.title}" })
                if (incomplete) append("\n部分日程未更新，无法保证冲突检查完整。请核对课程及已有预约。")
            }.trim()
            pending = action
        }
    }
}
