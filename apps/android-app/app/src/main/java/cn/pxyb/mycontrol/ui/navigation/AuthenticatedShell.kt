package cn.pxyb.mycontrol.ui.navigation

import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cn.pxyb.mycontrol.ui.state.SECTION_REFRESH_ERROR_PREFIX
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.ui.AppViewModel
import cn.pxyb.mycontrol.ui.QrScanDestination
import cn.pxyb.mycontrol.ui.components.feedback.AppToast
import cn.pxyb.mycontrol.ui.components.glass.glassBackdropSource
import cn.pxyb.mycontrol.ui.components.glass.rememberGlassBackdrop
import cn.pxyb.mycontrol.ui.components.layout.AppPageBottomSpacing
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.components.layout.resolveAuthenticatedShellInsets
import cn.pxyb.mycontrol.ui.feature.account.AccountManagementScreen
import cn.pxyb.mycontrol.ui.feature.account.LoginSessionsScreen
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantScreen
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantDockButton
import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState
import cn.pxyb.mycontrol.ui.feature.auth.QrLoginScreen
import cn.pxyb.mycontrol.ui.feature.authenticator.AuthenticatorCloudPanel
import cn.pxyb.mycontrol.ui.feature.authenticator.AuthenticatorScreen
import cn.pxyb.mycontrol.ui.feature.authenticator.AuthenticatorViewModel
import cn.pxyb.mycontrol.ui.feature.campus.account.SchoolAccountLoginDialog
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationCenterScreen
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationSettingsScreen
import cn.pxyb.mycontrol.ui.feature.operations.OperationsScreen
import cn.pxyb.mycontrol.ui.feature.overview.OverviewScreen
import cn.pxyb.mycontrol.ui.feature.profile.AppSettingsDialog
import cn.pxyb.mycontrol.ui.feature.profile.ProfileScreen
import cn.pxyb.mycontrol.ui.feature.scenes.ScenesScreen
import cn.pxyb.mycontrol.ui.feature.search.GlobalSearchScreen
import cn.pxyb.mycontrol.ui.feature.tools.ToolsScreen
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AuthenticatedShell(
    state: AppEntryUiState,
    viewModel: AppViewModel,
    onPasskeyRequest: suspend (String) -> String,
    onPasskeyRegistrationRequest: suspend (String) -> String,
    onBiometricConfirmation: suspend () -> Boolean,
    onSessionProtection: suspend () -> Boolean,
    onSensitiveActionConfirmation: suspend () -> Boolean,
    notificationsEnabled: Boolean,
    onRequestNotifications: () -> Unit,
    onWriteNfcScene: (String, String) -> Unit,
    themePreference: AppThemePreference,
    onThemePreferenceChange: (AppThemePreference) -> Unit,
    showInitialSetup: Boolean,
    onInitialSetupComplete: () -> Unit,
) {
    var toastVisible by remember { mutableStateOf(false) }
    var toastMessage by remember { mutableStateOf("") }
    var toastError by remember { mutableStateOf(false) }
    var toastDragOffset by remember { mutableFloatStateOf(0f) }
    var toastDragging by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
    var searchFocusRequest by remember { mutableIntStateOf(0) }
    var initialSetupOpen by remember(showInitialSetup, state.user) {
        mutableStateOf(showInitialSetup && state.user != null)
    }
    val settingsProfileState by viewModel.profileState.collectAsStateWithLifecycle()
    val toastDismissThreshold = with(LocalDensity.current) { 72.dp.toPx() }
    val animatedToastOffset by animateFloatAsState(
        targetValue = toastDragOffset,
        animationSpec = if (toastDragging) snap() else spring(stiffness = Spring.StiffnessMediumLow),
        label = "toast-swipe-offset",
    )
    val navController = rememberNavController()
    val initialRoute = remember {
        val requested = state.requestedRoute()
        parentTabForSubScreen(requested, null)?.route() ?: requested
    }
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route ?: initialRoute
    val isSubScreen = parentTabForSubScreen(currentRoute, null) != null
    val navigateBackFromSubScreen: () -> Unit = {
        val previousRoute = navController.previousBackStackEntry?.destination?.route
        val parentRoute = parentRouteForSubScreen(currentRoute, previousRoute)
        if (parentRoute != null) {
            primaryTabForRoute(parentRoute)?.let { viewModel.syncNavigationDestination(it, autoRefresh = false) }
            if (!navController.popBackStack(parentRoute, inclusive = false)) {
                navController.navigate(parentRoute) {
                    popUpTo(navController.graph.findStartDestination().id) { inclusive = true }
                    launchSingleTop = true
                }
            }
        }
    }
    val navigateToSubScreen: (String) -> Unit = remember(navController) {
        navigate@{ route ->
            val current = navController.currentBackStackEntry?.destination?.route
            if (current == route) return@navigate
            val parentRoute = parentRouteForSubScreen(route, current) ?: return@navigate
            // 嵌套功能保留真实父页面，使页头返回与系统预测性返回一致。
            fun ensureParent(target: String) {
                if (navController.currentBackStackEntry?.destination?.route == target) return
                if (navController.popBackStack(target, inclusive = false)) return
                val ancestor = parentRouteForSubScreen(target, null)
                if (ancestor != null) ensureParent(ancestor)
                navController.navigate(target) {
                    if (ancestor == null) {
                        popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                        restoreState = true
                    }
                    launchSingleTop = true
                }
                navController.popBackStack(target, inclusive = false)
            }
            ensureParent(parentRoute)
            navController.navigate(route) { launchSingleTop = true }
        }
    }

    val sharedImage by viewModel.sharedImage.collectAsStateWithLifecycle()
    val searchTarget by viewModel.searchTarget.collectAsStateWithLifecycle()
    val schoolAccountState by viewModel.schoolAccountState.collectAsStateWithLifecycle()
    LaunchedEffect(sharedImage) {
        sharedImage?.let { uri ->
            navigateToSubScreen(AppRoute.Screenshot)
            viewModel.screenshot.recognize(uri)
            viewModel.consumeSharedImage()
        }
    }

    val navigateToTab: (MainTab) -> Unit = remember(navController, navigateToSubScreen) {
        { tab ->
            val targetRoute = tab.route()
            val current = navController.currentBackStackEntry?.destination?.route
            if (parentTabForSubScreen(targetRoute, current) != null) {
                navigateToSubScreen(targetRoute)
            } else if (current != targetRoute) {
                navController.navigate(targetRoute) {
                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        }
    }

    val onRefresh = remember(viewModel) { { viewModel.refreshCurrentTab(true) } }

    if (state.qrLoginOpen) {
        val qrLoginState by viewModel.qrLoginState.collectAsStateWithLifecycle()
        QrLoginScreen(
            state = qrLoginState,
            onCodeDetected = { rawCode ->
                when (viewModel.scanQrCode(rawCode)) {
                    QrScanDestination.Authenticator -> navigateToSubScreen(AppRoute.Authenticator)
                    QrScanDestination.WaterValve -> navigateToSubScreen(AppRoute.CampusWaterValve)
                    QrScanDestination.Login, QrScanDestination.Unsupported -> Unit
                }
            },
            onApprove = { viewModel.approveQrLogin(onPasskeyRequest) },
            onReject = viewModel::rejectQrLogin,
            onRetry = viewModel::resetQrScanner,
            onClose = viewModel::closeQrLogin,
        )
        return
    }

    // 外部 Tab 请求单独消费，避免与下方路由回写互相触发。
    LaunchedEffect(state.pendingTabNavigation) {
        val tab = state.pendingTabNavigation ?: return@LaunchedEffect
        navigateToTab(tab)
        navController.popBackStack(tab.route(), inclusive = false)
        viewModel.consumeTabNavigation(tab)
    }

    // 响应由 ViewModel 显式打开的二级子界面。
    LaunchedEffect(
        state.accountManagementOpen,
        state.googleAccountDeskOpen,
        state.githubProjectsOpen,
        state.globalSearchOpen,
        state.assistantOpen,
        state.workspaceDestination,
        state.pendingLibrarySeatMyReservations,
        state.pendingChaoxingOpen,
    ) {
        val targetRoute = state.requestedRoute()
        if (targetRoute != currentRoute && targetRoute !in setOf(AppRoute.Overview, AppRoute.Operations, AppRoute.Tools, AppRoute.Profile)) {
            navigateToSubScreen(targetRoute)
        }
    }

    // 路由同步至 ViewModel（记录状态并自动触发后台防抖静默拉取）
    LaunchedEffect(currentRoute) {
        when (currentRoute) {
            AppRoute.Overview -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.Notifications -> viewModel.syncNavigationDestination(
                MainTab.Overview,
                workspaceDestination = WorkspaceDestination.Notifications,
            )
            AppRoute.Tools -> viewModel.syncNavigationDestination(MainTab.Tools)
            AppRoute.Profile -> viewModel.syncNavigationDestination(MainTab.Profile)
            AppRoute.Operations -> viewModel.syncNavigationDestination(MainTab.Operations)
            AppRoute.Account -> viewModel.syncNavigationDestination(MainTab.Profile, accountManagementOpen = true)
            AppRoute.GoogleAccounts -> viewModel.syncNavigationDestination(MainTab.Profile, googleAccountDeskOpen = true)
            AppRoute.GitHubProjects -> viewModel.syncNavigationDestination(MainTab.Operations, githubProjectsOpen = true)
            AppRoute.Search -> viewModel.syncNavigationDestination(MainTab.Overview, globalSearchOpen = true)
            AppRoute.Assistant -> viewModel.syncNavigationDestination(MainTab.Overview, assistantOpen = true)
            AppRoute.Today, AppRoute.Agenda -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Today)
            AppRoute.FreeClassrooms -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.Study, AppRoute.Energy, AppRoute.Grades, AppRoute.Screenshot -> viewModel.syncNavigationDestination(MainTab.Overview, autoRefresh = false)
            AppRoute.Reservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.LibrarySeatReservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.DailyNews -> viewModel.syncNavigationDestination(MainTab.Overview, autoRefresh = false)
            AppRoute.MediaDownload -> viewModel.syncNavigationDestination(MainTab.Overview, autoRefresh = false)
            AppRoute.Scenes -> viewModel.syncNavigationDestination(MainTab.Tools, workspaceDestination = WorkspaceDestination.Scenes)
            AppRoute.Timetable -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Timetable)
            AppRoute.Campus -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Campus)
            AppRoute.Todos -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Todos)
            AppRoute.Projects -> viewModel.syncNavigationDestination(MainTab.Operations, workspaceDestination = WorkspaceDestination.Projects)
            AppRoute.AndroidReleases, AppRoute.RegistryImages -> viewModel.syncNavigationDestination(MainTab.Operations, autoRefresh = false)
            AppRoute.Authenticator, AppRoute.NotificationSettings -> viewModel.syncNavigationDestination(MainTab.Profile, autoRefresh = false)
            AppRoute.LoginSessions -> viewModel.syncNavigationDestination(MainTab.Profile)
        }
    }
    LaunchedEffect(state.error, state.message) {
        val text = state.error ?: state.message
        if (!text.isNullOrBlank()) {
            toastMessage = text
            toastError = state.error != null
            toastDragOffset = 0f
            toastDragging = false
            toastVisible = true
        } else {
            // 反馈已被新操作或重试清除，提示随真实状态收起。
            toastVisible = false
        }
    }
    LaunchedEffect(toastVisible, toastDragging, state.error, state.message) {
        // 错误持续显示，由用户关闭、滑走或重试解除；只有成功提示自动收起。
        if (toastVisible && !toastDragging && state.error == null) {
            val displayedError = state.error
            val displayedMessage = state.message
            delay(3800)
            toastVisible = false
            viewModel.clearFeedback(displayedError, displayedMessage)
        }
    }
    val layoutDirection = LocalLayoutDirection.current
    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded
    val imeInsets = WindowInsets.ime
    val density = LocalDensity.current
    val keyboardVisible by remember(imeInsets, density) {
        derivedStateOf { imeInsets.getBottom(density) > 0 }
    }
    val bottomDockAllowed = isTablet || !isSubScreen
    val bottomDockVisible = bottomDockAllowed && !keyboardVisible
    var bottomDockHeightPx by remember { mutableIntStateOf(0) }
    val bottomDockHeight = with(LocalDensity.current) { bottomDockHeightPx.toDp() }
    // 底栏液态玻璃取样：内容照常绘制，同时录进图形层供底栏模糊取样。
    val glassBackdrop = rememberGlassBackdrop()
    val shellFocus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val backDispatcher = LocalOnBackPressedDispatcherOwner.current?.onBackPressedDispatcher
    LaunchedEffect(Unit) { shellFocus.requestFocus() }
    Scaffold(
        modifier = Modifier
            .fillMaxSize()
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                if (event.isCtrlPressed || event.isMetaPressed) {
                    when (event.key) {
                        Key.K -> {
                            searchFocusRequest++
                            viewModel.openGlobalSearch()
                            navigateToSubScreen(AppRoute.Search)
                        }
                        Key.One -> navigateToTab(MainTab.Overview)
                        Key.Two -> navigateToTab(MainTab.Operations)
                        Key.Three -> navigateToTab(MainTab.Tools)
                        Key.Four -> navigateToTab(MainTab.Profile)
                        Key.Comma -> settingsOpen = true
                        else -> return@onPreviewKeyEvent false
                    }
                    true
                } else if (event.key == Key.Escape) {
                    if (keyboardVisible) {
                        keyboard?.hide()
                        focusManager.clearFocus()
                    } else if (isSubScreen) {
                        backDispatcher?.onBackPressed()
                    } else {
                        return@onPreviewKeyEvent false
                    }
                    true
                } else false
            }
            .focusRequester(shellFocus)
            .focusable(),
        contentWindowInsets = WindowInsets.safeDrawing.exclude(WindowInsets.ime),
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(
                    start = if (layoutDirection == LayoutDirection.Ltr) padding.calculateLeftPadding(layoutDirection) else padding.calculateRightPadding(layoutDirection),
                    end = if (layoutDirection == LayoutDirection.Ltr) padding.calculateRightPadding(layoutDirection) else padding.calculateLeftPadding(layoutDirection),
                ),
        ) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(),
            ) {
                val shellInsets = resolveAuthenticatedShellInsets(
                    safeTop = padding.calculateTopPadding(),
                    safeStart = if (layoutDirection == LayoutDirection.Ltr) {
                        padding.calculateLeftPadding(layoutDirection)
                    } else {
                        padding.calculateRightPadding(layoutDirection)
                    },
                    safeEnd = if (layoutDirection == LayoutDirection.Ltr) {
                        padding.calculateRightPadding(layoutDirection)
                    } else {
                        padding.calculateLeftPadding(layoutDirection)
                    },
                    safeBottom = padding.calculateBottomPadding(),
                    isSubScreen = isSubScreen,
                    isTablet = isTablet,
                )
                val contentBottom = if (bottomDockAllowed) {
                    maxOf(shellInsets.contentBottom, padding.calculateBottomPadding() + bottomDockHeight)
                } else shellInsets.contentBottom
                // 键盘逐步覆盖底栏留白，避免先撤掉整块占位、再缩小视口造成反向跳动。
                val contentPadding = remember(contentBottom, imeInsets) {
                    WindowInsets(bottom = contentBottom)
                        .exclude(imeInsets)
                        .union(WindowInsets(bottom = AppPageBottomSpacing))
                }.asPaddingValues()
                ProvideAppContentLayout(
                    contentMaxWidth = contentMaxWidthForRoute(currentRoute),
                    modifier = Modifier
                        .widthIn(max = contentMaxWidthForRoute(currentRoute))
                        .fillMaxSize()
                        .align(Alignment.TopCenter)
                        .padding(top = shellInsets.navigationTop)
                        .padding(horizontal = if (isTablet) AppPageHorizontalPadding else 0.dp)
                        .consumeWindowInsets(PaddingValues(
                            start = shellInsets.navigationStart,
                            top = shellInsets.navigationTop,
                            end = shellInsets.navigationEnd,
                        ))
                        .then(if (bottomDockVisible) Modifier.glassBackdropSource(glassBackdrop) else Modifier),
                ) {
                val pageLiftOffset = with(LocalDensity.current) { 14.dp.roundToPx() }
                val routeContext = remember(
                    viewModel, state, currentRoute, searchTarget, contentPadding, onRefresh,
                    navigateBackFromSubScreen, navigateToTab, navigateToSubScreen, onSensitiveActionConfirmation,
                ) {
                    ShellRouteContext(
                        viewModel = viewModel,
                        state = state,
                        currentRoute = currentRoute,
                        searchTarget = searchTarget,
                        contentPadding = contentPadding,
                        onRefresh = onRefresh,
                        navigateBackFromSubScreen = navigateBackFromSubScreen,
                        navigateToTab = navigateToTab,
                        navigateToSubScreen = navigateToSubScreen,
                        onSensitiveActionConfirmation = onSensitiveActionConfirmation,
                    )
                }
                val pageExitOffset = with(LocalDensity.current) { 6.dp.roundToPx() }
                NavHost(
                    navController = navController,
                    startDestination = initialRoute,
                    // 键盘只改变页面的测量空间，避免逐帧更新外层共享尺寸并重组导航内容。
                    modifier = Modifier.fillMaxSize().imePadding(),
                enterTransition = {
                    if (parentTabForSubScreen(initialState.destination.route, null) == null &&
                        parentTabForSubScreen(targetState.destination.route, null) == null
                    ) {
                        fadeIn(animationSpec = MotionTokens.tabTween())
                    } else {
                        slideInVertically(
                            initialOffsetY = { pageLiftOffset },
                            animationSpec = MotionTokens.standardTween(),
                        ) + fadeIn(animationSpec = MotionTokens.standardTween())
                    }
                },
                exitTransition = {
                    if (parentTabForSubScreen(initialState.destination.route, null) == null &&
                        parentTabForSubScreen(targetState.destination.route, null) == null
                    ) {
                        fadeOut(animationSpec = MotionTokens.tabTween())
                    } else {
                        slideOutVertically(
                            targetOffsetY = { -pageExitOffset },
                            animationSpec = MotionTokens.exitTween(),
                        ) + fadeOut(animationSpec = MotionTokens.exitTween())
                    }
                },
                popEnterTransition = {
                    if (parentTabForSubScreen(initialState.destination.route, null) == null &&
                        parentTabForSubScreen(targetState.destination.route, null) == null
                    ) {
                        fadeIn(animationSpec = MotionTokens.tabTween())
                    } else {
                        slideInVertically(
                            initialOffsetY = { -pageLiftOffset },
                            animationSpec = MotionTokens.standardTween(),
                        ) + fadeIn(animationSpec = MotionTokens.standardTween())
                    }
                },
                popExitTransition = {
                    if (parentTabForSubScreen(initialState.destination.route, null) == null &&
                        parentTabForSubScreen(targetState.destination.route, null) == null
                    ) {
                        fadeOut(animationSpec = MotionTokens.tabTween())
                    } else {
                        slideOutVertically(
                            targetOffsetY = { pageExitOffset },
                            animationSpec = MotionTokens.exitTween(),
                        ) + fadeOut(animationSpec = MotionTokens.exitTween())
                    }
                },
            ) {
                composable(AppRoute.Overview) {
                    val overviewState by viewModel.overviewState.collectAsStateWithLifecycle()
                    OverviewScreen(
                        focusedApplicationId = searchTarget?.takeIf { currentRoute == AppRoute.Overview && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.Overview }?.focusId,
                        onFocusConsumed = viewModel::consumeSearchTarget,
                        state = overviewState,
                        contentPadding = contentPadding,
                        onSelectTab = navigateToTab,
                        onRefresh = onRefresh,
                        onRunDiagnostics = viewModel::runDiagnostics,
                        onTriggerBackup = { viewModel.triggerBackup(onSensitiveActionConfirmation) },
                        onOpenGoogleAccountDesk = viewModel::openGoogleAccountDesk,
                        onOpenOperations = { navigateToTab(MainTab.Operations) },
                        onOpenSearch = viewModel::openGlobalSearch,
                        onOpenQrLogin = viewModel::openQrScanner,
                        onOpenWorkspace = viewModel::openWorkspace,
                        onOpenNotifications = { viewModel.openWorkspace(WorkspaceDestination.Notifications) },
                        onOpenDailyNews = { navigateToSubScreen(AppRoute.DailyNews) },
                        onOpenReservation = { navigateToSubScreen(AppRoute.Reservation) },
                        onOpenFreeClassrooms = {
                            navigateToSubScreen(AppRoute.FreeClassrooms)
                        },
                        onOpenSeatReservation = {
                            navigateToSubScreen(AppRoute.LibrarySeatReservation)
                        },
                        onOpenWaterValve = {
                            navigateToSubScreen(AppRoute.CampusWaterValve)
                        },
                        onOpenAccountManagement = viewModel::openAccountManagement,
                        onOpenMediaDownload = { navigateToSubScreen(AppRoute.MediaDownload) },
                        onUpdateQuickActions = viewModel::updateHomeQuickActions,
                        requestExternalApplicationLaunch = viewModel::createExternalApplicationLaunch,
                    )
                }

                composable(AppRoute.Operations) {
                    val operationsState by viewModel.operationsState.collectAsStateWithLifecycle()
                    OperationsScreen(
                        focusedId = searchTarget?.takeIf { currentRoute == AppRoute.Operations && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.Operations }?.focusId,
                        onFocusConsumed = viewModel::consumeSearchTarget,
                        state = operationsState,
                        contentPadding = contentPadding,
                        onRunDiagnostics = viewModel::runDiagnostics,
                        onTriggerBackup = { viewModel.triggerBackup(onSensitiveActionConfirmation) },
                        onOpenNotifications = {
                            viewModel.openWorkspace(WorkspaceDestination.Notifications)
                        },
                        onMeasureNetwork = viewModel::measureNetworkHealth,
                        onIncidentNote = viewModel::addIncidentNote,
                        onIncidentMute = { id -> viewModel.muteIncident(id, onSensitiveActionConfirmation) },
                        onIncidentResolve = { id, note -> viewModel.resolveIncident(id, note, onSensitiveActionConfirmation) },
                        onRefresh = onRefresh,
                        onOpenProjects = { navigateToSubScreen(AppRoute.Projects) },
                        requestWebLoginUrl = viewModel::createPlatformWebLoginUrl,
                    )
                }
                composable(AppRoute.Notifications) {
                    val notificationState by viewModel.notificationCenterState.collectAsStateWithLifecycle()
                    NotificationCenterScreen(
                        searchTarget = searchTarget?.takeIf { currentRoute == AppRoute.Notifications && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.Notifications },
                        onSearchTargetConsumed = viewModel::consumeSearchTarget,
                        state = notificationState,
                        contentPadding = contentPadding,
                        refreshing = notificationState.refreshing,
                        onRefresh = { viewModel.refreshCurrentWorkspace(true) },
                        onOpen = viewModel::openAlert,
                        onAction = viewModel::openNotificationAction,
                        onMarkRead = viewModel::markAlertRead,
                        onMarkUnread = viewModel::markAlertUnread,
                        onMarkAllRead = viewModel::markAllAlertsRead,
                        onClearRead = viewModel::clearReadAlerts,
                        onArchive = viewModel::archiveAlert,
                        onSnooze = { id, duration -> viewModel.snoozeAlert(id, duration) },
                        onOpenSettings = { navigateToSubScreen(AppRoute.NotificationSettings) },
                        onBack = navigateBackFromSubScreen,
                    )
                }
                composable(AppRoute.Tools) {
                    val toolsState by viewModel.toolsState.collectAsStateWithLifecycle()
                    ToolsScreen(
                        focusedId = searchTarget?.takeIf { currentRoute == AppRoute.Tools && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.Tools }?.focusId,
                        onFocusConsumed = viewModel::consumeSearchTarget,
                        state = toolsState,
                        contentPadding = contentPadding,
                        currentTab = state.selectedTab,
                        onRunScene = { id -> viewModel.runIotScene(id, onSensitiveActionConfirmation) },
                        onControlRelay = { deviceId, relayId, enabled -> viewModel.controlIotRelay(deviceId, relayId, enabled) },
                        onRefresh = onRefresh,
                        onOpenNotifications = { navigateToSubScreen(AppRoute.Notifications) },
                        onOpenScenes = { navigateToSubScreen(AppRoute.Scenes) },
                    )
                }

                composable(AppRoute.Authenticator) {
                    val authenticatorViewModel: AuthenticatorViewModel = viewModel()
                    val authenticatorState by authenticatorViewModel.state.collectAsStateWithLifecycle()
                    AuthenticatorScreen(
                        state = authenticatorState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        pendingQrUri = state.pendingAuthenticatorUri,
                        onAddFromUri = { authenticatorViewModel.addFromUri(it, onSensitiveActionConfirmation) },
                        onAddManual = { issuer, account, secret -> authenticatorViewModel.addManual(issuer, account, secret, onSensitiveActionConfirmation) },
                        onDelete = { authenticatorViewModel.delete(it, onSensitiveActionConfirmation) },
                        onUnlock = { authenticatorViewModel.unlock(onSensitiveActionConfirmation) },
                        onLock = authenticatorViewModel::lock,
                        onLeave = authenticatorViewModel::leave,
                        onPendingQrUriConsumed = viewModel::consumePendingAuthenticatorUri,
                        cloudPanel = {
                            AuthenticatorCloudPanel(
                                state = authenticatorState,
                                newRecoveryCode = authenticatorViewModel::newRecoveryCode,
                                onEnable = { authenticatorViewModel.enable(it, onSensitiveActionConfirmation, onPasskeyRequest) },
                                onRestore = { authenticatorViewModel.restore(it, onSensitiveActionConfirmation, onPasskeyRequest) },
                                onSync = { authenticatorViewModel.synchronize(onSensitiveActionConfirmation, onPasskeyRequest) },
                                onRotate = { authenticatorViewModel.rotate(it, onSensitiveActionConfirmation, onPasskeyRequest) },
                                onDeleteCloud = { authenticatorViewModel.deleteCloud(onSensitiveActionConfirmation, onPasskeyRequest) },
                                onRestoreHistory = { authenticatorViewModel.restoreHistory(it, onSensitiveActionConfirmation) },
                                onOpenSecurity = { navigateToSubScreen(AppRoute.Account) },
                                onExport = { authenticatorViewModel.exportFile(it, onSensitiveActionConfirmation) },
                                onImport = { uri, code -> authenticatorViewModel.importFile(uri, code, onSensitiveActionConfirmation) },
                            )
                        },
                    )
                }
                composable(AppRoute.Profile) {
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    ProfileScreen(
                        state = profileState,
                        contentPadding = contentPadding,
                        onOpenQrLogin = viewModel::openQrScanner,
                        onLogout = viewModel::logout,
                        onRefresh = onRefresh,
                        onClearCache = viewModel::clearLocalCache,
                        onOpenAccountManagement = viewModel::openAccountManagement,
                        onOpenGoogleAccountDesk = { navigateToSubScreen(AppRoute.GoogleAccounts) },
                        onOpenAuthenticator = { navigateToSubScreen(AppRoute.Authenticator) },
                        onOpenNotificationSettings = { navigateToSubScreen(AppRoute.NotificationSettings) },
                        onCheckUpdates = viewModel::checkAppUpdates,
                        onDownloadAndInstallUpdate = viewModel::downloadAndInstallAppUpdate,
                        onInstallDownloadedUpdate = viewModel::installDownloadedAppUpdate,
                        onOpenReleases = viewModel::openAppReleasesPage,
                        onOpenNotifications = { viewModel.openWorkspace(WorkspaceDestination.Notifications) },
                        onOpenSettings = { settingsOpen = true },
                        assistantButtonVisible = profileState.assistantButtonVisible,
                        onAssistantButtonVisibleChange = viewModel::setAssistantButtonVisible,
                    )
                }
                composable(AppRoute.Account) {
                    val accountState by viewModel.accountManagementState.collectAsStateWithLifecycle()
                    val accountScope = rememberCoroutineScope()
                    AccountManagementScreen(
                        state = accountState,
                        contentPadding = contentPadding,
                        onDismiss = navigateBackFromSubScreen,
                        onRefresh = onRefresh,
                        onOpenLoginSessions = { navigateToSubScreen(AppRoute.LoginSessions) },
                        onChangedPassword = viewModel::changePassword,
                        onBeginTotpEnrollment = viewModel::beginTotpEnrollment,
                        onConfirmTotpEnrollment = viewModel::confirmTotpEnrollment,
                        onRegenerateRecoveryCodes = viewModel::regenerateRecoveryCodes,
                        onDisableTotp = viewModel::disableTotp,
                        onClearTotpFlow = viewModel::clearTotpFlow,
                        onRefreshPasskeys = viewModel::refreshPasskeys,
                        onRegisterPasskey = viewModel::registerPasskey,
                        onDeletePasskey = viewModel::deletePasskey,
                        onRegisterPasskeyRequest = onPasskeyRegistrationRequest,
                        onReauthenticatePasskey = { viewModel.reauthenticateWithPasskey(onPasskeyRequest) },
                        onSetAppLockEnabled = { enabled ->
                            if (enabled) {
                                // 开启“打开应用时验证身份”前，先完成一次设备身份验证并把会话绑定到认证密钥
                                accountScope.launch {
                                    if (onSessionProtection()) viewModel.setAppLockEnabled(true)
                                }
                            } else {
                                viewModel.setAppLockEnabled(false)
                            }
                        },
                    )
                }
                composable(AppRoute.LoginSessions) {
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    LoginSessionsScreen(
                        state = profileState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = onRefresh,
                        onRevokeSession = { nonce -> viewModel.revokeSession(nonce, onSensitiveActionConfirmation) },
                        onRevokeOtherSessions = { viewModel.revokeOtherSessions(onSensitiveActionConfirmation) },
                        onCreateDesktopMagicLink = viewModel::createDesktopMagicLink,
                    )
                }
                composable(AppRoute.NotificationSettings) {
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    NotificationSettingsScreen(
                        preferences = profileState.alertPreferences,
                        notificationsEnabled = notificationsEnabled,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRequestNotifications = onRequestNotifications,
                        onSave = viewModel::saveNotificationPreferences,
                    )
                }
                managementRoutes(routeContext)
                composable(AppRoute.Search) {
                    val searchState by viewModel.globalSearchState.collectAsStateWithLifecycle()
                    GlobalSearchScreen(
                        onRefresh = { viewModel.refreshGlobalSearch(force = true) },
                        focusRequest = searchFocusRequest,
                        state = searchState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onSelect = { item ->
                            val route = item.featureRoute
                            if (route == null) {
                                viewModel.openGlobalSearchResult(item)
                            } else {
                                viewModel.closeGlobalSearch()
                                when (route) {
                                    AppRoute.Tools -> navigateToTab(MainTab.Tools)
                                    AppRoute.Operations -> navigateToTab(MainTab.Operations)
                                    else -> navigateToSubScreen(route)
                                }
                            }
                        },
                    )
                }
                composable(AppRoute.Assistant) {
                    val assistantChatState by viewModel.assistantChatState.collectAsStateWithLifecycle()
                    AssistantScreen(
                        state = assistantChatState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onOpenWorkspace = viewModel::openWorkspace,
                        onOpenOperations = { navigateToTab(MainTab.Operations) },
                        onSelectTab = navigateToTab,
                        onSend = viewModel::sendAssistantMessage,
                        onExecuteAction = viewModel::performAssistantAction,
                    )
                }
                campusRoutes(routeContext)
                composable(AppRoute.Scenes) {
                    val scenesState by viewModel.scenesState.collectAsStateWithLifecycle()
                    ScenesScreen(
                        focusedId = searchTarget?.takeIf { currentRoute == AppRoute.Scenes && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.Scenes }?.focusId,
                        onFocusConsumed = viewModel::consumeSearchTarget,
                        state = scenesState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = { viewModel.refreshCurrentWorkspace() },
                        onRun = { id -> viewModel.runIotScene(id, onSensitiveActionConfirmation) },
                        onSave = viewModel::saveIotScene,
                        onDelete = { id -> viewModel.deleteIotScene(id, onSensitiveActionConfirmation) },
                        onSaveRule = { id, name, enabled, condition, actions, cooldownSeconds ->
                            viewModel.saveIotRule(
                                id,
                                name,
                                enabled,
                                condition,
                                actions,
                                cooldownSeconds,
                                onSensitiveActionConfirmation,
                            )
                        },
                        onToggleRule = { id, enabled ->
                            viewModel.setIotRuleEnabled(id, enabled, onSensitiveActionConfirmation)
                        },
                        onDeleteRule = { id ->
                            viewModel.deleteIotRule(id, onSensitiveActionConfirmation)
                        },
                        onWriteNfc = onWriteNfcScene,
                        onSetQuickScene = viewModel::setQuickScene,
                    onConsumePendingScene = viewModel::consumePendingScene,
                    )
                }
            }
                }

            androidx.compose.animation.AnimatedVisibility(
                visible = bottomDockVisible,
                enter = slideInVertically(animationSpec = tween(160, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeIn(animationSpec = tween(160)),
                exit = slideOutVertically(animationSpec = tween(140, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeOut(animationSpec = tween(120)),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding(),
            ) {
                AppBottomNavigation(
                    selected = primaryTabForRoute(currentRoute) ?: state.selectedTab,
                    onSelect = navigateToTab,
                    modifier = Modifier.onSizeChanged { bottomDockHeightPx = it.height },
                    glassBackdrop = glassBackdrop,
                    assistant = if (state.assistantButtonVisible && !state.assistantOpen && !settingsOpen) ({
                        AssistantDockButton(expanded = isTablet, onOpen = viewModel::openAssistant)
                    }) else null,
                )
            }

            SchoolAccountLoginDialog(
                state = schoolAccountState,
                onDismiss = viewModel::dismissSchoolAccountLogin,
                onPhoneChange = viewModel::updateSchoolAccountPhone,
                onCodeChange = viewModel::updateSchoolAccountCode,
                onSendCode = viewModel::sendSchoolAccountCode,
                onResendCode = viewModel::resendSchoolAccountCode,
                onBackToPhone = viewModel::backToSchoolAccountPhone,
                onVerify = viewModel::verifySchoolAccountCode,
            )

            if (settingsOpen || initialSetupOpen) {
                AppSettingsDialog(
                    profile = settingsProfileState,
                    notificationsEnabled = notificationsEnabled,
                    themePreference = themePreference,
                    initialSetup = initialSetupOpen,
                    onRequestNotifications = onRequestNotifications,
                    onOpenNotificationSettings = {
                        settingsOpen = false
                        navigateToSubScreen(AppRoute.NotificationSettings)
                    },
                    onForceFullSync = viewModel::forceFullSync,
                    onThemePreferenceChange = onThemePreferenceChange,
                    onDismiss = {
                        if (initialSetupOpen) onInitialSetupComplete()
                        initialSetupOpen = false
                        settingsOpen = false
                    },
                )
            }

            androidx.compose.animation.AnimatedVisibility(
                visible = toastVisible,
                enter = slideInVertically(animationSpec = MotionTokens.standardTween()) { -it / 5 } +
                    fadeIn(animationSpec = MotionTokens.standardTween()) +
                    scaleIn(initialScale = 0.98f, animationSpec = MotionTokens.standardTween()),
                exit = slideOutVertically(animationSpec = MotionTokens.fastTween()) { -it / 6 } +
                    fadeOut(animationSpec = MotionTokens.fastTween()),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(horizontal = AppPageHorizontalPadding, vertical = 12.dp)
                    .graphicsLayer {
                        translationX = animatedToastOffset
                        alpha = (1f - abs(animatedToastOffset) / (toastDismissThreshold * 2f))
                            .coerceIn(0.45f, 1f)
                    }
                    .pointerInput(toastMessage, toastDismissThreshold) {
                        detectHorizontalDragGestures(
                            onDragStart = { toastDragging = true },
                            onHorizontalDrag = { change, dragAmount ->
                                change.consume()
                                toastDragOffset += dragAmount
                            },
                            onDragEnd = {
                                toastDragging = false
                                if (abs(toastDragOffset) >= toastDismissThreshold) {
                                    toastDragOffset = if (toastDragOffset < 0f) {
                                        -toastDismissThreshold * 1.5f
                                    } else {
                                        toastDismissThreshold * 1.5f
                                    }
                                    toastVisible = false
                                    viewModel.clearFeedback(state.error, state.message)
                                } else {
                                    toastDragOffset = 0f
                                }
                            },
                            onDragCancel = {
                                toastDragging = false
                                toastDragOffset = 0f
                            },
                        )
                    }
                    .zIndex(10f)
                    .semantics(mergeDescendants = true) {
                        liveRegion = LiveRegionMode.Polite
                        dismiss(label = "关闭提示") {
                            toastVisible = false
                            viewModel.clearFeedback(state.error, state.message)
                            true
                        }
                    },
            ) {
                AppToast(
                    message = toastMessage,
                    error = toastError,
                    // 只对读数据失败提供重试；删除、预约等有副作用的操作不自动重放。
                    onRetry = if (toastError && toastMessage.startsWith(SECTION_REFRESH_ERROR_PREFIX)) {
                        { viewModel.refreshCurrentTab(true) }
                    } else null,
                    onDismiss = if (toastError) {
                        {
                            toastVisible = false
                            viewModel.clearFeedback(state.error, state.message)
                        }
                    } else null,
                )
            }
        }
        }
    }
}
