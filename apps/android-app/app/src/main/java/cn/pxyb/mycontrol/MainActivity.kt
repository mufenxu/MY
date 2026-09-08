package cn.pxyb.mycontrol

import android.content.Intent
import android.Manifest
import android.content.pm.PackageManager
import android.app.PendingIntent
import android.content.IntentFilter
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
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
import androidx.lifecycle.lifecycleScope
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.ui.AppViewModel
import cn.pxyb.mycontrol.ui.MyControlApp
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import cn.pxyb.mycontrol.data.AppPreferences
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.data.SessionStore
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import cn.pxyb.mycontrol.util.authenticateDevice
import cn.pxyb.mycontrol.util.promptDeviceAuthentication

class MainActivity : ComponentActivity() {
    private val appViewModel: AppViewModel by viewModels()
    private val credentialManager by lazy { CredentialManager.create(this) }
    private val alertNotifier by lazy { AlertNotifier(this) }
    private val sessionStore by lazy { SessionStore(this) }
    private val nfcAdapter by lazy { NfcAdapter.getDefaultAdapter(this) }
    private var pendingNfcScene: Pair<String, String>? = null
    private var notificationsEnabled = mutableStateOf(false)
    private val permissionPreferences by lazy { getSharedPreferences("permission_requests", MODE_PRIVATE) }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted -> notificationsEnabled.value = granted && NotificationManagerCompat.from(this).areNotificationsEnabled() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleOpenIntent(intent)
        enableEdgeToEdge()
        setContent {
            val appPreferences = remember { AppPreferences(this) }
            val themePreference = remember { mutableStateOf(appPreferences.themePreference()) }
            val useDarkTheme = when (themePreference.value) {
                AppThemePreference.System -> androidx.compose.foundation.isSystemInDarkTheme()
                AppThemePreference.Light -> false
                AppThemePreference.Dark -> true
            }
            MYControlTheme(darkTheme = useDarkTheme) {
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
                    onWriteNfcScene = ::beginNfcSceneWrite,
                    themePreference = themePreference.value,
                    onThemePreferenceChange = { preference ->
                        appPreferences.setThemePreference(preference)
                        themePreference.value = preference
                    },
                    showInitialSetup = appPreferences.shouldShowInitialSetup(),
                    onInitialSetupComplete = appPreferences::completeInitialSetup,
                )
            }
        }
        lifecycleScope.launch(Dispatchers.Default) {
            alertNotifier.ensureChannel()
            OperationalSyncScheduler.schedule(this@MainActivity)
            DailyBriefScheduler.schedule(this@MainActivity, sessionStore.readActiveUsername())
        }
    }

    override fun onStart() {
        super.onStart()
        if (sessionStore.isLocked()) appViewModel.lockSession()
        appViewModel.setAppInForeground(true)
        notificationsEnabled.value = hasNotificationPermission()
    }

    override fun onStop() {
        appViewModel.setAppInForeground(false)
        super.onStop()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleOpenIntent(intent)
    }

    private suspend fun requestPasskey(requestJson: String): String {
        AppSessionLifecycle.beginAuthentication()
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
        } catch (error: NoCredentialException) {
            throw IllegalStateException("设备中没有可用的 Passkey，请先在账号安全设置中绑定。", error)
        } catch (error: GetCredentialCancellationException) {
            throw IllegalStateException("Passkey 验证已取消。", error)
        } catch (error: GetCredentialUnsupportedException) {
            throw IllegalStateException("当前设备或系统不支持 Passkey 登录。", error)
        } catch (error: GetCredentialProviderConfigurationException) {
            throw IllegalStateException("系统 Passkey 服务未正确配置，请确认设备已启用密码管理器后重试。", error)
        } catch (error: GetCredentialInterruptedException) {
            throw IllegalStateException("系统 Passkey 验证被中断，请重试。", error)
        } catch (error: GetCredentialException) {
            throw IllegalStateException("Passkey 验证失败，请检查设备中的 Passkey 和域名关联后重试。", error)
        } finally {
            AppSessionLifecycle.endAuthentication()
        }
    }

    private suspend fun requestPasskeyRegistration(requestJson: String): String {
        AppSessionLifecycle.beginAuthentication()
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
        } finally {
            AppSessionLifecycle.endAuthentication()
        }
    }

    private fun promptForUnlock(onSuccess: () -> Unit) {
        promptDeviceAuthentication(
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
        authenticateDevice(title, subtitle)

    private fun requestNotificationPermissionIfNeeded() {
        if (hasNotificationPermission()) return
        val permissionGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val canRequest = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            (!permissionPreferences.getBoolean("notifications_requested", false) ||
                shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS))
        if (!permissionGranted && canRequest) {
            permissionPreferences.edit().putBoolean("notifications_requested", true).apply()
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
            )
        }
    }

    override fun onResume() {
        super.onResume()
        notificationsEnabled.value = hasNotificationPermission()
        // 前台活跃时清除安全遮蔽，保证用户正常截屏与使用
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (pendingNfcScene != null) enableNfcForegroundDispatch()
    }

    override fun onPause() {
        // 切出到多任务列表预览时自动加上安全标记，防止Recent Apps系统缩略图泄露敏感凭据与会话
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        runCatching { nfcAdapter?.disableForegroundDispatch(this) }
        super.onPause()
    }

    private fun hasNotificationPermission(): Boolean =
        (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
            NotificationManagerCompat.from(this).areNotificationsEnabled()

    private fun handleOpenIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action == NfcAdapter.ACTION_TAG_DISCOVERED ||
            intent.action == NfcAdapter.ACTION_TECH_DISCOVERED ||
            intent.action == NfcAdapter.ACTION_NDEF_DISCOVERED
        ) {
            writePendingScene(intent)
            return
        }
        if (intent.action == Intent.ACTION_SEND && intent.type == "text/plain") {
            appViewModel.openSharedTodo(
                subject = intent.getStringExtra(Intent.EXTRA_SUBJECT),
                text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString(),
            )
            return
        }
        val data = intent.data
        if (data != null) {
            appViewModel.handleOpenIntent(data)
            return
        }
        val tab = intent.getStringExtra(DeepLinks.EXTRA_TAB)
        val taskId = intent.getStringExtra(DeepLinks.EXTRA_TASK_ID)
        if (!tab.isNullOrBlank() || !taskId.isNullOrBlank()) {
            appViewModel.openOperationalTarget(
                tab = DeepLinks.parseTab(tab),
                taskId = taskId,
            )
        }
    }

    private fun beginNfcSceneWrite(sceneId: String, sceneName: String) {
        val adapter = nfcAdapter
        if (adapter == null) {
            Toast.makeText(this, "当前设备不支持 NFC。", Toast.LENGTH_LONG).show()
            return
        }
        if (!adapter.isEnabled) {
            Toast.makeText(this, "请先开启 NFC，再把标签贴近手机。", Toast.LENGTH_LONG).show()
            startActivity(Intent(Settings.ACTION_NFC_SETTINGS))
            return
        }
        pendingNfcScene = sceneId to sceneName
        enableNfcForegroundDispatch()
        Toast.makeText(this, "请将 NFC 标签贴近手机，写入“$sceneName”。", Toast.LENGTH_LONG).show()
    }

    private fun enableNfcForegroundDispatch() {
        val pendingIntent = PendingIntent.getActivity(
            this,
            64001,
            Intent(this, javaClass).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        val filters = arrayOf(
            IntentFilter(NfcAdapter.ACTION_TAG_DISCOVERED),
            IntentFilter(NfcAdapter.ACTION_NDEF_DISCOVERED),
        )
        nfcAdapter?.enableForegroundDispatch(this, pendingIntent, filters, null)
    }

    private fun writePendingScene(intent: Intent) {
        val (sceneId, sceneName) = pendingNfcScene ?: return
        val tag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG, Tag::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(NfcAdapter.EXTRA_TAG)
        } ?: return
        val uri = DeepLinks.openIntent(this, destination = "scenes", sceneId = sceneId).data ?: return
        val message = NdefMessage(arrayOf(NdefRecord.createUri(uri)))
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val ndef = Ndef.get(tag)
                    if (ndef != null) {
                        ndef.connect()
                        try {
                            require(ndef.isWritable) { "这个 NFC 标签是只读的。" }
                            require(ndef.maxSize >= message.toByteArray().size) { "NFC 标签容量不足。" }
                            ndef.writeNdefMessage(message)
                        } finally {
                            ndef.close()
                        }
                    } else {
                        val formatable = NdefFormatable.get(tag) ?: error("这个 NFC 标签不支持 NDEF 写入。")
                        formatable.connect()
                        try {
                            formatable.format(message)
                        } finally {
                            formatable.close()
                        }
                    }
                }
            }
            if (result.isSuccess) {
                pendingNfcScene = null
                runCatching { nfcAdapter?.disableForegroundDispatch(this@MainActivity) }
                Toast.makeText(this@MainActivity, "“$sceneName”已写入 NFC 标签。", Toast.LENGTH_LONG).show()
            } else {
                Toast.makeText(this@MainActivity, result.exceptionOrNull()?.message ?: "NFC 写入失败，请重试。", Toast.LENGTH_LONG).show()
            }
        }
    }
}
