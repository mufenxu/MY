package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AndroidReleaseCatalog
import cn.pxyb.mycontrol.data.AndroidReleaseDraft
import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.update.AppUpdateManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.update

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
    val loading: Boolean = true,
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
            isBusy = { saving },
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
        if (mutableState.value.building) return
        scope.launch {
            mutableState.update { it.copy(building = true, error = null, message = null) }
            try {
                if (!confirmation()) {
                    mutableState.update { it.copy(building = false) }
                    return@launch
                }
                api.dispatchAndroidBuild()
                mutableState.update {
                    it.copy(building = false, message = "Android 构建任务已提交。")
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
        if (mutableState.value.downloadingVersion != null) return
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
                val update = record.toAppUpdateInfo() ?: error("当前版本缺少下载地址或校验信息。")
                when (androidReleaseDownloadMode(record)) {
                    AndroidReleaseDownloadMode.Install -> {
                        val file = updateManager.download(update) { progress ->
                            mutableState.update { it.copy(downloadProgress = progress) }
                        }
                        when (updateManager.install(file)) {
                            cn.pxyb.mycontrol.update.AppInstallResult.Started -> "安装包已校验，正在打开安装器。"
                            cn.pxyb.mycontrol.update.AppInstallResult.PermissionRequired -> "安装包已就绪，请先授权安装未知应用。"
                        }
                    }
                    AndroidReleaseDownloadMode.Archive -> {
                        updateManager.downloadArchive(update) { progress ->
                            mutableState.update { it.copy(downloadProgress = progress) }
                        }
                        "历史安装包已校验并保存到系统下载目录。"
                    }
                    AndroidReleaseDownloadMode.Disabled -> error("当前版本缺少下载地址或校验信息。")
                }
            },
            success = { message ->
                copy(downloadingVersion = null, downloadProgress = 100, message = message)
            },
            failure = { error ->
                copy(
                    downloadingVersion = null,
                    downloadProgress = 0,
                    error = error.message ?: "安装包下载失败，请稍后重试。",
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
