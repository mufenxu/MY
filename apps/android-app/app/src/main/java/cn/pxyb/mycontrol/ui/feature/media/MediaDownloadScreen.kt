package cn.pxyb.mycontrol.ui.feature.media

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import cn.pxyb.mycontrol.data.HlsDownloadWorker
import cn.pxyb.mycontrol.data.MediaDownloadAsset
import cn.pxyb.mycontrol.data.MediaDownloadHistoryEntry
import cn.pxyb.mycontrol.data.MediaDownloadQuality
import cn.pxyb.mycontrol.data.MediaDownloadTarget
import cn.pxyb.mycontrol.data.MediaDownloadTask
import cn.pxyb.mycontrol.data.MediaDownloadTasks
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class MediaDownloadRequest(
    val url: String,
    val headers: Map<String, String>,
    val fileName: String,
    val title: String,
    val mimeType: String,
    val format: String,
    val protocol: String = "https",
)

private data class PendingMediaDownload(
    val trafficLabel: String,
    val requests: List<MediaDownloadRequest>,
    val source: String,
    val cover: String,
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
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val taskStore = remember(context) { MediaDownloadTasks(context.applicationContext) }
    var tasks by remember(state.account) { mutableStateOf(emptyList<MediaDownloadTask>()) }
    var tab by rememberSaveable { mutableStateOf("进行中") }
    var showNew by rememberSaveable { mutableStateOf(false) }
    var showSettings by rememberSaveable { mutableStateOf(false) }
    var clearHistory by remember { mutableStateOf(false) }
    var pendingDelete by remember(state.account) { mutableStateOf<MediaDownloadTask?>(null) }
    var deletingTask by remember(state.account) { mutableStateOf(false) }
    var queuing by remember { mutableStateOf(false) }
    var pendingDownload by remember { mutableStateOf<PendingMediaDownload?>(null) }
    var pendingPermission by remember { mutableStateOf<PendingMediaDownload?>(null) }
    var selectedQuality by remember(state.target) { mutableIntStateOf(0) }

    fun readClipboard(): String = runCatching { clipboard.getText()?.text }.getOrNull().orEmpty()
    fun openNew(source: String? = null) {
        if (source != null) onShareTextChange(source)
        showNew = true
    }
    fun openDownloads() {
        runCatching { context.startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)) }
            .onFailure { onDownloadFailed("无法打开系统下载目录，请在文件管理器中查看 Download 文件夹。") }
    }
    LaunchedEffect(Unit) { onClipboardScanned(readClipboard()) }
    LaunchedEffect(state.account, lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (isActive) {
                try {
                    tasks = withContext(Dispatchers.IO) { taskStore.refresh(state.account) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    onDownloadFailed("暂时无法刷新下载状态，请稍后重试。")
                }
                delay(1500)
            }
        }
    }
    fun copyLink(label: String, url: String) {
        clipboard.setText(AnnotatedString(url))
        onLinkCopied(label)
    }
    fun queueDownload(pending: PendingMediaDownload) {
        val account = state.account ?: return onDownloadFailed("登录状态尚未就绪，请稍后重试。")
        if (queuing) return
        queuing = true
        scope.launch {
            var queued = 0
            try {
                withContext(Dispatchers.IO) {
                    pending.requests.forEach { request ->
                        enqueueMediaDownload(context, request, pending, taskStore, account)
                        queued++
                    }
                }
                tasks = withContext(Dispatchers.IO) { taskStore.read(account) }
                showNew = false
                tab = "进行中"
                onDownloadQueued(queued)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                val detail = if (error is IllegalStateException) error.message else null
                onDownloadFailed((if (queued > 0) "已创建 $queued 个任务，其余未完成。" else "") +
                    (detail ?: "启动下载失败，请检查网络和存储权限后重试。"))
            } finally {
                queuing = false
            }
        }
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val pending = pendingPermission
        pendingPermission = null
        if (Build.VERSION.SDK_INT <= 28 && grants[Manifest.permission.WRITE_EXTERNAL_STORAGE] == false) {
            onDownloadFailed("需要存储权限才能将文件保存到下载目录。")
        } else if (pending != null) queueDownload(pending)
    }
    fun startDownload(pending: PendingMediaDownload) {
        val permissions = buildList {
            if (Build.VERSION.SDK_INT <= 28) add(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            if (Build.VERSION.SDK_INT >= 33 && pending.requests.any { it.protocol == "hls" }) add(Manifest.permission.POST_NOTIFICATIONS)
        }.filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
        if (permissions.isEmpty()) queueDownload(pending) else {
            pendingPermission = pending
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }
    fun beginDownload(result: MediaDownloadTarget, requests: List<MediaDownloadRequest>, traffic: String) {
        if (queuing || requests.isEmpty()) return
        if (mediaLinkExpired(result.expireAtSeconds)) {
            onDownloadFailed("下载链接已过期，请重新解析。")
            return
        }
        val pending = PendingMediaDownload(traffic, requests, state.shareText, result.cover)
        if (isMeteredConnection(context)) pendingDownload = pending else startDownload(pending)
    }
    fun assetRequest(result: MediaDownloadTarget, asset: MediaDownloadAsset, label: String) = MediaDownloadRequest(
        asset.url, asset.headers, mediaFileName(result.title, label, ".${asset.ext}"),
        result.title, asset.mimeType, "$label · ${asset.ext.uppercase()}",
    )
    fun downloadQuality(result: MediaDownloadTarget, quality: MediaDownloadQuality) {
        beginDownload(result, listOf(MediaDownloadRequest(quality.url, quality.headers,
            mediaFileName(result.title, quality.label, ".${quality.ext}"), result.title,
            quality.mimeType, "${quality.label} · ${quality.ext.uppercase()}", quality.protocol)),
            quality.sizeLabel.ifBlank { "视频下载流量" })
    }
    fun cancelTask(task: MediaDownloadTask) {
        scope.launch {
            try {
                withContext(Dispatchers.IO) { taskStore.cancel(state.account, task) }
                tasks = withContext(Dispatchers.IO) { taskStore.read(state.account) }
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) { onDownloadFailed("取消失败，请稍后重试。") }
        }
    }
    fun deleteFailedTask(task: MediaDownloadTask) {
        val account = state.account ?: return onDownloadFailed("登录状态尚未就绪，请稍后重试。")
        if (deletingTask) return
        deletingTask = true
        scope.launch {
            try {
                tasks = withContext(Dispatchers.IO) {
                    taskStore.removeFailed(account, task.id)
                    taskStore.read(account)
                }
                pendingDelete = null
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                pendingDelete = null
                onDownloadFailed("删除记录失败，请稍后重试。")
            } finally {
                deletingTask = false
            }
        }
    }
    val completed = tasks.filter { it.completed }
    val pending = tasks.filterNot { it.completed }
    Box(Modifier.fillMaxSize()) {
        AppSubPage(title = "视频下载", onBack = onBack, contentPadding = contentPadding,
            actions = { AppHeaderIconButton(icon = Icons.Outlined.Tune, contentDescription = "下载设置", onClick = { showSettings = true }) },
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.padding(vertical = 8.dp)) {
                    Text("我的下载", style = MaterialTheme.typography.headlineSmall)
                    Text("从一个链接，到你的本地收藏", style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                AppSegmentedControl(options = listOf("进行中", "已完成", "解析记录"), selected = tab,
                    onSelect = { tab = it }, label = { it }, count = { if (it == "进行中") tasks.count { task -> task.active }.takeIf { it > 0 } else null })
            }
            if (!showNew) {
                state.error?.let { item { AppFeedbackBanner(message = it, type = AppFeedbackType.Error) } }
                state.message?.let { item { AppFeedbackBanner(message = it) } }
            }
            if (tab == "解析记录") {
                item {
                    AppSectionHeader(title = "最近解析", subtitle = "点击链接，重新选择画质下载",
                        trailing = { if (state.history.isNotEmpty()) AppHeaderIconButton(icon = Icons.Outlined.DeleteSweep,
                            contentDescription = "清空解析记录", onClick = { clearHistory = true }) })
                }
                if (state.history.isEmpty()) item { AppEmptyState(title = "还没有解析记录", detail = "从新建下载开始，粘贴你想保存的视频链接。", icon = Icons.Outlined.History) }
                items(state.history, key = { it.shareText }) { entry ->
                    AppPanel { AppActionRow(title = entry.title.ifBlank { "未命名作品" }, subtitle = mediaHistorySubtitle(entry),
                        icon = Icons.Outlined.History, onClick = { openNew(entry.shareText) }) }
                }
            } else {
                val visible = if (tab == "已完成") completed else pending
                if (visible.isEmpty()) item {
                    AppEmptyState(title = if (tab == "已完成") "还没有完成的下载" else "当前没有下载任务",
                        detail = if (tab == "已完成") "下载完成后，文件会保存在系统下载目录。" else "点击右下角新建下载，粘贴分享链接。",
                        icon = if (tab == "已完成") Icons.Outlined.FolderOpen else Icons.Outlined.Download)
                }
                items(visible, key = { it.id }) { task ->
                    MediaTaskCard(task, onCancel = { cancelTask(task) }, onRetry = { openNew(task.source) },
                        onOpen = ::openDownloads, onDelete = { pendingDelete = task })
                }
                if (tab == "进行中" && completed.isNotEmpty()) {
                    item { AppSectionHeader(title = "最近保存", subtitle = "文件保存在系统下载目录") }
                    items(completed.take(3), key = { "recent-${it.id}" }) { task ->
                        MediaTaskCard(task, onCancel = {}, onRetry = { openNew(task.source) },
                            onOpen = ::openDownloads, onDelete = {}, compact = true)
                    }
                }
            }
            item { Spacer(Modifier.height(80.dp)) }
        }
        AppButton(text = "新建下载", icon = Icons.Outlined.Add, onClick = { openNew() },
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = AppPageHorizontalPadding,
                bottom = contentPadding.calculateBottomPadding() + 16.dp))
    }
    if (showNew) {
        val result = state.target
        val quality = result?.qualities?.getOrNull(selectedQuality)
        AppDialog(onDismissRequest = { showNew = false }, title = "新建下载", subtitle = "粘贴分享链接，选择画质后保存",
            footer = {
                if (result != null && quality != null) {
                    AppButton(text = if (quality.protocol == "hls") "下载并合并为 MP4" else "下载${quality.label}视频",
                        icon = Icons.Outlined.Download, loading = queuing, enabled = !state.parsing && !queuing,
                        modifier = Modifier.fillMaxWidth(), onClick = { downloadQuality(result, quality) })
                }
            },
        ) {
            Column(Modifier.heightIn(max = 460.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(value = state.shareText, onValueChange = onShareTextChange, label = "分享链接",
                    placeholder = "粘贴链接或整段分享文案", leadingIcon = Icons.Outlined.Link, singleLine = false, maxLines = 3)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppSecondaryButton(text = "粘贴", icon = Icons.Outlined.ContentPaste, modifier = Modifier.weight(1f), enabled = !state.parsing && !queuing,
                        onClick = { onPasteClipboard(readClipboard()) })
                    AppButton(text = "解析视频", icon = Icons.Outlined.Search, loading = state.parsing,
                        enabled = !state.parsing && !queuing, modifier = Modifier.weight(1f), onClick = onParse)
                }
                state.error?.let { AppFeedbackBanner(message = it, type = AppFeedbackType.Error) }
                state.message?.let { AppFeedbackBanner(message = it) }
                if (result != null) {
                    MediaResultHeading(result)
                    if (result.qualities.isNotEmpty()) {
                        Text("选择画质", style = MaterialTheme.typography.titleSmall)
                        AppPanel {
                            Column {
                                result.qualities.forEachIndexed { index, item ->
                                    if (index > 0) AppDivider()
                                    AppActionRow(title = item.label, subtitle = listOf(item.ext.uppercase(), item.sizeLabel).filter(String::isNotBlank).joinToString(" · "),
                                        icon = if (selectedQuality == index) Icons.Outlined.RadioButtonChecked else Icons.Outlined.RadioButtonUnchecked,
                                        onClick = { selectedQuality = index }, trailingContent = {
                                            AppHeaderIconButton(icon = Icons.Outlined.ContentCopy, contentDescription = "复制${item.label}链接",
                                                onClick = { copyLink(item.label, item.url) })
                                        })
                                }
                            }
                        }
                    }
                    if (result.isImageGallery) AppButton(text = "下载全部 ${result.images.size} 张图片", icon = Icons.Outlined.Image,
                        enabled = !queuing, modifier = Modifier.fillMaxWidth(), onClick = {
                            beginDownload(result, result.images.mapIndexed { index, asset -> assetRequest(result, asset, "图片${index + 1}") }, "${result.images.size} 张图片的流量")
                        })
                    if (result.coverAsset != null || result.music != null) {
                        AppSectionHeader(title = "其他素材")
                        AppPanel {
                            Column {
                                result.coverAsset?.let { asset ->
                                    AppActionRow(title = "保存封面", subtitle = asset.ext.uppercase(), icon = Icons.Outlined.Image,
                                        onClick = { beginDownload(result, listOf(assetRequest(result, asset, "封面")), "封面图片的流量") },
                                        trailingContent = { AppHeaderIconButton(icon = Icons.Outlined.ContentCopy, contentDescription = "复制封面链接", onClick = { copyLink("封面", asset.url) }) })
                                }
                                if (result.coverAsset != null && result.music != null) AppDivider()
                                result.music?.let { asset ->
                                    AppActionRow(title = "下载原声", subtitle = asset.ext.uppercase(), icon = Icons.Outlined.MusicNote,
                                        onClick = { beginDownload(result, listOf(assetRequest(result, asset, "原声")), "音频的流量") },
                                        trailingContent = { AppHeaderIconButton(icon = Icons.Outlined.ContentCopy, contentDescription = "复制原声链接", onClick = { copyLink("原声", asset.url) }) })
                                }
                            }
                        }
                    }
                    Text(mediaExpireHint(result.expireAtSeconds), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
    pendingDelete?.let { task ->
        AppConfirmDialog(title = "删除失败记录", detail = "将从下载列表中移除「${task.title.ifBlank { "未命名作品" }}」的失败记录。",
            confirmLabel = "删除记录", danger = true, busy = deletingTask, icon = Icons.Outlined.DeleteOutline,
            onDismiss = { pendingDelete = null }, onConfirm = { deleteFailedTask(task) })
    }
    if (showSettings) AppDialog(onDismissRequest = { showSettings = false }, title = "下载设置") {
        AppSwitchRow(title = "自动读取剪贴板", subtitle = "进入页面时提示粘贴分享链接", icon = Icons.Outlined.ContentPaste,
            checked = state.autoPaste, onCheckedChange = onAutoPasteChange)
        AppActionRow(title = "保存位置", subtitle = "系统下载目录", icon = Icons.Outlined.FolderOpen, onClick = ::openDownloads)
        AppActionRow(title = "移动网络下载", subtitle = "下载前确认流量使用", icon = Icons.Outlined.NetworkCheck)
        AppActionRow(title = "分片视频格式", subtitle = "自动合并为 MP4，保留原始画质", icon = Icons.Outlined.Movie)
    }
    if (clearHistory) AppConfirmDialog(title = "清空解析记录？", detail = "仅清空链接记录，已下载的文件会保留。",
        confirmLabel = "清空", onDismiss = { clearHistory = false }, onConfirm = { onClearHistory(); clearHistory = false }, icon = Icons.Outlined.DeleteSweep)
    state.clipboardSuggestion?.let {
        AppConfirmDialog(title = "检测到剪贴板链接", detail = "是否粘贴到新建下载？", confirmLabel = "粘贴",
            onDismiss = onDismissClipboardLink, onConfirm = { onAcceptClipboardLink(); showNew = true }, icon = Icons.Outlined.ContentPaste)
    }
    pendingDownload?.let { pending ->
        AppConfirmDialog(title = "正在使用移动网络", detail = "继续下载将消耗${pending.trafficLabel}。", confirmLabel = "继续下载",
            onDismiss = { pendingDownload = null }, onConfirm = { pendingDownload = null; startDownload(pending) }, icon = Icons.Outlined.Download)
    }
}

private fun isMeteredConnection(context: Context): Boolean {
    val manager = context.getSystemService(ConnectivityManager::class.java) ?: return false
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && manager.isActiveNetworkMetered
}

private fun enqueueMediaDownload(context: Context, request: MediaDownloadRequest, pending: PendingMediaDownload, tasks: MediaDownloadTasks, account: String) {
    if (request.protocol == "hls") {
        HlsDownloadWorker.enqueue(context, request.url, request.headers, request.title, request.fileName,
            account, pending.source, pending.cover, request.format)
        return
    }
    val download = DownloadManager.Request(Uri.parse(request.url))
    request.headers.forEach { (name, value) -> download.addRequestHeader(name, value) }
    download.setTitle(request.title.ifBlank { "视频下载" })
    download.setMimeType(request.mimeType)
    download.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    download.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, request.fileName)
    val manager = context.getSystemService(DownloadManager::class.java)
    val id = manager.enqueue(download)
    tasks.record(account, MediaDownloadTask(id.toString(), false, request.title, pending.cover, request.format, pending.source))
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
