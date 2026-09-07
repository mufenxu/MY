package cn.pxyb.mycontrol.ui

import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.WebView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

internal class PlatformWebDownloadSupport(
    private val activity: PlatformWebActivity,
    private val onFeedback: ((Boolean, String) -> Unit)? = null,
    private val currentWebView: () -> WebView?,
) {
    private var pendingLegacyImage: PendingImage? = null

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

        normalizedHttpsOrigin(trustedDownloadUrl)?.let { trustedOrigin ->
            webView.addJavascriptInterface(
                ImageDownloadBridge { dataUrl, fileName ->
                    activity.runOnUiThread {
                        acceptImageDownload(trustedOrigin, dataUrl, fileName)
                    }
                },
                BRIDGE_NAME,
            )
        }
    }

    private fun enqueueHttpDownload(
        rawUrl: String?,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?,
    ) {
        val uri = rawUrl?.let(Uri::parse) ?: return
        if (uri.scheme != "https" && uri.scheme != "http") {
            showToast("当前下载格式不受支持")
            return
        }

        val fileName = safeFileName(URLUtil.guessFileName(rawUrl, contentDisposition, mimeType), mimeType)
        val request = DownloadManager.Request(uri)
            .setTitle(fileName)
            .setDescription("正在下载文件")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)

        mimeType?.takeIf { it.isNotBlank() }?.let(request::setMimeType)
        userAgent?.takeIf { it.isNotBlank() }?.let { request.addRequestHeader("User-Agent", it) }
        CookieManager.getInstance().getCookie(rawUrl)?.takeIf { it.isNotBlank() }?.let {
            request.addRequestHeader("Cookie", it)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
        } else {
            request.setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, fileName)
        }

        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        runCatching { manager.enqueue(request) }
            .onSuccess { showToast("已开始下载") }
            .onFailure { showToast("下载启动失败，请重试") }
    }

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
        val isError = "失败" in message || "无法" in message || "不支持" in message
        if (onFeedback != null) {
            activity.runOnUiThread { onFeedback.invoke(isError, message) }
        }
    }

    private class ImageDownloadBridge(
        private val onSaveImage: (String, String) -> Unit,
    ) {
        @JavascriptInterface
        fun saveImage(dataUrl: String, fileName: String) {
            onSaveImage(dataUrl, fileName)
        }
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
            val uri = rawUrl?.let(Uri::parse) ?: return null
            if (!uri.scheme.equals("https", ignoreCase = true)) return null
            val host = uri.host?.lowercase()?.takeIf { it.isNotBlank() } ?: return null
            val port = uri.port.takeIf { it != -1 && it != 443 }?.let { ":$it" }.orEmpty()
            return "https://$host$port"
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
