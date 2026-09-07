package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.components.dialog.AppSuccessModalCard
import cn.pxyb.mycontrol.ui.components.dialog.AppErrorModalCard

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.MimeTypeMap
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.ValueCallback
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.MainActivity
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.WebSessionStore
import cn.pxyb.mycontrol.data.AppPreferences
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.util.authenticateDevice
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.Job
import cn.pxyb.mycontrol.data.ExternalApplicationAutoLogin
import cn.pxyb.mycontrol.data.PlatformWebCookie
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import java.io.File
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PlatformWebActivity : ComponentActivity() {

    private var webViewInstance: WebView? = null
    private val sessionStore by lazy { SessionStore(this) }
    private var webOwner: String? = null
    private var webPrepared by mutableStateOf(false)
    private var webUnlocked by mutableStateOf(false)
    private var unlocking by mutableStateOf(false)
    private var unlockJob: Job? = null
    private lateinit var webDownloadSupport: PlatformWebDownloadSupport
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private val uploadCacheDirectory by lazy { File(cacheDir, "$WEBVIEW_UPLOAD_CACHE_DIR/${UUID.randomUUID()}") }

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = filePathCallback.also { filePathCallback = null } ?: return@registerForActivityResult
        val pickedUris = parsePickedUris(result.resultCode, result.data)
        if (pickedUris.isNullOrEmpty()) {
            callback.onReceiveValue(null)
            return@registerForActivityResult
        }
        lifecycleScope.launch {
            val cachedUris = withContext(Dispatchers.IO) { copyPickedUrisToCache(pickedUris) }
            if (isFinishing || isDestroyed) return@launch
            if (cachedUris == null) {
                statusFeedback = true to "照片读取失败，请重试或更换图片来源"
            }
            callback.onReceiveValue(cachedUris)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        webOwner = sessionStore.readActiveUsername()
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        webDownloadSupport = PlatformWebDownloadSupport(this, onFeedback = { isError, msg -> statusFeedback = isError to msg }) { webViewInstance }

        val initialUrl = intent.getStringExtra(EXTRA_URL).orEmpty()
        val initialTitle = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "管理后台" }
        val trustedDownloadUrl = intent.getStringExtra(EXTRA_TRUSTED_DOWNLOAD_URL)
        val autoLogin = intent.getStringExtra(EXTRA_AUTO_LOGIN_LOGIN_URL)?.takeIf { it.isNotBlank() }?.let { loginUrl ->
            ExternalApplicationAutoLogin(
                loginUrl = loginUrl,
                username = intent.getStringExtra(EXTRA_AUTO_LOGIN_USERNAME).orEmpty(),
                password = intent.getStringExtra(EXTRA_AUTO_LOGIN_PASSWORD).orEmpty(),
                homeUrl = intent.getStringExtra(EXTRA_AUTO_LOGIN_HOME_URL)?.takeIf { it.isNotBlank() },
            )
        }
        val initialCookies = intent.getStringArrayListExtra(EXTRA_INITIAL_COOKIE_URLS).orEmpty()
            .zip(intent.getStringArrayListExtra(EXTRA_INITIAL_COOKIE_VALUES).orEmpty())
            .mapNotNull { (url, value) ->
                if (url.startsWith("https://") && "=" in value) PlatformWebCookie(url, value) else null
            }

        setContent {
            val preference = remember { AppPreferences(this).themePreference() }
            val dark = when (preference) {
                AppThemePreference.System -> androidx.compose.foundation.isSystemInDarkTheme()
                AppThemePreference.Light -> false
                AppThemePreference.Dark -> true
            }
            MYControlTheme(darkTheme = dark) {
                Box(Modifier.fillMaxSize()) {
                    if (webPrepared) {
                        PlatformWebScreen(
                            initialUrl = initialUrl,
                            initialTitle = initialTitle,
                            trustedDownloadUrl = trustedDownloadUrl,
                            initialCookies = initialCookies,
                            autoLogin = autoLogin,
                            webDownloadSupport = webDownloadSupport,
                            onFinish = { finish() },
                            onWebViewCreated = {
                                webViewInstance = it
                                it.visibility = if (webUnlocked) View.VISIBLE else View.INVISIBLE
                            },
                            onShowFileChooser = ::showFileChooser,
                        )
                    }
                    if (!webUnlocked) {
                        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                            Column(
                                Modifier.padding(32.dp),
                                verticalArrangement = Arrangement.Center,
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text("验证身份后继续访问网页", style = MaterialTheme.typography.titleMedium)
                                AppButton("解锁网页", onClick = ::resumeProtectedPage, loading = unlocking)
                                AppSecondaryButton("返回应用", onClick = ::returnToApp)
                            }
                        }
                    }

                    statusFeedback?.let { (isError, msg) ->
                        if (isError) {
                            AppErrorModalCard(
                                title = "操作未完成",
                                error = msg,
                                onDismiss = { statusFeedback = null },
                            )
                        } else {
                            AppSuccessModalCard(
                                title = "操作成功",
                                message = msg,
                                onDismiss = { statusFeedback = null },
                                autoDismissMillis = 2800L,
                            )
                        }
                    }
                }
            }
        }
    }

    private fun returnToApp() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }

    private fun resumeProtectedPage() {
        if (unlockJob?.isActive == true) return
        unlockJob = lifecycleScope.launch {
            unlocking = true
            try {
                val valid = withContext(Dispatchers.IO) {
                    sessionStore.hasSession() && webOwner != null && sessionStore.readActiveUsername() == webOwner
                }
                if (!valid) {
                    returnToApp()
                    return@launch
                }
                if (sessionStore.isLocked()) {
                    webUnlocked = false
                    webViewInstance?.visibility = View.INVISIBLE
                    if (!authenticateDevice("解锁 MY Control", "验证身份后继续访问网页")) return@launch
                    val unlocked = withContext(Dispatchers.IO) { runCatching { sessionStore.unlock() }.getOrDefault(false) }
                    if (!unlocked) return@launch
                }
                WebSessionStore.awaitCleared()
                if (!lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return@launch
                if (!sessionStore.hasSession() || sessionStore.isLocked() || sessionStore.readActiveUsername() != webOwner) return@launch
                webPrepared = true
                webUnlocked = true
                webViewInstance?.visibility = View.VISIBLE
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } finally {
                unlocking = false
            }
        }
    }

    private fun showFileChooser(
        callback: ValueCallback<Array<Uri>>?,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        if (filePathCallback != null) {
            // 已有文件选择器在等待结果，忽略重复触发，避免取消当前选择
            return true
        }
        filePathCallback = callback

        return runCatching {
            fileChooserLauncher.launch(buildFileChooserIntent(params))
            true
        }.getOrElse {
            filePathCallback = null
            false
        }
    }

    /**
     * MIUI/HyperOS 上 GET_CONTENT 会打开自带照片选择器（com.android.photopicker），
     * 其结果在系统层投递时抛 NPE，网页端收不到所选文件（表现为点“完成”后无图）。
     * 改用标准 DocumentsUI（ACTION_OPEN_DOCUMENT），返回结果稳定可解析；选中的
     * content:// URI 由 copyPickedUrisToCache 复制到缓存后经 FileProvider 交给网页。
     * 注意：Android 11+ 包可见性过滤会拦截对 documentsui 的解析，必须在
     * AndroidManifest.xml 的 <queries> 中声明本 intent，否则 resolveActivity
     * 返回空并回退到 GET_CONTENT。
     */
    private fun buildFileChooserIntent(params: WebChromeClient.FileChooserParams): Intent {
        val acceptTypes = params.acceptTypes?.filter { it.isNotBlank() }.orEmpty()
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            if (acceptTypes.size == 1) {
                type = acceptTypes.first()
            } else {
                type = "*/*"
                if (acceptTypes.isNotEmpty()) {
                    putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes.toTypedArray())
                }
            }
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
        return intent.takeIf { it.resolveActivity(packageManager) != null } ?: params.createIntent()
    }


    /**
     * 部分系统（MIUI/HyperOS）选择器只通过 clipData 返回所选文件，
     * FileChooserParams.parseResult 解析为空，这里同时兼容 data 单文件和
     * clipData 多文件两种返回形式。
     */
    private fun parsePickedUris(resultCode: Int, data: Intent?): Array<Uri>? {
        if (resultCode != Activity.RESULT_OK || data == null) return null
        data.data?.let { return arrayOf(it) }
        val clip = data.clipData ?: return null
        val uris = (0 until clip.itemCount)
            .mapNotNull { clip.getItemAt(it).uri }
            .toTypedArray()
        return uris.takeIf { it.isNotEmpty() }
    }

    /**
     * 系统文件选择器（Android 13+ 照片选择器等）返回的 content:// URI 在部分设备/WebView
     * 版本上无法被网页 FileReader 读取，统一复制到应用缓存并用 FileProvider 重新提供，
     * 保证网页端能真正读到所选文件。
     */
    private fun copyPickedUrisToCache(uris: Array<Uri>): Array<Uri>? {
        val uploadsDir = uploadCacheDirectory.apply { mkdirs() }
        val cachedUris = uris.mapIndexedNotNull { index, uri ->
            runCatching {
                val mimeType = contentResolver.getType(uri) ?: "application/octet-stream"
                val extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType)
                    ?: mimeType.substringAfter('/', "").takeIf { it.matches(Regex("[a-zA-Z0-9]{1,10}")) }
                    ?: "bin"
                val target = File(uploadsDir, "upload-${System.currentTimeMillis()}-$index.$extension")
                contentResolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output) }
                } ?: error("无法读取所选文件")
                FileProvider.getUriForFile(this, "${packageName}.fileprovider", target)
            }.getOrNull()
        }
        return cachedUris.takeIf { it.isNotEmpty() }?.toTypedArray()
    }

    override fun onResume() {
        super.onResume()
        webViewInstance?.onResume()
        resumeProtectedPage()
    }

    override fun onPause() {
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        if (sessionStore.isLockEnabled()) {
            webUnlocked = false
            webViewInstance?.visibility = View.INVISIBLE
        }
        webViewInstance?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        unlockJob?.cancel()
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webViewInstance?.let { wv ->
            (wv.parent as? ViewGroup)?.removeView(wv)
            wv.stopLoading()
            wv.clearHistory()
            wv.destroy()
        }
        webViewInstance = null
        uploadCacheDirectory.deleteRecursively()
        if (isFinishing) {
            listOf(EXTRA_AUTO_LOGIN_USERNAME, EXTRA_AUTO_LOGIN_PASSWORD, EXTRA_INITIAL_COOKIE_URLS, EXTRA_INITIAL_COOKIE_VALUES)
                .forEach(intent::removeExtra)
        }
        super.onDestroy()
    }

    companion object {
        const val EXTRA_URL = "extra_url"
        const val EXTRA_TITLE = "extra_title"
        private const val EXTRA_TRUSTED_DOWNLOAD_URL = "extra_trusted_download_url"
        private const val EXTRA_INITIAL_COOKIE_URLS = "extra_initial_cookie_urls"
        private const val EXTRA_INITIAL_COOKIE_VALUES = "extra_initial_cookie_values"
        private const val EXTRA_AUTO_LOGIN_LOGIN_URL = "extra_auto_login_login_url"
        private const val EXTRA_AUTO_LOGIN_USERNAME = "extra_auto_login_username"
        private const val EXTRA_AUTO_LOGIN_PASSWORD = "extra_auto_login_password"
        private const val EXTRA_AUTO_LOGIN_HOME_URL = "extra_auto_login_home_url"
        private const val WEBVIEW_UPLOAD_CACHE_DIR = "webview-uploads"

        fun createIntent(
            context: Context,
            url: String,
            title: String? = null,
            trustedDownloadUrl: String? = null,
            initialCookies: List<PlatformWebCookie> = emptyList(),
            autoLogin: ExternalApplicationAutoLogin? = null,
        ): Intent {
            return Intent(context, PlatformWebActivity::class.java).apply {
                putExtra(EXTRA_URL, url)
                putExtra(EXTRA_TITLE, title)
                trustedDownloadUrl?.let { putExtra(EXTRA_TRUSTED_DOWNLOAD_URL, it) }
                autoLogin?.let {
                    putExtra(EXTRA_AUTO_LOGIN_LOGIN_URL, it.loginUrl)
                    putExtra(EXTRA_AUTO_LOGIN_USERNAME, it.username)
                    putExtra(EXTRA_AUTO_LOGIN_PASSWORD, it.password)
                    it.homeUrl?.let { homeUrl -> putExtra(EXTRA_AUTO_LOGIN_HOME_URL, homeUrl) }
                }
                if (initialCookies.isNotEmpty()) {
                    putStringArrayListExtra(EXTRA_INITIAL_COOKIE_URLS, ArrayList(initialCookies.map { it.url }))
                    putStringArrayListExtra(EXTRA_INITIAL_COOKIE_VALUES, ArrayList(initialCookies.map { it.value }))
                }
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PlatformWebScreen(
    initialUrl: String,
    initialTitle: String,
    trustedDownloadUrl: String?,
    initialCookies: List<PlatformWebCookie>,
    autoLogin: ExternalApplicationAutoLogin?,
    webDownloadSupport: PlatformWebDownloadSupport,
    onFinish: () -> Unit,
    onWebViewCreated: (WebView) -> Unit,
    onShowFileChooser: (
        ValueCallback<Array<Uri>>?,
        WebChromeClient.FileChooserParams,
    ) -> Boolean,
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var pageLoading by remember { mutableStateOf(true) }
    var loadProgress by remember { mutableFloatStateOf(0f) }
    var canGoBack by remember { mutableStateOf(false) }
    var restoredInitialHash by remember { mutableStateOf(false) }

    BackHandler {
        if (webView?.canGoBack() == true) {
            webView?.goBack()
        } else {
            onFinish()
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background,
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            // 1. 原生全屏沉浸 WebView 容器
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    WebView(context).apply {
                        layoutParams = ViewGroup.LayoutParams(
                            ViewGroup.LayoutParams.MATCH_PARENT,
                            ViewGroup.LayoutParams.MATCH_PARENT,
                        )
                        isVerticalScrollBarEnabled = true
                        isHorizontalScrollBarEnabled = false

                        // Cookie 管理器配置
                        CookieManager.getInstance().let { cm ->
                            cm.setAcceptCookie(true)
                            cm.setAcceptThirdPartyCookies(this, true)
                            initialCookies.forEach { cookie ->
                                cm.setCookie(cookie.url, cookie.value)
                            }
                            cm.flush()
                        }

                        settings.apply {
                            javaScriptEnabled = true
                            domStorageEnabled = true
                            databaseEnabled = true
                            useWideViewPort = true
                            loadWithOverviewMode = true
                            setSupportZoom(false)
                            displayZoomControls = false
                            builtInZoomControls = false
                            allowFileAccess = false
                            allowContentAccess = true
                            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            cacheMode = WebSettings.LOAD_DEFAULT
                            defaultTextEncodingName = "UTF-8"
                        }

                        if (BuildConfig.DEBUG) {
                            WebView.setWebContentsDebuggingEnabled(true)
                        }

                        webDownloadSupport.attachTo(this, trustedDownloadUrl)

                        webViewClient = object : WebViewClient() {
                            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                super.onPageStarted(view, url, favicon)
                                pageLoading = true
                                canGoBack = view?.canGoBack() == true
                            }

                            override fun onPageFinished(view: WebView?, url: String?) {
                                super.onPageFinished(view, url)
                                if (shouldRestoreInitialHash(initialUrl, url, restoredInitialHash)) {
                                    restoredInitialHash = true
                                    view?.loadUrl(initialUrl)
                                    return
                                }
                                if (autoLogin != null && isAutoLoginPage(url, autoLogin.loginUrl)) {
                                    view?.evaluateJavascript(
                                        buildAutoLoginScript(autoLogin),
                                        null,
                                    )
                                }
                                pageLoading = false
                                canGoBack = view?.canGoBack() == true
                            }

                            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                                val uri = request?.url ?: return false
                                val scheme = uri.scheme?.lowercase() ?: return false
                                if (scheme == "http" || scheme == "https") {
                                    return false // 在当前 WebView 内部直接加载
                                }
                                return runCatching {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    true
                                }.getOrDefault(false)
                            }
                        }

                        webChromeClient = object : WebChromeClient() {
                            override fun onShowFileChooser(
                                view: WebView?,
                                filePathCallback: ValueCallback<Array<Uri>>?,
                                fileChooserParams: WebChromeClient.FileChooserParams?,
                            ): Boolean {
                                val params = fileChooserParams ?: return false
                                return onShowFileChooser(filePathCallback, params)
                            }

                            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                                loadProgress = newProgress / 100f
                                if (newProgress >= 100) {
                                    pageLoading = false
                                }
                                canGoBack = view?.canGoBack() == true
                            }
                        }

                        webView = this
                        onWebViewCreated(this)
                        loadUrl(initialUrl)
                    }
                    },
                )

            // 2. 极简悬浮微加载条（仅在页面加载时显示，0 高度占用）
            AnimatedVisibility(
                visible = pageLoading && loadProgress < 1f,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.align(Alignment.TopCenter),
            ) {
                LinearProgressIndicator(
                    progress = { loadProgress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(2.5.dp),
                    color = MaterialTheme.colorScheme.primary,
                    trackColor = Color.Transparent,
                )
            }
        }
    }
}

private fun shouldRestoreInitialHash(initialUrl: String, currentUrl: String?, alreadyRestored: Boolean): Boolean {
    if (alreadyRestored || currentUrl.isNullOrBlank()) return false
    val initialHashIndex = initialUrl.indexOf('#')
    if (initialHashIndex <= 0 || '#' in currentUrl) return false
    return currentUrl == initialUrl.substring(0, initialHashIndex)
}

private fun isAutoLoginPage(currentUrl: String?, loginUrl: String): Boolean {
    if (currentUrl.isNullOrBlank()) return false
    return runCatching {
        val current = Uri.parse(currentUrl)
        val target = Uri.parse(loginUrl)
        current.host.equals(target.host, ignoreCase = true) && current.path == target.path
    }.getOrDefault(false)
}

private fun escapeAutoLoginValue(value: String): String = value
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")
    .replace("\r", "\\r")
    .replace("\n", "\\n")

private fun buildAutoLoginScript(autoLogin: ExternalApplicationAutoLogin): String {
    val username = escapeAutoLoginValue(autoLogin.username)
    val password = escapeAutoLoginValue(autoLogin.password)
    val homeUrl = autoLogin.homeUrl?.let { escapeAutoLoginValue(it) }
    return buildString {
        append("(function () {")
        append("if (window.__my_auto_login_done) return;")
        append("window.__my_auto_login_done = true;")
        append("var body = new URLSearchParams();")
        append("body.set('user', \"$username\");")
        append("body.set('pass', \"$password\");")
        append("fetch('/apisub.php?act=login', {")
        append("method: 'POST',")
        append("headers: { 'Content-Type': 'application/x-www-form-urlencoded' },")
        append("body: body.toString(),")
        append("credentials: 'include'")
        append("}).then(function (r) { return r.json(); }).then(function (d) {")
        append("if (d && d.code === 1) {")
        if (homeUrl != null) {
            append("location.href = \"$homeUrl\";")
        } else {
            append("location.reload();")
        }
        append("} else { window.__my_auto_login_done = false; }")
        append("}).catch(function () { window.__my_auto_login_done = false; });")
        append("})();")
    }
}
