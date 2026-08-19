package cn.pxyb.mycontrol.data

import org.junit.Assert.assertEquals
import org.junit.Test

class AppPreferencesTest {
    @Test
    fun restoresKnownThemePreference() {
        assertEquals(AppThemePreference.Dark, restoredThemePreference("Dark"))
    }

    @Test
    fun unknownThemePreferenceFallsBackToSystem() {
        assertEquals(AppThemePreference.System, restoredThemePreference("unknown"))
        assertEquals(AppThemePreference.System, restoredThemePreference(null))
    }
}
