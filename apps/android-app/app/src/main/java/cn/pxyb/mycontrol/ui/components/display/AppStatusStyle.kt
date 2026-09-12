package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.background
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector

@Immutable
data class StatusStyle(
    val label: String,
    val foreground: Color,
    val background: Color,
    val icon: ImageVector,
)

@Composable
fun statusStyle(status: String): StatusStyle = statusStyle(when (status.lowercase()) {
    "healthy", "operational", "succeeded", "success", "passed", "resolved", "connected", "online" ->
        AppStatusSemantic.Success
    "critical", "failed", "failure", "offline", "outage", "error", "breached" ->
        AppStatusSemantic.Error
    "warning", "degraded", "action_required", "overdue", "unhealthy" ->
        AppStatusSemantic.Warning
    "running", "pending", "queued", "acknowledged", "in_progress" ->
        AppStatusSemantic.Info
    else -> AppStatusSemantic.Neutral
})

@Composable
internal fun statusStyle(semantic: AppStatusSemantic): StatusStyle = when (semantic) {
    AppStatusSemantic.Success ->
        StatusStyle(
            "正常",
            MaterialTheme.colorScheme.secondary,
            MaterialTheme.colorScheme.secondaryContainer,
            Icons.Outlined.CheckCircle,
        )
    AppStatusSemantic.Error ->
        StatusStyle(
            "异常",
            MaterialTheme.colorScheme.error,
            MaterialTheme.colorScheme.errorContainer,
            Icons.Outlined.ErrorOutline,
        )
    AppStatusSemantic.Warning ->
        StatusStyle(
            "需关注",
            MaterialTheme.colorScheme.tertiary,
            MaterialTheme.colorScheme.tertiaryContainer,
            Icons.Outlined.WarningAmber,
        )
    AppStatusSemantic.Info ->
        StatusStyle(
            "处理中",
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.primaryContainer,
            Icons.Outlined.Schedule,
        )
    AppStatusSemantic.Neutral -> StatusStyle("未确认", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant, Icons.Outlined.Schedule)
}
