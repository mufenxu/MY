package cn.pxyb.mycontrol.ui.components.input

import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.AppHaptics

data class AppSelectOption<T>(val value: T, val label: String, val detail: String? = null)

@Composable
fun <T> AppSelectField(
    label: String,
    value: T?,
    options: List<AppSelectOption<T>>,
    onValueChange: (T) -> Unit,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "请选择",
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val haptics = LocalHapticFeedback.current
    val selectedOption = options.firstOrNull { it.value == value }
    val canExpand = enabled && options.isNotEmpty()
    Box(modifier = modifier) {
        AppPickerField(
            label = label,
            value = selectedOption?.label.orEmpty(),
            placeholder = placeholder,
            enabled = canExpand,
            icon = icon,
            onClick = { onExpandedChange(true) },
        )
        if (expanded && canExpand) {
            cn.pxyb.mycontrol.ui.components.dialog.AppDialog(
                title = label, onDismissRequest = { onExpandedChange(false) },
            ) {
                Column(Modifier.fillMaxWidth().heightIn(max = 360.dp)
                    .verticalScroll(rememberScrollState()).selectableGroup()) {
                    options.forEach { option ->
                        key(option.value) {
                            val active = option.value == value
                            Row(
                                Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium)
                                    .selectable(selected = active, role = Role.RadioButton) {
                                        AppHaptics.tick(haptics)
                                        onExpandedChange(false)
                                        onValueChange(option.value)
                                    }.heightIn(min = 56.dp).padding(horizontal = 12.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                    Text(option.label, style = MaterialTheme.typography.bodyLarge,
                                        color = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                        fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal)
                                    option.detail?.takeIf { it.isNotBlank() }?.let {
                                        Text(it, style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                }
                                androidx.compose.material3.RadioButton(selected = active, onClick = null)
                            }
                        }
                    }
                }
            }
        }
    }
}

/** 日期、时间与选项选择器共用字段表面和按钮语义。 */
@Composable
fun AppPickerField(
    label: String,
    value: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "请选择",
    enabled: Boolean = true,
    icon: ImageVector? = null,
) {
    val haptics = LocalHapticFeedback.current
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(androidx.compose.foundation.shape.RoundedCornerShape(16.dp))
            .clickable(enabled = enabled, role = Role.Button) {
                AppHaptics.tick(haptics)
                onClick()
            },
        shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceContainerLow,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    text = value.ifBlank { placeholder },
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
