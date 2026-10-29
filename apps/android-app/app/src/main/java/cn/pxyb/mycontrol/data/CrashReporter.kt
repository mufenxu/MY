package cn.pxyb.mycontrol.data

import android.content.Context
import android.os.Build
import cn.pxyb.mycontrol.BuildConfig
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import org.json.JSONObject

/**
 * 本地崩溃捕获。
 *
 * 设计约束：
 * - 只在崩溃线程内做一次同步小写入，不联网、不初始化任何业务依赖，避免二次崩溃或拖慢系统杀进程；
 * - 不采集账号、凭据、页面内容，只保留堆栈与构建/设备信息；
 * - 最多保留 [MAX_REPORTS] 条，超出后按时间淘汰最旧记录；
 * - 写完必须转发给系统原有处理器，保证崩溃行为（系统弹窗 / 进程终止）不被改变。
 */
internal object CrashReporter {
    private const val DIRECTORY = "crash-reports"
    private const val MAX_REPORTS = 10
    private const val MAX_STACK_CHARS = 12_000
    private const val PREFS = "crash_reporter"
    private const val KEY_LAST_NOTIFIED_AT = "last_notified_at"

    @Volatile private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val appContext = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            runCatching { write(appContext, thread, error) }
            previous?.uncaughtException(thread, error)
                ?: run { android.os.Process.killProcess(android.os.Process.myPid()) }
        }
    }

    /** 是否自上次提示后新增了崩溃记录。 */
    fun hasUnnotified(context: Context): Boolean {
        val latest = latestReportAt(context) ?: return false
        val notifiedAt = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getLong(KEY_LAST_NOTIFIED_AT, 0L)
        return latest > notifiedAt
    }

    fun markNotified(context: Context) {
        val latest = latestReportAt(context) ?: return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putLong(KEY_LAST_NOTIFIED_AT, latest).apply()
    }

    fun reportCount(context: Context): Int = reports(context).size

    /** 汇总为可直接分享给维护者的纯文本；无记录时返回 null。 */
    fun exportText(context: Context): String? {
        val files = reports(context)
        if (files.isEmpty()) return null
        val builder = StringBuilder()
        builder.appendLine("MY Control 诊断日志")
        builder.appendLine("版本 ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        builder.appendLine("共 ${files.size} 条记录")
        files.forEachIndexed { index, file ->
            builder.appendLine()
            builder.appendLine("=== 记录 ${index + 1} / ${files.size} ===")
            builder.append(runCatching { file.readText() }.getOrElse { "读取失败：${it.javaClass.simpleName}" })
        }
        return builder.toString()
    }

    fun clear(context: Context) {
        reports(context).forEach { runCatching { it.delete() } }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    }

    private fun write(context: Context, thread: Thread, error: Throwable) {
        val directory = File(context.filesDir, DIRECTORY)
        if (!directory.exists() && !directory.mkdirs()) return

        val stack = error.stackTraceToString().take(MAX_STACK_CHARS)
        val payload = JSONObject()
            .put("timestamp", System.currentTimeMillis())
            .put("thread", thread.name)
            .put("exception", error.javaClass.name)
            .put("message", error.message.orEmpty().take(512))
            .put("versionName", BuildConfig.VERSION_NAME)
            .put("versionCode", BuildConfig.VERSION_CODE)
            .put("sdkInt", Build.VERSION.SDK_INT)
            .put("device", "${Build.MANUFACTURER} ${Build.MODEL}")
            .put("stack", stack)

        val file = File(directory, "crash-${System.currentTimeMillis()}.json")
        file.writeText(payload.toString())
        prune(directory)
    }

    private fun prune(directory: File) {
        val files = directory.listFiles { file -> file.isFile && file.name.startsWith("crash-") }
            ?.sortedByDescending { it.name }
            ?: return
        files.drop(MAX_REPORTS).forEach { runCatching { it.delete() } }
    }

    private fun reports(context: Context): List<File> = runCatching {
        val directory = File(context.filesDir, DIRECTORY)
        directory.listFiles { file -> file.isFile && file.name.startsWith("crash-") }
            ?.sortedByDescending { it.name }
            ?: emptyList()
    }.getOrDefault(emptyList())

    private fun latestReportAt(context: Context): Long? = reports(context)
        .firstOrNull()
        ?.name
        ?.removePrefix("crash-")
        ?.removeSuffix(".json")
        ?.toLongOrNull()

    /** 供界面展示的简短时间文案。 */
    fun latestReportTime(context: Context): String? {
        val at = latestReportAt(context) ?: return null
        val formatter = SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).apply {
            timeZone = TimeZone.getDefault()
        }
        return formatter.format(Date(at))
    }
}
