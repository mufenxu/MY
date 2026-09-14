package cn.pxyb.mycontrol.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

class PlatformRequestPolicyTest {
    @Test
    fun deviceProofSignaturesInteroperateWithJdkP1363Verifier() {
        val keys = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        repeat(32) { index ->
            val message = "device-bound-request-$index".toByteArray(Charsets.UTF_8)
            val der = Signature.getInstance("SHA256withECDSA").run {
                initSign(keys.private)
                update(message)
                sign()
            }
            val jose = ecdsaDerToJose(der)
            assertEquals(64, jose.size)
            assertTrue(Signature.getInstance("SHA256withECDSAinP1363Format").run {
                initVerify(keys.public)
                update(message)
                verify(jose)
            })
        }
        assertTrue(runCatching { ecdsaDerToJose(byteArrayOf(0x30, 0x00)) }.isFailure)
    }

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
