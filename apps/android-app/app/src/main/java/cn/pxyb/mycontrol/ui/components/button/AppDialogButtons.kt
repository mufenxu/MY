package cn.pxyb.mycontrol.ui.components.button

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** 弹窗主操作按钮：对齐全圆角胶囊与 46dp 标准高度。 */
@Composable
fun AppDialogPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}

/** 弹窗次要操作按钮：半透明磨砂全圆角胶囊。 */
@Composable
fun AppDialogSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppSecondaryButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}

/** 弹窗危险操作按钮：柔和危险色全圆角胶囊。 */
@Composable
fun AppDialogDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppDangerButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}
