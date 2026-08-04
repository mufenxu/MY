package cn.pxyb.mycontrol.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.MainActivity
import cn.pxyb.mycontrol.ui.MainTab
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.OverviewData
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
        private const val TONE_HEALTHY = "healthy"
        private const val TONE_ATTENTION = "attention"

        fun publish(
            context: Context,
            overview: OverviewData?,
            activeIncidents: List<IncidentInfo>,
            iot: IotData?,
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
                .apply()
            updateAll(context)
        }

        fun clear(context: Context) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
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
            val statusColor = when (tone) {
                TONE_HEALTHY -> R.color.widget_status_healthy
                TONE_ATTENTION -> R.color.widget_status_attention
                else -> R.color.widget_text_secondary
            }
            val views = RemoteViews(context.packageName, R.layout.widget_my_control)
            views.setTextViewText(R.id.widget_status, preferences.getString(KEY_STATUS, "尚未同步"))
            views.setTextColor(R.id.widget_status, ContextCompat.getColor(context, statusColor))
            views.setTextViewText(R.id.widget_service_value, preferences.getString(KEY_SERVICES, "--"))
            views.setTextViewText(R.id.widget_incident_value, preferences.getString(KEY_INCIDENTS, "--"))
            views.setTextViewText(R.id.widget_device_value, preferences.getString(KEY_DEVICES, "--"))
            views.setTextViewText(
                R.id.widget_updated_at,
                if (hasData) {
                    "更新 ${android.text.format.DateFormat.getTimeFormat(context).format(Date(preferences.getLong(KEY_UPDATED_AT, 0L)))}"
                } else {
                    "尚未同步"
                },
            )

            val openTab = if (tone == TONE_ATTENTION) MainTab.Events else MainTab.Overview
            val openIntent = DeepLinks.openIntent(context, tab = openTab)
            val openPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openPendingIntent)

            val eventsIntent = DeepLinks.openIntent(context, tab = MainTab.Events)
            val eventsPendingIntent = PendingIntent.getActivity(
                context,
                1,
                eventsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            runCatching { views.setOnClickPendingIntent(R.id.widget_incident_value, eventsPendingIntent) }
            return views
        }
    }
}
