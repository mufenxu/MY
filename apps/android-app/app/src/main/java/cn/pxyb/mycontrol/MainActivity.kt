package cn.pxyb.mycontrol

import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.core.app.NotificationManagerCompat
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.ui.AppViewModel
import cn.pxyb.mycontrol.ui.MyControlApp
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

class MainActivity : ComponentActivity() {
    private val appViewModel: AppViewModel by viewModels()
    private val credentialManager by lazy { CredentialManager.create(this) }
    private val alertNotifier by lazy { AlertNotifier(this) }
    private var authenticationRequests = 0
    private var activityStopped = false
    private var notificationsEnabled = mutableStateOf(false)

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> notificationsEnabled.value = granted && NotificationManagerCompat.from(this).areNotificationsEnabled() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        alertNotifier.ensureChannel()
        notificationsEnabled.value = hasNotificationPermission()
        handleOpenIntent(intent)
        enableEdgeToEdge()
        setContent {
            MYControlTheme {
                val biometricRequest = remember { { promptForUnlock(appViewModel::unlockSession) } }
                val passkeyRequest: suspend (String) -> String = remember {
                    { requestJson -> requestPasskey(requestJson) }
                }
                val passkeyRegistrationRequest: suspend (String) -> String = remember {
                    { requestJson -> requestPasskeyRegistration(requestJson) }
                }
                val biometricConfirmation: suspend () -> Boolean = remember {
                    { requestQrLoginConfirmation() }
                }
                val sessionProtection: suspend () -> Boolean = remember {
                    { requestSessionProtection() }
                }
                val sensitiveActionConfirmation: suspend () -> Boolean = remember {
                    { requestSensitiveActionConfirmation() }
                }
                val notificationPermissionRequest = remember { { requestNotificationPermissionIfNeeded() } }
                MyControlApp(
                    viewModel = appViewModel,
                    onBiometricUnlock = biometricRequest,
                    onPasskeyRequest = passkeyRequest,
                    onPasskeyRegistrationRequest = passkeyRegistrationRequest,
                    onBiometricConfirmation = biometricConfirmation,
                    onSessionProtection = sessionProtection,
                    onSensitiveActionConfirmation = sensitiveActionConfirmation,
                    notificationsEnabled = notificationsEnabled.value,
                    onRequestNotifications = notificationPermissionRequest,
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        activityStopped = false
        notificationsEnabled.value = hasNotificationPermission()
    }

    override fun onStop() {
        activityStopped = true
        if (authenticationRequests == 0) appViewModel.lockSession()
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOpenIntent(intent)
    }

    private suspend fun requestPasskey(requestJson: String): String {
        return try {
            withTimeout(60_000) {
                val request = GetCredentialRequest(
                    credentialOptions = listOf(GetPublicKeyCredentialOption(requestJson = requestJson)),
                )
                val credential = credentialManager.getCredential(context = this@MainActivity, request = request).credential
                (credential as? PublicKeyCredential)?.authenticationResponseJson
                    ?: throw IllegalStateException("设备未返回可用的 Passkey。")
            }
        } catch (error: TimeoutCancellationException) {
            throw IllegalStateException("系统 Passkey 窗口未响应，请确认域名已关联当前 App 签名后重试。", error)
        } catch (error: GetCredentialException) {
            throw IllegalStateException("Passkey 验证未完成，请确认设备已保存该账号的 Passkey。", error)
        }
    }

    private suspend fun requestPasskeyRegistration(requestJson: String): String {
        return try {
            withTimeout(60_000) {
                val response = credentialManager.createCredential(
                    context = this@MainActivity,
                    request = CreatePublicKeyCredentialRequest(requestJson = requestJson),
                )
                (response as? CreatePublicKeyCredentialResponse)?.registrationResponseJson
                    ?: throw IllegalStateException("设备未返回可用的 Passkey 注册结果。")
            }
        } catch (error: TimeoutCancellationException) {
            throw IllegalStateException("系统 Passkey 窗口未响应，请确认域名已关联当前 App 签名后重试。", error)
        } catch (error: CreateCredentialException) {
            throw IllegalStateException("Passkey 注册未完成，请确认设备支持并重试。", error)
        }
    }

    private fun promptForUnlock(onSuccess: () -> Unit) {
        promptForAuthentication(
            title = "解锁 MY Control",
            subtitle = "验证身份后继续访问统一平台",
        ) { authenticated -> if (authenticated) onSuccess() }
    }

    private suspend fun requestQrLoginConfirmation(): Boolean = requestDeviceAuthentication(
        title = "确认网页登录",
        subtitle = "验证身份后批准浏览器登录",
    )

    private suspend fun requestSessionProtection(): Boolean = requestDeviceAuthentication(
        title = "保护安全会话",
        subtitle = "验证身份后将登录会话绑定到本设备",
    )

    private suspend fun requestSensitiveActionConfirmation(): Boolean = requestDeviceAuthentication(
        title = "确认敏感操作",
        subtitle = "验证身份后继续执行本次操作",
    )

    private suspend fun requestDeviceAuthentication(title: String, subtitle: String): Boolean =
        try {
            authenticationRequests += 1
            suspendCancellableCoroutine { continuation ->
                val cancellationSignal = promptForAuthentication(title, subtitle) { authenticated ->
                    if (continuation.isActive) continuation.resume(authenticated)
                }
                continuation.invokeOnCancellation { cancellationSignal?.cancel() }
            }
        } finally {
            authenticationRequests = (authenticationRequests - 1).coerceAtLeast(0)
            if (activityStopped && authenticationRequests == 0) appViewModel.lockSession()
        }

    private fun promptForAuthentication(
        title: String,
        subtitle: String,
        onResult: (Boolean) -> Unit,
    ): CancellationSignal? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            onResult(false)
            return null
        }
        val manager = getSystemService(BiometricManager::class.java)
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.P && manager?.canAuthenticate() != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "设备未配置生物识别，请改用平台账号登录。", Toast.LENGTH_LONG).show()
            onResult(false)
            return null
        }
        val executor = Executor { command -> runOnUiThread(command) }
        val promptBuilder = BiometricPrompt.Builder(this)
            .setTitle(title)
            .setSubtitle(subtitle)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            promptBuilder.setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL,
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            @Suppress("DEPRECATION")
            promptBuilder.setDeviceCredentialAllowed(true)
        } else {
            promptBuilder.setNegativeButton("取消", executor) { _, _ -> }
        }
        val prompt = promptBuilder.build()
        val cancellationSignal = CancellationSignal()
        prompt.authenticate(
            cancellationSignal,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onResult(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                    if (errorCode != BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED &&
                        errorCode != BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                    ) {
                        Toast.makeText(this@MainActivity, errString ?: "身份验证失败", Toast.LENGTH_SHORT).show()
                    }
                    onResult(false)
                }
            },
        )
        return cancellationSignal
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (hasNotificationPermission()) return
        val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (!permissionGranted) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
            )
        }
    }

    private fun hasNotificationPermission(): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun handleOpenIntent(intent: Intent?) {
        if (intent == null) return
        val data = intent.data
        if (data != null) {
            appViewModel.handleOpenIntent(data)
            return
        }
        val tab = intent.getStringExtra(DeepLinks.EXTRA_TAB)
        val incidentId = intent.getStringExtra(DeepLinks.EXTRA_INCIDENT_ID)
        val taskId = intent.getStringExtra(DeepLinks.EXTRA_TASK_ID)
        if (!tab.isNullOrBlank() || !incidentId.isNullOrBlank() || !taskId.isNullOrBlank()) {
            appViewModel.openOperationalTarget(
                tab = DeepLinks.parseTab(tab),
                incidentId = incidentId,
                taskId = taskId,
            )
        }
    }
}
