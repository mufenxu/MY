package cn.pxyb.mycontrol.util

import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.widget.Toast
import androidx.activity.ComponentActivity
import cn.pxyb.mycontrol.AppSessionLifecycle
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

internal suspend fun ComponentActivity.authenticateDevice(title: String, subtitle: String): Boolean =
    suspendCancellableCoroutine { continuation ->
        val signal = promptDeviceAuthentication(title, subtitle) { result ->
            if (continuation.isActive) continuation.resume(result)
        }
        continuation.invokeOnCancellation { signal.cancel() }
    }

internal fun ComponentActivity.promptDeviceAuthentication(
    title: String,
    subtitle: String,
    onResult: (Boolean) -> Unit,
): CancellationSignal {
    val signal = CancellationSignal()
    val executor = Executor { runOnUiThread(it) }
    var finished = false
    AppSessionLifecycle.beginAuthentication()
    fun finish(success: Boolean) {
        if (finished) return
        finished = true
        AppSessionLifecycle.endAuthentication()
        onResult(success)
    }
    val builder = BiometricPrompt.Builder(this).setTitle(title).setSubtitle(subtitle)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        builder.setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL,
        )
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        @Suppress("DEPRECATION")
        builder.setDeviceCredentialAllowed(true)
    } else {
        builder.setNegativeButton("取消", executor) { _, _ -> finish(false) }
    }
    try {
        builder.build().authenticate(signal, executor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = finish(true)

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                if (errorCode != BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED && errorCode != BiometricPrompt.BIOMETRIC_ERROR_CANCELED) {
                    Toast.makeText(this@promptDeviceAuthentication, errString ?: "身份验证失败", Toast.LENGTH_SHORT).show()
                }
                finish(false)
            }
        })
    } catch (_: RuntimeException) {
        finish(false)
    }
    return signal
}
