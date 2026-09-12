package cn.pxyb.mycontrol.ui.feature.overview

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Terminal
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.ExternalApplication
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.components.layout.glassShimmer
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

private data class VisualTheme(
    val icon: ImageVector,
    val accent: Color,
    val accentPale: Color,
)

@Composable
private fun applicationVisualTheme(application: ExternalApplication): VisualTheme {
    val name = application.name.lowercase()
    val id = application.id.lowercase()
    return when {
        "ar" in name || "签到" in name || "sign" in id -> VisualTheme(
            icon = Icons.Outlined.CenterFocusWeak,
            accent = ColorTokens.Sky.foreground, // 极光青蓝
            accentPale = ColorTokens.Sky.container,
        )
        "chat" in name || "api" in name || "ai" in id || "gpt" in name -> VisualTheme(
            icon = Icons.Outlined.AutoAwesome,
            accent = ColorTokens.Purple.foreground, // 智感紫罗兰
            accentPale = ColorTokens.Purple.container,
        )
        "monkey" in name || "code" in name || "调度" in name || "dev" in id -> VisualTheme(
            icon = Icons.Outlined.Terminal,
            accent = ColorTokens.Indigo.foreground, // 极客靛蓝
            accentPale = ColorTokens.Indigo.container,
        )
        else -> VisualTheme(
            icon = Icons.Outlined.Public,
            accent = ColorTokens.Green.foreground, // 矩阵绿
            accentPale = ColorTokens.Green.container,
        )
    }
}

@Composable
internal fun ExternalApplicationsLoadingPlaceholder() {
    OverviewTwoColumnGrid(items = List(4) { it }) { index ->
        ExternalApplicationLoadingCard(index = index)
    }
}

@Composable
private fun ExternalApplicationLoadingCard(index: Int) {
    val isDark = isAppInDarkTheme()
    val transition = rememberInfiniteTransition(label = "external-application-loading")
    val pulse by transition.animateFloat(
        initialValue = 0.38f,
        targetValue = 0.88f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900 + index * 110, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "external-application-loading-pulse",
    )
    val skeletonColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f * pulse)

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .glassShimmer(isDark),
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.38f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(skeletonColor),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(if (index % 2 == 0) 0.78f else 0.65f)
                        .height(10.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(skeletonColor),
                )
                Box(
                    modifier = Modifier
                        .size(width = 48.dp, height = 9.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(skeletonColor),
                )
            }
        }
    }
}

@Composable
internal fun ExternalApplicationRow(
    application: ExternalApplication,
    opening: Boolean,
    onOpen: (ExternalApplication) -> Unit,
) {
    val theme = applicationVisualTheme(application)

    OverviewServiceCardShell(
        title = application.name,
        icon = theme.icon,
        accent = theme.accent,
        accentPale = theme.accentPale,
        enabled = application.canAccess && !opening,
        opening = opening,
        onClick = { onOpen(application) },
    ) {
        if (!application.canAccess) {
            Text(
                text = "无访问权限",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(5.dp)
                        .clip(CircleShape)
                        .background(ColorTokens.Green.foreground),
                )
                val latencyText = application.health.latencyMs?.let { "$it ms" } ?: "在线"
                val tagText = if (application.kind == "direct") "免密" else externalRoleLabel(application.requiredRole)
                Text(
                    text = "$latencyText · $tagText",
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

private fun externalRoleLabel(role: String): String = when (role) {
    "super_admin" -> "超级管理员"
    "operator" -> "运维人员"
    else -> "普通用户"
}

internal fun openBrowserLink(context: android.content.Context, url: String) {
    try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                if (context !is android.app.Activity) addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            },
        )
    } catch (error: Exception) {
        throw IllegalStateException("系统未找到可用浏览器。", error)
    }
}
