package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

import android.content.Context

enum class HomeQuickAction {
    CampusCenter,
    SystemCenter,
    DeviceCenter,
    Today,
    Notifications,
    Scenes,
    Reservation,
    FreeClassrooms,
    SeatReservation,
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
    HomeQuickAction.Notifications,
    HomeQuickAction.Scenes,
    HomeQuickAction.Reservation,
    HomeQuickAction.FreeClassrooms,
    HomeQuickAction.SeatReservation,
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
        val migrated = preferences.getBoolean(KEY_FEATURE_CENTER_MIGRATED, false)
        val savedOrder = preferences.getString(KEY_ORDER, null)
            ?.split(',')
            .orEmpty()
            .mapNotNull { value -> HomeQuickAction.entries.firstOrNull { it.name == value } }
        val hasSavedPreferences = preferences.contains(KEY_ORDER) || preferences.contains(KEY_HIDDEN)
        val order = if (!migrated && hasSavedPreferences) {
            listOf(
                HomeQuickAction.CampusCenter,
                HomeQuickAction.SystemCenter,
                HomeQuickAction.DeviceCenter,
            ) + savedOrder
        } else {
            savedOrder
        } + HomeQuickAction.entries
        val normalizedOrder = order.distinct()
        val hidden = if (hasSavedPreferences && !migrated) {
            preferences.getStringSet(KEY_HIDDEN, emptySet()).orEmpty()
                .mapNotNullTo(mutableSetOf()) { value -> HomeQuickAction.entries.firstOrNull { it.name == value } }
                .apply {
                    add(HomeQuickAction.Today)
                    add(HomeQuickAction.Notifications)
                    add(HomeQuickAction.Scenes)
                    add(HomeQuickAction.Reservation)
                    add(HomeQuickAction.FreeClassrooms)
                    add(HomeQuickAction.SeatReservation)
                    add(HomeQuickAction.Devices)
                    add(HomeQuickAction.Diagnostics)
                    add(HomeQuickAction.Backup)
                    add(HomeQuickAction.Operations)
                    add(HomeQuickAction.GoogleAccounts)
                    remove(HomeQuickAction.CampusCenter)
                    remove(HomeQuickAction.SystemCenter)
                    remove(HomeQuickAction.DeviceCenter)
                }
        } else {
            DEFAULT_HIDDEN_HOME_QUICK_ACTIONS
        }
        if (hasSavedPreferences && !migrated) {
            preferences.edit()
                .putString(KEY_ORDER, normalizedOrder.joinToString(",", transform = HomeQuickAction::name))
                .putStringSet(KEY_HIDDEN, hidden.mapTo(mutableSetOf(), HomeQuickAction::name))
                .putBoolean(KEY_FEATURE_CENTER_MIGRATED, true)
                .apply()
        }
        return HomeQuickActionPreferences(order = normalizedOrder, hidden = hidden)
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
        const val KEY_FEATURE_CENTER_MIGRATED = "feature_center_migrated"
    }
}
