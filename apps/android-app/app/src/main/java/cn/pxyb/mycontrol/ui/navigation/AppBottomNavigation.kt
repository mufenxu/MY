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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

// 紧凑胶囊底栏：54dp 高（项 48dp 保住触控热区）+ 实色表面，选中用浅主色胶囊而非整格实心块。
private val NavBarShape = RoundedCornerShape(27.dp)
private val NavItemShape = RoundedCornerShape(24.dp)
private val NavBarInnerPadding = 3.dp
private val NavItemMinHeight = 48.dp
private val NavIconSize = 22.dp
private val NavLabelSize = 11.sp
private val NavLabelLineHeight = 13.sp
private val NavHairlineWidth = 0.5.dp
private val NavShadowElevation = 6.dp

@Composable
internal fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
    assistant: (@Composable () -> Unit)? = null,
) {
    val expanded = LocalAdaptiveWindow.current.isTabletOrExpanded
    Row(
        modifier = modifier.widthIn(max = if (expanded) 600.dp else 480.dp).fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        NavigationBarSurface(
            selected = selected,
            expanded = expanded,
            onSelect = onSelect,
            modifier = Modifier.weight(1f),
        )
        assistant?.invoke()
    }
}

@Composable
private fun NavigationBarSurface(
    selected: MainTab,
    expanded: Boolean,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MaterialTheme.colorScheme
    val dark = isAppInDarkTheme()
    Box(
        modifier = modifier
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
            ),
    ) {
        BoxWithConstraints(Modifier.padding(NavBarInnerPadding)) {
            val itemWidth = maxWidth / appNavigationTabs.size
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
                    BottomNavigationItem(item, selected == item.tab, expanded) { onSelect(item.tab) }
                }
            }
        }
    }
}

@Composable
private fun RowScope.BottomNavigationItem(item: TabItem, selected: Boolean, expanded: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val colors = MaterialTheme.colorScheme
    // 选中项是浅主色胶囊，前景用主色即保证对比度，不再是白字压深色实心块。
    val foreground by animateColorAsState(
        if (selected) colors.primary else colors.onSurfaceVariant,
        tween(MotionTokens.DurationShort), label = "nav-foreground",
    )
    val itemModifier = Modifier.weight(1f).heightIn(min = NavItemMinHeight)
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
