package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import org.junit.Assert.assertEquals
import org.junit.Test

class AndroidReleaseStateHolderTest {
    @Test
    fun `download mode keeps upgrades installable and archives older packages`() {
        val record = releaseRecord(versionCode = 1_002_000, installable = true)

        assertEquals(AndroidReleaseDownloadMode.Install, androidReleaseDownloadMode(record, installedVersionCode = 1_001_000))
        assertEquals(AndroidReleaseDownloadMode.Archive, androidReleaseDownloadMode(record, installedVersionCode = 1_002_000))
        assertEquals(
            AndroidReleaseDownloadMode.Disabled,
            androidReleaseDownloadMode(record.copy(installable = false), installedVersionCode = 1_001_000),
        )
    }

    private fun releaseRecord(versionCode: Int, installable: Boolean) = AndroidReleaseRecord(
        id = "release",
        versionName = "1.2.0",
        versionCode = versionCode,
        tag = "android-v1.2.0",
        apkUrl = "https://7n.pxyb.cn/android/my-control-1.2.0.apk",
        fallbackApkUrl = null,
        sha256 = "a".repeat(64),
        apkSize = 1,
        releaseUrl = null,
        publishedAt = null,
        notes = "更新",
        installable = installable,
    )
}
