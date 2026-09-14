package cn.pxyb.mycontrol.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.json.JSONObject
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.time.Instant
import java.util.Base64

class AppUpdateManifestTest {
    @Test
    fun `signed metadata rejects tampering wrong signers expiry and rollback`() {
        val keys = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val other = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        val payload = JSONObject(validManifest).put("manifestVersion", 1).put("expiresAt", "2026-09-18T11:00:00Z").toString()
        val signature = Signature.getInstance("SHA256withECDSA").run {
            initSign(keys.private)
            update("MY-ANDROID-UPDATE-V1\n".toByteArray(Charsets.US_ASCII))
            update(payload.toByteArray(Charsets.UTF_8))
            sign()
        }
        val envelope = JSONObject().put("signatureAlgorithm", "SHA256withECDSA")
            .put("signedPayload", Base64.getUrlEncoder().withoutPadding().encodeToString(payload.toByteArray(Charsets.UTF_8)))
            .put("signature", Base64.getUrlEncoder().withoutPadding().encodeToString(signature))
            .put("sha256", "untrusted outer metadata")
        val now = Instant.parse("2026-08-19T11:00:00Z").toEpochMilli()
        assertEquals("b".repeat(64), verifySignedAppUpdateManifest(envelope.toString(), listOf(keys.public), 1_001_000, now).sha256)
        assertTrue(runCatching { verifySignedAppUpdateManifest(envelope.toString(), listOf(other.public), 0, now) }.isFailure)
        assertTrue(runCatching { verifySignedAppUpdateManifest(envelope.toString(), listOf(keys.public), 1_002_000, now) }.isFailure)
        assertTrue(runCatching { verifySignedAppUpdateManifest(envelope.toString(), listOf(keys.public), 0, now + 90L * 24 * 3600 * 1000) }.isFailure)
        assertTrue(runCatching { verifySignedAppUpdateManifest(validManifest, listOf(keys.public), 0, now) }.isFailure)
        envelope.put("signedPayload", Base64.getUrlEncoder().withoutPadding().encodeToString(payload.replace("更新", "篡改").toByteArray(Charsets.UTF_8)))
        assertTrue(runCatching { verifySignedAppUpdateManifest(envelope.toString(), listOf(keys.public), 0, now) }.isFailure)
    }

    @Test
    fun `semantic versions keep multi digit patch values`() {
        assertTrue(AppVersion.parse("1.1.10") > AppVersion.parse("1.1.9"))
        assertEquals(1_001_010, AppVersion.parse("1.1.10").versionCode)
    }

    @Test
    fun `release manifest keeps verified update metadata`() {
        val update = parseAppUpdateManifest(
            """
            {
              "packageName": "cn.pxyb.mycontrol",
              "versionName": "1.2.0",
              "versionCode": 1002000,
              "tag": "android-v1.2.0",
              "apkUrl": "https://github.com/mufenxu/MY/releases/download/android-v1.2.0/my-control-1.2.0.apk",
              "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              "apkSize": 27171336,
              "releaseUrl": "https://github.com/mufenxu/MY/releases/tag/android-v1.2.0",
              "publishedAt": "2026-08-18T11:00:00Z",
              "notes": "修复首页并优化更新体验"
            }
            """.trimIndent(),
        )

        assertEquals("1.2.0", update.versionName)
        assertEquals(1_002_000, update.versionCode)
        assertEquals(27_171_336L, update.apkSize)
        assertEquals("修复首页并优化更新体验", update.notes)
        assertTrue(update.isNewerThan(1_001_010))
        assertFalse(update.isNewerThan(1_002_000))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `release manifest rejects a different package`() {
        parseAppUpdateManifest(
            validManifest.replace("cn.pxyb.mycontrol", "com.example.other"),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun `release manifest rejects non https downloads`() {
        parseAppUpdateManifest(
            validManifest.replace("https://github.com", "http://github.com"),
        )
    }

    private companion object {
        val validManifest =
            """
            {
              "packageName": "cn.pxyb.mycontrol",
              "versionName": "1.1.1",
              "versionCode": 1001001,
              "tag": "android-v1.1.1",
              "apkUrl": "https://github.com/mufenxu/MY/releases/download/android-v1.1.1/my-control-1.1.1.apk",
              "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              "apkSize": 1024,
              "releaseUrl": "https://github.com/mufenxu/MY/releases/tag/android-v1.1.1",
              "publishedAt": "2026-08-18T11:00:00Z",
              "notes": "更新"
            }
            """.trimIndent()
    }
}
