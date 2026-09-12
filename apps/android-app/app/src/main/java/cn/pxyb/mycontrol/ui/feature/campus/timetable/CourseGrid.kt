package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import java.time.DayOfWeek
import java.time.LocalDate

private fun getSectionTopOffset(sec: Int, sectionHeight: androidx.compose.ui.unit.Dp, gridGap: androidx.compose.ui.unit.Dp, mealGap: androidx.compose.ui.unit.Dp): androidx.compose.ui.unit.Dp {
    val baseGapCount = (sec - 1).coerceAtLeast(0)
    val mealCount = when {
        sec >= 11 -> 2
        sec >= 6 -> 1
        else -> 0
    }
    return sectionHeight * baseGapCount + gridGap * baseGapCount + mealGap * mealCount
}

@Composable
internal fun CourseGridMatrix(
    courses: List<CampusCourse>,
    selectedWeek: Int,
    currentWeek: Int = 1,
    termStartDate: String? = null,
    onCourseClick: (CampusCourse) -> Unit,
    selectedCourseId: String? = null,
) {
    val days = listOf("一", "二", "三", "四", "五", "六", "日")
    val weekDates = remember(selectedWeek, currentWeek, termStartDate) {
        resolveWeekDays(selectedWeek, currentWeek, termStartDate)
    }
    val currentMonthText = remember(weekDates) {
        "${weekDates.firstOrNull()?.monthValue ?: LocalDate.now().monthValue}月"
    }
    val totalSections = remember(courses) {
        maxOf(12, courses.maxOfOrNull { it.endSection } ?: 12)
    }
    val wideGrid = appContentWidth() >= 600.dp
    val fontScale = androidx.compose.ui.platform.LocalDensity.current.fontScale
    val sectionHeight = (if (wideGrid) 64.dp else 44.dp) * fontScale.coerceAtLeast(1f)
    val gridGap = 2.5.dp
    val mealGap = 12.dp
    val totalGridHeight = getSectionTopOffset(totalSections, sectionHeight, gridGap, mealGap) + sectionHeight
    val todayDate = LocalDate.now()
    val todayDayOfWeek = remember { DayOfWeek.from(todayDate).value }

    AppPanel(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // 顶部星期与日期栏
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .width(30.dp)
                        .heightIn(min = if (wideGrid) 48.dp else 38.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(1.dp),
                    ) {
                        Text(
                            currentMonthText,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.sp, fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            "节次",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.5.sp, fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        )
                    }
                }
                days.forEachIndexed { index, day ->
                    val date = weekDates.getOrNull(index)
                    val isToday = date == todayDate
                    val dateText = date?.let { "${it.monthValue}.${it.dayOfMonth}" } ?: ""
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .heightIn(min = if (wideGrid) 48.dp else 38.dp)
                            .padding(horizontal = 1.5.dp)
                            .background(
                                if (isToday) MaterialTheme.colorScheme.primaryContainer
                                else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                                shape = RoundedCornerShape(6.dp),
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(1.dp),
                        ) {
                            if (dateText.isNotBlank()) {
                                Text(
                                    dateText,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 11.sp else 9.sp),
                                    fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Text(
                                "周$day",
                                style = MaterialTheme.typography.labelMedium.copy(fontSize = if (wideGrid) 13.sp else 11.sp),
                                fontWeight = if (isToday) FontWeight.Bold else FontWeight.Medium,
                                color = if (isToday) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }

            // 课表主网格（左侧节次列 + 7 天课程网格列）
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(totalGridHeight),
            ) {
                // 左侧节次序号栏
                Column(
                    modifier = Modifier
                        .width(28.dp)
                        .fillMaxHeight(),
                ) {
                    for (sec in 1..totalSections) {
                        if (sec > 1) {
                            val gap = if (sec == 6 || sec == 11) mealGap + gridGap else gridGap
                            Spacer(Modifier.height(gap))
                        }
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(sectionHeight),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = "$sec",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold),
                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                            )
                        }
                    }
                }

                // 7 天课程网格
                for (dayIndex in 1..7) {
                    val isToday = dayIndex == todayDayOfWeek
                    val dayCourses = remember(courses, dayIndex, selectedWeek) {
                        courses
                            .filter { it.day == dayIndex && it.startSection in 1..totalSections }
                            .groupBy { "${it.startSection}-${it.endSection}" }
                            .values
                            .map { list ->
                                list.firstOrNull { it.weeks.isEmpty() || selectedWeek in it.weeks } ?: list.first()
                            }
                    }

                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .padding(horizontal = 1.5.dp),
                    ) {
                        // 背景网格方格线
                        Column(
                            modifier = Modifier.fillMaxSize(),
                        ) {
                            for (sec in 1..totalSections) {
                                if (sec > 1) {
                                    val gap = if (sec == 6 || sec == 11) mealGap + gridGap else gridGap
                                    Spacer(Modifier.height(gap))
                                }
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(sectionHeight)
                                        .background(
                                            if (isToday) MaterialTheme.colorScheme.primary.copy(alpha = 0.04f)
                                            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.18f),
                                            shape = RoundedCornerShape(4.dp),
                                        )
                                        .border(
                                            0.5.dp,
                                            if (isToday) MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                                            else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.25f),
                                            shape = RoundedCornerShape(4.dp),
                                        ),
                                )
                            }
                        }

                        // 真实跨节课程卡片（精确 Y 轴位置与精确节次跨度）
                        dayCourses.forEach { course ->
                            val s = course.startSection.coerceIn(1, totalSections)
                            val e = course.endSection.coerceIn(s, totalSections)
                            val span = e - s + 1
                            val topOffset = getSectionTopOffset(s, sectionHeight, gridGap, mealGap)
                            val bottomOffset = getSectionTopOffset(e, sectionHeight, gridGap, mealGap) + sectionHeight
                            val cardHeight = bottomOffset - topOffset
                            val isThisWeek = course.weeks.isEmpty() || selectedWeek in course.weeks
                            val colorScheme = getCourseColorScheme(course.courseName)

                            Surface(
                                modifier = Modifier
                                    .offset(y = topOffset)
                                    .height(cardHeight)
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(6.dp))
                                    .semantics { selected = course.id == selectedCourseId }
                                    .clickable { onCourseClick(course) },
                                color = if (isThisWeek) colorScheme.container.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                                shape = RoundedCornerShape(6.dp),
                                border = BorderStroke(
                                    if (course.id == selectedCourseId) 1.5.dp else 0.5.dp,
                                    if (course.id == selectedCourseId) MaterialTheme.colorScheme.onSurface
                                    else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f),
                                ),
                                shadowElevation = 0.dp,
                            ) {
                                Column(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .padding(horizontal = 3.dp, vertical = 3.5.dp),
                                    verticalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        Text(
                                            text = course.courseName,
                                            style = MaterialTheme.typography.labelSmall.copy(
                                                fontSize = if (wideGrid) 13.sp else 9.5.sp,
                                                lineHeight = if (wideGrid) 16.sp else 11.5.sp,
                                                fontWeight = FontWeight.Bold,
                                            ),
                                            color = if (isThisWeek) colorScheme.foreground else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                                            maxLines = if (span >= 3) 4 else if (span == 2) 3 else 2,
                                            overflow = TextOverflow.Ellipsis,
                                        )
                                    }

                                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                                        if (isThisWeek && course.location.isNotBlank()) {
                                            Text(
                                                text = course.location,
                                                style = MaterialTheme.typography.labelSmall.copy(
                                                    fontSize = if (wideGrid) 11.sp else 8.sp,
                                                    lineHeight = if (wideGrid) 14.sp else 9.5.sp,
                                                ),
                                                color = colorScheme.foreground.copy(alpha = 0.85f),
                                                maxLines = if (span >= 3) 2 else 1,
                                                overflow = TextOverflow.Ellipsis,
                                            )
                                        } else if (!isThisWeek) {
                                            Text(
                                                text = "(非本周)",
                                                style = MaterialTheme.typography.labelSmall.copy(fontSize = if (wideGrid) 10.sp else 7.5.sp),
                                                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
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
        }
    }
}
