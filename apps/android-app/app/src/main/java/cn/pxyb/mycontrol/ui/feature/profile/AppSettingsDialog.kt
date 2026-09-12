package cn.pxyb.mycontrol.ui.feature.profile

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AppThemePreference
import cn.pxyb.mycontrol.ui.SectionLoadState
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
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
    AppDialog(
        onDismissRequest = onDismiss,
        icon = if (initialSetup) Icons.Outlined.CheckCircle else Icons.Outlined.Settings,
        title = if (initialSetup) "完成初始配置" else "应用设置",
        subtitle = if (initialSetup) "确认外观、通知与数据同步状态" else "外观、权限与同步集中管理",
        footer = {
            AppDialogPrimaryButton(
                text = if (initialSetup) "完成配置" else "完成",
                onClick = onDismiss,
                modifier = Modifier.fillMaxWidth(),
            )
        },
    ) {
        SettingsSectionTitle(Icons.Outlined.DarkMode, "外观")
        AppSegmentedControl(
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

        SettingsSectionTitle(Icons.Outlined.NotificationsActive, "通知")
        SettingsStatusRow(
            title = "系统通知权限",
            detail = if (notificationsEnabled) "已开启" else "未开启",
            healthy = notificationsEnabled,
            actionLabel = if (notificationsEnabled) null else "去开启",
            onAction = onRequestNotifications,
        )

        SettingsSectionTitle(Icons.Outlined.CloudSync, "数据同步")
        SettingsStatusRow(
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
