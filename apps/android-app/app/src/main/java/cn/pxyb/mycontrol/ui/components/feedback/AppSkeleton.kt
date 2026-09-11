package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.glassCardColor
import cn.pxyb.mycontrol.ui.glassShimmer
import cn.pxyb.mycontrol.ui.theme.BrandCyan
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

// ------------------------------------------------------------------------------------------------
// 统一骨架屏与加载指示器组件（Loading & Skeleton Toolkit）
//
// 设计约束（对齐 apps/android-app/AGENTS.md 第 7 节「加载与网络容错规范」）：
// 1. 首屏与长列表异步加载一律使用骨架屏预占位，禁止使用突兀的居中大菊花；
// 2. 微光扫过统一走 Modifier.glassShimmer(dark)，深浅色自适应，禁止生硬白光；
// 3. 占位块跟随毛玻璃卡片语言：20.dp 圆角、发丝描边、0 阴影；
// 4. 同一组骨架共享一条呼吸脉冲动画，避免逐块各起动画拖慢首帧。
// ------------------------------------------------------------------------------------------------

/** 骨架屏统一呼吸脉冲：同组占位共享同一条动画，避免每个占位块各自起一条无限动画。 */
@Composable
fun rememberSkeletonPulse(
    minAlpha: Float = 0.34f,
    maxAlpha: Float = 0.86f,
    durationMillis: Int = 880,
    label: String = "app-skeleton-pulse",
): Float {
    val transition = rememberInfiniteTransition(label = label)
    val pulse by transition.animateFloat(
        initialValue = minAlpha,
        targetValue = maxAlpha,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = durationMillis, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = label,
    )
    return pulse
}

/** 骨架占位块：呼吸底色 + 毛玻璃微光扫过，可自由指定尺寸与圆角。 */
@Composable
fun AppSkeletonBlock(
    pulse: Float,
    modifier: Modifier = Modifier,
    corner: Dp = 10.dp,
    shimmer: Boolean = true,
) {
    val dark = isAppInDarkTheme()
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(corner))
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.16f * pulse))
            .then(if (shimmer) Modifier.glassShimmer(dark) else Modifier),
    )
}

/** 文本行占位：按父容器宽度比例撑开，用于模拟标题与副标题。 */
@Composable
fun AppSkeletonLine(
    pulse: Float,
    modifier: Modifier = Modifier,
    widthFraction: Float = 0.6f,
    height: Dp = 10.dp,
    corner: Dp = 5.dp,
    shimmer: Boolean = true,
) {
    AppSkeletonBlock(
        pulse = pulse,
        modifier = modifier
            .fillMaxWidth(widthFraction)
            .height(height),
        corner = corner,
        shimmer = shimmer,
    )
}

/** 骨架列表行：左侧圆形/圆角图标 + 右侧多行文案，结构与 AppListCard 同构。 */
@Composable
fun AppSkeletonRow(
    pulse: Float,
    modifier: Modifier = Modifier,
    leadingSize: Dp = 38.dp,
    lineWidths: List<Float> = listOf(0.68f, 0.42f),
) {
    val dark = isAppInDarkTheme()
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .glassShimmer(dark),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppSkeletonBlock(
                pulse = pulse,
                modifier = Modifier.size(leadingSize),
                corner = leadingSize / 2,
                shimmer = false,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                lineWidths.forEach { fraction ->
                    AppSkeletonLine(pulse = pulse, widthFraction = fraction, shimmer = false)
                }
            }
        }
    }
}

/** 卡片式骨架列表：适用于二级页面首次拉取长列表（12.dp 标准行距）。 */
@Composable
fun AppSkeletonList(
    rowCount: Int = 3,
    modifier: Modifier = Modifier,
    leadingSize: Dp = 38.dp,
    lineWidths: List<Float> = listOf(0.68f, 0.42f),
) {
    val pulse = rememberSkeletonPulse()
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(rowCount) {
            AppSkeletonRow(
                pulse = pulse,
                leadingSize = leadingSize,
                lineWidths = lineWidths,
            )
        }
    }
}

/** 内联骨架行：无卡片外壳，嵌入 AppPanel / AppDialog 等容器内部使用。 */
@Composable
fun AppSkeletonInlineRows(
    rowCount: Int = 3,
    modifier: Modifier = Modifier,
    leadingSize: Dp = 32.dp,
    leadingCorner: Dp? = null,
    lineWidths: List<Float> = listOf(0.6f, 0.34f),
) {
    val dark = isAppInDarkTheme()
    val pulse = rememberSkeletonPulse()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .glassShimmer(dark),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(rowCount) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppSkeletonBlock(
                    pulse = pulse,
                    modifier = Modifier.size(leadingSize),
                    corner = leadingCorner ?: (leadingSize / 2),
                    shimmer = false,
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    lineWidths.forEach { fraction ->
                        AppSkeletonLine(pulse = pulse, widthFraction = fraction, shimmer = false)
                    }
                }
            }
        }
    }
}

/** 座位网格骨架：用于图书馆/研讨间座位图拉取中的同构占位。 */
@Composable
fun AppSkeletonSeatGrid(
    modifier: Modifier = Modifier,
    columns: Int = 6,
    rows: Int = 2,
    cellHeight: Dp = 34.dp,
) {
    val dark = isAppInDarkTheme()
    val pulse = rememberSkeletonPulse()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .glassShimmer(dark),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        repeat(rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                repeat(columns) {
                    AppSkeletonBlock(
                        pulse = pulse,
                        modifier = Modifier
                            .weight(1f)
                            .height(cellHeight),
                        corner = 10.dp,
                        shimmer = false,
                    )
                }
            }
        }
    }
}

/** 指标卡骨架行：与 MetricCell 同构，用于概览数字拉取中。 */
@Composable
fun AppSkeletonMetricRow(
    count: Int = 4,
    modifier: Modifier = Modifier,
) {
    val pulse = rememberSkeletonPulse()
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        repeat(count) {
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                AppSkeletonLine(pulse = pulse, widthFraction = 0.7f, height = 9.dp, shimmer = false)
                AppSkeletonLine(pulse = pulse, widthFraction = 0.5f, height = 15.dp, shimmer = false)
            }
        }
    }
}

/** 方形媒体骨架：用于二维码、图片等块状内容拉取中。 */
@Composable
fun AppSkeletonMedia(
    modifier: Modifier = Modifier,
    size: Dp = 220.dp,
    corner: Dp = 22.dp,
) {
    val pulse = rememberSkeletonPulse()
    AppSkeletonBlock(
        pulse = pulse,
        modifier = modifier.size(size),
        corner = corner,
    )
}

/**
 * 品牌轨道加载环 (AppOrbitLoader)
 * 极光渐变弧线匀速旋转 + 轨道呼吸，替代系统默认菊花，用于短时等待与全屏加载。
 */
@Composable
fun AppOrbitLoader(
    modifier: Modifier = Modifier,
    size: Dp = 34.dp,
    strokeWidth: Dp = 3.dp,
    color: Color = MaterialTheme.colorScheme.primary,
) {
    val transition = rememberInfiniteTransition(label = "app-orbit-loader")
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1150, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "app-orbit-rotation",
    )
    val breathe by transition.animateFloat(
        initialValue = 0.75f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 760, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "app-orbit-breathe",
    )

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val stroke = strokeWidth.toPx()
            val side = this.size.minDimension - stroke
            val topLeft = Offset((this.size.width - side) / 2f, (this.size.height - side) / 2f)
            val arcSize = Size(side, side)
            drawArc(
                color = color.copy(alpha = 0.14f * breathe),
                startAngle = 0f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            rotate(degrees = rotation) {
                drawArc(
                    brush = Brush.sweepGradient(
                        colors = listOf(Color.Transparent, color.copy(alpha = 0.35f), color),
                    ),
                    startAngle = 0f,
                    sweepAngle = 306f,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
        Box(
            modifier = Modifier
                .size(strokeWidth * 1.6f)
                .graphicsLayer { alpha = breathe }
                .background(BrandCyan, CircleShape),
        )
    }
}

/** 三连打字点：用于 AI 助手等待回答等「正在生成」场景。 */
@Composable
fun AppTypingDots(
    modifier: Modifier = Modifier,
    dotSize: Dp = 7.dp,
) {
    val transition = rememberInfiniteTransition(label = "app-typing-dots")
    val color = MaterialTheme.colorScheme.primary
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        repeat(3) { index ->
            val scale by transition.animateFloat(
                initialValue = 0.45f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(
                    animation = tween(
                        durationMillis = 520,
                        delayMillis = index * 140,
                        easing = FastOutSlowInEasing,
                    ),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "app-typing-dot-$index",
            )
            Box(
                modifier = Modifier
                    .size(dotSize)
                    .graphicsLayer {
                        scaleX = scale
                        scaleY = scale
                        alpha = 0.4f + 0.6f * scale
                    }
                    .background(color, CircleShape),
            )
        }
    }
}
