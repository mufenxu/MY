package cn.pxyb.mycontrol.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import cn.pxyb.mycontrol.data.ExternalApplicationAutoLogin
import cn.pxyb.mycontrol.data.PlatformWebCookie
import cn.pxyb.mycontrol.ui.theme.MYControlTheme

class PlatformWebActivity : ComponentActivity() {

    private var webViewInstance: WebView? = null
    private lateinit var webDownloadSupport: PlatformWebDownloadSupport
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val callback = filePathCallback.also { filePathCallback = null } ?: return@registerForActivityResult
        callback.onReceiveValue(
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data),
        )
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        webDownloadSupport = PlatformWebDownloadSupport(this) { webViewInstance }

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
            MYControlTheme {
                PlatformWebScreen(
                    initialUrl = initialUrl,
                    initialTitle = initialTitle,
                    trustedDownloadUrl = trustedDownloadUrl,
                    initialCookies = initialCookies,
                    autoLogin = autoLogin,
                    webDownloadSupport = webDownloadSupport,
                    onFinish = { finish() },
                    onWebViewCreated = { webViewInstance = it },
                    onShowFileChooser = ::showFileChooser,
                )
            }
        }
    }

    private fun showFileChooser(
        callback: ValueCallback<Array<Uri>>?,
        params: WebChromeClient.FileChooserParams,
    ): Boolean {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = callback

        return runCatching {
            fileChooserLauncher.launch(params.createIntent())
            true
        }.getOrElse {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = null
            false
        }
    }

    override fun onResume() {
        super.onResume()
        webViewInstance?.onResume()
    }

    override fun onPause() {
        webViewInstance?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        filePathCallback?.onReceiveValue(null)
        filePathCallback = null
        webViewInstance?.let { wv ->
            (wv.parent as? ViewGroup)?.removeView(wv)
            wv.stopLoading()
            wv.clearHistory()
            wv.destroy()
        }
        webViewInstance = null
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
