package cn.pxyb.mycontrol.ui.components.clipboard

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.Clipboard
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalContext
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * 全应用唯一的剪贴板入口。
 *
 * 此前 4 个页面各自持有已弃用的 `LocalClipboardManager`，验证码复制又单独走系统
 * `ClipboardManager`，形成三套实现：复制标签、敏感标记、自动清理的规则各不相同。
 * 统一到这里之后，调用方只需要表达「复制什么、算不算敏感」。
 */
@Stable
class AppClipboard internal constructor(
    private val clipboard: Clipboard,
    private val context: Context,
    private val scope: CoroutineScope,
) {
    /**
     * 复制纯文本。
     *
     * 内部用 remembered scope 立即投递，保持与旧 `ClipboardManager.setText` 相同的调用形态：
     * 点击回调里直接调用，不必自己开协程。[sensitive] 为 true 时打上系统敏感标记，
     * 复制内容不会出现在输入法联想与剪贴板历史预览里。
     */
    fun copy(text: String, label: String = "文本", sensitive: Boolean = false) {
        if (text.isEmpty()) return
        scope.launch { clipboard.setClipEntry(ClipEntry(buildClip(label, text, sensitive))) }
    }

    /** 读取剪贴板纯文本；没有内容或内容不是文本时返回空串。 */
    suspend fun readText(): String = runCatching {
        val data = clipboard.getClipEntry()?.clipData ?: return@runCatching ""
        if (data.itemCount == 0) return@runCatching ""
        data.getItemAt(0).coerceToText(context).toString()
    }.getOrDefault("")
}

@Composable
fun rememberAppClipboard(): AppClipboard {
    val clipboard = LocalClipboard.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    return remember(clipboard, context, scope) { AppClipboard(clipboard, context, scope) }
}

/**
 * 复制一次性敏感文本（动态验证码、恢复密钥），[clearAfterMillis] 后自动清理。
 *
 * 非 Compose 场景使用（二维码/密钥面板的点击回调只拿到 Context）。清理前会比对本次写入的
 * clipId：用户在这期间又复制了别的内容，就不会被误删。
 */
internal fun copyEphemeralText(
    context: Context,
    text: String,
    label: String,
    clearAfterMillis: Long,
) {
    val clipboard = context.getSystemService(ClipboardManager::class.java) ?: return
    val clipId = UUID.randomUUID().toString()
    clipboard.setPrimaryClip(buildClip(label, text, sensitive = true, clipId = clipId))
    Handler(Looper.getMainLooper()).postDelayed({
        if (clipboard.primaryClipDescription?.extras?.getString(CLIP_ID_KEY) == clipId) {
            clipboard.clearPrimaryClip()
        }
    }, clearAfterMillis.coerceIn(1_000L, 60_000L))
}

private const val CLIP_ID_KEY = "cn.pxyb.mycontrol.clip_id"

// 与 API 33 的 ClipDescription.EXTRA_IS_SENSITIVE 同值；低版本系统按同一字符串识别。
private val SENSITIVE_KEY: String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
    ClipDescription.EXTRA_IS_SENSITIVE
} else {
    "android.content.extra.IS_SENSITIVE"
}

private fun buildClip(
    label: String,
    text: String,
    sensitive: Boolean,
    clipId: String? = null,
): ClipData = ClipData.newPlainText(label, text).apply {
    if (sensitive || clipId != null) {
        description.extras = PersistableBundle().apply {
            if (sensitive) putBoolean(SENSITIVE_KEY, true)
            if (clipId != null) putString(CLIP_ID_KEY, clipId)
        }
    }
}
