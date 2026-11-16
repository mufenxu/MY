package cn.pxyb.mycontrol.ui.feature.todos

import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.todoReminderBody
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 锁定待办「截止与提醒」的换算：这些字段会同步到服务端并驱动企业微信提醒，
 * 算错不会报错，只会让提醒早到、晚到，或者把已经提醒过的待办再提醒一遍。
 */
class TodoScheduleTest {
    private val zone = ZoneId.of("Asia/Shanghai")
    private val due = Instant.parse("2026-11-18T12:00:00Z").toEpochMilli()
    private val hour = 60 * 60_000L

    @Test
    fun `新待办默认提前一小时提醒`() {
        assertEquals(60, todoReminderLeadMinutes(null))
        assertEquals(TodoSchedule(due, due - hour, "pending", null), resolveTodoSchedule(null, due, 60))
    }

    @Test
    fun `没有截止时间就没有提醒`() {
        assertEquals(TodoSchedule(null, null, "pending", null), resolveTodoSchedule(null, null, 60))
    }

    @Test
    fun `提前量从已有的截止与提醒时间反推`() {
        assertEquals(30, todoReminderLeadMinutes(TodoTask("t", "截图待办", dueAt = due, reminderAt = due - 30 * 60_000L)))
        // 小程序里单独设的提醒时间不在固定档位里，也要能选回去。
        val custom = todoReminderLeadMinutes(TodoTask("t", "小程序待办", dueAt = due, reminderAt = due - 3 * hour))
        assertEquals(180, custom)
        assertEquals(listOf(null, 0, 10, 30, 60, 180, 1440), todoReminderLeadChoices(custom))
    }

    @Test
    fun `只有截止时间的待办由服务端准点提醒`() {
        assertEquals(0, todoReminderLeadMinutes(TodoTask("t", "网页待办", dueAt = due)))
    }

    @Test
    fun `已关闭提醒的待办显示为不提醒`() {
        val task = TodoTask("t", "已关闭", dueAt = due, reminderAt = due - hour, reminderStatus = "dismissed")
        assertNull(todoReminderLeadMinutes(task))
    }

    @Test
    fun `截止和提前量都没动时保留已提醒状态`() {
        val task = TodoTask("t", "已提醒", dueAt = due + 12_345, reminderAt = due - hour, reminderStatus = "sent", remindedAt = due - hour)

        // 选择器只到分钟，秒数不同不算改动，原始时间戳原样带回。
        val schedule = resolveTodoSchedule(task, due, todoReminderLeadMinutes(task))

        assertEquals(TodoSchedule(task.dueAt, task.reminderAt, "sent", task.remindedAt), schedule)
    }

    @Test
    fun `改了截止时间按原提前量重新排提醒`() {
        val task = TodoTask("t", "改期", dueAt = due, reminderAt = due - 30 * 60_000L, reminderStatus = "sent", remindedAt = due - 30 * 60_000L)
        val nextDue = due + 24 * hour

        assertEquals(TodoSchedule(nextDue, nextDue - 30 * 60_000L, "pending", null), resolveTodoSchedule(task, nextDue, 30))
    }

    @Test
    fun `只改提前量也会重新排提醒`() {
        val task = TodoTask("t", "改提前量", dueAt = due, reminderAt = due - hour, reminderStatus = "sent", remindedAt = due - hour)

        assertEquals(TodoSchedule(due, due - 24 * hour, "pending", null), resolveTodoSchedule(task, due, 1440))
        assertEquals(TodoSchedule(due, due, "pending", null), resolveTodoSchedule(task, due, 0))
    }

    @Test
    fun `不提醒要靠状态关掉而不是只清空提醒时间`() {
        val task = TodoTask("t", "只看截止", dueAt = due, reminderAt = due - hour)

        // 提醒时间为空时服务端会退回到截止时间提醒，必须同时置为 dismissed。
        assertEquals(TodoSchedule(due, null, "dismissed", null), resolveTodoSchedule(task, due, null))
    }

    @Test
    fun `重新选择提前量可以恢复已关闭的提醒`() {
        val task = TodoTask("t", "恢复提醒", dueAt = due, reminderStatus = "dismissed")

        assertEquals(TodoSchedule(due, due - hour, "pending", null), resolveTodoSchedule(task, due, 60))
    }

    @Test
    fun `清掉截止时间时提醒一并清空`() {
        val task = TodoTask("t", "不限期", dueAt = due, reminderAt = due - hour, reminderStatus = "sent", remindedAt = due - hour)

        assertEquals(TodoSchedule(null, null, "pending", null), resolveTodoSchedule(task, null, 60))
    }

    @Test
    fun `没有截止时间的待办保留在别处单独设的提醒`() {
        val task = TodoTask("t", "小程序单独提醒", reminderAt = due)

        assertEquals(TodoSchedule(null, due, "pending", null), resolveTodoSchedule(task, null, todoReminderLeadMinutes(task)))
    }

    @Test
    fun `截止时间按本地时区换算`() {
        assertEquals(due, todoDueAtMillis("2026-11-18", "20:00", zone))
        assertNull(todoDueAtMillis(null, "20:00", zone))
        assertNull(todoDueAtMillis("不是日期", "20:00", zone))
        // 时间解析失败时退回默认时刻，不能把截止日期整个丢掉。
        assertEquals(due, todoDueAtMillis("2026-11-18", "", zone))
    }

    @Test
    fun `提前量文案覆盖各档位`() {
        assertEquals("不提醒", todoReminderLeadLabel(null))
        assertEquals("准时", todoReminderLeadLabel(0))
        assertEquals("提前 10 分钟", todoReminderLeadLabel(10))
        assertEquals("提前 1 小时", todoReminderLeadLabel(60))
        assertEquals("提前 1 小时 30 分钟", todoReminderLeadLabel(90))
        assertEquals("提前 1 天", todoReminderLeadLabel(1440))
    }

    @Test
    fun `提醒正文写出截止时间`() {
        assertEquals("截止时间 11月18日 20:00，打开今日工作台处理。", todoReminderBody(due, zone))
        assertEquals("打开今日工作台处理。", todoReminderBody(null, zone))
    }
}
