package cn.pxyb.mycontrol.ui.feature.overview

import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apps
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import java.util.Date
import kotlinx.coroutines.delay
import cn.pxyb.mycontrol.ui.components.feedback.AppCircularProgressIndicator

@Composable
internal fun HomeScheduleCard(state: OverviewUiState, onOpenWorkspace: (WorkspaceDestination) -> Unit) {
    var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            nowMillis = System.currentTimeMillis()
        }
    }
    val snapshot = remember(state.timetable, nowMillis) {
        buildPersonalAssistantSnapshot(nowMillis = nowMillis, timetable = state.timetable)
    }
    val course = state.timetable?.courses?.firstOrNull { "course:${it.id}" == snapshot.nextAction.id }
    val pendingTodos = remember(state.todoSnapshot.tasks) {
        state.todoSnapshot.tasks.filterNot { it.completed }.sortedBy { it.dueAt ?: Long.MAX_VALUE }
    }
    val colors = MaterialTheme.colorScheme
    val accent = if (isAppInDarkTheme()) colors.primary else cn.pxyb.mycontrol.ui.theme.HomeFocusBlue
    val onAccent = if (isAppInDarkTheme()) colors.onPrimary else colors.surface
    val cardShape = RoundedCornerShape(24.dp)
    // 顶部高光收到下半部压暗，配合彩色投影做出"浮起一寸"的立体感。
    val gloss = if (isAppInDarkTheme()) arrayOf(
        0.00f to Color.White.copy(alpha = 0.14f),
        0.20f to Color.White.copy(alpha = 0.03f),
        0.62f to Color.Transparent,
        1.00f to Color.Black.copy(alpha = 0.20f),
    ) else arrayOf(
        0.00f to Color.White.copy(alpha = 0.34f),
        0.20f to Color.White.copy(alpha = 0.10f),
        0.62f to Color.Transparent,
        1.00f to Color.Black.copy(alpha = 0.14f),
    )
    val topHighlight = Brush.verticalGradient(
        listOf(Color.White.copy(alpha = if (isAppInDarkTheme()) 0.16f else 0.42f), Color.Transparent),
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppPanel {
            Row(Modifier.fillMaxWidth().padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                listOf("今日概览", "本周课表", "校园服务").forEachIndexed { index, label ->
                    Box(
                        Modifier.weight(1f).clip(RoundedCornerShape(24.dp))
                            .background(if (index == 0) accent.copy(alpha = 0.10f) else Color.Transparent)
                            .clickable(role = Role.Button) {
                                if (index != 0) onOpenWorkspace(if (index == 1) WorkspaceDestination.Timetable else WorkspaceDestination.Campus)
                            }.heightIn(min = 48.dp).padding(horizontal = 8.dp, vertical = 12.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(label, style = MaterialTheme.typography.labelMedium,
                            color = if (index == 0) accent else colors.onSurfaceVariant,
                            fontWeight = if (index == 0) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
            }
        }
        Surface(
            onClick = { onOpenWorkspace(WorkspaceDestination.Today) },
            shape = cardShape, color = Color.Transparent, contentColor = onAccent,
            modifier = Modifier.fillMaxWidth().shadow(
                elevation = 22.dp, shape = cardShape,
                ambientColor = accent.copy(alpha = if (isAppInDarkTheme()) 0.35f else 0.55f),
                spotColor = accent.copy(alpha = if (isAppInDarkTheme()) 0.26f else 0.42f),
            ),
        ) {
            Column(
                Modifier.background(accent).background(Brush.verticalGradient(colorStops = gloss))
                    .border(1.dp, topHighlight, cardShape).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    if (course == null) "今日课程" else if (snapshot.classFocusUntilMillis != null) "正在上课" else "下一节课",
                    modifier = Modifier.clip(RoundedCornerShape(20.dp)).background(onAccent.copy(alpha = 0.14f))
                        .padding(horizontal = 12.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelSmall,
                )
                Text(course?.courseName ?: if (state.timetable == null) "查看今日课程" else "今天暂无后续课程",
                    style = MaterialTheme.typography.headlineMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(course?.let { listOf(it.location, it.teacher).filter(String::isNotBlank).joinToString(" · ") }
                        ?.ifBlank { "打开日程查看课程详情" }
                        ?: if (state.timetable == null) "打开日程加载课表" else "把时间留给想做的事",
                    color = onAccent.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(course?.timeRange?.ifBlank { "查看日程" } ?: "查看日程",
                        modifier = Modifier.weight(1f), style = if (course != null) MaterialTheme.typography.headlineLarge else MaterialTheme.typography.titleLarge)
                    Box(Modifier.size(44.dp).clip(CircleShape).background(onAccent), contentAlignment = Alignment.Center) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowForward, null, tint = accent, modifier = Modifier.size(22.dp))
                    }
                }
            }
        }
        OverviewSectionTitle("待办", icon = Icons.Outlined.Checklist, trailing = {
            HomeTextAction("查看全部", onClick = { onOpenWorkspace(WorkspaceDestination.Todos) })
        })
        AppPanel(onClick = { onOpenWorkspace(WorkspaceDestination.Todos) }) {
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) {
                if (pendingTodos.isEmpty()) {
                    Text("暂无待办，记录下一件要完成的事", Modifier.padding(vertical = 16.dp),
                        style = MaterialTheme.typography.bodyMedium, color = colors.onSurfaceVariant)
                } else pendingTodos.take(2).forEachIndexed { index, todo ->
                    if (index > 0) AppDivider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Icon(Icons.Outlined.RadioButtonUnchecked, null, tint = colors.outline, modifier = Modifier.size(20.dp))
                        Text(todo.title, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium,
                            maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val dueToday = todo.dueAt?.let {
                            java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneId.systemDefault()).toLocalDate() ==
                                java.time.Instant.ofEpochMilli(nowMillis).atZone(java.time.ZoneId.systemDefault()).toLocalDate()
                        } == true
                        if (dueToday) Text("今天到期", style = MaterialTheme.typography.labelSmall,
                            color = cn.pxyb.mycontrol.ui.theme.ColorTokens.Amber.foreground,
                            modifier = Modifier.clip(RoundedCornerShape(16.dp))
                                .background(cn.pxyb.mycontrol.ui.theme.ColorTokens.Amber.container)
                                .padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }
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
                        letterSpacing = (-0.2).sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                content()
            }

            if (opening) {
                AppCircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
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
        type = AppFeedbackType.Info,
        showCloseButton = false,
        icon = Icons.Outlined.CloudOff,
        modifier = Modifier.fillMaxWidth(),
    )
}
