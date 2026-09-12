package cn.pxyb.mycontrol.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.assistant.PersonalAssistantSnapshot
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.ui.navigation.MainTab
import java.util.Date

class MyControlWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { manager.updateAppWidget(it, buildViews(context)) }
    }

    companion object {
        private const val PREFERENCES = "my_control_widget"
        private const val KEY_HAS_DATA = "has_data"
        private const val KEY_STATUS = "status"
        private const val KEY_STATUS_TONE = "status_tone"
        private const val KEY_SERVICES = "services"
        private const val KEY_INCIDENTS = "incidents"
        private const val KEY_DEVICES = "devices"
        private const val KEY_UPDATED_AT = "updated_at"
        private const val KEY_ACTION_TITLE = "action_title"
        private const val KEY_ACTION_DETAIL = "action_detail"
        private const val KEY_ACTION_DESTINATION = "action_destination"
        private const val KEY_QUICK_SCENE_ID = "quick_scene_id"
        private const val KEY_QUICK_SCENE_NAME = "quick_scene_name"
        private const val TONE_HEALTHY = "healthy"
        private const val TONE_ATTENTION = "attention"

        fun publish(
            context: Context,
            overview: OverviewData?,
            activeIncidents: List<IncidentInfo>,
            iot: IotData?,
            assistant: PersonalAssistantSnapshot?,
            quickScene: QuickScenePreference?,
        ) {
            val monitored = overview?.monitoredCount ?: 0
            val healthy = overview?.healthyCount ?: 0
            val criticalIncidents = activeIncidents.count { it.severity == "critical" }
            val serviceAttention = overview?.services.orEmpty().any {
                it.state in setOf("critical", "degraded", "failed", "offline", "outage", "error")
            }
            val iotAttention = iot != null && (!iot.mqttConnected || iot.devices.any { !it.online })
            val statusTone = if (criticalIncidents > 0 || serviceAttention || iotAttention) TONE_ATTENTION else TONE_HEALTHY
            val status = when {
                overview == null && iot == null -> "状态待确认"
                statusTone == TONE_ATTENTION -> "需要关注"
                monitored > 0 && healthy == monitored -> "运行正常"
                else -> "状态待确认"
            }
            val deviceValue = iot?.let { data -> "${data.devices.count { it.online }}/${data.devices.size}" } ?: "--"

            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
                .putBoolean(KEY_HAS_DATA, true)
                .putString(KEY_STATUS, status)
                .putString(KEY_STATUS_TONE, statusTone)
                .putString(KEY_SERVICES, if (monitored > 0) "$healthy/$monitored" else "--")
                .putString(KEY_INCIDENTS, criticalIncidents.toString())
                .putString(KEY_DEVICES, deviceValue)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .putString(KEY_ACTION_TITLE, assistant?.nextAction?.title)
                .putString(KEY_ACTION_DETAIL, assistant?.nextAction?.detail)
                .putString(KEY_ACTION_DESTINATION, assistant?.nextAction?.destination?.deepLinkValue)
                .putString(KEY_QUICK_SCENE_ID, quickScene?.sceneId)
                .putString(KEY_QUICK_SCENE_NAME, quickScene?.sceneName)
                .apply()
            updateAll(context)
        }

        fun clear(context: Context) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
            updateAll(context)
        }

        fun refresh(context: Context) {
            updateAll(context)
        }

        private fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, MyControlWidgetProvider::class.java)
            manager.getAppWidgetIds(component).forEach { manager.updateAppWidget(it, buildViews(context)) }
        }

        private fun buildViews(context: Context): RemoteViews {
            val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            val hasData = preferences.getBoolean(KEY_HAS_DATA, false)
            val tone = preferences.getString(KEY_STATUS_TONE, null)
            val updatedAtMillis = preferences.getLong(KEY_UPDATED_AT, 0L)
            val stale = updatedAtMillis <= 0L || System.currentTimeMillis() - updatedAtMillis > STALE_AFTER_MS
            val statusColor = when {
                stale -> R.color.widget_text_secondary
                tone == TONE_HEALTHY -> R.color.widget_status_healthy
                tone == TONE_ATTENTION -> R.color.widget_status_attention
                else -> R.color.widget_text_secondary
            }
            val views = RemoteViews(context.packageName, R.layout.widget_my_control)
            views.setTextViewText(R.id.widget_status, preferences.getString(KEY_STATUS, "尚未同步"))
            views.setTextColor(R.id.widget_status, ContextCompat.getColor(context, statusColor))
            views.setTextViewText(R.id.widget_service_value, preferences.getString(KEY_SERVICES, "--"))
            views.setTextViewText(R.id.widget_incident_value, preferences.getString(KEY_INCIDENTS, "--"))
            views.setTextViewText(R.id.widget_device_value, preferences.getString(KEY_DEVICES, "--"))
            val actionTitle = preferences.getString(KEY_ACTION_TITLE, null)
            val actionDetail = preferences.getString(KEY_ACTION_DETAIL, null)
            views.setTextViewText(R.id.widget_action_title, actionTitle ?: "打开今日工作台")
            views.setTextViewText(R.id.widget_action_detail, actionDetail ?: "查看课程、待办和提醒")
            val quickSceneId = preferences.getString(KEY_QUICK_SCENE_ID, null)
            val quickSceneName = preferences.getString(KEY_QUICK_SCENE_NAME, null)
            views.setViewVisibility(R.id.widget_quick_scene, if (quickSceneId.isNullOrBlank()) android.view.View.GONE else android.view.View.VISIBLE)
            views.setTextViewText(R.id.widget_quick_scene, quickSceneName?.let { "场景 · $it" } ?: "常用场景")
            views.setTextViewText(
                R.id.widget_updated_at,
                if (hasData) {
                    val updatedAt = android.text.format.DateFormat.getTimeFormat(context).format(Date(updatedAtMillis))
                    if (stale) "数据可能已过期 · $updatedAt" else "更新 $updatedAt"
                } else {
                    "尚未同步"
                },
            )

            val openIntent = when (preferences.getString(KEY_ACTION_DESTINATION, "today")) {
                "notifications" -> DeepLinks.openIntent(context, destination = "notifications")
                "operations" -> DeepLinks.openIntent(context, tab = MainTab.Operations)
                "profile" -> DeepLinks.openIntent(context, tab = MainTab.Profile)
                else -> DeepLinks.openIntent(context, destination = "today")
            }
            val openPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openPendingIntent)
            views.setOnClickPendingIntent(R.id.widget_action_title, openPendingIntent)

            val notificationsIntent = DeepLinks.openIntent(context, tab = MainTab.Notifications)
            val notificationsPendingIntent = PendingIntent.getActivity(
                context,
                1,
                notificationsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            runCatching { views.setOnClickPendingIntent(R.id.widget_incident_value, notificationsPendingIntent) }

            val overviewPendingIntent = PendingIntent.getActivity(
                context,
                2,
                DeepLinks.openIntent(context, tab = MainTab.Overview),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            runCatching { views.setOnClickPendingIntent(R.id.widget_service_value, overviewPendingIntent) }

            val devicesPendingIntent = PendingIntent.getActivity(
                context,
                3,
                DeepLinks.openIntent(context, tab = MainTab.Tools),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            runCatching { views.setOnClickPendingIntent(R.id.widget_device_value, devicesPendingIntent) }
            if (!quickSceneId.isNullOrBlank()) {
                val scenePendingIntent = PendingIntent.getActivity(
                    context,
                    4,
                    DeepLinks.openIntent(context, destination = "scenes", sceneId = quickSceneId),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                views.setOnClickPendingIntent(R.id.widget_quick_scene, scenePendingIntent)
            }
            return views
        }

        private const val STALE_AFTER_MS = 30 * 60_000L
    }
}
