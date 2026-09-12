package cn.pxyb.mycontrol.ui.feature.overview

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Newspaper
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.HomeQuickAction
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.QuickActionGlassTile
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.interaction.pressFeedback
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

internal data class HomeQuickActionSpec(
    val icon: ImageVector,
    val label: String,
    val accent: Color,
    val accentPale: Color,
    val onClick: () -> Unit,
)

private data class QuickActionVisual(
    val icon: ImageVector,
    val accent: Color,
)

@Composable
private fun homeQuickActionVisual(action: HomeQuickAction): QuickActionVisual = when (action) {
    HomeQuickAction.Today -> QuickActionVisual(Icons.Outlined.CalendarMonth, ColorTokens.Blue.foreground)
    HomeQuickAction.Notifications -> QuickActionVisual(Icons.Outlined.Notifications, ColorTokens.Pink.foreground)
    HomeQuickAction.DailyNews -> QuickActionVisual(Icons.Outlined.Newspaper, ColorTokens.Teal.foreground)
    HomeQuickAction.Scenes -> QuickActionVisual(Icons.Outlined.Tune, ColorTokens.Purple.foreground)
    HomeQuickAction.Reservation -> QuickActionVisual(Icons.Outlined.MeetingRoom, ColorTokens.Blue.foreground)
    HomeQuickAction.FreeClassrooms -> QuickActionVisual(Icons.Outlined.School, ColorTokens.Sky.foreground)
    HomeQuickAction.SeatReservation -> QuickActionVisual(Icons.Outlined.Chair, ColorTokens.Green.foreground)
    HomeQuickAction.WaterValve -> QuickActionVisual(Icons.Outlined.WaterDrop, ColorTokens.Sky.foreground)
    HomeQuickAction.Devices -> QuickActionVisual(Icons.Outlined.Hub, ColorTokens.Sky.foreground)
    HomeQuickAction.Diagnostics -> QuickActionVisual(Icons.Outlined.Speed, ColorTokens.Amber.foreground)
    HomeQuickAction.Backup -> QuickActionVisual(Icons.Outlined.Backup, ColorTokens.Teal.foreground)
    HomeQuickAction.GoogleAccounts -> QuickActionVisual(Icons.Outlined.Email, ColorTokens.Indigo.foreground)
    HomeQuickAction.Operations -> QuickActionVisual(Icons.Outlined.Settings, MaterialTheme.colorScheme.onSurfaceVariant)
    HomeQuickAction.Account -> QuickActionVisual(Icons.Outlined.Security, ColorTokens.Green.foreground)
}

@Composable
internal fun homeQuickActionSpec(
    action: HomeQuickAction,
    onSelectTab: (MainTab) -> Unit,
    onRunDiagnostics: () -> Unit,
    onTriggerBackup: () -> Unit,
    onOpenGoogleAccountDesk: () -> Unit,
    onOpenOperations: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenReservation: () -> Unit,
    onOpenFreeClassrooms: () -> Unit,
    onOpenSeatReservation: () -> Unit,
    onOpenWaterValve: () -> Unit,
    onOpenDailyNews: () -> Unit,
    onOpenSearch: () -> Unit,
    onOpenQrLogin: () -> Unit,
    onOpenAccountManagement: () -> Unit,
): HomeQuickActionSpec = when (action) {
    HomeQuickAction.Today -> HomeQuickActionSpec(
        icon = Icons.Outlined.CalendarMonth,
        label = "今日安排",
        accent = ColorTokens.Blue.foreground,
        accentPale = ColorTokens.Blue.container,
    ) { onOpenWorkspace(WorkspaceDestination.Today) }

    HomeQuickAction.Notifications -> HomeQuickActionSpec(
        icon = Icons.Outlined.Notifications,
        label = "通知中心",
        accent = ColorTokens.Pink.foreground,
        accentPale = ColorTokens.Pink.container,
    ) { onOpenWorkspace(WorkspaceDestination.Notifications) }

    HomeQuickAction.DailyNews -> HomeQuickActionSpec(
        icon = Icons.Outlined.Newspaper,
        label = "每日新闻",
        accent = ColorTokens.Teal.foreground,
        accentPale = ColorTokens.Teal.container,
        onClick = onOpenDailyNews,
    )

    HomeQuickAction.Scenes -> HomeQuickActionSpec(
        icon = Icons.Outlined.Tune,
        label = "场景与自动化",
        accent = ColorTokens.Purple.foreground,
        accentPale = ColorTokens.Purple.container,
    ) { onOpenWorkspace(WorkspaceDestination.Scenes) }

    HomeQuickAction.Reservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.MeetingRoom,
        label = "研讨间预约",
        accent = ColorTokens.Blue.foreground,
        accentPale = ColorTokens.Blue.container,
        onClick = onOpenReservation,
    )

    HomeQuickAction.FreeClassrooms -> HomeQuickActionSpec(
        icon = Icons.Outlined.School,
        label = "空闲教室",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
        onClick = onOpenFreeClassrooms,
    )

    HomeQuickAction.SeatReservation -> HomeQuickActionSpec(
        icon = Icons.Outlined.Chair,
        label = "座位预约",
        accent = ColorTokens.Green.foreground,
        accentPale = ColorTokens.Green.container,
        onClick = onOpenSeatReservation,
    )

    HomeQuickAction.WaterValve -> HomeQuickActionSpec(
        icon = Icons.Outlined.WaterDrop,
        label = "饮水机",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
        onClick = onOpenWaterValve,
    )

    HomeQuickAction.Devices -> HomeQuickActionSpec(
        icon = Icons.Outlined.Hub,
        label = "设备控制",
        accent = ColorTokens.Sky.foreground,
        accentPale = ColorTokens.Sky.container,
    ) { onSelectTab(MainTab.Tools) }

    HomeQuickAction.Diagnostics -> HomeQuickActionSpec(
        icon = Icons.Outlined.Speed,
        label = "一键巡检",
        accent = ColorTokens.Amber.foreground,
        accentPale = ColorTokens.Amber.container,
        onClick = onRunDiagnostics,
    )

    HomeQuickAction.Backup -> HomeQuickActionSpec(
        icon = Icons.Outlined.Backup,
        label = "数据备份",
        accent = ColorTokens.Teal.foreground,
        accentPale = ColorTokens.Teal.container,
        onClick = onTriggerBackup,
    )

    HomeQuickAction.GoogleAccounts -> HomeQuickActionSpec(
        icon = Icons.Outlined.Email,
        label = "Google 邮箱台账",
        accent = ColorTokens.Indigo.foreground,
        accentPale = ColorTokens.Indigo.container,
        onClick = onOpenGoogleAccountDesk,
    )

    HomeQuickAction.Operations -> HomeQuickActionSpec(
        icon = Icons.Outlined.Settings,
        label = "系统状态",
        accent = MaterialTheme.colorScheme.onSurfaceVariant,
        accentPale = MaterialTheme.colorScheme.surfaceContainerLow,
        onClick = onOpenOperations,
    )

    HomeQuickAction.Account -> HomeQuickActionSpec(
        icon = Icons.Outlined.Security,
        label = "账号与安全",
        accent = ColorTokens.Green.foreground,
        accentPale = ColorTokens.Green.container,
        onClick = onOpenAccountManagement,
    )
}

@Composable
internal fun QuickActionsDialog(
    order: List<HomeQuickAction>,
    hidden: Set<HomeQuickAction>,
    onDismiss: () -> Unit,
    onSave: (List<HomeQuickAction>, Set<HomeQuickAction>) -> Unit,
) {
    var localOrder by remember(order) { mutableStateOf(order) }
    var localHidden by remember(hidden) { mutableStateOf(hidden) }
    val visibleCount = localOrder.count { it !in localHidden }
    val dark = isAppInDarkTheme()
    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.Edit,
        title = "调整快捷操作",
        subtitle = "已显示 $visibleCount 项 · 开关控制显示，箭头调整顺序",
        modifier = Modifier.heightIn(max = 700.dp),
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "保存配置",
                    onClick = { onSave(localOrder, localHidden) },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(max = 520.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            localOrder.forEachIndexed { index, action ->
                val isChecked = action !in localHidden
                val visual = homeQuickActionVisual(action)
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = glassCardColor(),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.padding(start = 12.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(13.dp))
                                .background(visual.accent.copy(alpha = if (dark) 0.20f else 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = visual.icon,
                                contentDescription = null,
                                tint = visual.accent,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                        Column(
                            modifier = Modifier.weight(1f),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                text = homeQuickActionLabel(action),
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 14.5.sp,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                            Text(
                                text = if (isChecked) "已显示" else "已隐藏",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                color = if (isChecked) MaterialTheme.colorScheme.onSurfaceVariant
                                        else MaterialTheme.colorScheme.outline,
                            )
                        }
                        AppSwitch(
                            checked = isChecked,
                            enabled = isChecked || visibleCount > 1,
                            onCheckedChange = { checked ->
                                localHidden = if (checked) localHidden - action else localHidden + action
                            },
                            tint = visual.accent,
                        )
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            QuickActionArrowButton(
                                up = true,
                                enabled = index > 0,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index - 1, item)
                                    }
                                },
                            )
                            QuickActionArrowButton(
                                up = false,
                                enabled = index < localOrder.lastIndex,
                                onClick = {
                                    localOrder = localOrder.toMutableList().also {
                                        val item = it.removeAt(index)
                                        it.add(index + 1, item)
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QuickActionArrowButton(
    up: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Box(
        modifier = Modifier
            .size(26.dp)
            .clip(RoundedCornerShape(9.dp))
            .background(
                if (enabled) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
                else Color.Transparent
            )
            .pressFeedback(interactionSource, pressedScale = 0.88f)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (up) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown,
            contentDescription = if (up) "上移" else "下移",
            tint = if (enabled) MaterialTheme.colorScheme.onSurfaceVariant
                   else MaterialTheme.colorScheme.outlineVariant,
            modifier = Modifier.size(16.dp),
        )
    }
}

private fun homeQuickActionLabel(action: HomeQuickAction): String = when (action) {
    HomeQuickAction.Today -> "今日安排"
    HomeQuickAction.Notifications -> "通知中心"
    HomeQuickAction.DailyNews -> "每日新闻"
    HomeQuickAction.Scenes -> "场景与自动化"
    HomeQuickAction.Reservation -> "研讨间预约"
    HomeQuickAction.FreeClassrooms -> "空闲教室"
    HomeQuickAction.SeatReservation -> "座位预约"
    HomeQuickAction.WaterValve -> "饮水机"
    HomeQuickAction.Devices -> "设备控制"
    HomeQuickAction.Diagnostics -> "系统自检"
    HomeQuickAction.Backup -> "数据备份"
    HomeQuickAction.GoogleAccounts -> "Google 邮箱台账"
    HomeQuickAction.Operations -> "系统状态"
    HomeQuickAction.Account -> "账号与安全"
}

@Composable
internal fun QuickAction(
    icon: ImageVector,
    label: String,
    accent: Color,
    accentPale: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }

    Column(
        modifier = modifier
            .pressFeedback(interactionSource, pressedScale = 0.90f)
            .clip(RoundedCornerShape(16.dp))
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .padding(vertical = 4.dp, horizontal = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        QuickActionGlassTile(
            icon = icon,
            accent = accent,
            accentPale = accentPale,
            modifier = Modifier.size(38.dp),
            iconSize = 20.dp,
            contentDescription = label,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Medium,
                fontSize = 11.5.sp,
                letterSpacing = (-0.1).sp,
            ),
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            minLines = 2,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
