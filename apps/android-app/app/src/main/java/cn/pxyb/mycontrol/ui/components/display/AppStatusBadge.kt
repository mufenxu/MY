package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

enum class AppStatusSemantic {
    Success,
    Warning,
    Error,
    Info,
    Neutral,
}

@Composable
fun AppStatusBadge(
    label: String,
    semantic: AppStatusSemantic,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    StatusBadgeContent(label, statusStyle(semantic), modifier, icon)
}

@Composable
fun AppStatusBadge(status: String, label: String? = null, modifier: Modifier = Modifier) {
    val style = statusStyle(status)
    StatusBadgeContent(label ?: style.label, style, modifier, style.icon)
}

@Composable
private fun StatusBadgeContent(
    label: String,
    style: StatusStyle,
    modifier: Modifier,
    icon: ImageVector?,
) {
    val foreground = style.foreground

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = style.background,
        contentColor = foreground,
        border = BorderStroke(0.6.dp, foreground.copy(alpha = 0.24f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (icon != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = foreground,
                    modifier = Modifier.size(12.dp),
                )
            }
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall.copy(
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 11.sp,
                ),
            )
        }
    }
}
