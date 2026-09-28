package cn.pxyb.mycontrol.ui.feature.campus.energy

import android.content.Context
import cn.pxyb.mycontrol.AlertNotifier
import cn.pxyb.mycontrol.core.security.EncryptedPreferenceCodec
import cn.pxyb.mycontrol.data.*
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.YearMonth

data class EnergyBillRow(val label: String, val value: String)
data class EnergyReading(val date: String, val balance: Double?, val kwh: Double?, val fee: Double?)
data class EnergyUiState(val loading: Boolean = false, val month: String = YearMonth.now().toString(), val balance: Double? = null,
    val rows: List<EnergyBillRow> = emptyList(), val history: List<EnergyReading> = emptyList(), val enabled: Boolean = false,
    val threshold: Double = 20.0, val error: String? = null, val loaded: Boolean = false)

fun energyNumber(value: String): Double? = Regex("-?\\d+(?:\\.\\d+)?").find(value.replace(",", ""))?.value?.toDoubleOrNull()?.takeIf(Double::isFinite)
fun energyBillRows(value: JSONArray?): List<EnergyBillRow> = buildList {
    if (value == null) return@buildList
    for (index in 0 until value.length()) {
        when (val group = value.opt(index)) {
            is JSONArray -> addAll(energyBillRows(group))
            is JSONObject -> {
                val label = sequenceOf("key", "name", "title").map { group.optString(it) }.firstOrNull(String::isNotBlank).orEmpty()
                val amount = sequenceOf("value", "amount", "totalAmt").mapNotNull { if (group.has(it) && !group.isNull(it)) group.get(it).toString() else null }.firstOrNull().orEmpty()
                if (label.isNotBlank() || amount.isNotBlank()) add(EnergyBillRow(label, amount))
            }
        }
    }
}

class EnergyStore(context: Context, username: String) {
    private val prefs = context.getSharedPreferences("energy_insights", Context.MODE_PRIVATE)
    private val codec = EncryptedPreferenceCodec(prefs, "my_control_energy_insights")
    private val key = "energy:${requireNotNull(accountStorageScope(username))}"
    fun read(): JSONObject = codec.read(key)?.let(::JSONObject) ?: JSONObject()
    fun settings(enabled: Boolean, threshold: Double) {
        require(threshold.isFinite() && threshold >= 0) { "提醒阈值须为非负金额。" }
        val root = read().put("enabled", enabled).put("threshold", threshold)
        codec.write(key, root.toString())
    }
    fun readings(root: JSONObject = read()): List<EnergyReading> {
        val rows = root.optJSONArray("history") ?: JSONArray()
        return (0 until rows.length()).map { rows.getJSONObject(it) }.map {
            EnergyReading(it.getString("date"), it.optString("balance").toDoubleOrNull(), it.optString("kwh").toDoubleOrNull(), it.optString("fee").toDoubleOrNull())
        }
    }
    fun record(report: JSONObject, month: String): List<EnergyReading> {
        val root = read()
        val today = LocalDate.now().toString()
        if (month != YearMonth.now().toString()) return readings(root)
        val rows = energyBillRows(report.optJSONArray("bill"))
        val reading = EnergyReading(today, report.optJSONObject("wallet")?.optJSONObject("account")?.optString("remainingSum")?.let(::energyNumber),
            rows.firstOrNull { it.label == "本月总用电量" }?.value?.let(::energyNumber),
            rows.firstOrNull { it.label == "超额用电电费" || it.label == "本月空调电费" }?.value?.let(::energyNumber))
        val readings = (readings(root).filterNot { it.date == today } + reading).takeLast(180)
        root.put("history", JSONArray(readings.map { JSONObject().put("date", it.date).put("balance", it.balance).put("kwh", it.kwh).put("fee", it.fee) }))
        codec.write(key, root.toString())
        return readings
    }
    fun notifyLowBalance(context: Context, username: String, balance: Double?) {
        val root = read()
        if (!root.optBoolean("enabled") || balance == null) return
        val threshold = root.optDouble("threshold", 20.0)
        val date = LocalDate.now().toString()
        if (balance >= threshold || root.optString("lastNotice") == date) return
        val alert = AppAlertRecord("energy:$date", "campus", "energy", "宿舍电费余额偏低", "当前余额 %.2f 元，低于您设置的 %.2f 元。".format(balance, threshold), System.currentTimeMillis())
        PersonalWorkspaceStore(context).apply { setAccount(username); appendAlerts(listOf(alert)) }
        if (AlertNotifier(context).apply { setAccount(username) }.notifyRecord(alert)) {
            codec.write(key, read().put("lastNotice", date).toString())
        }
    }
}

class EnergyStateHolder(parent: CoroutineScope, private val context: Context, private val campus: CampusRepository,
    private val account: () -> String?, onExpired: (String) -> Unit) : FeatureStateHolder<EnergyUiState>(parent, EnergyUiState(), onExpired) {
    fun load(month: String = mutableState.value.month) = launchAction({ loading }, { copy(loading = true, error = null) }, {
        val username = checkNotNull(account()) { "请先登录。" }
        val savedStore = EnergyStore(context, username)
        val saved = withContext(Dispatchers.IO) { savedStore.read() to savedStore.readings() }
        mutableState.update { it.copy(enabled = saved.first.optBoolean("enabled"), threshold = saved.first.optDouble("threshold", 20.0), history = saved.second) }
        val report = campus.energyReport(month)
        withContext(Dispatchers.IO) {
            val store = EnergyStore(context, username)
            val history = store.record(report, month)
            val settings = store.read()
            val balance = report.optJSONObject("wallet")?.optJSONObject("account")?.optString("remainingSum")?.let(::energyNumber)
            store.notifyLowBalance(context, username, balance)
            EnergyUiState(month = month, balance = balance, rows = energyBillRows(report.optJSONArray("bill")), history = history,
                enabled = settings.optBoolean("enabled"), threshold = settings.optDouble("threshold", 20.0), loaded = true)
        }
    }, { it }, { copy(loading = false, error = it.message ?: "电费账单读取失败。") })
    fun saveSettings(enabled: Boolean, threshold: Double) = launchAction({ loading }, { copy(loading = true, error = null) }, {
        val username = checkNotNull(account())
        withContext(Dispatchers.IO) { EnergyStore(context, username).settings(enabled, threshold) }
        enabled to threshold
    }, { copy(loading = false, enabled = it.first, threshold = it.second) }, { copy(loading = false, error = it.message ?: "提醒设置保存失败。") })
    override fun clearPendingState(current: EnergyUiState) = current.copy(loading = false)
}
