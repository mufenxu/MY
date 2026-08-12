package cn.pxyb.mycontrol

import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationPrivacyTest {
    @Test
    fun `lock screen public content never includes private details`() {
        val content = publicNotificationContent()

        assertEquals("MY 有新的提醒", content.title)
        assertEquals("解锁后查看详细内容", content.body)
    }
}
