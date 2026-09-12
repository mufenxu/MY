package cn.pxyb.mycontrol.ui.startup

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.formatBytes
import cn.pxyb.mycontrol.update.AppUpdatePhase
import cn.pxyb.mycontrol.update.AppUpdateUiState

@Composable
internal fun StartupAppUpdateDialog(
    state: AppUpdateUiState,
    onDownloadAndInstall: () -> Unit,
    onInstallDownloaded: () -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    val notes = state.info?.notes?.trim().orEmpty().ifBlank { "包含新的功能与稳定性改进。" }

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.SystemUpdate,
        title = "发现新版本",
        subtitle = "v${state.info?.versionName.orEmpty()} · ${formatBytes(state.info?.apkSize ?: 0L)}",
        content = {
            Column {
                Text(
                    notes,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                when (state.phase) {
                    AppUpdatePhase.Downloading -> {
                        Spacer(Modifier.height(14.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp,
                            )
                            Spacer(Modifier.width(10.dp))
                            Text(
                                "正在下载 ${state.progress}%，完成后将打开系统安装器",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    AppUpdatePhase.InstallPermissionRequired -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            "需要允许此来源安装应用。请在系统设置中开启权限，返回后继续安装。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppUpdatePhase.Installing -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            "系统安装器已打开，请按系统提示完成更新安装。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    AppUpdatePhase.Error -> {
                        Spacer(Modifier.height(14.dp))
                        Text(
                            state.error ?: "更新检查或安装未完成，请稍后重试。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    else -> Unit
                }
            }
        },
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = if (state.phase in setOf(AppUpdatePhase.Downloading, AppUpdatePhase.Installing)) "后台继续" else "稍后再说",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = when (state.phase) {
                        AppUpdatePhase.Downloading -> "下载中 ${state.progress}%"
                        AppUpdatePhase.ReadyToInstall -> "打开安装器"
                        AppUpdatePhase.InstallPermissionRequired -> "继续安装"
                        AppUpdatePhase.Installing -> "等待安装"
                        AppUpdatePhase.Error -> "重新检查"
                        else -> "立即更新"
                    },
                    onClick = when (state.phase) {
                        AppUpdatePhase.Available -> onDownloadAndInstall
                        AppUpdatePhase.ReadyToInstall -> onInstallDownloaded
                        AppUpdatePhase.InstallPermissionRequired -> onInstallDownloaded
                        AppUpdatePhase.Error -> onRetry
                        else -> onDismiss
                    },
                    modifier = Modifier.weight(1f),
                    enabled = state.phase !in setOf(AppUpdatePhase.Downloading, AppUpdatePhase.Installing),
                    busy = state.phase == AppUpdatePhase.Downloading,
                )
            }
        },
    )
}
