package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.delay

private const val CAPTCHA_ORIGIN = "https://captcha.chaoxing.com/"

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun ChaoxingCaptchaDialog(onDismiss: () -> Unit, onVerified: (String) -> Unit) {
    var revision by remember { mutableIntStateOf(0) }
    var loading by remember(revision) { mutableStateOf(true) }
    var error by remember(revision) { mutableStateOf<String?>(null) }
    val callbackState = remember(revision) { UUID.randomUUID().toString() }
    val callbackActive = remember(revision) { AtomicBoolean(true) }
    val verifiedCallback by rememberUpdatedState(onVerified)
    val dismissCallback by rememberUpdatedState(onDismiss)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val dismiss = {
        callbackActive.set(false)
        dismissCallback()
    }
    DisposableEffect(lifecycle, callbackActive) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) {
                callbackActive.set(false)
                dismissCallback()
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            callbackActive.set(false)
            lifecycle.removeObserver(observer)
        }
    }
    LaunchedEffect(revision) {
        delay(20_000)
        if (loading) {
            loading = false
            error = "学习通验证加载超时，请重试。"
        }
    }
    AppDialog(
        title = "学习通安全验证",
        subtitle = "完成验证后，将继续本次签到。",
        onDismissRequest = dismiss,
        footer = { AppDialogSecondaryButton("取消验证", dismiss, modifier = Modifier.fillMaxWidth()) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            key(revision) {
                AndroidView(
                    modifier = Modifier.fillMaxWidth().height(360.dp),
                    factory = { context ->
                        WebView(context).apply {
                            setBackgroundColor(android.graphics.Color.TRANSPARENT)
                            settings.javaScriptEnabled = true
                            settings.domStorageEnabled = true
                            settings.allowFileAccess = false
                            settings.allowContentAccess = false
                            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            settings.cacheMode = WebSettings.LOAD_NO_CACHE
                            CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                            webViewClient = object : WebViewClient() {
                                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                                    val uri = request.url
                                    if (!request.isForMainFrame) return uri.scheme != "https" || uri.host != "captcha.chaoxing.com"
                                    if (uri.scheme != "mycontrol-chaoxing" || uri.host != "captcha") return true
                                    if (!callbackActive.get() || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return true
                                    val source = Uri.parse(view.url.orEmpty())
                                    if (source.scheme != "https" || source.authority != "captcha.chaoxing.com" || source.path != "/") return true
                                    val values = Uri.Builder().scheme("https").authority("callback").encodedQuery(uri.encodedFragment).build()
                                    if (values.getQueryParameter("state") != callbackState) return true
                                    when (values.getQueryParameter("status")) {
                                        "ready" -> { loading = false; error = null }
                                        "error" -> { loading = false; error = "学习通验证加载失败，请重试。" }
                                        "verified" -> {
                                            val validate = values.getQueryParameter("validate").orEmpty()
                                            if (validate.isNotBlank() && validate.length <= 8192 && callbackActive.compareAndSet(true, false)) {
                                                verifiedCallback(validate)
                                            }
                                        }
                                    }
                                    return true
                                }

                                override fun onReceivedError(view: WebView, request: WebResourceRequest, failure: WebResourceError) {
                                    if (request.isForMainFrame && callbackActive.get()) {
                                        loading = false
                                        error = "学习通验证页面加载失败，请重试。"
                                    }
                                }

                                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                                    if (request.isForMainFrame && callbackActive.get()) {
                                        loading = false
                                        error = "学习通验证服务暂不可用，请重试。"
                                    }
                                }
                            }
                            // Keep the official SDK on its own origin, separate from the MY web session.
                            loadDataWithBaseURL(CAPTCHA_ORIGIN, captchaHtml(callbackState), "text/html", "utf-8", CAPTCHA_ORIGIN)
                        }
                    },
                    onReset = null,
                    onRelease = { callbackActive.set(false); it.stopLoading(); it.destroy() },
                )
            }
            error?.let { message ->
                AppFeedbackBanner(message, error = true, onRetry = { callbackActive.set(false); revision++ }, autoDismissDurationMillis = null)
            }
        }
    }
}

private fun captchaHtml(state: String) = """
    <!doctype html>
    <html lang="zh-CN">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>html, body { margin: 0; padding: 0; background: transparent; }</style>
    </head>
    <body>
        <div id="captcha"></div>
        <script>
            function reportCaptcha(status, validate) {
                window.location.href = 'mycontrol-chaoxing://captcha#state=$state&status=' + status
                    + '&validate=' + encodeURIComponent(validate || '');
            }
            function startCaptcha() {
                try {
                    initCXCaptcha({
                        captchaId: 'Qt9FIw9o4pwRjOyqM6yizZBh682qN2TU',
                        element: '#captcha',
                        mode: 'popup',
                        type: 'slide',
                        onVerify: function (err, data) {
                            if (!err && data && data.validate) reportCaptcha('verified', data.validate);
                        }
                    }, function (instance) {
                        instance.popUp();
                        reportCaptcha('ready');
                    }, function () { reportCaptcha('error'); });
                } catch (_) { reportCaptcha('error'); }
            }
        </script>
        <script src="https://captcha.chaoxing.com/load.min.js" onload="startCaptcha()" onerror="reportCaptcha('error')"></script>
    </body>
    </html>
""".trimIndent()
