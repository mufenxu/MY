package cn.pxyb.mycontrol.ui.feature.study

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import cn.pxyb.mycontrol.data.accountStorageScope
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class StudySession(val id: String, val subject: String, val taskId: String?, val start: Long, val duration: Long, val note: String)
data class StudyRunning(val subject: String, val taskId: String?, val startedAt: Long, val elapsedStart: Long, val boot: Int)
data class StudyUiState(val loading: Boolean = false, val loaded: Boolean = false, val sessions: List<StudySession> = emptyList(),
    val running: StudyRunning? = null, val error: String? = null)

class StudyStateHolder(parent: CoroutineScope, context: Context, private val account: () -> String?, onExpired: (String) -> Unit) :
    FeatureStateHolder<StudyUiState>(parent, StudyUiState(), onExpired) {
    private val app = context.applicationContext
    private val codec = EncryptedPreferenceCodec(app.getSharedPreferences("study_journal", Context.MODE_PRIVATE), "my_control_study_journal")
    private fun boot() = Settings.Global.getInt(app.contentResolver, Settings.Global.BOOT_COUNT, -1)
    private fun key() = "journal:${checkNotNull(accountStorageScope(account())) { "请先登录。" }}"
    fun load() {
        if (mutableState.value.loaded) return
        launchAction({ loading }, { copy(loading = true, error = null) }, {
            val key = key()
            withContext(Dispatchers.IO) {
                val root = codec.read(key)?.let(::JSONObject) ?: JSONObject()
                val rows = root.optJSONArray("sessions") ?: JSONArray()
                val sessions = (0 until rows.length()).map { index -> rows.getJSONObject(index).let {
                    StudySession(it.getString("id"), it.getString("subject"), it.optString("taskId").takeIf(String::isNotBlank), it.getLong("start"), it.getLong("duration"), it.optString("note"))
                } }
                val active = root.optJSONObject("running")?.let {
                    StudyRunning(it.getString("subject"), it.optString("taskId").takeIf(String::isNotBlank), it.getLong("startedAt"), it.getLong("elapsedStart"), it.getInt("boot"))
                }
                StudyUiState(loaded = true, sessions = sessions, running = active?.takeIf { it.boot == boot() && it.elapsedStart <= SystemClock.elapsedRealtime() },
                    error = if (active != null && active.boot != boot()) "手机已重启，未完成的计时已停止，已保存的学习记录不受影响。" else null)
            }
        }, { it }, { copy(loading = false, error = it.message ?: "学习记录读取失败。") })
    }
    fun start(subject: String, taskId: String?) {
        if (subject.isBlank() || mutableState.value.running != null || !mutableState.value.loaded) return
        persist(mutableState.value.copy(running = StudyRunning(subject.trim(), taskId, System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot()), error = null))
    }
    fun finish(note: String) {
        val state = mutableState.value
        val active = state.running ?: return
        val duration = (SystemClock.elapsedRealtime() - active.elapsedStart).coerceAtLeast(0)
        val record = StudySession(UUID.randomUUID().toString(), active.subject, active.taskId, active.startedAt, duration, note.trim())
        persist(state.copy(running = null, sessions = state.sessions + record, error = null))
    }
    private fun persist(next: StudyUiState) = launchAction({ loading }, { copy(loading = true, error = null) }, {
        val key = key()
        withContext(Dispatchers.IO) {
            val root = JSONObject().put("sessions", JSONArray(next.sessions.map {
                JSONObject().put("id", it.id).put("subject", it.subject).put("taskId", it.taskId.orEmpty()).put("start", it.start).put("duration", it.duration).put("note", it.note)
            }))
            next.running?.let { root.put("running", JSONObject().put("subject", it.subject).put("taskId", it.taskId.orEmpty()).put("startedAt", it.startedAt).put("elapsedStart", it.elapsedStart).put("boot", it.boot)) }
            codec.write(key, root.toString())
        }
        next.copy(loading = false)
    }, { it }, { copy(loading = false, error = it.message ?: "学习记录保存失败，请重试。") })
    override fun clearPendingState(current: StudyUiState) = current.copy(loading = false)
}
