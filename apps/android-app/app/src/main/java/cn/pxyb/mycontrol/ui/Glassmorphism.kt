package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
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
    val dark = isSystemInDarkTheme()
    val highlightColor = if (dark) Color.White.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.2f)
    return GlassPalette(
        base = MaterialTheme.colorScheme.surface.copy(alpha = if (dark) 0.5f else 0.35f),
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

/** 卡片底色：半透明磨砂白，让极光背景透出一层淡彩（与白色纯卡形成统一质感） */
@Composable
fun glassCardColor(): Color {
    val dark = isSystemInDarkTheme()
    return MaterialTheme.colorScheme.surface.copy(alpha = if (dark) 0.5f else 0.55f)
}

/** 将组件渲染为毛玻璃面板：半透明底色 + 顶部高光 + 发丝描边 */
fun Modifier.glassPanel(palette: GlassPalette): Modifier = this
    .background(palette.base, palette.shape)
    .background(palette.highlight, palette.shape)
    .border(1.dp, palette.border, palette.shape)

/** 页面底层极光光斑背景（固定不随内容滚动），为玻璃面板提供可透出的色彩 */
fun Modifier.auroraBackdrop(dark: Boolean): Modifier = this.drawBehind { drawAurora(dark) }

fun DrawScope.drawAurora(dark: Boolean) {
    val blobAlpha = if (dark) 0.30f else 0.26f
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