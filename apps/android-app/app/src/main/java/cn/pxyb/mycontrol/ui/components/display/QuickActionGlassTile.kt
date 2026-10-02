package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 常用入口玻璃格：半透明磨砂底 + 极光透出 + 发丝描边，0 阴影。
 * 不在滑动项内构建渐变画笔，圆角统一取 AppCardShape。
 */
@Composable
fun QuickActionGlassTile(
    icon: ImageVector,
    accent: Color,
    accentPale: Color,
    modifier: Modifier = Modifier,
    iconSize: Dp = 22.dp,
    contentDescription: String? = null,
) {
    val darkTheme = isAppInDarkTheme()
    val shape = AppCardShape
    Box(
        modifier = modifier
            .clip(shape)
            .background(glassCardColor(), shape)
            .background(if (darkTheme) accent.copy(alpha = 0.10f) else accentPale.copy(alpha = 0.30f), shape)
            .border(
                border = BorderStroke(0.75.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                shape = shape,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            icon,
            contentDescription = contentDescription,
            tint = accent,
            modifier = Modifier.size(iconSize),
        )
    }
}