package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.NotificationMutation
import cn.pxyb.mycontrol.data.NotificationMutationType
import cn.pxyb.mycontrol.data.applyNotificationMutations
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationActionPolicyTest {
    @Test
    fun `queued actions update local notification state before remote sync`() {
        val alerts = listOf(
            AppAlertRecord("remote-1", "system", "", "通知一", "内容", 1L, origin = "remote"),
            AppAlertRecord("remote-2", "system", "", "通知二", "内容", 2L, origin = "remote"),
        )
        val result = applyNotificationMutations(
            alerts,
            listOf(
                NotificationMutation(NotificationMutationType.MarkRead, "remote-1"),
                NotificationMutation(NotificationMutationType.Archive, "remote-2"),
            ),
        )

        assertEquals(listOf("remote-1"), result.map { it.id })
        assertTrue(result.single().read)
    }
}
