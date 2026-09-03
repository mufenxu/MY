package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.theme.AppHaptics

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
    val haptics = LocalHapticFeedback.current
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

/**
 * 标准二级页面脚手架 (AppSubPage)
 *
 * 统一承载所有二级页面的通用布局规范：
 * 1. 自动处理系统返回键与 BackHandler；
 * 2. 自动根据平板/折叠屏/手机注入最大内容宽度 AppTabletContentMaxWidth (1120dp) 并居中；
 * 3. 统一绘制带 drawWithCache 缓存的极光背景 (auroraBackdrop)；
 * 4. 统一处理页面安全区与 appPageContentPadding；
 * 5. 支持 pinHeader：
 *    - pinHeader = false（默认）：二级页头作为列表第一个 item 随内容滚动（适合短卡片/配置页）；
 *    - pinHeader = true：二级页头吸顶固定，下方内容滚动时透出毛玻璃质感（适合长列表/搜索结果/审计日志）；
 * 6. 可选集成 PullToRefresh 下拉刷新机制；
 * 7. 严格遵循 12.dp 垂直间距标准。
 */
@Composable
fun AppSubPage(
    title: String,
    onBack: () -> Unit,
    contentPadding: PaddingValues,
    modifier: Modifier = Modifier,
    subtitle: String = "",
    pinHeader: Boolean = false,
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable RowScope.() -> Unit)? = null,
    listState: LazyListState = rememberLazyListState(),
    content: LazyListScope.() -> Unit,
) {
    BackHandler(onBack = onBack)
    val dark = isSystemInDarkTheme()

    PullToRefresh(
        isRefreshing = refreshing,
        onRefresh = onRefresh,
        enabled = onRefresh != null,
        atTop = {
            listState.firstVisibleItemIndex == 0 &&
                listState.firstVisibleItemScrollOffset == 0
        },
    ) {
        Box(
            modifier = modifier
                .fillMaxSize()
                .auroraBackdrop(dark),
            contentAlignment = Alignment.TopCenter,
        ) {
            val contentMaxWidthModifier = Modifier
                .widthIn(max = AppTabletContentMaxWidth)
                .fillMaxWidth()

            if (pinHeader) {
                // 吸顶模式：页头固定于顶部，下方为 LazyColumn
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .then(contentMaxWidthModifier)
                        .padding(
                            top = contentPadding.calculateTopPadding() + AppPageTopSpacing,
                        ),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = AppPageHorizontalPadding)
                            .padding(bottom = 8.dp),
                    ) {
                        AppSecondaryHeader(
                            title = title,
                            subtitle = subtitle,
                            onBack = onBack,
                            actions = actions,
                        )
                    }
                    LazyColumn(
                        state = listState,
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                        contentPadding = PaddingValues(
                            start = AppPageHorizontalPadding,
                            end = AppPageHorizontalPadding,
                            bottom = contentPadding.calculateBottomPadding() + AppPageBottomSpacing,
                        ),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        content()
                    }
                }
            } else {
                // 随动模式：页头作为 LazyColumn 的第一个 item
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .then(contentMaxWidthModifier),
                    contentPadding = appPageContentPadding(contentPadding),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    item(key = "app-subpage-header", contentType = "header") {
                        AppSecondaryHeader(
                            title = title,
                            subtitle = subtitle,
                            onBack = onBack,
                            actions = actions,
                        )
                    }
                    content()
                }
            }
        }
    }
}

