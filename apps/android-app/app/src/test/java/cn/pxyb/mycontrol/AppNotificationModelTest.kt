package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.AppNotificationBlock
import cn.pxyb.mycontrol.data.mergeHydratedAlerts
import cn.pxyb.mycontrol.data.mergeRemoteAlerts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AppNotificationModelTest {
    @Test
    fun `remote sync replaces remote records but preserves local reminders`() {
        val local = listOf(
            AppAlertRecord("todo:1", "todo", "1", "待办提醒", "本地提醒", 10L),
            AppAlertRecord("remote:old", "system", "", "旧通知", "旧内容", 9L, origin = "remote"),
        )
        val remote = listOf(
            AppAlertRecord(
                id = "remote:new",
                type = "system",
                sourceId = "",
                title = "新通知",
                body = "服务器内容",
                createdAt = 20L,
                origin = "remote",
                contentKind = "card",
                contentBlocks = listOf(AppNotificationBlock(type = "text", text = "详细内容")),
                actions = listOf(AppNotificationAction("open", "打开", "mycontrol://open?destination=notifications")),
            ),
        )

        val merged = mergeRemoteAlerts(local, remote)

        assertEquals(listOf("remote:new", "todo:1"), merged.map(AppAlertRecord::id))
        assertEquals("详细内容", merged.first().contentBlocks.first().text)
        assertEquals("open", merged.first().actions.first().id)
        assertTrue(merged.none { it.id == "remote:old" })
    }

    @Test
    fun `remote sync preserves optimistic read and snooze state`() {
        val snoozedUntil = 99_000L
        val local = AppAlertRecord(
            id = "remote:1",
            type = "system",
            sourceId = "",
            title = "通知",
            body = "本地状态",
            createdAt = 10L,
            read = true,
            snoozedUntil = snoozedUntil,
            origin = "remote",
        )
        val server = local.copy(read = false, snoozedUntil = null, body = "服务端内容")

        val merged = mergeRemoteAlerts(listOf(local), listOf(server)).single()

        assertTrue(merged.read)
        assertEquals(snoozedUntil, merged.snoozedUntil)
        assertEquals("服务端内容", merged.body)
    }
    @Test
    fun `late local hydration cannot replace newer remote notifications`() {
        val stored = listOf(
            AppAlertRecord("todo:1", "todo", "1", "Local reminder", "Todo", 10L),
            AppAlertRecord("remote:old", "system", "", "Old", "Old", 9L, origin = "remote"),
        )
        val current = listOf(
            AppAlertRecord("remote:new", "system", "", "New", "New", 20L, origin = "remote"),
        )

        val hydrated = mergeHydratedAlerts(stored, current)

        assertEquals(listOf("remote:new", "todo:1"), hydrated.map(AppAlertRecord::id))
    }
}
