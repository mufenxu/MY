package cn.pxyb.mycontrol.ui.feature.unicom

import android.annotation.SuppressLint
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppLinearProgressIndicator
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.delay

private const val CAPTCHA_ORIGIN = "https://turing.captcha.qcloud.com/"

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun UnicomCaptchaDialog(onDismiss: () -> Unit, onVerified: (String, String) -> Unit) {
    var revision by remember { mutableIntStateOf(0) }
    var loading by remember(revision) { mutableStateOf(true) }
    var error by remember(revision) { mutableStateOf<String?>(null) }
    val state = remember(revision) { UUID.randomUUID().toString() }
    val active = remember(revision) { AtomicBoolean(true) }
    val verifiedCallback by rememberUpdatedState(onVerified)
    val dismissCallback by rememberUpdatedState(onDismiss)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val dismiss = { active.set(false); dismissCallback() }
    DisposableEffect(lifecycle, active) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_PAUSE) { active.set(false); dismissCallback() }
        }
        lifecycle.addObserver(observer)
        onDispose { active.set(false); lifecycle.removeObserver(observer) }
    }
    LaunchedEffect(revision) {
        delay(20000)
        if (loading) { loading = false; error = "安全验证加载超时，请重试。" }
    }
    AppDialog(
        title = "联通安全验证", subtitle = "请手动完成图形验证，完成后发送短信验证码。",
        onDismissRequest = dismiss,
        footer = { AppDialogSecondaryButton("取消验证", dismiss, modifier = Modifier.fillMaxWidth()) },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (loading) AppLinearProgressIndicator(Modifier.fillMaxWidth())
            key(revision) {
                AndroidView(
                    modifier = Modifier.fillMaxWidth().height(360.dp),
                    factory = { context ->
                        WebView(context).apply {
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
                                    if (!request.isForMainFrame) {
                                        val host = uri.host.orEmpty()
                                        return uri.scheme != "https" || !(host.endsWith(".captcha.qcloud.com") || host.endsWith(".captcha.qq.com"))
                                    }
                                    if (uri.scheme != "mycontrol-unicom" || uri.host != "captcha") return true
                                    if (!active.get() || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return true
                                    val source = Uri.parse(view.url.orEmpty())
                                    if (source.scheme != "https" || source.authority != "turing.captcha.qcloud.com" || source.path != "/") return true
                                    val values = Uri.Builder().scheme("https").authority("callback").encodedQuery(uri.encodedFragment).build()
                                    if (values.getQueryParameter("state") != state) return true
                                    when (values.getQueryParameter("status")) {
                                        "ready" -> { loading = false; error = null }
                                        "error" -> { loading = false; error = "安全验证加载失败，请重试。" }
                                        "verified" -> {
                                            val ticket = values.getQueryParameter("ticket").orEmpty()
                                            val randStr = values.getQueryParameter("randStr").orEmpty()
                                            if (ticket.isNotBlank() && ticket.length <= 4096 && randStr.isNotBlank() && randStr.length <= 512 && active.compareAndSet(true, false)) {
                                                verifiedCallback(ticket, randStr)
                                            }
                                        }
                                    }
                                    return true
                                }
                                override fun onReceivedError(view: WebView, request: WebResourceRequest, webError: WebResourceError) {
                                    if (request.isForMainFrame && active.get()) { loading = false; error = "安全验证服务暂不可用，请重试。" }
                                }
                            }
                            loadDataWithBaseURL(CAPTCHA_ORIGIN, unicomCaptchaHtml(state), "text/html", "utf-8", CAPTCHA_ORIGIN)
                        }
                    },
                    onReset = null,
                    onRelease = { active.set(false); it.stopLoading(); it.destroy() },
                )
            }
            error?.let { message -> AppFeedbackBanner(message, error = true, onRetry = { active.set(false); revision++ }, autoDismissDurationMillis = null) }
        }
    }
}

private fun unicomCaptchaHtml(state: String) = """
    <!doctype html><html lang="zh-CN"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="referrer" content="no-referrer">
    <style>html,body{margin:0;padding:0;background:transparent}</style>
    </head><body><div id="captcha"></div><script>
    function report(status,ticket,randStr){
        window.location.href='mycontrol-unicom://captcha#state=$state&status='+status
            +'&ticket='+encodeURIComponent(ticket||'')+'&randStr='+encodeURIComponent(randStr||'');
    }
    function start(){try{
        var widget=new TencentCaptcha(document.getElementById('captcha'),'195809716',function(r){
            if(r.ret===0&&r.ticket&&r.randstr&&!r.errorCode)report('verified',r.ticket,r.randstr);
            else report('error');
        },{type:'embed',showHeader:false,userLanguage:'zh-cn',needFeedBack:false,ready:function(){report('ready')}});
        widget.show();
    }catch(e){report('error')}}
    </script><script src="https://turing.captcha.qcloud.com/TJCaptcha.js" onload="start()" onerror="report('error')"></script>
    </body></html>
""".trimIndent()
