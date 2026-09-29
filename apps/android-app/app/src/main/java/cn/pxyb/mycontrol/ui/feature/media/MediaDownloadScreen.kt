package cn.pxyb.mycontrol.ui.feature.media

import android.app.DownloadManager
import android.content.Context
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
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
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import coil.compose.SubcomposeAsyncImage
import kotlinx.coroutines.launch

@Composable
fun MediaDownloadScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onParse: suspend (String) -> MediaDownloadTarget,
) {
    var shareText by rememberSaveable { mutableStateOf("") }
    var parsing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var target by remember { mutableStateOf<MediaDownloadTarget?>(null) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun startDownload(url: String, headers: Map<String, String>, fileName: String, title: String, mimeType: String) {
        runCatching { enqueueMediaDownload(context, url, headers, fileName, title, mimeType) }
            .onSuccess {
                error = null
                message = "已开始下载，可在系统通知或「下载」目录查看。"
            }
            .onFailure { failure ->
                message = null
                error = failure.message?.takeIf(String::isNotBlank) ?: "启动下载失败，请稍后重试。"
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
                        value = shareText,
                        onValueChange = { value ->
                            shareText = value
                            message = null
                        },
                        label = "分享链接",
                        placeholder = "整段分享文案直接粘进来也可以",
                        leadingIcon = Icons.Outlined.Link,
                        singleLine = false,
                        maxLines = 3,
                    )
                    AppButton(
                        text = "解析",
                        onClick = {
                            val input = shareText.trim()
                            if (input.isEmpty()) {
                                error = "请先粘贴分享链接。"
                                return@AppButton
                            }
                            parsing = true
                            error = null
                            message = null
                            scope.launch {
                                runCatching { onParse(input) }
                                    .onSuccess { target = it }
                                    .onFailure { failure ->
                                        target = null
                                        error = failure.message?.takeIf(String::isNotBlank)
                                            ?: "解析失败，请稍后重试。"
                                    }
                                parsing = false
                            }
                        },
                        icon = Icons.Outlined.Download,
                        enabled = !parsing,
                        loading = parsing,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        error?.let { text -> item { AppFeedbackBanner(message = text, type = AppFeedbackType.Error) } }
        message?.let { text -> item { AppFeedbackBanner(message = text) } }

        target?.let { result ->
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
                                            startDownload(
                                                url = quality.url,
                                                headers = quality.headers,
                                                fileName = mediaFileName(
                                                    title = result.title,
                                                    suffix = quality.label.substringBefore(' '),
                                                    extension = ".mp4",
                                                ),
                                                title = result.title,
                                                mimeType = "video/mp4",
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
                                        result.images.forEachIndexed { index, image ->
                                            startDownload(
                                                url = image.url,
                                                headers = image.headers,
                                                fileName = mediaFileName(
                                                    title = result.title,
                                                    suffix = (index + 1).toString(),
                                                    extension = ".jpg",
                                                ),
                                                title = result.title,
                                                mimeType = "image/jpeg",
                                            )
                                        }
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
}

private fun enqueueMediaDownload(
    context: Context,
    url: String,
    headers: Map<String, String>,
    fileName: String,
    title: String,
    mimeType: String,
) {
    val request = DownloadManager.Request(Uri.parse(url))
    headers.forEach { (name, value) -> request.addRequestHeader(name, value) }
    request.setTitle(title.ifBlank { "视频下载" })
    request.setMimeType(mimeType)
    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
    val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    manager.enqueue(request)
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
    else -> platform
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
