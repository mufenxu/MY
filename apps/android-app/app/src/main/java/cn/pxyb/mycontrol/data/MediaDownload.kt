package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable
import org.json.JSONArray
import org.json.JSONObject

@Immutable
data class MediaDownloadAsset(
    val url: String,
    val headers: Map<String, String>,
    val ext: String = "jpg",
    val mimeType: String = "image/jpeg",
)

@Immutable
data class MediaDownloadQuality(
    val label: String,
    val sizeLabel: String,
    val url: String,
    val headers: Map<String, String>,
    val ext: String = "mp4",
    val mimeType: String = "video/mp4",
    val protocol: String = "https",
)

@Immutable
data class MediaDownloadTarget(
    val platform: String,
    val kind: String,
    val title: String,
    val author: String,
    val cover: String,
    val durationMillis: Long,
    val expireAtSeconds: Long,
    val images: List<MediaDownloadAsset>,
    val qualities: List<MediaDownloadQuality>,
    // 封面与原声是可选素材，服务端没解析出来时保持为空。
    val coverAsset: MediaDownloadAsset? = null,
    val music: MediaDownloadAsset? = null,
) {
    val isImageGallery: Boolean get() = kind == "images" && images.isNotEmpty()
}

// 服务端已过滤过一次，这里再挡一层：只有播放直链必需的请求头才允许进入系统下载器。
private val ALLOWED_DOWNLOAD_HEADERS = setOf("referer", "user-agent", "origin")

// 扩展名决定落地文件名，MIME 决定系统下载器如何归类；优先按扩展名推导，保证两者不会打架。
private val MEDIA_MIME_BY_EXTENSION = mapOf(
    "mp4" to "video/mp4",
    "m4v" to "video/mp4",
    "mov" to "video/quicktime",
    "webm" to "video/webm",
    "mkv" to "video/x-matroska",
    "flv" to "video/x-flv",
    "ts" to "video/mp2t",
    "3gp" to "video/3gpp",
    "jpg" to "image/jpeg",
    "jpeg" to "image/jpeg",
    "png" to "image/png",
    "webp" to "image/webp",
    "gif" to "image/gif",
    "mp3" to "audio/mpeg",
    "m4a" to "audio/mp4",
    "aac" to "audio/aac",
    "wav" to "audio/wav",
    "ogg" to "audio/ogg",
    "opus" to "audio/ogg",
    "flac" to "audio/flac",
)

private val MIME_PATTERN = Regex("[a-z0-9.+-]+/[a-z0-9.+-]+")
private val EXTENSION_PATTERN = Regex("[a-z0-9]{1,5}")

private fun normalizeDownloadExtension(value: String): String = value
    .trim()
    .removePrefix(".")
    .lowercase()
    .takeIf { it.matches(EXTENSION_PATTERN) }
    .orEmpty()

private fun resolveDownloadExtension(declared: String, fallback: String): String =
    normalizeDownloadExtension(declared).ifEmpty { fallback }

private fun resolveDownloadMimeType(ext: String, declared: String, isImage: Boolean): String =
    MEDIA_MIME_BY_EXTENSION[ext]
        ?: declared.trim().lowercase().takeIf { it.matches(MIME_PATTERN) }
        ?: if (isImage) "image/jpeg" else "video/mp4"

private fun parseDownloadHeaders(json: JSONObject?): Map<String, String> {
    if (json == null) return emptyMap()
    val headers = linkedMapOf<String, String>()
    for (name in json.keys()) {
        if (name.lowercase() !in ALLOWED_DOWNLOAD_HEADERS) continue
        val value = json.optString(name, "")
        if (value.isNotBlank()) headers[name] = value
    }
    return headers
}

// 封面、原声与图文图片共用同一套字段结构，只有兜底扩展名不同。
private fun parseDownloadAsset(json: JSONObject?, fallbackExtension: String, isImage: Boolean): MediaDownloadAsset? {
    val source = json ?: return null
    val url = source.optString("url", "")
    if (url.isBlank()) return null
    val ext = resolveDownloadExtension(source.optString("ext"), fallbackExtension)
    return MediaDownloadAsset(
        url = url,
        headers = parseDownloadHeaders(source.optJSONObject("headers")),
        ext = ext,
        mimeType = resolveDownloadMimeType(ext, source.optString("mimeType"), isImage),
    )
}

private fun parseDownloadAssets(array: JSONArray?): List<MediaDownloadAsset> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        parseDownloadAsset(array.optJSONObject(index), fallbackExtension = "jpg", isImage = true)
    }
}

private fun parseDownloadQualities(array: JSONArray?): List<MediaDownloadQuality> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val url = item.optString("url", "")
        if (url.isBlank()) return@mapNotNull null
        val ext = resolveDownloadExtension(item.optString("ext"), "mp4")
        MediaDownloadQuality(
            label = item.optString("label", "默认画质"),
            sizeLabel = item.optString("sizeLabel", ""),
            url = url,
            headers = parseDownloadHeaders(item.optJSONObject("headers")),
            ext = ext,
            mimeType = resolveDownloadMimeType(ext, item.optString("mimeType"), isImage = false),
            protocol = item.optString("protocol", "https"),
        )
    }
}

internal fun parseMediaDownloadTarget(json: JSONObject): MediaDownloadTarget = MediaDownloadTarget(
    platform = json.optString("platform", ""),
    kind = json.optString("kind", "video"),
    title = json.optString("title", ""),
    author = json.optString("author", ""),
    cover = json.optString("cover", ""),
    durationMillis = json.optLong("durationMs", 0L),
    expireAtSeconds = json.optLong("expireAt", 0L),
    images = parseDownloadAssets(json.optJSONArray("images")),
    qualities = parseDownloadQualities(json.optJSONArray("qualities")),
    coverAsset = parseDownloadAsset(json.optJSONObject("coverAsset"), fallbackExtension = "jpg", isImage = true),
    music = parseDownloadAsset(json.optJSONObject("music"), fallbackExtension = "m4a", isImage = false),
)
