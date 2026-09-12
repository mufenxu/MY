package cn.pxyb.mycontrol.ui.feature.account

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Laptop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.SecuritySession
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppInlineDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.feature.profile.ProfileUiState
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.util.DateTimeUtils.formatPlatformTime

@Composable
fun LoginSessionsScreen(
    state: ProfileUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRevokeSession: (String) -> Unit,
    onRevokeOtherSessions: () -> Unit,
    onCreateDesktopMagicLink: ((String?, String?) -> Unit) -> Unit,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val security = state.security
    var revokeTarget by remember { mutableStateOf<SecuritySession?>(null) }
    var loginUrl by remember { mutableStateOf<String?>(null) }
    val rawVisibleSessions = security?.sessions?.filterNot { it.sessionKind == "embedded_web" }
    val identifiedNativeFallbackKeys = rawVisibleSessions
        ?.filter { it.sessionKind == "native_app" && !it.deviceId.isNullOrBlank() }
        ?.mapTo(mutableSetOf()) { "${it.subject}|${it.userAgent}|${it.ip}" }
        .orEmpty()
    val visibleSessions = rawVisibleSessions
        ?.filterNot {
            it.sessionKind == "native_app"
                && it.deviceId.isNullOrBlank()
                && "${it.subject}|${it.userAgent}|${it.ip}" in identifiedNativeFallbackKeys
        }
        ?.groupBy { session ->
            when {
                session.sessionKind != "native_app" -> session.nonce
                !session.deviceId.isNullOrBlank() -> "${session.subject}|${session.deviceId}"
                else -> "${session.subject}|${session.userAgent}|${session.ip}"
            }
        }
        ?.values
        ?.map { group -> group.firstOrNull { it.current } ?: group.first() }
    val otherSessions = visibleSessions.orEmpty().count { !it.current }
    AppSubPage(
        title = "登录设备与会话",
        subtitle = "管理已登录的设备和浏览器",
        contentPadding = contentPadding,
        onBack = onBack,
        pinHeader = true,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
    ) {
        state.sectionError?.let { message -> item(key = "sessions-error") { AppFeedbackBanner(message, error = true, onRetry = onRefresh) } }
        item(key = "desktop-login") {
            AppPanel {
                AppActionRow(
                    title = "电脑端快捷免密登录",
                    subtitle = "生成单次使用、5 分钟内有效的登录链接",
                    icon = Icons.Outlined.Laptop,
                    enabled = state.busyAction != "desktop-magic-link",
                    onClick = {
                        onCreateDesktopMagicLink { url, error ->
                            if (url != null) loginUrl = url
                            else if (error != null) Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
                        }
                    },
                )
            }
        }
        item(key = "sessions-title") { AppSectionHeader(title = "已登录设备", subtitle = "${visibleSessions.orEmpty().size} 个登录会话") }
        if (security == null && state.refreshing) {
            item(key = "sessions-loading") { GlassShimmerList(itemCount = 2, itemHeight = 76.dp) }
        } else if (visibleSessions.isNullOrEmpty()) {
            item(key = "sessions-empty") { AppEmptyState("暂无活动会话", detail = "下拉刷新可重新获取登录设备。") }
        } else {
            items(visibleSessions, key = SecuritySession::nonce) { session ->
                AppPanel { SessionRow(session, state.busyAction == "session") { revokeTarget = session } }
            }
        }
        if (otherSessions > 0) {
            item(key = "revoke-other-sessions") {
                AppSecondaryButton("退出我的其他设备", onRevokeOtherSessions, enabled = state.busyAction != "session", modifier = Modifier.fillMaxWidth())
            }
        }
    }
    revokeTarget?.let { session ->
        AppConfirmDialog(
            title = if (session.current) "退出当前设备？" else "撤销登录会话？",
            detail = "${sessionTitle(session)} · ${session.ip}\n该设备将需要重新登录。",
            confirmLabel = if (session.current) "退出登录" else "确认撤销",
            onDismiss = { revokeTarget = null },
            onConfirm = { revokeTarget = null; onRevokeSession(session.nonce) },
            icon = Icons.Outlined.Devices,
            danger = true,
        )
    }
    loginUrl?.let { url ->
        AppDialog(
            title = "电脑端快捷免密登录",
            subtitle = "单次使用 · 5 分钟内有效",
            icon = Icons.Outlined.Laptop,
            onDismissRequest = { loginUrl = null },
            footer = {
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppDialogSecondaryButton("关闭", { loginUrl = null }, Modifier.weight(1f))
                    AppDialogPrimaryButton("复制链接", {
                        clipboard.setText(AnnotatedString(url))
                        Toast.makeText(context, "已复制登录链接", Toast.LENGTH_SHORT).show()
                        loginUrl = null
                    }, Modifier.weight(1f))
                }
            },
        ) {
            Text(url, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun SessionRow(session: SecuritySession, busy: Boolean, onRevoke: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            color = if (session.current) {
                MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            } else {
                MaterialTheme.colorScheme.surfaceVariant
            },
            shape = RoundedCornerShape(12.dp),
            border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
        ) {
            Icon(
                Icons.Outlined.Devices,
                contentDescription = null,
                tint = if (session.current) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant
                },
                modifier = Modifier.padding(9.dp).size(20.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                Text(
                    sessionTitle(session),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (session.current) AppStatusBadge("healthy", "当前设备")
            }
            Text(
                "${session.ip} · ${formatPlatformTime(session.lastSeenAt)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        AppInlineDangerButton(
            text = if (session.current) "退出" else "撤销",
            onClick = onRevoke,
            enabled = !busy,
        )
    }
}

private fun deviceLabel(userAgent: String): String = when {
    userAgent.contains("MY-Control-Android", ignoreCase = true) -> "MY Control Android"
    userAgent.contains("Android", ignoreCase = true) -> "Android 设备"
    userAgent.contains("iPhone", ignoreCase = true) -> "iPhone"
    userAgent.contains("Chrome", ignoreCase = true) -> "Chrome 浏览器"
    userAgent.contains("Edge", ignoreCase = true) -> "Edge 浏览器"
    else -> userAgent.take(32).ifBlank { "未知设备" }
}

private fun sessionTitle(session: SecuritySession): String =
    session.deviceName.trim().ifBlank { deviceLabel(session.userAgent) }
