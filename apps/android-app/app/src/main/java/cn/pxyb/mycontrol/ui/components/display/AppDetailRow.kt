package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.theme.AppHaptics

/**
 * 统一信息详情键值对展示行
 */
@Composable
fun AppDetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    canCopy: Boolean = false,
    maxLines: Int = 2,
) {
    val clipboardManager = LocalClipboardManager.current
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val rowModifier = if (canCopy && value.isNotBlank()) {
        modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) {
                clipboardManager.setText(AnnotatedString(value))
                AppHaptics.tick(haptics)
            }
            .padding(vertical = 5.dp)
    } else {
        modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp)
    }

    Row(
        modifier = rowModifier,
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium.copy(fontSize = 13.5.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = value.ifBlank { "--" },
            style = MaterialTheme.typography.bodyMedium.copy(
                fontSize = 13.5.sp,
                fontWeight = FontWeight.Medium,
            ),
            color = valueColor,
            textAlign = TextAlign.End,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = 16.dp),
        )
    }
}
