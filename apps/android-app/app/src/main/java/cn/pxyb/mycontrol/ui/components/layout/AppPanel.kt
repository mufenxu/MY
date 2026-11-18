package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 卡片或弹窗内部的浅底分区：主题实色 `surfaceContainerLow`、12dp 圆角、无描边，不添加内容内边距。
 *
 * 用于摘要、说明、分组字段这类"卡片里的一块"。语义色分区传成组状态色的实色底
 * （如 `ColorTokens.Green.container`、`colorScheme.primaryContainer`），
 * 业务页面不要再用半透明叠色、描边或自定圆角手写 `Surface`。
 */
@Composable
fun AppInsetPanel(
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.surfaceContainerLow,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = MaterialTheme.shapes.small,
        color = containerColor,
        content = content,
    )
}

private const val AppPanelSelectedTint = 0.06f
private val AppPanelSelectedBorderWidth = 1.5.dp
private val AppPanelBorderWidth = 0.5.dp

/** 卡片柔和投影高度：浅色主题托起白卡，深色主题不投影，避免在深色底上糊成黑影。 */
private val AppPanelShadowElevation = 6.dp

/**
 * 统一卡片表面：主题实色、20dp 圆角、0.5dp 发丝描边，浅色主题叠加 6dp 冷调柔和投影。
 *
 * 深色主题只用描边分层——深色背景上投影几乎不可见，还会让相邻卡片糊在一起。
 * [selected] 为真时使用全应用唯一的选中外观（主色细描边 + 极浅主色底）并暴露选中语义，
 * 业务页面不要再各自用描边粗细或底色表达选中。
 * [containerColor] / [border] 只用于开关开启、高优先这类业务状态色，普通卡片保持默认值。
 */
@Composable
fun AppPanel(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    selected: Boolean = false,
    containerColor: Color = glassCardColor(),
    border: BorderStroke? = null,
    content: @Composable () -> Unit,
) {
    val dark = isAppInDarkTheme()
    val interactionSource = remember { MutableInteractionSource() }
    val primary = MaterialTheme.colorScheme.primary
    val resolvedContainer = if (selected) {
        primary.copy(alpha = AppPanelSelectedTint).compositeOver(containerColor)
    } else {
        containerColor
    }
    val resolvedBorder = when {
        selected -> BorderStroke(AppPanelSelectedBorderWidth, primary)
        border != null -> border
        dark -> BorderStroke(AppPanelBorderWidth, Color.White.copy(alpha = 0.09f))
        else -> BorderStroke(AppPanelBorderWidth, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.75f))
    }
    Card(
        modifier = modifier
            .then(
                if (dark) {
                    Modifier
                } else {
                    Modifier.shadow(
                        elevation = AppPanelShadowElevation,
                        shape = AppCardShape,
                        clip = false,
                        ambientColor = ColorTokens.CardShadowLight,
                        spotColor = ColorTokens.CardShadowLight,
                    )
                },
            )
            .clip(AppCardShape)
            .then(if (selected) Modifier.semantics { this.selected = true } else Modifier)
            .then(
                if (onClick != null) {
                    Modifier
                        .pressFeedback(interactionSource)
                        .clickable(
                            enabled = enabled,
                            role = Role.Button,
                            interactionSource = interactionSource,
                            indication = LocalIndication.current,
                            onClick = onClick,
                        )
                } else {
                    Modifier
                }
            )
            .fillMaxWidth(),
        shape = AppCardShape,
        colors = CardDefaults.cardColors(containerColor = resolvedContainer),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = resolvedBorder,
    ) {
        Column {
            content()
        }
    }
}
