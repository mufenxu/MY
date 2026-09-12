package cn.pxyb.mycontrol.ui.feature.assistant

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import cn.pxyb.mycontrol.data.AssistantButtonPreferences
import cn.pxyb.mycontrol.data.AssistantPreferences
import kotlin.math.abs
import kotlin.math.roundToInt

@Composable
internal fun FloatingAssistantButton(
    anchorSize: IntSize,
    visible: Boolean,
    hidden: Boolean,
    bottomInset: Dp,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit,
) {
    if (!visible || hidden || anchorSize.width == 0 || anchorSize.height == 0) return

    val context = LocalContext.current
    val preferences = remember { AssistantPreferences(context) }
    val initial = remember { preferences.read() }

    val density = LocalDensity.current
    val buttonSizePx = with(density) { 54.dp.toPx() }
    val handleWidthPx = with(density) { 7.dp.toPx() }
    val handleHeightPx = with(density) { 46.dp.toPx() }
    val marginPx = with(density) { 14.dp.toPx() }
    val edgeSnapPx = with(density) { 44.dp.toPx() }
    val slopPx = with(density) { 6.dp.toPx() }
    val bottomInsetPx = with(density) { bottomInset.toPx() }

    val boxW = anchorSize.width.toFloat()
    val boxH = anchorSize.height.toFloat()

    var xRatio by remember { mutableFloatStateOf(0f) }
    var yRatio by remember { mutableFloatStateOf(0f) }
    var collapsedSide by remember { mutableIntStateOf(initial.collapsedSide) }
    var initialized by remember { mutableStateOf(false) }

    LaunchedEffect(anchorSize) {
        if (!initialized && anchorSize.width > 0 && anchorSize.height > 0) {
            xRatio = if (initial.xRatio >= 1f) {
                ((boxW - marginPx - buttonSizePx / 2f) / boxW).coerceIn(0.02f, 0.98f)
            } else {
                initial.xRatio
            }
            yRatio = if (initial.yRatio >= 1f) {
                ((boxH - bottomInsetPx - buttonSizePx / 2f - marginPx) / boxH).coerceIn(0.02f, 0.98f)
            } else {
                initial.yRatio
            }
            initialized = true
        }
    }
    if (!initialized) return

    fun currentCenterX(): Float = when (collapsedSide) {
        1 -> handleWidthPx / 2f
        2 -> boxW - handleWidthPx / 2f
        else -> (xRatio * boxW).coerceIn(handleWidthPx, boxW - handleWidthPx)
    }

    fun currentCenterY(): Float =
        (yRatio * boxH).coerceIn(handleHeightPx / 2f + marginPx, boxH - handleHeightPx / 2f - marginPx)

    fun persistPosition() {
        preferences.write(
            AssistantButtonPreferences(
                visible = visible,
                xRatio = xRatio,
                yRatio = yRatio,
                collapsedSide = collapsedSide,
            ),
        )
    }

    fun expandFromEdge() {
        val side = collapsedSide
        collapsedSide = 0
        xRatio = when (side) {
            1 -> ((handleWidthPx + buttonSizePx / 2f + marginPx) / boxW).coerceIn(0.02f, 0.98f)
            else -> ((boxW - handleWidthPx - buttonSizePx / 2f - marginPx) / boxW).coerceIn(0.02f, 0.98f)
        }
        persistPosition()
    }

    fun snapAndPersist() {
        val currentX = currentCenterX()
        val nextCollapsed = when {
            currentX <= edgeSnapPx -> 1
            currentX >= boxW - edgeSnapPx -> 2
            else -> 0
        }
        collapsedSide = nextCollapsed
        persistPosition()
    }

    val gestureModifier = Modifier.pointerInput(anchorSize) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            var totalDrag = 0f
            var isDrag = false
            while (true) {
                val event = awaitPointerEvent()
                val change = event.changes.firstOrNull { it.id == down.id } ?: break
                if (!change.pressed) {
                    if (!isDrag) {
                        if (collapsedSide != 0) {
                            expandFromEdge()
                        } else {
                            onOpen()
                        }
                    } else {
                        snapAndPersist()
                    }
                    break
                }
                if (!isDrag) {
                    totalDrag += abs(change.position.x - change.previousPosition.x) +
                        abs(change.position.y - change.previousPosition.y)
                    if (totalDrag > slopPx) {
                        isDrag = true
                        if (collapsedSide != 0) {
                            val side = collapsedSide
                            collapsedSide = 0
                            xRatio = when (side) {
                                1 -> ((handleWidthPx + buttonSizePx / 2f + marginPx) / boxW).coerceIn(0.02f, 0.98f)
                                else -> ((boxW - handleWidthPx - buttonSizePx / 2f - marginPx) / boxW).coerceIn(0.02f, 0.98f)
                            }
                        }
                    }
                }
                if (isDrag) {
                    change.consume()
                    xRatio = ((change.position.x + currentCenterX() - buttonSizePx / 2f) / boxW).coerceIn(0.02f, 0.98f)
                    yRatio = ((change.position.y + currentCenterY() - buttonSizePx / 2f) / boxH).coerceIn(0.02f, 0.98f)
                }
            }
        }
    }

    val centerX = currentCenterX()
    val centerY = currentCenterY()

    val pulse = rememberInfiniteTransition(label = "assistantButtonPulse")
    val pulseProgress by pulse.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "assistantButtonPulseProgress",
    )

    val primary = MaterialTheme.colorScheme.primary
    val secondary = MaterialTheme.colorScheme.secondary

    Box(
        modifier = modifier
            .zIndex(1f)
            .offset {
                IntOffset(
                    (centerX - buttonSizePx / 2f).roundToInt(),
                    (centerY - buttonSizePx / 2f).roundToInt(),
                )
            }
            .size(54.dp)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                stateDescription = if (collapsedSide == 0) "已展开，可拖动" else "已收纳在屏幕边缘"
                onClick(label = if (collapsedSide == 0) "打开 AI 小助手" else "展开 AI 小助手") {
                    if (collapsedSide != 0) expandFromEdge() else onOpen()
                    true
                }
                customActions = listOf(
                    CustomAccessibilityAction("收纳到左侧") { collapsedSide = 1; persistPosition(); true },
                    CustomAccessibilityAction("收纳到右侧") { collapsedSide = 2; persistPosition(); true },
                )
            }
            .then(gestureModifier),
    ) {
        if (collapsedSide != 0) {
            // 边缘收纳：与主按钮同色系的渐变胶囊把手，带星芒图标
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Box(
                    modifier = Modifier
                        .size(width = 18.dp, height = 42.dp)
                        .shadow(4.dp, RoundedCornerShape(50), clip = false)
                        .background(
                            Brush.linearGradient(listOf(primary, secondary)),
                            RoundedCornerShape(50),
                        )
                        .border(0.8.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(50)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AutoAwesome,
                        contentDescription = "展开 AI 小助手",
                        tint = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.95f),
                        modifier = Modifier.size(13.dp),
                    )
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                // 柔光呼吸（蓝色系，与工作台主色调一致）
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .graphicsLayer {
                            val glowScale = 1f + pulseProgress * 0.16f
                            scaleX = glowScale
                            scaleY = glowScale
                            alpha = 0.4f * (1f - pulseProgress * 0.55f)
                        }
                        .background(
                            Brush.radialGradient(
                                listOf(primary.copy(alpha = 0.55f), Color.Transparent),
                            ),
                            CircleShape,
                        ),
                )
                Box(
                    modifier = Modifier
                        .size(54.dp)
                        .graphicsLayer {
                            val buttonScale = 1f + pulseProgress * 0.035f
                            scaleX = buttonScale
                            scaleY = buttonScale
                        }
                        .shadow(8.dp, CircleShape, clip = false)
                        .background(
                            Brush.linearGradient(listOf(primary, secondary)),
                            CircleShape,
                        )
                        .border(1.dp, Color.White.copy(alpha = 0.4f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Outlined.AutoAwesome,
                        contentDescription = "AI 小助手",
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
        }
    }
}
