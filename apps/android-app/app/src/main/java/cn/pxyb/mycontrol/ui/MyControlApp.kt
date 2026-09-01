package cn.pxyb.mycontrol.ui

import android.graphics.BitmapFactory
import android.Manifest
import android.content.pm.PackageManager
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.autofill.AutofillNode
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalAutofill
import androidx.compose.ui.platform.LocalAutofillTree
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.content.ContextCompat
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.AppThemePreference
import kotlinx.coroutines.delay
import kotlin.math.abs

internal data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)
private enum class SecondFactorMode { Totp, RecoveryCode }

internal object AppRoute {
    const val Overview = "overview"
    const val Events = "events"
    const val Tools = "tools"
    const val Profile = "profile"
    const val Operations = "operations"
    const val Account = "account"
    const val GoogleAccounts = "google-accounts"
    const val Search = "search"
    const val Today = "today"
    const val FreeClassrooms = "free-classrooms"
    const val Reservation = "reservation"
    const val LibrarySeatReservation = "library-seat-reservation"
    const val Notifications = "notifications"
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

private fun AppEntryUiState.requestedRoute(): String = when {
    workspaceDestination == WorkspaceDestination.Today -> AppRoute.Today
    workspaceDestination == WorkspaceDestination.Notifications -> AppRoute.Notifications
    workspaceDestination == WorkspaceDestination.Scenes -> AppRoute.Scenes
    globalSearchOpen -> AppRoute.Search
    googleAccountDeskOpen -> AppRoute.GoogleAccounts
    accountManagementOpen -> AppRoute.Account
    else -> selectedTab.route()
}

private fun primaryTabForRoute(route: String?): MainTab? = when (route) {
    AppRoute.Overview,
    AppRoute.Search,
    AppRoute.Today,
    AppRoute.FreeClassrooms,
    AppRoute.Reservation,
    AppRoute.LibrarySeatReservation,
    AppRoute.Scenes -> MainTab.Overview
    AppRoute.Notifications -> MainTab.Overview
    AppRoute.Operations -> MainTab.Operations
    AppRoute.Tools -> MainTab.Tools
    AppRoute.Profile,
    AppRoute.Account -> MainTab.Profile
    else -> null
}

internal fun parentTabForSubScreen(route: String?, previousRoute: String?): MainTab? = when (route) {
    AppRoute.GoogleAccounts -> primaryTabForRoute(previousRoute) ?: MainTab.Profile
    AppRoute.Account -> MainTab.Profile
    AppRoute.Notifications,
    AppRoute.Search,
    AppRoute.Today,
    AppRoute.FreeClassrooms,
    AppRoute.Reservation,
    AppRoute.LibrarySeatReservation,
    AppRoute.Scenes -> MainTab.Overview
    else -> null
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
    val state by viewModel.entryState.collectAsStateWithLifecycle()

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
                    )
                    else -> AuthenticatedShell(
                        state,
                        viewModel,
                        onPasskeyRequest,
                        onPasskeyRegistrationRequest,
                        onBiometricConfirmation,
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

        // 顶层：自适应智能感知就绪、纯 GPU 渲染的次世代极光流光开屏动效系统
        if (splashVisible) {
            ModernAnimatedSplashScreen(
                isDataReady = !state.booting,
                isExiting = splashExiting,
                onSplashFinished = { splashExiting = true },
                onSplashExitFinished = { splashVisible = false },
            )
        }
    }
}
}

@Composable
private fun FullScreenLoading() {
    Box(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark()
            CircularProgressIndicator(
                modifier = Modifier.padding(top = 26.dp).size(24.dp),
                strokeWidth = 2.5.dp,
                color = MaterialTheme.colorScheme.primary,
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
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
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
                            .background(Color(0xFF10B981), CircleShape)
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
            color = Color.White,
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
                            .background(Color(0xFF10B981), CircleShape)
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
) {
    var username by remember(state.suggestedUsername) { mutableStateOf(state.suggestedUsername) }
    var password by remember { mutableStateOf("") }
    var factor by remember { mutableStateOf("") }
    var factorMode by remember { mutableStateOf(SecondFactorMode.Totp) }
    var passwordVisible by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    val submit = {
        focusManager.clearFocus()
        onLogin(username, password, factor, factorMode == SecondFactorMode.RecoveryCode)
    }

    val adaptive = LocalAdaptiveWindow.current
    val isExpanded = adaptive.isExpanded

    Box(modifier = Modifier.fillMaxSize()) {
        LoginAmbientBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
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
                            .fillMaxSize()
                            .padding(vertical = 24.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(48.dp, Alignment.CenterHorizontally),
                    ) {
                        Box(
                            modifier = Modifier.weight(1f),
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
                                modifier = Modifier.padding(horizontal = 24.dp, vertical = 24.dp)
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
                                                    tint = Color(0xFF94A3B8),
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
                                        enabled = !state.loginBusy && username.isNotBlank() && password.isNotBlank(),
                                        loading = state.loginBusy,
                                    )

                                    if (state.androidPasskeySupported) {
                                        Spacer(Modifier.height(20.dp))
                                        PasskeyLoginMethod(
                                            enabled = !state.loginBusy,
                                            onClick = {
                                                focusManager.clearFocus()
                                                onPasskeyLogin(username)
                                            },
                                        )
                                    }
                                    DeviceLoginSection(
                                        state = state,
                                        onStartDeviceLogin = onStartDeviceLogin,
                                        onCancelDeviceLogin = onCancelDeviceLogin,
                                    )
                                } else {
                                    if (state.recoveryCodeAllowed) {
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

                                    TextButton(
                                        onClick = {
                                            focusManager.clearFocus()
                                            factor = ""
                                            factorMode = SecondFactorMode.Totp
                                            onBackFromSecondFactor()
                                        },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                    ) {
                                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Text("返回账号登录", modifier = Modifier.padding(start = 6.dp))
                                    }
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
                                                    tint = Color(0xFF94A3B8),
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
                                        enabled = !state.loginBusy && username.isNotBlank() && password.isNotBlank(),
                                        loading = state.loginBusy,
                                    )

                                    if (state.androidPasskeySupported) {
                                        Spacer(Modifier.height(20.dp))
                                        PasskeyLoginMethod(
                                            enabled = !state.loginBusy,
                                            onClick = {
                                                focusManager.clearFocus()
                                                onPasskeyLogin(username)
                                            },
                                        )
                                    }
                                    DeviceLoginSection(
                                        state = state,
                                        onStartDeviceLogin = onStartDeviceLogin,
                                        onCancelDeviceLogin = onCancelDeviceLogin,
                                    )
                                } else {
                                    if (state.recoveryCodeAllowed) {
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

                                    TextButton(
                                        onClick = {
                                            focusManager.clearFocus()
                                            factor = ""
                                            factorMode = SecondFactorMode.Totp
                                            onBackFromSecondFactor()
                                        },
                                        enabled = !state.loginBusy,
                                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                    ) {
                                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Text("返回账号登录", modifier = Modifier.padding(start = 6.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(12.dp))
            LoginFooter()
            Spacer(Modifier.height(20.dp))
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
        Color.White
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
            decodeQrDataUrl(state.deviceLoginQrDataUrl.orEmpty())
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
    OutlinedButton(
        onClick = { onStartDeviceLogin("passkey") },
        enabled = state.androidPasskeySupported && !state.loginBusy && !state.deviceLoginBusy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Icon(Icons.Outlined.Fingerprint, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text("Passkey 跨设备登录")
    }
}

@Composable
private fun PasskeyLoginMethod(enabled: Boolean, onClick: () -> Unit) {
    val primaryColor = MaterialTheme.colorScheme.primary
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
        Surface(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().padding(top = 15.dp).height(52.dp),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.22f)),
        ) {
            Row(
                modifier = Modifier.fillMaxSize(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Outlined.Fingerprint,
                    contentDescription = null,
                    tint = if (enabled) primaryColor else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    "使用 Passkey 快捷登录",
                    style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
                    color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }
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
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.97f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "btn-scale"
    )

    val primaryColor = MaterialTheme.colorScheme.primary
    val buttonBrush = if (enabled || loading) {
        Brush.horizontalGradient(
            colors = listOf(
                primaryColor,
                lerp(primaryColor, Color.White, 0.16f),
            )
        )
    } else {
        SolidColor(primaryColor.copy(alpha = 0.08f))
    }
    val contentColor = if (enabled || loading) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    val buttonShape = RoundedCornerShape(16.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(
                elevation = if (enabled || loading) 4.dp else 0.dp,
                shape = buttonShape,
                clip = false,
                ambientColor = primaryColor.copy(alpha = 0.35f),
                spotColor = primaryColor.copy(alpha = 0.35f),
            )
            .clip(buttonShape)
            .background(buttonBrush)
            .clickable(enabled = enabled && !loading, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    strokeWidth = 2.5.dp,
                    color = contentColor
                )
                Text(
                    "安全验证中...",
                    color = contentColor,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 15.sp,
                    modifier = Modifier.padding(start = 10.dp)
                )
            } else {
                if (icon != null) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = contentColor,
                        modifier = Modifier.size(19.dp)
                    )
                }

                Text(
                    text,
                    color = contentColor,
                    fontWeight = FontWeight.Bold,
                    fontSize = 16.sp,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }
    }
}

private fun decodeQrDataUrl(dataUrl: String): ImageBitmap? {
    val base64 = dataUrl.substringAfter(',', "")
    if (base64.isBlank()) return null
    return runCatching {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }.getOrNull()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(
    state: AppEntryUiState,
    viewModel: AppViewModel,
    onPasskeyRequest: suspend (String) -> String,
    onPasskeyRegistrationRequest: suspend (String) -> String,
    onBiometricConfirmation: suspend () -> Boolean,
    onSensitiveActionConfirmation: suspend () -> Boolean,
    notificationsEnabled: Boolean,
    onRequestNotifications: () -> Unit,
    onWriteNfcScene: (String, String) -> Unit,
    themePreference: AppThemePreference,
    onThemePreferenceChange: (AppThemePreference) -> Unit,
    showInitialSetup: Boolean,
    onInitialSetupComplete: () -> Unit,
) {
    if (state.qrLoginOpen) {
        val qrLoginState by viewModel.qrLoginState.collectAsStateWithLifecycle()
        QrLoginScreen(
            state = qrLoginState,
            onCodeDetected = viewModel::scanQrCode,
            onApprove = { viewModel.approveQrLogin(onPasskeyRequest, onBiometricConfirmation) },
            onReject = viewModel::rejectQrLogin,
            onRetry = viewModel::resetQrScanner,
            onClose = viewModel::closeQrLogin,
        )
        return
    }
    var toastVisible by remember { mutableStateOf(false) }
    var toastMessage by remember { mutableStateOf("") }
    var toastError by remember { mutableStateOf(false) }
    var toastDragOffset by remember { mutableFloatStateOf(0f) }
    var toastDragging by remember { mutableStateOf(false) }
    var settingsOpen by remember { mutableStateOf(false) }
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
    val initialRoute = remember { state.requestedRoute() }
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route ?: initialRoute
    val isSubScreen = parentTabForSubScreen(currentRoute, null) != null
    val navigateBackFromSubScreen: () -> Unit = {
        val parentTab = parentTabForSubScreen(
            route = currentRoute,
            previousRoute = navController.previousBackStackEntry?.destination?.route,
        )
        if (parentTab != null) {
            val parentRoute = parentTab.route()
            viewModel.syncNavigationDestination(parentTab)
            if (!navController.popBackStack(parentRoute, inclusive = false)) {
                navController.navigate(parentRoute) {
                    popUpTo(navController.graph.findStartDestination().id) { inclusive = true }
                    launchSingleTop = true
                }
            }
        }
    }
    BackHandler(enabled = isSubScreen, onBack = navigateBackFromSubScreen)

    // 0ms 纯瞬发导航分发：直接由 NavController 控制跳转，0 协程调度、0 阻塞 IO、0 竞态等待
    val navigateToTab: (MainTab) -> Unit = remember(navController) {
        { tab ->
            val targetRoute = tab.route()
            val current = navController.currentBackStackEntry?.destination?.route
            if (current != targetRoute) {
                navController.navigate(targetRoute) {
                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                    launchSingleTop = true
                    restoreState = true
                }
            }
        }
    }

    val onRefresh = remember(viewModel) { { viewModel.refreshCurrentTab(true) } }

    // 仅响应由外部或 ViewModel 显式打开的非 Tab 二级子界面（如全局搜索、Google 桌面等）
    LaunchedEffect(state.accountManagementOpen, state.googleAccountDeskOpen, state.globalSearchOpen, state.workspaceDestination) {
        val targetRoute = state.requestedRoute()
        if (targetRoute != currentRoute && targetRoute !in setOf(AppRoute.Overview, AppRoute.Operations, AppRoute.Tools, AppRoute.Profile)) {
            navController.navigate(targetRoute) { launchSingleTop = true }
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
            AppRoute.Search -> viewModel.syncNavigationDestination(MainTab.Overview, globalSearchOpen = true)
            AppRoute.Today -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Today)
            AppRoute.FreeClassrooms -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.Reservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.LibrarySeatReservation -> viewModel.syncNavigationDestination(MainTab.Overview)
            AppRoute.Scenes -> viewModel.syncNavigationDestination(MainTab.Overview, workspaceDestination = WorkspaceDestination.Scenes)
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
    LaunchedEffect(toastVisible, toastDragging) {
        if (toastVisible && !toastDragging) {
            delay(3800)
            toastVisible = false
            viewModel.clearFeedback()
        }
    }
    val layoutDirection = LocalLayoutDirection.current
    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets.safeDrawing,
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Row(modifier = Modifier.fillMaxSize()) {
            if (isTablet) {
                AppNavigationRail(
                    selectedTab = primaryTabForRoute(currentRoute) ?: state.selectedTab,
                    onSelectTab = navigateToTab,
                    unreadAlerts = settingsProfileState.unreadAlerts,
                    onOpenNotifications = {
                        viewModel.openWorkspace(WorkspaceDestination.Notifications)
                        navController.navigate(AppRoute.Notifications) { launchSingleTop = true }
                    },
                    onOpenSearch = {
                        viewModel.openGlobalSearch()
                        navController.navigate(AppRoute.Search) { launchSingleTop = true }
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
                val contentPadding = PaddingValues(
                    bottom = shellInsets.contentBottom,
                )
                NavHost(
                    navController = navController,
                    startDestination = initialRoute,
                    modifier = Modifier
                        .widthIn(max = if (isTablet) 1440.dp else 960.dp)
                        .fillMaxSize()
                        .align(Alignment.TopCenter)
                        .padding(
                            start = shellInsets.navigationStart,
                            top = shellInsets.navigationTop,
                            end = shellInsets.navigationEnd,
                        ),
                enterTransition = {
                    fadeIn(animationSpec = tween(220, easing = FastOutSlowInEasing)) +
                    scaleIn(initialScale = 0.985f, animationSpec = tween(220, easing = FastOutSlowInEasing))
                },
                exitTransition = {
                    fadeOut(animationSpec = tween(140, easing = FastOutSlowInEasing))
                },
                popEnterTransition = {
                    fadeIn(animationSpec = tween(220, easing = FastOutSlowInEasing)) +
                    scaleIn(initialScale = 0.985f, animationSpec = tween(220, easing = FastOutSlowInEasing))
                },
                popExitTransition = {
                    fadeOut(animationSpec = tween(140, easing = FastOutSlowInEasing))
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
                        onOpenReservation = { navController.navigate(AppRoute.Reservation) },
                        onOpenFreeClassrooms = {
                            navController.navigate(AppRoute.FreeClassrooms) { launchSingleTop = true }
                        },
                        onOpenSeatReservation = {
                            navController.navigate(AppRoute.LibrarySeatReservation) { launchSingleTop = true }
                        },
                        onOpenAccountManagement = viewModel::openAccountManagement,
                        onUpdateQuickActions = viewModel::updateHomeQuickActions,
                        requestWebLoginUrl = viewModel::createPlatformWebLoginUrl,
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
                        onMarkAllRead = viewModel::markAllAlertsRead,
                        onClearRead = viewModel::clearReadAlerts,
                        onArchive = viewModel::archiveAlert,
                        onSnooze = { id -> viewModel.snoozeAlert(id) },
                        onUpdatePreferences = viewModel::updateAlertPreferences,
                        onBack = navigateBackFromSubScreen,
                    )
                }
                composable(AppRoute.Tools) {
                    val toolsState by viewModel.toolsState.collectAsStateWithLifecycle()
                    ToolsScreen(
                        toolsState,
                        contentPadding,
                        state.selectedTab,
                        { viewModel.triggerCt8(onSensitiveActionConfirmation) },
                        { id -> viewModel.runIotScene(id, onSensitiveActionConfirmation) },
                        { deviceId, relayId, enabled ->
                            viewModel.controlIotRelay(deviceId, relayId, enabled)
                        },
                        onRefresh,
                        onOpenNotifications = { viewModel.openWorkspace(WorkspaceDestination.Notifications) },
                    )
                }
                composable(AppRoute.Profile) {
                    val profileState by viewModel.profileState.collectAsStateWithLifecycle()
                    ProfileScreen(
                        state = profileState,
                        contentPadding = contentPadding,
                        onRevokeSession = { nonce -> viewModel.revokeSession(nonce, onSensitiveActionConfirmation) },
                        onOpenQrLogin = viewModel::openQrScanner,
                        onLogout = viewModel::logout,
                        onRefresh = onRefresh,
                        onClearCache = viewModel::clearLocalCache,
                        onForceFullSync = viewModel::forceFullSync,
                        onOpenAccountManagement = viewModel::openAccountManagement,
                        onOpenGoogleAccountDesk = viewModel::openGoogleAccountDesk,
                        notificationsEnabled = notificationsEnabled,
                        onRequestNotifications = onRequestNotifications,
                        onCreateDesktopMagicLink = viewModel::createDesktopMagicLink,
                        onUpdateNotificationPreferences = viewModel::updateNotificationPreferences,
                        onCheckUpdates = viewModel::checkAppUpdates,
                        onDownloadAndInstallUpdate = viewModel::downloadAndInstallAppUpdate,
                        onInstallDownloadedUpdate = viewModel::installDownloadedAppUpdate,
                        onOpenReleases = viewModel::openAppReleasesPage,
                        onOpenNotifications = { viewModel.openWorkspace(WorkspaceDestination.Notifications) },
                        onOpenSettings = { settingsOpen = true },
                    )
                }
                composable(AppRoute.Account) {
                    val accountState by viewModel.accountManagementState.collectAsStateWithLifecycle()
                    AccountManagementScreen(
                        state = accountState,
                        contentPadding = contentPadding,
                        onDismiss = navigateBackFromSubScreen,
                        onRefresh = onRefresh,
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
                        onSetAppLockEnabled = viewModel::setAppLockEnabled,
                    )
                }
                composable(AppRoute.GoogleAccounts) {
                    val googleAccountState by viewModel.googleAccountDeskState.collectAsStateWithLifecycle()
                    GoogleAccountDeskScreen(
                        state = googleAccountState,
                        contentPadding = contentPadding,
                        onDismiss = navigateBackFromSubScreen,
                        onAddAccount = viewModel::addGoogleAccount,
                        onImportAccounts = viewModel::importGoogleAccounts,
                        onUpdateAccount = viewModel::updateGoogleAccount,
                        onDeleteAccount = viewModel::deleteGoogleAccount,
                        onBulkUpdateAccounts = viewModel::bulkUpdateGoogleAccounts,
                        onBulkArchiveAccounts = viewModel::bulkSetGoogleAccountsArchived,
                        onBulkDeleteAccounts = viewModel::bulkDeleteGoogleAccounts,
                        onAddAlias = viewModel::addGoogleAlias,
                        onUpdateAlias = viewModel::updateGoogleAlias,
                        onDeleteAlias = viewModel::deleteGoogleAlias,
                        onUploadLocalAccounts = viewModel::uploadLocalGoogleAccounts,
                        onDiscardLocalAccounts = viewModel::discardLocalGoogleAccounts,
                    )
                }
                composable(AppRoute.Search) {
                    val searchState by viewModel.globalSearchState.collectAsStateWithLifecycle()
                    GlobalSearchScreen(
                        state = searchState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onSelect = viewModel::openGlobalSearchResult,
                    )
                }
                composable(AppRoute.Today) {
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
                            navController.navigate(AppRoute.FreeClassrooms) { launchSingleTop = true }
                        },
                        onOpenReservation = {
                            navController.navigate(AppRoute.Reservation) { launchSingleTop = true }
                        },
                        onOpenLibrarySeatReservation = {
                            navController.navigate(AppRoute.LibrarySeatReservation) { launchSingleTop = true }
                        },
                        onConsumeSharedDraft = viewModel::consumeSharedTodoDraft,
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
                composable(AppRoute.Reservation) {
                    val reservationState by viewModel.reservationState.collectAsStateWithLifecycle()
                    val context = LocalContext.current
                    ReservationScreen(
                        state = reservationState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel::refreshReservation,
                        onLoadSpaces = viewModel::loadReservationSpaces,
                        onLoadMyReservations = viewModel::loadMyReservations,
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
                        onCancelMyReservation = viewModel::cancelMyReservation,
                        onQueryRulesAndAvailability = viewModel::queryReservationRulesAndAvailability,
                        onQuerySpacesByTime = viewModel::queryAvailableSpacesByTime,
                        onSubmitReservation = viewModel::submitReservation,
                        onLoadAutoTasks = viewModel::loadAutoReservationTasks,
                        onSaveAutoTask = viewModel::saveAutoReservationTask,
                        onToggleAutoTask = viewModel::toggleAutoReservationTask,
                        onDeleteAutoTask = viewModel::deleteAutoReservationTask,
                        onClearFeedback = viewModel::clearReservationFeedback,
                    )
                }
                composable(AppRoute.LibrarySeatReservation) {
                    val librarySeatState by viewModel.librarySeatState.collectAsStateWithLifecycle()
                    val context = LocalContext.current
                    LibrarySeatReservationScreen(
                        state = librarySeatState,
                        contentPadding = contentPadding,
                        onBack = navigateBackFromSubScreen,
                        onRefresh = viewModel::refreshLibrarySeat,
                        onLoadOverview = { force -> viewModel.loadLibrarySeatOverview(force) },
                        onQueryAreas = { venueId, date, startMinute, endMinute, floorId, pageSize, power, window ->
                            viewModel.queryLibrarySeatAreas(
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
                        onLoadSeats = viewModel::loadLibrarySeatSeats,
                        onQueryFloorSeats = viewModel::queryLibrarySeatFloorSeats,
                        onSubmitReservation = viewModel::submitLibrarySeatReservation,
                        onLoadReservations = viewModel::loadLibrarySeatReservations,
                        onLoadReservationHistory = viewModel::loadLibrarySeatReservationHistory,
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
                        onClearFeedback = viewModel::clearLibrarySeatFeedback,
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

            androidx.compose.animation.AnimatedVisibility(
                visible = !isTablet && !isSubScreen,
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
                enter = slideInVertically(animationSpec = tween(260, easing = FastOutSlowInEasing)) { -it } + fadeIn(animationSpec = tween(180)),
                exit = slideOutVertically(animationSpec = tween(180, easing = FastOutSlowInEasing)) { -it } + fadeOut(animationSpec = tween(140)),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
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
                                    viewModel.clearFeedback()
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
                    .zIndex(10f),
            ) {
                AppToast(
                    message = toastMessage,
                    error = toastError,
                    modifier = Modifier.fillMaxWidth(),
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

private fun relativeSyncTime(timestamp: Long): String {
    val minutes = ((System.currentTimeMillis() - timestamp).coerceAtLeast(0L) / 60_000L).toInt()
    return when {
        minutes < 1 -> "刚刚同步"
        minutes < 60 -> "$minutes 分钟前同步"
        minutes < 24 * 60 -> "${minutes / 60} 小时前同步"
        else -> "${minutes / (24 * 60)} 天前同步"
    }
}

@Composable
private fun AppHeader(tab: MainTab) {
    val primaryColor = MaterialTheme.colorScheme.primary
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            primaryColor.copy(alpha = 0.055f),
                            Color.Transparent,
                        ),
                    )
                )
        ) {
            Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .heightIn(min = 68.dp)
                .padding(horizontal = 18.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            ) {
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 2.dp,
                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
            ) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.platform_logo),
                    contentDescription = "智控中心",
                    modifier = Modifier
                        .padding(4.dp)
                        .size(34.dp),
                )
            }
            Column(modifier = Modifier.weight(1f).padding(start = 14.dp)) {
                Text(
                    tabTitle(tab),
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        letterSpacing = (-0.3).sp
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Box(
                        Modifier
                            .size(6.dp)
                            .background(Color(0xFF10B981), CircleShape)
                    )
                    Text(
                        "生产环境 · 智控中心 LIVE",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
        }
        }
    }
}

@Composable
private fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier
            .padding(horizontal = 16.dp, vertical = 10.dp)
            .widthIn(max = 420.dp)
            .fillMaxWidth()
            .height(62.dp),
        color = glassCardColor(),
        shape = RoundedCornerShape(31.dp),
        shadowElevation = 0.dp,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
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
                onClick = onClick,
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

private fun tabTitle(tab: MainTab): String = when (tab) {
    MainTab.Overview -> "今日"
    MainTab.Notifications -> "通知中心"
    MainTab.Operations -> "状态"
    MainTab.Tools -> "设备"
    MainTab.Profile -> "我的"
}

fun screenPadding(contentPadding: PaddingValues): Modifier = Modifier
    .fillMaxSize()
    .padding(contentPadding)
