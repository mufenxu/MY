package cn.pxyb.mycontrol.ui.feature.media

import cn.pxyb.mycontrol.data.MediaDownloadHistoryEntry
import cn.pxyb.mycontrol.data.MediaDownloadPreferences
import cn.pxyb.mycontrol.data.MediaDownloadTarget
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update

data class MediaDownloadUiState(
    val shareText: String = "",
    val parsing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val target: MediaDownloadTarget? = null,
    val autoPaste: Boolean = true,
    // 检测到剪贴板里的分享链接后先问一句，避免把用户无意复制的文字灌进输入框。
    val clipboardSuggestion: String? = null,
    val history: List<MediaDownloadHistoryEntry> = emptyList(),
)

class MediaDownloadStateHolder(
    parentScope: CoroutineScope,
    private val preferences: MediaDownloadPreferences,
    private val api: PlatformApi,
    private val account: () -> String?,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<MediaDownloadUiState>(
    parentScope,
    MediaDownloadUiState(autoPaste = preferences.autoPasteEnabled()),
    onSessionExpired,
) {
    // 用户拒绝过的剪贴板内容不再重复打扰。
    private var declinedClipboardText = ""

    override fun clearPendingState(current: MediaDownloadUiState) = current.copy(parsing = false)

    fun refreshHistory() {
        val history = preferences.history(account())
        mutableState.update { it.copy(history = history) }
    }

    fun updateShareText(value: String) {
        // 链接改了就丢弃上一次的解析结果提示，避免旧错误误导。
        mutableState.update { it.copy(shareText = value, error = null, message = null) }
    }

    fun setAutoPaste(enabled: Boolean) {
        preferences.setAutoPasteEnabled(enabled)
        mutableState.update { it.copy(autoPaste = enabled, clipboardSuggestion = null) }
    }

    // Android 10 起只有页面在前台可见时才能读剪贴板；调用方已做失败兜底，这里只过滤出含链接的文本。
    fun offerClipboardLink(text: String) {
        val candidate = text.trim()
        val current = mutableState.value
        if (!current.autoPaste || candidate.isEmpty()) return
        if (!candidate.contains("http", ignoreCase = true)) return
        if (candidate == current.shareText.trim() || candidate == declinedClipboardText) return
        mutableState.update { it.copy(clipboardSuggestion = candidate) }
    }

    fun acceptClipboardLink() {
        val suggestion = mutableState.value.clipboardSuggestion ?: return
        mutableState.update { it.copy(shareText = suggestion, clipboardSuggestion = null, error = null, message = null) }
    }

    fun dismissClipboardLink() {
        declinedClipboardText = mutableState.value.clipboardSuggestion.orEmpty()
        mutableState.update { it.copy(clipboardSuggestion = null) }
    }

    // 手动点「粘贴」时直接覆盖输入框，剪贴板为空才提示。
    fun pasteClipboard(text: String) {
        val candidate = text.trim()
        if (candidate.isEmpty()) {
            mutableState.update { it.copy(error = "剪贴板里没有可粘贴的内容。", message = null) }
            return
        }
        declinedClipboardText = ""
        mutableState.update {
            it.copy(shareText = candidate, error = null, message = null, clipboardSuggestion = null)
        }
    }

    fun clearHistory() {
        preferences.clearHistory(account())
        mutableState.update { it.copy(history = emptyList()) }
    }

    fun reportLinkCopied(label: String) {
        mutableState.update { it.copy(error = null, message = "已复制${label}下载直链。") }
    }

    fun parse() {
        val input = mutableState.value.shareText.trim()
        if (input.isEmpty()) {
            mutableState.update { it.copy(error = "请先粘贴分享链接。", message = null) }
            return
        }
        launchAction(
            isBusy = { parsing },
            start = { copy(parsing = true, error = null, message = null) },
            action = { api.withRequestMetadata(allowCache = false) { api.parseMediaDownload(input) }.value },
            success = { target ->
                copy(
                    target = target,
                    parsing = false,
                    clipboardSuggestion = null,
                    history = recordHistory(target, input),
                )
            },
            failure = { failure ->
                copy(
                    target = null,
                    parsing = false,
                    error = failure.message?.takeIf(String::isNotBlank) ?: "解析失败，请稍后重试。",
                )
            },
        )
    }

    private fun recordHistory(target: MediaDownloadTarget, shareText: String): List<MediaDownloadHistoryEntry> {
        val username = account() ?: return mutableState.value.history
        return preferences.record(
            username,
            MediaDownloadHistoryEntry(
                title = target.title,
                platform = target.platform,
                shareText = shareText,
                parsedAtMillis = System.currentTimeMillis(),
            ),
        )
    }

    // 媒体字节由系统 DownloadManager 在客户端直连 CDN 下载，这里只回写排队结果。
    fun reportDownloadQueued(fileCount: Int) {
        mutableState.update {
            it.copy(
                error = null,
                message = if (fileCount > 1) {
                    "已开始下载 $fileCount 张图片，可在系统通知或「下载」目录查看。"
                } else {
                    "已开始下载，可在系统通知或「下载」目录查看。"
                },
            )
        }
    }

    fun reportDownloadFailure(message: String) {
        mutableState.update { it.copy(message = null, error = message) }
    }
}