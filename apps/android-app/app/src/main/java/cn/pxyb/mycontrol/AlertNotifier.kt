package cn.pxyb.mycontrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.EnvironmentSummary
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.accountStorageScope
import cn.pxyb.mycontrol.ui.MainTab
import java.time.LocalTime
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

internal fun localizedTaskTitle(task: PlatformTask): String {
    val title = task.title.trim()
    return when (task.source) {
        "configuration" -> if (title.contains("rollback", ignoreCase = true) || title.contains("回滚")) "配置回滚提案" else "配置变更提案"
        "release_build" -> "发布构建"
        "release_deployment" -> "发布部署"
        "backup" -> "数据备份"
        "notification" -> "通知任务"
        else -> title.ifBlank { "平台任务" }
    }
}

class AlertNotifier(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val personalStore = PersonalWorkspaceStore(appContext)
    @Volatile private var accountScope: String? = null

    init {
        setAccount(SessionStore(appContext).readActiveUsername())
    }

    fun setAccount(username: String?) {
        accountScope = accountStorageScope(username)
        personalStore.setAccount(username)
    }

    fun ensureChannel() {
        val manager = appContext.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannels(
            listOf(
                NotificationChannel(
                    CHANNEL_ID,
                    "重要告警",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "系统异常与需要立即处理的任务"
                    enableVibration(true)
                },
                NotificationChannel(
                    MESSAGE_CHANNEL_ID,
                    "一般通知",
                    NotificationManager.IMPORTANCE_DEFAULT,
                ).apply {
                    description = "系统消息、进度更新与日常提醒"
                },
            ),
        )
    }

    fun evaluate(
        incidents: List<IncidentInfo>,
        tasks: List<PlatformTask>,
        seedOnly: Boolean = false,
    ) {
        if (accountScope == null) return
        ensureChannel()
        val seenIncidents = preferences.getStringSet(scopedKey(KEY_SEEN_INCIDENTS), emptySet()).orEmpty().toMutableSet()
        val seenTasks = preferences.getStringSet(scopedKey(KEY_SEEN_TASKS), emptySet()).orEmpty().toMutableSet()

        val critical = incidents.filter {
            it.status != "resolved" && it.severity.equals("critical", ignoreCase = true)
        }
        val actionable = tasks.filter { it.status == "action_required" || it.status == "failed" }

        val newCritical = critical.filter { it.id !in seenIncidents }
        val newActionable = actionable.filter { it.id !in seenTasks }

        personalStore.appendAlerts(
            buildList {
                newCritical.forEach { incident ->
                    add(
                        AppAlertRecord(
                            id = "incident:${incident.id}:${incident.updatedAt.orEmpty()}",
                            type = "incident",
                            sourceId = incident.id,
                            title = "系统异常：${incident.title}",
                            body = listOfNotNull(
                                incident.serviceId?.takeIf(String::isNotBlank),
                                incident.description.takeIf(String::isNotBlank),
                            ).joinToString(" · ").ifBlank { "请尽快确认并处理" },
                            createdAt = System.currentTimeMillis(),
                        ),
                    )
                }
                newActionable.forEach { task ->
                    add(
                        AppAlertRecord(
                            id = "task:${task.id}:${task.updatedAt.orEmpty()}",
                            type = "task",
                            sourceId = task.id,
                            title = if (task.status == "failed") "任务失败：${localizedTaskTitle(task)}" else "待处理：${localizedTaskTitle(task)}",
                            body = listOf(sourceLabel(task.source), task.detail).filter(String::isNotBlank).joinToString(" · "),
                            createdAt = System.currentTimeMillis(),
                        ),
                    )
                }
            },
        )

        if (!seedOnly && !isQuietHours()) {
            newCritical.take(3).forEach { incident ->
                notify(
                    notificationId = INCIDENT_BASE + incident.id.hashCode(),
                    title = "系统异常：${incident.title}",
                    body = listOfNotNull(
                        incident.serviceId?.takeIf { it.isNotBlank() },
                        incident.description.takeIf { it.isNotBlank() },
                    ).joinToString(" · ").ifBlank { "请尽快确认并处理" },
                    intent = DeepLinks.openIntent(
                        appContext,
                        destination = "notifications",
                    ),
                )
            }
            newActionable.take(3).forEach { task ->
                notify(
                    notificationId = TASK_BASE + task.id.hashCode(),
                    title = if (task.status == "failed") "任务失败：${localizedTaskTitle(task)}" else "待处理：${localizedTaskTitle(task)}",
                    body = listOfNotNull(
                        sourceLabel(task.source),
                        task.detail.takeIf { it.isNotBlank() },
                    ).joinToString(" · ").ifBlank { "打开任务中心处理" },
                    intent = DeepLinks.openIntent(
                        appContext,
                        tab = MainTab.Operations,
                        taskId = task.id,
                    ),
                )
            }
        }

        seenIncidents.clear()
        seenIncidents.addAll(critical.map { it.id })
        seenTasks.clear()
        seenTasks.addAll(actionable.map { it.id })
        preferences.edit()
            .putStringSet(scopedKey(KEY_SEEN_INCIDENTS), seenIncidents)
            .putStringSet(scopedKey(KEY_SEEN_TASKS), seenTasks)
            .apply()
    }

    fun evaluateEnvironment(summary: EnvironmentSummary) {
        if (accountScope == null) return
        ensureChannel()
        val fingerprint = listOf(
            summary.available,
            summary.state,
            summary.missing,
            summary.invalid,
            summary.verificationFailed,
            summary.restartRequired,
        ).joinToString(":")
        val key = scopedKey(KEY_ENVIRONMENT_FINGERPRINT)
        if (!summary.available || summary.state == "healthy") {
            preferences.edit().remove(key).apply()
            return
        }
        if (preferences.getString(key, null) == fingerprint) return
        preferences.edit().putString(key, fingerprint).apply()
        val needsAttention = summary.missing + summary.invalid + summary.verificationFailed
        val body = when {
            needsAttention > 0 && summary.restartRequired > 0 -> "$needsAttention 项配置需要处理，${summary.restartRequired} 项配置等待服务重启，请打开高级工具查看诊断结果。"
            needsAttention > 0 -> "$needsAttention 项配置需要处理，请打开高级工具查看诊断结果。"
            else -> "${summary.restartRequired} 项配置等待服务重启，请打开高级工具查看诊断结果。"
        }
        val alert = AppAlertRecord(
            id = "environment:$fingerprint",
            type = "environment",
            sourceId = "environment",
            title = "环境配置需要处理",
            body = body,
            createdAt = System.currentTimeMillis(),
        )
        personalStore.appendAlerts(listOf(alert))
        if (!isQuietHours()) {
            notify(
                notificationId = ENVIRONMENT_BASE,
                title = alert.title,
                body = body,
                intent = DeepLinks.openIntent(appContext, tab = MainTab.Operations),
            )
        }
    }

    fun clear() {
        accountScope?.let { scope ->
            val prefix = "account_${scope}_"
            preferences.edit().apply {
                preferences.all.keys.filter { it.startsWith(prefix) }.forEach(::remove)
            }.apply()
        }
        NotificationManagerCompat.from(appContext).cancelAll()
    }

    private fun scopedKey(base: String): String = "account_${requireNotNull(accountScope)}_$base"

    fun evaluatePersonal(todos: TodoSnapshot, timetable: CampusTimetable?) {
        ensureChannel()
        val now = System.currentTimeMillis()
        val existingIds = personalStore.readAlerts().mapTo(mutableSetOf(), AppAlertRecord::id)
        val generated = buildList {
            todos.tasks.filter { task ->
                !task.completed && task.reminderStatus != "dismissed" && task.reminderAt?.let { it <= now } == true
            }.forEach { task ->
                val id = "todo:${task.id}:${task.reminderAt}"
                if (id !in existingIds) {
                    add(AppAlertRecord(id, "todo", task.id, "待办提醒：${task.title}", "截止时间临近，打开今日工作台处理。", now))
                }
            }

            val week = Regex("第(\\d+)周").find(timetable?.currentCalendarText.orEmpty())
                ?.groupValues?.getOrNull(1)?.toIntOrNull()
            val today = LocalDate.now()
            timetable?.courses.orEmpty().filter { course ->
                course.day == today.dayOfWeek.value && (week == null || course.weeks.isEmpty() || week in course.weeks)
            }.forEach { course ->
                val start = parseCourseStart(today, course.timeRange) ?: return@forEach
                if (now in (start - COURSE_NOTICE_WINDOW_MS)..start) {
                    val id = "course:$today:${course.id}"
                    if (id !in existingIds) {
                        add(
                            AppAlertRecord(
                                id = id,
                                type = "course",
                                sourceId = course.id,
                                title = "课程即将开始：${course.courseName}",
                                body = listOf(course.timeRange, course.location).filter(String::isNotBlank).joinToString(" · "),
                                createdAt = now,
                            ),
                        )
                    }
                }
            }
        }
        personalStore.appendAlerts(generated)
        if (!isQuietHours()) {
            generated.take(3).forEach { alert ->
                notify(
                    notificationId = PERSONAL_BASE + alert.id.hashCode(),
                    title = alert.title,
                    body = alert.body,
                    intent = DeepLinks.openIntent(appContext, destination = "today"),
                )
            }
        }
    }

    fun notifyRecord(alert: AppAlertRecord) {
        if (isQuietHours()) return
        val intent = when (alert.type) {
            "incident" -> DeepLinks.openIntent(appContext, destination = "notifications")
            "task" -> DeepLinks.openIntent(appContext, tab = MainTab.Operations, taskId = alert.sourceId)
            "todo", "course", "resource" -> DeepLinks.openIntent(appContext, destination = "today")
            else -> DeepLinks.openIntent(appContext, destination = "notifications")
        }
        val channelId = if (alert.priority in setOf("high", "critical")) CHANNEL_ID else MESSAGE_CHANNEL_ID
        val posted = notify(PERSONAL_BASE + alert.id.hashCode(), alert.title, alert.body, intent, channelId)
        if (posted && alert.origin == "remote") {
            markRemoteSeen(alert.id)
        }
    }

    fun evaluateRemote(alerts: List<AppAlertRecord>) {
        if (accountScope == null) return
        ensureChannel()
        val seen = readRemoteSeenIds().toMutableSet()
        val unread = alerts.filter { it.origin == "remote" && !it.read && it.id !in seen }
        if (!isQuietHours()) unread.take(3).forEach(::notifyRecord)
    }

    fun evaluateResourceExpiries(resources: List<ResourceExpiry>) {
        ensureChannel()
        val today = LocalDate.now()
        val existingIds = personalStore.readAlerts().mapTo(mutableSetOf(), AppAlertRecord::id)
        val generated = resources.mapNotNull { resource ->
            val expiresAt = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@mapNotNull null
            val days = ChronoUnit.DAYS.between(today, expiresAt).toInt()
            if (days > maxOf(30, resource.advanceNoticeDays)) return@mapNotNull null
            val id = "resource:${resource.id}:${resource.expiresAt}"
            if (id in existingIds) return@mapNotNull null
            AppAlertRecord(
                id = id,
                type = "resource",
                sourceId = resource.id,
                title = if (days < 0) "资源已过期：${resource.name}" else "资源即将到期：${resource.name}",
                body = when {
                    days < 0 -> "已过期 ${-days} 天"
                    days == 0 -> "今天到期"
                    else -> "$days 天后到期"
                },
                createdAt = System.currentTimeMillis(),
            )
        }
        personalStore.appendAlerts(generated)
        generated.take(3).forEach(::notifyRecord)
    }

    private fun notify(
        notificationId: Int,
        title: String,
        body: String,
        intent: android.content.Intent,
        channelId: String = CHANNEL_ID,
    ): Boolean {
        if (!canPostNotification(channelId)) return false
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val publicContent = publicNotificationContent()
        val publicNotification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(publicContent.title)
            .setContentText(publicContent.body)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build()
        val notification = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (channelId == CHANNEL_ID) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicNotification)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        return runCatching {
            NotificationManagerCompat.from(appContext).notify(notificationId, notification)
        }.isSuccess
    }

    private fun markRemoteSeen(alertId: String) {
        val legacySeen = preferences.getStringSet(scopedKey(KEY_SEEN_REMOTE), emptySet()).orEmpty().toMutableSet()
        val postedSeen = preferences.getStringSet(scopedKey(KEY_SEEN_REMOTE_POSTED), emptySet()).orEmpty().toMutableSet()
        val changed = legacySeen.add(alertId) or postedSeen.add(alertId)
        if (!changed) return
        preferences.edit()
            .putStringSet(scopedKey(KEY_SEEN_REMOTE), legacySeen.toList().takeLast(200).toSet())
            .putStringSet(scopedKey(KEY_SEEN_REMOTE_POSTED), postedSeen.toList().takeLast(200).toSet())
            .apply()
    }

    private fun canPostNotification(channelId: String): Boolean {
        val notificationManager = NotificationManagerCompat.from(appContext)
        if (!notificationManager.areNotificationsEnabled()) return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        val manager = appContext.getSystemService(NotificationManager::class.java) ?: return true
        val channel = manager.getNotificationChannel(channelId) ?: return true
        return channel.importance != NotificationManager.IMPORTANCE_NONE
    }

    private fun readRemoteSeenIds(): Set<String> {
        val legacySeen = preferences.getStringSet(scopedKey(KEY_SEEN_REMOTE), emptySet()).orEmpty()
        val postedSeen = preferences.getStringSet(scopedKey(KEY_SEEN_REMOTE_POSTED), emptySet()).orEmpty()
        return legacySeen + postedSeen
    }

    private fun sourceLabel(source: String): String = when (source) {
        "configuration" -> "配置审批"
        "incident" -> "系统异常"
        "backup" -> "数据备份"
        "notification" -> "通知任务"
        "release_build" -> "发布构建"
        "release_deployment" -> "发布部署"
        else -> source
    }

    private fun isQuietHours(): Boolean {
        val settings = personalStore.readAlertPreferences()
        if (!settings.quietHoursEnabled) return false
        val hour = LocalTime.now().hour
        return if (settings.quietStartHour == settings.quietEndHour) {
            true
        } else if (settings.quietStartHour < settings.quietEndHour) {
            hour in settings.quietStartHour until settings.quietEndHour
        } else {
            hour >= settings.quietStartHour || hour < settings.quietEndHour
        }
    }

    private fun parseCourseStart(date: LocalDate, value: String): Long? {
        val match = Regex("(\\d{1,2}):(\\d{2})").find(value) ?: return null
        val hour = match.groupValues[1].toIntOrNull() ?: return null
        val minute = match.groupValues[2].toIntOrNull() ?: return null
        return runCatching {
            LocalDateTime.of(date, LocalTime.of(hour, minute))
                .atZone(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
    }

    private companion object {
        const val PREFERENCES = "my_control_alerts"
        const val KEY_SEEN_INCIDENTS = "seen_incidents"
        const val KEY_SEEN_TASKS = "seen_tasks"
        const val KEY_SEEN_REMOTE = "seen_remote"
        const val KEY_SEEN_REMOTE_POSTED = "seen_remote_posted_v2"
        const val KEY_ENVIRONMENT_FINGERPRINT = "environment_fingerprint_v1"
        const val CHANNEL_ID = "ops_alerts"
        const val MESSAGE_CHANNEL_ID = "app_notifications"
        const val INCIDENT_BASE = 41000
        const val TASK_BASE = 42000
        const val PERSONAL_BASE = 43000
        const val ENVIRONMENT_BASE = 44000
        const val COURSE_NOTICE_WINDOW_MS = 30 * 60_000L
    }
}

internal data class PublicNotificationContent(
    val title: String,
    val body: String,
)

internal fun publicNotificationContent(): PublicNotificationContent = PublicNotificationContent(
        title = "MY 有新的提醒",
        body = "解锁后查看详细内容",
    )
