package cn.pxyb.mycontrol.ui.feature.registry

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CleaningServices
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AcrImageCatalog
import cn.pxyb.mycontrol.data.AcrImageGroup
import cn.pxyb.mycontrol.data.AcrImageMutation
import cn.pxyb.mycontrol.data.AcrImageTag
import cn.pxyb.mycontrol.ui.components.button.AppInlineDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppErrorState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppLoadingState
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val REGISTRY_AUTO_EXPAND_LIMIT = 8
private const val REGISTRY_PAGE_SIZE = 60

private val acrTimeFormatter: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")

internal fun formatAcrTimestamp(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    return runCatching {
        OffsetDateTime.parse(raw).atZoneSameInstant(ZoneId.systemDefault()).format(acrTimeFormatter)
    }.getOrNull()
}

internal fun protectedReasonLabel(reason: String): String = when (reason) {
    "production" -> "生产标签"
    "configured" -> "当前部署"
    "internal" -> "构建缓存"
    else -> "受保护"
}

private fun protectedReasonSemantic(reason: String): AppStatusSemantic = when (reason) {
    "production" -> AppStatusSemantic.Warning
    "configured" -> AppStatusSemantic.Info
    else -> AppStatusSemantic.Neutral
}

private enum class RegistryCheckState { None, Partial, All }

@Composable
internal fun RegistryImagesScreen(
    state: RegistryImagesUiState,
    canManage: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onLoad: () -> Unit,
    onRefresh: () -> Unit,
    onToggle: (String) -> Unit,
    onTogglePrefix: (String, Boolean) -> Unit,
    onClearSelection: () -> Unit,
    onDeleteSelected: () -> Unit,
    onKeepCountChange: (Int) -> Unit,
    onIncludeUnknownChange: (Boolean) -> Unit,
    onPrunePreview: () -> Unit,
    onPruneConfirm: () -> Unit,
    onPruneDismiss: () -> Unit,
    onDismissFeedback: () -> Unit,
) {
    LaunchedEffect(Unit) {
        onLoad()
    }

    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    var confirmDelete by remember { mutableStateOf(false) }
    val catalog = state.catalog
    val deletable = canManage && catalog?.canDelete == true
    val selectedCount = state.selected.size

    AppSubPage(
        title = "镜像仓库",
        subtitle = if (selectedCount > 0) "已选 $selectedCount 个历史版本" else "清理阿里云 ACR 历史版本",
        onBack = onBack,
        contentPadding = contentPadding,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
    ) {
        if (state.loading || (catalog == null && state.error == null)) {
            item(key = "registry-loading", contentType = "loading") {
                AppLoadingState("正在读取镜像版本…")
            }
            return@AppSubPage
        }

        state.message?.let { message ->
            item(key = "registry-message", contentType = "banner") {
                AppFeedbackBanner(message = message, onDismiss = onDismissFeedback)
            }
        }
        state.error?.let { error ->
            item(key = "registry-error", contentType = "banner") {
                AppFeedbackBanner(message = error, error = true, onDismiss = onDismissFeedback)
            }
        }

        if (catalog == null) {
            item(key = "registry-failed", contentType = "error") {
                AppErrorState(message = state.error ?: "镜像版本读取失败。", onRetry = onRefresh)
            }
            return@AppSubPage
        }

        item(key = "registry-summary", contentType = "card") {
            RegistrySummaryPanel(catalog = catalog, canManage = canManage)
        }

        if (!canManage || !catalog.canDelete) {
            item(key = "registry-hint", contentType = "hint") {
                RegistryHintPanel(
                    if (!canManage) {
                        "当前账号没有镜像管理权限，只有超级管理员可以删除镜像版本。"
                    } else {
                        "服务器还没有配置 ACR 访问凭证，目前只能查看镜像版本，删除操作不可用。"
                    },
                )
            }
        }

        if (selectedCount > 0) {
            item(key = "registry-selection", contentType = "card") {
                RegistrySelectionPanel(
                    count = selectedCount,
                    busy = state.deleting,
                    enabled = deletable,
                    maxBatch = catalog.maxBatch,
                    onClear = onClearSelection,
                    onDelete = { confirmDelete = true },
                )
            }
        }

        if (deletable && catalog.candidateCount > 0) {
            item(key = "registry-prune-title", contentType = "section") {
                AppSectionHeader(title = "批量清理", subtitle = "每个镜像只保留最新若干个候选版本")
            }
            item(key = "registry-prune", contentType = "card") {
                RegistryPrunePanel(
                    keepCount = state.keepCount,
                    includeUnknown = state.includeUnknown,
                    busy = state.pruning,
                    planned = state.plan?.planned ?: 0,
                    timelineAvailable = catalog.timelineAvailable,
                    unknownTags = catalog.unknownTimelineTags,
                    onKeepCountChange = onKeepCountChange,
                    onIncludeUnknownChange = onIncludeUnknownChange,
                    onPreview = onPrunePreview,
                )
            }
        }

        if (catalog.groups.isEmpty()) {
            item(key = "registry-empty", contentType = "empty") {
                AppEmptyState(
                    title = "没有可清理的历史版本",
                    detail = "当前仓库里只剩生产标签和受保护标签。",
                    icon = Icons.Outlined.Restore,
                )
            }
        } else {
            item(key = "registry-candidates-title", contentType = "section") {
                AppSectionHeader(title = "历史候选版本", subtitle = "按构建时间从新到旧排列，点按整行即可选中")
            }
            catalog.groups.forEach { group ->
                val defaultExpanded = group.tags.size <= REGISTRY_AUTO_EXPAND_LIMIT
                item(key = "registry-group-${group.prefix}", contentType = "group") {
                    RegistryGroupCard(
                        group = group,
                        expanded = expanded[group.prefix] ?: defaultExpanded,
                        selected = state.selected,
                        deletable = deletable,
                        onToggleExpanded = { expanded[group.prefix] = !(expanded[group.prefix] ?: defaultExpanded) },
                        onToggleGroup = { selectAll -> onTogglePrefix(group.prefix, selectAll) },
                        onToggleTag = onToggle,
                    )
                }
            }
        }

        if (catalog.protectedTags.isNotEmpty()) {
            item(key = "registry-protected-title", contentType = "section") {
                AppSectionHeader(title = "受保护标签", subtitle = "这些标签永远不会出现在删除范围里")
            }
            item(key = "registry-protected", contentType = "card") {
                RegistryProtectedPanel(catalog = catalog)
            }
        }
    }

    if (confirmDelete) {
        AppConfirmDialog(
            title = "删除选中的镜像版本？",
            detail = "将删除 ${state.selected.size} 个历史版本。删除后镜像无法直接恢复，需要重新构建；ACR 的存储空间为异步回收。",
            confirmLabel = "确认删除",
            dismissLabel = "取消",
            danger = true,
            busy = state.deleting,
            icon = Icons.Outlined.Delete,
            onDismiss = { confirmDelete = false },
            onConfirm = {
                confirmDelete = false
                onDeleteSelected()
            },
        )
    }

    state.plan?.let { plan ->
        AppConfirmDialog(
            title = "执行清理计划？",
            detail = pruneDetail(plan, state.keepCount),
            confirmLabel = "执行清理",
            dismissLabel = "取消",
            danger = true,
            busy = state.pruning,
            icon = Icons.Outlined.Delete,
            onDismiss = onPruneDismiss,
            onConfirm = onPruneConfirm,
        )
    }
}

private fun pruneDetail(plan: AcrImageMutation, keepCount: Int): String {
    val preview = plan.plan.take(6).map { it.tag }.joinToString("\n")
    val more = if (plan.planned > 6) "\n… 以及其余 ${plan.planned - 6} 个" else ""
    val remaining = if (plan.remaining > 0) "\n本次先处理 ${plan.plan.size} 个，剩余 ${plan.remaining} 个可再次执行。" else ""
    return "保留每组最新 $keepCount 个版本，本次删除 ${plan.plan.size} 个：\n$preview$more$remaining"
}

@Composable
private fun RegistrySummaryPanel(catalog: AcrImageCatalog, canManage: Boolean) {
    AppPanel {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppIconTile(Icons.Outlined.Inventory2, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("阿里云 ACR 镜像仓库", style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        catalog.repository,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                AppStatusBadge(
                    label = if (catalog.canDelete && canManage) "可管理" else "只读",
                    semantic = if (catalog.canDelete && canManage) AppStatusSemantic.Success else AppStatusSemantic.Neutral,
                )
            }

            AppDivider(paddingStart = 0.dp, paddingEnd = 0.dp)

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                RegistryMetric("版本总数", catalog.tagCount.toString(), MaterialTheme.colorScheme.onSurface, Modifier.weight(1f))
                RegistryMetric("可清理候选", catalog.candidateCount.toString(), MaterialTheme.colorScheme.primary, Modifier.weight(1f))
                RegistryMetric("受保护", catalog.protectedTags.size.toString(), MaterialTheme.colorScheme.onSurfaceVariant, Modifier.weight(1f))
            }

            val fetched = formatAcrTimestamp(catalog.fetchedAt)
            Text(
                buildString {
                    append(fetched?.let { "读取于 $it" } ?: "尚未刷新")
                    append(" · 单次最多删除 ${catalog.maxBatch} 个")
                    if (!catalog.timelineAvailable) append(" · 构建时间不可用")
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
            )
        }
    }
}

@Composable
private fun RegistryMetric(label: String, value: String, valueColor: Color, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = valueColor, maxLines = 1)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun RegistryHintPanel(message: String) {
    AppPanel {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Outlined.HelpOutline,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
            Text(
                message,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun RegistrySelectionPanel(
    count: Int,
    busy: Boolean,
    enabled: Boolean,
    maxBatch: Int,
    onClear: () -> Unit,
    onDelete: () -> Unit,
) {
    val overflow = count > maxBatch
    AppPanel {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .background(ColorTokens.Blue.container, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.Check,
                        contentDescription = null,
                        tint = ColorTokens.Blue.foreground,
                        modifier = Modifier.size(19.dp),
                    )
                }
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "已选 $count 个版本",
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    )
                    Text(
                        if (overflow) "单次最多删除 $maxBatch 个，请分批选择" else "删除后需要重新构建才能找回",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                        color = if (overflow) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppSecondaryButton(
                    text = "清空",
                    onClick = onClear,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                )
                AppInlineDangerButton(
                    text = "删除选中",
                    onClick = onDelete,
                    icon = Icons.Outlined.Delete,
                    enabled = enabled && !busy && !overflow,
                    loading = busy,
                    modifier = Modifier.weight(1.4f),
                )
            }
        }
    }
}

@Composable
private fun RegistryPrunePanel(
    keepCount: Int,
    includeUnknown: Boolean,
    busy: Boolean,
    planned: Int,
    timelineAvailable: Boolean,
    unknownTags: Int,
    onKeepCountChange: (Int) -> Unit,
    onIncludeUnknownChange: (Boolean) -> Unit,
    onPreview: () -> Unit,
) {
    AppPanel {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        "每组保留最新",
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp),
                    )
                    Text(
                        "超出的旧版本会进入清理计划",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                    )
                }
                RegistryStepper(
                    value = keepCount,
                    enabled = !busy,
                    onChange = onKeepCountChange,
                )
            }

            AppDivider()

            AppSwitchRow(
                title = "包含时间未知的版本",
                subtitle = if (timelineAvailable) {
                    "暂无法判断构建时间的候选有 $unknownTags 个"
                } else {
                    "服务器未配置 GitHub 令牌，无法判断构建时间"
                },
                checked = includeUnknown,
                onCheckedChange = onIncludeUnknownChange,
                icon = Icons.Outlined.HelpOutline,
                enabled = !busy,
            )

            AppDivider()

            Box(modifier = Modifier.padding(14.dp)) {
                AppSecondaryButton(
                    text = if (planned > 0) "重新生成清理计划" else "预览清理计划",
                    onClick = onPreview,
                    icon = Icons.Outlined.CleaningServices,
                    loading = busy,
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun RegistryStepper(value: Int, enabled: Boolean, onChange: (Int) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RegistryStepButton(Icons.Outlined.Remove, "减少保留数量", enabled && value > 1) { onChange(value - 1) }
        Text(
            value.toString(),
            modifier = Modifier.widthIn(min = 24.dp),
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.titleMedium,
        )
        RegistryStepButton(Icons.Outlined.Add, "增加保留数量", enabled && value < 50) { onChange(value + 1) }
    }
}

@Composable
private fun RegistryStepButton(icon: ImageVector, description: String, enabled: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val shape = CircleShape
    val container = if (enabled) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surfaceContainerLow
    val content = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurface.copy(alpha = 0.35f)
    Box(
        modifier = Modifier
            .size(34.dp)
            .clip(shape)
            .background(container)
            .border(0.5.dp, MaterialTheme.colorScheme.outlineVariant, shape)
            .pressFeedback(interactionSource, pressedScale = 0.94f)
            .clickable(
                enabled = enabled,
                interactionSource = interactionSource,
                indication = null,
            ) {
                AppHaptics.tick(haptics)
                onClick()
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = description, tint = content, modifier = Modifier.size(17.dp))
    }
}

@Composable
private fun RegistryGroupCard(
    group: AcrImageGroup,
    expanded: Boolean,
    selected: Set<String>,
    deletable: Boolean,
    onToggleExpanded: () -> Unit,
    onToggleGroup: (Boolean) -> Unit,
    onToggleTag: (String) -> Unit,
) {
    var visibleCount by rememberSaveable(group.prefix) { mutableStateOf(REGISTRY_PAGE_SIZE) }
    val selectedInGroup = group.tags.count { it.tag in selected }
    val checkState = when {
        selectedInGroup == 0 -> RegistryCheckState.None
        selectedInGroup == group.tags.size -> RegistryCheckState.All
        else -> RegistryCheckState.Partial
    }

    AppPanel {
        Column {
            RegistryGroupHeader(
                group = group,
                expanded = expanded,
                selectedInGroup = selectedInGroup,
                checkState = checkState,
                deletable = deletable,
                onToggleExpanded = onToggleExpanded,
                onToggleGroup = onToggleGroup,
            )
            if (expanded && group.tags.isNotEmpty()) {
                val shown = group.tags.take(visibleCount)
                shown.forEach { item ->
                    AppDivider()
                    RegistryTagRow(
                        item = item,
                        checked = item.tag in selected,
                        enabled = deletable,
                        onToggle = { onToggleTag(item.tag) },
                    )
                }
                if (group.tags.size > shown.size) {
                    AppDivider()
                    RegistryLoadMoreRow(
                        shown = shown.size,
                        remaining = group.tags.size - shown.size,
                        onClick = { visibleCount += REGISTRY_PAGE_SIZE },
                    )
                }
            }
        }
    }
}

@Composable
private fun RegistryGroupHeader(
    group: AcrImageGroup,
    expanded: Boolean,
    selectedInGroup: Int,
    checkState: RegistryCheckState,
    deletable: Boolean,
    onToggleExpanded: () -> Unit,
    onToggleGroup: (Boolean) -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .pressFeedback(interactionSource, pressedScale = 0.99f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) {
                AppHaptics.tick(haptics)
                onToggleExpanded()
            }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppIconTile(Icons.Outlined.Layers, MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.primaryContainer)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                group.prefix,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold, fontSize = 14.5.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                if (selectedInGroup > 0) {
                    "${group.tags.size} 个候选版本 · 已选 $selectedInGroup"
                } else {
                    "${group.tags.size} 个候选版本"
                },
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (deletable) {
            RegistrySelectIndicator(
                state = checkState,
                enabled = true,
                contentDescription = if (checkState == RegistryCheckState.All) "取消选择全部 ${group.prefix} 版本" else "选择全部 ${group.prefix} 版本",
                onClick = { onToggleGroup(checkState != RegistryCheckState.All) },
            )
        }
        Icon(
            if (expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
            contentDescription = if (expanded) "收起" else "展开",
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(20.dp),
        )
    }
}

@Composable
private fun RegistryTagRow(
    item: AcrImageTag,
    checked: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val time = formatAcrTimestamp(item.createdAt)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                if (checked) MaterialTheme.colorScheme.primary.copy(alpha = 0.06f) else Color.Transparent,
            ),
    ) {
        AppActionRow(
            title = item.tag,
            subtitle = time?.let { "构建于 $it" } ?: "构建时间未知，需手动选择",
            enabled = enabled,
            onClick = if (enabled) onToggle else null,
            trailingContent = {
                RegistrySelectIndicator(
                    state = if (checked) RegistryCheckState.All else RegistryCheckState.None,
                    enabled = enabled,
                )
            },
        )
    }
}

@Composable
private fun RegistryLoadMoreRow(shown: Int, remaining: Int, onClick: () -> Unit) {
    AppActionRow(
        title = "显示更多版本",
        subtitle = "已显示 $shown 个，还有 $remaining 个候选",
        icon = Icons.Outlined.ExpandMore,
        onClick = onClick,
    )
}

@Composable
private fun RegistrySelectIndicator(
    state: RegistryCheckState,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val selected = state != RegistryCheckState.None
    val shape = RoundedCornerShape(7.dp)
    val activeColor = MaterialTheme.colorScheme.primary
    val container by animateColorAsState(
        targetValue = when {
            selected && enabled -> activeColor
            selected -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.32f)
            else -> Color.Transparent
        },
        label = "acr-select-container",
    )
    val border by animateColorAsState(
        targetValue = when {
            selected -> container
            enabled -> MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
            else -> MaterialTheme.colorScheme.outlineVariant
        },
        label = "acr-select-border",
    )
    val markColor = if (enabled) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.surface

    Box(
        modifier = modifier
            .size(22.dp)
            .clip(shape)
            .background(container)
            .border(1.5.dp, border, shape)
            .then(
                if (onClick != null && enabled) {
                    Modifier
                        .pressFeedback(interactionSource, pressedScale = 0.9f)
                        .clickable(
                            interactionSource = interactionSource,
                            indication = null,
                            onClickLabel = contentDescription,
                        ) {
                            AppHaptics.tick(haptics)
                            onClick()
                        }
                } else {
                    Modifier
                },
            ),
        contentAlignment = Alignment.Center,
    ) {
        when (state) {
            RegistryCheckState.All -> Icon(
                Icons.Outlined.Check,
                contentDescription = contentDescription.takeIf { onClick == null },
                tint = markColor,
                modifier = Modifier.size(15.dp),
            )
            RegistryCheckState.Partial -> Box(
                modifier = Modifier
                    .size(width = 10.dp, height = 2.dp)
                    .background(markColor, RoundedCornerShape(1.dp)),
            )
            RegistryCheckState.None -> Unit
        }
    }
}

@Composable
private fun RegistryProtectedPanel(catalog: AcrImageCatalog) {
    AppPanel {
        Column {
            catalog.protectedTags.forEachIndexed { index, item ->
                if (index > 0) AppDivider()
                AppActionRow(
                    title = item.tag,
                    subtitle = item.digest?.removePrefix("sha256:")?.take(12)?.let { "摘要 $it" } ?: "始终保留",
                    trailingContent = {
                        AppStatusBadge(
                            label = protectedReasonLabel(item.reason),
                            semantic = protectedReasonSemantic(item.reason),
                        )
                    },
                )
            }
        }
    }
}
