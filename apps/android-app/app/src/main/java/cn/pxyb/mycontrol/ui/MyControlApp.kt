package cn.pxyb.mycontrol.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.ui.components.layout.LocalAppNavigationHandlesBack
import cn.pxyb.mycontrol.ui.components.layout.ProvideAdaptiveWindowContext
import cn.pxyb.mycontrol.ui.feature.auth.LockScreen
import cn.pxyb.mycontrol.ui.feature.auth.LoginScreen
import cn.pxyb.mycontrol.ui.feature.updates.shouldShowStartupUpdatePrompt
import cn.pxyb.mycontrol.ui.navigation.AuthenticatedShell
import cn.pxyb.mycontrol.ui.startup.FullScreenLoading
import cn.pxyb.mycontrol.ui.startup.ModernAnimatedSplashScreen
import cn.pxyb.mycontrol.ui.startup.StartupAppUpdateDialog
import kotlinx.coroutines.delay

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
