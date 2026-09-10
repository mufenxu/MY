package cn.pxyb.mycontrol.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
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
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AndroidReleaseRecord
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppErrorState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.picker.AppWheelPicker
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
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
        // 首次进入时状态仍为初始值，按“暂无数据且无错误”直接渲染骨架，避免闪现旧内容
        val catalogPending = state.catalog == null && state.error == null
        if (state.loading || catalogPending) {
            item(key = "android-release-loading", contentType = "loading") {
                AndroidReleaseLoadingSkeleton()
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
    val currentVersionCode = maxOf(BuildConfig.VERSION_CODE, state.catalog?.latest?.versionCode ?: 0)
    val canSelectVersion = currentVersionCode < Int.MAX_VALUE
    val minimumVersionCode = if (canSelectVersion) currentVersionCode + 1 else Int.MAX_VALUE
    var versionCode by remember(draft?.id, draft?.versionCode, minimumVersionCode) {
        mutableIntStateOf((draft?.versionCode ?: minimumVersionCode).coerceAtLeast(minimumVersionCode))
    }
    val versionName = androidReleaseVersionName(versionCode)
    var showVersionPicker by remember { mutableStateOf(false) }
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
                AppActionRow(
                    title = "版本号 · v$versionName",
                    subtitle = if (canSelectVersion) {
                        "点击选择，最低可选 v${androidReleaseVersionName(minimumVersionCode)}"
                    } else {
                        "当前版本已达到可发布上限"
                    },
                    icon = Icons.Outlined.SystemUpdate,
                    enabled = !planBusy && canSelectVersion,
                    onClick = { showVersionPicker = true },
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
                        enabled = !planBusy && canSelectVersion && notes.isNotBlank(),
                        loading = state.saving,
                    )
                    AppButton(
                        text = "触发构建",
                        onClick = onDispatchBuild,
                        icon = Icons.Outlined.RocketLaunch,
                        modifier = Modifier.weight(1f),
                        enabled = !planBusy && canSelectVersion && draft != null && !draftDirty,
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

    if (showVersionPicker && canManage && !planBusy && canSelectVersion) {
        AndroidReleaseVersionPicker(
            versionCode = versionCode,
            minimumVersionCode = minimumVersionCode,
            onDismiss = { showVersionPicker = false },
            onConfirm = {
                versionCode = it
                showVersionPicker = false
            },
        )
    }
}

@Composable
private fun AndroidReleaseVersionPicker(
    versionCode: Int,
    minimumVersionCode: Int,
    onDismiss: () -> Unit,
    onConfirm: (Int) -> Unit,
) {
    var selectedVersionCode by remember(versionCode, minimumVersionCode) {
        mutableIntStateOf(versionCode.coerceAtLeast(minimumVersionCode))
    }
    // 与发布接口的编码规则一致，每段选择都限制在可更新的构建号范围内。
    val major = selectedVersionCode / 1_000_000
    val minor = selectedVersionCode / 1_000 % 1_000
    val patch = selectedVersionCode % 1_000
    val minimumMajor = minimumVersionCode / 1_000_000
    val maximumMajor = Int.MAX_VALUE / 1_000_000
    val minimumMinor = if (major == minimumMajor) minimumVersionCode / 1_000 % 1_000 else 0
    val maximumMinor = if (major == maximumMajor) Int.MAX_VALUE / 1_000 % 1_000 else 999
    val minimumPatch = if (selectedVersionCode / 1_000 == minimumVersionCode / 1_000) {
        minimumVersionCode % 1_000
    } else {
        0
    }
    val maximumPatch = if (selectedVersionCode / 1_000 == Int.MAX_VALUE / 1_000) {
        Int.MAX_VALUE % 1_000
    } else {
        999
    }
    val majors = remember(minimumMajor) { (minimumMajor..maximumMajor).toList() }
    val minors = remember(minimumMinor, maximumMinor) { (minimumMinor..maximumMinor).toList() }
    val patches = remember(minimumPatch, maximumPatch) { (minimumPatch..maximumPatch).toList() }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.SystemUpdate,
        title = "选择版本号",
        subtitle = "将发布 v${androidReleaseVersionName(selectedVersionCode)}",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "使用此版本",
                    onClick = { onConfirm(selectedVersionCode) },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "最低可选 v${androidReleaseVersionName(minimumVersionCode)}，滑动数字自定义版本。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("主版本", style = MaterialTheme.typography.labelMedium)
                    AppWheelPicker(
                        items = majors,
                        selectedIndex = major - minimumMajor,
                        onSelectedIndexChanged = {
                            selectedVersionCode = (majors[it] * 1_000_000L + selectedVersionCode % 1_000_000)
                                .coerceIn(minimumVersionCode.toLong(), Int.MAX_VALUE.toLong()).toInt()
                        },
                        itemHeight = 48.dp,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("次版本", style = MaterialTheme.typography.labelMedium)
                    AppWheelPicker(
                        items = minors,
                        selectedIndex = minor - minimumMinor,
                        onSelectedIndexChanged = {
                            selectedVersionCode = (
                                selectedVersionCode / 1_000_000 * 1_000_000L +
                                    minors[it] * 1_000L + selectedVersionCode % 1_000
                                ).coerceIn(minimumVersionCode.toLong(), Int.MAX_VALUE.toLong()).toInt()
                        },
                        itemHeight = 48.dp,
                    )
                }
                Column(
                    modifier = Modifier.weight(1f),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text("修订号", style = MaterialTheme.typography.labelMedium)
                    AppWheelPicker(
                        items = patches,
                        selectedIndex = patch - minimumPatch,
                        onSelectedIndexChanged = {
                            selectedVersionCode = (selectedVersionCode / 1_000 * 1_000L + patches[it])
                                .coerceIn(minimumVersionCode.toLong(), Int.MAX_VALUE.toLong()).toInt()
                        },
                        itemHeight = 48.dp,
                    )
                }
            }
        }
    }
}

private fun androidReleaseVersionName(versionCode: Int): String =
    "${versionCode / 1_000_000}.${versionCode / 1_000 % 1_000}.${versionCode % 1_000}"

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

// 应用版本管理预加载骨架：按真实区块同构占位，叠加微光扫过与呼吸脉冲，数据到达后自然渲染
@Composable
private fun AndroidReleaseLoadingSkeleton() {
    val transition = rememberInfiniteTransition(label = "android-release-loading")
    val pulse by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = MotionTokens.DurationMedium * 3, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "android-release-loading-pulse",
    )
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "正在同步发布信息",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 4.dp),
        )
        ReleaseSkeletonCard {
            ReleaseSkeletonBlock(Modifier.width(132.dp).height(16.dp), pulse, corner = 8.dp)
            ReleaseSkeletonBlock(Modifier.width(212.dp).height(10.dp), pulse)
            ReleaseSkeletonBlock(Modifier.fillMaxWidth().height(48.dp), pulse, corner = 24.dp)
            ReleaseSkeletonBlock(Modifier.fillMaxWidth().height(96.dp), pulse, corner = 16.dp)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                ReleaseSkeletonBlock(Modifier.weight(1f).height(44.dp), pulse, corner = 22.dp)
                ReleaseSkeletonBlock(Modifier.weight(1f).height(44.dp), pulse, corner = 22.dp)
            }
        }
        ReleaseSkeletonSectionTitle(pulse)
        repeat(3) {
            ReleaseRowSkeletonCard(pulse)
        }
    }
}

@Composable
private fun ReleaseSkeletonCard(content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(glassCardColor())
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f), shape)
            .glassShimmer(isAppInDarkTheme()),
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
            content = content,
        )
    }
}

@Composable
private fun ReleaseSkeletonBlock(
    modifier: Modifier,
    pulse: Float,
    corner: Dp = 6.dp,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(corner))
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.18f * pulse)),
    )
}

@Composable
private fun ReleaseSkeletonSectionTitle(pulse: Float) {
    Column(
        modifier = Modifier.padding(top = 4.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        ReleaseSkeletonBlock(Modifier.width(88.dp).height(16.dp), pulse, corner = 8.dp)
        ReleaseSkeletonBlock(Modifier.width(178.dp).height(10.dp), pulse)
    }
}

@Composable
private fun ReleaseRowSkeletonCard(pulse: Float) {
    ReleaseSkeletonCard {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ReleaseSkeletonBlock(Modifier.width(96.dp).height(15.dp), pulse)
                ReleaseSkeletonBlock(Modifier.fillMaxWidth(0.72f).height(10.dp), pulse)
            }
            ReleaseSkeletonBlock(Modifier.width(56.dp).height(20.dp), pulse, corner = 10.dp)
        }
        ReleaseSkeletonBlock(Modifier.fillMaxWidth(0.9f).height(11.dp), pulse)
        ReleaseSkeletonBlock(Modifier.fillMaxWidth().height(44.dp), pulse, corner = 22.dp)
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
