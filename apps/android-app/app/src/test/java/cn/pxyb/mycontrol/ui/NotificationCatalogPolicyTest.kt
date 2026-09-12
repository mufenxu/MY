package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.NotificationKind
import cn.pxyb.mycontrol.data.NotificationMutation
import cn.pxyb.mycontrol.data.NotificationMutationType.MarkRead
import cn.pxyb.mycontrol.data.NotificationMutationType.MarkUnread
import cn.pxyb.mycontrol.data.NotificationMutationType.Snooze
import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.applyNotificationMutations
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.kind
import cn.pxyb.mycontrol.data.notificationKindOf
import cn.pxyb.mycontrol.ui.feature.notifications.notificationDaySections
import cn.pxyb.mycontrol.ui.feature.notifications.snoozeOptions
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationCatalogPolicyTest {
    private fun alert(
        id: String,
        type: String,
        createdAt: Long,
        read: Boolean = false,
        snoozedUntil: Long? = null,
        priority: String = "normal",
    ) = AppAlertRecord(
        id = id,
        type = type,
        sourceId = "",
        title = id,
        body = "",
        createdAt = createdAt,
        read = read,
        snoozedUntil = snoozedUntil,
        priority = priority,
    )

    @Test
    fun `remote namespaces and local short types share one category`() {
        assertEquals(NotificationKind.Task, notificationKindOf("todo.reminder"))
        assertEquals(NotificationKind.Task, notificationKindOf("todo"))
        assertEquals(NotificationKind.Schedule, notificationKindOf("resource.expiry"))
        assertEquals(NotificationKind.Schedule, notificationKindOf("campus.course.reminder"))
        assertEquals(NotificationKind.Schedule, notificationKindOf("course"))
        assertEquals(NotificationKind.Schedule, notificationKindOf("resource"))
        assertEquals(NotificationKind.Alert, notificationKindOf("incident"))
        assertEquals(NotificationKind.Task, notificationKindOf("backup"))
        assertEquals(NotificationKind.Task, notificationKindOf("build"))
        assertEquals(NotificationKind.Device, notificationKindOf("iot.sensor"))
        assertEquals(NotificationKind.Security, notificationKindOf("security.login"))
        assertEquals(NotificationKind.System, notificationKindOf("system.test"))
        assertEquals(NotificationKind.System, notificationKindOf("feature"))
        assertEquals(NotificationKind.System, notificationKindOf(""))
    }

    @Test
    fun `snoozed alerts stay out of the unread badge`() {
        val now = 1_000_000L
        val alerts = listOf(
            alert("unread", "todo.reminder", now - 10),
            alert("read", "todo.reminder", now - 20, read = true),
            alert("snoozed", "todo.reminder", now - 30, snoozedUntil = now + 60_000),
            alert("expired-snooze", "todo.reminder", now - 40, snoozedUntil = now - 1),
        )

        assertEquals(2, alerts.activeUnreadCount(now))
        assertTrue(alerts[2].isSnoozedAt(now))
        assertFalse(alerts[3].isSnoozedAt(now))
    }

    @Test
    fun `snooze keeps read state while mark unread clears it`() {
        val original = listOf(alert("a", "todo.reminder", 1L, read = true))
        val snoozed = applyNotificationMutations(
            original,
            listOf(NotificationMutation(Snooze, "a", snoozedUntilMillis = 5_000L)),
        )
        assertTrue(snoozed.single().read)
        assertEquals(5_000L, snoozed.single().snoozedUntil)

        val restored = applyNotificationMutations(
            snoozed,
            listOf(NotificationMutation(MarkUnread, "a")),
        )
        assertFalse(restored.single().read)
        assertEquals(null, restored.single().snoozedUntil)

        val readBack = applyNotificationMutations(restored, listOf(NotificationMutation(MarkRead, "a")))
        assertTrue(readBack.single().read)
    }

    @Test
    fun `day sections group by local date newest first`() {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val yesterday = today.minusDays(1)
        val now = today.atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
        fun at(date: LocalDate, hour: Int) = date.atTime(hour, 0).atZone(zone).toInstant().toEpochMilli()

        val sections = notificationDaySections(
            listOf(
                alert("old", "todo.reminder", at(yesterday, 9)),
                alert("new", "todo.reminder", at(today, 11)),
                alert("mid", "todo.reminder", at(today, 8)),
            ),
            now,
        )

        assertEquals(listOf(today.toString(), yesterday.toString()), sections.map { it.key })
        assertEquals(listOf("new", "mid"), sections.first().alerts.map(AppAlertRecord::id))
        assertEquals("今天", sections.first().label)
        assertEquals("昨天", sections.last().label)
    }

    @Test
    fun `snooze presets offer graded delays`() {
        val now = 1_000_000L
        val options = snoozeOptions(now)

        assertEquals(4, options.size)
        assertEquals(listOf(30 * 60_000L, 60 * 60_000L, 3 * 60 * 60_000L), options.take(3).map { it.second })
        assertTrue(options.last().second > options[2].second)
    }

    @Test
    fun `alert kind resolves from record type`() {
        assertEquals(NotificationKind.Schedule, alert("a", "campus.course.reminder", 1L).kind())
    }
}
