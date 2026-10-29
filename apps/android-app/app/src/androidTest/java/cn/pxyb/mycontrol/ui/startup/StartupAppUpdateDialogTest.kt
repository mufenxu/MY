package cn.pxyb.mycontrol.ui.startup

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import cn.pxyb.mycontrol.update.AppUpdateInfo
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 更新提示的设备侧回归。
 *
 * 更新链路最怕的是「阶段与按钮错配」——例如下载中还能重复点安装、
 * 失败态没有重试入口。这类错配在编译期发现不了，只能靠界面断言锁住。
 */
@RunWith(AndroidJUnit4::class)
class StartupAppUpdateDialogTest {

    @get:Rule
    val compose = createComposeRule()

    private var downloadRequested = 0
    private var installRequested = 0
    private var retried = 0
    private var dismissed = 0

    private fun updateInfo() = AppUpdateInfo(
        packageName = "cn.pxyb.mycontrol",
        versionName = "1.4.0",
        versionCode = 140,
        tag = "v1.4.0",
        apkUrl = "https://example.com/app-release.apk",
        sha256 = "0".repeat(64),
        apkSize = 12L * 1024L * 1024L,
        releaseUrl = "https://example.com/releases",
        publishedAt = "2026-10-20T10:00:00Z",
        notes = "修复若干已知问题",
    )

    private fun showDialog(state: AppUpdateUiState) {
        compose.setContent {
            MYControlTheme(darkTheme = false) {
                StartupAppUpdateDialog(
                    state = state,
                    onDownloadAndInstall = { downloadRequested++ },
                    onInstallDownloaded = { installRequested++ },
                    onRetry = { retried++ },
                    onDismiss = { dismissed++ },
                )
            }
        }
    }

    @Test
    fun 发现新版本时展示版本号并可发起下载() {
        showDialog(AppUpdateUiState(phase = AppUpdatePhase.Available, info = updateInfo()))

        compose.onNodeWithText("发现新版本").assertExists()
        compose.onNodeWithText("v1.4.0", substring = true).assertExists()
        compose.onNodeWithText("修复若干已知问题").assertExists()

        compose.onNode(hasText("立即更新") and hasClickAction()).performClick()

        assertEquals(1, downloadRequested)
        assertEquals(0, installRequested)
    }

    @Test
    fun 下载中按钮禁用且展示百分比() {
        showDialog(
            AppUpdateUiState(
                phase = AppUpdatePhase.Downloading,
                info = updateInfo(),
                progress = 45,
            ),
        )

        // 下载态主按钮只剩进度圈、不再渲染文字，因此按标签断言禁用而不是按文案。
        compose.onNodeWithTag("update-primary").assertIsNotEnabled()
        compose.onNodeWithText("后台继续").assertExists()
        compose.onNodeWithText("正在下载 45%", substring = true).assertExists()
        assertEquals(0, downloadRequested)
        assertEquals(0, installRequested)
    }

    @Test
    fun 已下载完成时引导打开系统安装器() {
        showDialog(
            AppUpdateUiState(
                phase = AppUpdatePhase.ReadyToInstall,
                info = updateInfo(),
                downloadedApkPath = "/data/user/0/cn.pxyb.mycontrol/cache/updates/app.apk",
            ),
        )

        compose.onNode(hasText("打开安装器") and hasClickAction()).performClick()

        assertEquals(1, installRequested)
        assertEquals(0, downloadRequested)
    }

    @Test
    fun 失败态展示原因并可重新检查() {
        showDialog(
            AppUpdateUiState(
                phase = AppUpdatePhase.Error,
                info = updateInfo(),
                error = "安装包校验失败，请重新下载",
            ),
        )

        compose.onNodeWithText("安装包校验失败，请重新下载").assertExists()
        compose.onNode(hasText("重新检查") and hasClickAction()).performClick()

        assertEquals(1, retried)
    }

    @Test
    fun 稍后再说会关闭弹窗() {
        showDialog(AppUpdateUiState(phase = AppUpdatePhase.Available, info = updateInfo()))

        compose.onNode(hasText("稍后再说") and hasClickAction()).performClick()

        assertEquals(1, dismissed)
    }
}
