package cn.pxyb.mycontrol

import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.remember
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialException
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleQrLoginIntent(intent)
        enableEdgeToEdge()
        setContent {
            MYControlTheme {
                val biometricRequest = remember { { promptForUnlock(appViewModel::unlockSession) } }
                val passkeyRequest: suspend (String) -> String = remember {
                    { requestJson -> requestPasskey(requestJson) }
                }
                val biometricConfirmation: suspend () -> Boolean = remember {
                    { requestQrLoginConfirmation() }
                }
                MyControlApp(
                    viewModel = appViewModel,
                    onBiometricUnlock = biometricRequest,
                    onPasskeyRequest = passkeyRequest,
                    onBiometricConfirmation = biometricConfirmation,
                )
            }
        }
    }

    override fun onStop() {
        super.onStop()
        appViewModel.lockSession()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleQrLoginIntent(intent)
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

    private fun promptForUnlock(onSuccess: () -> Unit) {
        promptForAuthentication(
            title = "解锁 MY Control",
            subtitle = "验证身份后继续访问统一平台",
        ) { authenticated -> if (authenticated) onSuccess() }
    }

    private suspend fun requestQrLoginConfirmation(): Boolean = suspendCancellableCoroutine { continuation ->
        val cancellationSignal = promptForAuthentication(
            title = "确认网页登录",
            subtitle = "验证身份后批准浏览器登录",
        ) { authenticated ->
            if (continuation.isActive) continuation.resume(authenticated)
        }
        continuation.invokeOnCancellation { cancellationSignal?.cancel() }
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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

    private fun handleQrLoginIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW) {
            appViewModel.handleQrLoginUrl(intent.dataString)
        }
    }
}
