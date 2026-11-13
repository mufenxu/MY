package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/** 短提示按内容收紧，长文本在有限宽度内换行，避免撑满屏幕。 */
@Composable
fun AppToast(
    message: String,
    error: Boolean,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
    onDismiss: (() -> Unit)? = null,
) {
    val hasActions = onRetry != null || onDismiss != null
    val dark = isAppInDarkTheme()
    val colors = MaterialTheme.colorScheme
    val accentColor = when {
        error -> colors.error
        dark -> colors.secondary
        else -> Forest
    }
    Surface(
        modifier = modifier.widthIn(max = 360.dp),
        shape = RoundedCornerShape(24.dp),
        color = colors.surface,
        contentColor = colors.onSurface,
        tonalElevation = 0.dp,
        shadowElevation = 0.dp,
        border = BorderStroke(1.dp, colors.outlineVariant.copy(alpha = 0.7f)),
    ) {
        Row(
            modifier = Modifier
                .heightIn(min = 48.dp)
                // 带操作时由 48dp 按钮热区撑开高度，收紧外侧留白避免提示过高。
                .padding(
                    start = 16.dp,
                    end = if (hasActions) 4.dp else 16.dp,
                    top = if (hasActions) 4.dp else 12.dp,
                    bottom = if (hasActions) 4.dp else 12.dp,
                ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = accentColor,
                modifier = Modifier.size(20.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = if (error) Icons.Outlined.Close else Icons.Rounded.Check,
                        contentDescription = null,
                        tint = if (error) colors.onError else colors.onSecondary,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                modifier = Modifier.weight(1f, fill = false),
            )
            if (onRetry != null) {
                TextButton(onClick = onRetry) { Text("重试") }
            }
            if (onDismiss != null) {
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Outlined.Close,
                        contentDescription = "关闭提示",
                        tint = colors.onSurfaceVariant,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}
