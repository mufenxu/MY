package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.YearMonth

import cn.pxyb.mycontrol.util.QrUtils
import cn.pxyb.mycontrol.util.DateTimeUtils

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.components.feedback.AppOrbitLoader
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.autofill.AutofillNode
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalAutofill
import androidx.compose.ui.platform.LocalAutofillTree
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.core.content.ContextCompat
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.data.AssistantButtonPreferences
import cn.pxyb.mycontrol.data.AssistantPreferences
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.roundToInt

internal data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)
private enum class SecondFactorMode { Totp, RecoveryCode }

internal object AppRoute {
    const val Overview = "overview"
    const val Events = "events"
    const val Tools = "tools"
    const val Authenticator = "authenticator"
    const val Profile = "profile"
    const val Operations = "operations"
    const val Account = "account"
    const val GoogleAccounts = "google-accounts"
    const val GitHubProjects = "github-projects"
    const val AndroidReleases = "android-releases"
    const val RegistryImages = "registry-images"
    const val Projects = "projects"
    const val NotificationSettings = "notification-settings"
    const val LoginSessions = "login-sessions"
    const val Search = "search"
    const val Assistant = "assistant"
    const val Today = "today"
    const val Timetable = "timetable"
    const val Campus = "campus"
    const val Todos = "todos"
    const val FreeClassrooms = "free-classrooms"
    const val Reservation = "reservation"
    const val LibrarySeatReservation = "library-seat-reservation"
    const val CampusWaterValve = "campus-water-valve"
    const val Notifications = "notifications"
    const val DailyNews = "daily-news"
    const val Scenes = "scenes"
}

internal val appNavigationTabs = listOf(
    TabItem(MainTab.Overview, "今日", Icons.Outlined.Home),
    TabItem(MainTab.Operations, "状态", Icons.Outlined.Settings),
    TabItem(MainTab.Tools, "设备", Icons.Outlined.Hub),
    TabItem(MainTab.Profile, "我的", Icons.Outlined.Person),
)

private val tabs = appNavigationTabs

private fun MainTab.route(): String = when (this) {
    MainTab.Overview -> AppRoute.Overview
    MainTab.Notifications -> AppRoute.Notifications
    MainTab.Operations -> AppRoute.Operations
    MainTab.Tools -> AppRoute.Tools
    MainTab.Profile -> AppRoute.Profile
}

private fun WorkspaceDestination.route(): String = when (this) {
    WorkspaceDestination.Today -> AppRoute.Today
    WorkspaceDestination.Timetable -> AppRoute.Timetable
    WorkspaceDestination.Campus -> AppRoute.Campus
    WorkspaceDestination.Todos -> AppRoute.Todos
    WorkspaceDestination.Notifications -> AppRoute.Notifications
    WorkspaceDestination.Scenes -> AppRoute.Scenes
    WorkspaceDestination.Projects -> AppRoute.Projects
}

private fun AppEntryUiState.requestedRoute(): String = when {
    pendingLibrarySeatMyReservations -> AppRoute.LibrarySeatReservation
    workspaceDestination != null -> workspaceDestination.route()
    globalSearchOpen -> AppRoute.Search
    googleAccountDeskOpen -> AppRoute.GoogleAccounts
    githubProjectsOpen -> AppRoute.GitHubProjects
    accountManagementOpen -> AppRoute.Account
    assistantOpen -> AppRoute.Assistant
    else -> selectedTab.route()
}

private fun primaryTabForRoute(route: String?): MainTab? = when (route) {
    AppRoute.Overview, AppRoute.Search, AppRoute.Assistant,
    AppRoute.Today, AppRoute.Timetable, AppRoute.Campus, AppRoute.Todos,
    AppRoute.FreeClassrooms, AppRoute.Reservation, AppRoute.LibrarySeatReservation,
    AppRoute.CampusWaterValve, AppRoute.DailyNews, AppRoute.Notifications -> MainTab.Overview
    AppRoute.Operations, AppRoute.Projects, AppRoute.GitHubProjects,
    AppRoute.AndroidReleases, AppRoute.RegistryImages -> MainTab.Operations
    AppRoute.Tools, AppRoute.Scenes -> MainTab.Tools
    AppRoute.Profile, AppRoute.Account, AppRoute.GoogleAccounts,
    AppRoute.Authenticator, AppRoute.LoginSessions, AppRoute.NotificationSettings -> MainTab.Profile
    else -> null
}

internal fun parentTabForSubScreen(route: String?, previousRoute: String?): MainTab? = when (route) {
    AppRoute.GoogleAccounts -> primaryTabForRoute(previousRoute) ?: MainTab.Profile
    AppRoute.Account, AppRoute.Authenticator, AppRoute.LoginSessions,
    AppRoute.NotificationSettings -> MainTab.Profile
    AppRoute.Projects, AppRoute.GitHubProjects, AppRoute.AndroidReleases,
    AppRoute.RegistryImages -> MainTab.Operations
    AppRoute.Scenes -> MainTab.Tools
    AppRoute.Assistant, AppRoute.Notifications, AppRoute.Search,
    AppRoute.Today, AppRoute.Timetable, AppRoute.Campus, AppRoute.Todos,
    AppRoute.FreeClassrooms, AppRoute.Reservation, AppRoute.LibrarySeatReservation,
    AppRoute.CampusWaterValve, AppRoute.DailyNews -> MainTab.Overview
    else -> null
}

internal fun parentRouteForSubScreen(route: String?, previousRoute: String?): String? = when (route) {
    AppRoute.GitHubProjects, AppRoute.AndroidReleases, AppRoute.RegistryImages -> AppRoute.Projects
    AppRoute.LoginSessions -> AppRoute.Account
    AppRoute.NotificationSettings -> if (previousRoute == AppRoute.Notifications) AppRoute.Notifications else AppRoute.Profile
    else -> parentTabForSubScreen(route, previousRoute)?.route()
}

@Composable
fun MyControlApp(
    viewModel: AppViewModel,
    onBiometricUnlock: () -> Unit,
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
    var splashVisible by remember { mutableStateOf(true) }
    var splashExiting by remember { mutableStateOf(false) }
    var prewarmContent by remember { mutableStateOf(false) }
    var startupUpdateChecked by rememberSaveable { mutableStateOf(false) }
    var startupUpdatePrompted by rememberSaveable { mutableStateOf(false) }
    var startupUpdateDialogVisible by rememberSaveable { mutableStateOf(false) }
    val state by viewModel.entryState.collectAsStateWithLifecycle()
    val profileState by viewModel.profileState.collectAsStateWithLifecycle()

    // 底层主界面在开屏初期（180ms）静默启动并行预热，确保退场揭幕时 100% 满帧 0 掉帧
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(180)
        prewarmContent = true
    }

    // 主内容在开屏退场时的沉浸式景深聚焦渐入 (0.95f -> 1.0f, 0.75f -> 1.0f)
    val mainContentAlpha by animateFloatAsState(
        targetValue = if (splashExiting || !splashVisible) 1f else 0.75f,
        animationSpec = tween(durationMillis = 360, easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)),
        label = "mainContentAlpha",
    )

    val mainContentScale by animateFloatAsState(
        targetValue = if (splashExiting || !splashVisible) 1f else 0.95f,
        animationSpec = tween(durationMillis = 360, easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)),
        label = "mainContentScale",
    )

    val destination = when {
        state.booting -> "loading"
        state.locked -> "locked"
        state.user == null -> "login"
        else -> "app"
    }

    LaunchedEffect(destination, startupUpdateChecked, splashVisible) {
        if (destination == "app" && !splashVisible && !startupUpdateChecked && !BuildConfig.DEBUG) {
            startupUpdateChecked = true
            viewModel.checkAppUpdatesSilently()
        }
    }

    LaunchedEffect(destination, profileState.appUpdate.phase, startupUpdatePrompted, splashVisible) {
        if (destination == "app" && !splashVisible && shouldShowStartupUpdatePrompt(
                profileState.appUpdate.phase,
                isAuthenticated = true,
                hasPrompted = startupUpdatePrompted,
            )
        ) {
            startupUpdatePrompted = true
            startupUpdateDialogVisible = true
        }
    }

    ProvideAdaptiveWindowContext {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
        // 底层：主应用内容层（静默预热挂载，退场时伴随极致丝滑的景深微弹浮现）
        if (prewarmContent || !splashVisible) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .graphicsLayer {
                        alpha = mainContentAlpha
                        scaleX = mainContentScale
                        scaleY = mainContentScale
                    }
            ) {
                when (destination) {
                    "loading" -> FullScreenLoading()
                    "locked" -> LockScreen(onBiometricUnlock, viewModel::discardLockedSession, state.error)
                    "login" -> LoginScreen(
                        state = state,
                        onLogin = { username, password, factor, recovery ->
                            viewModel.login(username, password, factor, recovery, onSessionProtection)
                        },
                        onPasskeyLogin = { username ->
                            viewModel.loginWithPasskey(username, onPasskeyRequest, onSessionProtection)
                        },
                        onStartDeviceLogin = {
                            viewModel.startDeviceQrLogin(onSessionProtection)
                        },
                        onCancelDeviceLogin = viewModel::cancelDeviceQrLogin,
                        onBackFromSecondFactor = viewModel::resetSecondFactor,
                        onBotChallengeComplete = viewModel::completeBotChallenge,
                        onRecoverAccount = viewModel::recoverAccount,
                        onRecoveryCodesSaved = viewModel::acknowledgeLoginRecoveryCodes,
                    )
                    else -> CompositionLocalProvider(LocalAppNavigationHandlesBack provides true) {
                        AuthenticatedShell(
                        state,
                        viewModel,
                        onPasskeyRequest,
                        onPasskeyRegistrationRequest,
                        onBiometricConfirmation,
                        onSessionProtection,
                        onSensitiveActionConfirmation,
                        notificationsEnabled,
                        onRequestNotifications,
                        onWriteNfcScene,
                        themePreference,
                        onThemePreferenceChange,
                        showInitialSetup,
                        onInitialSetupComplete,
                        )
                    }
                }
            }
        }

        // 顶层：自适应智能感知就绪、纯 GPU 渲染的次世代极光流光开屏动效系统
        if (splashVisible) {
            ModernAnimatedSplashScreen(
                isDataReady = !state.booting,
                isExiting = splashExiting,
                onSplashFinished = { splashExiting = true },
                onSplashExitFinished = { splashVisible = false },
            )
        }

        if (startupUpdateDialogVisible && profileState.appUpdate.info != null) {
            StartupAppUpdateDialog(
                state = profileState.appUpdate,
                onDownloadAndInstall = viewModel::downloadAndInstallAppUpdate,
                onInstallDownloaded = viewModel::installDownloadedAppUpdate,
                onRetry = viewModel::checkAppUpdatesSilently,
                onDismiss = { startupUpdateDialogVisible = false },
            )
        }
    }
}
}

@Composable
private fun StartupAppUpdateDialog(
    state: AppUpdateUiState,
    onDownloadAndInstall: () -> Unit,
    onInstallDownloaded: () -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    val notes = state.info?.notes?.trim().orEmpty().ifBlank { "包含新的功能与稳定性改进。" }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.SystemUpdate,
        title = "发现新版本",
        subtitle = "v${state.info?.versionName.orEmpty()} · ${formatBytes(state.info?.apkSize ?: 0L)}",
        content = {
            Column {
                Text(
                    notes,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                when (state.phase) {
                    AppUpdatePhase.Downloading -> {
                        Spacer(Modifier.height(14.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "正在下载 ${state.progress}%，完成后将打开系统安装器",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    AppUpdatePhase.InstallPermissionRequired -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            "需要允许此来源安装应用。请在系统设置中开启权限，返回后继续安装。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppUpdatePhase.Installing -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            "系统安装器已打开，请按系统提示完成更新安装。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppUpdatePhase.Error -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            state.error ?: "更新检查或安装未完成，请稍后重试。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    else -> Unit
                }
            }
        },
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = if (state.phase in setOf(AppUpdatePhase.Downloading, AppUpdatePhase.Installing)) "后台继续" else "稍后再说",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = when (state.phase) {
                        AppUpdatePhase.Downloading -> "下载中 ${state.progress}%"
                        AppUpdatePhase.ReadyToInstall -> "打开安装器"
                        AppUpdatePhase.InstallPermissionRequired -> "继续安装"
                        AppUpdatePhase.Installing -> "等待安装"
                        AppUpdatePhase.Error -> "重新检查"
                        else -> "立即更新"
                    },
                    onClick = when (state.phase) {
                        AppUpdatePhase.Available -> onDownloadAndInstall
                        AppUpdatePhase.ReadyToInstall -> onInstallDownloaded
                        AppUpdatePhase.InstallPermissionRequired -> onInstallDownloaded
                        AppUpdatePhase.Error -> onRetry
                        else -> onDismiss
                    },
                    modifier = Modifier.weight(1f),
                    enabled = state.phase !in setOf(AppUpdatePhase.Downloading, AppUpdatePhase.Installing),
                    busy = state.phase == AppUpdatePhase.Downloading,
                )
            }
        },
    )
}

@Composable
private fun FullScreenLoading() {
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark()
            AppOrbitLoader(
                modifier = Modifier.padding(top = 26.dp),
                size = 30.dp,
                strokeWidth = 3.dp,
            )
        }
    }
}

@Composable
private fun LockScreen(onUnlock: () -> Unit, onUseLogin: () -> Unit, error: String?) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val backgroundColor = MaterialTheme.colorScheme.background
    val surfaceColor = MaterialTheme.colorScheme.surface

    LaunchedEffect(Unit) {
        onUnlock()
    }

    val backgroundBrush = remember(primaryColor, backgroundColor) {
        Brush.verticalGradient(
            colors = listOf(
                primaryColor.copy(alpha = 0.08f),
                backgroundColor,
                backgroundColor,
                primaryColor.copy(alpha = 0.05f),
            )
        )
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(backgroundBrush)
    ) {
        Box(
            modifier = Modifier
                .size(320.dp)
                .align(Alignment.TopCenter)
                .graphicsLayer {
                    translationY = -120f
                }
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.15f),
                            Color.Transparent,
                        )
                    ),
                    shape = CircleShape
                )
        )

        Column(
            modifier = Modifier
                .widthIn(max = 520.dp)
                .fillMaxSize()
                .align(Alignment.Center)
                .statusBarsPadding()
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 28.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                BrandMark(compact = true)
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Surface(
                    modifier = Modifier
                        .padding(bottom = 24.dp)
                        .size(76.dp),
                    shape = RoundedCornerShape(24.dp),
                    color = MaterialTheme.colorScheme.surface,
                    shadowElevation = 4.dp,
                    border = BorderStroke(1.dp, primaryColor.copy(alpha = 0.18f)),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Outlined.Fingerprint,
                            contentDescription = "指纹解锁",
                            tint = primaryColor,
                            modifier = Modifier.size(42.dp),
                        )
                    }
                }

                Text(
                    "欢迎回来",
                    style = MaterialTheme.typography.headlineMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 26.sp,
                        letterSpacing = 0.sp
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )

                Text(
                    "验证设备身份以继续使用",
                    style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.78f),
                    modifier = Modifier.padding(top = 6.dp),
                )

                if (!error.isNullOrBlank()) {
                    Surface(
                        modifier = Modifier.padding(top = 16.dp),
                        shape = MaterialTheme.shapes.small,
                        color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.6f),
                    ) {
                        Text(
                            error,
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }

                Spacer(Modifier.height(32.dp))

                PrimaryLoginButton(
                    text = "点击解锁",
                    onClick = onUnlock,
                    enabled = true,
                    loading = false,
                    icon = Icons.Outlined.Fingerprint,
                )

                Spacer(Modifier.height(12.dp))

                Surface(
                    onClick = onUseLogin,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(52.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = surfaceColor.copy(alpha = 0.6f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            "改用平台账号登录",
                            style = MaterialTheme.typography.labelLarge.copy(
                                fontWeight = FontWeight.Medium,
                                fontSize = 14.sp
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(ColorTokens.Green.foreground, CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                    Icon(
                        Icons.Outlined.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                        modifier = Modifier.size(13.dp)
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(
                        "MY Control · 会话已受安全保护",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                    )
                }
            }
        }
    }
}

@Composable
private fun LoginAmbientBackground() {
    val primaryColor = MaterialTheme.colorScheme.primary
    val backgroundColor = MaterialTheme.colorScheme.background

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        primaryColor.copy(alpha = 0.07f),
                        backgroundColor,
                        backgroundColor,
                        primaryColor.copy(alpha = 0.05f),
                    )
                )
            )
    ) {
        Box(
            modifier = Modifier
                .size(360.dp)
                .align(Alignment.TopEnd)
                .graphicsLayer {
                    translationX = 140f
                    translationY = -120f
                }
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.16f),
                            Color.Transparent,
                        )
                    ),
                    shape = CircleShape
                )
        )
        Box(
            modifier = Modifier
                .size(300.dp)
                .align(Alignment.BottomStart)
                .graphicsLayer {
                    translationX = -100f
                    translationY = 100f
                }
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.10f),
                            Color.Transparent,
                        )
                    ),
                    shape = CircleShape
                )
        )
    }
}

@Composable
private fun LoginHeader() {
    val primaryColor = MaterialTheme.colorScheme.primary
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier.size(76.dp),
            shape = RoundedCornerShape(22.dp),
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 4.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.12f)),
        ) {
            Box(contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.platform_logo),
                    contentDescription = "智控中心",
                    modifier = Modifier.size(52.dp),
                )
            }
        }

        Spacer(Modifier.height(18.dp))

        Text(
            "智控中心",
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 27.sp,
                letterSpacing = 0.sp,
            ),
            color = MaterialTheme.colorScheme.onBackground,
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 8.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = primaryColor.copy(alpha = 0.08f),
                border = BorderStroke(0.5.dp, primaryColor.copy(alpha = 0.18f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(ColorTokens.Green.foreground, CircleShape)
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "安全高效的设备管理平台",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun LoginScreen(
    state: AppEntryUiState,
    onLogin: (String, String, String, Boolean) -> Unit,
    onPasskeyLogin: (String) -> Unit,
    onStartDeviceLogin: (String) -> Unit,
    onCancelDeviceLogin: () -> Unit,
    onBackFromSecondFactor: () -> Unit,
    onBotChallengeComplete: (String) -> Unit,
    onRecoverAccount: (String, String) -> Unit,
    onRecoveryCodesSaved: () -> Unit,
) {
    var username by remember(state.suggestedUsername) { mutableStateOf(state.suggestedUsername) }
    var password by remember { mutableStateOf("") }
    var factor by remember { mutableStateOf("") }
    var factorMode by remember { mutableStateOf(SecondFactorMode.Totp) }
    var passwordVisible by remember { mutableStateOf(false) }
    var showBotChallenge by remember { mutableStateOf(false) }
    var showRecovery by remember { mutableStateOf(false) }
    LaunchedEffect(state.secondFactorRequired) {
        if (state.secondFactorRequired) {
            password = ""
            factor = ""
            factorMode = SecondFactorMode.Totp
        }
    }
    val focusManager = LocalFocusManager.current
    val submit = {
        focusManager.clearFocus()
        onLogin(username, password, factor, factorMode == SecondFactorMode.RecoveryCode)
    }

    val adaptive = LocalAdaptiveWindow.current
    val isExpanded = adaptive.isExpanded
    val showFooter = adaptive.heightSizeClass != WindowHeightSizeClass.Compact &&
        WindowInsets.ime.getBottom(LocalDensity.current) == 0

    if (showBotChallenge) LoginBotChallengeDialog(
        onDismiss = { showBotChallenge = false },
        onVerified = { token -> showBotChallenge = false; onBotChallengeComplete(token) },
    )
    if (showRecovery) AccountRecoveryDialog(state, onDismiss = { showRecovery = false }, onRecover = onRecoverAccount)
    if (state.loginRecoveryCodes.isNotEmpty()) RecoveryCodesDialog(state.loginRecoveryCodes, onRecoveryCodesSaved, requireAcknowledgement = true)

    Box(modifier = Modifier.fillMaxSize()) {
        LoginAmbientBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = if (isExpanded) 40.dp else 24.dp),
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
                if (isExpanded) {
                    Row(
                        modifier = Modifier
                            .widthIn(max = AppTabletContentMaxWidth)
                            .fillMaxSize()
                            .align(Alignment.Center)
                            .padding(vertical = 24.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(48.dp, Alignment.CenterHorizontally),
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .verticalScroll(rememberScrollState()),
                            contentAlignment = Alignment.Center,
                        ) {
                            LoginHeader()
                        }

                        Surface(
                            modifier = Modifier
                                .widthIn(max = 440.dp)
                                .weight(1f),
                            shape = AppCardShape,
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)),
                            shadowElevation = 2.dp,
                        ) {
                            Column(
                                modifier = Modifier
                                    .verticalScroll(rememberScrollState())
                                    .padding(horizontal = 24.dp, vertical = 24.dp),
                            ) {
                                if (!state.message.isNullOrBlank()) {
                                    FeedbackBanner(state.message, error = false, modifier = Modifier.padding(bottom = 14.dp))
                                }
                                if (!state.error.isNullOrBlank()) {
                                    FeedbackBanner(state.error, error = true, modifier = Modifier.padding(bottom = 14.dp))
                                }

                                if (!state.secondFactorRequired) {
                                    PrototypeInputField(
                                        value = username,
                                        onValueChange = { username = it },
                                        label = "账号",
                                        placeholder = "请输入您的账号",
                                        icon = Icons.Outlined.Person,
                                        enabled = !state.loginBusy,
                                        autofillType = AutofillType.Username,
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    )

                                    Spacer(Modifier.height(14.dp))

                                    PrototypeInputField(
                                        value = password,
                                        onValueChange = { password = it },
                                        label = "密码",
                                        placeholder = "请输入您的密码",
                                        icon = Icons.Outlined.Lock,
                                        enabled = !state.loginBusy,
                                        autofillType = AutofillType.Password,
                                        trailingIcon = {
                                            IconButton(
                                                onClick = { passwordVisible = !passwordVisible },
                                                modifier = Modifier.size(34.dp)
                                            ) {
                                                Icon(
                                                    if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                                    contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }
                                        },
                                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                        keyboardActions = KeyboardActions(onDone = { submit() }),
                                    )

                                    Spacer(Modifier.height(20.dp))

                                    PrimaryLoginButton(
                                        text = "登录",
                                        onClick = submit,
                                        enabled = !state.loginBusy && username.isNotBlank() && password.isNotBlank() && (!state.botChallengeRequired || state.botChallengeReady),
                                        loading = state.loginBusy,
                                    )

                                    if (state.botChallengeRequired) {
                                        Spacer(Modifier.height(12.dp))
                                        AppSecondaryButton(
                                            text = if (state.botChallengeReady) "人机验证已完成，可继续登录" else "完成人机验证",
                                            onClick = { showBotChallenge = true },
                                            enabled = !state.loginBusy,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                    if (state.androidPasskeySupported) {
                                        Spacer(Modifier.height(20.dp))
                                        PasskeyLoginMethod(
                                            enabled = !state.loginBusy && (!state.botChallengeRequired || state.botChallengeReady),
                                            onClick = {
                                                focusManager.clearFocus()
                                                onPasskeyLogin(username)
                                            },
                                        )
                                    }
                                    AppSecondaryButton(
                                        text = "使用账号恢复凭据",
                                        onClick = { showRecovery = true },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                                    )
                                    DeviceLoginSection(
                                        state = state,
                                        onStartDeviceLogin = onStartDeviceLogin,
                                        onCancelDeviceLogin = onCancelDeviceLogin,
                                    )
                                } else {
                                    state.loginEnrollment?.let { LoginTotpEnrollment(it) }
                                    if (state.recoveryCodeAllowed && state.loginEnrollment == null) {
                                        SecondFactorSelector(
                                            selected = factorMode,
                                            onSelect = {
                                                factorMode = it
                                                factor = ""
                                            },
                                        )
                                        Spacer(Modifier.height(14.dp))
                                    }
                                    PrototypeInputField(
                                        value = factor,
                                        onValueChange = {
                                            factor = if (factorMode == SecondFactorMode.Totp) {
                                                it.filter(Char::isDigit).take(6)
                                            } else {
                                                it.take(64)
                                            }
                                        },
                                        label = if (factorMode == SecondFactorMode.Totp) "动态验证码 (2FA)" else "恢复码",
                                        placeholder = if (factorMode == SecondFactorMode.Totp) "请输入6位动态验证码" else "请输入一组恢复码",
                                        icon = Icons.Outlined.Security,
                                        enabled = !state.loginBusy,
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = if (factorMode == SecondFactorMode.Totp) KeyboardType.NumberPassword else KeyboardType.Password,
                                            imeAction = ImeAction.Done,
                                        ),
                                        keyboardActions = KeyboardActions(onDone = { submit() }),
                                    )

                                    Spacer(Modifier.height(20.dp))

                                    PrimaryLoginButton(
                                        text = "验证并登录",
                                        onClick = submit,
                                        enabled = !state.loginBusy && (
                                            factorMode == SecondFactorMode.RecoveryCode && factor.isNotBlank()
                                                || factorMode == SecondFactorMode.Totp && factor.length == 6
                                            ),
                                        loading = state.loginBusy,
                                    )

                                    Spacer(Modifier.height(10.dp))
                                    AppSecondaryButton(
                                        text = "返回账号登录",
                                        icon = Icons.AutoMirrored.Outlined.ArrowBack,
                                        onClick = {
                                            focusManager.clearFocus()
                                            factor = ""
                                            factorMode = SecondFactorMode.Totp
                                            onBackFromSecondFactor()
                                        },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                        }
                    }
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .verticalScroll(rememberScrollState())
                            .heightIn(min = maxHeight)
                            .padding(vertical = 24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        LoginHeader()

                        Spacer(Modifier.height(26.dp))

                        Surface(
                            modifier = Modifier
                                .widthIn(max = 440.dp)
                                .fillMaxWidth(),
                            shape = AppCardShape,
                            color = MaterialTheme.colorScheme.surface,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)),
                            shadowElevation = 2.dp,
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 20.dp, vertical = 22.dp)
                            ) {
                                if (!state.message.isNullOrBlank()) {
                                    FeedbackBanner(state.message, error = false, modifier = Modifier.padding(bottom = 14.dp))
                                }
                                if (!state.error.isNullOrBlank()) {
                                    FeedbackBanner(state.error, error = true, modifier = Modifier.padding(bottom = 14.dp))
                                }

                                if (!state.secondFactorRequired) {
                                    PrototypeInputField(
                                        value = username,
                                        onValueChange = { username = it },
                                        label = "账号",
                                        placeholder = "请输入您的账号",
                                        icon = Icons.Outlined.Person,
                                        enabled = !state.loginBusy,
                                        autofillType = AutofillType.Username,
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                                    )

                                    Spacer(Modifier.height(14.dp))

                                    PrototypeInputField(
                                        value = password,
                                        onValueChange = { password = it },
                                        label = "密码",
                                        placeholder = "请输入您的密码",
                                        icon = Icons.Outlined.Lock,
                                        enabled = !state.loginBusy,
                                        autofillType = AutofillType.Password,
                                        trailingIcon = {
                                            IconButton(
                                                onClick = { passwordVisible = !passwordVisible },
                                                modifier = Modifier.size(34.dp)
                                            ) {
                                                Icon(
                                                    if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                                    contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                    modifier = Modifier.size(18.dp)
                                                )
                                            }
                                        },
                                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                                        keyboardActions = KeyboardActions(onDone = { submit() }),
                                    )

                                    Spacer(Modifier.height(20.dp))

                                    PrimaryLoginButton(
                                        text = "登录",
                                        onClick = submit,
                                        enabled = !state.loginBusy && username.isNotBlank() && password.isNotBlank() && (!state.botChallengeRequired || state.botChallengeReady),
                                        loading = state.loginBusy,
                                    )

                                    if (state.botChallengeRequired) {
                                        Spacer(Modifier.height(12.dp))
                                        AppSecondaryButton(
                                            text = if (state.botChallengeReady) "人机验证已完成，可继续登录" else "完成人机验证",
                                            onClick = { showBotChallenge = true },
                                            enabled = !state.loginBusy,
                                            modifier = Modifier.fillMaxWidth(),
                                        )
                                    }
                                    if (state.androidPasskeySupported) {
                                        Spacer(Modifier.height(20.dp))
                                        PasskeyLoginMethod(
                                            enabled = !state.loginBusy && (!state.botChallengeRequired || state.botChallengeReady),
                                            onClick = {
                                                focusManager.clearFocus()
                                                onPasskeyLogin(username)
                                            },
                                        )
                                    }
                                    AppSecondaryButton(
                                        text = "使用账号恢复凭据",
                                        onClick = { showRecovery = true },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                                    )
                                    DeviceLoginSection(
                                        state = state,
                                        onStartDeviceLogin = onStartDeviceLogin,
                                        onCancelDeviceLogin = onCancelDeviceLogin,
                                    )
                                } else {
                                    state.loginEnrollment?.let { LoginTotpEnrollment(it) }
                                    if (state.recoveryCodeAllowed && state.loginEnrollment == null) {
                                        SecondFactorSelector(
                                            selected = factorMode,
                                            onSelect = {
                                                factorMode = it
                                                factor = ""
                                            },
                                        )
                                        Spacer(Modifier.height(14.dp))
                                    }
                                    PrototypeInputField(
                                        value = factor,
                                        onValueChange = {
                                            factor = if (factorMode == SecondFactorMode.Totp) {
                                                it.filter(Char::isDigit).take(6)
                                            } else {
                                                it.take(64)
                                            }
                                        },
                                        label = if (factorMode == SecondFactorMode.Totp) "动态验证码 (2FA)" else "恢复码",
                                        placeholder = if (factorMode == SecondFactorMode.Totp) "请输入6位动态验证码" else "请输入一组恢复码",
                                        icon = Icons.Outlined.Security,
                                        enabled = !state.loginBusy,
                                        keyboardOptions = KeyboardOptions(
                                            keyboardType = if (factorMode == SecondFactorMode.Totp) KeyboardType.NumberPassword else KeyboardType.Password,
                                            imeAction = ImeAction.Done,
                                        ),
                                        keyboardActions = KeyboardActions(onDone = { submit() }),
                                    )

                                    Spacer(Modifier.height(20.dp))

                                    PrimaryLoginButton(
                                        text = "验证并登录",
                                        onClick = submit,
                                        enabled = !state.loginBusy && (
                                            factorMode == SecondFactorMode.RecoveryCode && factor.isNotBlank()
                                                || factorMode == SecondFactorMode.Totp && factor.length == 6
                                            ),
                                        loading = state.loginBusy,
                                    )

                                    Spacer(Modifier.height(10.dp))
                                    AppSecondaryButton(
                                        text = "返回账号登录",
                                        icon = Icons.AutoMirrored.Outlined.ArrowBack,
                                        onClick = {
                                            focusManager.clearFocus()
                                            factor = ""
                                            factorMode = SecondFactorMode.Totp
                                            onBackFromSecondFactor()
                                        },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth(),
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (showFooter) {
                Spacer(Modifier.height(12.dp))
                LoginFooter()
                Spacer(Modifier.height(20.dp))
            }
        }
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun PrototypeInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    icon: ImageVector,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    autofillType: AutofillType? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    var isFocused by remember { mutableStateOf(false) }
    val autofill = LocalAutofill.current
    val autofillTree = LocalAutofillTree.current
    val currentOnValueChange by rememberUpdatedState(onValueChange)
    val autofillNode = remember(autofillType) {
        autofillType?.let { type ->
            AutofillNode(autofillTypes = listOf(type), onFill = { currentOnValueChange(it) })
        }
    }
    if (autofillNode != null) {
        DisposableEffect(autofillTree, autofillNode) {
            autofillTree += autofillNode
            onDispose { autofillTree.children.remove(autofillNode.id) }
        }
    }

    val primaryColor = MaterialTheme.colorScheme.primary
    val containerBgColor = if (isFocused) {
        MaterialTheme.colorScheme.surfaceContainerHigh
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.32f)
    }
    val iconColor = if (isFocused) primaryColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f)
    val borderColor = if (isFocused) {
        primaryColor
    } else {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)
    }
    val fieldShape = RoundedCornerShape(16.dp)

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp
            ),
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.85f),
            modifier = Modifier.padding(bottom = 7.dp, start = 2.dp)
        )

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = fieldShape,
            color = containerBgColor,
            border = BorderStroke(if (isFocused) 1.5.dp else 1.dp, borderColor),
            shadowElevation = if (isFocused) 3.dp else 0.dp,
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(20.dp)
                )

                Spacer(Modifier.width(12.dp))

                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight(),
                    contentAlignment = Alignment.CenterStart
                ) {
                    if (value.isEmpty()) {
                        Text(
                            placeholder,
                            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 15.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
                        )
                    }
                    BasicTextField(
                        value = value,
                        onValueChange = onValueChange,
                        modifier = Modifier
                            .fillMaxWidth()
                            .onGloballyPositioned { coordinates ->
                                autofillNode?.boundingBox = coordinates.boundsInWindow()
                            }
                            .onFocusChanged { focusState ->
                                isFocused = focusState.isFocused
                                autofillNode?.let { node ->
                                    if (focusState.isFocused) autofill?.requestAutofillForNode(node)
                                    else autofill?.cancelAutofillForNode(node)
                                }
                            },
                        singleLine = true,
                        enabled = enabled,
                        visualTransformation = visualTransformation,
                        keyboardOptions = keyboardOptions,
                        keyboardActions = keyboardActions,
                        textStyle = MaterialTheme.typography.bodyMedium.copy(
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        cursorBrush = SolidColor(primaryColor)
                    )
                }

                if (value.isNotEmpty() && enabled && trailingIcon == null) {
                    IconButton(
                        onClick = { onValueChange("") },
                        modifier = Modifier.size(30.dp)
                    ) {
                        Icon(
                            Icons.Outlined.Cancel,
                            contentDescription = "清空",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f),
                            modifier = Modifier.size(17.dp)
                        )
                    }
                }

                trailingIcon?.invoke()
            }
        }
    }
}

@Composable
private fun SecondFactorSelector(selected: SecondFactorMode, onSelect: (SecondFactorMode) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.medium,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
    ) {
        Row(modifier = Modifier.padding(3.dp)) {
            SecondFactorMode.entries.forEach { mode ->
                val active = selected == mode
                Surface(
                    onClick = { onSelect(mode) },
                    modifier = Modifier.weight(1f).height(38.dp),
                    shape = MaterialTheme.shapes.small,
                    color = if (active) MaterialTheme.colorScheme.primaryContainer else Color.Transparent,
                    border = if (active) BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)) else null,
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            if (mode == SecondFactorMode.Totp) "动态验证码" else "恢复码",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                            color = if (active) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceLoginSection(
    state: AppEntryUiState,
    onStartDeviceLogin: (String) -> Unit,
    onCancelDeviceLogin: () -> Unit,
) {
    if (!state.deviceLoginQrDataUrl.isNullOrBlank()) {
        val qrBitmap = remember(state.deviceLoginQrDataUrl) {
            QrUtils.decodeDataUrlToBitmap(state.deviceLoginQrDataUrl)
        }
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    "等待已登录设备确认",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                )
                Text(
                    "对方设备将使用 Passkey 验证，确认后本机自动登录",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(14.dp))
                Surface(
                    shape = RoundedCornerShape(18.dp),
                    color = Color.White,
                ) {
                    if (qrBitmap != null) {
                        Image(
                            bitmap = qrBitmap,
                            contentDescription = "跨设备登录二维码",
                            modifier = Modifier.size(204.dp).padding(8.dp),
                        )
                    } else {
                        Text(
                            "二维码加载失败",
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.size(204.dp).padding(8.dp),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "二维码 90 秒内有效，仅可用于本次登录",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onCancelDeviceLogin) {
                    Text("取消跨设备登录")
                }
            }
        }
        return
    }

    if (!state.deviceLoginError.isNullOrBlank()) {
        Text(
            state.deviceLoginError,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            modifier = Modifier.padding(top = 8.dp),
        )
    }

    Spacer(Modifier.height(10.dp))
    AppSecondaryButton(
        text = "Passkey 跨设备登录",
        icon = Icons.Outlined.Fingerprint,
        onClick = { onStartDeviceLogin("passkey") },
        enabled = state.androidPasskeySupported && !state.loginBusy && !state.deviceLoginBusy,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun PasskeyLoginMethod(enabled: Boolean, onClick: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.15f)))
            Text(
                "其他登录方式",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                modifier = Modifier.padding(horizontal = 14.dp),
            )
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.15f)))
        }
        Spacer(Modifier.height(14.dp))
        AppSecondaryButton(
            text = "使用 Passkey 快捷登录",
            icon = Icons.Outlined.Fingerprint,
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun LoginFooter() {
    var showPrivacyPolicy by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Outlined.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(12.dp)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                "© 2026 智控中心 · 安全传输已加密",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
            )
        }
        Text(
            "系统版本 v${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.padding(top = 3.dp)
        )
        Text(
            "登录即代表你已阅读并同意《隐私政策》",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
            modifier = Modifier.padding(top = 6.dp).clickable { showPrivacyPolicy = true },
        )
    }

    if (showPrivacyPolicy) {
        PrivacyPolicyDialog(onDismiss = { showPrivacyPolicy = false })
    }
}

@Composable
private fun PrimaryLoginButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean,
    loading: Boolean,
    modifier: Modifier = Modifier,
    icon: ImageVector? = Icons.Outlined.Lock,
) {
    AppButton(
        text = text,
        icon = icon,
        onClick = onClick,
        enabled = enabled,
        loading = loading,
        height = 50.dp,
        modifier = modifier.fillMaxWidth(),
    )
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(
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
    Scaffold(
        modifier = Modifier.fillMaxSize(),
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
                    modifier = Modifier
                        .widthIn(max = AppTabletContentMaxWidth)
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

@Composable
private fun FloatingAssistantButton(
    anchorSize: IntSize,
    visible: Boolean,
    hidden: Boolean,
    bottomInset: Dp,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
) {
    if (!visible || hidden || anchorSize.width == 0 || anchorSize.height == 0) return

    val context = LocalContext.current
    val preferences = remember { AssistantPreferences(context) }
    val initial = remember { preferences.read() }

    val density = LocalDensity.current
    val buttonSizePx = with(density) { 54.dp.toPx() }
    val handleWidthPx = with(density) { 7.dp.toPx() }
    val handleHeightPx = with(density) { 46.dp.toPx() }
    val marginPx = with(density) { 14.dp.toPx() }
    val edgeSnapPx = with(density) { 44.dp.toPx() }
    val slopPx = with(density) { 6.dp.toPx() }
    val bottomInsetPx = with(density) { bottomInset.toPx() }

    val boxW = anchorSize.width.toFloat()
    val boxH = anchorSize.height.toFloat()

    var xRatio by remember { mutableFloatStateOf(0f) }
    var yRatio by remember { mutableFloatStateOf(0f) }
    var collapsedSide by remember { mutableIntStateOf(initial.collapsedSide) }
    var initialized by remember { mutableStateOf(false) }

    LaunchedEffect(anchorSize) {
        if (!initialized && anchorSize.width > 0 && anchorSize.height > 0) {
            xRatio = if (initial.xRatio >= 1f) {
                ((boxW - marginPx - buttonSizePx / 2f) / boxW).coerceIn(0.02f, 0.98f)
            } else {
                initial.xRatio
            }
            yRatio = if (initial.yRatio >= 1f) {
                ((boxH - bottomInsetPx - buttonSizePx / 2f - marginPx) / boxH).coerceIn(0.02f, 0.98f)
            } else {
                initial.yRatio
            }
            initialized = true
        }
    }
    if (!initialized) return

    fun currentCenterX(): Float = when (collapsedSide) {
        1 -> handleWidthPx / 2f
        2 -> boxW - handleWidthPx / 2f
        else -> (xRatio * boxW).coerceIn(handleWidthPx, boxW - handleWidthPx)
    }

    fun currentCenterY(): Float =
        (yRatio * boxH).coerceIn(handleHeightPx / 2f + marginPx, boxH - handleHeightPx / 2f - marginPx)

    fun persistPosition() {
        preferences.write(
            AssistantButtonPreferences(
                visible = visible,
                xRatio = xRatio,
                yRatio = yRatio,
                collapsedSide = collapsedSide,
            ),
        )
    }

    fun expandFromEdge() {
        val side = collapsedSide
        collapsedSide = 0
        xRatio = when (side) {
            1 -> ((handleWidthPx + buttonSizePx / 2f + marginPx) / boxW).coerceIn(0.02f, 0.98f)
            else -> ((boxW - handleWidthPx - buttonSizePx / 2f - marginPx) / boxW).coerceIn(0.02f, 0.98f)
        }
        persistPosition()
    }

    fun snapAndPersist() {
        val currentX = currentCenterX()
        val nextCollapsed = when {
            currentX <= edgeSnapPx -> 1
            currentX >= boxW - edgeSnapPx -> 2
            else -> 0
        }
        collapsedSide = nextCollapsed
        persistPosition()
    }

    val gestureModifier = Modifier.pointerInput(anchorSize) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            var totalDrag = 0f
            var isDrag = false
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) {
                    if (!isDrag) {
                        if (collapsedSide != 0) {
                            expandFromEdge()
                        } else {
                            onOpen()
                        }
                    } else {
                        snapAndPersist()
                    }
                    break
                }
                if (!isDrag) {
                    totalDrag += abs(change.position.x - change.previousPosition.x) +
                        abs(change.position.y - change.previousPosition.y)
                    if (totalDrag > slopPx) {
                        isDrag = true
                        if (collapsedSide != 0) {
                            val side = collapsedSide
                            collapsedSide = 0
                            xRatio = when (side) {
                                1 -> ((handleWidthPx + buttonSizePx / 2f + marginPx) / boxW).coerceIn(0.02f, 0.98f)
                                else -> ((boxW - handleWidthPx - buttonSizePx / 2f - marginPx) / boxW).coerceIn(0.02f, 0.98f)
                            }
                        }
                    }
                }
                if (isDrag) {
                    change.consume()
                    xRatio = ((change.position.x + currentCenterX() - buttonSizePx / 2f) / boxW).coerceIn(0.02f, 0.98f)
                    yRatio = ((change.position.y + currentCenterY() - buttonSizePx / 2f) / boxH).coerceIn(0.02f, 0.98f)
                }
            }
        }
    }

    val centerX = currentCenterX()
    val centerY = currentCenterY()

    val pulse = rememberInfiniteTransition(label = "assistantButtonPulse")
    val pulseProgress by pulse.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "assistantButtonPulseProgress",
    )

    val primary = MaterialTheme.colorScheme.primary
    val secondary = MaterialTheme.colorScheme.secondary

    Box(
        modifier = modifier
            .zIndex(1f)
            .offset {
                IntOffset(
                    (centerX - buttonSizePx / 2f).roundToInt(),
                    (centerY - buttonSizePx / 2f).roundToInt(),
                )
            }
            .size(54.dp)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                stateDescription = if (collapsedSide == 0) "已展开，可拖动" else "已收纳在屏幕边缘"
                onClick(label = if (collapsedSide == 0) "打开 AI 小助手" else "展开 AI 小助手") {
                    if (collapsedSide != 0) expandFromEdge() else onOpen()
                    true
                }
                customActions = listOf(
                    CustomAccessibilityAction("收纳到左侧") { collapsedSide = 1; persistPosition(); true },
                    CustomAccessibilityAction("收纳到右侧") { collapsedSide = 2; persistPosition(); true },
                )
            }
            .then(gestureModifier),
    ) {
        if (collapsedSide != 0) {
            // 边缘收纳：与主按钮同色系的渐变胶囊把手，带星芒图标
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(width = 18.dp, height = 42.dp)
                        .shadow(4.dp, RoundedCornerShape(50), clip = false)
                        .background(
                            Brush.linearGradient(listOf(primary, secondary)),
                            RoundedCornerShape(50),
                        )
                        .border(0.8.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(50)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AutoAwesome,
                        contentDescription = "展开 AI 小助手",
                        tint = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.95f),
                        modifier = Modifier.size(13.dp),
                    )
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                // 柔光呼吸（蓝色系，与工作台主色调一致）
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .graphicsLayer {
                            val glowScale = 1f + pulseProgress * 0.16f
                            scaleX = glowScale
                            scaleY = glowScale
                            alpha = 0.4f * (1f - pulseProgress * 0.55f)
                        }
                        .background(
                            Brush.radialGradient(
                                listOf(primary.copy(alpha = 0.55f), Color.Transparent),
                            ),
                            CircleShape,
                        ),
                )
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .graphicsLayer {
                            val buttonScale = 1f + pulseProgress * 0.035f
                            scaleX = buttonScale
                            scaleY = buttonScale
                        }
                        .shadow(8.dp, CircleShape, clip = false)
                        .background(
                            Brush.linearGradient(listOf(primary, secondary)),
                            CircleShape,
                        )
                        .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AutoAwesome,
                        contentDescription = "AI 小助手",
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun AppSettingsDialog(
    profile: ProfileUiState,
    notificationsEnabled: Boolean,
    themePreference: AppThemePreference,
    initialSetup: Boolean,
    onRequestNotifications: () -> Unit,
    onForceFullSync: () -> Unit,
    onThemePreferenceChange: (AppThemePreference) -> Unit,
    onDismiss: () -> Unit,
) {
    val syncStates = profile.sectionLoadStates.values
    val refreshingCount = syncStates.count(SectionLoadState::refreshing)
    val failedCount = syncStates.count { !it.error.isNullOrBlank() }
    val latestSync = syncStates.mapNotNull(SectionLoadState::updatedAtMillis).maxOrNull()
    AppDialog(
        onDismissRequest = onDismiss,
        icon = if (initialSetup) Icons.Outlined.CheckCircle else Icons.Outlined.Settings,
        title = if (initialSetup) "完成初始配置" else "应用设置",
        subtitle = if (initialSetup) "确认外观、通知与数据同步状态" else "外观、权限与同步集中管理",
        footer = {
            AppDialogPrimaryButton(
                text = if (initialSetup) "完成配置" else "完成",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        SettingsSectionTitle(Icons.Outlined.DarkMode, "外观")
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            listOf(
                AppThemePreference.System to "跟随系统",
                AppThemePreference.Light to "浅色",
                AppThemePreference.Dark to "深色",
            ).forEach { (preference, label) ->
                val selected = themePreference == preference
                Surface(
                    onClick = { onThemePreferenceChange(preference) },
                    modifier = Modifier.weight(1f).height(48.dp),
                    shape = RoundedCornerShape(16.dp),
                    color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                    contentColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
                    border = BorderStroke(
                        1.dp,
                        if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.35f) else MaterialTheme.colorScheme.outlineVariant,
                    ),
                ) {
                    Box(Modifier.fillMaxSize().padding(horizontal = 6.dp), contentAlignment = Alignment.Center) {
                        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
        }

        SettingsSectionTitle(Icons.Outlined.NotificationsActive, "通知")
        SettingsStatusRow(
            title = "系统通知权限",
            detail = if (notificationsEnabled) "已开启" else "未开启",
            healthy = notificationsEnabled,
            actionLabel = if (notificationsEnabled) null else "去开启",
            onAction = onRequestNotifications,
        )

        SettingsSectionTitle(Icons.Outlined.CloudSync, "数据同步")
        SettingsStatusRow(
            title = when {
                refreshingCount > 0 -> "$refreshingCount 个模块正在同步"
                failedCount > 0 -> "$failedCount 个模块同步异常"
                else -> "后台同步正常"
            },
            detail = listOfNotNull(
                latestSync?.let(::relativeSyncTime),
                profile.pendingTodoMutations.takeIf { it > 0 }?.let { "$it 项待办等待上传" },
                if (profile.offlineMode) "当前使用离线数据" else null,
            ).ifEmpty { listOf("等待首次同步记录") }.joinToString(" · "),
            healthy = failedCount == 0 && !profile.offlineMode,
            actionLabel = if (refreshingCount == 0) "立即同步" else null,
            onAction = onForceFullSync,
        )
    }
}

@Composable
private fun SettingsSectionTitle(icon: ImageVector, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SettingsStatusRow(
    title: String,
    detail: String,
    healthy: Boolean,
    actionLabel: String?,
    onAction: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                if (healthy) Icons.Outlined.CheckCircle else Icons.Outlined.Cancel,
                contentDescription = null,
                tint = if (healthy) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            actionLabel?.let { label ->
                TextButton(onClick = onAction) { Text(label) }
            }
        }
    }
}

private fun relativeSyncTime(timestamp: Long): String =
    DateTimeUtils.formatRelativeSyncTime(timestamp)

@Composable
private fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val glass = rememberGlassPalette(radius = 31.dp)
    Surface(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .widthIn(max = 420.dp)
            .fillMaxWidth()
            .height(62.dp)
            .glassPanel(glass),
        color = Color.Transparent,
        shape = glass.shape,
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 6.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            tabs.forEach { item -> BottomNavigationItem(item, selected == item.tab) { onSelect(item.tab) } }
        }
    }
}

@Composable
private fun RowScope.BottomNavigationItem(item: TabItem, selected: Boolean, onClick: () -> Unit) {
    val primaryColor = MaterialTheme.colorScheme.primary
    val itemShape = RoundedCornerShape(22.dp)
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val haptics = LocalHapticFeedback.current

    val foreground by animateColorAsState(
        targetValue = if (selected) primaryColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "nav-color",
    )
    val background by animateColorAsState(
        targetValue = if (selected) primaryColor.copy(alpha = 0.12f) else Color.Transparent,
        animationSpec = tween(180, easing = FastOutSlowInEasing),
        label = "nav-background",
    )

    val targetScale = when {
        isPressed -> 0.88f
        selected -> 1.10f
        else -> 1.0f
    }
    val iconScale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "nav-icon-scale",
    )

    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .clip(itemShape)
            .background(background)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Tab,
                onClickLabel = item.label,
                onClick = {
                    AppHaptics.tick(haptics)
                    onClick()
                },
            )
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            item.icon,
            contentDescription = item.label,
            tint = foreground,
            modifier = Modifier
                .size(21.dp)
                .graphicsLayer {
                    scaleX = iconScale
                    scaleY = iconScale
                },
        )
        Text(
            item.label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                fontSize = 11.sp
            ),
            color = foreground,
            modifier = Modifier.padding(top = 3.dp),
        )
    }
}

@Composable
private fun BrandMark(compact: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 4.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
        ) {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.platform_logo),
                contentDescription = "智控中心",
                modifier = Modifier
                    .padding(6.dp)
                    .size(if (compact) 32.dp else 40.dp),
            )
        }
        Column {
            Text(
                "智控中心",
                style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
            if (!compact) Text(
                "SMART CONTROL CENTER",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
