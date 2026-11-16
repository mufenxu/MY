package cn.pxyb.mycontrol.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 课前提醒的提前量与 campus-service 共用。保存接口按整份偏好覆盖，
 * 请求体少带一个字段就会把网页端配好的服务端提醒关掉。
 */
class CourseReminderPreferenceTest {
    @Test
    fun `课程提醒接口路径与服务端一致`() {
        assertEquals("/apps/campus/api/academic/integrations", CAMPUS_ACADEMIC_INTEGRATIONS_PATH)
        assertEquals("/apps/campus/api/academic/reminder", CAMPUS_ACADEMIC_REMINDER_PATH)
    }

    @Test
    fun `解析服务端课程提醒偏好`() {
        val preference = parseCourseReminderPreference(
            JSONObject().put("enabled", true).put("recipientId", "zhangsan").put("leadMinutes", 30),
        )

        assertTrue(preference.enabled)
        assertEquals("zhangsan", preference.recipientId)
        assertEquals(30, preference.leadMinutes)
    }

    @Test
    fun `服务端没有配置时回落到默认值`() {
        val preference = parseCourseReminderPreference(null)

        assertFalse(preference.enabled)
        assertEquals("", preference.recipientId)
        assertEquals(15, preference.leadMinutes)
        assertEquals(15, parseCourseReminderPreference(JSONObject().put("leadMinutes", 7)).leadMinutes)
    }

    @Test
    fun `只改提前量时原样带回启用状态和收件人`() {
        val body = courseReminderLeadBody(CampusCourseReminderPreference(enabled = true, recipientId = "zhangsan", leadMinutes = 15), 60)

        assertTrue(body.getBoolean("enabled"))
        assertEquals("zhangsan", body.getString("recipientId"))
        assertEquals(60, body.getInt("leadMinutes"))
    }

    @Test
    fun `提前量只接受服务端支持的档位`() {
        assertEquals(listOf(5, 10, 15, 30, 60), COURSE_REMINDER_LEAD_OPTIONS)
        COURSE_REMINDER_LEAD_OPTIONS.forEach { assertEquals(it, normalizeCourseReminderMinutes(it)) }
        assertEquals(15, normalizeCourseReminderMinutes(0))
        assertEquals(15, normalizeCourseReminderMinutes(45))
        assertEquals(15, AlertPreferences().courseReminderMinutes)
    }
}
