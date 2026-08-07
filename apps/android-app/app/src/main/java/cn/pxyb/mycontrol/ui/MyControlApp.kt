package cn.pxyb.mycontrol.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Security
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
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
import androidx.compose.ui.platform.LocalAutofill
import androidx.compose.ui.platform.LocalAutofillTree
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import kotlinx.coroutines.delay

private data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)
private enum class SecondFactorMode { Totp, RecoveryCode }

private val tabs = listOf(
    TabItem(MainTab.Overview, "首页", Icons.Outlined.Home),
    TabItem(MainTab.Events, "动态", Icons.Outlined.Notifications),
    TabItem(MainTab.Tools, "设备", Icons.Outlined.Hub),
    TabItem(MainTab.Profile, "我的", Icons.Outlined.Person),
)

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
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val destination = when {
        state.booting -> "loading"
        state.locked -> "locked"
        state.user == null -> "login"
        else -> "app"
    }
    Crossfade(targetState = destination, animationSpec = tween(180), label = "app-state") { screen ->
        when (screen) {
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
            )
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
    state: AppUiState,
    onLogin: (String, String, String, Boolean) -> Unit,
    onPasskeyLogin: (String) -> Unit,
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

    Box(modifier = Modifier.fillMaxSize()) {
        LoginAmbientBackground()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp),
        ) {
            BoxWithConstraints(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) {
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
                                        enabled = !state.loginBusy && username.isNotBlank(),
                                        onClick = {
                                            focusManager.clearFocus()
                                            onPasskeyLogin(username)
                                        },
                                    )
                                }
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
        targetValue = if (isPressed) 0.98f else 1.0f,
        animationSpec = tween(90),
        label = "btn-scale"
    )

    val primaryColor = MaterialTheme.colorScheme.primary
    val buttonBrush = if (enabled || loading) {
        Brush.horizontalGradient(
            colors = listOf(
                Color(0xFF2563EB),
                Color(0xFF3B82F6),
            )
        )
    } else {
        SolidColor(primaryColor.copy(alpha = 0.08f))
    }
    val contentColor = if (enabled || loading) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
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
                ambientColor = Color(0xFF2563EB).copy(alpha = 0.35f),
                spotColor = Color(0xFF2563EB).copy(alpha = 0.35f),
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthenticatedShell(
    state: AppUiState,
    viewModel: AppViewModel,
    onPasskeyRequest: suspend (String) -> String,
    onPasskeyRegistrationRequest: suspend (String) -> String,
    onBiometricConfirmation: suspend () -> Boolean,
    onSensitiveActionConfirmation: suspend () -> Boolean,
    notificationsEnabled: Boolean,
    onRequestNotifications: () -> Unit,
) {
    if (state.qrLoginOpen) {
        QrLoginScreen(
            state = state,
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
    val saveableStateHolder = rememberSaveableStateHolder()
    val onRefresh = remember(viewModel) { { viewModel.refreshCurrentTab(true) } }
    LaunchedEffect(state.error, state.message) {
        val text = state.error ?: state.message
        if (!text.isNullOrBlank()) {
            toastMessage = text
            toastError = state.error != null
            toastVisible = true
        }
    }
    LaunchedEffect(toastVisible) {
        if (toastVisible) {
            delay(3800)
            toastVisible = false
            viewModel.clearFeedback()
        }
    }
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize()) {
            val tab = state.selectedTab
            val isSubScreen = state.accountManagementOpen || state.googleAccountDeskOpen || state.selectedTab == MainTab.Operations
            val contentPadding = PaddingValues(
                top = padding.calculateTopPadding(),
                bottom = if (isSubScreen) padding.calculateBottomPadding() + 16.dp else 90.dp,
            )
            AnimatedContent(
                targetState = tab,
                transitionSpec = {
                    fadeIn(animationSpec = tween(140)) togetherWith fadeOut(animationSpec = tween(110))
                },
                label = "tab_switch",
            ) { currentTab ->
                saveableStateHolder.SaveableStateProvider(currentTab.name) {
                    when (currentTab) {
                    MainTab.Overview -> OverviewScreen(
                        state = state,
                        contentPadding = contentPadding,
                        onSelectTab = viewModel::selectTab,
                        onRefresh = onRefresh,
                        onRunDiagnostics = viewModel::runDiagnostics,
                        onTriggerBackup = { viewModel.triggerBackup(onSensitiveActionConfirmation) },
                        onOpenGoogleAccountDesk = viewModel::openGoogleAccountDesk,
                        onOpenOperations = { viewModel.selectTab(MainTab.Operations) },
                    )
                    MainTab.Events -> EventsScreen(
                        state = state,
                        contentPadding = contentPadding,
                        onAcknowledge = viewModel::acknowledgeIncident,
                        onAssign = viewModel::assignIncident,
                        onAddNote = viewModel::addIncidentNote,
                        onMute = viewModel::muteIncident,
                        onResolve = { id, note -> viewModel.resolveIncident(id, note, onSensitiveActionConfirmation) },
                        onCompleteRunbookStep = viewModel::completeRunbookStep,
                        onSavePostmortem = viewModel::savePostmortem,
                        focusIncidentId = state.focusIncidentId,
                        onFocusConsumed = viewModel::clearFocusTargets,
                        onRefresh = onRefresh,
                    )
                    MainTab.Operations -> OperationsScreen(
                        state = state,
                        contentPadding = contentPadding,
                        onRunDiagnostics = viewModel::runDiagnostics,
                        onTriggerBackup = { viewModel.triggerBackup(onSensitiveActionConfirmation) },
                        onApproveConfiguration = { id, note ->
                            viewModel.approveConfiguration(
                                changeId = id,
                                note = note.ifBlank { "通过 MY Control Android 审批" },
                                confirmation = onSensitiveActionConfirmation,
                            )
                        },
                        onRejectConfiguration = { id, note ->
                            viewModel.rejectConfiguration(
                                changeId = id,
                                note = note.ifBlank { "通过 MY Control Android 拒绝" },
                                confirmation = onSensitiveActionConfirmation,
                            )
                        },
                        onOpenIncident = { incidentId ->
                            viewModel.openOperationalTarget(
                                tab = MainTab.Events,
                                incidentId = incidentId,
                            )
                        },
                        focusTaskId = state.focusTaskId,
                        onFocusConsumed = viewModel::clearFocusTargets,
                        onRefresh = onRefresh,
                        onBack = { viewModel.selectTab(MainTab.Overview) },
                    )
                    MainTab.Tools -> ToolsScreen(
                        state,
                        contentPadding,
                        state.selectedTab,
                        { viewModel.triggerCt8(onSensitiveActionConfirmation) },
                        { id -> viewModel.runIotScene(id, onSensitiveActionConfirmation) },
                        { deviceId, relayId, enabled ->
                            viewModel.controlIotRelay(deviceId, relayId, enabled)
                        },
                        onRefresh,
                    )
                    MainTab.Profile -> {
                        AnimatedContent(
                            targetState = state.accountManagementOpen || state.googleAccountDeskOpen,
                            transitionSpec = {
                                if (targetState) {
                                    (slideInHorizontally(animationSpec = tween(180, easing = FastOutSlowInEasing)) { fullWidth -> fullWidth } +
                                            fadeIn(animationSpec = tween(180))) togetherWith
                                            (slideOutHorizontally(animationSpec = tween(180, easing = FastOutSlowInEasing)) { fullWidth -> -fullWidth / 4 } +
                                                    fadeOut(animationSpec = tween(140)))
                                } else {
                                    (slideInHorizontally(animationSpec = tween(180, easing = FastOutSlowInEasing)) { fullWidth -> -fullWidth / 4 } +
                                            fadeIn(animationSpec = tween(180))) togetherWith
                                            (slideOutHorizontally(animationSpec = tween(180, easing = FastOutSlowInEasing)) { fullWidth -> fullWidth } +
                                                    fadeOut(animationSpec = tween(140)))
                                }
                            },
                            label = "profile_subscreen_transition"
                        ) { isAccountOpen ->
                            if (isAccountOpen) {
                                if (state.googleAccountDeskOpen) {
                                    GoogleAccountDeskScreen(
                                        state = state,
                                        contentPadding = contentPadding,
                                        onDismiss = viewModel::closeGoogleAccountDesk,
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
                                } else {
                                AccountManagementScreen(
                                    state = state,
                                    contentPadding = contentPadding,
                                    onDismiss = viewModel::closeAccountManagement,
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
                            } else {
                                ProfileScreen(
                                    state = state,
                                    contentPadding = contentPadding,
                                    onRevokeSession = { nonce -> viewModel.revokeSession(nonce, onSensitiveActionConfirmation) },
                                    onOpenQrLogin = viewModel::openQrScanner,
                                    onLogout = viewModel::logout,
                                    onRefresh = onRefresh,
                                    onOpenAccountManagement = viewModel::openAccountManagement,
                                    onOpenGoogleAccountDesk = viewModel::openGoogleAccountDesk,
                                    notificationsEnabled = notificationsEnabled,
                                    onRequestNotifications = onRequestNotifications,
                                )
                            }
                        }
                    }
                }
            }
            }

            AnimatedVisibility(
                visible = !isSubScreen,
                enter = slideInVertically(animationSpec = tween(160, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeIn(animationSpec = tween(160)),
                exit = slideOutVertically(animationSpec = tween(140, easing = FastOutSlowInEasing)) { fullHeight -> fullHeight } + fadeOut(animationSpec = tween(120)),
                modifier = Modifier.align(Alignment.BottomCenter)
            ) {
                AppBottomNavigation(
                    selected = state.selectedTab,
                    onSelect = viewModel::selectTab,
                )
            }

            AnimatedVisibility(
                visible = toastVisible,
                enter = slideInVertically(animationSpec = tween(260, easing = FastOutSlowInEasing)) { -it } + fadeIn(animationSpec = tween(180)),
                exit = slideOutVertically(animationSpec = tween(180, easing = FastOutSlowInEasing)) { -it } + fadeOut(animationSpec = tween(140)),
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .statusBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
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

@Composable
private fun AppHeader(tab: MainTab, refreshing: Boolean, onRefresh: () -> Unit) {
    val primaryColor = MaterialTheme.colorScheme.primary
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 1.dp,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f))
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
                color = Color.White,
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
            Surface(
                color = primaryColor.copy(alpha = 0.08f),
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(0.5.dp, primaryColor.copy(alpha = 0.15f))
            ) {
                IconButton(onClick = onRefresh, enabled = !refreshing, modifier = Modifier.size(40.dp)) {
                    Crossfade(targetState = refreshing, animationSpec = tween(160), label = "refresh") { busy ->
                        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = primaryColor)
                        else Icon(Icons.Outlined.Refresh, contentDescription = "刷新", tint = primaryColor, modifier = Modifier.size(20.dp))
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
        color = Color.White,
        shape = RoundedCornerShape(31.dp),
        shadowElevation = 10.dp,
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.05f)),
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

    val foreground by animateColorAsState(
        targetValue = if (selected) primaryColor else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
        animationSpec = if (selected) tween(140, easing = FastOutSlowInEasing) else snap(),
        label = "nav-color",
    )
    val background by animateColorAsState(
        targetValue = if (selected) primaryColor.copy(alpha = 0.12f) else Color.Transparent,
        animationSpec = if (selected) tween(140, easing = FastOutSlowInEasing) else snap(),
        label = "nav-background",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1.14f else 1.0f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow
        ),
        label = "nav-icon-scale"
    )

    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .clip(itemShape)
            .background(background)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onClick
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
                .graphicsLayer { scaleX = iconScale; scaleY = iconScale }
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
    MainTab.Overview -> "工作台"
    MainTab.Events -> "系统动态"
    MainTab.Operations -> "高级工具"
    MainTab.Tools -> "设备与自动化"
    MainTab.Profile -> "账号与安全"
}

fun screenPadding(contentPadding: PaddingValues): Modifier = Modifier
    .fillMaxSize()
    .padding(contentPadding)
