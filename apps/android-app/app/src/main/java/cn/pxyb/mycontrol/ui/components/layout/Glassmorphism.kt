package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

// ------------------------------------------------------------------------------------------------
// 毛玻璃拟态（Glassmorphism）共享组件
// 当前方案使用实色表面与发丝描边，不添加深色投影。
// ------------------------------------------------------------------------------------------------

/** 共享面板配色与形状。 */
@Immutable
data class GlassPalette(
    val base: Color,
    val highlight: Brush,
    val border: Color,
    val shape: RoundedCornerShape,
)

@Composable
fun rememberGlassPalette(radius: Dp = 20.dp): GlassPalette {
    val dark = isAppInDarkTheme()
    val surface = MaterialTheme.colorScheme.surface
    return remember(dark, surface, radius) {
        val highlightColor = Color.Transparent
        GlassPalette(
            base = surface,
            highlight = Brush.verticalGradient(
                colorStops = arrayOf(
                    0.0f to highlightColor,
                    0.5f to highlightColor.copy(alpha = 0f),
                    1.0f to Color.Transparent,
                ),
            ),
            border = if (dark) Color.White.copy(alpha = 0.16f) else Color.White.copy(alpha = 0.5f),
            shape = RoundedCornerShape(radius),
        )
    }
}

/** 卡片沿用主题表面色。 */
@Composable
fun glassCardColor(): Color {
    return MaterialTheme.colorScheme.surface
}

/** 应用共享面板配色与描边。 */
fun Modifier.glassPanel(palette: GlassPalette, borderColor: Color = palette.border): Modifier = this
    .background(palette.base, palette.shape)
    .background(palette.highlight, palette.shape)
    .border(1.dp, borderColor, palette.shape)

/** 页面底色由主题统一提供；保留现有调用参数。 */
fun Modifier.auroraBackdrop(dark: Boolean): Modifier = composed {
    this.background(MaterialTheme.colorScheme.background)
}

/**
 * 为毛玻璃组件增加优雅微光扫过（Shimmer）动效。
 * 严格契合极光毛玻璃语言：使用半透明高光渐变带在卡片轮廓上平滑掠过，暗色与亮色自适应。
 */
fun Modifier.glassShimmer(dark: Boolean): Modifier = this.composed {
    val transition = rememberInfiniteTransition(label = "glassShimmerTransition")
    val progress by transition.animateFloat(
        initialValue = -1f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1350, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "glassShimmerProgress",
    )

    val baseAlpha = if (dark) 0.03f else 0.08f
    val highlightAlpha = if (dark) 0.16f else 0.28f
    val highlightColor = if (dark) Color(0xFF93C5FD) else Color.White

    drawWithCache {
        val width = size.width
        val height = size.height
        val shimmerBrush = Brush.linearGradient(
            colorStops = arrayOf(
                0.0f to highlightColor.copy(alpha = baseAlpha),
                0.5f to highlightColor.copy(alpha = highlightAlpha),
                1.0f to highlightColor.copy(alpha = baseAlpha),
            ),
            start = Offset.Zero,
            end = Offset(width * 0.7f, height),
        )

        onDrawBehind {
            val xOffset = progress * width
            clipRect {
                translate(left = xOffset) {
                    drawRect(brush = shimmerBrush, topLeft = Offset(-xOffset, 0f), size = size)
                }
            }
        }
    }
}
