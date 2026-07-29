package cn.pxyb.mycontrol

import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.remember
import androidx.lifecycle.viewmodel.compose.viewModel
import cn.pxyb.mycontrol.ui.AppViewModel
import cn.pxyb.mycontrol.ui.MyControlApp
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import java.util.concurrent.Executor

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MYControlTheme {
                val appViewModel: AppViewModel = viewModel()
                val biometricRequest = remember { { promptForUnlock(appViewModel::unlockSession) } }
                MyControlApp(
                    viewModel = appViewModel,
                    onBiometricUnlock = biometricRequest,
                )
            }
        }
    }

    private fun promptForUnlock(onSuccess: () -> Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            onSuccess()
            return
        }
        val manager = getSystemService(BiometricManager::class.java)
        if (manager?.canAuthenticate() != BiometricManager.BIOMETRIC_SUCCESS) {
            Toast.makeText(this, "设备未配置生物识别，请改用平台账号登录。", Toast.LENGTH_LONG).show()
            return
        }
        val executor = Executor { command -> runOnUiThread(command) }
        val prompt = BiometricPrompt.Builder(this)
            .setTitle("解锁 MY Control")
            .setSubtitle("验证身份后继续访问统一平台")
            .setNegativeButton("取消", executor) { _, _ -> }
            .build()
        prompt.authenticate(
            CancellationSignal(),
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
                    if (errorCode != BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED &&
                        errorCode != BiometricPrompt.BIOMETRIC_ERROR_CANCELED
                    ) {
                        Toast.makeText(this@MainActivity, errString ?: "身份验证失败", Toast.LENGTH_SHORT).show()
                    }
                }
            },
        )
    }
}
