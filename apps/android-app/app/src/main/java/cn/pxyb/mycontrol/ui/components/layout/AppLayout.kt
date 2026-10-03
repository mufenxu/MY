package cn.pxyb.mycontrol.ui.components.layout

import androidx.activity.compose.BackHandler
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

internal val LocalAppNavigationHandlesBack = staticCompositionLocalOf { false }

internal val AppPageHorizontalPadding = 16.dp
internal val AppPageTopSpacing = 6.dp
internal val AppPageBottomSpacing = 16.dp
internal val AppPageActionSize = 36.dp
/** 默认页面宽度；工作台、阅读和表单由外壳按用途覆盖。 */
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
internal fun AppTopBarSurface(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(32.dp),
        color = if (isAppInDarkTheme()) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surface,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f)),
        shadowElevation = 1.dp,
    ) {
        Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically, content = content)
    }
}

@Composable
fun AppSecondaryHeader(
    title: String,
    subtitle: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    showBack: Boolean = true,
    actions: (@Composable RowScope.() -> Unit)? = null,
) {
    Column(modifier.fillMaxWidth().padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppTopBarSurface {
            if (showBack) AppHeaderIconButton(
                icon = Icons.AutoMirrored.Outlined.ArrowBack,
                contentDescription = "返回", onClick = onBack,
            ) else Box(Modifier.padding(start = 4.dp, end = 8.dp).size(32.dp)
                .background(MaterialTheme.colorScheme.primary, CircleShape), contentAlignment = Alignment.Center) {
                Text("M", color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Text(title, modifier = Modifier.weight(1f).padding(horizontal = 4.dp).semantics { heading() },
                style = MaterialTheme.typography.titleLarge.copy(fontSize = 19.sp),
                color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Row(verticalAlignment = Alignment.CenterVertically) { actions?.invoke(this) }
        }
        if (showBack && subtitle.isNotBlank() && appContentHeight() >= 360.dp) {
            Text(subtitle, modifier = Modifier.padding(horizontal = 12.dp), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
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
    iconSize: Dp = 22.dp,
    shape: Shape = CircleShape,
    enabled: Boolean = true,
    loading: Boolean = false,
    iconTint: Color = MaterialTheme.colorScheme.onSurface,
    containerColor: Color? = null,
    borderColor: Color? = null,
) {
    val isDark = isAppInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val resolvedBg = containerColor ?: Color.Transparent
    val resolvedBorder = borderColor ?: Color.Transparent

    val interactionSource = remember { MutableInteractionSource() }
    Surface(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        enabled = enabled && !loading,
        interactionSource = interactionSource,
        modifier = modifier
            .minimumInteractiveComponentSize()
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

/** 固定顶部胶囊栏；页面说明与业务内容共用下方滚动区域。 */
@Composable
fun AppSubPage(
    title: String,
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
    subtitle: String = "",
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    listState: LazyListState = rememberLazyListState(),
    showBack: Boolean = true,
    body: (@Composable () -> Unit)? = null,
    header: (@Composable () -> Unit)? = null,
    content: LazyListScope.() -> Unit = {},
) {
    BackHandler(enabled = showBack && !LocalAppNavigationHandlesBack.current, onBack = onBack)
    val dark = isAppInDarkTheme()
    Column(
        modifier = modifier.fillMaxSize().auroraBackdrop(dark),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val contentWidth = Modifier.widthIn(max = LocalAppContentMaxWidth.current).fillMaxWidth()
        Box(contentWidth.padding(start = AppPageHorizontalPadding, end = AppPageHorizontalPadding,
            top = contentPadding.calculateTopPadding() + AppPageTopSpacing, bottom = 4.dp)) {
            if (header != null) header() else AppSecondaryHeader(
                title = title, subtitle = "", onBack = onBack, actions = actions, showBack = showBack,
            )
        }
        Box(Modifier.weight(1f).then(contentWidth)) {
            if (body != null) {
                ProvideAppContentLayout(
                    modifier = Modifier.fillMaxSize()
                        .padding(bottom = contentPadding.calculateBottomPadding() + AppPageBottomSpacing),
                ) { body() }
            } else PullToRefresh(
                isRefreshing = refreshing,
                onRefresh = onRefresh,
                enabled = onRefresh != null,
                atTop = { listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0 },
            ) {
                LazyColumn(
                    state = listState, modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = AppPageHorizontalPadding, end = AppPageHorizontalPadding,
                        top = 4.dp, bottom = contentPadding.calculateBottomPadding() + AppPageBottomSpacing),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (subtitle.isNotBlank()) item(key = "app-page-description", contentType = "description") {
                        Text(subtitle, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    content()
                }
            }
        }
    }
}
