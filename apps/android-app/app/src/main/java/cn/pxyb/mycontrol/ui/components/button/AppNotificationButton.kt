package cn.pxyb.mycontrol.ui.components.button

import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.unreadBadgeLabel
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.MotionTokens

@Composable
fun AppNotificationButton(
    unreadCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = CircleShape,
) {
    val badgeScale = remember { Animatable(1f) }
    var previousUnreadCount by remember { mutableIntStateOf(0) }
    LaunchedEffect(unreadCount) {
        val hasNewMessages = unreadCount > previousUnreadCount
        previousUnreadCount = unreadCount
        if (hasNewMessages) {
            badgeScale.snapTo(0.82f)
            badgeScale.animateTo(1f, animationSpec = MotionTokens.BouncySpring)
        } else {
            badgeScale.snapTo(1f)
        }
    }

    Box(modifier = modifier) {
        AppHeaderIconButton(
            icon = Icons.Outlined.Notifications,
            contentDescription = if (unreadCount > 0) "通知中心，$unreadCount 条未读" else "通知中心",
            onClick = onClick,
            shape = shape,
        )
        val badge = unreadBadgeLabel(unreadCount)
        if (badge.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    // 角标留在按钮测量范围内，为弹性缩放和阴影留白，避免页头裁切。
                    .padding(top = 3.dp, end = 3.dp)
                    .graphicsLayer {
                        scaleX = badgeScale.value
                        scaleY = badgeScale.value
                    }
                    .defaultMinSize(minWidth = 22.dp, minHeight = 22.dp)
                    .shadow(2.dp, CircleShape, clip = false)
                    .background(
                        Brush.verticalGradient(listOf(Coral, ColorTokens.RedLight.foreground)),
                        CircleShape,
                    )
                    .border(1.dp, MaterialTheme.colorScheme.surface, CircleShape)
                    .semantics { contentDescription = "$unreadCount 条未读通知" }
                    .padding(horizontal = 6.dp, vertical = 2.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = badge,
                    color = ColorTokens.AppSurfaceLight,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    softWrap = false,
                )
            }
        }
    }
}
