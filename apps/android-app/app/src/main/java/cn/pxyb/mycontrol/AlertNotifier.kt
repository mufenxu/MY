package cn.pxyb.mycontrol

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.assistant.DailyBriefPeriod
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import cn.pxyb.mycontrol.assistant.shouldSuppressNotification
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.data.accountStorageScope
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
    @Volatile private var accountUsername: String? = null

    init {
        setAccount(SessionStore(appContext).readActiveUsername())
    }

    fun setAccount(username: String?) {
        accountUsername = username?.trim()?.takeIf(String::isNotEmpty)
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
        val incidentsKey = scopedKey(KEY_SEEN_INCIDENTS)
        val tasksKey = scopedKey(KEY_SEEN_TASKS)
        val hasSeenIncidents = preferences.contains(incidentsKey)
        val hasSeenTasks = preferences.contains(tasksKey)

        val seenIncidents = preferences.getStringSet(incidentsKey, emptySet()).orEmpty().toMutableSet()
        val seenTasks = preferences.getStringSet(tasksKey, emptySet()).orEmpty().toMutableSet()

        val critical = incidents.filter {
            it.status != "resolved" && it.severity.equals("critical", ignoreCase = true)
        }
        val actionable = tasks.filter { it.status == "action_required" || it.status == "failed" }

        // 初次加载/重新安装建立基线，或者 seedOnly 阶段：只记录基线 ID，不产生任何历史虚假通知
        if (!hasSeenIncidents || !hasSeenTasks || seedOnly) {
            seenIncidents.addAll(critical.map { it.id })
            seenTasks.addAll(actionable.map { it.id })
            preferences.edit()
                .putStringSet(incidentsKey, seenIncidents)
                .putStringSet(tasksKey, seenTasks)
                .apply()
            return
        }

        val newCritical = critical.filter { it.id !in seenIncidents }
        val generated = buildList {
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
        }

        if (generated.isNotEmpty()) {
            personalStore.appendAlerts(generated)
            generated.take(3).forEach(::notifyRecord)
        }

        seenIncidents.clear()
        seenIncidents.addAll(critical.map { it.id })
        seenTasks.clear()
        seenTasks.addAll(actionable.map { it.id })
        preferences.edit()
            .putStringSet(incidentsKey, seenIncidents)
            .putStringSet(tasksKey, seenTasks)
            .apply()
    }

    fun clear() {
        ResourceExpiryReminderScheduler.cancel(appContext, accountUsername)
        DailyBriefScheduler.cancel(appContext, accountUsername)
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
        generated.take(3).forEach(::notifyRecord)
    }

    fun notifyRecord(alert: AppAlertRecord): Boolean {
        val critical = alert.priority in setOf("urgent", "high", "critical") || alert.type == "incident"
        if (isSuppressed(critical)) return false
        val intent = when (alert.type) {
            "incident" -> DeepLinks.openIntent(appContext, destination = "notifications")
            "task" -> DeepLinks.openIntent(appContext, destination = "notifications")
            "todo", "course", "resource" -> DeepLinks.openIntent(appContext, destination = "today")
            else -> DeepLinks.openIntent(appContext, destination = "notifications")
        }
        val channelId = if (alert.priority in setOf("high", "critical")) CHANNEL_ID else MESSAGE_CHANNEL_ID
        val posted = notify(
            notificationId = PERSONAL_BASE + alert.id.hashCode(),
            title = alert.title,
            body = alert.body,
            intent = intent,
            channelId = channelId,
            alert = alert,
        )
        if (posted && alert.origin == "remote") {
            markRemoteSeen(alert.id)
        }
        return posted
    }

    fun evaluateRemote(alerts: List<AppAlertRecord>) {
        if (accountScope == null) return
        ensureChannel()
        val seen = readRemoteSeenIds().toMutableSet()
        val unread = alerts.filter { it.origin == "remote" && !it.read && it.id !in seen }
        unread.take(3).forEach(::notifyRecord)
    }

    fun notifyDailyBrief(snapshot: PersonalAssistantSnapshot, period: DailyBriefPeriod): Boolean {
        val date = LocalDate.now()
        val alert = AppAlertRecord(
            id = "daily:${period.name.lowercase()}:$date",
            type = "daily",
            sourceId = period.name,
            title = if (period == DailyBriefPeriod.Morning) "早上好，今天这样安排" else "今晚收尾提醒",
            body = if (period == DailyBriefPeriod.Morning) snapshot.morningBrief else snapshot.eveningBrief,
            createdAt = System.currentTimeMillis(),
        )
        personalStore.appendAlerts(listOf(alert))
        return notifyRecord(alert)
    }

    fun evaluateResourceExpiries(resources: List<ResourceExpiry>) {
        resources.forEach(::notifyResourceExpiry)
        ResourceExpiryReminderScheduler.schedule(appContext, accountUsername, resources)
    }

    fun notifyResourceExpiry(resource: ResourceExpiry): Boolean {
        if (accountScope == null) return false
        ensureChannel()
        val expiresAt = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return true
        val days = ChronoUnit.DAYS.between(LocalDate.now(), expiresAt).toInt()
        if (days > resource.advanceNoticeDays.coerceAtLeast(0)) return true
        val id = "resource:${resource.id}:${resource.expiresAt}"
        val alert = AppAlertRecord(
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
        val existingIds = personalStore.readAlerts().mapTo(mutableSetOf(), AppAlertRecord::id)
        if (id !in existingIds) personalStore.appendAlerts(listOf(alert))
        val postedIds = preferences.getStringSet(scopedKey(KEY_POSTED_RESOURCES), emptySet()).orEmpty().toMutableSet()
        if (id in postedIds) return true
        if (!notifyRecord(alert)) return false
        postedIds.add(id)
        preferences.edit()
            .putStringSet(scopedKey(KEY_POSTED_RESOURCES), postedIds.toList().takeLast(200).toSet())
            .apply()
        return true
    }

    private fun notify(
        notificationId: Int,
        title: String,
        body: String,
        intent: android.content.Intent,
        channelId: String = CHANNEL_ID,
        alert: AppAlertRecord? = null,
    ): Boolean {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            return false
        }
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
        val builder = NotificationCompat.Builder(appContext, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(if (channelId == CHANNEL_ID) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicNotification)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
        alert?.let { addNotificationActions(builder, notificationId, it) }
        val notification = builder.build()
        return try {
            NotificationManagerCompat.from(appContext).notify(notificationId, notification)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    private fun addNotificationActions(
        builder: NotificationCompat.Builder,
        notificationId: Int,
        alert: AppAlertRecord,
    ) {
        if (alert.type == "todo") {
            builder.addAction(
                R.mipmap.ic_launcher,
                "完成",
                notificationActionIntent(NotificationActionReceiver.ACTION_COMPLETE_TODO, notificationId, alert),
            )
        } else {
            builder.addAction(
                R.mipmap.ic_launcher,
                "已读",
                notificationActionIntent(NotificationActionReceiver.ACTION_MARK_READ, notificationId, alert),
            )
        }
        builder.addAction(
            R.mipmap.ic_launcher,
            "1 小时后提醒",
            notificationActionIntent(NotificationActionReceiver.ACTION_SNOOZE, notificationId, alert),
        )
        builder.addAction(
            R.mipmap.ic_launcher,
            "归档",
            notificationActionIntent(NotificationActionReceiver.ACTION_ARCHIVE, notificationId, alert),
        )
    }

    private fun notificationActionIntent(
        action: String,
        notificationId: Int,
        alert: AppAlertRecord,
    ): PendingIntent {
        val intent = android.content.Intent(appContext, NotificationActionReceiver::class.java)
            .setAction(action)
            .putExtra(NotificationActionReceiver.EXTRA_ALERT_ID, alert.id)
            .putExtra(NotificationActionReceiver.EXTRA_SOURCE_ID, alert.sourceId)
            .putExtra(NotificationActionReceiver.EXTRA_REMOTE, alert.origin == "remote")
            .putExtra(NotificationActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
        return PendingIntent.getBroadcast(
            appContext,
            31 * notificationId + action.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
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
        else -> source
    }

    private fun isSuppressed(critical: Boolean): Boolean {
        val settings = personalStore.readAlertPreferences()
        return shouldSuppressNotification(
            settings = settings,
            classFocusUntilMillis = personalStore.readAssistantSnapshot()?.classFocusUntilMillis,
            critical = critical,
        )
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
        const val KEY_POSTED_RESOURCES = "posted_resources_v1"
        const val CHANNEL_ID = "ops_alerts"
        const val MESSAGE_CHANNEL_ID = "app_notifications"
        const val INCIDENT_BASE = 41000
        const val TASK_BASE = 42000
        const val PERSONAL_BASE = 43000
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
