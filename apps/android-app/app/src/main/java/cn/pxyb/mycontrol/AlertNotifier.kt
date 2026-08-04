package cn.pxyb.mycontrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.PlatformTask
import cn.pxyb.mycontrol.ui.MainTab

class AlertNotifier(context: Context) {
    private val appContext = context.applicationContext
    private val preferences = appContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

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

        if (!seedOnly) {
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

    private companion object {
        const val PREFERENCES = "my_control_alerts"
        const val KEY_SEEN_INCIDENTS = "seen_incidents"
        const val KEY_SEEN_TASKS = "seen_tasks"
        const val CHANNEL_ID = "ops_alerts"
        const val INCIDENT_BASE = 41000
        const val TASK_BASE = 42000
    }
}
