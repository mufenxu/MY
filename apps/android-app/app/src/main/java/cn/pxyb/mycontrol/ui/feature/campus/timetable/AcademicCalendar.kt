package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.CampusAcademicCalendar
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
internal fun AcademicCalendarSummary(calendar: CampusAcademicCalendar) {
    AppPanel {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text(
                            "学校校历",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp,
                            ),
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Text(
                            calendar.termLabel.ifBlank { "本学期" },
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                            ),
                        )
                    }
                    val dateRange = listOfNotNull(
                        calendar.termStartDate.takeIf(String::isNotBlank)?.let { "开学 $it" },
                        calendar.termEndDate.takeIf(String::isNotBlank)?.let { "结束 $it" },
                    ).joinToString(" · ")
                    if (dateRange.isNotBlank()) {
                        Text(
                            dateRange,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = if (calendar.isHoliday) MaterialTheme.colorScheme.tertiary.copy(alpha = 0.12f)
                           else MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                ) {
                    Text(
                        calendar.statusText.ifBlank { if (calendar.isHoliday) "假期中" else "在校周" },
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp,
                            color = if (calendar.isHoliday) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,
                        ),
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }

            // 同一行 3 列紧凑 Bento 指标
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CalendarFactBlock(
                    label = "当前周次",
                    value = calendar.currentWeek?.let { "第 $it 周" } ?: "假期",
                    accent = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                CalendarFactBlock(
                    label = "总教学周",
                    value = calendar.teachingWeeks?.let { "共 $it 周" } ?: "--",
                    accent = ColorTokens.Green.foreground,
                    modifier = Modifier.weight(1f),
                )
                CalendarFactBlock(
                    label = "当前状态",
                    value = calendar.statusText.ifBlank { if (calendar.isHoliday) "假期" else "正常教学" },
                    accent = ColorTokens.Purple.foreground,
                    modifier = Modifier.weight(1f),
                )
            }

            if (calendar.events.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.40f))
                Text(
                    "校历安排",
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.5.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                calendar.events.take(4).forEach { event ->
                    Text(
                        listOf(event.label, event.startDate.takeIf(String::isNotBlank), event.endDate.takeIf { it.isNotBlank() && it != event.startDate })
                            .filterNotNull()
                            .joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
        }
    }
}

@Composable
private fun CalendarFactBlock(
    label: String,
    value: String,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    val isDark = isAppInDarkTheme()
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(10.dp),
        color = if (isDark) accent.copy(alpha = 0.15f) else accent.copy(alpha = 0.08f),
        border = BorderStroke(0.5.dp, accent.copy(alpha = if (isDark) 0.25f else 0.15f)),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 7.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
            Text(
                value,
                style = MaterialTheme.typography.labelLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.5.sp,
                    color = accent,
                ),
                maxLines = 1,
            )
        }
    }
}
