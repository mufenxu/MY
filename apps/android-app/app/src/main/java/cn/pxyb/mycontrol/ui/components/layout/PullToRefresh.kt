package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import kotlin.math.roundToInt
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** 下拉刷新容器：列表位于顶部时下拉，带动指示器与内容位移动画。 */
@Composable
fun PullToRefresh(
    isRefreshing: Boolean,
    onRefresh: (() -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    atTop: () -> Boolean,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val thresholdPx = with(density) { 76.dp.toPx() }
    val maxPullPx = with(density) { 150.dp.toPx() }
    val indicatorSizePx = with(density) { 42.dp.toPx() }
    val dragMultiplier = 0.5f

    var pullOffset by remember { mutableFloatStateOf(0f) }
    var indicatorVisible by remember { mutableStateOf(false) }
    var triggered by remember { mutableStateOf(false) }
    val settleJob = remember { mutableStateOf<Job?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val currentIsRefreshing by rememberUpdatedState(isRefreshing)
    val currentOnRefresh by rememberUpdatedState(onRefresh)
    val currentAtTop by rememberUpdatedState(atTop)
    val currentEnabled by rememberUpdatedState(enabled)

    fun animatePullTo(target: Float) {
        settleJob.value?.cancel()
        settleJob.value = coroutineScope.launch {
            animate(
                initialValue = pullOffset,
                targetValue = target,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMedium,
                ),
            ) { value, _ ->
                pullOffset = value
            }
            pullOffset = target
            if (target == 0f && !triggered) indicatorVisible = false
        }
    }

    fun settlePull() {
        when {
            !currentEnabled -> animatePullTo(0f)
            currentIsRefreshing || triggered -> animatePullTo(thresholdPx)
            pullOffset >= thresholdPx -> {
                triggered = true
                AppHaptics.refreshSnap(haptics)
                animatePullTo(thresholdPx)
                currentOnRefresh?.invoke()
            }
            else -> animatePullTo(0f)
        }
    }

    LaunchedEffect(isRefreshing) {
        if (isRefreshing) {
            // 后台刷新（切页/自动刷新）不显示指示器；只有手动下拉触发后等待完成
        } else if (triggered) {
            triggered = false
            animatePullTo(0f)
        }
    }

    val connection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                if (source != NestedScrollSource.Drag || currentIsRefreshing) return Offset.Zero
                // 当下拉刷新处于展开状态且用户向上收回时，优先在 preScroll 消费
                if (delta < 0f && pullOffset > 0f) {
                    settleJob.value?.cancel()
                    val consumed = delta.coerceAtLeast(-pullOffset / dragMultiplier)
                    pullOffset = (pullOffset + consumed * dragMultiplier).coerceAtLeast(0f)
                    if (pullOffset == 0f && !triggered) indicatorVisible = false
                    return Offset(0f, consumed)
                }
                return Offset.Zero
            }

            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                // 当列表已经滚动到最顶部且无法再滚动、产生剩余正向位移时，才触发下拉刷新
                if (currentEnabled && source == NestedScrollSource.Drag && delta > 0f && !currentIsRefreshing) {
                    settleJob.value?.cancel()
                    indicatorVisible = true
                    pullOffset = (pullOffset + delta * dragMultiplier).coerceAtMost(maxPullPx)
                    return Offset(0f, delta)
                }
                return Offset.Zero
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                if (pullOffset > 0f && !currentIsRefreshing) {
                    if (available.y > 0f) {
                        settlePull()
                    } else {
                        animatePullTo(0f)
                    }
                    return available
                }
                return Velocity.Zero
            }
        }
    }

    val dragReleaseModifier = if (pullOffset > 0f) {
        Modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var watching = true
                while (watching) {
                    val event = awaitPointerEvent(PointerEventPass.Final)
                    val change = event.changes.firstOrNull { it.id == down.id }
                    if (change == null || !change.pressed) {
                        if (pullOffset > 0f) settlePull()
                        watching = false
                    }
                }
            }
        }
    } else {
        Modifier
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .nestedScroll(connection)
            .then(dragReleaseModifier)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                // 下拉时只做 placement 偏移，避免滚动页面常驻一个全屏绘制层。
                .offset { IntOffset(0, pullOffset.roundToInt()) }
        ) {
            content()
        }
        if (indicatorVisible || (triggered && isRefreshing)) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset { IntOffset(0, (pullOffset - indicatorSizePx).roundToInt()) }
                    .size(42.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.ArrowDownward,
                            contentDescription = "下拉刷新",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .size(20.dp)
                                .graphicsLayer {
                                    rotationZ = (pullOffset / thresholdPx).coerceIn(0f, 1f) * 180f
                                },
                        )
                    }
                }
            }
        }
    }
}
