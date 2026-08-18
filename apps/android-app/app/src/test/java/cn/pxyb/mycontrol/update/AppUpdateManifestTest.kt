package cn.pxyb.mycontrol.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdateManifestTest {
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
