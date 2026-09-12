package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.ui.feature.notifications.notificationItemKey
import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationListPolicyTest {
    @Test
    fun `notification item key is stable when read state changes`() {
        val alert = AppAlertRecord("alert-1", "task", "task-1", "待处理", "详情", 1L)

        assertEquals(notificationItemKey(alert), notificationItemKey(alert.copy(read = true)))
        assertEquals("alert-1", notificationItemKey(alert))
    }
}
