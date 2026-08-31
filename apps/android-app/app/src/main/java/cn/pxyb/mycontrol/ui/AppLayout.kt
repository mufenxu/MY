package cn.pxyb.mycontrol.ui

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

internal val AppPageHorizontalPadding = 16.dp
internal val AppPageTopSpacing = 6.dp
internal val AppPageBottomSpacing = 16.dp
internal val AppPageActionSize = 36.dp
/** 平板 / 大屏二级页面内容最大宽度：避免超宽屏上单列内容过度拉伸 */
internal val AppTabletContentMaxWidth = 1120.dp

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
    isTablet: Boolean = false,
): AuthenticatedShellInsets = AuthenticatedShellInsets(
    navigationTop = safeTop,
    navigationStart = safeStart,
    navigationEnd = safeEnd,
    contentBottom = safeBottom + if (isTablet || isSubScreen) 16.dp else 90.dp,
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
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    val glass = rememberGlassPalette(radius = 16.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 40.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AppHeaderIconButton(
            icon = Icons.AutoMirrored.Outlined.ArrowBack,
            contentDescription = "返回",
            onClick = onBack,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.5.sp,
                ),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (subtitle.isNotBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.5.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                actions?.invoke(this)
            }
        }
    }
}

@Composable
fun AppHeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = AppPageActionSize,
    iconSize: Dp = 18.dp,
    shape: RoundedCornerShape = RoundedCornerShape(10.dp),
    enabled: Boolean = true,
    loading: Boolean = false,
    iconTint: Color = MaterialTheme.colorScheme.onSurface,
    containerColor: Color? = null,
    borderColor: Color? = null,
) {
    val isDark = isSystemInDarkTheme()
    val resolvedBg = containerColor ?: if (isDark) {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.40f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    }
    val resolvedBorder = borderColor ?: if (isDark) {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.22f)
    } else {
        MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.30f)
    }

    val interactionSource = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        enabled = enabled && !loading,
        interactionSource = interactionSource,
        modifier = modifier
            .size(size)
            .pressFeedback(interactionSource, pressedScale = 0.92f),
        shape = shape,
        color = resolvedBg,
        border = BorderStroke(0.6.dp, resolvedBorder),
        shadowElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Crossfade(targetState = loading, animationSpec = tween(160), label = "header-action") { busy ->
                if (busy) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.primary,
                    )
                } else {
                    Icon(
                        icon,
                        contentDescription = contentDescription,
                        tint = iconTint,
                        modifier = Modifier.size(iconSize),
                    )
                }
            }
        }
    }
}
