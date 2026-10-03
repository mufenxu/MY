package cn.pxyb.mycontrol.ui.feature.overview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import java.util.Date
import kotlinx.coroutines.delay

@Composable
internal fun HomeScheduleCard(state: OverviewUiState, onOpenWorkspace: (WorkspaceDestination) -> Unit) {
    var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            nowMillis = System.currentTimeMillis()
        }
    }
    val courseAction = remember(state.timetable, nowMillis) {
        buildPersonalAssistantSnapshot(nowMillis = nowMillis, timetable = state.timetable).nextAction.takeIf { it.id.startsWith("course:") }
    }
    val pendingTodos = remember(state.todoSnapshot.tasks) {
        state.todoSnapshot.tasks.filterNot { it.completed }.sortedBy { it.dueAt ?: Long.MAX_VALUE }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OverviewSectionTitle("今天的安排", tag = "${pendingTodos.size} 项待办")
        AppPanel {
            AppActionRow(
                title = courseAction?.title ?: if (state.timetable == null) "查看今日课程" else "今天暂无后续课程",
                subtitle = courseAction?.detail ?: if (state.timetable == null) "打开日程加载课表" else "打开日程，安排接下来的时间",
                icon = Icons.Outlined.CalendarMonth,
                onClick = { onOpenWorkspace(WorkspaceDestination.Today) },
            )
        }
        AppPanel(onClick = { onOpenWorkspace(WorkspaceDestination.Todos) }) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("待办清单", modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("查看全部", style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary)
                }
                if (pendingTodos.isEmpty()) {
                    Text("暂无待办，记录下一件要完成的事", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    pendingTodos.take(2).forEach { todo ->
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                            Icon(Icons.Outlined.RadioButtonUnchecked, contentDescription = null,
                                modifier = Modifier.padding(top = 2.dp).size(18.dp),
                                tint = MaterialTheme.colorScheme.outline)
                            Text(todo.title, style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface, maxLines = 2,
                                overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppPanel(modifier = Modifier.weight(1f)) {
                AppActionRow(title = "本学期课表", icon = Icons.Outlined.CalendarMonth,
                    trailingContent = null, onClick = { onOpenWorkspace(WorkspaceDestination.Timetable) })
            }
            AppPanel(modifier = Modifier.weight(1f)) {
                AppActionRow(title = "校园服务", icon = Icons.Outlined.Apps,
                    trailingContent = null, onClick = { onOpenWorkspace(WorkspaceDestination.Campus) })
            }
        }
    }
}

@Composable
internal fun <T> OverviewTwoColumnGrid(
    items: List<T>,
    itemContent: @Composable (T) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items.chunked(2).forEach { rowItems ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                rowItems.forEach { item ->
                    Box(modifier = Modifier.weight(1f)) {
                        itemContent(item)
                    }
                }
                if (rowItems.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
internal fun OverviewServiceCardShell(
    title: String,
    icon: ImageVector,
    accent: Color,
    accentPale: Color,
    enabled: Boolean,
    opening: Boolean,
    onClick: (() -> Unit)?,
    content: @Composable ColumnScope.() -> Unit,
) {
    val isDark = isAppInDarkTheme()
    val iconBackground = if (isDark) {
        accent.copy(alpha = 0.18f)
    } else {
        accentPale.copy(alpha = 0.78f)
    }

    AppPanel(
        onClick = if (enabled) onClick else null,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 10.dp, vertical = 9.dp)
                .alpha(if (enabled) 1f else 0.58f),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(iconBackground),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(15.dp),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.5.sp,
                        letterSpacing = (-0.2).sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                content()
            }

            if (opening) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    color = MaterialTheme.colorScheme.primary,
                    strokeWidth = 1.8.dp,
                )
            }
        }
    }
}

@Composable
internal fun OfflineSnapshotNotice(cachedAtMillis: Long?) {
    val context = LocalContext.current
    val updatedAt = remember(context, cachedAtMillis) {
        cachedAtMillis?.let { android.text.format.DateFormat.getTimeFormat(context).format(Date(it)) }
    }
    AppFeedbackBanner(
        title = "部分内容使用缓存，请留意更新时间",
        message = updatedAt?.let { "缓存更新时间 $it" } ?: "联网后将自动恢复同步",
        error = false,
        icon = Icons.Outlined.CloudOff,
        modifier = Modifier.fillMaxWidth(),
    )
}
