package cn.pxyb.mycontrol.ui.components.dialog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton

@Composable
fun AppDialogForm(
    title: String,
    onDismissRequest: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    confirmText: String = "保存",
    cancelText: String = "取消",
    danger: Boolean = false,
    enabled: Boolean = true,
    loading: Boolean = false,
    errorMessage: String? = null,
    content: @Composable () -> Unit,
) {
    val dismiss = { if (!loading) onDismissRequest() }
    AppDialog(
        onDismissRequest = dismiss,
        modifier = modifier,
        icon = icon,
        iconTint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        iconBackground = if (danger) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = subtitle,
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppDialogSecondaryButton(
                    text = cancelText,
                    onClick = dismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !loading,
                )
                if (danger) {
                    AppDialogDangerButton(
                        text = confirmText,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        enabled = enabled && !loading,
                        busy = loading,
                    )
                } else {
                    AppDialogPrimaryButton(
                        text = confirmText,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        enabled = enabled && !loading,
                        busy = loading,
                    )
                }
            }
        },
    ) {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            content()
            if (!errorMessage.isNullOrBlank()) {
                DialogErrorText(errorMessage)
            }
        }
    }
}

@Composable
private fun DialogErrorText(message: String) {
    Text(
        text = message,
        color = MaterialTheme.colorScheme.error,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier.fillMaxWidth(),
    )
}
