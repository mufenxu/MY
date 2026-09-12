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
    val isDark = isAppInDarkTheme()
    val glass = rememberGlassPalette(radius = 22.dp)
    val weekTag = remember(calendarText) {
        extractHeaderWeekTag(calendarText)
    }
    val searchInteractionSource = remember { MutableInteractionSource() }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // 1. 左侧：工作台标题 + 周次微标 Pill + 绿色微光状态呼吸灯
            Column(
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f, fill = false),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        text = "工作台",
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontWeight = FontWeight.Black,
                            fontSize = 21.sp,
                            letterSpacing = (-0.3).sp,
                            color = MaterialTheme.colorScheme.onBackground,
                        ),
                    )
                    Surface(
                        shape = CircleShape,
                        color = if (isDark) {
                            ColorTokens.BlueDark.container.copy(alpha = 0.5f)
                        } else {
                            ColorTokens.Blue.container.copy(alpha = 0.85f)
                        },
                        border = BorderStroke(
                            0.6.dp,
                            if (isDark) ColorTokens.BlueDark.border else ColorTokens.Blue.border,
                        ),
                    ) {
                        Text(
                            text = weekTag,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isDark) ColorTokens.BlueDark.foreground else ColorTokens.Blue.foreground,
                            ),
                            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                        )
                    }
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .background(ColorTokens.Green.foreground, CircleShape),
                    )
                    Text(
                        text = "服务稳定 · 综合校园控制台",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }

            // 2. 右侧操作区：半展开触控搜索胶囊 + 圆形触感通知按钮 + 圆形触感扫码按钮
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(7.dp),
            ) {
                // 灵动搜索胶囊
                Surface(
                    onClick = onOpenSearch,
                    interactionSource = searchInteractionSource,
                    shape = CircleShape,
                    color = if (isDark) {
                        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.40f)
                    } else {
                        ColorTokens.Blue.container.copy(alpha = 0.65f)
                    },
                    border = BorderStroke(
                        0.7.dp,
                        if (isDark) MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f) else ColorTokens.Blue.border,
                    ),
                    modifier = Modifier.pressFeedback(searchInteractionSource, pressedScale = 0.95f),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.5.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.Search,
                            contentDescription = "搜索",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(15.dp),
                        )
                        Text(
                            text = "搜索...",
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Medium,
                            ),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                // 消息通知
                AppNotificationButton(
                    unreadCount = unreadCount,
                    onClick = onOpenNotifications,
                    shape = CircleShape,
                )

                // 扫码登录
                ModernHeaderIconButton(
                    icon = Icons.Outlined.CenterFocusWeak,
                    contentDescription = "扫码登录",
                    onClick = onOpenQrLogin,
                    size = 36.dp,
                    iconSize = 18.dp,
                    shape = CircleShape,
                )
            }
        }
    }
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
