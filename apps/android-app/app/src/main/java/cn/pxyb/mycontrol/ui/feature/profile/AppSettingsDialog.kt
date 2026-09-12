package cn.pxyb.mycontrol.ui.feature.profile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Keyboard
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.ui.SectionLoadState
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogSize
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.layout.AppAdaptivePanes
import cn.pxyb.mycontrol.ui.components.layout.AppListDetailMinWidth
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.util.DateTimeUtils.formatRelativeSyncTime

@Composable
internal fun AppSettingsDialog(
    profile: ProfileUiState,
    notificationsEnabled: Boolean,
    themePreference: AppThemePreference,
    initialSetup: Boolean,
    onRequestNotifications: () -> Unit,
    onForceFullSync: () -> Unit,
    onThemePreferenceChange: (AppThemePreference) -> Unit,
    onDismiss: () -> Unit,
) {
    val syncStates = profile.sectionLoadStates.values
    val refreshingCount = syncStates.count(SectionLoadState::refreshing)
    val failedCount = syncStates.count { !it.error.isNullOrBlank() }
    val latestSync = syncStates.mapNotNull(SectionLoadState::updatedAtMillis).maxOrNull()
    var selectedSection by rememberSaveable { mutableIntStateOf(0) }
    val sections = listOf(
        "外观" to Icons.Outlined.DarkMode,
        "通知" to Icons.Outlined.NotificationsActive,
        "数据同步" to Icons.Outlined.CloudSync,
        "键盘操作" to Icons.Outlined.Keyboard,
    )
    val sectionContent: @Composable (Int) -> Unit = { section ->
        SettingsSectionTitle(sections[section].second, sections[section].first)
        when (section) {
            0 -> AppSegmentedControl(
                options = AppThemePreference.entries,
                selected = themePreference,
                onSelect = onThemePreferenceChange,
                label = {
                    when (it) {
                        AppThemePreference.System -> "跟随系统"
                        AppThemePreference.Light -> "浅色"
                        AppThemePreference.Dark -> "深色"
                    }
                },
            )
            1 -> SettingsStatusRow(
                title = "系统通知权限",
                detail = if (notificationsEnabled) "已开启" else "未开启",
                healthy = notificationsEnabled,
                actionLabel = if (notificationsEnabled) null else "去开启",
                onAction = onRequestNotifications,
            )
            2 -> SettingsStatusRow(
                title = when {
                    refreshingCount > 0 -> "$refreshingCount 个模块正在同步"
                    failedCount > 0 -> "$failedCount 个模块同步异常"
                    else -> "后台同步正常"
                },
                detail = listOfNotNull(
                    latestSync?.let(::formatRelativeSyncTime),
                    profile.pendingTodoMutations.takeIf { it > 0 }?.let { "$it 项待办等待上传" },
                    if (profile.offlineMode) "当前使用离线数据" else null,
                ).ifEmpty { listOf("等待首次同步记录") }.joinToString(" · "),
                healthy = failedCount == 0 && !profile.offlineMode,
                actionLabel = if (refreshingCount == 0) "立即同步" else null,
                onAction = onForceFullSync,
            )
            3 -> {
                AppDetailRow(label = "全局搜索", value = "Ctrl + K")
                AppDetailRow(label = "切换主页面", value = "Ctrl + 1 / 2 / 3 / 4")
                AppDetailRow(label = "应用设置", value = "Ctrl + ,")
                AppDetailRow(label = "助手发送消息", value = "Ctrl + Enter")
                AppDetailRow(label = "切换操作焦点", value = "Tab / Shift + Tab")
                AppDetailRow(label = "返回或收起键盘", value = "Esc")
                Text(
                    "使用带 ⌘ 键的键盘时，也可以用 ⌘ 代替 Ctrl。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
    AppDialog(
        onDismissRequest = onDismiss,
        icon = if (initialSetup) Icons.Outlined.CheckCircle else Icons.Outlined.Settings,
        title = if (initialSetup) "完成初始配置" else "应用设置",
        subtitle = if (initialSetup) "确认外观、通知与数据同步状态" else "外观、权限与同步集中管理",
        size = if (initialSetup) AppDialogSize.Form else AppDialogSize.Workspace,
        footer = {
            AppDialogPrimaryButton(
                text = if (initialSetup) "完成配置" else "完成",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        if (!initialSetup && useTwoPaneLayout(AppListDetailMinWidth)) {
            AppAdaptivePanes(
                showDetail = true,
                twoPane = true,
                modifier = Modifier.heightIn(max = 560.dp),
                listPane = {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(end = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        sections.forEachIndexed { index, (title, icon) ->
                            AppPanel {
                                AppActionRow(
                                    title = title,
                                    icon = icon,
                                    modifier = Modifier
                                        .background(if (selectedSection == index) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent)
                                        .semantics { selected = selectedSection == index; role = Role.Tab },
                                    onClick = { selectedSection = index },
                                    trailingContent = {
                                        if (selectedSection == index) Icon(Icons.Outlined.CheckCircle, contentDescription = "已选中")
                                    },
                                )
                            }
                        }
                    }
                },
                detailPane = {
                    Column(
                        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) { sectionContent(selectedSection) }
                },
            )
        } else {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                (if (initialSetup) 0..2 else sections.indices).forEach { sectionContent(it) }
            }
        }
    }
}

@Composable
private fun SettingsSectionTitle(icon: ImageVector, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SettingsStatusRow(
    title: String,
    detail: String,
    healthy: Boolean,
    actionLabel: String?,
    onAction: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                if (healthy) Icons.Outlined.CheckCircle else Icons.Outlined.Cancel,
                contentDescription = null,
                tint = if (healthy) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp),
            )
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            actionLabel?.let { label ->
                TextButton(onClick = onAction) { Text(label) }
            }
        }
    }
}
