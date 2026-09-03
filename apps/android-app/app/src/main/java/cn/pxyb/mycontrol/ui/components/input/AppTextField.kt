package cn.pxyb.mycontrol.ui.components.input

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * 现代毛玻璃标准输入框
 *
 * 遵循项目毛玻璃与科技蓝设计规范：
 * - 纯净半透明微填色背景与柔和发丝边框；
 * - 聚焦时高亮清澈科技蓝；
 * - 内置可选的一键清空（clearable）与密码眼睛显隐功能；
 * - 支持前缀/后缀图标及平滑动画错误提示。
 */
@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    isPassword: Boolean = false,
    clearable: Boolean = true,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = if (singleLine) 1 else 4,
    errorMessage: String? = null,
    keyboardOptions: KeyboardOptions = if (isPassword) KeyboardOptions(keyboardType = KeyboardType.Password) else KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
) {
    val dark = isSystemInDarkTheme()
    var passwordVisible by remember { mutableStateOf(false) }
    val isError = !errorMessage.isNullOrBlank()

    Column(modifier = modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine && minLines <= 1,
            minLines = minLines,
            maxLines = maxLines.coerceAtLeast(minLines),
            label = label?.let {
                {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    )
                }
            },
            placeholder = placeholder?.let {
                {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    )
                }
            },
            leadingIcon = leadingIcon?.let {
                {
                    Icon(
                        imageVector = it,
                        contentDescription = null,
                        tint = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
            },
            trailingIcon = {
                when {
                    trailingIcon != null -> trailingIcon()
                    isPassword -> {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility,
                                contentDescription = if (passwordVisible) "隐藏密码" else "显示密码",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                    clearable && value.isNotEmpty() && enabled && !readOnly -> {
                        IconButton(onClick = { onValueChange("") }) {
                            Icon(
                                imageVector = Icons.Outlined.Cancel,
                                contentDescription = "清空输入",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                                modifier = Modifier.size(18.dp),
                            )
                        }
                    }
                }
            },
            visualTransformation = if (isPassword && !passwordVisible) {
                PasswordVisualTransformation()
            } else {
                VisualTransformation.None
            },
            keyboardOptions = keyboardOptions,
            keyboardActions = keyboardActions,
            isError = isError,
            shape = RoundedCornerShape(16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = if (dark) Color.White.copy(alpha = 0.07f) else Color(0xFFF8FAFC),
                unfocusedContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else Color(0xFFF8FAFC),
                disabledContainerColor = if (dark) Color.White.copy(alpha = 0.02f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
                unfocusedBorderColor = if (dark) Color.White.copy(alpha = 0.12f) else Color(0xFFE2E8F0),
                disabledBorderColor = if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFFE2E8F0).copy(alpha = 0.5f),
                errorBorderColor = MaterialTheme.colorScheme.error,
                focusedLabelColor = MaterialTheme.colorScheme.primary,
                unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                cursorColor = MaterialTheme.colorScheme.primary,
            ),
        )

        AnimatedVisibility(
            visible = isError,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            Text(
                text = errorMessage.orEmpty(),
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(start = 12.dp, top = 4.dp),
            )
        }
    }
}
