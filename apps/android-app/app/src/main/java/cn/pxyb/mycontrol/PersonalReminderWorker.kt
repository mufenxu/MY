package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.*
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import cn.pxyb.mycontrol.data.*
import cn.pxyb.mycontrol.ui.feature.agenda.courseAgenda
import org.json.JSONObject
import java.security.MessageDigest
import java.time.LocalDate
import java.util.concurrent.TimeUnit

class PersonalReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val key = inputData.getString("key") ?: return Result.failure()
        val account = inputData.getString("account") ?: return Result.failure()
        val sessionStore = SessionStore(applicationContext)
        val session = sessionStore.captureRequestSession()
        val username = session.username ?: return Result.success()
        if (session.accountScope != account || !sessionStore.hasSession()) return Result.success()
        return sessionStore.withRequestSession(session) {
            val prefs = applicationContext.getSharedPreferences("personal_reminders", Context.MODE_PRIVATE)
            val value = EncryptedPreferenceCodec(prefs, "my_control_personal_reminders").read(key) ?: return@withRequestSession Result.success()
            val record = JSONObject(value)
            val now = System.currentTimeMillis()
            if (now < record.getLong("trigger")) return@withRequestSession Result.retry()
            if (now > record.getLong("expires")) return@withRequestSession Result.success()
            val id = record.getString("id")
            val sourceId = record.getString("sourceId")
            if (record.getString("type") == "todo") {
                val todo = PersonalWorkspaceStore(applicationContext).apply { setAccount(username) }.readTodoSnapshot().tasks.firstOrNull { it.id == sourceId }
                if (todo == null || todo.completed || todo.reminderStatus == "dismissed" || id != "todo:${todo.id}:${todo.reminderAt}") return@withRequestSession Result.success()
            }
            val alert = AppAlertRecord(id, record.getString("type"), sourceId, record.getString("title"), record.getString("body"), now)
            AlertNotifier(applicationContext).apply { setAccount(username) }.notifyScheduledPersonal(alert)
            Result.success()
        }
    }
}

object PersonalReminderScheduler {
    fun schedule(context: Context, username: String, todos: TodoSnapshot, timetable: CampusTimetable?) {
        val account = accountStorageScope(username) ?: return
        val tag = "personal-reminder:$account"
        val prefs = context.getSharedPreferences("personal_reminders", Context.MODE_PRIVATE)
        val codec = EncryptedPreferenceCodec(prefs, "my_control_personal_reminders")
        val manager = WorkManager.getInstance(context)
        val old = prefs.getStringSet("plans:$account", emptySet()).orEmpty()
        val next = mutableSetOf<String>()
        val now = System.currentTimeMillis()
        fun add(id: String, type: String, sourceId: String, title: String, body: String, trigger: Long, expires: Long) {
            if (expires <= now || trigger > now + TimeUnit.DAYS.toMillis(30)) return
            val key = "$tag:${MessageDigest.getInstance("SHA-256").digest(id.toByteArray()).take(16).joinToString("") { "%02x".format(it) }}"
            next += key
            val record = JSONObject().put("id", id).put("type", type).put("sourceId", sourceId).put("title", title).put("body", body).put("trigger", trigger).put("expires", expires).toString()
            if (codec.read(key) == record && key in old) return
            codec.write(key, record)
            val request = OneTimeWorkRequestBuilder<PersonalReminderWorker>()
                .setInitialDelay((trigger - now).coerceAtLeast(0), TimeUnit.MILLISECONDS)
                .setInputData(workDataOf("key" to key, "account" to account)).addTag(tag).build()
            manager.enqueueUniqueWork(key, ExistingWorkPolicy.REPLACE, request)
        }
        todos.tasks.filter { !it.completed && it.reminderStatus != "dismissed" && it.reminderAt != null }.forEach {
            add("todo:${it.id}:${it.reminderAt}", "todo", it.id, "待办提醒：${it.title}", "截止时间临近，打开今日工作台处理。",
                it.reminderAt!!, (it.dueAt ?: it.reminderAt) + TimeUnit.DAYS.toMillis(1))
        }
        if (timetable != null) (0..7).forEach { offset ->
            val date = LocalDate.now().plusDays(offset.toLong())
            courseAgenda(timetable, date).forEach {
                val courseId = it.id.removePrefix("course:").removeSuffix(":$date")
                val course = timetable.courses.firstOrNull { row -> row.id == courseId }
                val occurrenceId = course?.let { row -> cn.pxyb.mycontrol.ui.feature.agenda.courseOccurrenceId(row, timetable, date) } ?: courseId
                add("course:$date:$courseId", "course", occurrenceId, "课程即将开始：${it.title}", it.location, it.start - TimeUnit.MINUTES.toMillis(15), it.start)
            }
        }
        // 临时未取得课表时保留已排好的课程提醒。
        val retained = if (timetable == null) old.filter { key -> codec.read(key)?.let { JSONObject(it).optString("type") == "course" } == true }.toSet() else emptySet()
        next += retained
        (old - next).forEach { manager.cancelUniqueWork(it); prefs.edit().remove(it).apply() }
        prefs.edit().putStringSet("plans:$account", next).apply()
    }
    fun cancel(context: Context, username: String?) {
        val account = accountStorageScope(username) ?: return
        val prefs = context.getSharedPreferences("personal_reminders", Context.MODE_PRIVATE)
        WorkManager.getInstance(context).cancelAllWorkByTag("personal-reminder:$account")
        prefs.edit().apply { prefs.getStringSet("plans:$account", emptySet()).orEmpty().forEach(::remove); remove("plans:$account") }.apply()
    }
}
