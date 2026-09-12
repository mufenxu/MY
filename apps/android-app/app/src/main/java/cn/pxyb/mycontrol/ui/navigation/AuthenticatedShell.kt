package cn.pxyb.mycontrol.ui.navigation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.LocalOnBackPressedDispatcherOwner
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import cn.pxyb.mycontrol.ui.components.layout.AppPageBottomSpacing
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppTabletContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.components.layout.resolveAuthenticatedShellInsets
import cn.pxyb.mycontrol.ui.feature.account.AccountManagementScreen
import cn.pxyb.mycontrol.ui.feature.account.LoginSessionsScreen
import cn.pxyb.mycontrol.ui.feature.assistant.AssistantScreen
import cn.pxyb.mycontrol.ui.feature.assistant.FloatingAssistantButton
import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState
import cn.pxyb.mycontrol.ui.feature.auth.QrLoginScreen
import cn.pxyb.mycontrol.ui.feature.authenticator.AuthenticatorScreen
import cn.pxyb.mycontrol.ui.feature.authenticator.AuthenticatorViewModel
import cn.pxyb.mycontrol.ui.feature.campus.FreeClassroomScreen
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatReservationScreen
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatTab
import cn.pxyb.mycontrol.ui.feature.campus.reservation.ReservationScreen
import cn.pxyb.mycontrol.ui.feature.campus.water.WaterValveScreen
import cn.pxyb.mycontrol.ui.feature.google.GoogleAccountDeskScreen
import cn.pxyb.mycontrol.ui.feature.news.DailyNewsScreen
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationCenterScreen
import cn.pxyb.mycontrol.ui.feature.notifications.NotificationSettingsScreen
import cn.pxyb.mycontrol.ui.feature.operations.OperationsScreen
import cn.pxyb.mycontrol.ui.feature.overview.OverviewScreen
import cn.pxyb.mycontrol.ui.feature.profile.AppSettingsDialog
import cn.pxyb.mycontrol.ui.feature.profile.ProfileScreen
import cn.pxyb.mycontrol.ui.feature.projects.GitHubProjectsScreen
import cn.pxyb.mycontrol.ui.feature.projects.ProjectsScreen
import cn.pxyb.mycontrol.ui.feature.registry.RegistryImagesScreen
import cn.pxyb.mycontrol.ui.feature.releases.AndroidReleaseScreen
import cn.pxyb.mycontrol.ui.feature.scenes.ScenesScreen
import cn.pxyb.mycontrol.ui.feature.search.GlobalSearchScreen
import cn.pxyb.mycontrol.ui.feature.tools.ToolsScreen
import cn.pxyb.mycontrol.ui.feature.workspace.TodayScreen
import cn.pxyb.mycontrol.ui.openPlatformWebLink
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import java.time.YearMonth
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
    var assistantAnchorSize by remember { mutableStateOf(IntSize.Zero) }
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
            onApprove = { viewModel.approveQrLogin(onPasskeyRequest, onBiometricConfirmation) },
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
            AppRoute.Today -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Today)
            AppRoute.FreeClassrooms -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.Reservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.LibrarySeatReservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.DailyNews -> viewModel.syncNavigationDestination(MainTab.Overview, autoRefresh = false)
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
        }
    }
    LaunchedEffect(toastVisible, toastDragging, state.error, state.message) {
        if (toastVisible && !toastDragging) {
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
    val keyboardVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
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
            if (isTablet) {
                AppNavigationRail(
                    modifier = Modifier.padding(
                        top = padding.calculateTopPadding(),
                        bottom = padding.calculateBottomPadding(),
                    ),
                    selectedTab = primaryTabForRoute(currentRoute) ?: state.selectedTab,
                    onSelectTab = navigateToTab,
                    unreadAlerts = settingsProfileState.unreadAlerts,
                    onOpenNotifications = {
                        viewModel.openWorkspace(WorkspaceDestination.Notifications)
                        navigateToSubScreen(AppRoute.Notifications)
                    },
                    onOpenSearch = {
                        viewModel.openGlobalSearch()
                        navigateToSubScreen(AppRoute.Search)
                    },
                    onOpenQrLogin = viewModel::openQrScanner,
                    onOpenSettings = { settingsOpen = true },
                    themePreference = themePreference,
                    onToggleTheme = {
                        val next = when (themePreference) {
                            AppThemePreference.System -> AppThemePreference.Dark
                            AppThemePreference.Dark -> AppThemePreference.Light
                            AppThemePreference.Light -> AppThemePreference.System
                        }
                        onThemePreferenceChange(next)
                    },
                )
            }

            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .onSizeChanged { assistantAnchorSize = it },
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
                    isSubScreen = isSubScreen || keyboardVisible,
                    isTablet = isTablet,
                )
                val contentPadding = PaddingValues(
                    bottom = if (keyboardVisible) AppPageBottomSpacing else shellInsets.contentBottom,
                )
                ProvideAppContentLayout(
                    contentMaxWidth = contentMaxWidthForRoute(currentRoute),
                    modifier = Modifier
                        .widthIn(max = contentMaxWidthForRoute(currentRoute))
                        .fillMaxSize()
                        .align(Alignment.TopCenter)
                        .padding(top = shellInsets.navigationTop)
                        .consumeWindowInsets(PaddingValues(
                            start = shellInsets.navigationStart,
                            top = shellInsets.navigationTop,
                            end = shellInsets.navigationEnd,
                        ))
                        .imePadding(),
                ) {
                NavHost(
                    navController = navController,
                    startDestination = initialRoute,
                    modifier = Modifier.fillMaxSize(),
                enterTransition = {
                    slideInHorizontally(
                        initialOffsetX = { fullWidth -> (fullWidth * 0.08f).toInt() },
                        animationSpec = MotionTokens.standardTween(),
                    ) + fadeIn(animationSpec = MotionTokens.standardTween()) +
                    scaleIn(initialScale = 0.97f, animationSpec = MotionTokens.standardTween())
                },
                exitTransition = {
                    slideOutHorizontally(
                        targetOffsetX = { fullWidth -> (-fullWidth * 0.04f).toInt() },
                        animationSpec = MotionTokens.fastTween(),
                    ) + fadeOut(animationSpec = MotionTokens.fastTween())
                },
                popEnterTransition = {
                    slideInHorizontally(
                        initialOffsetX = { fullWidth -> (-fullWidth * 0.04f).toInt() },
                        animationSpec = MotionTokens.standardTween(),
                    ) + fadeIn(animationSpec = MotionTokens.standardTween()) +
                    scaleIn(initialScale = 0.97f, animationSpec = MotionTokens.standardTween())
                },
                popExitTransition = {
                    slideOutHorizontally(
                        targetOffsetX = { fullWidth -> (fullWidth * 0.10f).toInt() },
                        animationSpec = MotionTokens.fastTween(),
                    ) + fadeOut(animationSpec = MotionTokens.fastTween())
                },
            ) {
                composable(AppRoute.Overview) {
                    val overviewState by viewModel.overviewState.collectAsStateWithLifecycle()
                    OverviewScreen(
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
                        onUpdateQuickActions = viewModel::updateHomeQuickActions,
                        requestExternalApplicationLaunch = viewModel::createExternalApplicationLaunch,
                    )
                }

                composable(AppRoute.Operations) {
                    val operationsState by viewModel.operationsState.collectAsStateWithLifecycle()
                    OperationsScreen(
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
                        onAddFromUri = authenticatorViewModel::addFromUri,
                        onAddManual = authenticatorViewModel::addManual,
                        onDelete = authenticatorViewModel::delete,
                        onPendingQrUriConsumed = viewModel::consumePendingAuthenticatorUri,
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
                        onForceFullSync = viewModel::forceFullSync,
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
                composable(AppRoute.Projects) {
                    val projectsState by viewModel.projectsState.collectAsStateWithLifecycle()
                    ProjectsScreen(
                        state = projectsState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = onRefresh,
                        onOpenGitHubProjects = { navigateToSubScreen(AppRoute.GitHubProjects) },
                        onOpenAndroidReleases = { navigateToSubScreen(AppRoute.AndroidReleases) },
                        onOpenRegistryImages = { navigateToSubScreen(AppRoute.RegistryImages) },
                        onTriggerCt8 = { viewModel.triggerCt8(onSensitiveActionConfirmation) },
                    )
                }
                composable(AppRoute.GoogleAccounts) {
                    val googleAccountState by viewModel.googleAccountDeskState.collectAsStateWithLifecycle()
                    GoogleAccountDeskScreen(
                        state = googleAccountState,
                        contentPadding = contentPadding,
                        onDismiss = navigateBackFromSubScreen,
                        onRefresh = { viewModel.googleAccounts.loadGoogleAccounts(force = true) },
                        onAddAccount = viewModel.googleAccounts::addGoogleAccount,
                        onImportAccounts = viewModel.googleAccounts::importGoogleAccounts,
                        onUpdateAccount = viewModel.googleAccounts::updateGoogleAccount,
                        onDeleteAccount = viewModel.googleAccounts::deleteGoogleAccount,
                        onBulkUpdateAccounts = viewModel.googleAccounts::bulkUpdateGoogleAccounts,
                        onBulkArchiveAccounts = viewModel.googleAccounts::bulkSetGoogleAccountsArchived,
                        onBulkDeleteAccounts = viewModel.googleAccounts::bulkDeleteGoogleAccounts,
                        onAddAlias = viewModel.googleAccounts::addGoogleAlias,
                        onUpdateAlias = viewModel.googleAccounts::updateGoogleAlias,
                        onDeleteAlias = viewModel.googleAccounts::deleteGoogleAlias,
                        onUploadLocalAccounts = viewModel.googleAccounts::uploadLocalGoogleAccounts,
                        onDiscardLocalAccounts = viewModel.googleAccounts::discardLocalGoogleAccounts,
                    )
                }
                composable(AppRoute.GitHubProjects) {
                    GitHubProjectsScreen(
                        repositories = state.githubRepositories,
                        loaded = state.githubRepositoriesLoaded,
                        busy = state.githubVisibilityBusy,
                        profile = state.githubProfile,
                        profileLoaded = state.githubProfileLoaded,
                        releases = state.githubReleases,
                        releasesLoaded = state.githubReleasesLoaded,
                        releasesRepoFullName = state.githubReleasesRepoFullName,
                        releasesBusy = state.githubReleasesBusy,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel::refreshGitHubProjects,
                        onLoadReleases = { owner, repo -> viewModel.loadGitHubReleases(owner, repo) },
                        onCreateRelease = { owner, repo, tag, name, body, draft, prerelease ->
                            viewModel.createGitHubRelease(owner, repo, tag, name, body, draft, prerelease, onSensitiveActionConfirmation)
                        },
                        onUpdateVisibility = { owner, repo, visibility ->
                            viewModel.updateGitHubVisibility(owner, repo, visibility, onSensitiveActionConfirmation)
                        },
                    )
                }
                composable(AppRoute.AndroidReleases) {
                    val androidReleaseState by viewModel.androidReleaseState.collectAsStateWithLifecycle()
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    AndroidReleaseScreen(
                        state = androidReleaseState,
                        appUpdate = profileState.appUpdate,
                        canManage = profileState.user?.role == "super_admin",
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = { viewModel.loadAndroidReleases(force = true) },
                        onLoad = { viewModel.loadAndroidReleases() },
                        onSaveDraft = { versionName, notes ->
                            viewModel.saveAndroidReleaseDraft(versionName, notes)
                        },
                        onDispatchBuild = {
                            viewModel.dispatchAndroidBuild(onSensitiveActionConfirmation)
                        },
                        onDownload = viewModel::downloadAndroidRelease,
                        onInstallDownloaded = viewModel::installDownloadedAppUpdate,
                    )
                }
                composable(AppRoute.RegistryImages) {
                    val registryState by viewModel.registryImagesState.collectAsStateWithLifecycle()
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    RegistryImagesScreen(
                        state = registryState,
                        canManage = profileState.user?.role == "super_admin",
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onLoad = { viewModel.loadRegistryImages() },
                        onRefresh = { viewModel.loadRegistryImages(force = true) },
                        onToggle = viewModel::toggleRegistryImage,
                        onTogglePrefix = { prefix, selected -> viewModel.toggleRegistryImagePrefix(prefix, selected) },
                        onClearSelection = viewModel::clearRegistryImageSelection,
                        onDeleteSelected = { viewModel.deleteRegistryImages(onSensitiveActionConfirmation) },
                        onKeepCountChange = viewModel::updateRegistryImageKeepCount,
                        onIncludeUnknownChange = viewModel::updateRegistryImageIncludeUnknown,
                        onPrunePreview = viewModel::previewRegistryImagePrune,
                        onPruneConfirm = { viewModel.executeRegistryImagePrune(onSensitiveActionConfirmation) },
                        onPruneDismiss = viewModel::discardRegistryImagePlan,
                        onDismissFeedback = viewModel::clearRegistryImageFeedback,
                    )
                }
                composable(AppRoute.Search) {
                    val searchState by viewModel.globalSearchState.collectAsStateWithLifecycle()
                    GlobalSearchScreen(
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
                listOf(WorkspaceDestination.Today, WorkspaceDestination.Timetable, WorkspaceDestination.Campus, WorkspaceDestination.Todos).forEach { destination ->
                    composable(destination.route()) {
                        val todayState by viewModel.todayState.collectAsStateWithLifecycle()
                        val context = LocalContext.current
                        val calendarPermissions = remember {
                            arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
                        }
                        val calendarPermissionLauncher = rememberLauncherForActivityResult(
                            ActivityResultContracts.RequestMultiplePermissions(),
                        ) { result ->
                            if (calendarPermissions.all { result[it] == true }) {
                                viewModel.syncAndroidCalendar()
                            } else {
                                viewModel.reportCalendarPermissionDenied()
                            }
                        }
                        TodayScreen(
                            state = todayState,
                            contentPadding = contentPadding,
                            onBack = navigateBackFromSubScreen,
                            onRefresh = { viewModel.refreshCurrentWorkspace() },
                            onSaveTodo = viewModel::saveTodo,
                            onToggleTodo = viewModel::toggleTodo,
                            onDeleteTodo = viewModel::deleteTodo,
                            onSyncCalendar = {
                                if (calendarPermissions.all { permission ->
                                        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
                                    }
                                ) {
                                    viewModel.syncAndroidCalendar()
                                } else {
                                    calendarPermissionLauncher.launch(calendarPermissions)
                                }
                            },
                            onOpenNotifications = { navigateToTab(MainTab.Notifications) },
                            onOpenFreeClassrooms = {
                                navigateToSubScreen(AppRoute.FreeClassrooms)
                            },
                            onOpenReservation = {
                                navigateToSubScreen(AppRoute.Reservation)
                            },
                            onOpenLibrarySeatReservation = {
                                navigateToSubScreen(AppRoute.LibrarySeatReservation)
                            },
                            onOpenWaterValve = {
                                navigateToSubScreen(AppRoute.CampusWaterValve)
                            },
                            onConsumeSharedDraft = viewModel::consumeSharedTodoDraft,
                            initialSection = destination,
                        )
                    }
                }
                composable(AppRoute.DailyNews) {
                    val dailyNewsState by viewModel.dailyNewsState.collectAsStateWithLifecycle()
                    DailyNewsScreen(
                        state = dailyNewsState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel::refreshDailyNews,
                    )
                }
                composable(AppRoute.FreeClassrooms) {
                    val freeClassroomState by viewModel.freeClassroomState.collectAsStateWithLifecycle()
                    FreeClassroomScreen(
                        state = freeClassroomState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onQuery = viewModel::queryFreeClassrooms,
                    )
                }
                composable(AppRoute.CampusWaterValve) {
                    val waterValveState by viewModel.waterValveState.collectAsStateWithLifecycle()
                    WaterValveScreen(
                        state = waterValveState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = { force ->
                            viewModel.refreshWaterValve(force)
                            if (force) viewModel.refreshWaterBill(YearMonth.now().toString(), true)
                        },
                        onBind = viewModel::bindWaterValve,
                        onOpen = viewModel::openWaterValve,
                        onClose = viewModel::closeWaterValve,
                        onUnbind = viewModel::unbindWaterValve,
                        onReorder = viewModel::reorderWaterValves,
                        onQueryBill = viewModel::refreshWaterBill,
                        onClearFeedback = viewModel::clearWaterValveFeedback,
                    )
                }
                composable(AppRoute.Reservation) {
                    val reservationState by viewModel.reservations.state.collectAsStateWithLifecycle()
                    val context = LocalContext.current
                    ReservationScreen(
                        state = reservationState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel.reservations::refreshReservation,
                        onLoadSpaces = viewModel.reservations::loadReservationSpaces,
                        onLoadMyReservations = viewModel.reservations::loadMyReservations,
                        onOpenOfficialReservation = {
                            viewModel.openOfficialCampusReservation { session ->
                                openPlatformWebLink(
                                    context,
                                    session.url,
                                    "空间预约",
                                    initialCookies = session.cookies,
                                )
                            }
                        },
                        onRefreshIdentityCode = viewModel.reservations::refreshIdentityCode,
                        onQueryRulesAndAvailability = viewModel.reservations::queryReservationRulesAndAvailability,
                        onQuerySpacesByTime = viewModel.reservations::queryAvailableSpacesByTime,
                        onSubmitReservation = viewModel.reservations::submitReservation,
                        onLoadAutoTasks = viewModel.reservations::loadAutoReservationTasks,
                        onSaveAutoTask = viewModel.reservations::saveAutoReservationTask,
                        onToggleAutoTask = viewModel.reservations::toggleAutoReservationTask,
                        onDeleteAutoTask = viewModel.reservations::deleteAutoReservationTask,
                        onClearFeedback = viewModel.reservations::clearReservationFeedback,
                    )
                }
                composable(AppRoute.LibrarySeatReservation) {
                    val librarySeatState by viewModel.librarySeats.state.collectAsStateWithLifecycle()
                    val context = LocalContext.current
                    val initialTab = if (state.pendingLibrarySeatMyReservations) {
                        LibrarySeatTab.My
                    } else {
                        LibrarySeatTab.Book
                    }
                    LaunchedEffect(state.pendingLibrarySeatMyReservations) {
                        if (state.pendingLibrarySeatMyReservations) {
                            viewModel.consumePendingLibrarySeatMyReservations()
                        }
                    }
                    LibrarySeatReservationScreen(
                        state = librarySeatState,
                        initialTab = initialTab,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel.librarySeats::refreshLibrarySeat,
                        onLoadOverview = { force -> viewModel.librarySeats.loadLibrarySeatOverview(force) },
                        onInvalidateQuery = viewModel.librarySeats::clearLibrarySeatQuery,
                        onQueryAreas = { venueId, date, startMinute, endMinute, floorId, pageSize, power, window ->
                            viewModel.librarySeats.queryLibrarySeatAreas(
                                venueId = venueId,
                                date = date,
                                startMinute = startMinute,
                                endMinute = endMinute,
                                floorId = floorId,
                                pageSize = pageSize,
                                currentPage = 1,
                                power = power,
                                window = window,
                            )
                        },
                        onLoadSeats = viewModel.librarySeats::loadLibrarySeatSeats,
                        onQueryFloorSeats = viewModel.librarySeats::queryLibrarySeatFloorSeats,
                        onSubmitReservation = viewModel.librarySeats::submitLibrarySeatReservation,
                        onLoadReservations = viewModel.librarySeats::loadLibrarySeatReservations,
                        onLoadReservationHistory = viewModel.librarySeats::loadLibrarySeatReservationHistory,
                        onOpenOfficialReservation = {
                            viewModel.openOfficialLibrarySeatReservation { session ->
                                openPlatformWebLink(
                                    context,
                                    session.url,
                                    "座位预约",
                                    initialCookies = session.cookies,
                                )
                            }
                        },
                        onLoadWaitlists = viewModel.librarySeats::loadLibrarySeatWaitlists,
                        onCreateWaitlist = { request, onSuccess ->
                            viewModel.librarySeats.createLibrarySeatWaitlist(request, onSuccess)
                        },
                        onSetWaitlistEnabled = { taskId, enabled, onSuccess ->
                            viewModel.librarySeats.setLibrarySeatWaitlistEnabled(taskId, enabled, onSuccess)
                        },
                        onDeleteWaitlist = { taskId, onSuccess ->
                            viewModel.librarySeats.deleteLibrarySeatWaitlist(taskId, onSuccess)
                        },
                        onClearFeedback = viewModel.librarySeats::clearLibrarySeatFeedback,
                    )
                }
                composable(AppRoute.Scenes) {
                    val scenesState by viewModel.scenesState.collectAsStateWithLifecycle()
                    ScenesScreen(
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

            FloatingAssistantButton(
                anchorSize = assistantAnchorSize,
                visible = state.assistantButtonVisible,
                hidden = state.assistantOpen || settingsOpen || keyboardVisible,
                bottomInset = shellInsets.contentBottom,
                modifier = Modifier.align(Alignment.TopStart),
                onOpen = viewModel::openAssistant,
            )

            androidx.compose.animation.AnimatedVisibility(
                visible = !isTablet && !isSubScreen && !keyboardVisible,
                enter = slideInVertically(animationSpec = tween(160, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeIn(animationSpec = tween(160)),
                exit = slideOutVertically(animationSpec = tween(140, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeOut(animationSpec = tween(120)),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding(),
            ) {
                AppBottomNavigation(
                    selected = primaryTabForRoute(currentRoute) ?: state.selectedTab,
                    onSelect = navigateToTab,
                )
            }

            if (settingsOpen || initialSetupOpen) {
                AppSettingsDialog(
                    profile = settingsProfileState,
                    notificationsEnabled = notificationsEnabled,
                    themePreference = themePreference,
                    initialSetup = initialSetupOpen,
                    onRequestNotifications = onRequestNotifications,
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
                )
            }
        }
        }
    }
}
