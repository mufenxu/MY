package cn.pxyb.mycontrol.ui.feature.releases

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AndroidReleaseCatalog
import cn.pxyb.mycontrol.data.AndroidReleaseDraft
import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.ui.feature.updates.AppUpdateStateHolder
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import cn.pxyb.mycontrol.update.AppUpdateManager
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.isAppUpdateSigningMismatch
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AndroidReleaseDownloadMode {
    Install,
    Archive,
    Disabled,
}

internal fun androidReleaseDownloadMode(
    record: AndroidReleaseRecord,
    installedVersionCode: Int = BuildConfig.VERSION_CODE,
): AndroidReleaseDownloadMode = when {
    !record.installable -> AndroidReleaseDownloadMode.Disabled
    record.versionCode > installedVersionCode -> AndroidReleaseDownloadMode.Install
    else -> AndroidReleaseDownloadMode.Archive
}

@Immutable
data class AndroidReleaseUiState(
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val catalog: AndroidReleaseCatalog? = null,
    val saving: Boolean = false,
    val building: Boolean = false,
    val downloadingVersion: String? = null,
    val downloadProgress: Int = 0,
) {
    val draft: AndroidReleaseDraft? get() = catalog?.draft
    val releases: List<AndroidReleaseRecord> get() = catalog?.releases.orEmpty()
}

class AndroidReleaseStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val updateManager: AppUpdateManager,
    private val appUpdates: AppUpdateStateHolder,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<AndroidReleaseUiState>(
    parentScope,
    AndroidReleaseUiState(),
    onSessionExpired,
) {
    fun load(force: Boolean = false) {
        if (!force && mutableState.value.catalog != null) return
        launchAction(
            isBusy = { loading || refreshing },
            start = { copy(loading = catalog == null, refreshing = catalog != null, error = null) },
            action = { api.androidReleases() },
            success = { catalog -> copy(loading = false, refreshing = false, catalog = catalog, error = null) },
            failure = { error ->
                copy(
                    loading = false,
                    refreshing = false,
                    error = error.message ?: "版本列表加载失败，请稍后重试。",
                )
            },
        )
    }

    fun saveDraft(versionName: String, notes: String) {
        launchAction(
            isBusy = { saving || building || catalog?.buildInProgress == true },
            start = { copy(saving = true, error = null, message = null) },
            action = { api.saveAndroidReleaseDraft(versionName.trim(), notes.trim()) },
            success = { draft ->
                copy(
                    saving = false,
                    catalog = catalog?.copy(draft = draft),
                    message = "下一次发布计划已保存。",
                )
            },
            failure = { error ->
                copy(saving = false, error = error.message ?: "发布计划保存失败，请稍后重试。")
            },
        )
    }

    fun dispatchBuild(confirmation: suspend () -> Boolean) {
        val current = mutableState.value
        if (current.building || current.saving || current.catalog?.buildInProgress == true) return
        scope.launch {
            mutableState.update { it.copy(building = true, error = null, message = null) }
            try {
                if (!confirmation()) {
                    mutableState.update { it.copy(building = false) }
                    return@launch
                }
                api.dispatchAndroidBuild()
                mutableState.update {
                    it.copy(
                        building = false,
                        catalog = it.catalog?.copy(buildInProgress = true),
                        message = "Android 构建任务已提交，完成后可下拉刷新发布状态。",
                    )
                }
                load(force = true)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(building = false, error = error.message ?: "Android 构建触发失败，请稍后重试。")
                }
            }
        }
    }

    fun download(record: AndroidReleaseRecord) {
        if (mutableState.value.downloadingVersion != null || appUpdates.state.value.phase == AppUpdatePhase.Downloading) return
        val update = record.toAppUpdateInfo()
        if (update == null || !record.installable) {
            mutableState.update { it.copy(error = "当前版本缺少下载地址或校验信息。", message = null) }
            return
        }
        if (androidReleaseDownloadMode(record) == AndroidReleaseDownloadMode.Install) {
            mutableState.update { it.copy(error = null, message = null) }
            appUpdates.downloadAndInstall(update)
            return
        }
        launchAction(
            isBusy = { downloadingVersion != null },
            start = {
                copy(
                    downloadingVersion = record.versionName,
                    downloadProgress = 0,
                    error = null,
                    message = null,
                )
            },
            action = {
                updateManager.downloadArchive(update) { progress ->
                    mutableState.update { it.copy(downloadProgress = progress) }
                }
                "历史安装包已校验并保存到系统下载目录。"
            },
            success = { message ->
                copy(downloadingVersion = null, downloadProgress = 100, message = message)
            },
            failure = { error ->
                copy(
                    downloadingVersion = null,
                    downloadProgress = 0,
                    error = if (isAppUpdateSigningMismatch(error)) {
                        "安装包签名与当前应用不一致，已取消归档。"
                    } else {
                        error.message ?: "安装包下载失败，请稍后重试。"
                    },
                )
            },
        )
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }

    override fun clearPendingState(current: AndroidReleaseUiState) = current.copy(
        loading = false,
        refreshing = false,
        saving = false,
        building = false,
        downloadingVersion = null,
        downloadProgress = 0,
    )
}
