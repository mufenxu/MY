package cn.pxyb.mycontrol.ui.feature.assistant

import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TodoTask
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataUiState
import java.time.LocalDate
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 助手上下文是「助手知不知道自己该知道什么」的唯一来源，字段漏了就是一次答非所问。
 * 这里锁住四件事：空状态不乱塞字段、课表/待办/事件按约定格式拼串、未读口径与角标一致、
 * 备份健康度必须带上。
 */
class AssistantChatContextTest {
    private val today = LocalDate.of(2026, 11, 2)
    private val nowMillis = 1_761_000_000_000L

    @Test
    fun `empty state only carries the envelope`() {
        val context = buildAssistantChatContext(AppUiState(), CampusDataUiState(), today, nowMillis)

        assertEquals("2026-11-02", context.getString("date"))
        assertEquals(nowMillis, context.getLong("generatedAt"))
        assertEquals(0, context.getInt("unreadAlertCount"))
        assertFalse(context.has("pendingTodos"))
        assertFalse(context.has("timetable"))
        assertFalse(context.has("incidents"))
        assertFalse(context.has("backupRpoState"))
    }

    @Test
    fun `timetable and incident summaries keep the agreed formatting`() {
        val state = AppUiState(
            incidents = listOf(
                incident("数据库连接异常", "critical"),
                incident("证书 30 天后到期", "warning"),
                incident("已恢复的旧问题", "critical", status = "resolved"),
            ),
        )
        val campus = CampusDataUiState(
            timetable = CampusTimetable(
                courses = listOf(
                    course("高等数学", "10:00-11:40", dayName = "周一", location = "教三 201"),
                    course("大学物理", "14:00-15:40", dayName = "周一", location = "教一 105"),
                ),
            ),
        )

        val context = buildAssistantChatContext(state, campus, today, nowMillis)

        assertEquals(
            "周一 10:00-11:40 高等数学 @ 教三 201；周一 14:00-15:40 大学物理 @ 教一 105",
            context.getString("timetable"),
        )
        // 已解决的问题不该进上下文，否则助手会把历史问题当成当前故障。
        assertEquals("critical 数据库连接异常；warning 证书 30 天后到期", context.getString("incidents"))
    }

    @Test
    fun `unread count skips read and snoozed alerts but the list keeps unread ones`() {
        val state = AppUiState(
            alerts = listOf(
                alert("备份延迟", read = false),
                alert("磁盘接近上限", read = false),
                alert("已读提醒", read = true),
                alert("稍后提醒", read = false, snoozedUntil = nowMillis + 3_600_000L),
            ),
        )

        val context = buildAssistantChatContext(state, CampusDataUiState(), today, nowMillis)

        assertEquals(2, context.getInt("unreadAlertCount"))
        assertEquals("备份延迟；磁盘接近上限", context.getString("recentAlerts"))
    }

    @Test
    fun `pending todo count covers every task while the detail list is capped`() {
        val tasks = (1..10).map { TodoTask("todo-$it", "待办 $it") } + TodoTask("todo-done", "已完成", completed = true)
        val state = AppUiState(todoSnapshot = TodoSnapshot(tasks))

        val context = buildAssistantChatContext(state, CampusDataUiState(), today, nowMillis)

        // 计数要覆盖全部未完成项，明细只带 8 条，避免把 prompt 撑爆。
        assertEquals(10, context.getInt("pendingTodoCount"))
        val detail = context.getString("pendingTodos")
        assertEquals(8, detail.split("；").size)
        assertTrue(detail.startsWith("待办 1；待办 2"))
        assertFalse(detail.contains("已完成"))
    }

    @Test
    fun `backup health and expiring resources are always reported`() {
        val state = AppUiState(
            backup = BackupQuality(
                latestName = "db-20261102.sql.gz",
                latestAt = null,
                ageHours = 3.5,
                rpoHours = 24,
                rpoState = "healthy",
                validBackups = 7,
                offsiteConfigured = true,
                offsiteHealthy = true,
                canBackup = true,
                checkedAt = null,
            ),
        )
        val campus = CampusDataUiState(
            resourceExpiries = listOf(
                ResourceExpiry(id = "r1", type = "云服务", name = "云主机", expiresAt = "2026-11-30", advanceNoticeDays = 7),
            ),
        )

        val context = buildAssistantChatContext(state, campus, today, nowMillis)

        assertEquals("3.5", context.getString("backupAgeHours"))
        assertEquals("healthy", context.getString("backupRpoState"))
        assertEquals(7, context.getInt("backupValidCount"))
        assertEquals("云服务 云主机 于 2026-11-30 到期", context.getString("resourceExpiries"))
    }

    @Test
    fun `missing backup age is reported as unknown instead of an empty string`() {
        val state = AppUiState(
            backup = BackupQuality(
                latestName = null,
                latestAt = null,
                ageHours = null,
                rpoHours = 24,
                rpoState = "unknown",
                validBackups = 0,
                offsiteConfigured = false,
                offsiteHealthy = null,
                canBackup = false,
                checkedAt = null,
            ),
        )

        val context: JSONObject = buildAssistantChatContext(state, CampusDataUiState(), today, nowMillis)

        assertEquals("未知", context.getString("backupAgeHours"))
    }

    private fun course(name: String, timeRange: String, dayName: String, location: String) = CampusCourse(
        id = name,
        courseCode = name,
        courseName = name,
        teacher = "老师",
        weekText = "1-16",
        weeks = (1..16).toList(),
        day = 1,
        dayName = dayName,
        sectionText = "1-2",
        startSection = 1,
        endSection = 2,
        timeRange = timeRange,
        location = location,
    )

    private fun incident(title: String, severity: String, status: String = "open") = IncidentInfo(
        id = title,
        title = title,
        description = "",
        severity = severity,
        status = status,
        source = "test",
        serviceId = null,
        openedAt = null,
        updatedAt = null,
    )

    private fun alert(title: String, read: Boolean, snoozedUntil: Long? = null) = AppAlertRecord(
        id = title,
        type = "backup",
        sourceId = title,
        title = title,
        body = "",
        createdAt = 0L,
        read = read,
        snoozedUntil = snoozedUntil,
    )
}
