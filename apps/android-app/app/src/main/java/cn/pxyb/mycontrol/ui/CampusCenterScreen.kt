package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.School
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppActionRow

@Composable
fun CampusCenterScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onOpenToday: () -> Unit,
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenSeatReservation: () -> Unit,
) {
    AppSubPage(
        title = "校园中心",
        subtitle = "课程、自习与预约入口统一归组",
        onBack = onBack,
        contentPadding = contentPadding,
    ) {
        item(key = "campus-actions", contentType = "campus-actions") {
            AppPanel {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    SectionHeader(
                        title = "校园服务",
                        subtitle = "同类入口集中放置",
                        dotColor = Color(0xFF2563EB),
                    )
                    AppActionRow(
                        title = "今日工作台",
                        subtitle = "课程、待办与校园概览",
                        icon = Icons.Outlined.CalendarMonth,
                        iconTint = Color(0xFF2563EB),
                        onClick = onOpenToday,
                    )
                    AppActionRow(
                        title = "空闲教室查询",
                        subtitle = "按楼宇和节次查找可用自习空间",
                        icon = Icons.Outlined.School,
                        iconTint = Color(0xFF0284C7),
                        onClick = onOpenFreeClassrooms,
                    )
                    AppActionRow(
                        title = "研讨间预约",
                        subtitle = "图书馆空间预约与自动任务",
                        icon = Icons.Outlined.MeetingRoom,
                        iconTint = Color(0xFF7C3AED),
                        onClick = onOpenReservation,
                    )
                    AppActionRow(
                        title = "座位预约",
                        subtitle = "图书馆座位预约与候补任务",
                        icon = Icons.Outlined.Chair,
                        iconTint = Color(0xFF059669),
                        onClick = onOpenSeatReservation,
                    )
                }
            }
        }
    }
}
