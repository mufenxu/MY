package cn.pxyb.mycontrol.ui.feature.assistant

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppHaptics

@Composable
internal fun AssistantDockButton(modifier: Modifier = Modifier, onOpen: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val haptics = LocalHapticFeedback.current
    Surface(
        onClick = { AppHaptics.tick(haptics); onOpen() },
        modifier = modifier.size(56.dp).pressFeedback(interaction, pressedScale = 0.97f),
        interactionSource = interaction,
        shape = CircleShape,
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        shadowElevation = 1.dp,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.AutoAwesome, contentDescription = "打开 AI 助手", modifier = Modifier.size(24.dp))
        }
    }
}
