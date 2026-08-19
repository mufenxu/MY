package cn.pxyb.mycontrol.assistant

import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.data.BackupQuality
import cn.pxyb.mycontrol.data.CampusAcademicCalendar
import cn.pxyb.mycontrol.data.CampusCourse
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.IncidentInfo
import cn.pxyb.mycontrol.data.SecurityData
import cn.pxyb.mycontrol.data.TodoSnapshot
import cn.pxyb.mycontrol.data.TodoTask
import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PersonalAssistantTest {
    private val zone = ZoneId.of("Asia/Shanghai")

    @Test
    fun `critical incident outranks course and todo`() {
        val now = Instant.parse("2026-08-19T01:00:00Z").toEpochMilli()
        val snapshot = buildPersonalAssistantSnapshot(
            nowMillis = now,
            zoneId = zone,
            timetable = timetable(course("高等数学", "10:00-11:40")),
            todos = TodoSnapshot(listOf(TodoTask("todo-1", "提交实验报告", dueAt = now - 1))),
            incidents = listOf(incident("数据库连接异常", "critical")),
        )

        assertEquals("数据库连接异常", snapshot.nextAction.title)
        assertEquals(AssistantDestination.Notifications, snapshot.nextAction.destination)
        assertEquals(AssistantPriority.Critical, snapshot.nextAction.priority)
    }

    @Test
    fun `current course enables class focus until course ends`() {
        val now = Instant.parse("2026-08-19T02:30:00Z").toEpochMilli()
        val snapshot = buildPersonalAssistantSnapshot(
            nowMillis = now,
            zoneId = zone,
            timetable = timetable(course("软件工程", "10:00-11:40")),
        )

        assertEquals("软件工程进行中", snapshot.nextAction.title)
        assertEquals(Instant.parse("2026-08-19T03:40:00Z").toEpochMilli(), snapshot.classFocusUntilMillis)
    }

    @Test
    fun `patchy shared text becomes one useful todo title`() {
        assertEquals(
            "阅读 Compose 性能指南 · https://example.com/compose",
            sharedTodoTitle("阅读 Compose 性能指南", "https://example.com/compose"),
        )
        assertEquals("https://example.com", sharedTodoTitle(null, "  https://example.com  "))
    }

    @Test
    fun `class focus suppresses normal notifications but not critical alerts`() {
        val now = 1_000L
        val settings = AlertPreferences(classFocusEnabled = true)

        assertTrue(shouldSuppressNotification(settings, now, classFocusUntilMillis = 2_000L, critical = false))
        assertFalse(shouldSuppressNotification(settings, now, classFocusUntilMillis = 2_000L, critical = true))
    }

    @Test
    fun `guardian alerts cover stale backup and low recovery codes`() {
        val alerts = buildGuardianAlerts(
            nowMillis = Instant.parse("2026-08-19T01:00:00Z").toEpochMilli(),
            zoneId = zone,
            backup = BackupQuality(
                latestName = "backup-1",
                latestAt = null,
                ageHours = 30.0,
                rpoHours = 24,
                rpoState = "warning",
                validBackups = 1,
                offsiteConfigured = true,
                offsiteHealthy = true,
                canBackup = true,
                checkedAt = null,
            ),
            security = SecurityData(
                sessions = emptyList(),
                totpEnabled = true,
                passkeyCount = 1,
                recoveryCodesRemaining = 2,
                sessionTtlHours = 720,
                sessionIdleMinutes = 30,
            ),
        )

        assertEquals(listOf("guardian:backup:2026-08-19", "guardian:recovery:2"), alerts.map { it.id })
    }

    @Test
    fun `next daily brief rolls from evening to next morning`() {
        val afterEvening = Instant.parse("2026-08-19T14:30:00Z").toEpochMilli()
        val schedule = nextDailyBriefSchedule(afterEvening, zone, morningHour = 7, eveningHour = 21)

        assertEquals(DailyBriefPeriod.Morning, schedule.period)
        assertEquals(Instant.parse("2026-08-19T23:00:00Z").toEpochMilli(), schedule.triggerAtMillis)
    }

    private fun timetable(course: CampusCourse) = CampusTimetable(
        schoolCalendar = CampusAcademicCalendar(currentWeek = 1),
        courses = listOf(course),
    )

    private fun course(name: String, timeRange: String) = CampusCourse(
        id = name,
        courseCode = "",
        courseName = name,
        teacher = "",
        weekText = "第1周",
        weeks = listOf(1),
        day = 3,
        dayName = "周三",
        sectionText = "",
        startSection = 1,
        endSection = 2,
        timeRange = timeRange,
        location = "教学楼 A101",
    )

    private fun incident(title: String, severity: String) = IncidentInfo(
        id = title,
        title = title,
        description = "",
        severity = severity,
        status = "open",
        source = "platform",
        serviceId = null,
        openedAt = null,
        updatedAt = null,
    )
}
