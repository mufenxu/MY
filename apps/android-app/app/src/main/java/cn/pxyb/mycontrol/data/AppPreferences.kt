package cn.pxyb.mycontrol.data

import android.content.Context

enum class AppThemePreference {
    System,
    Light,
    Dark,
}

internal fun restoredThemePreference(raw: String?): AppThemePreference =
    AppThemePreference.entries.firstOrNull { it.name == raw } ?: AppThemePreference.System

class AppPreferences(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun themePreference(): AppThemePreference =
        restoredThemePreference(preferences.getString(KEY_THEME, null))

    fun setThemePreference(value: AppThemePreference) {
        preferences.edit().putString(KEY_THEME, value.name).apply()
    }

    fun shouldShowInitialSetup(): Boolean = !preferences.getBoolean(KEY_SETUP_COMPLETE, false)

    fun completeInitialSetup() {
        preferences.edit().putBoolean(KEY_SETUP_COMPLETE, true).apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "app_preferences"
        const val KEY_THEME = "theme"
        const val KEY_SETUP_COMPLETE = "setup_complete"
    }
}
