package cn.pxyb.mycontrol.ui.feature.media

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
)

class MediaDownloadStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<MediaDownloadUiState>(parentScope, MediaDownloadUiState(), onSessionExpired) {

    override fun clearPendingState(current: MediaDownloadUiState) = current.copy(parsing = false)

    fun updateShareText(value: String) {
        // 链接改了就丢弃上一次的解析结果提示，避免旧错误误导。
        mutableState.update { it.copy(shareText = value, error = null, message = null) }
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
            success = { target -> copy(target = target, parsing = false) },
            failure = { failure ->
                copy(
                    target = null,
                    parsing = false,
                    error = failure.message?.takeIf(String::isNotBlank) ?: "解析失败，请稍后重试。",
                )
            },
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
