package cn.pxyb.mycontrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.ui.MainTab
import java.time.LocalTime
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

class AlertNotifier(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    private val personalStore = PersonalWorkspaceStore(appContext)

    fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = appContext.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "运维告警",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "关键事件与待处理任务提醒"
            enableVibration(true)
        }
        manager.createNotificationChannel(channel)
    }

    fun evaluate(
        incidents: List<IncidentInfo>,
        tasks: List<PlatformTask>,
        seedOnly: Boolean = false,
    ) {
        ensureChannel()
        val seenIncidents = preferences.getStringSet(KEY_SEEN_INCIDENTS, emptySet()).orEmpty().toMutableSet()
        val seenTasks = preferences.getStringSet(KEY_SEEN_TASKS, emptySet()).orEmpty().toMutableSet()

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
                            title = "严重事件：${incident.title}",
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
                            title = if (task.status == "failed") "任务失败：${task.title}" else "待处理：${task.title}",
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
                    title = "严重事件：${incident.title}",
                    body = listOfNotNull(
                        incident.serviceId?.takeIf { it.isNotBlank() },
                        incident.description.takeIf { it.isNotBlank() },
                    ).joinToString(" · ").ifBlank { "请尽快确认并处理" },
                    intent = DeepLinks.openIntent(
                        appContext,
                        tab = MainTab.Events,
                        incidentId = incident.id,
                    ),
                )
            }
            newActionable.take(3).forEach { task ->
                notify(
                    notificationId = TASK_BASE + task.id.hashCode(),
                    title = if (task.status == "failed") "任务失败：${task.title}" else "待处理：${task.title}",
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
            .putStringSet(KEY_SEEN_INCIDENTS, seenIncidents)
            .putStringSet(KEY_SEEN_TASKS, seenTasks)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
        NotificationManagerCompat.from(appContext).cancelAll()
    }

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
            "incident" -> DeepLinks.openIntent(appContext, tab = MainTab.Events, incidentId = alert.sourceId)
            "task" -> DeepLinks.openIntent(appContext, tab = MainTab.Operations, taskId = alert.sourceId)
            "todo", "course", "resource" -> DeepLinks.openIntent(appContext, destination = "today")
            else -> DeepLinks.openIntent(appContext, destination = "notifications")
        }
        notify(PERSONAL_BASE + alert.id.hashCode(), alert.title, alert.body, intent)
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

    private fun notify(notificationId: Int, title: String, body: String, intent: android.content.Intent) {
        if (!NotificationManagerCompat.from(appContext).areNotificationsEnabled()) return
        val pendingIntent = PendingIntent.getActivity(
            appContext,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(appContext, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        runCatching {
            NotificationManagerCompat.from(appContext).notify(notificationId, notification)
        }
    }

    private fun sourceLabel(source: String): String = when (source) {
        "configuration" -> "配置审批"
        "incident" -> "告警事件"
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
        const val CHANNEL_ID = "ops_alerts"
        const val INCIDENT_BASE = 41000
        const val TASK_BASE = 42000
        const val PERSONAL_BASE = 43000
        const val COURSE_NOTICE_WINDOW_MS = 30 * 60_000L
    }
}
