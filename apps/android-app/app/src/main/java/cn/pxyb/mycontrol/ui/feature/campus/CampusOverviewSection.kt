package cn.pxyb.mycontrol.ui.feature.campus

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusGpa
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.QuickActionGlassTile
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.layout.AppSectionColumns
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun CampusOverviewSection(
    overview: CampusOverview?,
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onOpenChaoxing: () -> Unit,
    onOpenSchoolAccountLogin: () -> Unit = {},
) {
    if (overview == null) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CampusQuickToolsGrid(
                onOpenFreeClassrooms = onOpenFreeClassrooms,
                onOpenReservation = onOpenReservation,
                onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
                onOpenWaterValve = onOpenWaterValve,
                onOpenChaoxing = onOpenChaoxing,
            )
            AppEmptyState(
                "校园信息正在同步",
                detail = "连接学校账号后，会显示成绩、空教室、一卡通和宿舍能耗。",
                actionText = "连接学校账号",
                onAction = onOpenSchoolAccountLogin,
            )
        }
        return
    }

    AppSectionColumns(
        leading = {
            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                SmartCardView(
                    balance = overview.cardBalance,
                    waterCode = overview.waterCode,
                    onOpenWaterValve = onOpenWaterValve,
                )

                Row(
                    modifier = Modifier.fillMaxWidth().height(IntrinsicSize.Min),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    DormEnergyCard(
                        energyBalance = overview.energyBalance,
                        roomName = overview.energyRoom ?: overview.dormitory,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                    AcademicGpaCard(
                        gpa = overview.gpa,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                    )
                }
            }
        },
        trailing = {
            CampusQuickToolsGrid(
                onOpenFreeClassrooms = onOpenFreeClassrooms,
                onOpenReservation = onOpenReservation,
                onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
                onOpenWaterValve = onOpenWaterValve,
                onOpenChaoxing = onOpenChaoxing,
            )
        },
    )
}

@Composable
private fun SmartCardView(
    balance: String?,
    waterCode: String?,
    onOpenWaterValve: () -> Unit,
) {
    AppPanel {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppIconTile(Icons.Outlined.CreditCard, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Text("校园一卡通", style = MaterialTheme.typography.titleMedium)
                        Surface(
                            shape = RoundedCornerShape(50),
                            color = ColorTokens.Blue.container,
                        ) {
                            Text(
                                "正常",
                                style = MaterialTheme.typography.labelSmall,
                                color = ColorTokens.Blue.foreground,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp),
                            )
                        }
                    }
                    Text(
                        "校园账户与储值可用余额",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "卡内可用余额",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        "¥",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(bottom = 4.dp),
                    )
                    Text(
                        balance?.takeIf(String::isNotBlank)?.let(::cleanCampusAmount) ?: "--",
                        style = MaterialTheme.typography.displaySmall,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }
            if (!waterCode.isNullOrBlank()) {
                AppDivider()
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .clickable(role = Role.Button, onClick = onOpenWaterValve),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        AppIconTile(
                            Icons.Outlined.WaterDrop,
                            ColorTokens.Sky.foreground,
                            ColorTokens.Sky.container,
                            modifier = Modifier.size(28.dp),
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "快捷用水码",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                waterCode,
                                style = MaterialTheme.typography.titleSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                        Text(
                            "用水服务 >",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            } else {
                AppDivider()
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        "支持食堂消费、开水房与超市支付",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "卡片在用",
                        style = MaterialTheme.typography.labelSmall,
                        color = ColorTokens.Blue.foreground,
                    )
                }
            }
        }
    }
}

@Composable
private fun DormEnergyCard(
    energyBalance: String?,
    roomName: String?,
    modifier: Modifier = Modifier,
) {
    val amountVal = energyBalance?.replace(Regex("[^0-9.\\-]"), "")?.toFloatOrNull()
    val isWarning = amountVal != null && amountVal <= 20f
    val accent = if (isWarning) ColorTokens.Amber else ColorTokens.Sky
    val statusLabel = when {
        amountVal == null -> "未同步"
        isWarning -> "偏低需充"
        else -> "充足"
    }
    val statusDesc = when {
        amountVal == null -> "暂未同步余额"
        isWarning -> "请及时充值防断电"
        else -> "运行正常 · 无欠费"
    }

    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIconTile(
                    Icons.Outlined.Bolt,
                    accent.foreground,
                    accent.container,
                    modifier = Modifier.size(36.dp),
                )
                Surface(
                    shape = RoundedCornerShape(50),
                    color = accent.container,
                ) {
                    Text(
                        statusLabel,
                        style = MaterialTheme.typography.labelSmall,
                        color = accent.foreground,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "宿舍电费",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        "¥",
                        style = MaterialTheme.typography.titleSmall,
                        color = if (isWarning) accent.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 2.dp),
                    )
                    Text(
                        energyBalance?.takeIf(String::isNotBlank)?.let(::cleanCampusAmount) ?: "--",
                        style = MaterialTheme.typography.headlineMedium,
                        color = if (isWarning) accent.foreground else MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            AppDivider()

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    roomName?.takeIf(String::isNotBlank) ?: "暂未同步宿舍",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    statusDesc,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isWarning) accent.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun AcademicGpaCard(
    gpa: CampusGpa?,
    modifier: Modifier = Modifier,
) {
    val gpaVal = gpa?.overall?.toFloatOrNull()
    val gpaTag = when {
        gpaVal == null -> "学业"
        gpaVal >= 3.7f -> "卓越"
        gpaVal >= 3.0f -> "良好"
        else -> "稳定"
    }

    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIconTile(
                    Icons.Outlined.School,
                    ColorTokens.Purple.foreground,
                    ColorTokens.Purple.container,
                    modifier = Modifier.size(36.dp),
                )
                Surface(
                    shape = RoundedCornerShape(50),
                    color = ColorTokens.Purple.container,
                ) {
                    Text(
                        gpaTag,
                        style = MaterialTheme.typography.labelSmall,
                        color = ColorTokens.Purple.foreground,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "学业绩点",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        gpa?.overall?.takeIf(String::isNotBlank) ?: "--",
                        style = MaterialTheme.typography.headlineMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        "/ 5.0",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 2.dp),
                    )
                }
            }

            AppDivider()

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp, horizontal = 2.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            "核心",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            gpa?.core?.takeIf(String::isNotBlank) ?: "--",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                Surface(
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceContainerHigh,
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp, horizontal = 2.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            "必修",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            gpa?.required?.takeIf(String::isNotBlank) ?: "--",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CampusQuickToolsGrid(
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onOpenChaoxing: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppSectionHeader(title = "校园快捷服务", subtitle = "预约、自习、签到与日常用水")
        AppPanel {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                QuickToolItem(Icons.Outlined.MeetingRoom, "空闲教室", ColorTokens.Green.foreground, ColorTokens.Green.container, Modifier.weight(1f), onOpenFreeClassrooms)
                QuickToolItem(Icons.Outlined.CalendarMonth, "研讨间预约", ColorTokens.Blue.foreground, ColorTokens.Blue.container, Modifier.weight(1f), onOpenReservation)
                QuickToolItem(Icons.Outlined.Chair, "座位预约", ColorTokens.Teal.foreground, ColorTokens.Teal.container, Modifier.weight(1f), onOpenLibrarySeatReservation)
                QuickToolItem(Icons.Outlined.WaterDrop, "饮水机", MaterialTheme.colorScheme.tertiary, MaterialTheme.colorScheme.tertiaryContainer, Modifier.weight(1f), onOpenWaterValve)
            }
            AppDivider()
            AppActionRow("学习通签到", subtitle = "课程活动、位置签到与官方记录", icon = Icons.Outlined.School, onClick = onOpenChaoxing)
        }
    }
}

@Composable
private fun QuickToolItem(
    icon: ImageVector,
    label: String,
    accent: Color,
    accentPale: Color,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(20.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        QuickActionGlassTile(icon, accent, accentPale, modifier = Modifier.size(42.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            minLines = 2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun cleanCampusAmount(value: String): String = value
    .removePrefix("¥")
    .removePrefix("￥")
    .trim()

private fun formatCampusAmount(value: String): String = value
    .takeIf { it.startsWith("¥") || it.startsWith("￥") }
    ?: "¥$value"
