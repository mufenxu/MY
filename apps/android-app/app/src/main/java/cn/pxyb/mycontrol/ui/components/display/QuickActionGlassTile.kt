package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

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
    val shape = RoundedCornerShape(19.dp)
    val glassColors = if (darkTheme) {
        listOf(Color.White.copy(alpha = 0.08f), Color.Transparent)
    } else {
        listOf(Color.White.copy(alpha = 0.64f), accentPale.copy(alpha = 0.34f))
    }
    Box(
        modifier = modifier
            .shadow(
                elevation = 3.dp,
                shape = shape,
                ambientColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.16f),
                spotColor = accent.copy(alpha = 0.20f),
            )
            .clip(shape)
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.78f), shape)
            .background(Brush.linearGradient(colors = glassColors), shape)
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
