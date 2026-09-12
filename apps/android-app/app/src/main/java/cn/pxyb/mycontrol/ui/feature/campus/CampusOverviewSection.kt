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
import androidx.compose.material.icons.outlined.QrCode
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusGpa
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.QuickActionGlassTile
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun CampusOverviewSection(
    overview: CampusOverview?,
    onOpenFreeClassrooms: () -> Unit,
    onOpenReservation: () -> Unit,
    onOpenLibrarySeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
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
            )
            AppEmptyState("校园信息正在同步", detail = "连接学校账号后，会显示成绩、空教室、一卡通和宿舍能耗。")
        }
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        SmartCardView(
            balance = overview.cardBalance,
            waterCode = overview.waterCode,
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

        CampusQuickToolsGrid(
            onOpenFreeClassrooms = onOpenFreeClassrooms,
            onOpenReservation = onOpenReservation,
            onOpenLibrarySeatReservation = onOpenLibrarySeatReservation,
            onOpenWaterValve = onOpenWaterValve,
        )
    }
}

@Composable
private fun SmartCardView(
    balance: String?,
    waterCode: String?,
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
                    Text("校园一卡通", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "校园账户与用水信息",
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
                Text(
                    balance?.takeIf(String::isNotBlank)?.let(::formatCampusAmount) ?: "¥ --",
                    style = MaterialTheme.typography.displaySmall,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            if (!waterCode.isNullOrBlank()) {
                AppDivider()
                AppDetailRow(label = "用水码", value = waterCode, icon = Icons.Outlined.QrCode)
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

    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIconTile(
                    Icons.Outlined.Bolt,
                    if (isWarning) ColorTokens.Amber.foreground else ColorTokens.Sky.foreground,
                    if (isWarning) ColorTokens.Amber.container else ColorTokens.Sky.container,
                    modifier = Modifier.size(36.dp),
                )
                Text("宿舍电费", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("可用余额", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    energyBalance?.takeIf(String::isNotBlank)?.let(::formatCampusAmount) ?: "¥ --",
                    style = MaterialTheme.typography.headlineMedium,
                    color = if (isWarning) ColorTokens.Amber.foreground else MaterialTheme.colorScheme.onSurface,
                )
            }

            AppDivider()
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    roomName?.takeIf(String::isNotBlank) ?: "暂未同步宿舍",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    when {
                        amountVal == null -> "暂未同步余额"
                        isWarning -> "余额偏低，建议充值"
                        else -> "余额充足"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isWarning) ColorTokens.Amber.foreground else MaterialTheme.colorScheme.onSurfaceVariant,
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
    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AppIconTile(Icons.Outlined.School, ColorTokens.Purple.foreground, ColorTokens.Purple.container, modifier = Modifier.size(36.dp))
                Text("学业绩点", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("综合 GPA", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    gpa?.overall?.takeIf(String::isNotBlank) ?: "--",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            AppDivider()
            Column {
                AppDetailRow(label = "核心", value = gpa?.core.orEmpty())
                AppDetailRow(label = "必修", value = gpa?.required.orEmpty())
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
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        AppSectionHeader(title = "校园快捷服务", subtitle = "预约、自习与日常用水")
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
            .clickable(role = androidx.compose.ui.semantics.Role.Button, onClick = onClick)
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

private fun formatCampusAmount(value: String): String = value
    .takeIf { it.startsWith("¥") || it.startsWith("￥") }
    ?: "¥$value"
