package cn.pxyb.mycontrol.ui.feature.overview

import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.data.ExternalApplicationLaunch
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.PullToRefresh
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.quickActionColumnCount
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.openPlatformWebLink
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
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
    val quickActionWidth = if (isTablet) (width - AppPageHorizontalPadding * 2 - 12.dp) * 0.42f else width
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
                item(key = "overview-error") { AppFeedbackBanner(message, error = true, onRetry = onRefresh) }
            }
            if (state.offlineMode) {
                item(key = "offline-notice") { OfflineSnapshotNotice(state.cachedAtMillis) }
            }
            if (needsAttention) { item(key = "attention-summary") { statusSummary() } }
            item(key = "overview-workspace") {
                FlowRow(
                    maxItemsInEachRow = if (isTablet) 2 else 1,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Column(Modifier.weight(if (isTablet) 0.58f else 1f)) { HomeScheduleCard(state, onOpenWorkspace) }
                    Column(Modifier.weight(if (isTablet) 0.42f else 1f)) { quickActions() }
                }
            }
            if (!needsAttention) { item(key = "status-summary") { statusSummary() } }
            if (state.externalApplications.isNotEmpty() || state.externalApplicationsLoading) {
                item(key = "applications-title") { OverviewSectionTitle("接入应用", "已接入的应用快捷访问") }
                externalApplicationOpenError?.let { message ->
                    item(key = "applications-error") { AppFeedbackBanner(message, error = true) }
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
