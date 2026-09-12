package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.Authenticator
import cn.pxyb.mycontrol.data.AuthenticatorParseException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class AuthenticatorTest {
    private val rfcSecret = "12345678901234567890".toByteArray()
    private val rfcSecretBase32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"

    @Test
    fun parsesStandardOtpAuthUri() {
        val entry = Authenticator.parseOtpAuthUri(
            "otpauth://totp/Example:alice%40example.com?secret=$rfcSecretBase32&issuer=Example&algorithm=SHA1&digits=6&period=30",
        )

        assertEquals("Example", entry.issuer)
        assertEquals("alice@example.com", entry.account)
        assertEquals(Authenticator.ALGORITHM_SHA1, entry.algorithm)
        assertEquals(6, entry.digits)
        assertEquals(30, entry.periodSeconds)
        assert(entry.secret.contentEquals(rfcSecret))
    }

    @Test
    fun generatesRfc6238Sha1Vectors() {
        val entry = Authenticator.createEntry(
            issuer = "RFC",
            account = "6238",
            secret = rfcSecret,
            digits = 8,
        )

        assertEquals("94287082", Authenticator.generate(entry, 59_000))
        assertEquals("07081804", Authenticator.generate(entry, 1_111_111_109_000))
        assertEquals("14050471", Authenticator.generate(entry, 1_111_111_111_000))
        assertEquals("89005924", Authenticator.generate(entry, 1_234_567_890_000))
        assertEquals("69279037", Authenticator.generate(entry, 2_000_000_005_000))
        assertEquals("65353130", Authenticator.generate(entry, 20_000_000_000_000))
    }

    @Test
    fun calculatesRemainingSeconds() {
        val entry = Authenticator.createEntry(
            issuer = "RFC",
            account = "6238",
            secret = rfcSecret,
        )

        assertEquals(1, Authenticator.remainingSeconds(entry, 59_000))
        assertEquals(30, Authenticator.remainingSeconds(entry, 60_000))
    }

    @Test
    fun handlesShortSecretsAndUnsupportedUris() {
        assertThrows(AuthenticatorParseException::class.java) {
            Authenticator.parseOtpAuthUri("otpauth://hotp/alice?secret=$rfcSecretBase32")
        }
        val shortSecretEntry = Authenticator.parseOtpAuthUri("otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP")
        assertEquals("alice", shortSecretEntry.account)
        assertEquals(10, shortSecretEntry.secret.size)
        assertThrows(AuthenticatorParseException::class.java) {
            Authenticator.decodeBase32("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJ1")
        }
    }
}
