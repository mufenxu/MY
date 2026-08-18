package cn.pxyb.mycontrol.update

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException

class AppUpdateVerificationTest {
    @Test
    fun `downloaded APK must match the release and installed application`() {
        val file = File.createTempFile("my-control-update", ".apk").apply {
            writeText("verified apk payload")
            deleteOnExit()
        }
        val sha256 = sha256(file)
        val update = updateInfo.copy(sha256 = sha256, apkSize = file.length())
        val identity = AppPackageIdentity(
            packageName = "cn.pxyb.mycontrol",
            versionCode = 1_001_001,
            signerSha256 = setOf("release-certificate"),
        )

        assertEquals(file, verifyUpdateArtifact(update, file, identity, identity.copy(versionCode = 1_001_000)))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `downloaded APK rejects a different signing certificate`() {
        val file = File.createTempFile("my-control-update", ".apk").apply {
            writeText("verified apk payload")
            deleteOnExit()
        }
        val update = updateInfo.copy(sha256 = sha256(file), apkSize = file.length())
        val archive = AppPackageIdentity("cn.pxyb.mycontrol", 1_001_001, setOf("unexpected-certificate"))
        val installed = AppPackageIdentity("cn.pxyb.mycontrol", 1_001_000, setOf("release-certificate"))

        verifyUpdateArtifact(update, file, archive, installed)
    }

    @Test
    fun `wrapped signing mismatch is recognized`() {
        val error = IOException(
            "APK 下载失败，主下载源和备用源均不可用",
            AppUpdateSignatureMismatchException(),
        )

        assertTrue(isAppUpdateSigningMismatch(error))
    }

    private companion object {
        val updateInfo = AppUpdateInfo(
            packageName = "cn.pxyb.mycontrol",
            versionName = "1.1.1",
            versionCode = 1_001_001,
            tag = "android-v1.1.1",
            apkUrl = "https://github.com/mufenxu/MY/releases/download/android-v1.1.1/my-control-1.1.1.apk",
            sha256 = "a".repeat(64),
            apkSize = 1,
            releaseUrl = "https://github.com/mufenxu/MY/releases/tag/android-v1.1.1",
            publishedAt = "2026-08-18T11:00:00Z",
            notes = "更新",
        )
    }
}
