package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.update.AppInstallResult
import cn.pxyb.mycontrol.update.AppUpdateInfo
import cn.pxyb.mycontrol.update.AppUpdateManager
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState
import cn.pxyb.mycontrol.update.isAppUpdateSigningMismatch
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.update

class AppUpdateStateHolder(
    parentScope: CoroutineScope,
    private val manager: AppUpdateManager,
    private val onFeedback: (String) -> Unit,
) : FeatureStateHolder<AppUpdateUiState>(parentScope, AppUpdateUiState(), {}) {
    override fun clearPendingState(current: AppUpdateUiState): AppUpdateUiState = when (current.phase) {
        AppUpdatePhase.Checking -> AppUpdateUiState()
        AppUpdatePhase.Downloading -> current.copy(phase = AppUpdatePhase.Available, progress = 0)
        else -> current
    }

    fun check(silent: Boolean = false) = launchAction(
        isBusy = { phase == AppUpdatePhase.Checking || phase == AppUpdatePhase.Downloading },
        start = { AppUpdateUiState(phase = AppUpdatePhase.Checking) },
        action = { manager.fetchLatest() },
        success = { update ->
            AppUpdateUiState(
                phase = if (update.isNewerThan(BuildConfig.VERSION_CODE)) AppUpdatePhase.Available else AppUpdatePhase.Current,
                info = update,
            )
        },
        failure = { error -> AppUpdateUiState(phase = AppUpdatePhase.Error, error = error.message ?: "检查更新失败，请稍后重试") },
        afterSuccess = { if (!silent) onFeedback("版本检查完成") },
    )

    fun downloadAndInstall() {
        val update = mutableState.value.info ?: return
        downloadAndInstall(update)
    }

    fun downloadAndInstall(update: AppUpdateInfo) {
        if (mutableState.value.phase in setOf(AppUpdatePhase.Checking, AppUpdatePhase.Downloading)) return
        if (BuildConfig.DEBUG) {
            mutableState.update {
                it.copy(phase = AppUpdatePhase.Error, info = update, error = DEBUG_RELEASE_UPDATE_MESSAGE, downloadedApkPath = null)
            }
            return
        }
        launchAction(
            isBusy = { phase == AppUpdatePhase.Checking || phase == AppUpdatePhase.Downloading },
            start = { copy(phase = AppUpdatePhase.Downloading, info = update, progress = 0, error = null, downloadedApkPath = null) },
            action = {
                val requestContext = currentCoroutineContext()
                manager.download(update) { progress ->
                    requestContext.ensureActive()
                    mutableState.update { it.copy(progress = progress) }
                }
            },
            success = { file -> copy(phase = AppUpdatePhase.ReadyToInstall, progress = 100, downloadedApkPath = file.path) },
            failure = { error ->
                copy(
                    phase = AppUpdatePhase.Error,
                    error = if (isAppUpdateSigningMismatch(error)) {
                        "当前安装版本与正式更新包的签名不一致，Android 不允许直接覆盖安装。请卸载当前版本后安装正式版。"
                    } else {
                        error.message ?: "更新包下载或校验失败，请重试"
                    },
                )
            },
            afterSuccess = ::installDownloaded,
        )
    }

    fun installDownloaded() {
        val apkPath = mutableState.value.downloadedApkPath ?: return
        runCatching { manager.install(File(apkPath)) }
            .onSuccess { result ->
                mutableState.update {
                    it.copy(
                        phase = when (result) {
                            AppInstallResult.Started -> AppUpdatePhase.Installing
                            AppInstallResult.PermissionRequired -> AppUpdatePhase.InstallPermissionRequired
                        },
                    )
                }
            }
            .onFailure { error ->
                handleRequestFailure(error)
                mutableState.update { it.copy(phase = AppUpdatePhase.Error, error = error.message ?: "无法启动系统安装器") }
            }
    }

    fun openReleasesPage(url: String? = null) = manager.openReleasesPage(url)

    private companion object {
        const val DEBUG_RELEASE_UPDATE_MESSAGE =
            "当前安装的是 Debug 版本，不能直接更新为正式 Release 版本。请先卸载 Debug 版后安装正式版，或使用正式版设备测试。"
    }
}
