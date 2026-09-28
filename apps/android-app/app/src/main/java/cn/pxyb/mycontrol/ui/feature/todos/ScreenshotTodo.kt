package cn.pxyb.mycontrol.ui.feature.todos

import cn.pxyb.mycontrol.util.readBoundedBytes
import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import cn.pxyb.mycontrol.data.*
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import java.time.LocalDate
import java.time.LocalTime

data class ScreenshotSuggestion(val title: String, val date: String = "", val time: String = "", val location: String = "")
fun screenshotSuggestion(text: String, today: LocalDate = LocalDate.now()): ScreenshotSuggestion {
    val dateMatch = Regex("(?:(20\\d{2})[年/.-])?(\\d{1,2})[月/.-](\\d{1,2})日?").find(text)
    val date = dateMatch?.let { match -> runCatching {
        LocalDate.of(match.groupValues[1].toIntOrNull() ?: today.year, match.groupValues[2].toInt(), match.groupValues[3].toInt()).toString()
    }.getOrNull() }.orEmpty()
    val timeMatch = Regex("([01]?\\d|2[0-3])[:：]([0-5]\\d)").find(text)
    val time = timeMatch?.let { LocalTime.of(it.groupValues[1].toInt(), it.groupValues[2].toInt()).toString() }.orEmpty()
    val location = Regex("(?:地点|地址)[:：]\\s*([^\\n]+)").find(text)?.groupValues?.get(1).orEmpty().take(200)
    return ScreenshotSuggestion(text.lineSequence().firstOrNull(String::isNotBlank).orEmpty().take(200), date, time, location)
}

class TodoSourceStore(private val context: Context, private val username: String) {
    private fun preferences(id: String) = context.getSharedPreferences("todo_source_${requireNotNull(accountStorageScope(username))}_${java.security.MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).take(16).joinToString("") { "%02x".format(it) }}", Context.MODE_PRIVATE)
    fun save(id: String, bytes: ByteArray, text: String, location: String) {
        EncryptedPreferenceCodec(preferences(id), "my_control_todo_sources").write("source", JSONObject()
            .put("id", id).put("image", Base64.encodeToString(bytes, Base64.NO_WRAP)).put("text", text).put("location", location).toString())
    }
    fun read(id: String): JSONObject? = EncryptedPreferenceCodec(preferences(id), "my_control_todo_sources").read("source")?.let(::JSONObject)?.takeIf { it.optString("id") == id }
    fun remove(id: String) { preferences(id).edit().clear().apply() }
}

data class ScreenshotUiState(val loading: Boolean = false, val bytes: ByteArray? = null, val text: String = "",
    val suggestion: ScreenshotSuggestion = ScreenshotSuggestion(""), val error: String? = null, val savedTaskId: String? = null)
class ScreenshotStateHolder(parent: CoroutineScope, private val context: Context, private val account: () -> String?, onExpired: (String) -> Unit) :
    FeatureStateHolder<ScreenshotUiState>(parent, ScreenshotUiState(), onExpired) {
    fun recognize(uri: Uri) = launchAction({ loading }, { ScreenshotUiState(loading = true) }, {
        withContext(Dispatchers.IO) {
            require(uri.scheme == "content") { "请选择或分享系统相册中的图片。" }
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBoundedBytes(5_000_000) } ?: error("图片无法读取，请重新选择。")
            require(bytes.size <= 5_000_000) { "图片超过 5 MB，请裁剪后再识别。" }
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            require(bounds.outWidth > 0 && bounds.outHeight > 0) { "这不是可读取的图片。" }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2560) sample *= 2
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }) ?: error("图片解码失败。")
            val recognizer = TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
            val result = try {
                suspendCancellableCoroutine<String> { continuation ->
                    recognizer.process(InputImage.fromBitmap(bitmap, 0)).addOnCompleteListener { task ->
                        bitmap.recycle()
                        recognizer.close()
                        if (continuation.isActive) {
                            if (task.isSuccessful) continuation.resume(task.result.text.take(20_000))
                            else continuation.resumeWithException(IllegalStateException("图片识别失败，请换一张清晰截图。"))
                        }
                    }
                }
            } catch (error: Throwable) { throw error }
            require(result.isNotBlank()) { "未识别到文字，请选择包含文字的清晰截图。" }
            ScreenshotUiState(bytes = bytes, text = result, suggestion = screenshotSuggestion(result))
        }
    }, { it }, { copy(loading = false, error = it.message ?: "截图识别失败。") })
    fun saveSource(task: TodoTask, location: String, saveTodo: (TodoTask, () -> Unit) -> Unit) = launchAction({ loading || bytes == null }, { copy(loading = true, error = null) }, {
        val current = mutableState.value
        val username = checkNotNull(account()) { "请先登录。" }
        withContext(Dispatchers.IO) { TodoSourceStore(context, username).save(task.id, checkNotNull(current.bytes), current.text, location) }
        task
    }, { copy(loading = false) }, { copy(loading = false, error = it.message ?: "原图保存失败，请重试。") }, afterSuccess = {
        saveTodo(task) { mutableState.value = ScreenshotUiState(savedTaskId = task.id) }
    })
    override fun clearPendingState(current: ScreenshotUiState) = current.copy(loading = false)
}
