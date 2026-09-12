package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.feature.notifications.toNotificationCenterUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OperationalRefreshPolicyTest {
    @Test
    fun `alerts wait until both initial datasets are loaded`() {
        assertFalse(operationalAlertsReady(incidentsLoaded = false, tasksLoaded = false))
        assertFalse(operationalAlertsReady(incidentsLoaded = true, tasksLoaded = false))
        assertFalse(operationalAlertsReady(incidentsLoaded = false, tasksLoaded = true))
        assertTrue(operationalAlertsReady(incidentsLoaded = true, tasksLoaded = true))
    }

    @Test
    fun `notification center exposes its own sync state`() {
        val state = AppUiState(
            sectionLoadStates = mapOf(
                DataSection.Notifications to SectionLoadState(
                    refreshing = true,
                    error = "通知收件箱暂时无法连接。",
                ),
            ),
        ).toNotificationCenterUiState()

        assertTrue(state.refreshing)
        assertEquals("通知收件箱暂时无法连接。", state.syncError)
    }
}
