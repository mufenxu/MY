package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable
import org.json.JSONArray
import org.json.JSONObject

@Immutable
data class MediaDownloadAsset(
    val url: String,
    val headers: Map<String, String>,
)

@Immutable
data class MediaDownloadQuality(
    val label: String,
    val sizeLabel: String,
    val url: String,
    val headers: Map<String, String>,
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
) {
    val isImageGallery: Boolean get() = kind == "images" && images.isNotEmpty()
}

private fun parseDownloadHeaders(json: JSONObject?): Map<String, String> {
    if (json == null) return emptyMap()
    val headers = linkedMapOf<String, String>()
    for (name in json.keys()) {
        val value = json.optString(name, "")
        if (value.isNotBlank()) headers[name] = value
    }
    return headers
}

private fun parseDownloadAssets(array: JSONArray?): List<MediaDownloadAsset> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val url = item.optString("url", "")
        if (url.isBlank()) null else MediaDownloadAsset(url, parseDownloadHeaders(item.optJSONObject("headers")))
    }
}

private fun parseDownloadQualities(array: JSONArray?): List<MediaDownloadQuality> {
    if (array == null) return emptyList()
    return (0 until array.length()).mapNotNull { index ->
        val item = array.optJSONObject(index) ?: return@mapNotNull null
        val url = item.optString("url", "")
        if (url.isBlank()) return@mapNotNull null
        MediaDownloadQuality(
            label = item.optString("label", "默认画质"),
            sizeLabel = item.optString("sizeLabel", ""),
            url = url,
            headers = parseDownloadHeaders(item.optJSONObject("headers")),
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
)
