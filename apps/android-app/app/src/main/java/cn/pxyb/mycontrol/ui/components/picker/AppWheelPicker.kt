package cn.pxyb.mycontrol.ui.components.picker

import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * 现代物理惯性滚轮核心选择器
 *
 * 规范与特性：
 * - 集成物理吸附（SnapFlingBehavior）与居中判定；
 * - 居中项变动时触发轻量触觉微反馈（AppHaptics.tick）；
 * - 上下两端采用自然透明度渐变与选中横向高亮指示区；
 * - 纯泛型解耦，适用于年份、日期、小时、分钟及任意自定义选项列表。
 */
@Composable
fun <T> AppWheelPicker(
    items: List<T>,
    selectedIndex: Int,
    onSelectedIndexChanged: (Int) -> Unit,
    modifier: Modifier = Modifier,
    visibleItemCount: Int = 5,
    itemHeight: Dp = 44.dp,
    unitText: String? = null,
    formatItem: (T) -> String = { it.toString() },
) {
    if (items.isEmpty()) return

    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = selectedIndex.coerceIn(0, (items.size - 1).coerceAtLeast(0)),
    )
    val flingBehavior = rememberSnapFlingBehavior(lazyListState = listState)
    val coroutineScope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val dark = isAppInDarkTheme()
    val currentSelectedIndex by rememberUpdatedState(selectedIndex.coerceIn(items.indices))
    val currentOnSelectedIndexChanged by rememberUpdatedState(onSelectedIndexChanged)

    val centerIndex by remember(listState) {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val visibleItems = layoutInfo.visibleItemsInfo
            if (visibleItems.isEmpty()) return@derivedStateOf currentSelectedIndex
            val viewportCenter = (layoutInfo.viewportStartOffset + layoutInfo.viewportEndOffset) / 2
            val closest = visibleItems.minByOrNull { item ->
                val itemCenter = item.offset + item.size / 2
                abs(itemCenter - viewportCenter)
            }
            closest?.index ?: currentSelectedIndex
        }
    }

    // 实时感知当前处于正中心的项，触发微震动并通知外层
    LaunchedEffect(listState, items) {
        listState.scrollToItem(currentSelectedIndex)
        snapshotFlow { centerIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index in items.indices && index != currentSelectedIndex) {
                    AppHaptics.tick(haptics)
                    currentOnSelectedIndexChanged(index)
                }
            }
    }

    // 外部联动直接定位，避免动画途中回写旧列表的索引。
    LaunchedEffect(items, selectedIndex) {
        if (!listState.isScrollInProgress && centerIndex != selectedIndex && selectedIndex in items.indices) {
            listState.scrollToItem(selectedIndex)
        }
    }

    val verticalPadding = itemHeight * ((visibleItemCount - 1) / 2)
    val surfaceColor = MaterialTheme.colorScheme.surface

    Box(
        modifier = modifier.height(itemHeight * visibleItemCount),
        contentAlignment = Alignment.Center,
    ) {
        // 中间高亮选中指示背景
        Box(
            modifier = Modifier
                .fillMaxWidth(0.92f)
                .height(itemHeight)
                .background(
                    color = MaterialTheme.colorScheme.primary.copy(alpha = if (dark) 0.12f else 0.08f),
                    shape = RoundedCornerShape(10.dp),
                ),
        )

        LazyColumn(
            state = listState,
            flingBehavior = flingBehavior,
            contentPadding = PaddingValues(vertical = verticalPadding),
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            itemsIndexed(items) { index, item ->
                val isSelected = index == centerIndex
                val distance = abs(index - centerIndex)
                val alpha = when (distance) {
                    0 -> 1f
                    1 -> 0.50f
                    else -> 0.22f
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(itemHeight)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (index in items.indices) {
                                AppHaptics.tick(haptics)
                                onSelectedIndexChanged(index)
                                coroutineScope.launch {
                                    listState.animateScrollToItem(index)
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = formatItem(item),
                            style = if (isSelected) {
                                MaterialTheme.typography.titleLarge.copy(
                                    fontSize = 21.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            } else {
                                MaterialTheme.typography.bodyLarge.copy(
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Normal,
                                )
                            },
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)
                            },
                            textAlign = TextAlign.Center,
                        )
                        if (isSelected && !unitText.isNullOrBlank()) {
                            Spacer(Modifier.width(2.dp))
                            Text(
                                text = unitText,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(bottom = 6.dp),
                            )
                        }
                    }
                }
            }
        }

        // 顶部与底部边缘渐变渐隐遮罩
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(itemHeight * 1.2f)
                .align(Alignment.TopCenter)
                .background(
                    Brush.verticalGradient(
                        listOf(surfaceColor.copy(alpha = 0.85f), Color.Transparent),
                    ),
                ),
        )
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(itemHeight * 1.2f)
                .align(Alignment.BottomCenter)
                .background(
                    Brush.verticalGradient(
                        listOf(Color.Transparent, surfaceColor.copy(alpha = 0.85f)),
                    ),
                ),
        )
    }
}
