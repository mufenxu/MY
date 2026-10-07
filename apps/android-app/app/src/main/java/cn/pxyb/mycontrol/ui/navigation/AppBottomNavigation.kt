package cn.pxyb.mycontrol.ui.navigation

import android.os.Build
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.glass.GlassBackdropState
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlin.math.roundToInt

// 液态玻璃（透镜折射）参数：中模糊 + 边缘放大折射 + 发光选中。
private val GlassShape = RoundedCornerShape(32.dp)
private val GlassItemShape = RoundedCornerShape(28.dp)
private val GlassBlurRadius = 20.dp
private const val GlassRefraction = 1.16f
private const val GlassRimStrength = 0.70f
private const val GlassSheenStrength = 0.45f
private const val GlassTintLight = 0.34f
private const val GlassTintDark = 0.38f

@Composable
internal fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
    assistant: (@Composable () -> Unit)? = null,
    glassBackdrop: GlassBackdropState? = null,
) {
    val expanded = LocalAdaptiveWindow.current.isTabletOrExpanded
    Row(
        modifier = modifier.widthIn(max = if (expanded) 600.dp else 480.dp).fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        GlassNavigationBar(
            selected = selected,
            expanded = expanded,
            onSelect = onSelect,
            glassBackdrop = glassBackdrop,
            modifier = Modifier.weight(1f),
        )
        assistant?.invoke()
    }
}

@Composable
private fun GlassNavigationBar(
    selected: MainTab,
    expanded: Boolean,
    onSelect: (MainTab) -> Unit,
    glassBackdrop: GlassBackdropState?,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val dark = isAppInDarkTheme()
    // RenderEffect 需要 API 31+；低版本退化为半透明表面，几何与选中态保持一致。
    val useGlass = glassBackdrop != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    var barOrigin by remember { mutableStateOf(Offset.Zero) }
    var barSize by remember { mutableStateOf(IntSize.Zero) }

    Box(
        modifier
            .onGloballyPositioned { coordinates ->
                barOrigin = coordinates.positionInRoot()
                barSize = coordinates.size
            }
            .shadow(
                elevation = if (dark) 20.dp else 16.dp,
                shape = GlassShape,
                clip = false,
                ambientColor = Color.Black.copy(alpha = if (dark) 0.22f else 0.12f),
                spotColor = Color.Black.copy(alpha = if (dark) 0.30f else 0.20f),
            )
            .clip(GlassShape),
    ) {
        // matchParentSize 让玻璃层不参与测量，避免超大取样子层把胶囊撑满。
        Box(Modifier.matchParentSize()) {
            if (useGlass) {
                BackdropGlassLayer(glassBackdrop!!, barOrigin, barSize)
            }
            Box(
                Modifier.matchParentSize().drawWithContent {
                    drawContent()
                    val cornerRadius = CornerRadius(32.dp.toPx())
                    if (useGlass) {
                        drawGlassFinishes(cornerRadius, dark)
                    } else {
                        drawFallbackFinishes(cornerRadius, colors.surface, colors.outlineVariant.copy(alpha = 0.5f))
                    }
                },
            )
        }

        BoxWithConstraints(Modifier.padding(4.dp)) {
            val itemWidth = maxWidth / appNavigationTabs.size
            val indicatorOffset by animateDpAsState(
                targetValue = itemWidth * appNavigationTabs.indexOfFirst { it.tab == selected }.coerceAtLeast(0),
                animationSpec = MotionTokens.softSpring(), label = "nav-indicator-offset",
            )
            Box(Modifier.matchParentSize()) {
                Box(
                    Modifier
                        .offset(x = indicatorOffset)
                        .width(itemWidth)
                        .fillMaxHeight()
                        .shadow(12.dp, GlassItemShape, clip = false, spotColor = colors.primary.copy(alpha = 0.55f))
                        .background(
                            Brush.horizontalGradient(listOf(colors.primary, colors.primary.copy(alpha = 0.72f))),
                            GlassItemShape,
                        ),
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                appNavigationTabs.forEach { item ->
                    BottomNavigationItem(item, selected == item.tab, expanded) { onSelect(item.tab) }
                }
            }
        }
    }
}

/** 按底栏在 root 中的位置，从取样层里取同一块区域并做模糊与折射放大。 */
@Composable
private fun BackdropGlassLayer(
    state: GlassBackdropState,
    barOrigin: Offset,
    barSize: IntSize,
) {
    if (!state.isReady || barSize.width <= 0 || barSize.height <= 0) return
    val density = LocalDensity.current
    val sourceSize = state.sizePx
    val sourceSizeDp = with(density) { DpSize(sourceSize.width.toDp(), sourceSize.height.toDp()) }
    val deltaX = barOrigin.x - state.originInRoot.x
    val deltaY = barOrigin.y - state.originInRoot.y
    val pivotX = ((deltaX + barSize.width / 2f) / sourceSize.width).coerceIn(0f, 1f)
    val pivotY = ((deltaY + barSize.height / 2f) / sourceSize.height).coerceIn(0f, 1f)

    Box(
        Modifier
            .requiredSize(sourceSizeDp.width, sourceSizeDp.height)
            .offset { IntOffset(-deltaX.roundToInt(), -deltaY.roundToInt()) }
            .graphicsLayer {
                transformOrigin = TransformOrigin(pivotX, pivotY)
                scaleX = GlassRefraction
                scaleY = GlassRefraction
            }
            .blur(GlassBlurRadius, BlurredEdgeTreatment.Unbounded),
    ) {
        Spacer(Modifier.matchParentSize().drawBehind { drawLayer(state.layer) })
    }
}

private fun DrawScope.drawGlassFinishes(cornerRadius: CornerRadius, dark: Boolean) {
    val tint = if (dark) Color(0xFF0E1420) else Color.White
    val tintAlpha = if (dark) GlassTintDark else GlassTintLight
    drawRoundRect(color = tint.copy(alpha = tintAlpha), cornerRadius = cornerRadius)
    drawRoundRect(
        brush = Brush.verticalGradient(
            listOf(Color.White.copy(alpha = 0.16f * GlassSheenStrength), Color.Transparent),
            startY = 0f,
            endY = size.height * 0.6f,
        ),
        cornerRadius = cornerRadius,
    )
    drawRoundRect(
        brush = Brush.verticalGradient(
            listOf(Color.Transparent, Color.Black.copy(alpha = 0.06f)),
            startY = size.height * 0.5f,
            endY = size.height,
        ),
        cornerRadius = cornerRadius,
    )
    val stroke = 1.1.dp.toPx()
    drawRoundRect(
        brush = Brush.linearGradient(
            colors = listOf(
                Color.White.copy(alpha = 0.85f * GlassRimStrength),
                Color.White.copy(alpha = 0.18f * GlassRimStrength),
                Color.White.copy(alpha = 0.06f * GlassRimStrength),
                Color.White.copy(alpha = 0.55f * GlassRimStrength),
            ),
            start = Offset(0f, 0f),
            end = Offset(size.width * 0.9f, size.height),
        ),
        topLeft = Offset(stroke / 2f, stroke / 2f),
        size = Size(size.width - stroke, size.height - stroke),
        cornerRadius = CornerRadius((cornerRadius.x - stroke / 2f).coerceAtLeast(0f)),
        style = Stroke(width = stroke),
    )
}

private fun DrawScope.drawFallbackFinishes(cornerRadius: CornerRadius, surface: Color, outline: Color) {
    drawRoundRect(color = surface, cornerRadius = cornerRadius)
    val stroke = 0.5.dp.toPx()
    drawRoundRect(
        color = outline,
        topLeft = Offset(stroke / 2f, stroke / 2f),
        size = Size(size.width - stroke, size.height - stroke),
        cornerRadius = CornerRadius((cornerRadius.x - stroke / 2f).coerceAtLeast(0f)),
        style = Stroke(width = stroke),
    )
}

@Composable
private fun RowScope.BottomNavigationItem(item: TabItem, selected: Boolean, expanded: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val colors = MaterialTheme.colorScheme
    // 选中项是实心品牌色胶囊，前景固定用白色保证对比度。
    val foreground by animateColorAsState(
        if (selected) Color.White else colors.onSurface.copy(alpha = 0.88f),
        tween(MotionTokens.DurationShort), label = "nav-foreground",
    )
    val itemModifier = Modifier.weight(1f).heightIn(min = 56.dp)
            .pressFeedback(interaction)
            .clip(GlassItemShape)
            .selectable(selected = selected, role = Role.Tab,
                interactionSource = interaction, indication = LocalIndication.current,
                onClick = { if (!selected || expanded) { AppHaptics.tick(haptics); onClick() } })
            .padding(vertical = 6.dp)
    val content: @Composable () -> Unit = {
        Icon(item.icon, contentDescription = null, tint = foreground, modifier = Modifier.size(24.dp))
        Text(item.label, color = foreground, fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (expanded) Row(
        modifier = itemModifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() } else Column(
        modifier = itemModifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
    ) {
        content()
    }
}
