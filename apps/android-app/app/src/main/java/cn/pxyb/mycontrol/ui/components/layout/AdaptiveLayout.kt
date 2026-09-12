package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * 窗口宽度尺寸类别（遵循 Android & Material 3 官方自适应规范）
 */
enum class WindowWidthSizeClass {
    /** 紧凑宽度 (< 600dp)：手机竖屏、小折叠外屏、分屏窄窗 */
    Compact,

    /** 中等宽度 (600dp ~ 839dp)：大折叠内屏、小平板、平板半屏分屏 */
    Medium,

    /** 展开宽度 (>= 840dp)：主流 10~14 英寸平板横屏与全屏、桌面环境 */
    Expanded,
}

/**
 * 窗口高度尺寸类别
 */
enum class WindowHeightSizeClass {
    Compact,
    Medium,
    Expanded,
}

@Immutable
data class AdaptiveWindowInfo(
    val widthSizeClass: WindowWidthSizeClass,
    val heightSizeClass: WindowHeightSizeClass,
    val windowWidth: Dp,
    val windowHeight: Dp,
) {
    val isTabletOrExpanded: Boolean
        get() = widthSizeClass != WindowWidthSizeClass.Compact

    val isExpanded: Boolean
        get() = widthSizeClass == WindowWidthSizeClass.Expanded

    val isMedium: Boolean
        get() = widthSizeClass == WindowWidthSizeClass.Medium

    val isCompact: Boolean
        get() = widthSizeClass == WindowWidthSizeClass.Compact
}

val LocalAdaptiveWindow = compositionLocalOf {
    AdaptiveWindowInfo(
        widthSizeClass = WindowWidthSizeClass.Compact,
        heightSizeClass = WindowHeightSizeClass.Medium,
        windowWidth = 360.dp,
        windowHeight = 800.dp,
    )
}

internal val LocalAppContentWidth = compositionLocalOf<Dp?> { null }

@Composable
internal fun appContentWidth(): Dp =
    LocalAppContentWidth.current ?: LocalAdaptiveWindow.current.windowWidth

@Composable
internal fun useTwoPaneLayout(): Boolean =
    appContentWidth() >= 840.dp * LocalDensity.current.fontScale.coerceAtLeast(1f)

@Composable
internal fun ProvideAppContentLayout(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    // 页面按扣除侧栏、安全区和最大宽度后的空间布局，弹窗仍使用完整窗口尺寸。
    BoxWithConstraints(modifier = modifier) {
        CompositionLocalProvider(LocalAppContentWidth provides maxWidth) {
            content()
        }
    }
}

internal fun computeWidthSizeClass(width: Dp): WindowWidthSizeClass = when {
    width < 600.dp -> WindowWidthSizeClass.Compact
    width < 840.dp -> WindowWidthSizeClass.Medium
    else -> WindowWidthSizeClass.Expanded
}

internal fun computeHeightSizeClass(height: Dp): WindowHeightSizeClass = when {
    height < 480.dp -> WindowHeightSizeClass.Compact
    height < 900.dp -> WindowHeightSizeClass.Medium
    else -> WindowHeightSizeClass.Expanded
}

/**
 * 注入自适应窗口尺寸上下文容器
 */
@Composable
fun ProvideAdaptiveWindowContext(
    content: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val adaptiveInfo = remember(maxWidth, maxHeight) {
            AdaptiveWindowInfo(
                widthSizeClass = computeWidthSizeClass(maxWidth),
                heightSizeClass = computeHeightSizeClass(maxHeight),
                windowWidth = maxWidth,
                windowHeight = maxHeight,
            )
        }
        CompositionLocalProvider(LocalAdaptiveWindow provides adaptiveInfo) {
            content()
        }
    }
}
