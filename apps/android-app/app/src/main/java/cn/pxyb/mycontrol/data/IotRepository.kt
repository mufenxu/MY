package cn.pxyb.mycontrol.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.supervisorScope
import kotlinx.coroutines.withContext

import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class IotRepository internal constructor(private val http: PlatformHttpClient) {
    private val insightConcurrency = Semaphore(4)

    suspend fun dashboard(
        includeAutomations: Boolean = true,
        onDevices: (IotData) -> Unit = {},
    ): IotData = coroutineScope {
        val statusRequest = async { http.execute("/apps/iot/api/status").json }
        val devicesRequest = async { http.execute("/apps/iot/api/devices").json }
        val scenesRequest = async { if (includeAutomations) http.execute("/apps/iot/api/automations/scenes").jsonArray else JSONArray() }
        val rulesRequest = async { if (includeAutomations) http.execute("/apps/iot/api/automations/rules").jsonArray else JSONArray() }
        val runsRequest = async { if (includeAutomations) http.execute("/apps/iot/api/automations/runs?limit=20").jsonArray else JSONArray() }
        val status = statusRequest.await()
        val devicesJson = devicesRequest.await()
        val now = System.currentTimeMillis()
        val devices = devicesJson.keys().asSequence().mapNotNull { id ->
            devicesJson.optJSONObject(id)?.let { item ->
                val lastActive = item.optLongOrNull("lastActive")
                val onlineStatus = item.nullableString("onlineStatus")
                val relays = item.optJSONObject("relays")?.let { relayJson ->
                    relayJson.keys().asSequence().associateWith { relayId ->
                        relayJson.nullableString(relayId)?.uppercase()
                    }
                } ?: emptyMap()
                val relayOnline = relays.isNotEmpty() && relays.values.any { it != null }
                val online = when {
                    item.has("online") -> item.optBoolean("online")
                    onlineStatus?.equals("online", ignoreCase = true) == true -> true
                    relayOnline -> true
                    else -> lastActive != null && now - lastActive < 180_000
                }
                DeviceInfo(
                    id = id,
                    name = item.optString("name", item.optString("deviceName", id)),
                    online = online,
                    temperature = item.optDoubleOrNull("temperature") ?: item.optDoubleOrNull("temp"),
                    humidity = item.optDoubleOrNull("humidity") ?: item.optDoubleOrNull("hum"),
                    lastActive = lastActive,
                    relays = relays,
                )
            }
        }.toList()
        onDevices(IotData(
            mqttConnected = status.optBoolean("mqttConnected"),
            deviceOnline = status.optBoolean("deviceOnline"),
            connectionState = status.optString("connectionState", "unknown"),
            messagesReceived = status.optLong("messagesReceived"),
            devices = devices, scenes = emptyList(), rules = emptyList(), runs = emptyList(), insights = emptyList(),
        ))
        val scenesJson = scenesRequest.await()
        val rulesJson = rulesRequest.await()
        val runsJson = runsRequest.await()
        IotData(
            mqttConnected = status.optBoolean("mqttConnected"),
            deviceOnline = status.optBoolean("deviceOnline"),
            connectionState = status.optString("connectionState", "unknown"),
            messagesReceived = status.optLong("messagesReceived"),
            devices = devices,
            scenes = scenesJson.platformObjects().map { item ->
                IotScene(
                    id = item.optString("id"),
                    name = item.optString("name", "未命名场景"),
                    actionCount = item.optJSONArray("actions")?.length() ?: 0,
                    updatedAt = item.nullableString("updated_at") ?: item.nullableString("updatedAt"),
                    actions = item.optJSONArray("actions").platformObjects().map { action ->
                        IotSceneAction(
                            deviceId = action.optString("deviceId"),
                            relayId = action.optString("relayId"),
                            status = action.optString("status", "OFF").uppercase(),
                        )
                    },
                )
            },
            rules = rulesJson.platformObjects().mapNotNull { item ->
                val condition = item.optJSONObject("condition") ?: return@mapNotNull null
                AutomationRule(
                    id = item.optString("id"),
                    name = item.optString("name", "未命名规则"),
                    enabled = item.optBoolean("enabled", true),
                    condition = AutomationCondition(
                        deviceId = condition.optString("deviceId"),
                        metric = condition.optString("metric"),
                        operator = condition.optString("operator"),
                        value = condition.opt("value")?.toString().orEmpty(),
                        relayId = condition.nullableString("relayId"),
                    ),
                    actions = item.optJSONArray("actions").platformObjects().map { action ->
                        IotSceneAction(
                            deviceId = action.optString("deviceId"),
                            relayId = action.optString("relayId"),
                            status = action.optString("status", "OFF").uppercase(),
                        )
                    },
                    cooldownSeconds = item.optInt("cooldown_seconds", 300),
                    version = item.optInt("version", 1),
                    createdAt = item.optLongOrNull("created_at"),
                    updatedAt = item.optLongOrNull("updated_at"),
                    lastTriggeredAt = item.optLongOrNull("last_triggered_at"),
                )
            },
            runs = runsJson.platformObjects().map { item ->
                AutomationRun(
                    id = item.optString("id"),
                    sourceType = item.optString("source_type"),
                    sourceId = item.optString("source_id"),
                    sourceName = item.optString("source_name", "自动化"),
                    actor = item.optString("actor"),
                    state = item.optString("state", "unknown"),
                    deviceConfirmed = item.optBoolean("device_confirmed", false),
                    results = item.optJSONArray("results").platformObjects().map { result ->
                        AutomationRunResult(
                            deviceId = result.optString("deviceId"),
                            relayId = result.optString("relayId"),
                            status = result.optString("status"),
                            state = result.optString("state", "unknown"),
                            message = result.optString("message"),
                        )
                    },
                    createdAt = item.optLongOrNull("created_at"),
                )
            },
            insights = emptyList(),
        )
    }

    suspend fun deviceInsights(devices: List<DeviceInfo>): List<DeviceTelemetryInsight> = supervisorScope {
        devices.filter { it.temperature != null || it.humidity != null }.map { device ->
            async {
                insightConcurrency.withPermit {
                    try {
                        http.execute("/apps/iot/api/devices/${encodePath(device.id)}/insights?range=24h").json.toDeviceTelemetryInsight(device)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: ApiException) {
                        if (shouldInvalidatePlatformSession(error.status, error.code)) throw error
                        null
                    } catch (_: IOException) {
                        null
                    }
                }
            }
        }.awaitAll().filterNotNull()
    }

    suspend fun runIotScene(id: String): Unit = withContext(Dispatchers.IO) {
        http.execute("/apps/iot/api/automations/scenes/${encodePath(id)}/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun createIotScene(name: String, actions: List<IotSceneAction>): Unit = withContext(Dispatchers.IO) {
        http.execute("/apps/iot/api/automations/scenes", "POST", sceneBody(name, actions))
        Unit
    }

    suspend fun updateIotScene(id: String, name: String, actions: List<IotSceneAction>): Unit =
        withContext(Dispatchers.IO) {
            http.execute(
                "/apps/iot/api/automations/scenes/${encodePath(id)}",
                "PUT",
                sceneBody(name, actions),
            )
            Unit
        }

    suspend fun deleteIotScene(id: String): Unit = withContext(Dispatchers.IO) {
        http.execute("/apps/iot/api/automations/scenes/${encodePath(id)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun createIotRule(
        name: String,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/apps/iot/api/automations/rules",
            "POST",
            automationRuleBody(name, true, condition, actions, cooldownSeconds),
        )
        Unit
    }

    suspend fun updateIotRule(
        id: String,
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/apps/iot/api/automations/rules/${encodePath(id)}",
            "PUT",
            automationRuleBody(name, enabled, condition, actions, cooldownSeconds),
        )
        Unit
    }

    suspend fun setIotRuleEnabled(id: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/apps/iot/api/automations/rules/${encodePath(id)}",
            "PUT",
            JSONObject().put("enabled", enabled),
        )
        Unit
    }

    suspend fun deleteIotRule(id: String): Unit = withContext(Dispatchers.IO) {
        http.execute("/apps/iot/api/automations/rules/${encodePath(id)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun controlIotRelay(deviceId: String, relayId: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/apps/iot/api/devices/${encodePath(deviceId)}/relays/${encodePath(relayId)}/control",
            "POST",
            JSONObject().put("status", if (enabled) "ON" else "OFF"),
            timeoutSeconds = 15,
        )
        Unit
    }

    private fun sceneBody(name: String, actions: List<IotSceneAction>): JSONObject = JSONObject()
        .put("name", name.trim())
        .put(
            "actions",
            JSONArray().apply {
                actions.forEach { action ->
                    put(
                        JSONObject()
                            .put("deviceId", action.deviceId)
                            .put("relayId", action.relayId)
                            .put("status", action.status.uppercase()),
                    )
                }
            },
        )

    private fun automationRuleBody(
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
    ): JSONObject = JSONObject()
        .put("name", name.trim())
        .put("enabled", enabled)
        .put(
            "condition",
            JSONObject()
                .put("deviceId", condition.deviceId)
                .put("metric", condition.metric)
                .put("operator", condition.operator)
                .put(
                    "value",
                    if (condition.metric in setOf("temperature", "humidity")) {
                        condition.value.toDoubleOrNull() ?: condition.value
                    } else {
                        condition.value.uppercase()
                    },
                )
                .apply { condition.relayId?.let { put("relayId", it) } },
        )
        .put("cooldownSeconds", cooldownSeconds.coerceIn(5, 86_400))
        .put(
            "actions",
            JSONArray().apply {
                actions.forEach { action ->
                    put(
                        JSONObject()
                            .put("deviceId", action.deviceId)
                            .put("relayId", action.relayId)
                            .put("status", action.status.uppercase()),
                    )
                }
            },
        )

}

private fun JSONObject.toDeviceTelemetryInsight(fallbackDevice: DeviceInfo): DeviceTelemetryInsight {
    val device = optJSONObject("device") ?: JSONObject()
    val summary = optJSONObject("summary") ?: JSONObject()
    return DeviceTelemetryInsight(
        deviceId = device.optString("id", fallbackDevice.id),
        deviceName = device.optString("name", fallbackDevice.name),
        state = device.optString("state", if (fallbackDevice.online) "healthy" else "offline"),
        range = optString("range", "24h"),
        generatedAt = optLongOrNull("generatedAt"),
        sampleCount = summary.optInt("samples"),
        temperature = summary.optJSONObject("temperature").toTelemetryMetricSummary(),
        humidity = summary.optJSONObject("humidity").toTelemetryMetricSummary(),
        anomalyCount = summary.optInt("anomalyCount"),
        series = optJSONArray("series").platformObjects().mapNotNull { item ->
            val createdAt = item.optLongOrNull("created_at") ?: return@mapNotNull null
            TelemetrySeriesPoint(
                createdAt = createdAt,
                sampleCount = item.optInt("sampleCount"),
                temperature = item.optDoubleOrNull("temp"),
                humidity = item.optDoubleOrNull("hum"),
            )
        },
    )
}

private fun JSONObject?.toTelemetryMetricSummary(): TelemetryMetricSummary {
    val json = this ?: JSONObject()
    return TelemetryMetricSummary(
        count = json.optInt("count"),
        minimum = json.optDoubleOrNull("min"),
        maximum = json.optDoubleOrNull("max"),
        average = json.optDoubleOrNull("average"),
    )
}

