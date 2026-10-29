package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.PlatformUser
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppViewModelPolicyTest {
    private val user = PlatformUser(username = "student", role = "viewer", totpEnabled = false, passkeyCount = 0)

    @Test
    fun unauthenticatedSessionCannotRunRequests() {
        assertFalse(AppUiState().canRunRequest())
    }

    @Test
    fun authenticatedUnlockedSessionCanRunRequests() {
        assertTrue(AppUiState(user = user).canRunRequest())
    }

    @Test
    fun lockedSessionCannotRunRequests() {
        assertFalse(AppUiState(user = user, locked = true).canRunRequest())
    }

    @Test
    fun logoutInFlightBlocksNewRequests() {
        assertFalse(AppUiState(user = user, busyAction = "logout").canRunRequest())
    }

    @Test
    fun unrelatedBusyActionDoesNotBlockRequests() {
        assertTrue(AppUiState(user = user, busyAction = "refresh-overview").canRunRequest())
    }

    @Test
    fun operationalAlertsRequireBothSourcesLoaded() {
        assertFalse(operationalAlertsReady(incidentsLoaded = true, tasksLoaded = false))
        assertFalse(operationalAlertsReady(incidentsLoaded = false, tasksLoaded = true))
        assertTrue(operationalAlertsReady(incidentsLoaded = true, tasksLoaded = true))
    }
}
