package cn.pxyb.mycontrol.ui.feature.media

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Environment
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.MediaDownloadAsset
import cn.pxyb.mycontrol.data.HlsDownloadWorker
import cn.pxyb.mycontrol.data.MediaDownloadHistoryEntry
import cn.pxyb.mycontrol.data.MediaDownloadTarget
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
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
    val protocol: String = "https",
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
    onPasteClipboard: (String) -> Unit,
    onClipboardScanned: (String) -> Unit,
    onAutoPasteChange: (Boolean) -> Unit,
    onAcceptClipboardLink: () -> Unit,
    onDismissClipboardLink: () -> Unit,
    onClearHistory: () -> Unit,
    onLinkCopied: (String) -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    var pendingDownload by remember { mutableStateOf<PendingMediaDownload?>(null) }
    var pendingPermission by remember { mutableStateOf<PendingMediaDownload?>(null) }
    val workManager = remember(context) { WorkManager.getInstance(context) }
    val downloadFlow = remember(workManager) { workManager.getWorkInfosForUniqueWorkFlow(HlsDownloadWorker.WORK_NAME) }
    val downloads by downloadFlow.collectAsStateWithLifecycle(initialValue = emptyList())
    val hlsWork = downloads.firstOrNull()
    val hlsActive = hlsWork?.state?.isFinished == false

    // 剪贴板只在页面前台可见时可读，读不到就静默跳过，不打断用户。
    fun readClipboard(): String = runCatching { clipboard.getText()?.text }.getOrNull().orEmpty()

    LaunchedEffect(Unit) {
        onClipboardScanned(readClipboard())
    }

    fun copyLink(label: String, url: String) {
        clipboard.setText(AnnotatedString(url))
        onLinkCopied(label)
    }

    fun queueDownload(pending: PendingMediaDownload) {
        runCatching { pending.requests.forEach { request -> enqueueMediaDownload(context, request) } }
            .onSuccess { onDownloadQueued(pending.requests.size) }
            .onFailure { failure ->
                onDownloadFailed(failure.message?.takeIf(String::isNotBlank) ?: "启动下载失败，请稍后重试。")
            }
    }

    val downloadPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val pending = pendingPermission
        pendingPermission = null
        if (Build.VERSION.SDK_INT <= 28 && grants[Manifest.permission.WRITE_EXTERNAL_STORAGE] == false) {
            onDownloadFailed("需要存储权限才能将 MP4 保存到下载目录。")
        } else if (pending != null) {
            queueDownload(pending)
        }
    }

    fun startDownload(pending: PendingMediaDownload) {
        if (pending.requests.any { it.protocol == "hls" }) {
            if (hlsActive) {
                onDownloadFailed("已有视频正在下载或合并，请完成或取消后再下载。")
                return
            }
            val permissions = buildList {
                if (Build.VERSION.SDK_INT <= 28) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
            }.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
            if (permissions.isNotEmpty()) {
                pendingPermission = pending
                downloadPermission.launch(permissions.toTypedArray())
                return
            }
        }
        queueDownload(pending)
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

    fun downloadMaterial(
        result: MediaDownloadTarget,
        asset: MediaDownloadAsset,
        suffix: String,
        trafficLabel: String,
    ) {
        beginDownload(
            result = result,
            requests = listOf(
                MediaDownloadRequest(
                    url = asset.url,
                    headers = asset.headers,
                    fileName = mediaFileName(result.title, suffix, ".${asset.ext}"),
                    title = result.title,
                    mimeType = asset.mimeType,
                    notify = true,
                ),
            ),
            trafficLabel = trafficLabel,
        )
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
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppSecondaryButton(
                            text = "粘贴",
                            onClick = { onPasteClipboard(readClipboard()) },
                            icon = Icons.Outlined.ContentPaste,
                            enabled = !state.parsing,
                            modifier = Modifier.weight(1f),
                        )
                        AppButton(
                            text = "解析",
                            onClick = onParse,
                            icon = Icons.Outlined.Download,
                            enabled = !state.parsing,
                            loading = state.parsing,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }

        item {
            AppPanel {
                AppSwitchRow(
                    title = "自动读取剪贴板",
                    subtitle = "进入页面时提示粘贴刚复制的分享链接",
                    icon = Icons.Outlined.ContentPaste,
                    checked = state.autoPaste,
                    onCheckedChange = onAutoPasteChange,
                    modifier = Modifier.padding(vertical = 4.dp),
                )
            }
        }

        state.error?.let { text -> item { AppFeedbackBanner(message = text, type = AppFeedbackType.Error) } }
        state.message?.let { text -> item { AppFeedbackBanner(message = text) } }
        hlsWork?.let { work ->
            item {
                val status = when (work.state) {
                    WorkInfo.State.SUCCEEDED -> work.outputData.getString(HlsDownloadWorker.STATUS) ?: "MP4 已保存到下载目录"
                    WorkInfo.State.FAILED -> work.outputData.getString(HlsDownloadWorker.STATUS) ?: "视频下载失败，请重新下载。"
                    WorkInfo.State.CANCELLED -> "视频下载已取消"
                    else -> work.progress.getString(HlsDownloadWorker.STATUS) ?: "正在准备下载视频"
                }
                AppPanel {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(status, style = MaterialTheme.typography.bodyMedium)
                        if (!work.state.isFinished) {
                            AppSecondaryButton(text = "取消下载", onClick = { workManager.cancelWorkById(work.id) })
                        }
                    }
                }
            }
        }

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
                                        subtitle = if (quality.protocol == "hls") "下载并合并为 MP4" else quality.sizeLabel.ifBlank { "点击下载" },
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
                                                            extension = ".${quality.ext}",
                                                        ),
                                                        title = result.title,
                                                        mimeType = quality.mimeType,
                                                        notify = true,
                                                        protocol = quality.protocol,
                                                    ),
                                                ),
                                                trafficLabel = quality.sizeLabel.takeIf { it.isNotBlank() }
                                                    ?.let { "约 $it" }
                                                    ?: "这次下载的流量",
                                            )
                                        },
                                        trailingContent = {
                                            AppHeaderIconButton(
                                                icon = Icons.Outlined.ContentCopy,
                                                contentDescription = "复制${quality.label}清晰度的下载直链",
                                                onClick = { copyLink(quality.label, quality.url) },
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
                                                        extension = ".${image.ext}",
                                                    ),
                                                    title = result.title,
                                                    mimeType = image.mimeType,
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

            val coverAsset = result.coverAsset
            val musicAsset = result.music
            if (coverAsset != null || musicAsset != null) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        AppSectionHeader(title = "其他素材", subtitle = "封面与原声可以单独保存")
                        AppPanel {
                            Column {
                                if (coverAsset != null) {
                                    AppActionRow(
                                        title = "下载封面",
                                        subtitle = "${coverAsset.ext.uppercase()} 图片",
                                        icon = Icons.Outlined.Image,
                                        onClick = { downloadMaterial(result, coverAsset, "封面", "这张封面") },
                                        trailingContent = {
                                            AppHeaderIconButton(
                                                icon = Icons.Outlined.ContentCopy,
                                                contentDescription = "复制封面直链",
                                                onClick = { copyLink("封面", coverAsset.url) },
                                            )
                                        },
                                    )
                                }
                                if (coverAsset != null && musicAsset != null) AppDivider()
                                if (musicAsset != null) {
                                    AppActionRow(
                                        title = "下载原声",
                                        subtitle = "${musicAsset.ext.uppercase()} 音频",
                                        icon = Icons.Outlined.MusicNote,
                                        onClick = { downloadMaterial(result, musicAsset, "原声", "这段原声") },
                                        trailingContent = {
                                            AppHeaderIconButton(
                                                icon = Icons.Outlined.ContentCopy,
                                                contentDescription = "复制原声直链",
                                                onClick = { copyLink("原声", musicAsset.url) },
                                            )
                                        },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        if (state.history.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppSectionHeader(
                        title = "最近解析",
                        subtitle = "点击即可回填链接",
                        trailing = {
                            AppHeaderIconButton(
                                icon = Icons.Outlined.DeleteSweep,
                                contentDescription = "清空解析历史",
                                onClick = onClearHistory,
                            )
                        },
                    )
                    AppPanel {
                        Column {
                            state.history.forEachIndexed { index, entry ->
                                if (index > 0) AppDivider()
                                AppActionRow(
                                    title = entry.title.ifBlank { "未命名作品" },
                                    subtitle = mediaHistorySubtitle(entry),
                                    icon = Icons.Outlined.History,
                                    onClick = { onShareTextChange(entry.shareText) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    state.clipboardSuggestion?.let { suggestion ->
        AppConfirmDialog(
            title = "检测到剪贴板链接",
            detail = suggestion.take(80),
            confirmLabel = "粘贴",
            onDismiss = onDismissClipboardLink,
            onConfirm = onAcceptClipboardLink,
            icon = Icons.Outlined.ContentPaste,
        )
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
    if (request.protocol == "hls") {
        HlsDownloadWorker.enqueue(context, request.url, request.headers, request.title, request.fileName)
        return
    }
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
    "haijiao" -> "海角"
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

internal fun mediaHistorySubtitle(entry: MediaDownloadHistoryEntry, nowMillis: Long = System.currentTimeMillis()): String =
    listOf(mediaPlatformLabel(entry.platform), mediaHistoryTime(entry.parsedAtMillis, nowMillis))
        .filter { it.isNotBlank() }
        .joinToString(" · ")

internal fun mediaHistoryTime(parsedAtMillis: Long, nowMillis: Long = System.currentTimeMillis()): String {
    if (parsedAtMillis <= 0) return ""
    val elapsedMinutes = (nowMillis - parsedAtMillis) / 60_000
    return when {
        elapsedMinutes < 1 -> "刚刚"
        elapsedMinutes < 60 -> "$elapsedMinutes 分钟前"
        elapsedMinutes < 24 * 60 -> "${elapsedMinutes / 60} 小时前"
        else -> "${elapsedMinutes / (24 * 60)} 天前"
    }
}
