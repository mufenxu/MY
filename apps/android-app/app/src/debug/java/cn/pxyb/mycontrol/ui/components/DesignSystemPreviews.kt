package cn.pxyb.mycontrol.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppAvatar
import cn.pxyb.mycontrol.ui.components.display.AppGroupedCard
import cn.pxyb.mycontrol.ui.components.display.AppMetricCard
import cn.pxyb.mycontrol.ui.components.display.AppMetricDashboard
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackType
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppPickerField
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.theme.MYControlTheme

@Preview(name = "浅色", widthDp = 390, heightDp = 1100)
@Preview(name = "大字号", widthDp = 390, heightDp = 1400, fontScale = 1.5f)
@Composable
private fun LightComponentsPreview() = ComponentsPreview(dark = false)

@Preview(name = "深色", widthDp = 390, heightDp = 1100)
@Composable
private fun DarkComponentsPreview() = ComponentsPreview(dark = true)

@Composable
private fun ComponentsPreview(dark: Boolean) {
    MYControlTheme(darkTheme = dark) {
        Surface(color = MaterialTheme.colorScheme.background) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)) {
                var input by remember { mutableStateOf("小组课程研讨") }
                var selected by remember { mutableStateOf(true) }
                Text("公共组件", style = MaterialTheme.typography.headlineSmall)
                AppGroupedCard {
                    AppActionRow("账号与安全", subtitle = "密码、登录设备与多重验证", onClick = {},
                        trailingContent = { AppAvatar("MY") })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppFilterChip("已选中", selected, { selected = !selected })
                    AppFilterChip("未选中", !selected, { selected = !selected })
                    AppFilterChip("不可用", false, {}, enabled = false)
                }
                AppTextField(input, { input = it }, label = "申请主题")
                AppTextField("", {}, label = "联系电话", errorMessage = "请填写联系电话")
                AppPickerField("预约日期", "2026-10-03", {}, icon = Icons.Outlined.CalendarMonth)
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    AppButton("确认", {}, modifier = Modifier.weight(1f))
                    AppSecondaryButton("取消", {}, modifier = Modifier.weight(1f))
                }
                AppButton("处理中", {}, loading = true, modifier = Modifier.fillMaxWidth())
                AppDangerButton("删除", {}, enabled = false, modifier = Modifier.fillMaxWidth())
                AppFeedbackBanner("操作已保存", autoDismissDurationMillis = null)
                AppFeedbackBanner("当前展示离线快照，联网后继续同步。", type = AppFeedbackType.Info, showCloseButton = false)
                AppFeedbackBanner("部分数据暂不可用", type = AppFeedbackType.Error, onRetry = {})
                AppMetricDashboard(metrics = listOf(
                    { AppMetricCard("待办", "12") },
                    { AppMetricCard("已完成", "8") },
                ))
            }
        }
    }
}
