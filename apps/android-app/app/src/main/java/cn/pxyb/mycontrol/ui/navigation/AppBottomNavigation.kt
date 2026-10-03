package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens

@Composable
internal fun AppBottomNavigation(
    selected: MainTab,
    onSelect: (MainTab) -> Unit,
    modifier: Modifier = Modifier,
    assistant: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.widthIn(max = 480.dp).fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Surface(
            modifier = Modifier.weight(1f),
            color = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(32.dp),
            border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
            shadowElevation = 2.dp,
        ) {
            Row(Modifier.padding(4.dp), verticalAlignment = Alignment.CenterVertically) {
                appNavigationTabs.forEach { item ->
                    BottomNavigationItem(item, selected == item.tab) { onSelect(item.tab) }
                }
            }
        }
        assistant?.invoke()
    }
}

@Composable
private fun RowScope.BottomNavigationItem(item: TabItem, selected: Boolean, onClick: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val colors = MaterialTheme.colorScheme
    val foreground by animateColorAsState(
        if (selected) colors.primary else colors.onSurface,
        tween(MotionTokens.DurationShort), label = "nav-foreground",
    )
    val background by animateColorAsState(
        if (selected) colors.primary.copy(alpha = 0.10f) else Color.Transparent,
        tween(MotionTokens.DurationShort), label = "nav-background",
    )
    Column(
        modifier = Modifier.weight(1f).heightIn(min = 56.dp)
            .clip(RoundedCornerShape(28.dp)).background(background)
            .selectable(selected = selected, role = Role.Tab,
                interactionSource = interaction, indication = LocalIndication.current,
                onClick = { if (!selected) { AppHaptics.tick(haptics); onClick() } })
            .padding(vertical = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterVertically),
    ) {
        Icon(item.icon, contentDescription = null, tint = foreground, modifier = Modifier.size(24.dp))
        Text(item.label, color = foreground, fontSize = 12.sp,
            fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
            lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}
