package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
fun AppPanel(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val review = cn.pxyb.mycontrol.ui.theme.LocalDesignReview.current
    val dark = isAppInDarkTheme()
    val interactionSource = remember { MutableInteractionSource() }
    Card(
        modifier = Modifier
            .clip(AppCardShape)
            .then(modifier)
            .then(
                if (onClick != null) {
                    Modifier
                        .pressFeedback(interactionSource)
                        .clickable(
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
        colors = CardDefaults.cardColors(containerColor = glassCardColor()),
        border = if (review == cn.pxyb.mycontrol.ui.theme.DesignReview.Original) BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant) else null,
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        // 顶部高光 + Column 容器：保持调用方多子项纵向排列的既有约定。
        Column(
            modifier = if (review != cn.pxyb.mycontrol.ui.theme.DesignReview.Original) Modifier else Modifier.background(
                Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.0f to Color.White.copy(alpha = if (dark) 0.10f else 0.34f),
                        0.46f to Color.Transparent,
                    ),
                ),
            ),
        ) {
            content()
        }
    }
}
