package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.FactCheck
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import cn.pxyb.mycontrol.assistant.buildPersonalAssistantSnapshot
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import kotlinx.coroutines.delay
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.HomeQuickAction
import kotlinx.coroutines.launch
import java.util.Date

@Composable
fun OverviewScreen(
    state: OverviewUiState,
    contentPadding: PaddingValues,
    onSelectTab: (MainTab) -> Unit,
    onRefresh: () -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenQrLogin: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenDailyNews: () -> Unit = {},
    onOpenReservation: () -> Unit = {},
    onOpenFreeClassrooms: () -> Unit = {},
    onOpenSeatReservation: () -> Unit = {},
    onOpenWaterValve: () -> Unit = {},
    onOpenAccountManagement: () -> Unit = {},
    onUpdateQuickActions: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
    requestExternalApplicationLaunch: suspend (String) -> ExternalApplicationLaunch,
) {
    var customizingQuickActions by remember { mutableStateOf(false) }
    var openingExternalApplicationId by remember { mutableStateOf<String?>(null) }
    var externalApplicationOpenError by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val overview = state.overview
    val activeIncidents = remember(state.incidents) { state.incidents.filter { it.status != "resolved" } }
    val monitored = overview?.services.orEmpty().filter { it.state != "unmonitored" }
    val needsAttention = activeIncidents.isNotEmpty() || monitored.any { it.state != "healthy" }
    val isTablet = useTwoPaneLayout()
    val width = appContentWidth()
    val quickActionWidth = if (isTablet) (width - AppPageHorizontalPadding * 2 - 12.dp) / 2 else width
    val quickActionColumns = quickActionColumnCount(quickActionWidth, LocalDensity.current.fontScale)
    val quickActionRows = remember(state.homeQuickActionOrder, state.hiddenHomeQuickActions, quickActionColumns) {
        state.homeQuickActionOrder.filterNot(state.hiddenHomeQuickActions::contains).chunked(quickActionColumns)
    }
    val listState = rememberLazyListState()
    val dark = isAppInDarkTheme()
    fun openExternalApplication(application: ExternalApplication) {
        if (!application.canAccess || openingExternalApplicationId != null) return
        // 直接打开类型不需要平台统一认证：跳过登录票据生成，仅打开网址本身。
        if (application.kind == "direct") {
            openingExternalApplicationId = application.id
            externalApplicationOpenError = null
            val targetUrl = application.launchUrl.ifBlank { null }
            if (targetUrl == null) {
                openingExternalApplicationId = null
                externalApplicationOpenError = "该外部应用未配置访问网址。"
            } else {
                try {
                    if (application.openMode == "browser") {
                        openBrowserLink(context, targetUrl)
                    } else {
                        openPlatformWebLink(
                            context = context,
                            url = targetUrl,
                            title = application.name,
                            trustedDownloadUrl = targetUrl,
                        )
                    }
                } catch (error: Exception) {
                    externalApplicationOpenError = error.message?.takeIf { it.isNotBlank() }
                        ?: "打开外部应用失败，请稍后重试。"
                } finally {
                    openingExternalApplicationId = null
                }
            }
            return
        }
        openingExternalApplicationId = application.id
        externalApplicationOpenError = null
        scope.launch {
            runCatching {
                val launch = requestExternalApplicationLaunch(application.id)
                if (launch.autoLogin != null) {
                    openPlatformWebLink(
                        context = context,
                        url = application.launchUrl.ifBlank { launch.loginUrl },
                        title = application.name,
                        trustedDownloadUrl = application.launchUrl,
                        autoLogin = launch.autoLogin,
                    )
                } else {
                    when (launch.openMode) {
                        "browser" -> openBrowserLink(context, launch.loginUrl)
                        else -> openPlatformWebLink(
                            context = context,
                            url = launch.loginUrl,
                            title = application.name,
                            trustedDownloadUrl = application.launchUrl,
                        )
                    }
                }
            }
                .onSuccess {
                    openingExternalApplicationId = null
                }
                .onFailure { error ->
                    openingExternalApplicationId = null
                    externalApplicationOpenError = error.message?.takeIf { it.isNotBlank() }
                        ?: "外部应用登录地址生成失败，请稍后重试。"
            }
        }
    }

    val quickActions: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OverviewSectionTitle("常用入口", "按习惯选择并排列", trailing = {
                AppHeaderIconButton(Icons.Outlined.Edit, "调整常用入口", { customizingQuickActions = true })
            })
            AppPanel {
                Column(Modifier.padding(horizontal = 6.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    quickActionRows.forEach { row ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            row.forEach { action ->
                                val spec = homeQuickActionSpec(
                                    action, onSelectTab, onRunDiagnostics, onTriggerBackup,
                                    onOpenGoogleAccountDesk, onOpenOperations, onOpenWorkspace,
                                    onOpenReservation, onOpenFreeClassrooms, onOpenSeatReservation,
                                    onOpenWaterValve, onOpenDailyNews, onOpenSearch, onOpenQrLogin,
                                    onOpenAccountManagement,
                                )
                                QuickAction(spec.icon, spec.label, spec.accent, spec.accentPale, Modifier.weight(1f), spec.onClick)
                            }
                            repeat(quickActionColumns - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
            }
        }
    }
    val statusSummary: @Composable () -> Unit = {
        AppPanel {
            AppActionRow(
                title = when {
                    activeIncidents.isNotEmpty() -> "${activeIncidents.size} 项系统问题需要关注"
                    needsAttention -> "部分服务需要关注"
                    monitored.isNotEmpty() -> "系统运行正常"
                    else -> "系统状态"
                },
                subtitle = if (activeIncidents.isNotEmpty()) activeIncidents.take(2).joinToString("；") { it.title }
                    else "${monitored.count { it.state == "healthy" }} / ${monitored.size} 项服务正常 · 查看状态与维护",
                icon = if (needsAttention) Icons.Outlined.ErrorOutline else Icons.Outlined.CloudDone,
                iconTint = if (needsAttention) ColorTokens.Amber.foreground else MaterialTheme.colorScheme.primary,
                onClick = onOpenOperations,
            )
        }
    }
    PullToRefresh(
        isRefreshing = state.refreshing,
        onRefresh = onRefresh,
        atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().auroraBackdrop(dark),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "overview-header") {
                ModernOverviewHeader(onOpenQrLogin, onOpenSearch, state.unreadAlerts, onOpenNotifications, state.timetable?.currentCalendarText)
            }
            state.sectionError?.let { message ->
                item(key = "overview-error") { FeedbackBanner(message, error = true, onRetry = onRefresh) }
            }
            if (state.offlineMode) {
                item(key = "offline-notice") { OfflineSnapshotNotice(state.cachedAtMillis) }
            }
            if (needsAttention) { item(key = "attention-summary") { statusSummary() } }
            if (isTablet) {
                item(key = "overview-workspace") {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Column(Modifier.weight(1f)) { HomeScheduleCard(state, onOpenWorkspace) }
                        Column(Modifier.weight(1f)) { quickActions() }
                    }
                }
            } else {
                item(key = "today-summary") { HomeScheduleCard(state, onOpenWorkspace) }
                item(key = "quick-actions") { quickActions() }
            }
            if (!needsAttention) { item(key = "status-summary") { statusSummary() } }
            if (state.externalApplications.isNotEmpty() || state.externalApplicationsLoading) {
                item(key = "applications-title") { OverviewSectionTitle("接入应用", "已接入的应用快捷访问") }
                externalApplicationOpenError?.let { message ->
                    item(key = "applications-error") { FeedbackBanner(message, error = true) }
                }
                if (state.externalApplications.isEmpty()) {
                    item(key = "applications-loading") { ExternalApplicationsLoadingPlaceholder() }
                } else {
                    item(key = "applications") {
                        OverviewTwoColumnGrid(state.externalApplications) { application ->
                            ExternalApplicationRow(application, openingExternalApplicationId == application.id, ::openExternalApplication)
                        }
                    }
                }
            }
        }
    }
    if (customizingQuickActions) {
        QuickActionsDialog(
            order = state.homeQuickActionOrder,
            hidden = state.hiddenHomeQuickActions,
            onDismiss = { customizingQuickActions = false },
            onSave = { order, hidden -> onUpdateQuickActions(order, hidden); customizingQuickActions = false },
        )
    }
}

@Composable
private fun HomeScheduleCard(state: OverviewUiState, onOpenWorkspace: (WorkspaceDestination) -> Unit) {
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
        OverviewSectionTitle("今日安排", "课程、待办与校园日常")
        AppPanel {
            AppActionRow(
                title = courseAction?.title ?: if (state.timetable == null) "今日课程" else "今天暂无后续课程",
                subtitle = courseAction?.detail ?: if (state.timetable == null) "查看课程与日程" else "查看今日安排或本学期课表",
                icon = Icons.Outlined.CalendarMonth,
                onClick = { onOpenWorkspace(WorkspaceDestination.Today) },
            )
            AppDivider()
            AppActionRow(
                title = "个人待办 · ${pendingTodos.size} 项未完成",
                subtitle = pendingTodos.firstOrNull()?.title ?: "记录下一件要完成的事",
                icon = Icons.Outlined.FactCheck,
                onClick = { onOpenWorkspace(WorkspaceDestination.Todos) },
            )
            Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppSecondaryButton("本学期课表", { onOpenWorkspace(WorkspaceDestination.Timetable) }, modifier = Modifier.weight(1f))
                AppSecondaryButton("校园服务", { onOpenWorkspace(WorkspaceDestination.Campus) }, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ModernOverviewHeader(
    onOpenQrLogin: () -> Unit,
    onOpenSearch: () -> Unit,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
    calendarText: String? = null,
) {
    val isDark = isAppInDarkTheme()
    val glass = rememberGlassPalette(radius = 22.dp)
    val weekTag = remember(calendarText) {
        extractHeaderWeekTag(calendarText)
    }
    val searchInteractionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // 1. 左侧：工作台标题 + 周次微标 Pill + 绿色微光状态呼吸灯
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "工作台",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 21.sp,
                            letterSpacing = (-0.3).sp,
                            color = MaterialTheme.colorScheme.onBackground,
                        ),
                    )
                    Surface(
                        shape = CircleShape,
                        color = if (isDark) {
                            ColorTokens.BlueDark.container.copy(alpha = 0.5f)
                        } else {
                            ColorTokens.Blue.container.copy(alpha = 0.85f)
                        },
                        border = BorderStroke(
                            0.6.dp,
                            if (isDark) ColorTokens.BlueDark.border else ColorTokens.Blue.border,
                        ),
                    ) {
                        Text(
                            text = weekTag,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isDark) ColorTokens.BlueDark.foreground else ColorTokens.Blue.foreground,
                            ),
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(ColorTokens.Green.foreground, CircleShape),
                    )
                    Text(
                        text = "服务稳定 · 综合校园控制台",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // 2. 右侧操作区：半展开触控搜索胶囊 + 圆形触感通知按钮 + 圆形触感扫码按钮
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                // 灵动搜索胶囊
                Surface(
                    onClick = onOpenSearch,
                    interactionSource = searchInteractionSource,
                    shape = CircleShape,
                    color = if (isDark) {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.40f)
                    } else {
                        ColorTokens.Blue.container.copy(alpha = 0.65f)
                    },
                    border = BorderStroke(
                        0.7.dp,
                        if (isDark) MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f) else ColorTokens.Blue.border,
                    ),
                    modifier = Modifier.pressFeedback(searchInteractionSource, pressedScale = 0.95f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Search,
                            contentDescription = "搜索",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(15.dp),
                        )
                        Text(
                            text = "搜索...",
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // 消息通知
                AppNotificationButton(
                    unreadCount = unreadCount,
                    onClick = onOpenNotifications,
                    shape = CircleShape,
                )

                // 扫码登录
                ModernHeaderIconButton(
                    icon = Icons.Outlined.CenterFocusWeak,
                    contentDescription = "扫码登录",
                    onClick = onOpenQrLogin,
                    size = 36.dp,
                    iconSize = 18.dp,
                    shape = CircleShape,
                )
            }
        }
    }
}

private fun extractHeaderWeekTag(calendarText: String?): String {
    if (calendarText.isNullOrBlank()) return "第3周"
    val regex = Regex("""第\s*\d+\s*周""")
    val match = regex.find(calendarText)
    if (match != null) return match.value.replace(" ", "")
    val weekdayRegex = Regex("""周[一二三四五六日天]""")
    val weekdayMatch = weekdayRegex.find(calendarText)
    if (weekdayMatch != null) return weekdayMatch.value
    return "第3周"
}
/** 分组标题：灵动微岛毛玻璃浮标 (Dynamic Floating Island Pill) */
@Composable
private fun OverviewSectionTitle(
    title: String,
    subtitle: String,
    dotColor: Color = MaterialTheme.colorScheme.primary,
    tag: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    AppSectionHeader(
        title = title,
        subtitle = subtitle,
        accent = dotColor,
        tag = tag,
        trailing = trailing,
    )
}

@Composable
private fun <T> OverviewTwoColumnGrid(
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
private fun OverviewServiceCardShell(
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

private var scanViewfinder: ImageVector? = null

private val ScanViewfinder: ImageVector
    get() {
        scanViewfinder?.let { return it }
        return ImageVector.Builder(
            name = "ScanViewfinder",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(4f, 4f)
                horizontalLineTo(10f)
                verticalLineTo(6f)
                horizontalLineTo(6f)
                verticalLineTo(10f)
                horizontalLineTo(4f)
                close()

                moveTo(14f, 4f)
                horizontalLineTo(20f)
                verticalLineTo(10f)
                horizontalLineTo(18f)
                verticalLineTo(6f)
                horizontalLineTo(14f)
                close()

                moveTo(4f, 14f)
                horizontalLineTo(6f)
                verticalLineTo(18f)
                horizontalLineTo(10f)
                verticalLineTo(20f)
                horizontalLineTo(4f)
                close()

                moveTo(18f, 14f)
                horizontalLineTo(20f)
                verticalLineTo(20f)
                horizontalLineTo(14f)
                verticalLineTo(18f)
                horizontalLineTo(18f)
                close()

                moveTo(6.5f, 11f)
                horizontalLineTo(17.5f)
                verticalLineTo(13f)
                horizontalLineTo(6.5f)
                close()
            }
        }.build().also { scanViewfinder = it }
    }

private data class HomeQuickActionSpec(
    val icon: ImageVector,
    val label: String,
    val accent: Color,
    val accentPale: Color,
    val onClick: () -> Unit,
)

private data class QuickActionVisual(
    val icon: ImageVector,
    val accent: Color,
)

@Composable
private fun homeQuickActionVisual(action: HomeQuickAction): QuickActionVisual = when (action) {
    HomeQuickAction.Today -> QuickActionVisual(Icons.Outlined.CalendarMonth, ColorTokens.Blue.foreground)
    HomeQuickAction.Notifications -> QuickActionVisual(Icons.Outlined.Notifications, ColorTokens.Pink.foreground)
    HomeQuickAction.DailyNews -> QuickActionVisual(Icons.Outlined.Newspaper, ColorTokens.Teal.foreground)
    HomeQuickAction.Scenes -> QuickActionVisual(Icons.Outlined.Tune, ColorTokens.Purple.foreground)
    HomeQuickAction.Reservation -> QuickActionVisual(Icons.Outlined.MeetingRoom, ColorTokens.Blue.foreground)
    HomeQuickAction.FreeClassrooms -> QuickActionVisual(Icons.Outlined.School, ColorTokens.Sky.foreground)
    HomeQuickAction.SeatReservation -> QuickActionVisual(Icons.Outlined.Chair, ColorTokens.Green.foreground)
    HomeQuickAction.WaterValve -> QuickActionVisual(Icons.Outlined.WaterDrop, ColorTokens.Sky.foreground)
    HomeQuickAction.Devices -> QuickActionVisual(Icons.Outlined.Hub, ColorTokens.Sky.foreground)
    HomeQuickAction.Diagnostics -> QuickActionVisual(Icons.Outlined.Speed, ColorTokens.Amber.foreground)
    HomeQuickAction.Backup -> QuickActionVisual(Icons.Outlined.Backup, ColorTokens.Teal.foreground)
    HomeQuickAction.GoogleAccounts -> QuickActionVisual(Icons.Outlined.Email, ColorTokens.Indigo.foreground)
    HomeQuickAction.Operations -> QuickActionVisual(Icons.Outlined.Settings, MaterialTheme.colorScheme.onSurfaceVariant)
    HomeQuickAction.Account -> QuickActionVisual(Icons.Outlined.Security, ColorTokens.Green.foreground)
}
@Composable
private fun homeQuickActionSpec(
    action: HomeQuickAction,
    onSelectTab: (MainTab) -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenReservation: () -> Unit,
    onOpenFreeClassrooms: () -> Unit,
    onOpenSeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onOpenDailyNews: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenQrLogin: () -> Unit,
    onOpenAccountManagement: () -> Unit,
): HomeQuickActionSpec = when (action) {
    HomeQuickAction.Today -> HomeQuickActionSpec(
        icon = Icons.Outlined.CalendarMonth,
        label = "今日安排",
        accent = ColorTokens.Blue.foreground,
        accentPale = ColorTokens.Blue.container,
    ) { onOpenWorkspace(WorkspaceDestination.Today) }

    HomeQuickAction.Notifications -> HomeQuickActionSpec(
        icon = Icons.Outlined.Notifications,
        label = "通知中心",
        accent = ColorTokens.Pink.foreground,
        accentPale = ColorTokens.Pink.container,
    ) { onOpenWorkspace(WorkspaceDestination.Notifications) }

    HomeQuickAction.DailyNews -> HomeQuickActionSpec(
        icon = Icons.Outlined.Newspaper,
        label = "每日新闻",
        accent = ColorTokens.Teal.foreground,
        accentPale = ColorTokens.Teal.container,
        onClick = onOpenDailyNews,
    )

    HomeQuickAction.Scenes -> HomeQuickActionSpec(
        icon = Icons.Outlined.Tune,
        label = "场景与自动化",
        accent = ColorTokens.Purple.foreground,
        accentPale = ColorTokens.Purple.container,
    ) { onOpenWorkspace(WorkspaceDestination.Scenes) }

    HomeQuickAction.Reservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.MeetingRoom,
        label = "研讨间预约",
        accent = ColorTokens.Blue.foreground,
        accentPale = ColorTokens.Blue.container,
        onClick = onOpenReservation,
    )

    HomeQuickAction.FreeClassrooms -> HomeQuickActionSpec(
        icon = Icons.Outlined.School,
        label = "空闲教室",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
        onClick = onOpenFreeClassrooms,
    )

    HomeQuickAction.SeatReservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.Chair,
        label = "座位预约",
        accent = ColorTokens.Green.foreground,
        accentPale = ColorTokens.Green.container,
        onClick = onOpenSeatReservation,
    )

    HomeQuickAction.WaterValve -> HomeQuickActionSpec(
        icon = Icons.Outlined.WaterDrop,
        label = "饮水机",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
        onClick = onOpenWaterValve,
    )

    HomeQuickAction.Devices -> HomeQuickActionSpec(
        icon = Icons.Outlined.Hub,
        label = "设备控制",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
    ) { onSelectTab(MainTab.Tools) }

    HomeQuickAction.Diagnostics -> HomeQuickActionSpec(
        icon = Icons.Outlined.Speed,
        label = "一键巡检",
        accent = ColorTokens.Amber.foreground,
        accentPale = ColorTokens.Amber.container,
        onClick = onRunDiagnostics,
    )

    HomeQuickAction.Backup -> HomeQuickActionSpec(
        icon = Icons.Outlined.Backup,
        label = "数据备份",
        accent = ColorTokens.Teal.foreground,
        accentPale = ColorTokens.Teal.container,
        onClick = onTriggerBackup,
    )

    HomeQuickAction.GoogleAccounts -> HomeQuickActionSpec(
        icon = Icons.Outlined.Email,
        label = "Google 邮箱台账",
        accent = ColorTokens.Indigo.foreground,
        accentPale = ColorTokens.Indigo.container,
        onClick = onOpenGoogleAccountDesk,
    )

    HomeQuickAction.Operations -> HomeQuickActionSpec(
        icon = Icons.Outlined.Settings,
        label = "系统状态",
        accent = MaterialTheme.colorScheme.onSurfaceVariant,
        accentPale = MaterialTheme.colorScheme.surfaceContainerLow,
        onClick = onOpenOperations,
    )

    HomeQuickAction.Account -> HomeQuickActionSpec(
        icon = Icons.Outlined.Security,
        label = "账号与安全",
        accent = ColorTokens.Green.foreground,
        accentPale = ColorTokens.Green.container,
        onClick = onOpenAccountManagement,
    )
}

@Composable
private fun QuickActionsDialog(
    order: List<HomeQuickAction>,
    hidden: Set<HomeQuickAction>,
    onDismiss: () -> Unit,
    onSave: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
) {
    var localOrder by remember(order) { mutableStateOf(order) }
    var localHidden by remember(hidden) { mutableStateOf(hidden) }
    val visibleCount = localOrder.count { it !in localHidden }
    val dark = isAppInDarkTheme()
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Edit,
        title = "调整快捷操作",
        subtitle = "已显示 $visibleCount 项 · 开关控制显示，箭头调整顺序",
        modifier = Modifier.heightIn(max = 700.dp),
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "保存配置",
                    onClick = { onSave(localOrder, localHidden) },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            localOrder.forEachIndexed { index, action ->
                val isChecked = action !in localHidden
                val visual = homeQuickActionVisual(action)
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = glassCardColor(),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(13.dp))
                                .background(visual.accent.copy(alpha = if (dark) 0.20f else 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = visual.icon,
                                contentDescription = null,
                                tint = visual.accent,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = homeQuickActionLabel(action),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.5.sp,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = if (isChecked) "已显示" else "已隐藏",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = if (isChecked) MaterialTheme.colorScheme.onSurfaceVariant
                                        else MaterialTheme.colorScheme.outline,
                            )
                        }
                        AppSwitch(
                            checked = isChecked,
                            enabled = isChecked || visibleCount > 1,
                            onCheckedChange = { checked ->
                                localHidden = if (checked) localHidden - action else localHidden + action
                            },
                            tint = visual.accent,
                        )
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            QuickActionArrowButton(
                                up = true,
                                enabled = index > 0,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index - 1, item)
                                    }
                                },
                            )
                            QuickActionArrowButton(
                                up = false,
                                enabled = index < localOrder.lastIndex,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index + 1, item)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickActionArrowButton(
    up: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(
                if (enabled) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                else Color.Transparent
            )
            .pressFeedback(interactionSource, pressedScale = 0.88f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (up) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
            contentDescription = if (up) "上移" else "下移",
            tint = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant
                   else MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(16.dp),
        )
    }
}
private fun homeQuickActionLabel(action: HomeQuickAction): String = when (action) {
    HomeQuickAction.Today -> "今日安排"
    HomeQuickAction.Notifications -> "通知中心"
    HomeQuickAction.DailyNews -> "每日新闻"
    HomeQuickAction.Scenes -> "场景与自动化"
    HomeQuickAction.Reservation -> "研讨间预约"
    HomeQuickAction.FreeClassrooms -> "空闲教室"
    HomeQuickAction.SeatReservation -> "座位预约"
    HomeQuickAction.WaterValve -> "饮水机"
    HomeQuickAction.Devices -> "设备控制"
    HomeQuickAction.Diagnostics -> "系统自检"
    HomeQuickAction.Backup -> "数据备份"
    HomeQuickAction.GoogleAccounts -> "Google 邮箱台账"
    HomeQuickAction.Operations -> "系统状态"
    HomeQuickAction.Account -> "账号与安全"
}

@Composable
private fun OfflineSnapshotNotice(cachedAtMillis: Long?) {
    val context = LocalContext.current
    val updatedAt = remember(context, cachedAtMillis) {
        cachedAtMillis?.let { android.text.format.DateFormat.getTimeFormat(context).format(Date(it)) }
    }
    FeedbackBanner(
        title = "部分内容使用缓存，请留意更新时间",
        message = updatedAt?.let { "缓存更新时间 $it" } ?: "联网后将自动恢复同步",
        error = false,
        icon = Icons.Outlined.CloudOff,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun QuickAction(
    icon: ImageVector,
    label: String,
    accent: Color,
    accentPale: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .pressFeedback(interactionSource, pressedScale = 0.90f)
            .clip(RoundedCornerShape(16.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(vertical = 4.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        QuickActionGlassTile(
            icon = icon,
            accent = accent,
            accentPale = accentPale,
            modifier = Modifier.size(38.dp),
            iconSize = 20.dp,
            contentDescription = label,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Medium,
                fontSize = 11.5.sp,
                letterSpacing = (-0.1).sp,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            minLines = 2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private data class VisualTheme(
    val icon: ImageVector,
    val accent: Color,
    val accentPale: Color,
)

@Composable
private fun applicationVisualTheme(application: ExternalApplication): VisualTheme {
    val name = application.name.lowercase()
    val id = application.id.lowercase()
    return when {
        "ar" in name || "签到" in name || "sign" in id -> VisualTheme(
            icon = Icons.Outlined.CenterFocusWeak,
            accent = ColorTokens.Sky.foreground, // 极光青蓝
            accentPale = ColorTokens.Sky.container,
        )
        "chat" in name || "api" in name || "ai" in id || "gpt" in name -> VisualTheme(
            icon = Icons.Outlined.AutoAwesome,
            accent = ColorTokens.Purple.foreground, // 智感紫罗兰
            accentPale = ColorTokens.Purple.container,
        )
        "monkey" in name || "code" in name || "调度" in name || "dev" in id -> VisualTheme(
            icon = Icons.Outlined.Terminal,
            accent = ColorTokens.Indigo.foreground, // 极客靛蓝
            accentPale = ColorTokens.Indigo.container,
        )
        else -> VisualTheme(
            icon = Icons.Outlined.Public,
            accent = ColorTokens.Green.foreground, // 矩阵绿
            accentPale = ColorTokens.Green.container,
        )
    }
}

@Composable
private fun ExternalApplicationsLoadingPlaceholder() {
    OverviewTwoColumnGrid(items = List(4) { it }) { index ->
        ExternalApplicationLoadingCard(index = index)
    }
}

@Composable
private fun ExternalApplicationLoadingCard(index: Int) {
    val isDark = isAppInDarkTheme()
    val transition = rememberInfiniteTransition(label = "external-application-loading")
    val pulse by transition.animateFloat(
        initialValue = 0.38f,
        targetValue = 0.88f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900 + index * 110, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "external-application-loading-pulse",
    )
    val skeletonColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f * pulse)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .glassShimmer(isDark),
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.38f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(skeletonColor),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(if (index % 2 == 0) 0.78f else 0.65f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(skeletonColor),
                )
                Box(
                    modifier = Modifier
                        .size(width = 48.dp, height = 9.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(skeletonColor),
                )
            }
        }
    }
}

@Composable
private fun ExternalApplicationRow(
    application: ExternalApplication,
    opening: Boolean,
    onOpen: (ExternalApplication) -> Unit,
) {
    val theme = applicationVisualTheme(application)

    OverviewServiceCardShell(
        title = application.name,
        icon = theme.icon,
        accent = theme.accent,
        accentPale = theme.accentPale,
        enabled = application.canAccess && !opening,
        opening = opening,
        onClick = { onOpen(application) },
    ) {
        if (!application.canAccess) {
            Text(
                text = "无访问权限",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(ColorTokens.Green.foreground),
                )
                val latencyText = application.health.latencyMs?.let { "$it ms" } ?: "在线"
                val tagText = if (application.kind == "direct") "免密" else externalRoleLabel(application.requiredRole)
                Text(
                    text = "$latencyText · $tagText",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun externalRoleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    else -> "普通用户"
}

private fun openBrowserLink(context: android.content.Context, url: String) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    } catch (error: Exception) {
        throw IllegalStateException("系统未找到可用浏览器。", error)
    }
}
