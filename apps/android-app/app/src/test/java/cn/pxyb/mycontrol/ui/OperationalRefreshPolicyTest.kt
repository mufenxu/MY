package cn.pxyb.mycontrol.ui

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
}
