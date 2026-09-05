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
    val foreground = when (semantic) {
        AppStatusSemantic.Success -> MaterialTheme.colorScheme.secondary
        AppStatusSemantic.Warning -> MaterialTheme.colorScheme.tertiary
        AppStatusSemantic.Error -> MaterialTheme.colorScheme.error
        AppStatusSemantic.Info -> MaterialTheme.colorScheme.primary
        AppStatusSemantic.Neutral -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    val background = when (semantic) {
        AppStatusSemantic.Success -> MaterialTheme.colorScheme.secondaryContainer
        AppStatusSemantic.Warning -> MaterialTheme.colorScheme.tertiaryContainer
        AppStatusSemantic.Error -> MaterialTheme.colorScheme.errorContainer
        AppStatusSemantic.Info -> MaterialTheme.colorScheme.primaryContainer
        AppStatusSemantic.Neutral -> MaterialTheme.colorScheme.surfaceVariant
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(50),
        color = background,
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
