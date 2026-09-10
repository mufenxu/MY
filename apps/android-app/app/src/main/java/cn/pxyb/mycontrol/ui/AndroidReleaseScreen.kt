package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material.icons.outlined.Save
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppErrorState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState
import java.time.OffsetDateTime
import java.time.ZoneId
import kotlin.math.log10
import kotlin.math.pow

@Composable
internal fun AndroidReleaseScreen(
    state: AndroidReleaseUiState,
    appUpdate: AppUpdateUiState,
    canManage: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoad: () -> Unit,
    onSaveDraft: (versionName: String, notes: String) -> Unit,
    onDispatchBuild: () -> Unit,
    onDownload: (AndroidReleaseRecord) -> Unit,
    onInstallDownloaded: () -> Unit,
) {
    LaunchedEffect(Unit) {
        onLoad()
    }

    AppSubPage(
        title = "应用版本管理",
        subtitle = "安装包归档与下一次 Android 发布",
        onBack = onBack,
        contentPadding = contentPadding,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
    ) {
        if (state.loading) {
            item(key = "android-release-loading", contentType = "loading") {
                GlassShimmerList(itemCount = 3, itemHeight = 104.dp)
            }
            return@AppSubPage
        }

        if (state.error != null && state.catalog == null) {
            item(key = "android-release-error", contentType = "error") {
                AppErrorState(
                    message = state.error,
                    onRetry = onRefresh,
                    retryLoading = state.refreshing,
                )
            }
            return@AppSubPage
        }

        item(key = "android-release-plan", contentType = "plan") {
            AndroidReleasePlanCard(
                state = state,
                canManage = canManage,
                onSaveDraft = onSaveDraft,
                onDispatchBuild = onDispatchBuild,
            )
        }

        if (state.message != null || state.error != null) {
            item(key = "android-release-feedback", contentType = "feedback") {
                AppFeedbackBanner(
                    message = state.error ?: state.message.orEmpty(),
                    error = state.error != null,
                )
            }
        }

        item(key = "android-release-list-title", contentType = "section-title") {
            AndroidReleaseSectionTitle(
                title = "版本列表",
                detail = "仅展示最近 20 个版本的安装包",
            )
        }

        if (state.releases.isEmpty()) {
            item(key = "android-release-empty", contentType = "empty") {
                AppEmptyState(
                    title = "还没有可下载版本",
                    detail = "发布完成后，安装包会出现在这里。",
                    icon = Icons.Outlined.SystemUpdate,
                )
            }
        } else {
            items(
                count = state.releases.size,
                key = { index -> state.releases[index].id },
                contentType = { "android-release" },
            ) { index ->
                val record = state.releases[index]
                val recordUpdate = appUpdate.takeIf { it.info?.versionCode == record.versionCode }
                val downloadingUpdate = recordUpdate?.phase == AppUpdatePhase.Downloading
                AndroidReleaseCard(
                    record = record,
                    appUpdate = recordUpdate,
                    isLatest = state.catalog?.latest?.id == record.id,
                    isDownloading = state.downloadingVersion == record.versionName || downloadingUpdate,
                    anyDownloading = state.downloadingVersion != null || appUpdate.phase == AppUpdatePhase.Downloading,
                    progress = if (downloadingUpdate) appUpdate.progress else state.downloadProgress,
                    onDownload = { onDownload(record) },
                    onInstallDownloaded = onInstallDownloaded,
                )
            }
        }
    }
}

@Composable
private fun AndroidReleasePlanCard(
    state: AndroidReleaseUiState,
    canManage: Boolean,
    onSaveDraft: (versionName: String, notes: String) -> Unit,
    onDispatchBuild: () -> Unit,
) {
    val draft = state.draft
    val buildInProgress = state.catalog?.buildInProgress == true
    val planBusy = state.saving || state.building || buildInProgress
    var versionName by remember(draft?.id ?: "none") {
        mutableStateOf(draft?.versionName.orEmpty())
    }
    var notes by remember(draft?.id ?: "none") {
        mutableStateOf(draft?.notes.orEmpty())
    }
    val draftDirty = draft == null ||
        versionName.trim() != draft.versionName ||
        notes.trim() != draft.notes

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "下一次发布计划",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = "构建时将使用这里的版本号和发布说明",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (buildInProgress) {
                    AppStatusBadge(label = "构建中", semantic = AppStatusSemantic.Info)
                } else if (draft != null) {
                    AppStatusBadge(label = "已计划", semantic = AppStatusSemantic.Info)
                }
            }

            if (canManage) {
                AppTextField(
                    value = versionName,
                    onValueChange = { versionName = it },
                    label = "版本号",
                    placeholder = "例如 1.3.0",
                    leadingIcon = Icons.Outlined.SystemUpdate,
                    enabled = !planBusy,
                )
                AppTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = "发布说明",
                    placeholder = "填写用户可读的更新内容",
                    leadingIcon = Icons.Outlined.RocketLaunch,
                    singleLine = false,
                    minLines = 4,
                    maxLines = 8,
                    enabled = !planBusy,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    AppSecondaryButton(
                        text = "保存计划",
                        onClick = { onSaveDraft(versionName, notes) },
                        icon = Icons.Outlined.Save,
                        modifier = Modifier.weight(1f),
                        enabled = !planBusy && versionName.isNotBlank() && notes.isNotBlank(),
                        loading = state.saving,
                    )
                    AppButton(
                        text = "触发构建",
                        onClick = onDispatchBuild,
                        icon = Icons.Outlined.RocketLaunch,
                        modifier = Modifier.weight(1f),
                        enabled = !planBusy && draft != null && !draftDirty,
                        loading = state.building,
                    )
                }
                if (buildInProgress) {
                    Text(
                        text = "构建正在排队或执行，完成后下拉刷新即可编辑下一次发布计划。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (draft != null && draftDirty) {
                    Text(
                        text = "发布计划已修改，请先保存后再触发构建。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else if (draft != null) {
                Text(
                    text = "版本 ${draft.versionName}",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                )
                Text(
                    text = draft.notes,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                Text(
                    text = "当前暂无下一次发布计划。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AndroidReleaseCard(
    record: AndroidReleaseRecord,
    appUpdate: AppUpdateUiState?,
    isLatest: Boolean,
    isDownloading: Boolean,
    anyDownloading: Boolean,
    progress: Int,
    onDownload: () -> Unit,
    onInstallDownloaded: () -> Unit,
) {
    val mode = androidReleaseDownloadMode(record)
    val isCurrent = record.versionCode == BuildConfig.VERSION_CODE
    val canInstallDownloaded = appUpdate?.downloadedApkPath != null && appUpdate.phase in setOf(
        AppUpdatePhase.ReadyToInstall,
        AppUpdatePhase.InstallPermissionRequired,
        AppUpdatePhase.Installing,
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "v${record.versionName}",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = listOf(
                            androidReleaseDateText(record.publishedAt),
                            androidReleaseSizeText(record.apkSize),
                            "构建号 ${record.versionCode}",
                        ).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (isCurrent) {
                    AppStatusBadge(label = "当前版本", semantic = AppStatusSemantic.Success)
                }
                if (isLatest) {
                    AppStatusBadge(label = "最新", semantic = AppStatusSemantic.Info)
                }
            }

            Text(
                text = record.notes.ifBlank { "暂无发布说明" },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            when (mode) {
                AndroidReleaseDownloadMode.Install -> AppButton(
                    text = when {
                        isDownloading -> "下载中 $progress%"
                        canInstallDownloaded -> "继续安装"
                        else -> "下载并安装"
                    },
                    onClick = if (canInstallDownloaded) onInstallDownloaded else onDownload,
                    icon = Icons.Outlined.FileDownload,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !anyDownloading,
                    loading = isDownloading,
                )
                AndroidReleaseDownloadMode.Archive -> {
                    AppSecondaryButton(
                        text = if (isDownloading) "下载中 $progress%" else "下载安装包",
                        onClick = onDownload,
                        icon = Icons.Outlined.FileDownload,
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !anyDownloading,
                        loading = isDownloading,
                    )
                    Text(
                        text = "历史安装包仅保存到系统下载目录，不会覆盖当前应用。",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                AndroidReleaseDownloadMode.Disabled -> AppSecondaryButton(
                    text = "暂缺安装包",
                    onClick = onDownload,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = false,
                )
            }

            if (appUpdate?.phase == AppUpdatePhase.InstallPermissionRequired) {
                Text(
                    text = "安装包已就绪，授权安装未知应用后点击“继续安装”。",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            appUpdate?.error?.let { message ->
                AppFeedbackBanner(message = message, error = true)
            }

            if (isDownloading) {
                LinearProgressIndicator(
                    progress = { progress.coerceIn(0, 100) / 100f },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(50)),
                )
            }
        }
    }
}

@Composable
private fun AndroidReleaseSectionTitle(title: String, detail: String) {
    Column(modifier = Modifier.padding(top = 4.dp)) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
        )
        Text(
            text = detail,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun androidReleaseDateText(publishedAt: String?): String {
    if (publishedAt.isNullOrBlank()) return "发布时间未知"
    return runCatching {
        OffsetDateTime.parse(publishedAt)
            .atZoneSameInstant(ZoneId.systemDefault())
            .toLocalDate()
            .toString()
    }.getOrElse { publishedAt.take(10) }
}

private fun androidReleaseSizeText(sizeBytes: Long): String {
    if (sizeBytes <= 0L) return "大小未知"
    val units = listOf("B", "KB", "MB", "GB")
    val exponent = (log10(sizeBytes.toDouble()) / 3).toInt().coerceIn(0, units.lastIndex)
    val value = sizeBytes / 1_000.0.pow(exponent)
    val text = if (value >= 100 || exponent == 0) value.toInt().toString() else String.format("%.1f", value)
    return "$text ${units[exponent]}"
}
