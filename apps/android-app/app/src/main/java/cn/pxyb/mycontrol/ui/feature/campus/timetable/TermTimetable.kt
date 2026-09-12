package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ViewList
import androidx.compose.material.icons.outlined.GridView
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
import cn.pxyb.mycontrol.data.CampusAcademicCalendar
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import java.time.LocalDate

private enum class TimetableDisplayMode { Grid, List }

internal fun resolveWeekDays(
    selectedWeek: Int,
    currentWeek: Int,
    termStartDate: String?,
): List<LocalDate> {
    val termStart = runCatching {
        if (!termStartDate.isNullOrBlank()) LocalDate.parse(termStartDate) else null
    }.getOrNull()

    val monday = if (termStart != null) {
        val offsetToMonday = termStart.dayOfWeek.value - 1
        val startMonday = termStart.minusDays(offsetToMonday.toLong())
        startMonday.plusWeeks((selectedWeek - 1).coerceAtLeast(0).toLong())
    } else {
        val now = LocalDate.now()
        val currentMonday = now.minusDays((now.dayOfWeek.value - 1).toLong())
        currentMonday.plusWeeks((selectedWeek - currentWeek).toLong())
    }

    return (0..6).map { dayIndex -> monday.plusDays(dayIndex.toLong()) }
}

@Composable
internal fun TermTimetable(
    courses: List<CampusCourse>,
    currentCalendarText: String? = null,
    schoolCalendar: CampusAcademicCalendar? = null,
) {
    val orderedCourses = remember(courses) {
        courses.sortedWith(compareBy(CampusCourse::day).thenBy(CampusCourse::startSection).thenBy(CampusCourse::courseName))
    }

    if (orderedCourses.isEmpty()) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            schoolCalendar?.let { AcademicCalendarSummary(it) }
            AppEmptyState("课表暂未同步", detail = "连接学校账号后，下拉刷新即可查看本学期全部课程。")
        }
        return
    }

    val currentWeekNum = remember(currentCalendarText, schoolCalendar) {
        schoolCalendar?.currentWeek
            ?: Regex("第(\\d+)周").find(currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
            ?: 1
    }
    val officialCurrentWeek = schoolCalendar?.currentWeek
    var selectedWeek by remember(currentWeekNum) { mutableStateOf(currentWeekNum) }
    var displayMode by remember { mutableStateOf(TimetableDisplayMode.Grid) }
    var selectedCourseDetail by remember { mutableStateOf<CampusCourse?>(null) }

    val totalCourseCount = orderedCourses.map(CampusCourse::courseName).distinct().size
    val currentWeekCourses = remember(orderedCourses, selectedWeek) {
        orderedCourses.filter { course ->
            course.weeks.isEmpty() || selectedWeek in course.weeks
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // 1. 学校校历卡片
        schoolCalendar?.let { AcademicCalendarSummary(it) }

        // 2. 周次选择器与模式切换卡片
        AppPanel {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(
                                "第 $selectedWeek 周课表",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            if (officialCurrentWeek != null && selectedWeek == officialCurrentWeek) {
                                Surface(
                                    color = MaterialTheme.colorScheme.primaryContainer,
                                    contentColor = MaterialTheme.colorScheme.primary,
                                    shape = RoundedCornerShape(8.dp),
                                ) {
                                    Text(
                                        "本周",
                                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = FontWeight.Bold,
                                    )
                                }
                            }
                        }
                        Text(
                            "全学期 $totalCourseCount 门课程 · ${if (schoolCalendar?.isHoliday == true) "假期" else "本周 ${currentWeekCourses.size} 节安排"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    Surface(
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Row(modifier = Modifier.padding(3.dp)) {
                            val gridShape = RoundedCornerShape(11.dp)
                            Surface(
                                modifier = Modifier
                                    .clip(gridShape)
                                    .clickable { displayMode = TimetableDisplayMode.Grid },
                                color = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.primary else Color.Transparent,
                                contentColor = if (displayMode == TimetableDisplayMode.Grid) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                shape = gridShape,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Icon(Icons.Outlined.GridView, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Text("矩阵", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                                }
                            }
                            val listShape = RoundedCornerShape(11.dp)
                            Surface(
                                modifier = Modifier
                                    .clip(listShape)
                                    .clickable { displayMode = TimetableDisplayMode.List },
                                color = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.primary else Color.Transparent,
                                contentColor = if (displayMode == TimetableDisplayMode.List) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
                                shape = listShape,
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    Icon(Icons.AutoMirrored.Outlined.ViewList, contentDescription = null, modifier = Modifier.size(15.dp))
                                    Text("列表", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    val maxTeachingWeeks = schoolCalendar?.teachingWeeks ?: 20
                    (1..maxTeachingWeeks).forEach { week ->
                        val isCurrent = officialCurrentWeek == week
                        val isSelected = week == selectedWeek
                        AppFilterChip(
                            label = if (isCurrent) "第 $week 周 (本周)" else "第 $week 周",
                            selected = isSelected,
                            onClick = { selectedWeek = week },
                        )
                    }
                }
            }
        }

        // 3. 课表主网格 / 列表卡片
        if (displayMode == TimetableDisplayMode.Grid) {
            CourseGridMatrix(
                courses = orderedCourses,
                selectedWeek = selectedWeek,
                currentWeek = currentWeekNum,
                termStartDate = schoolCalendar?.termStartDate,
                onCourseClick = { selectedCourseDetail = it },
            )
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                orderedCourses.groupBy(CampusCourse::day).forEach { (day, sessions) ->
                    AppSectionHeader(
                        title = sessions.firstOrNull()?.dayName?.takeIf(String::isNotBlank) ?: weekdayLabel(day),
                        subtitle = "${sessions.size} 节安排",
                    )
                    sessions.forEach { course ->
                        CourseCard(
                            course = course,
                            showWeek = true,
                            selectedWeek = selectedWeek,
                            onClick = { selectedCourseDetail = course },
                        )
                    }
                }
            }
        }
    }

    selectedCourseDetail?.let { course ->
        CourseDetailDialog(
            course = course,
            selectedWeek = selectedWeek,
            onDismiss = { selectedCourseDetail = null },
        )
    }
}
