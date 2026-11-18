package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

// 紧凑胶囊底栏：54dp 高（项 48dp 保住触控热区）+ 实色表面，选中用浅主色胶囊而非整格实心块。
// 宽度按「可用空间均分」算，助手位恒定预留：开关助手时胶囊宽度一个 dp 都不变，只改居中位置。
// 手机不再设上界（360dp 屏 = 4×65 + 6 = 266dp），只有平板给项宽封顶 104dp（422dp）。
private val NavBarShape = RoundedCornerShape(27.dp)
private val NavItemShape = RoundedCornerShape(24.dp)
private val NavBarInnerPadding = 3.dp
private val NavItemMinHeight = 48.dp
private val NavItemWidthExpanded = 104.dp
private val NavIconSize = 22.dp
private val NavLabelSize = 11.sp
private val NavLabelLineHeight = 13.sp
private val NavHairlineWidth = 0.5.dp
private val NavShadowElevation = 6.dp
private val NavDockGap = 8.dp
private val NavDockHorizontalPadding = 16.dp
private val NavDockVerticalPadding = 6.dp
private val NavAssistantSize = 54.dp
private val NavAssistantSizeExpanded = 96.dp

@Composable
internal fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
    assistant: (@Composable () -> Unit)? = null,
) {
    val expanded = LocalAdaptiveWindow.current.isTabletOrExpanded
    BoxWithConstraints(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = NavDockHorizontalPadding, vertical = NavDockVerticalPadding),
    ) {
        // 助手位恒定预留（即使按钮当前隐藏），这样开关助手时胶囊宽度完全不变，只改居中位置。
        // 项宽把剩余空间均分给 4 个标签，圆钮始终保持原尺寸、不会被挤扁。
        val assistantSlot = (if (expanded) NavAssistantSizeExpanded else NavAssistantSize) + NavDockGap
        val widthForItems = (maxWidth - assistantSlot - NavBarInnerPadding * 2).coerceAtLeast(0.dp)
        val itemWidth = if (expanded) {
            // 平板给项宽封顶，避免 4 个标签横跨整块屏；手机直接均分，能多宽就多宽。
            minOf(NavItemWidthExpanded, widthForItems / appNavigationTabs.size)
        } else {
            widthForItems / appNavigationTabs.size
        }
        Row(
            // 整组居中：助手开关只改变这一组的内容宽度，胶囊自身宽度恒为 itemWidth × 4 + 内边距。
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(NavDockGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NavigationBarSurface(
                selected = selected,
                expanded = expanded,
                onSelect = onSelect,
                itemWidth = itemWidth,
            )
            assistant?.invoke()
        }
    }
}

@Composable
private fun NavigationBarSurface(
    selected: MainTab,
    expanded: Boolean,
    onSelect: (MainTab) -> Unit,
    itemWidth: Dp,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val dark = isAppInDarkTheme()
    Box(
        modifier = modifier
            .width(itemWidth * appNavigationTabs.size + NavBarInnerPadding * 2)
            // 与 AppPanel 同一套表面口径：浅色用冷调柔影托起，深色只靠发丝描边分层。
            .then(
                if (dark) {
                    Modifier
                } else {
                    Modifier.shadow(
                        elevation = NavShadowElevation,
                        shape = NavBarShape,
                        clip = false,
                        ambientColor = ColorTokens.CardShadowLight,
                        spotColor = ColorTokens.CardShadowLight,
                    )
                },
            )
            .clip(NavBarShape)
            .background(colors.surface)
            .border(
                width = NavHairlineWidth,
                color = if (dark) Color.White.copy(alpha = 0.09f) else colors.outlineVariant.copy(alpha = 0.75f),
                shape = NavBarShape,
            )
            .padding(NavBarInnerPadding),
    ) {
        val indicatorOffset by animateDpAsState(
            targetValue = itemWidth * appNavigationTabs.indexOfFirst { it.tab == selected }.coerceAtLeast(0),
            animationSpec = MotionTokens.navigationTween(), label = "nav-indicator-offset",
        )
        Box(Modifier.matchParentSize()) {
            Box(
                Modifier
                    .offset(x = indicatorOffset)
                    .width(itemWidth)
                    .fillMaxHeight()
                    .clip(NavItemShape)
                    .background(colors.primaryContainer),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            appNavigationTabs.forEach { item ->
                BottomNavigationItem(item, selected == item.tab, expanded, itemWidth) { onSelect(item.tab) }
            }
        }
    }
}

@Composable
private fun BottomNavigationItem(
    item: TabItem,
    selected: Boolean,
    expanded: Boolean,
    itemWidth: Dp,
    onClick: () -> Unit,
) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val colors = MaterialTheme.colorScheme
    // 选中项是浅主色胶囊，前景用主色即保证对比度，不再是白字压深色实心块。
    val foreground by animateColorAsState(
        if (selected) colors.primary else colors.onSurfaceVariant,
        tween(MotionTokens.DurationShort), label = "nav-foreground",
    )
    val itemModifier = Modifier.width(itemWidth).heightIn(min = NavItemMinHeight)
            .pressFeedback(interaction)
            .clip(NavItemShape)
            .selectable(selected = selected, role = Role.Tab,
                interactionSource = interaction, indication = LocalIndication.current,
                onClick = { if (!selected || expanded) { AppHaptics.tick(haptics); onClick() } })
            .padding(vertical = 4.dp)
    val content: @Composable () -> Unit = {
        Icon(item.icon, contentDescription = null, tint = foreground, modifier = Modifier.size(NavIconSize))
        Text(item.label, color = foreground, fontSize = NavLabelSize,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            lineHeight = NavLabelLineHeight, maxLines = 1, overflow = TextOverflow.Ellipsis)
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
