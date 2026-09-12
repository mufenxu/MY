package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Event
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun CourseCard(
    course: CampusCourse,
    showWeek: Boolean = false,
    selectedWeek: Int? = null,
    tag: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val isThisWeek = selectedWeek == null || course.weeks.isEmpty() || selectedWeek in course.weeks
    val colorScheme = getCourseColorScheme(course.courseName)

    AppPanel(onClick = onClick) {
        Row(
            modifier = Modifier
                .padding(13.dp)
                .fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = if (isThisWeek) colorScheme.container.copy(alpha = 0.55f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                contentColor = if (isThisWeek) colorScheme.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(42.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            "${course.startSection}-${course.endSection}",
                            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                        )
                        Text(
                            "节",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                        )
                    }
                }
            }

            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text(
                        course.courseName,
                        style = MaterialTheme.typography.titleMedium.copy(
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.5.sp,
                        ),
                        color = if (isThisWeek) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (tag != null) {
                        Surface(
                            color = ColorTokens.Purple.foreground.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                tag,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = ColorTokens.Purple.foreground,
                            )
                        }
                    }
                    if (!isThisWeek) {
                        Surface(
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                "非本周",
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (course.timeRange.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Outlined.Schedule, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(course.timeRange, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    if (course.location.isNotBlank()) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Outlined.LocationOn, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(course.location, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                if (course.teacher.isNotBlank() || (showWeek && course.weekText.isNotBlank())) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (course.teacher.isNotBlank()) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(Icons.Outlined.Person, contentDescription = null, modifier = Modifier.size(13.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(course.teacher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        if (showWeek && course.weekText.isNotBlank()) {
                            Text(course.weekText, style = MaterialTheme.typography.bodySmall, color = colorScheme.foreground, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun CourseDetailDialog(
    course: CampusCourse,
    selectedWeek: Int,
    onDismiss: () -> Unit,
) {
    val colorScheme = getCourseColorScheme(course.courseName)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.CalendarMonth,
        iconTint = colorScheme.foreground,
        iconBackground = colorScheme.container,
        title = course.courseName,
        subtitle = "${course.dayName} ${course.sectionText}",
        footer = {
            AppDialogPrimaryButton(
                text = "确定",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            CourseDetailContent(course, selectedWeek)
        }
    }
}

@Composable
internal fun CourseDetailContent(course: CampusCourse, selectedWeek: Int) {
    val isThisWeek = course.weeks.isEmpty() || selectedWeek in course.weeks
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppDetailRow(label = "上课地点", value = course.location.ifBlank { "待定" }, icon = Icons.Outlined.LocationOn)
        AppDetailRow(label = "授课教师", value = course.teacher.ifBlank { "未知" }, icon = Icons.Outlined.Person)
        AppDetailRow(label = "上课时间", value = course.timeRange.ifBlank { "按照节次" }, icon = Icons.Outlined.Schedule)
        AppDetailRow(label = "周次范围", value = course.weekText.ifBlank { "全学期" }, icon = Icons.Outlined.Event)
        AppDetailRow(label = "课程代码", value = course.courseCode.ifBlank { "无" }, icon = Icons.Outlined.Info)
        AppDetailRow(
            label = "当前状态",
            value = if (isThisWeek) "本周 (第 $selectedWeek 周) 有课安排" else "第 $selectedWeek 周无课 (非本周)",
            icon = Icons.Outlined.CheckCircle,
        )
    }
}

internal fun weekdayLabel(day: Int): String = listOf("", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")
    .getOrElse(day) { "未排定日期" }
