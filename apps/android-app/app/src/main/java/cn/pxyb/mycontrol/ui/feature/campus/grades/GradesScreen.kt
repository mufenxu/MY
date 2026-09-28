package cn.pxyb.mycontrol.ui.feature.campus.grades

import cn.pxyb.mycontrol.util.readBoundedBytes
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.platform.LocalContext
import cn.pxyb.mycontrol.data.CampusGpa
import cn.pxyb.mycontrol.ui.components.button.*
import cn.pxyb.mycontrol.ui.components.display.AppSwitchRow
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun GradesScreen(state: GradesUiState, official: CampusGpa?, contentPadding: PaddingValues, onBack: () -> Unit,
    onLoad: () -> Unit, onSave: (List<GradeRecord>) -> Unit, onRemove: (String) -> Unit, onSavePlan: (GradePlan) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var term by rememberSaveable { mutableStateOf("") }
    var course by rememberSaveable { mutableStateOf("") }
    var credits by rememberSaveable { mutableStateOf("") }
    var score by rememberSaveable { mutableStateOf("") }
    var points by rememberSaveable { mutableStateOf("") }
    var earned by rememberSaveable { mutableStateOf(true) }
    var target by rememberSaveable(state.plan.targetGpa) { mutableStateOf(state.plan.targetGpa?.toString().orEmpty()) }
    var future by rememberSaveable(state.plan.futureCredits) { mutableStateOf(state.plan.futureCredits?.toString().orEmpty()) }
    var requiredCredits by rememberSaveable(state.plan.requiredCredits) { mutableStateOf(state.plan.requiredCredits?.toString().orEmpty()) }
    var preview by remember { mutableStateOf<List<GradeRecord>>(emptyList()) }
    var previewSubmitted by remember { mutableStateOf(false) }
    var importError by remember { mutableStateOf<String?>(null) }
    var importing by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            importing = true; importError = null
            try { preview = withContext(Dispatchers.IO) {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBoundedBytes(500_000) } ?: error("无法读取文件。")
                require(bytes.size <= 500_000) { "CSV 文件不能超过 500 KB。" }
                parseGradeCsv(bytes.toString(Charsets.UTF_8))
            } } catch (error: Exception) { if (error is kotlinx.coroutines.CancellationException) throw error; importError = error.message ?: "导入失败。" }
            finally { importing = false }
        }
    }
    LaunchedEffect(Unit) { onLoad() }
    LaunchedEffect(state.records, previewSubmitted) {
        if (previewSubmitted && preview.isNotEmpty() && preview.all { it in state.records }) {
            preview = emptyList()
            previewSubmitted = false
        }
    }
    val summary = remember(state.records) { summarizeGrades(state.records) }
    val credit = credits.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }
    val point = points.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }
    AppSubPage("成绩与学分", onBack, contentPadding, subtitle = "个人成绩记录与目标规划", pinHeader = true) {
        item { AppFeedbackBanner("官方汇总 GPA：${official?.overall ?: "尚未同步"}。以下明细为个人录入或导入，仅保存在本机并按账号加密；尚未接通学校单科成绩接口。", false) }
        (state.error ?: importError)?.let { item { AppFeedbackBanner(it, true, onRetry = onLoad) } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("已获 ${"%.1f".format(summary.earnedCredits)} 学分", style = MaterialTheme.typography.titleLarge)
            Text("记录加权 GPA：${summary.gpa?.let { "%.3f".format(it) } ?: "暂无"}")
            if (summary.gpaCredits < summary.credits) Text("未填写绩点的课程未计入 GPA；当前仅覆盖 ${summary.gpaCredits} 学分。")
            AppTextField(requiredCredits, { requiredCredits = it }, label = "毕业所需学分（按本专业要求填写）")
            requiredCredits.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }?.let { Text("还需 ${"%.1f".format((it - summary.earnedCredits).coerceAtLeast(0.0))} 学分；课程类别要求需另行核对。") }
        }
        } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("新增或更新成绩", style = MaterialTheme.typography.titleMedium)
            AppTextField(term, { term = it }, label = "学期")
            AppTextField(course, { course = it }, label = "课程名称")
            AppTextField(credits, { credits = it }, label = "学分")
            AppTextField(score, { score = it }, label = "原始成绩（可填文字等级）")
            AppTextField(points, { points = it }, label = "学校给出的绩点（可留空）")
            AppSwitchRow("已获得该课程学分", earned, { earned = it })
            AppButton(text = "保存成绩", onClick = { credit?.let { onSave(listOf(GradeRecord(term.trim(), course.trim(), it, score.trim(), point, earned))) } },
                enabled = state.loaded && term.isNotBlank() && course.isNotBlank() && credit != null && (points.isBlank() || point != null), loading = state.loading)
            Text("同学期同名课程会更新原记录；重修请在课程名中区分。", style = MaterialTheme.typography.bodySmall)
            AppSecondaryButton(text = if (importing) "读取中…" else "导入 CSV 成绩单", onClick = { launcher.launch(arrayOf("text/*", "application/csv", "application/vnd.ms-excel")) }, enabled = !importing && state.loaded)
            Text("UTF-8 CSV 表头：学期,课程,学分,成绩,绩点,已获学分\n已获学分填“是”或“否”；导入后先预览，再确认保存。", style = MaterialTheme.typography.bodySmall)
        }
        } }
        if (preview.isNotEmpty()) item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("待导入 ${preview.size} 条成绩", style = MaterialTheme.typography.titleMedium)
            preview.forEach { Text("${it.term} · ${it.course} · ${it.credits} 学分 · ${it.score}") }
            AppButton(text = "确认合并导入", onClick = { previewSubmitted = true; onSave(preview) }, loading = state.loading)
            AppSecondaryButton(text = "取消导入", onClick = { preview = emptyList() })
        }
        } }
        item { AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("目标绩点计算", style = MaterialTheme.typography.titleMedium)
            AppTextField(target, { target = it }, label = "目标累计 GPA")
            AppTextField(future, { future = it }, label = "后续计入 GPA 的学分")
            val targetValue = target.toDoubleOrNull()?.takeIf { it.isFinite() && it >= 0 }
            val futureValue = future.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }
            val requiredValue = requiredCredits.toDoubleOrNull()?.takeIf { it.isFinite() && it > 0 }
            AppButton("保存学分与绩点目标", onClick = { onSavePlan(GradePlan(requiredValue, targetValue, futureValue)) },
                enabled = state.loaded && (requiredCredits.isBlank() || requiredValue != null) && (target.isBlank() || targetValue != null) && (future.isBlank() || futureValue != null), loading = state.loading)
            if (targetValue != null && futureValue != null && summary.gpaCredits > 0) {
                val needed = ((summary.gpaCredits + futureValue) * targetValue - summary.weightedPoints) / futureValue
                Text("后续平均绩点需达到 ${"%.3f".format(needed.coerceAtLeast(0.0))}")
                Text("仅按已填写绩点的记录计算。是否可达到以及对应分数，请按学校绩点满分与换算规则判断。", style = MaterialTheme.typography.bodySmall)
            }
        }
        } }
        state.records.groupBy { it.term }.toSortedMap().forEach { (termLabel, records) ->
            item { val stats = summarizeGrades(records); Text("$termLabel · GPA ${stats.gpa?.let { "%.3f".format(it) } ?: "暂无"} · 已获 ${stats.earnedCredits} 学分", style = MaterialTheme.typography.titleMedium) }
            items(records, key = { it.key }) { row -> AppPanel {
            Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(row.course, style = MaterialTheme.typography.titleMedium)
                Text("${row.credits} 学分 · 成绩 ${row.score.ifBlank { "未填" }} · 绩点 ${row.points ?: "未填"}")
                AppSecondaryButton(text = "载入编辑表单", onClick = { term = row.term; course = row.course; credits = row.credits.toString(); score = row.score; points = row.points?.toString().orEmpty(); earned = row.earned })
                if (removing == row.key) {
                    AppDangerButton(text = "确认删除这条成绩", onClick = { onRemove(row.key); removing = null })
                    AppSecondaryButton(text = "取消", onClick = { removing = null })
                } else AppSecondaryButton(text = "删除", onClick = { removing = row.key })
            }
        } }
        }
    }
}
