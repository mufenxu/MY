package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalDensity
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout

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
    modifier: Modifier = Modifier,
    bounded: Boolean = false,
) {
    val orderedCourses = remember(courses) {
        courses.sortedWith(compareBy(CampusCourse::day).thenBy(CampusCourse::startSection).thenBy(CampusCourse::courseName))
    }
    val currentWeekNum = remember(currentCalendarText, schoolCalendar) {
        schoolCalendar?.currentWeek
            ?: Regex("第(\\d+)周").find(currentCalendarText.orEmpty())?.groupValues?.getOrNull(1)?.toIntOrNull()
            ?: 1
    }
    var selectedWeek by rememberSaveable(currentWeekNum) { mutableStateOf(currentWeekNum) }
    var displayMode by rememberSaveable { mutableStateOf(TimetableDisplayMode.Grid) }
    var selectedCourseId by rememberSaveable { mutableStateOf<String?>(null) }
    val selectedCourse = orderedCourses.firstOrNull { it.id == selectedCourseId }
    val showDetails = bounded && useTwoPaneLayout(1100.dp)
    val timetableScroll = rememberScrollState()
    val detailScroll = rememberScrollState()
    var previousCourseId by rememberSaveable { mutableStateOf(selectedCourseId) }
    LaunchedEffect(selectedCourseId) {
        if (previousCourseId != selectedCourseId) {
            detailScroll.scrollTo(0)
            previousCourseId = selectedCourseId
        }
    }

    val currentWeekCourses = remember(orderedCourses, selectedWeek) {
        orderedCourses.filter { it.weeks.isEmpty() || selectedWeek in it.weeks }
    }
    val totalCourseCount = orderedCourses.map(CampusCourse::courseName).distinct().size
    val compactHeader = appContentWidth() < 520.dp * LocalDensity.current.fontScale.coerceAtLeast(1f)
    val displayModes: @Composable (Modifier) -> Unit = { modeModifier ->
        AppSegmentedControl(
            options = TimetableDisplayMode.entries,
            selected = displayMode,
            onSelect = { displayMode = it },
            label = { if (it == TimetableDisplayMode.Grid) "周视图" else "列表" },
            modifier = modeModifier,
        )
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppPanel {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "第 $selectedWeek 周课表" + if (schoolCalendar?.currentWeek == selectedWeek) " · 本周" else "",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold,
                        )
                        Text(
                            "全学期 $totalCourseCount 门课程 · 本周 ${currentWeekCourses.size} 节安排",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!compactHeader) displayModes(Modifier.width(184.dp))
                }
                if (compactHeader) displayModes(Modifier.fillMaxWidth())
                Row(
                    modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    (1..(schoolCalendar?.teachingWeeks ?: 20)).forEach { week ->
                        AppFilterChip(
                            label = "第 $week 周" + if (schoolCalendar?.currentWeek == week) "（本周）" else "",
                            selected = selectedWeek == week,
                            onClick = { selectedWeek = week },
                        )
                    }
                }
            }
        }

        Row(
            modifier = if (bounded) Modifier.weight(1f).fillMaxWidth() else Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ProvideAppContentLayout(
                modifier = Modifier.weight(1f).then(if (bounded) Modifier.fillMaxHeight() else Modifier),
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth()
                        .then(if (bounded) Modifier.verticalScroll(timetableScroll) else Modifier),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    schoolCalendar?.let { AcademicCalendarSummary(it) }
                    if (orderedCourses.isEmpty()) {
                        AppEmptyState("课表暂未同步", detail = "连接学校账号并刷新后，可以查看本学期课程。")
                    } else if (displayMode == TimetableDisplayMode.Grid) {
                        CourseGridMatrix(
                            courses = orderedCourses,
                            selectedWeek = selectedWeek,
                            currentWeek = currentWeekNum,
                            termStartDate = schoolCalendar?.termStartDate,
                            onCourseClick = { selectedCourseId = it.id },
                            selectedCourseId = selectedCourseId,
                        )
                    } else {
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
                                    onClick = { selectedCourseId = course.id },
                                )
                            }
                        }
                    }
                }
            }
            if (showDetails) {
                Column(
                    modifier = Modifier.width(320.dp).fillMaxHeight().verticalScroll(detailScroll),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppPanel {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            val course = selectedCourse
                            if (course == null) {
                                AppEmptyState("课程详情", detail = "点击左侧课程，查看地点、教师与上课时间。")
                            } else {
                                Text(course.courseName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                Text("${course.dayName} ${course.sectionText}", style = MaterialTheme.typography.bodyMedium)
                                CourseDetailContent(course, selectedWeek)
                                AppSecondaryButton(
                                    text = "清除选择",
                                    onClick = { selectedCourseId = null },
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (!showDetails) selectedCourse?.let { course ->
        CourseDetailDialog(course, selectedWeek, onDismiss = { selectedCourseId = null })
    }
}
