package cn.pxyb.mycontrol.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Fingerprint
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RocketLaunch
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
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.ui.theme.BrandBlue

private data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)
private enum class SecondFactorMode { Totp, RecoveryCode }

private val tabs = listOf(
    TabItem(MainTab.Overview, "总览", Icons.Outlined.Dashboard),
    TabItem(MainTab.Events, "事件", Icons.Outlined.Notifications),
    TabItem(MainTab.Operations, "操作", Icons.Outlined.RocketLaunch),
    TabItem(MainTab.Tools, "工具", Icons.Outlined.GridView),
    TabItem(MainTab.Profile, "我的", Icons.Outlined.Person),
)

@Composable
fun MyControlApp(
    viewModel: AppViewModel,
    onBiometricUnlock: () -> Unit,
    onPasskeyRequest: suspend (String) -> String,
    onBiometricConfirmation: suspend () -> Boolean,
    onSessionProtection: suspend () -> Boolean,
    onSensitiveActionConfirmation: suspend () -> Boolean,
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
                onBiometricConfirmation,
                onSensitiveActionConfirmation,
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
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            BrandMark(compact = true)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.medium) {
                Icon(
                    Icons.Outlined.Fingerprint,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(20.dp).size(44.dp),
                )
            }
            Text("欢迎回来", style = MaterialTheme.typography.headlineLarge, modifier = Modifier.padding(top = 22.dp))
            Text(
                "验证设备身份以继续",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 6.dp),
            )
            if (!error.isNullOrBlank()) {
                Text(
                    error,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.padding(top = 10.dp),
                )
            }
            Button(
                onClick = onUnlock,
                modifier = Modifier.fillMaxWidth().padding(top = 26.dp).height(52.dp),
                shape = MaterialTheme.shapes.medium,
            ) {
                Icon(Icons.Outlined.Fingerprint, contentDescription = null)
                Text("解锁", modifier = Modifier.padding(start = 8.dp))
            }
            OutlinedButton(
                onClick = onUseLogin,
                modifier = Modifier.fillMaxWidth().padding(top = 10.dp).height(50.dp),
                shape = MaterialTheme.shapes.medium,
            ) {
                Text("改用平台账号登录")
            }
        }
        Text(
            "MY Control · 安全会话已加密",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun LoginAmbientBackground() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    )
}

@Composable
private fun LoginHeader() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier
                .size(72.dp)
                .shadow(
                    elevation = 5.dp,
                    shape = MaterialTheme.shapes.medium,
                    clip = false,
                    ambientColor = Color.Black.copy(alpha = 0.12f),
                    spotColor = Color.Black.copy(alpha = 0.12f),
                ),
            shape = MaterialTheme.shapes.medium,
            color = Color.White,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)),
        ) {
            Box(contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.platform_logo),
                    contentDescription = "智控中心",
                    modifier = Modifier.size(48.dp),
                )
            }
        }

        Spacer(Modifier.height(18.dp))

        Text(
            "智控中心",
            style = MaterialTheme.typography.headlineLarge.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 25.sp,
                letterSpacing = 0.sp,
            ),
            color = MaterialTheme.colorScheme.onBackground,
        )

        Text(
            "安全高效的设备管理平台",
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.76f),
            modifier = Modifier.padding(top = 6.dp)
        )
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
                        shape = MaterialTheme.shapes.medium,
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

    val containerBgColor = if (isFocused) {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.42f)
    }
    val iconColor = if (isFocused) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f)
    val borderColor = if (isFocused) {
        MaterialTheme.colorScheme.primary.copy(alpha = 0.72f)
    } else {
        MaterialTheme.colorScheme.outline.copy(alpha = 0.28f)
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium.copy(
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp
            ),
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.82f),
            modifier = Modifier.padding(bottom = 7.dp)
        )

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = MaterialTheme.shapes.medium,
            color = containerBgColor,
            border = BorderStroke(1.dp, borderColor),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 15.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    icon,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(19.dp)
                )

                Spacer(Modifier.width(11.dp))

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
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.62f)
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
                            color = MaterialTheme.colorScheme.onSurface
                        ),
                        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary)
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
                            modifier = Modifier.size(16.dp)
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
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)))
            Text(
                "其他登录方式",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = Modifier.padding(horizontal = 14.dp),
            )
            Box(Modifier.weight(1f).height(1.dp).background(MaterialTheme.colorScheme.outline.copy(alpha = 0.18f)))
        }
        OutlinedButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().padding(top = 15.dp).height(52.dp),
            shape = MaterialTheme.shapes.medium,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.36f)),
        ) {
            Icon(Icons.Outlined.Fingerprint, contentDescription = null, modifier = Modifier.size(20.dp))
            Text("使用 Passkey 登录", modifier = Modifier.padding(start = 8.dp))
        }
    }
}

@Composable
private fun LoginFooter() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            "© 2026 智控中心 版权所有",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
        )
        Text(
            "版本 ${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
            modifier = Modifier.padding(top = 2.dp)
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

    val buttonColor = if (enabled || loading) {
        MaterialTheme.colorScheme.primary
    } else {
        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f)
    }
    val contentColor = if (enabled || loading) Color.White else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
    val buttonShape = MaterialTheme.shapes.medium

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(54.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .shadow(
                elevation = if (enabled || loading) 3.dp else 0.dp,
                shape = buttonShape,
                clip = false,
                ambientColor = Color.Black.copy(alpha = 0.14f),
                spotColor = Color.Black.copy(alpha = 0.14f),
            )
            .clip(buttonShape)
            .background(buttonColor)
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
                    fontWeight = FontWeight.SemiBold,
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
    onBiometricConfirmation: suspend () -> Boolean,
    onSensitiveActionConfirmation: suspend () -> Boolean,
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
    val snackbarHost = remember { SnackbarHostState() }
    val saveableStateHolder = rememberSaveableStateHolder()
    val onRefresh = remember(viewModel) { { viewModel.refreshAll(true) } }
    LaunchedEffect(state.error, state.message) {
        val text = state.error ?: state.message
        if (!text.isNullOrBlank()) {
            snackbarHost.showSnackbar(text)
            viewModel.clearFeedback()
        }
    }
    Scaffold(
        modifier = Modifier.fillMaxSize(),
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHost) },
        bottomBar = {
            AppBottomNavigation(
                selected = state.selectedTab,
                onSelect = viewModel::selectTab,
            )
        },
    ) { padding ->
        AnimatedContent(
            targetState = state.selectedTab,
            modifier = Modifier.fillMaxSize(),
            transitionSpec = {
                fadeIn(tween(durationMillis = 160, delayMillis = 40)) togetherWith
                    fadeOut(tween(durationMillis = 90))
            },
            label = "main-navigation",
        ) { tab ->
            saveableStateHolder.SaveableStateProvider(tab.name) {
                when (tab) {
                    MainTab.Overview -> OverviewScreen(state, padding, viewModel::selectTab, onRefresh)
                    MainTab.Events -> EventsScreen(
                        state = state,
                        contentPadding = padding,
                        onAcknowledge = viewModel::acknowledgeIncident,
                        onAssign = viewModel::assignIncident,
                        onAddNote = viewModel::addIncidentNote,
                        onMute = viewModel::muteIncident,
                        onResolve = { id, note -> viewModel.resolveIncident(id, note, onSensitiveActionConfirmation) },
                        onRefresh = onRefresh,
                    )
                    MainTab.Operations -> OperationsScreen(
                        state,
                        padding,
                        viewModel::runDiagnostics,
                        { viewModel.triggerBackup(onSensitiveActionConfirmation) },
                        onRefresh,
                    )
                    MainTab.Tools -> ToolsScreen(
                        state,
                        padding,
                        { viewModel.triggerCt8(onSensitiveActionConfirmation) },
                        { id -> viewModel.runIotScene(id, onSensitiveActionConfirmation) },
                        onRefresh,
                    )
                    MainTab.Profile -> ProfileScreen(
                        state,
                        padding,
                        { nonce -> viewModel.revokeSession(nonce, onSensitiveActionConfirmation) },
                        viewModel::openQrScanner,
                        viewModel::logout,
                        onRefresh,
                    )
                }
            }
        }
    }
}

@Composable
private fun AppHeader(tab: MainTab, refreshing: Boolean, onRefresh: () -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 0.dp,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .heightIn(min = 72.dp)
                .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                shape = MaterialTheme.shapes.medium,
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.2f))
            ) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.platform_logo),
                    contentDescription = "智控中心",
                    modifier = Modifier
                        .padding(5.dp)
                        .size(34.dp),
                )
            }
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Text(
                    tabTitle(tab),
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 19.sp
                    )
                )
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 2.dp)) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .background(MaterialTheme.colorScheme.secondary, CircleShape)
                    )
                    Text(
                        "生产环境 · 智控中心 LIVE",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
            }
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f),
                shape = MaterialTheme.shapes.medium,
            ) {
                IconButton(onClick = onRefresh, enabled = !refreshing, modifier = Modifier.size(42.dp)) {
                    Crossfade(targetState = refreshing, animationSpec = tween(160), label = "refresh") { busy ->
                        if (busy) CircularProgressIndicator(Modifier.size(19.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                        else Icon(Icons.Outlined.Refresh, contentDescription = "刷新", tint = MaterialTheme.colorScheme.primary)
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
    Box(
        modifier = modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 10.dp),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth().height(62.dp),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(31.dp),
            shadowElevation = 0.dp,
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
        ) {
            Row(
                modifier = Modifier.fillMaxSize().padding(horizontal = 6.dp, vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                tabs.forEach { item -> BottomNavigationItem(item, selected == item.tab) { onSelect(item.tab) } }
            }
        }
    }
}

@Composable
private fun RowScope.BottomNavigationItem(item: TabItem, selected: Boolean, onClick: () -> Unit) {
    val itemShape = RoundedCornerShape(24.dp)
    val foreground by animateColorAsState(
        if (selected) BrandBlue else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
        animationSpec = if (selected) tween(140) else snap(),
        label = "navigation-color",
    )
    val background by animateColorAsState(
        if (selected) BrandBlue.copy(alpha = 0.12f) else Color.Transparent,
        animationSpec = if (selected) tween(140) else snap(),
        label = "navigation-background",
    )
    val iconScale by animateFloatAsState(
        targetValue = if (selected) 1.15f else 1.0f,
        animationSpec = spring(),
        label = "nav-icon-scale"
    )

    Column(
        modifier = Modifier
            .weight(1f)
            .fillMaxHeight()
            .clip(itemShape)
            .background(background)
            .clickable(onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            item.icon,
            contentDescription = item.label,
            tint = foreground,
            modifier = Modifier
                .size(20.dp)
                .graphicsLayer { scaleX = iconScale; scaleY = iconScale }
        )
        Text(
            item.label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
                fontSize = 11.sp
            ),
            color = foreground,
            modifier = Modifier.padding(top = 2.dp),
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
    MainTab.Overview -> "运行总览"
    MainTab.Events -> "事件中心"
    MainTab.Operations -> "执行中心"
    MainTab.Tools -> "平台工具"
    MainTab.Profile -> "账号与安全"
}

fun screenPadding(contentPadding: PaddingValues): Modifier = Modifier
    .fillMaxSize()
    .padding(contentPadding)
