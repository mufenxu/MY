package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Warning
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.filter.AppSegmentedControl
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun DeskStatsDashboard(
    accountsCount: Int,
    aliasesCount: Int,
    registeredCount: Int,
    pendingCount: Int,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        DeskStatCard(
            label = "主邮箱",
            count = accountsCount,
            accentColor = MaterialTheme.colorScheme.primary,
            icon = Icons.Outlined.Email,
            modifier = Modifier.weight(1f),
        )
        DeskStatCard(
            label = "别名",
            count = aliasesCount,
            accentColor = ColorTokens.Indigo.foreground,
            icon = Icons.Outlined.AlternateEmail,
            modifier = Modifier.weight(1f),
        )
        DeskStatCard(
            label = "已注册",
            count = registeredCount,
            accentColor = ColorTokens.Green.foreground,
            icon = Icons.Outlined.CheckCircle,
            modifier = Modifier.weight(1f),
        )
        DeskStatCard(
            label = "待处理",
            count = pendingCount,
            accentColor = ColorTokens.Amber.foreground,
            icon = Icons.Outlined.Schedule,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun DeskStatCard(
    label: String,
    count: Int,
    accentColor: Color,
    icon: ImageVector,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = glassCardColor(),
        border = BorderStroke(0.6.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
        shadowElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            accentColor.copy(alpha = 0.08f),
                            Color.Transparent,
                        ),
                    )
                )
                .padding(horizontal = 6.dp, vertical = 9.dp),
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Medium,
                            fontSize = 11.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.85f),
                    )
                }
                Text(
                    count.toString(),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                    ),
                    color = accentColor,
                )
            }
        }
    }
}

@Composable
internal fun StatusFilterRow(selected: String, onSelect: (String) -> Unit, counts: Map<String, Int>) {
    val options = listOf(
        FILTER_ALL to "全部",
        FILTER_UNREGISTERED to "未注册",
        FILTER_REGISTERED to "已注册",
        FILTER_ATTENTION to "需处理",
    )
    AppSegmentedControl(
        options = options.map { it.first },
        selected = selected,
        onSelect = onSelect,
        label = { value -> options.first { it.first == value }.second },
        count = { counts[it] },
    )
}

private fun avatarGradientForEmail(email: String): Brush {
    val char = email.firstOrNull()?.uppercaseChar() ?: 'A'
    val hash = kotlin.math.abs(char.code) % 5
    return when (hash) {
        0 -> Brush.linearGradient(listOf(Color(0xFF3B82F6), Color(0xFF1D4ED8)))
        1 -> Brush.linearGradient(listOf(Color(0xFF8B5CF6), Color(0xFF6D28D9)))
        2 -> Brush.linearGradient(listOf(Color(0xFF10B981), Color(0xFF047857)))
        3 -> Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFD97706)))
        else -> Brush.linearGradient(listOf(Color(0xFF06B6D4), Color(0xFF0891B2)))
    }
}

@Composable
private fun ModernOpenAiStatusBadge(status: String) {
    val icon: ImageVector
    val label: String
    val semantic: AppStatusSemantic

    when (status) {
        OPENAI_REGISTERED -> {
            icon = Icons.Outlined.CheckCircle
            label = "已注册"
            semantic = AppStatusSemantic.Success
        }
        OPENAI_VERIFICATION -> {
            icon = Icons.Outlined.Warning
            label = "需验证"
            semantic = AppStatusSemantic.Warning
        }
        OPENAI_ABNORMAL -> {
            icon = Icons.Outlined.Warning
            label = "异常"
            semantic = AppStatusSemantic.Error
        }
        OPENAI_DISABLED -> {
            icon = Icons.Outlined.Close
            label = "已停用"
            semantic = AppStatusSemantic.Neutral
        }
        else -> {
            icon = Icons.Outlined.Schedule
            label = "未注册"
            semantic = AppStatusSemantic.Info
        }
    }

    AppStatusBadge(
        label = label,
        semantic = semantic,
        icon = icon,
    )
}

@Composable
internal fun GoogleAccountRow(
    account: GoogleAccountRecord,
    selected: Boolean,
    selectionMode: Boolean,
    bulkSelected: Boolean,
    onClick: () -> Unit,
) {
    val avatarInitial = account.primaryEmail.firstOrNull()?.uppercaseChar()?.toString() ?: "G"
    val avatarBrush = remember(account.primaryEmail) { avatarGradientForEmail(account.primaryEmail) }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        color = glassCardColor(),
        border = BorderStroke(
            if (bulkSelected || selected) 1.2.dp else 0.6.dp,
            if (bulkSelected || selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f),
        ),
        shadowElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(avatarBrush),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    avatarInitial,
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                    ),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    account.primaryEmail,
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp,
                        letterSpacing = (-0.2).sp,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (account.aliases.isNotEmpty()) {
                        Surface(
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                            shape = RoundedCornerShape(6.dp),
                        ) {
                            Text(
                                "${account.aliases.size} 个别名",
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 11.sp,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.5.dp),
                            )
                        }
                    }

                    if (account.displayName.isNotBlank()) {
                        Text(
                            account.displayName,
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    } else if (account.tags.isNotEmpty()) {
                        Text(
                            account.tags.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.5.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.65f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                ModernOpenAiStatusBadge(account.openAiStatus)

                if (selectionMode) {
                    Checkbox(checked = bulkSelected, onCheckedChange = { onClick() })
                } else {
                    Icon(
                        Icons.Outlined.ChevronRight,
                        contentDescription = "查看详情",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}
