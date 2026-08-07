package cn.pxyb.mycontrol

import android.content.Context
import android.content.Intent
import android.net.Uri
import cn.pxyb.mycontrol.ui.MainTab

object DeepLinks {
    const val SCHEME = "mycontrol"
    const val HOST_OPEN = "open"
    const val EXTRA_TAB = "tab"
    const val EXTRA_INCIDENT_ID = "incidentId"
    const val EXTRA_TASK_ID = "taskId"
    const val EXTRA_DESTINATION = "destination"

    fun openIntent(
        context: Context,
        tab: MainTab? = null,
        incidentId: String? = null,
        taskId: String? = null,
        destination: String? = null,
    ): Intent {
        val uri = Uri.Builder()
            .scheme(SCHEME)
            .authority(HOST_OPEN)
            .apply {
                tab?.let { appendQueryParameter(EXTRA_TAB, it.name.lowercase()) }
                incidentId?.takeIf { it.isNotBlank() }?.let { appendQueryParameter(EXTRA_INCIDENT_ID, it) }
                taskId?.takeIf { it.isNotBlank() }?.let { appendQueryParameter(EXTRA_TASK_ID, it) }
                destination?.takeIf { it.isNotBlank() }?.let { appendQueryParameter(EXTRA_DESTINATION, it) }
            }
            .build()
        return Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = uri
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }

    fun parseTab(raw: String?): MainTab? = when (raw?.trim()?.lowercase()) {
        "overview" -> MainTab.Overview
        "events", "incidents", "event" -> MainTab.Events
        "operations", "tasks", "ops" -> MainTab.Operations
        "tools" -> MainTab.Tools
        "profile" -> MainTab.Profile
        else -> null
    }
}
