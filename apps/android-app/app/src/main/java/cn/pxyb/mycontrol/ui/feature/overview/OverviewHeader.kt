package cn.pxyb.mycontrol.ui.feature.overview

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.components.button.AppNotificationButton
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.ModernHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.glassPanel
import cn.pxyb.mycontrol.ui.components.layout.rememberGlassPalette
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
internal fun ModernOverviewHeader(
    onOpenQrLogin: () -> Unit,
    onOpenSearch: () -> Unit,
    unreadCount: Int,
    onOpenNotifications: () -> Unit,
    calendarText: String? = null,
) {
    val weekTag = remember(calendarText) { extractHeaderWeekTag(calendarText) }
    cn.pxyb.mycontrol.ui.components.layout.AppSecondaryHeader(
        title = "我的工作台",
        subtitle = weekTag,
        onBack = {},
        showBack = false,
        actions = {
            cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton(
                icon = Icons.Outlined.Search, contentDescription = "全局搜索", onClick = onOpenSearch,
            )
            AppNotificationButton(unreadCount = unreadCount, onClick = onOpenNotifications, shape = CircleShape)
            cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton(
                icon = Icons.Outlined.CenterFocusWeak, contentDescription = "扫码登录", onClick = onOpenQrLogin,
            )
        },
    )
}

private fun extractHeaderWeekTag(calendarText: String?): String {
    if (calendarText.isNullOrBlank()) return "第3周"
    val regex = Regex("""第\s*\d+\s*周""")
    val match = regex.find(calendarText)
    if (match != null) return match.value.replace(" ", "")
    val weekdayRegex = Regex("""周[一二三四五六日天]""")
    val weekdayMatch = weekdayRegex.find(calendarText)
    if (weekdayMatch != null) return weekdayMatch.value
    return "第3周"
}

/** 分组标题：灵动微岛毛玻璃浮标 (Dynamic Floating Island Pill) */
@Composable
internal fun OverviewSectionTitle(
    title: String,
    subtitle: String,
    dotColor: Color = MaterialTheme.colorScheme.primary,
    tag: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    AppSectionHeader(
        title = title,
        subtitle = subtitle,
        accent = dotColor,
        tag = tag,
        trailing = trailing,
    )
}

private var scanViewfinder: ImageVector? = null

private val ScanViewfinder: ImageVector
    get() {
        scanViewfinder?.let { return it }
        return ImageVector.Builder(
            name = "ScanViewfinder",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(4f, 4f)
                horizontalLineTo(10f)
                verticalLineTo(6f)
                horizontalLineTo(6f)
                verticalLineTo(10f)
                horizontalLineTo(4f)
                close()

                moveTo(14f, 4f)
                horizontalLineTo(20f)
                verticalLineTo(10f)
                horizontalLineTo(18f)
                verticalLineTo(6f)
                horizontalLineTo(14f)
                close()

                moveTo(4f, 14f)
                horizontalLineTo(6f)
                verticalLineTo(18f)
                horizontalLineTo(10f)
                verticalLineTo(20f)
                horizontalLineTo(4f)
                close()

                moveTo(18f, 14f)
                horizontalLineTo(20f)
                verticalLineTo(20f)
                horizontalLineTo(14f)
                verticalLineTo(18f)
                horizontalLineTo(18f)
                close()

                moveTo(6.5f, 11f)
                horizontalLineTo(17.5f)
                verticalLineTo(13f)
                horizontalLineTo(6.5f)
                close()
            }
        }.build().also { scanViewfinder = it }
    }
