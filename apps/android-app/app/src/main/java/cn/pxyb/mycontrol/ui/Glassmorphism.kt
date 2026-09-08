package cn.pxyb.mycontrol.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.composed
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// ------------------------------------------------------------------------------------------------
// 毛玻璃拟态（Glassmorphism）共享组件
// 注意：玻璃面板一律不加深投影（会产生灰色晕边）；靠发丝描边与顶部高光区分层次。
// ------------------------------------------------------------------------------------------------

/** 毛玻璃面板配色：半透明底色 + 顶部高光渐变 + 发丝描边 */
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
        val highlightColor = if (dark) Color.White.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.2f)
        GlassPalette(
            base = surface.copy(alpha = if (dark) 0.76f else 0.72f),
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

/** 卡片底色：半透明磨砂白，让极光背景透出一层淡彩（与白色纯卡形成统一质感） */
@Composable
fun glassCardColor(): Color {
    val dark = isAppInDarkTheme()
    return MaterialTheme.colorScheme.surface.copy(alpha = if (dark) 0.76f else 0.82f)
}

/** 将组件渲染为毛玻璃面板：半透明底色 + 顶部高光 + 发丝描边 */
fun Modifier.glassPanel(palette: GlassPalette): Modifier = this
    .background(palette.base, palette.shape)
    .background(palette.highlight, palette.shape)
    .border(1.dp, palette.border, palette.shape)

/** 页面底层极光光斑背景（固定不随内容滚动），为玻璃面板提供可透出的色彩。已采用 drawWithCache 缓存渐变着色器避免滚动掉帧 */
fun Modifier.auroraBackdrop(dark: Boolean): Modifier = this.drawWithCache {
    val blobAlpha = if (dark) 0.18f else 0.20f
    val c1 = if (dark) Color(0xFF3B82F6) else Color(0xFF60A5FA)
    val c2 = if (dark) Color(0xFF8B5CF6) else Color(0xFFA78BFA)
    val c3 = if (dark) Color(0xFF14B8A6) else Color(0xFF5EEAD4)

    val r1 = 230.dp.toPx()
    val r2 = 260.dp.toPx()
    val r3 = 210.dp.toPx()

    val center1 = Offset(size.width * 0.9f, size.height * 0.08f)
    val center2 = Offset(size.width * 0.12f, size.height * 0.18f)
    val center3 = Offset(size.width * 0.88f, size.height * 0.55f)

    val brush1 = Brush.radialGradient(listOf(c1.copy(alpha = blobAlpha), Color.Transparent), center1, r1)
    val brush2 = Brush.radialGradient(listOf(c2.copy(alpha = blobAlpha - 0.04f), Color.Transparent), center2, r2)
    val brush3 = Brush.radialGradient(listOf(c3.copy(alpha = blobAlpha - 0.09f), Color.Transparent), center3, r3)

    onDrawBehind {
        drawCircle(brush = brush1, radius = r1, center = center1)
        drawCircle(brush = brush2, radius = r2, center = center2)
        drawCircle(brush = brush3, radius = r3, center = center3)
    }
}

fun DrawScope.drawAurora(dark: Boolean) {
    val blobAlpha = if (dark) 0.18f else 0.20f
    drawAuroraBlob(
        color = if (dark) Color(0xFF3B82F6) else Color(0xFF60A5FA),
        alpha = blobAlpha,
        center = Offset(size.width * 0.9f, size.height * 0.08f),
        radius = 230.dp,
    )
    drawAuroraBlob(
        color = if (dark) Color(0xFF8B5CF6) else Color(0xFFA78BFA),
        alpha = blobAlpha - 0.04f,
        center = Offset(size.width * 0.12f, size.height * 0.18f),
        radius = 260.dp,
    )
    drawAuroraBlob(
        color = if (dark) Color(0xFF14B8A6) else Color(0xFF5EEAD4),
        alpha = blobAlpha - 0.09f,
        center = Offset(size.width * 0.88f, size.height * 0.55f),
        radius = 210.dp,
    )
}

private fun DrawScope.drawAuroraBlob(color: Color, alpha: Float, center: Offset, radius: Dp) {
    val radiusPx = radius.toPx()
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(color.copy(alpha = alpha), Color.Transparent),
            center = center,
            radius = radiusPx,
        ),
        radius = radiusPx,
        center = center,
    )
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
