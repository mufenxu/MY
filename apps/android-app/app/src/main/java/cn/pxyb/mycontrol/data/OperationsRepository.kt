package cn.pxyb.mycontrol.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext

import org.json.JSONObject

/**
 * 运维域数据访问：平台总览、异常事件、任务、备份、CT8 自动化与诊断。
 *
 * 从 [PlatformApi] 拆出（2026-11 架构整理）：PlatformApi 收敛为纯网关，
 * 按业务域拆分 Repository，与 [CampusRepository]、[IotRepository] 同模式。
 */
class OperationsRepository internal constructor(private val http: PlatformHttpClient) {

    suspend fun overview(force: Boolean = false): OverviewData = withContext(Dispatchers.IO) {
        val path = if (force) "/api/operations/overview?refresh=1" else "/api/operations/overview"
        val json = http.execute(path).json
        OverviewData(
            services = json.optJSONArray("services").platformObjects().map { it.toServiceInfo() },
            incidents = json.optJSONArray("incidents").platformObjects().map { it.toIncidentInfo() },
            audits = json.optJSONArray("audit").platformObjects().map { it.toAuditInfo() },
            refreshedAt = json.nullableString("refreshedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun incidents(): List<IncidentInfo> = withContext(Dispatchers.IO) {
        http.execute("/api/incidents?limit=100").json
            .optJSONArray("incidents").platformObjects().map { it.toIncidentInfo() }
    }

    suspend fun updateIncident(
        id: String,
        action: String,
        note: String = "",
        muteMinutes: Int? = null,
    ): IncidentInfo = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", action)
        note.trim().takeIf(String::isNotBlank)?.let { body.put("note", it.take(500)) }
        muteMinutes?.let { body.put("muteMinutes", it.coerceIn(5, 7 * 24 * 60)) }
        http.execute("/api/incidents/${encodePath(id)}/actions", "POST", body).json
            .optJSONObject("incident")
            ?.toIncidentInfo()
            ?: throw ApiException("异常操作未返回有效结果。", 502, "INCIDENT_ACTION_INVALID")
    }

    suspend fun tasks(): TaskData = withContext(Dispatchers.IO) {
        val json = http.execute("/api/tasks?limit=100").json
        TaskData(
            tasks = json.optJSONArray("tasks").platformObjects().map { item ->
                val source = item.optString("source", "platform")
                val rawId = item.optString("id")
                val sourceId = item.nullableString("sourceId")
                    ?: rawId.removePrefix("$source:").takeIf { it.isNotBlank() && it != rawId }
                PlatformTask(
                    id = rawId,
                    title = item.optString("title", "平台任务"),
                    detail = item.optString("detail"),
                    status = item.optString("status", "pending"),
                    source = source,
                    sourceId = sourceId,
                    requestedBy = item.optString("requestedBy", "--"),
                    updatedAt = item.nullableString("updatedAt"),
                )
            },
            generatedAt = json.nullableString("generatedAt"),
        )
    }

    suspend fun runDiagnostics(): DiagnosticData = withContext(Dispatchers.IO) {
        val json = http.execute("/api/diagnostics/run", "POST", JSONObject(), timeoutSeconds = 45).json
        DiagnosticData(
            checks = json.optJSONArray("checks").platformObjects().map { item ->
                DiagnosticCheck(
                    id = item.optString("id"),
                    label = item.optString("label", item.optString("id", "检查项")),
                    status = item.optString("status", "unknown"),
                    message = item.optString("message", item.optString("detail")),
                )
            },
            checkedAt = json.nullableString("checkedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun backupQuality(): BackupQuality = withContext(Dispatchers.IO) {
        val json = http.execute("/api/backups/quality").json
        val latest = json.optJSONObject("latestBackup")
        val offsite = json.optJSONObject("offsite") ?: JSONObject()
        val capabilities = json.optJSONObject("capabilities") ?: JSONObject()
        BackupQuality(
            latestName = latest?.nullableString("name"),
            latestAt = latest?.nullableString("createdAt"),
            ageHours = json.optDoubleOrNull("ageHours"),
            rpoHours = json.optInt("rpoHours", 26),
            rpoState = json.optString("rpoState", "unknown"),
            validBackups = json.optInt("validBackups"),
            offsiteConfigured = offsite.optBoolean("configured"),
            offsiteHealthy = if (offsite.has("healthy") && !offsite.isNull("healthy")) offsite.optBoolean("healthy") else null,
            canBackup = capabilities.optBoolean("canBackup"),
            checkedAt = json.nullableString("checkedAt"),
        )
    }

    suspend fun triggerBackup(): Unit = withContext(Dispatchers.IO) {
        http.execute("/api/backups/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun ct8(): Ct8Data = withContext(Dispatchers.IO) {
        val statsRequest = async { http.execute("/apps/core/api/ct8/stats").json }
        val statusRequest = async { http.execute("/apps/core/api/ct8/status?limit=6").json }
        val statsEnvelope = statsRequest.await()
        val statusEnvelope = statusRequest.await()
        val stats = statsEnvelope.optJSONObject("stats") ?: JSONObject()
        val status = statusEnvelope.optJSONObject("data") ?: JSONObject()
        val active = status.optJSONObject("activeTask")
        val latest = status.optJSONObject("latest") ?: status.optJSONArray("runs").platformObjects().firstOrNull()
        Ct8Data(
            totalHosts = stats.optIntOrNull("totalHosts") ?: latest?.optIntOrNull("total_accounts"),
            successHosts = stats.optIntOrNull("successHosts") ?: latest?.optIntOrNull("success_count"),
            failedHosts = stats.optIntOrNull("failedHosts") ?: latest?.optIntOrNull("failed_count"),
            activeStatus = active?.optString("status", "idle") ?: "idle",
            latestStatus = latest?.optString("status", latest.optStringOr("workflow_conclusion", "unknown")) ?: "unknown",
            latestRunId = latest?.nullableString("run_id") ?: latest?.nullableString("id"),
            lastRunAt = stats.nullableString("lastRunTime")
                ?: latest?.nullableString("start_time")
                ?: latest?.nullableString("createdAt"),
        )
    }

    suspend fun triggerCt8(): Unit = withContext(Dispatchers.IO) {
        http.execute("/apps/core/api/ct8/trigger", "POST", JSONObject().put("inputs", JSONObject()), timeoutSeconds = 45)
        Unit
    }
}

private fun JSONObject.toServiceInfo() = ServiceInfo(
    id = optString("id"),
    name = optString("shortName", optString("name", optString("id", "服务"))),
    category = optString("category", "service"),
    state = optString("state", "unmonitored"),
    latencyMs = optLongOrNull("latencyMs"),
    httpStatus = optIntOrNull("httpStatus"),
    adminUrl = nullableString("adminUrl"),
)

private fun JSONObject.toIncidentInfo() = IncidentInfo(
    id = optString("id"),
    title = optString("title", "系统异常"),
    description = optString("description"),
    severity = optString("severity", "warning"),
    status = optString("status", "open"),
    source = optString("source", "platform"),
    serviceId = nullableString("serviceId"),
    openedAt = nullableString("openedAt"),
    updatedAt = nullableString("updatedAt") ?: nullableString("lastSeenAt"),
)

private fun JSONObject.toAuditInfo() = AuditInfo(
    id = optString("id", optString("_id")),
    action = optString("action", "platform.event"),
    actor = optString("actor", "system"),
    outcome = optString("outcome", "success"),
    occurredAt = nullableString("occurredAt") ?: nullableString("createdAt"),
)

private fun JSONObject?.optStringOr(key: String, fallback: String): String = this?.optString(key, fallback) ?: fallback
