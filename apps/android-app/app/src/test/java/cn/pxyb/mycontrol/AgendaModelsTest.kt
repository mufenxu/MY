package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.feature.agenda.agendaInstant
import cn.pxyb.mycontrol.ui.feature.agenda.agendaMinute
import cn.pxyb.mycontrol.ui.feature.agenda.buildAgenda
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 锁定「待办进入当日日程」的边界：这是工作台首屏与待办提醒共用的口径，
 * 改错不会崩溃，只会让用户漏掉一条截止当天的任务。
 */
class AgendaModelsTest {

    private val date: LocalDate = LocalDate.of(2026, 11, 2)
    private val startOfDay = agendaInstant(date, 0)
    private val endOfDay = agendaInstant(date.plusDays(1), 0)

    private fun agendaOf(vararg todos: TodoTask) = buildAgenda(
        date = date,
        timetable = null,
        todos = todos.toList(),
        rooms = emptyList(),
        seats = emptyList(),
    )

    @Test
    fun `当天到期的未完成待办进入日程`() {
        val dueAt = agendaInstant(date, 9 * 60 + 30)
        val items = agendaOf(TodoTask(id = "t1", title = "交作业", dueAt = dueAt))

        assertEquals(1, items.size)
        assertEquals("todo:t1", items.single().id)
        assertEquals("交作业", items.single().title)
        assertEquals("待办截止", items.single().kind)
        assertEquals(dueAt, items.single().start)
        assertEquals(dueAt, items.single().end)
        // 待办只标注时间点，不占用课表的时间块。
        assertFalse(items.single().blocksTime)
    }

    @Test
    fun `没有截止时间的待办被忽略且不抛异常`() {
        val items = agendaOf(TodoTask(id = "t1", title = "随手记", dueAt = null))

        assertTrue(items.isEmpty())
    }

    @Test
    fun `已完成待办不再显示`() {
        val items = agendaOf(
            TodoTask(id = "t1", title = "已交作业", completed = true, dueAt = agendaInstant(date, 600)),
        )

        assertTrue(items.isEmpty())
    }

    @Test
    fun `当天零点与当天最后一分钟都算当天`() {
        val items = agendaOf(
            TodoTask(id = "early", title = "零点", dueAt = startOfDay),
            TodoTask(id = "late", title = "二十三点五十九", dueAt = agendaInstant(date, 23 * 60 + 59)),
        )

        assertEquals(listOf("todo:early", "todo:late"), items.map { it.id })
    }

    @Test
    fun `次日零点不属于当天`() {
        val items = agendaOf(TodoTask(id = "next", title = "跨天", dueAt = endOfDay))

        assertTrue(items.isEmpty())
    }

    @Test
    fun `分钟解析支持 24 点并拒绝越界值`() {
        assertEquals(1440, agendaMinute("24:00"))
        assertEquals(0, agendaMinute("00:00"))
        assertEquals(14 * 60 + 5, agendaMinute("第 14:05 节"))
        assertNull(agendaMinute("25:00"))
    }
}
