package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.AutofillType
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.LoginBotChallengeDialog
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.layout.AppTabletContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.components.layout.WindowHeightSizeClass
import cn.pxyb.mycontrol.ui.feature.account.AccountRecoveryDialog
import cn.pxyb.mycontrol.ui.feature.account.LoginTotpEnrollment
import cn.pxyb.mycontrol.ui.feature.account.RecoveryCodesDialog
import cn.pxyb.mycontrol.ui.theme.AppCardShape

internal enum class SecondFactorMode { Totp, RecoveryCode }

@OptIn(ExperimentalComposeUiApi::class)
@Composable
internal fun LoginScreen(
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
                                    AppFeedbackBanner(state.message, error = false, modifier = Modifier.padding(bottom = 14.dp))
                                }
                                if (!state.error.isNullOrBlank()) {
                                    AppFeedbackBanner(state.error, error = true, modifier = Modifier.padding(bottom = 14.dp))
                                }

                                if (!state.secondFactorRequired) {
                                    LoginTextField(
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

                                    LoginTextField(
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
                                    LoginTextField(
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
                                    AppFeedbackBanner(state.message, error = false, modifier = Modifier.padding(bottom = 14.dp))
                                }
                                if (!state.error.isNullOrBlank()) {
                                    AppFeedbackBanner(state.error, error = true, modifier = Modifier.padding(bottom = 14.dp))
                                }

                                if (!state.secondFactorRequired) {
                                    LoginTextField(
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

                                    LoginTextField(
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
                                    LoginTextField(
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
