package cn.pxyb.mycontrol.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlatformRequestPolicyTest {
    @Test
    fun campusTimetableUsesManagedPlatformSsoPath() {
        assertEquals("/apps/campus/api/academic/timetable", CAMPUS_TIMETABLE_PATH)
    }

    @Test
    fun upstreamUnauthorizedDoesNotInvalidatePlatformSession() {
        assertFalse(shouldInvalidatePlatformSession(401, "HTTP_ERROR"))
        assertFalse(shouldInvalidatePlatformSession(401, "PLATFORM_SSO_ACCOUNT_NOT_MAPPED"))
    }

    @Test
    fun platformSessionFailuresInvalidatePlatformSession() {
        assertTrue(shouldInvalidatePlatformSession(401, "UNAUTHORIZED"))
        assertTrue(shouldInvalidatePlatformSession(401, "PLATFORM_SESSION_REQUIRED"))
        assertTrue(shouldInvalidatePlatformSession(401, "ACCOUNT_DISABLED"))
    }
}
