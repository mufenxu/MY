package cn.pxyb.mycontrol.ui.feature.campus.energy

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.*
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.*
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.*
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

@Composable
fun EnergyScreen(state: EnergyUiState, contentPadding: PaddingValues, onBack: () -> Unit, onLoad: (String) -> Unit, onSave: (Boolean, Double) -> Unit) {
    var threshold by rememberSaveable(state.threshold) { mutableStateOf(state.threshold.toString()) }
    var enabled by rememberSaveable(state.enabled) { mutableStateOf(state.enabled) }
    val parsedThreshold = threshold.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }
    LaunchedEffect(Unit) { onLoad(state.month) }
    AppSubPage("电费账单与提醒", onBack, contentPadding, subtitle = "官方账单与本机积累的每日用量", refreshing = state.loading, onRefresh = { onLoad(state.month) }) {
        state.error?.let { item { AppFeedbackBanner(it, true, onRetry = { onLoad(state.month) }) } }
        item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            AppSecondaryButton(text = "上月", onClick = { onLoad(YearMonth.parse(state.month).minusMonths(1).toString()) }, enabled = !state.loading)
            Text(state.month, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            AppSecondaryButton(text = "下月", onClick = { onLoad(YearMonth.parse(state.month).plusMonths(1).toString()) }, enabled = !state.loading && YearMonth.parse(state.month) < YearMonth.now())
        } }
        if (state.loading && !state.loaded) item { AppSkeletonList() }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("当前余额", style = MaterialTheme.typography.titleMedium)
            Text(state.balance?.let { "%.2f 元".format(it) } ?: "暂无余额数据", style = MaterialTheme.typography.headlineMedium)
            state.rows.forEach { cn.pxyb.mycontrol.ui.components.display.AppDetailRow(label = it.label, value = it.value) }
            if (state.loaded && state.rows.isEmpty()) Text("学校未返回本月账单明细。")
        }
        } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("低余额提醒", style = MaterialTheme.typography.titleMedium)
            AppSwitchRow("提醒我充值", enabled, { enabled = it })
            AppTextField(threshold, { threshold = it }, label = "余额低于多少元时提醒", errorMessage = if (parsedThreshold == null) "请输入非负金额" else null)
            AppButton(modifier = Modifier.fillMaxWidth(), text = "保存设置", onClick = { parsedThreshold?.let { onSave(enabled, it) } }, enabled = parsedThreshold != null, loading = state.loading)
            Text("每个账号每天最多提醒一次。刷新或允许后台同步时检查；后台受限、会话锁定时无法及时获取新余额。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        } }
        val recent = state.history.filter { it.date.startsWith(YearMonth.now().toString()) && it.fee != null }.sortedBy { it.date }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("余额预计可用天数", style = MaterialTheme.typography.titleMedium)
            val first = recent.firstOrNull()
            val last = recent.lastOrNull()
            val days = if (first != null && last != null) ChronoUnit.DAYS.between(LocalDate.parse(first.date), LocalDate.parse(last.date)) else 0
            val cost = if (first?.fee != null && last?.fee != null) last.fee - first.fee else 0.0
            Text(if (days >= 3 && cost > 0 && state.balance != null) "约 ${(state.balance.coerceAtLeast(0.0) / (cost / days)).toInt()} 天（按已记录电费增量估算）" else "需要至少跨 3 天的有效电费记录，暂不估算。")
            Text("充值、计费调整或用电习惯变化会影响估算。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        } }
        item { Text("每日记录与用量变化", style = MaterialTheme.typography.titleMedium) }
        items(state.history.sortedByDescending { it.date }, key = { it.date }) { row ->
            val previous = state.history.firstOrNull { it.date == LocalDate.parse(row.date).minusDays(1).toString() && it.date.take(7) == row.date.take(7) }
            val delta = if (row.kwh != null && previous?.kwh != null) (row.kwh - previous.kwh).takeIf { it >= 0 } else null
            AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(row.date)
                Text("余额 ${row.balance?.let { "%.2f 元".format(it) } ?: "未知"} · ${delta?.let { "较前日增加 %.2f 度".format(it) } ?: "用量数据尚不连续"}")
                if (delta != null && previous?.kwh != null) {
                    val older = state.history.firstOrNull { it.date == LocalDate.parse(row.date).minusDays(2).toString() && it.date.take(7) == row.date.take(7) }
                    val before = older?.kwh?.let { previous.kwh - it }
                    if (before != null && before > 0 && delta > before * 2) Text("用量较前一日超过一倍，可关注电器使用情况。", color = MaterialTheme.colorScheme.error)
                }
            }
        }
        }
    }
}
