package cn.pxyb.mycontrol.ui.navigation



internal const val SAVED_SELECTED_TAB = "selected_tab"
internal const val SAVED_WORKSPACE_DESTINATION = "workspace_destination"

internal fun restoredMainTab(raw: String?): MainTab? = raw?.let { value ->
    when (value.trim().lowercase()) {
        "events", "event", "incidents" -> MainTab.Notifications
        else -> MainTab.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
    }
}

internal fun restoredWorkspaceDestination(raw: String?): WorkspaceDestination? = raw?.let { value ->
    WorkspaceDestination.entries.firstOrNull { it.name.equals(value, ignoreCase = true) }
}
