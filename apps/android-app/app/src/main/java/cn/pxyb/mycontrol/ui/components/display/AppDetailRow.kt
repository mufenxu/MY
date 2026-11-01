package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalAccessibilityManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import kotlinx.coroutines.delay

/**
 * 统一信息详情键值对展示行
 */
@Composable
fun AppDetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    canCopy: Boolean = false,
    maxLines: Int = Int.MAX_VALUE,
) {
    val clipboardManager = LocalClipboardManager.current
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    val accessibilityManager = LocalAccessibilityManager.current
    val interactionSource = remember { MutableInteractionSource() }
    val textMeasurer = rememberTextMeasurer()
    val labelStyle = MaterialTheme.typography.bodyMedium
    val valueStyle = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
    val hintStyle = MaterialTheme.typography.labelSmall
    val displayedValue = value.ifBlank { "--" }
    val copyable = canCopy && value.isNotBlank()
    var copied by remember(label, value) { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(accessibilityManager?.calculateRecommendedTimeoutMillis(
                originalTimeoutMillis = 2000L,
                containsText = true,
                containsIcons = false,
                containsControls = false,
            ) ?: 2000L)
            copied = false
        }
    }
    val copyValue = {
        clipboardManager.setText(AnnotatedString(value))
        AppHaptics.tick(haptics)
        copied = true
    }

    val rowModifier = if (copyable) {
        modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .combinedClickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClickLabel = "复制$label",
                onLongClickLabel = "复制$label",
                onClick = copyValue,
                onLongClick = copyValue,
            )
            .semantics { if (copied) stateDescription = "已复制" }
            .padding(vertical = 5.dp)
    } else {
        modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
    }

    BoxWithConstraints(modifier = rowModifier) {
        val labelWidth = textMeasurer.measure(label, labelStyle).size.width +
            with(density) { if (icon != null) 26.dp.roundToPx() else 0 }
        val valueWidth = textMeasurer.measure(displayedValue, valueStyle).size.width
        val hintWidth = if (copyable) textMeasurer.measure("已复制", hintStyle).size.width +
            with(density) { 16.dp.roundToPx() } else 0
        val stacked = labelWidth + valueWidth + hintWidth + with(density) { 16.dp.roundToPx() } >
            with(density) { maxWidth.roundToPx() }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Row(
                    modifier = if (stacked) Modifier.weight(1f) else Modifier,
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (icon != null) {
                        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(18.dp))
                    }
                    Text(label, style = labelStyle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (!stacked) {
                    Text(displayedValue, style = valueStyle, color = valueColor, textAlign = TextAlign.End,
                        maxLines = maxLines.coerceAtLeast(1), overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f))
                }
                if (copyable) {
                    Text(if (copied) "已复制" else "复制", style = hintStyle, color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                }
            }
            if (stacked) {
                Text(displayedValue, style = valueStyle, color = valueColor, textAlign = TextAlign.Start,
                    maxLines = maxLines.coerceAtLeast(1), overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.fillMaxWidth())
            }
        }
    }
}
