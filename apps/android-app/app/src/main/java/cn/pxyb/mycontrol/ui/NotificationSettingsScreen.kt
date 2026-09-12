package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AlertPreferences
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal

@Composable
fun NotificationSettingsScreen(
    preferences: AlertPreferences,
    notificationsEnabled: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRequestNotifications: () -> Unit,
    onSave: (AlertPreferences, (String?) -> Unit) -> Unit,
) {
    var quietEnabled by rememberSaveable { mutableStateOf(preferences.quietHoursEnabled) }
    var quietStart by rememberSaveable { mutableStateOf(preferences.quietStartHour) }
    var quietEnd by rememberSaveable { mutableStateOf(preferences.quietEndHour) }
    var severity by rememberSaveable { mutableStateOf(preferences.severityFilter) }
    var incidentAlerts by rememberSaveable { mutableStateOf(preferences.incidentAlerts) }
    var iotAlerts by rememberSaveable { mutableStateOf(preferences.iotAlerts) }
    var campusAlerts by rememberSaveable { mutableStateOf(preferences.campusAlerts) }
    var backupAlerts by rememberSaveable { mutableStateOf(preferences.backupAlerts) }
    var dailyBriefEnabled by rememberSaveable { mutableStateOf(preferences.dailyBriefEnabled) }
    var morningHour by rememberSaveable { mutableStateOf(preferences.morningBriefHour) }
    var eveningHour by rememberSaveable { mutableStateOf(preferences.eveningBriefHour) }
    var classFocusEnabled by rememberSaveable { mutableStateOf(preferences.classFocusEnabled) }
    var pickingHour by rememberSaveable { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var saveError by remember { mutableStateOf<String?>(null) }
    val draft = preferences.copy(
        quietHoursEnabled = quietEnabled,
        quietStartHour = quietStart,
        quietEndHour = quietEnd,
        severityFilter = severity,
        incidentAlerts = incidentAlerts,
        iotAlerts = iotAlerts,
        campusAlerts = campusAlerts,
        backupAlerts = backupAlerts,
        dailyBriefEnabled = dailyBriefEnabled,
        morningBriefHour = morningHour,
        eveningBriefHour = eveningHour,
        classFocusEnabled = classFocusEnabled,
    )

    AppSubPage(
        title = "通知设置",
        subtitle = "免打扰、业务订阅与每日简报",
        contentPadding = contentPadding,
        onBack = onBack,
        pinHeader = true,
    ) {
        item(key = "permission") {
            AppPanel {
                AppActionRow(
                    title = "系统通知权限",
                    subtitle = if (notificationsEnabled) "已开启，可接收设备推送" else "尚未开启，点击允许通知",
                    icon = Icons.Outlined.NotificationsActive,
                    onClick = if (notificationsEnabled) null else onRequestNotifications,
                    trailingContent = null,
                )
            }
        }
        item(key = "quiet-title") { SectionHeader("免打扰与专注", "设置普通提醒的接收时段") }
        item(key = "quiet") {
            AppPanel {
                AppSwitchRow("启用安静时段", quietEnabled, { quietEnabled = it }, enabled = !saving, subtitle = "时段内保留通知历史，减少推送打扰")
                if (quietEnabled) {
                    AppDivider()
                    AppActionRow("开始时间", subtitle = "%02d:00".format(quietStart), icon = Icons.Outlined.AccessTime, enabled = !saving, onClick = { pickingHour = "start" })
                    AppDivider()
                    AppActionRow("结束时间", subtitle = "%02d:00".format(quietEnd), icon = Icons.Outlined.AccessTime, enabled = !saving, onClick = { pickingHour = "end" })
                }
                AppDivider()
                AppSwitchRow("上课专注模式", classFocusEnabled, { classFocusEnabled = it }, enabled = !saving, subtitle = "上课期间静音普通提醒，紧急故障仍会通知")
            }
        }
        item(key = "severity-title") { SectionHeader("告警接收级别", "选择需要收到的告警范围") }
        item(key = "severity") {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("all" to "全部告警", "critical_only" to "仅紧急故障", "none" to "全部静音").forEach { (value, label) ->
                    AppFilterChip(label = label, selected = severity == value, onClick = { if (!saving) severity = value })
                }
            }
        }
        item(key = "subscriptions-title") { SectionHeader("业务订阅", "按功能选择需要关注的提醒") }
        item(key = "subscriptions") {
            AppPanel {
                AppSwitchRow("系统与服务", incidentAlerts, { incidentAlerts = it }, enabled = !saving, subtitle = "服务故障与运维提醒")
                AppDivider()
                AppSwitchRow("设备与自动化", iotAlerts, { iotAlerts = it }, enabled = !saving, subtitle = "智能设备与节点状态")
                AppDivider()
                AppSwitchRow("校园与课程", campusAlerts, { campusAlerts = it }, enabled = !saving, subtitle = "课程与校园日程提醒")
                AppDivider()
                AppSwitchRow("备份与巡检", backupAlerts, { backupAlerts = it }, enabled = !saving, subtitle = "备份结果与系统体检报告")
            }
        }
        item(key = "brief-title") { SectionHeader("每日简报", "汇总课程、待办与需要关注的事项") }
        item(key = "brief") {
            AppPanel {
                AppSwitchRow("启用每日简报", dailyBriefEnabled, { dailyBriefEnabled = it }, enabled = !saving)
                if (dailyBriefEnabled) {
                    AppDivider()
                    AppActionRow("早报时间", subtitle = "%02d:00".format(morningHour), icon = Icons.Outlined.AccessTime, enabled = !saving, onClick = { pickingHour = "morning" })
                    AppDivider()
                    AppActionRow("晚报时间", subtitle = "%02d:00".format(eveningHour), icon = Icons.Outlined.AccessTime, enabled = !saving, onClick = { pickingHour = "evening" })
                }
            }
        }
        saveError?.let { message -> item(key = "save-error") { FeedbackBanner(message, error = true) } }
        item(key = "save") {
            AppButton(
                text = "保存设置",
                loading = saving,
                enabled = !saving && draft != preferences,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    saving = true
                    saveError = null
                    onSave(draft) { error ->
                        saving = false
                        saveError = error
                    }
                },
            )
        }
    }
    pickingHour?.let { target ->
        val hour = when (target) { "start" -> quietStart; "end" -> quietEnd; "morning" -> morningHour; else -> eveningHour }
        AppTimePickerModal(
            title = when (target) { "start" -> "安静时段开始"; "end" -> "安静时段结束"; "morning" -> "早报时间"; else -> "晚报时间" },
            currentTime = "%02d:00".format(hour),
            minuteStep = 60,
            onDismiss = { pickingHour = null },
            onConfirm = { time ->
                val selected = time.substringBefore(':').toInt()
                when (target) { "start" -> quietStart = selected; "end" -> quietEnd = selected; "morning" -> morningHour = selected; else -> eveningHour = selected }
                pickingHour = null
            },
        )
    }
}
