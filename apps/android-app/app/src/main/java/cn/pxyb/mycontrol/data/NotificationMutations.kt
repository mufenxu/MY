package cn.pxyb.mycontrol.data

enum class NotificationMutationType { MarkRead, MarkUnread, Snooze, Archive }

data class NotificationMutation(
    val type: NotificationMutationType,
    val alertId: String,
    val snoozedUntilMillis: Long? = null,
)

fun applyNotificationMutations(
    alerts: List<AppAlertRecord>,
    mutations: List<NotificationMutation>,
): List<AppAlertRecord> = mutations.fold(alerts) { current, mutation ->
    when (mutation.type) {
        NotificationMutationType.MarkRead -> current.map {
            if (it.id == mutation.alertId) it.copy(read = true) else it
        }
        NotificationMutationType.MarkUnread -> current.map {
            if (it.id == mutation.alertId) it.copy(read = false, snoozedUntil = null) else it
        }
        NotificationMutationType.Snooze -> current.map {
            if (it.id == mutation.alertId) it.copy(snoozedUntil = mutation.snoozedUntilMillis) else it
        }
        NotificationMutationType.Archive -> current.filterNot { it.id == mutation.alertId }
    }
}
