package cn.pxyb.mycontrol.ui

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import cn.pxyb.mycontrol.ui.theme.MYControlTheme

class PlatformWebActivity : ComponentActivity() {

    private var webViewInstance: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val initialUrl = intent.getStringExtra(EXTRA_URL).orEmpty()
        val initialTitle = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "管理后台" }

        setContent {
            MYControlTheme {
                PlatformWebScreen(
                    initialUrl = initialUrl,
                    initialTitle = initialTitle,
                    onFinish = { finish() },
                    onWebViewCreated = { webViewInstance = it },
                )
            }
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

        fun createIntent(context: Context, url: String, title: String? = null): Intent {
            return Intent(context, PlatformWebActivity::class.java).apply {
                putExtra(EXTRA_URL, url)
                putExtra(EXTRA_TITLE, title)
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun PlatformWebScreen(
    initialUrl: String,
    initialTitle: String,
    onFinish: () -> Unit,
    onWebViewCreated: (WebView) -> Unit,
) {
    var webView by remember { mutableStateOf<WebView?>(null) }
    var pageLoading by remember { mutableStateOf(true) }
    var loadProgress by remember { mutableFloatStateOf(0f) }
    var canGoBack by remember { mutableStateOf(false) }

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
                .navigationBarsPadding(),
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
                                allowContentAccess = false
                                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                                cacheMode = WebSettings.LOAD_DEFAULT
                                defaultTextEncodingName = "UTF-8"
                            }

                            webViewClient = object : WebViewClient() {
                                override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                                    super.onPageStarted(view, url, favicon)
                                    pageLoading = true
                                    canGoBack = view?.canGoBack() == true
                                }

                                override fun onPageFinished(view: WebView?, url: String?) {
                                    super.onPageFinished(view, url)
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
