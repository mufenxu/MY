package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

import android.content.Context

enum class HomeQuickAction {
    Today,
    Notifications,
    Scenes,
    Reservation,
    FreeClassrooms,
    SeatReservation,
    WaterValve,
    Devices,
    Diagnostics,
    Backup,
    GoogleAccounts,
    Operations,
    Search,
    QrScanner,
    Account,
}

internal val DEFAULT_HIDDEN_HOME_QUICK_ACTIONS: Set<HomeQuickAction> = setOf(
    HomeQuickAction.Today,
    HomeQuickAction.Devices,
    HomeQuickAction.Diagnostics,
    HomeQuickAction.Backup,
    HomeQuickAction.Operations,
    HomeQuickAction.GoogleAccounts,
)

@Immutable
data class HomeQuickActionPreferences(
    val order: List<HomeQuickAction>,
    val hidden: Set<HomeQuickAction>,
)

class HomePreferences(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): HomeQuickActionPreferences {
        val savedOrder = preferences.getString(KEY_ORDER, null)
            ?.split(',')
            .orEmpty()
            .mapNotNull { value -> HomeQuickAction.entries.firstOrNull { it.name == value } }
        val order = (savedOrder + HomeQuickAction.entries).distinct()
        val hasSavedPreferences = preferences.contains(KEY_ORDER) || preferences.contains(KEY_HIDDEN)
        val hidden = if (hasSavedPreferences) {
            preferences.getStringSet(KEY_HIDDEN, emptySet()).orEmpty()
                .mapNotNullTo(mutableSetOf()) { value -> HomeQuickAction.entries.firstOrNull { it.name == value } }
        } else {
            DEFAULT_HIDDEN_HOME_QUICK_ACTIONS
        }
        return HomeQuickActionPreferences(order = order, hidden = hidden)
    }

    fun write(order: List<HomeQuickAction>, hidden: Set<HomeQuickAction>) {
        val normalizedOrder = (order + HomeQuickAction.entries).distinct()
        val normalizedHidden = hidden.intersect(HomeQuickAction.entries.toSet())
            .takeIf { it.size < HomeQuickAction.entries.size }
            ?: emptySet()
        preferences.edit()
            .putString(KEY_ORDER, normalizedOrder.joinToString(",", transform = HomeQuickAction::name))
            .putStringSet(KEY_HIDDEN, normalizedHidden.mapTo(mutableSetOf(), HomeQuickAction::name))
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "home_preferences"
        const val KEY_ORDER = "quick_action_order"
        const val KEY_HIDDEN = "quick_action_hidden"
    }
}
