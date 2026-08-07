package cn.pxyb.mycontrol.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal val AppPageHorizontalPadding = 16.dp
internal val AppPageTopSpacing = 8.dp
internal val AppPageBottomSpacing = 16.dp
internal val AppPageActionSize = 42.dp

internal data class AuthenticatedShellInsets(
    val navigationTop: Dp,
    val navigationStart: Dp,
    val navigationEnd: Dp,
    val contentBottom: Dp,
)

internal fun resolveAuthenticatedShellInsets(
    safeTop: Dp,
    safeStart: Dp,
    safeEnd: Dp,
    safeBottom: Dp,
    isSubScreen: Boolean,
): AuthenticatedShellInsets = AuthenticatedShellInsets(
    navigationTop = safeTop,
    navigationStart = safeStart,
    navigationEnd = safeEnd,
    contentBottom = safeBottom + if (isSubScreen) 16.dp else 90.dp,
)

internal fun appPageContentPadding(
    contentPadding: PaddingValues,
    topSpacing: Dp = AppPageTopSpacing,
    bottomSpacing: Dp = AppPageBottomSpacing,
): PaddingValues = PaddingValues(
    start = AppPageHorizontalPadding,
    end = AppPageHorizontalPadding,
    top = contentPadding.calculateTopPadding() + topSpacing,
    bottom = contentPadding.calculateBottomPadding() + bottomSpacing,
)

@Composable
fun AppSecondaryHeader(
    title: String,
    subtitle: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AppHeaderIconButton(
            icon = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = "返回",
            onClick = onBack,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (onRefresh != null) {
                AppHeaderIconButton(
                    icon = Icons.Outlined.Refresh,
                    contentDescription = "刷新",
                    onClick = onRefresh,
                    enabled = !refreshing,
                    loading = refreshing,
                )
            }
            actions?.invoke(this)
        }
    }
}

@Composable
fun AppHeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    Surface(
        modifier = modifier,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        IconButton(
            onClick = onClick,
            enabled = enabled,
            modifier = Modifier.size(AppPageActionSize),
        ) {
            Crossfade(targetState = loading, animationSpec = tween(160), label = "header-action") { busy ->
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Icon(icon, contentDescription = contentDescription, modifier = Modifier.size(21.dp))
                }
            }
        }
    }
}
