package cn.pxyb.mycontrol.ui

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.provider.DocumentsContract
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.WebMessage
import android.webkit.WebMessagePort
import android.webkit.URLUtil
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.lifecycle.lifecycleScope
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.CancellationException
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import java.io.File
import java.util.UUID
import org.json.JSONObject

internal class PlatformWebDownloadSupport(
    private val activity: PlatformWebActivity,
    private val currentWebView: () -> WebView?,
) {
    private var pendingLegacyImage: PendingImage? = null
    private var imageDownloadOrigin: String? = null
    private var imageDownloadPort: WebMessagePort? = null
    private var pendingDownload: PendingDownload? = null

    private val createDownloadDocument = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument("*/*"),
    ) { destination ->
        val download = pendingDownload.also { pendingDownload = null } ?: return@registerForActivityResult
        if (destination == null) return@registerForActivityResult
        activity.lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) { saveDownload(download, destination) }
                showToast("文件已保存")
            } catch (error: Exception) {
                runCatching { DocumentsContract.deleteDocument(activity.contentResolver, destination) }
                if (error is CancellationException) throw error
                showToast("安全下载失败，请确认网络与登录状态后重试")
            }
        }
    }

    private val createImageDocument = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument("image/*"),
    ) { uri ->
        val pending = pendingLegacyImage.also { pendingLegacyImage = null } ?: return@registerForActivityResult
        if (uri == null) return@registerForActivityResult
        activity.lifecycleScope.launch {
            val saved = withContext(Dispatchers.IO) {
                runCatching {
                    activity.contentResolver.openOutputStream(uri)?.use { it.write(pending.bytes) }
                        ?: error("无法打开保存位置")
                }.isSuccess
            }
            showToast(if (saved) "图片已保存" else "图片保存失败，请重试")
        }
    }

    fun attachTo(webView: WebView, trustedDownloadUrl: String?) {
        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            enqueueHttpDownload(url, userAgent, contentDisposition, mimeType)
        }

        imageDownloadOrigin = normalizedHttpsOrigin(trustedDownloadUrl)
    }

    fun closeMessagePort() {
        imageDownloadPort?.close()
        imageDownloadPort = null
    }

    fun close() {
        closeMessagePort()
        pendingDownload = null
        pendingLegacyImage = null
    }

    fun connectImageDownloadPort(webView: WebView) {
        closeMessagePort()
        val origin = imageDownloadOrigin ?: return
        if (normalizedHttpsOrigin(webView.url) != origin) return
        val handshake = "my-download-${UUID.randomUUID()}"
        val ports = webView.createWebMessageChannel()
        imageDownloadPort = ports[0]
        ports[0].setWebMessageCallback(object : WebMessagePort.WebMessageCallback() {
            override fun onMessage(port: WebMessagePort, message: WebMessage) {
                val raw = message.data ?: return
                if (raw.length > MAX_DATA_URL_LENGTH + 1024) return
                val payload = runCatching { JSONObject(raw) }.getOrNull() ?: return
                acceptImageDownload(origin, payload.optString("dataUrl"), payload.optString("fileName"))
            }
        })
        // Transfer the capability only to the trusted top frame, never to every iframe as a JS interface would.
        webView.evaluateJavascript("""
            (function () {
              function connect(event) {
                if (event.data !== ${JSONObject.quote(handshake)} || event.ports.length !== 1) return;
                window.removeEventListener('message', connect);
                var port = event.ports[0];
                window.$BRIDGE_NAME = { saveImage: function (dataUrl, fileName) {
                  port.postMessage(JSON.stringify({dataUrl: dataUrl, fileName: fileName}));
                }};
              }
              window.addEventListener('message', connect);
            })();
        """.trimIndent()) {
            if (imageDownloadPort === ports[0] && normalizedHttpsOrigin(webView.url) == origin) {
                webView.postWebMessage(WebMessage(handshake, arrayOf(ports[1])), Uri.parse(origin))
            } else {
                ports[1].close()
            }
        }
    }

    private fun enqueueHttpDownload(
        rawUrl: String?,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        val url = rawUrl?.toHttpUrlOrNull() ?: return
        if (!url.isHttps || url.username.isNotEmpty() || url.password.isNotEmpty()) {
            showToast("为保护下载内容，仅支持 HTTPS 下载")
            return
        }

        val fileName = safeFileName(URLUtil.guessFileName(rawUrl, contentDisposition, mimeType), mimeType)
        val sameOrigin = normalizedHttpsOrigin(rawUrl) == normalizedHttpsOrigin(currentWebView()?.url)
        pendingDownload = PendingDownload(url.toString(), userAgent,
            if (sameOrigin) CookieManager.getInstance().getCookie(rawUrl)?.takeIf { it.isNotBlank() } else null)
        runCatching { createDownloadDocument.launch(fileName) }.onFailure {
            pendingDownload = null
            showToast("无法打开文件保存位置")
        }
    }

    private suspend fun saveDownload(download: PendingDownload, destination: Uri) {
        val client = HttpClientProvider.newBuilder().followRedirects(false).followSslRedirects(false).build()
        var url = requireNotNull(download.url.toHttpUrlOrNull())
        repeat(6) {
            currentCoroutineContext().ensureActive()
            val request = Request.Builder().url(url).get()
            download.userAgent?.let { request.header("User-Agent", it) }
            download.cookie?.let { request.header("Cookie", it) }
            client.newCall(request.build()).execute().use { response ->
                if (response.code in setOf(301, 302, 303, 307, 308)) {
                    val redirected = response.header("Location")?.let(url::resolve) ?: error("下载重定向无效")
                    require(redirected.isHttps && redirected.username.isEmpty() && redirected.password.isEmpty())
                    if (download.cookie != null) require(normalizedHttpsOrigin(redirected.toString()) == normalizedHttpsOrigin(download.url))
                    url = redirected
                } else {
                    check(response.isSuccessful) { "下载失败" }
                    val body = requireNotNull(response.body)
                    activity.contentResolver.openOutputStream(destination, "w")?.use { output ->
                        body.byteStream().use { input ->
                            val buffer = ByteArray(16 * 1024)
                            while (true) {
                                currentCoroutineContext().ensureActive()
                                val count = input.read(buffer)
                                if (count < 0) break
                                output.write(buffer, 0, count)
                            }
                        }
                    } ?: error("无法保存文件")
                    return
                }
            }
        }
        error("下载重定向次数过多")
    }

    private class PendingDownload(val url: String, val userAgent: String?, val cookie: String?)

    private fun acceptImageDownload(trustedOrigin: String, dataUrl: String, requestedFileName: String) {
        if (normalizedHttpsOrigin(currentWebView()?.url) != trustedOrigin) {
            showToast("当前页面无权保存图片")
            return
        }
        if (dataUrl.length > MAX_DATA_URL_LENGTH) {
            showToast("图片过大，无法直接保存")
            return
        }

        showToast("正在保存图片")
        activity.lifecycleScope.launch {
            val pending = withContext(Dispatchers.Default) {
                decodeImageDataUrl(dataUrl, requestedFileName)
            }
            if (pending == null) {
                showToast("图片数据无效，保存失败")
                return@launch
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val saved = withContext(Dispatchers.IO) { saveImageToDownloads(pending) }
                showToast(if (saved) "图片已保存到下载目录" else "图片保存失败，请重试")
            } else {
                pendingLegacyImage = pending
                createImageDocument.launch(pending.fileName)
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.Q)
    private fun saveImageToDownloads(image: PendingImage): Boolean {
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, image.fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, image.mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
        return runCatching {
            resolver.openOutputStream(uri)?.use { it.write(image.bytes) } ?: error("无法写入下载目录")
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        }.getOrElse {
            resolver.delete(uri, null, null)
            false
        }
    }

    private fun showToast(message: String) {
        Toast.makeText(activity, message, Toast.LENGTH_SHORT).show()
    }

    private data class PendingImage(
        val bytes: ByteArray,
        val mimeType: String,
        val fileName: String,
    )

    private companion object {
        const val BRIDGE_NAME = "MYAndroidDownloads"
        const val MAX_DATA_URL_LENGTH = 32 * 1024 * 1024

        val supportedImageTypes = mapOf(
            "image/png" to "png",
            "image/jpeg" to "jpg",
            "image/webp" to "webp",
            "image/gif" to "gif",
        )

        fun normalizedHttpsOrigin(rawUrl: String?): String? {
            val url = rawUrl?.toHttpUrlOrNull() ?: return null
            if (!url.isHttps || url.username.isNotEmpty() || url.password.isNotEmpty()) return null
            return url.newBuilder().encodedPath("/").query(null).fragment(null).build().toString().removeSuffix("/")
        }

        fun decodeImageDataUrl(dataUrl: String, requestedFileName: String): PendingImage? {
            val separator = dataUrl.indexOf(',')
            if (separator <= 0) return null
            val metadata = dataUrl.substring(0, separator)
            if (!metadata.endsWith(";base64")) return null
            val mimeType = metadata.removePrefix("data:").removeSuffix(";base64").lowercase()
            val extension = supportedImageTypes[mimeType] ?: return null
            val bytes = runCatching {
                Base64.decode(dataUrl.substring(separator + 1), Base64.DEFAULT)
            }.getOrNull()?.takeIf { it.isNotEmpty() } ?: return null
            return PendingImage(
                bytes = bytes,
                mimeType = mimeType,
                fileName = safeFileName(requestedFileName, mimeType, extension),
            )
        }

        fun safeFileName(rawName: String?, mimeType: String?, fallbackExtension: String? = null): String {
            val extension = fallbackExtension
                ?: supportedImageTypes[mimeType?.lowercase()]
                ?: "bin"
            val baseName = File(rawName.orEmpty()).name
                .replace(Regex("[^A-Za-z0-9._-]"), "_")
                .trim('.', '_')
                .take(96)
                .ifBlank { "download-${System.currentTimeMillis()}.$extension" }
            return if (baseName.contains('.')) baseName else "$baseName.$extension"
        }
    }
}
