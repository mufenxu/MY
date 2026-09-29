package cn.pxyb.mycontrol.ui.feature.media

import android.app.DownloadManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Environment
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.MediaDownloadTarget
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import coil.compose.SubcomposeAsyncImage

private data class MediaDownloadRequest(
    val url: String,
    val headers: Map<String, String>,
    val fileName: String,
    val title: String,
    val mimeType: String,
    val notify: Boolean,
)

private data class PendingMediaDownload(
    val trafficLabel: String,
    val requests: List<MediaDownloadRequest>,
)

@Composable
fun MediaDownloadScreen(
    state: MediaDownloadUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onShareTextChange: (String) -> Unit,
    onParse: () -> Unit,
    onDownloadQueued: (Int) -> Unit,
    onDownloadFailed: (String) -> Unit,
) {
    val context = LocalContext.current
    var pendingDownload by remember { mutableStateOf<PendingMediaDownload?>(null) }

    fun startDownload(pending: PendingMediaDownload) {
        runCatching { pending.requests.forEach { request -> enqueueMediaDownload(context, request) } }
            .onSuccess { onDownloadQueued(pending.requests.size) }
            .onFailure { failure ->
                onDownloadFailed(failure.message?.takeIf(String::isNotBlank) ?: "启动下载失败，请稍后重试。")
            }
    }

    fun beginDownload(result: MediaDownloadTarget, requests: List<MediaDownloadRequest>, trafficLabel: String) {
        if (requests.isEmpty()) return
        if (mediaLinkExpired(result.expireAtSeconds)) {
            onDownloadFailed("下载链接已过期，请重新解析。")
            return
        }
        val pending = PendingMediaDownload(trafficLabel, requests)
        // 原片动辄几十 MB，移动网络下先让用户确认再走流量。
        if (isMeteredConnection(context)) {
            pendingDownload = pending
        } else {
            startDownload(pending)
        }
    }

    AppSubPage(
        title = "视频下载",
        subtitle = "粘贴分享链接，选清晰度后保存无水印原片",
        onBack = onBack,
        contentPadding = contentPadding,
    ) {
        item {
            AppPanel {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppTextField(
                        value = state.shareText,
                        onValueChange = onShareTextChange,
                        label = "分享链接",
                        placeholder = "整段分享文案直接粘进来也可以",
                        leadingIcon = Icons.Outlined.Link,
                        singleLine = false,
                        maxLines = 3,
                    )
                    AppButton(
                        text = "解析",
                        onClick = onParse,
                        icon = Icons.Outlined.Download,
                        enabled = !state.parsing,
                        loading = state.parsing,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        state.error?.let { text -> item { AppFeedbackBanner(message = text, type = AppFeedbackType.Error) } }
        state.message?.let { text -> item { AppFeedbackBanner(message = text) } }

        state.target?.let { result ->
            item {
                AppPanel {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (result.cover.isNotBlank()) {
                            SubcomposeAsyncImage(
                                model = result.cover,
                                contentDescription = "作品封面",
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .size(72.dp)
                                    .clip(RoundedCornerShape(12.dp)),
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Text(
                                text = result.title.ifBlank { "解析结果" },
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = listOf(
                                    mediaPlatformLabel(result.platform),
                                    result.author,
                                    formatMediaDuration(result.durationMillis),
                                ).filter { it.isNotBlank() }.joinToString(" · "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = mediaExpireHint(result.expireAtSeconds),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            if (result.qualities.isNotEmpty()) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppSectionHeader(title = "选择清晰度", subtitle = "点击即开始下载")
                        AppPanel {
                            Column {
                                result.qualities.forEachIndexed { index, quality ->
                                    if (index > 0) AppDivider()
                                    AppActionRow(
                                        title = quality.label,
                                        subtitle = quality.sizeLabel.ifBlank { "点击下载" },
                                        icon = Icons.Outlined.Download,
                                        onClick = {
                                            beginDownload(
                                                result = result,
                                                requests = listOf(
                                                    MediaDownloadRequest(
                                                        url = quality.url,
                                                        headers = quality.headers,
                                                        fileName = mediaFileName(
                                                            title = result.title,
                                                            suffix = quality.label.substringBefore(' '),
                                                            extension = ".mp4",
                                                        ),
                                                        title = result.title,
                                                        mimeType = "video/mp4",
                                                        notify = true,
                                                    ),
                                                ),
                                                trafficLabel = quality.sizeLabel.takeIf { it.isNotBlank() }
                                                    ?.let { "约 $it" }
                                                    ?: "这次下载的流量",
                                            )
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (result.isImageGallery) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppSectionHeader(
                            title = "图文作品 · ${result.images.size} 张",
                            subtitle = "这是图文作品，没有视频流",
                        )
                        AppPanel {
                            Column(
                                modifier = Modifier.padding(14.dp),
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                AppButton(
                                    text = "下载全部图片",
                                    onClick = {
                                        beginDownload(
                                            result = result,
                                            requests = result.images.mapIndexed { index, image ->
                                                MediaDownloadRequest(
                                                    url = image.url,
                                                    headers = image.headers,
                                                    fileName = mediaFileName(
                                                        title = result.title,
                                                        suffix = (index + 1).toString(),
                                                        extension = ".jpg",
                                                    ),
                                                    title = result.title,
                                                    mimeType = "image/jpeg",
                                                    // 图文作品动辄几十张，只让最后一张弹完成通知，避免刷屏。
                                                    notify = index == result.images.lastIndex,
                                                )
                                            },
                                            trafficLabel = "${result.images.size} 张图片",
                                        )
                                    },
                                    icon = Icons.Outlined.Download,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    pendingDownload?.let { pending ->
        AppConfirmDialog(
            title = "正在使用移动网络",
            detail = "当前网络可能按流量计费，继续下载将消耗${pending.trafficLabel}。",
            confirmLabel = "继续下载",
            onDismiss = { pendingDownload = null },
            onConfirm = {
                pendingDownload = null
                startDownload(pending)
            },
            icon = Icons.Outlined.Download,
        )
    }
}

private fun isMeteredConnection(context: Context): Boolean {
    val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val activeNetwork = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(activeNetwork) ?: return false
    // 离线时 activeNetwork 为空，此时不打扰用户；只有真正联网且按流量计费才提示。
    if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) return false
    return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) || manager.isActiveNetworkMetered
}

private fun enqueueMediaDownload(context: Context, request: MediaDownloadRequest) {
    val download = DownloadManager.Request(Uri.parse(request.url))
    request.headers.forEach { (name, value) -> download.addRequestHeader(name, value) }
    download.setTitle(request.title.ifBlank { "视频下载" })
    download.setMimeType(request.mimeType)
    download.setNotificationVisibility(
        if (request.notify) {
            DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
        } else {
            DownloadManager.Request.VISIBILITY_HIDDEN
        },
    )
    download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, request.fileName)
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    manager.enqueue(download)
}

internal fun mediaFileName(title: String, suffix: String, extension: String): String {
    val base = title
        .replace(Regex("[\\\\/:*?\"<>|\\r\\n]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .take(60)
        .ifBlank { "视频下载" }
    val suffixPart = suffix.replace(Regex("[^A-Za-z0-9]"), "").takeIf { it.isNotBlank() }
        ?.let { "-$it" }
        .orEmpty()
    return "$base$suffixPart$extension"
}

internal fun mediaPlatformLabel(platform: String): String = when (platform.lowercase()) {
    "douyin" -> "抖音"
    "tiktok" -> "TikTok"
    "bilibili" -> "哔哩哔哩"
    "youtube" -> "YouTube"
    "" -> ""
    else -> "其他平台"
}

internal fun formatMediaDuration(millis: Long): String {
    if (millis <= 0) return ""
    val totalSeconds = millis / 1000
    return "%d:%02d".format(totalSeconds / 60, totalSeconds % 60)
}

internal fun mediaExpireHint(expireAtSeconds: Long): String {
    if (expireAtSeconds <= 0) return "下载链接有效期有限，请尽快下载"
    val remainingMinutes = (expireAtSeconds - System.currentTimeMillis() / 1000) / 60
    if (remainingMinutes <= 0) return "下载链接已过期，请重新解析"
    if (remainingMinutes >= 60) return "下载链接约 ${remainingMinutes / 60} 小时内有效"
    return "下载链接约 $remainingMinutes 分钟内有效"
}

internal fun mediaLinkExpired(expireAtSeconds: Long, nowMillis: Long = System.currentTimeMillis()): Boolean =
    expireAtSeconds in 1 until nowMillis / 1000
