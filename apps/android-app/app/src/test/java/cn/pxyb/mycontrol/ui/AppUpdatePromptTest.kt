package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.feature.updates.shouldShowStartupUpdatePrompt
import cn.pxyb.mycontrol.update.AppUpdatePhase
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdatePromptTest {
    @Test
    fun `startup prompt shows once when an update is available after authentication`() {
        assertTrue(shouldShowStartupUpdatePrompt(AppUpdatePhase.Available, isAuthenticated = true, hasPrompted = false))
        assertFalse(shouldShowStartupUpdatePrompt(AppUpdatePhase.Available, isAuthenticated = true, hasPrompted = true))
        assertFalse(shouldShowStartupUpdatePrompt(AppUpdatePhase.Available, isAuthenticated = false, hasPrompted = false))
    }

    @Test
    fun `startup prompt does not interrupt checking downloading or installing`() {
        listOf(
            AppUpdatePhase.Idle,
            AppUpdatePhase.Checking,
            AppUpdatePhase.Current,
            AppUpdatePhase.Downloading,
            AppUpdatePhase.ReadyToInstall,
            AppUpdatePhase.InstallPermissionRequired,
            AppUpdatePhase.Installing,
            AppUpdatePhase.Error,
        ).forEach { phase ->
            assertFalse(shouldShowStartupUpdatePrompt(phase, isAuthenticated = true, hasPrompted = false))
        }
    }
}
