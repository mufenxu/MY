package cn.pxyb.mycontrol.ui.feature.campus.grades

import android.content.Context
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import cn.pxyb.mycontrol.data.accountStorageScope
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class GradeRecord(val term: String, val course: String, val credits: Double, val score: String, val points: Double?, val earned: Boolean) {
    val key: String get() = "$term\u0000$course"
}
data class GradeSummary(val credits: Double, val earnedCredits: Double, val gpaCredits: Double, val weightedPoints: Double) {
    val gpa: Double? get() = if (gpaCredits > 0) weightedPoints / gpaCredits else null
}
fun summarizeGrades(rows: List<GradeRecord>) = GradeSummary(rows.sumOf { it.credits }, rows.filter { it.earned }.sumOf { it.credits },
    rows.filter { it.points != null }.sumOf { it.credits }, rows.sumOf { it.credits * (it.points ?: 0.0) })

fun parseGradeCsv(csv: String): List<GradeRecord> {
    require(csv.length <= 500_000) { "成绩文件过大，请限制在 500 KB 内。" }
    val rows = mutableListOf<List<String>>()
    val row = mutableListOf<String>()
    val field = StringBuilder()
    var quoted = false
    var index = 0
    val input = csv.removePrefix("\uFEFF")
    while (index < input.length) {
        val char = input[index]
        when {
            char == '"' && quoted && input.getOrNull(index + 1) == '"' -> { field.append('"'); index++ }
            char == '"' -> quoted = !quoted
            !quoted && char == ',' -> { row += field.toString().trim(); field.clear() }
            !quoted && (char == '\n' || char == '\r') -> {
                if (char == '\r' && input.getOrNull(index + 1) == '\n') index++
                row += field.toString().trim(); field.clear()
                if (row.any(String::isNotBlank)) rows += row.toList()
                row.clear()
            }
            else -> field.append(char)
        }
        index++
    }
    require(!quoted) { "CSV 引号未闭合，请检查文件。" }
    row += field.toString().trim()
    if (row.any(String::isNotBlank)) rows += row.toList()
    require(rows.size in 2..501) { "需要表头和 1—500 条成绩。" }
    val headers = rows.first()
    fun column(vararg names: String) = headers.indexOfFirst { header -> names.any { it.equals(header, true) } }
    val term = column("学期", "term")
    val course = column("课程", "course")
    val credits = column("学分", "credits")
    val score = column("成绩", "score")
    val points = column("绩点", "points")
    val earned = column("已获学分", "earned")
    require(term >= 0 && course >= 0 && credits >= 0 && earned >= 0) { "CSV 至少需要：学期、课程、学分、已获学分。" }
    val parsed = rows.drop(1).mapIndexed { i, values ->
        fun at(index: Int) = values.getOrNull(index).orEmpty()
        val value = at(credits).toDoubleOrNull()
        val point = at(points).takeIf(String::isNotBlank)?.toDoubleOrNull()
        require(at(term).isNotBlank() && at(course).isNotBlank() && value != null && value.isFinite() && value > 0) { "第 ${i + 2} 行课程或学分无效。" }
        require(at(points).isBlank() || point != null && point.isFinite() && point >= 0) { "第 ${i + 2} 行绩点无效。" }
        val hasEarned = when (at(earned).lowercase()) { "是", "true", "1" -> true; "否", "false", "0" -> false; else -> error("第 ${i + 2} 行已获学分须填写是或否。") }
        GradeRecord(at(term), at(course), value, at(score), point, hasEarned)
    }
    require(parsed.distinctBy { it.key }.size == parsed.size) { "同一学期包含重复课程，请先合并或区分重修记录。" }
    return parsed
}

data class GradePlan(val requiredCredits: Double? = null, val targetGpa: Double? = null, val futureCredits: Double? = null)
data class GradesUiState(val loading: Boolean = false, val loaded: Boolean = false, val records: List<GradeRecord> = emptyList(), val plan: GradePlan = GradePlan(), val error: String? = null)
class GradesStateHolder(parent: CoroutineScope, context: Context, private val account: () -> String?, onExpired: (String) -> Unit) :
    FeatureStateHolder<GradesUiState>(parent, GradesUiState(), onExpired) {
    private val codec = EncryptedPreferenceCodec(context.getSharedPreferences("academic_records", Context.MODE_PRIVATE), "my_control_academic_records")
    private fun key() = "grades:${checkNotNull(accountStorageScope(account())) { "请先登录。" }}"
    fun load() {
        if (mutableState.value.loaded) return
        launchAction({ loading }, { copy(loading = true, error = null) }, {
            val key = key()
            withContext(Dispatchers.IO) {
                val rows = codec.read(key)?.let(::JSONArray) ?: JSONArray()
                val records = (0 until rows.length()).map { rows.getJSONObject(it) }.map {
                    GradeRecord(it.getString("term"), it.getString("course"), it.getDouble("credits"), it.optString("score"), it.optString("points").toDoubleOrNull(), it.getBoolean("earned"))
                }
                val plan = codec.read("$key:plan")?.let(::JSONObject) ?: JSONObject()
                records to GradePlan(plan.optString("requiredCredits").toDoubleOrNull(), plan.optString("targetGpa").toDoubleOrNull(), plan.optString("futureCredits").toDoubleOrNull())
            }
        }, { copy(loading = false, loaded = true, records = it.first, plan = it.second) }, { copy(loading = false, error = it.message ?: "成绩记录读取失败。") })
    }
    fun savePlan(plan: GradePlan) = launchAction({ loading || !loaded }, { copy(loading = true, error = null) }, {
        require(listOfNotNull(plan.requiredCredits, plan.targetGpa, plan.futureCredits).all { it.isFinite() && it >= 0 }) { "请输入有效的学分和绩点。" }
        val key = key()
        withContext(Dispatchers.IO) { codec.write("$key:plan", JSONObject().put("requiredCredits", plan.requiredCredits).put("targetGpa", plan.targetGpa).put("futureCredits", plan.futureCredits).toString()) }
        plan
    }, { copy(loading = false, plan = it) }, { copy(loading = false, error = it.message ?: "目标保存失败。") })
    fun save(rows: List<GradeRecord>) = persist((mutableState.value.records + rows).associateBy { it.key }.values.toList())
    fun remove(key: String) = persist(mutableState.value.records.filterNot { it.key == key })
    private fun persist(rows: List<GradeRecord>) = launchAction({ loading || !loaded }, { copy(loading = true, error = null) }, {
        val key = key()
        withContext(Dispatchers.IO) {
            codec.write(key, JSONArray(rows.map { JSONObject().put("term", it.term).put("course", it.course).put("credits", it.credits).put("score", it.score).put("points", it.points).put("earned", it.earned) }).toString())
        }
        rows
    }, { copy(loading = false, records = it) }, { copy(loading = false, error = it.message ?: "成绩记录保存失败。") })
    override fun clearPendingState(current: GradesUiState) = current.copy(loading = false)
}
