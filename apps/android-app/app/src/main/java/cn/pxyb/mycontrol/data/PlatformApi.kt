package cn.pxyb.mycontrol.data

import android.net.Uri
import android.util.Base64
import cn.pxyb.mycontrol.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.concurrent.TimeUnit

class PlatformApi(private val sessionStore: SessionStore) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val platformOrigin = Uri.parse(BuildConfig.PLATFORM_BASE_URL).let { uri ->
        if (uri.scheme.isNullOrBlank() || uri.authority.isNullOrBlank()) {
            ""
        } else {
            "${uri.scheme}://${uri.authority}"
        }
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    suspend fun login(
        username: String,
        password: String,
        totp: String = "",
        recoveryCode: String = "",
    ): LoginResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("username", username.trim())
            .put("password", password)
        if (totp.isNotBlank()) body.put("totp", totp.trim())
        if (recoveryCode.isNotBlank()) body.put("recoveryCode", recoveryCode.trim())

        val response = execute("/api/auth/login", "POST", body, authenticated = false)
        val user = response.json.optJSONObject("user").toPlatformUser()
        response.toLoginResult(user, response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun loginCapabilities(): LoginCapabilities = withContext(Dispatchers.IO) {
        val json = execute("/api/auth/status", authenticated = false).json
        LoginCapabilities(androidPasskeySupported = json.optBoolean("androidPasskeySupported"))
    }

    suspend fun beginPasskeyLogin(username: String): PasskeyChallenge = withContext(Dispatchers.IO) {
        val normalizedUsername = username.trim()
        val json = execute(
            "/api/auth/passkey/options",
            "POST",
            JSONObject().put("username", normalizedUsername),
            authenticated = false,
        ).json
        PasskeyChallenge(
            username = normalizedUsername,
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务器未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun completePasskeyLogin(challenge: PasskeyChallenge, responseJson: String): LoginResult =
        withContext(Dispatchers.IO) {
            val response = execute(
                "/api/auth/passkey/verify",
                "POST",
                JSONObject()
                    .put("username", challenge.username)
                    .put("challengeId", challenge.challengeId)
                    .put("response", JSONObject(responseJson)),
                authenticated = false,
            )
            response.toLoginResult(response.json.optJSONObject("user").toPlatformUser())
        }

    suspend fun persistLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        sessionStore.writeCookie(
            result.sessionCookie,
            result.sessionExpiresAtMillis,
            result.sessionIdleMinutes,
        )
        sessionStore.writeLastUsername(result.user.username)
    }

    suspend fun discardLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("${BuildConfig.PLATFORM_BASE_URL}/api/auth/logout")
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .header("Cookie", result.sessionCookie)
            .header("X-Platform-Request", "console")
            .post(JSONObject().toString().toRequestBody(jsonMediaType))
            .build()
        runCatching { client.newCall(request).execute().close() }
        Unit
    }

    suspend fun scanQrLogin(requestId: String, scanToken: String): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/scan",
            "POST",
            JSONObject().put("scanToken", scanToken),
        ).json.toQrLoginTarget()
    }

    suspend fun beginQrPasskey(requestId: String): QrPasskeyChallenge = withContext(Dispatchers.IO) {
        val json = execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/passkey/options",
            "POST",
            JSONObject(),
        ).json
        QrPasskeyChallenge(
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务端未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun approveQrWithPasskey(
        requestId: String,
        challenge: QrPasskeyChallenge,
        responseJson: String,
    ): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put(
                "passkey",
                JSONObject()
                    .put("challengeId", challenge.challengeId)
                    .put("response", JSONObject(responseJson)),
            ),
        ).json.toQrLoginTarget()
    }

    suspend fun approveQrWithBiometric(requestId: String): QrLoginTarget = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put("localConfirmation", true),
        ).json.toQrLoginTarget()
    }

    suspend fun rejectQrLogin(requestId: String): Unit = withContext(Dispatchers.IO) {
        execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/reject",
            "POST",
            JSONObject(),
        )
        Unit
    }

    suspend fun authStatus(): PlatformUser? = withContext(Dispatchers.IO) {
        if (!sessionStore.hasSession()) return@withContext null
        try {
            val json = execute("/api/auth/status", authenticated = true).json
            if (!json.optBoolean("authenticated")) {
                sessionStore.clear()
                null
            } else {
                json.optJSONObject("user").toPlatformUser()
            }
        } catch (error: ApiException) {
            if (error.status == 401 || error.status == 403) {
                sessionStore.clear()
                null
            } else {
                throw error
            }
        }
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        runCatching { execute("/api/auth/logout", "POST", JSONObject()) }
        sessionStore.clear()
    }

    suspend fun overview(force: Boolean = false): OverviewData = withContext(Dispatchers.IO) {
        val path = if (force) "/api/operations/overview?refresh=1" else "/api/operations/overview"
        val json = execute(path).json
        OverviewData(
            services = json.optJSONArray("services").objects().map { it.toServiceInfo() },
            incidents = json.optJSONArray("incidents").objects().map { it.toIncidentInfo() },
            audits = json.optJSONArray("audit").objects().map { it.toAuditInfo() },
            refreshedAt = json.nullableString("refreshedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun incidents(): List<IncidentInfo> = withContext(Dispatchers.IO) {
        execute("/api/incidents?limit=100").json
            .optJSONArray("incidents").objects().map { it.toIncidentInfo() }
    }

    suspend fun tasks(): TaskData = withContext(Dispatchers.IO) {
        val json = execute("/api/tasks?limit=100").json
        TaskData(
            tasks = json.optJSONArray("tasks").objects().map { item ->
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

    suspend fun releases(): ReleaseData = withContext(Dispatchers.IO) {
        val json = execute("/api/releases").json
        val capabilities = json.optJSONObject("capabilities") ?: JSONObject()
        ReleaseData(
            builds = json.optJSONArray("builds").objects().map { item ->
                ReleaseBuild(
                    id = item.optString("id"),
                    status = item.optString("status", "unknown"),
                    conclusion = item.optString("conclusion", item.optString("status", "unknown")),
                    revision = item.optString("revision", item.optString("sha", "")),
                    createdAt = item.nullableString("createdAt") ?: item.nullableString("startedAt"),
                    components = item.optJSONArray("artifacts").objects().mapNotNull { it.nullableString("component") },
                )
            },
            deployments = json.optJSONArray("deployments").objects().map { item ->
                ReleaseDeployment(
                    id = item.optString("id"),
                    status = item.optString("status", "unknown"),
                    action = item.optString("action", "deploy"),
                    requestedBy = item.optString("requestedBy", "--"),
                    createdAt = item.nullableString("createdAt") ?: item.nullableString("startedAt"),
                    components = item.optJSONArray("components").toStringList(),
                )
            },
            actionsEnabled = capabilities.optBoolean("actionsEnabled", capabilities.optBoolean("canDispatch")),
            runnerConnected = capabilities.optBoolean("runnerConnected", capabilities.optBoolean("canDeploy")),
        )
    }

    suspend fun backupQuality(): BackupQuality = withContext(Dispatchers.IO) {
        val json = execute("/api/backups/quality").json
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

    suspend fun security(): SecurityData = withContext(Dispatchers.IO) {
        val json = execute("/api/security/sessions").json
        val currentNonce = json.optString("currentNonce")
        val security = json.optJSONObject("security") ?: JSONObject()
        SecurityData(
            sessions = json.optJSONArray("sessions").objects().map { item ->
                SecuritySession(
                    nonce = item.optString("nonce"),
                    subject = item.optString("subject"),
                    role = item.optString("role", "viewer"),
                    ip = item.optString("ip", "--"),
                    userAgent = item.optString("userAgent", "未知设备"),
                    createdAt = item.nullableString("createdAt"),
                    lastSeenAt = item.nullableString("lastSeenAt"),
                    expiresAt = item.nullableString("expiresAt"),
                    current = item.optString("nonce") == currentNonce,
                )
            },
            totpEnabled = security.optBoolean("totpEnabled"),
            passkeyCount = security.optInt("passkeyCount"),
            recoveryCodesRemaining = security.optInt("recoveryCodesRemaining"),
            sessionTtlHours = security.optInt("sessionTtlHours"),
            sessionIdleMinutes = security.optInt("sessionIdleMinutes"),
        )
    }

    suspend fun revokeSession(nonce: String): Unit = withContext(Dispatchers.IO) {
        execute("/api/security/sessions/${encodePath(nonce)}", "DELETE", JSONObject())
        Unit
    }

    suspend fun changePassword(password: String, newPassword: String, totp: String = ""): Boolean =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("password", password)
                .put("newPassword", newPassword)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/password", "POST", body).json.optBoolean("currentSessionRevoked")
        }

    suspend fun beginTotpEnrollment(password: String, totp: String = ""): TotpEnrollment =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val enrollment = execute("/api/security/totp/enrollment", "POST", body).json
                .optJSONObject("enrollment")
                ?: throw ApiException("服务器未返回动态验证注册参数。", 500, "TOTP_ENROLLMENT_MISSING")
            TotpEnrollment(
                secret = enrollment.optString("secret"),
                uri = enrollment.optString("uri"),
                qrDataUrl = enrollment.nullableString("qrDataUrl"),
                expiresAt = enrollment.nullableString("expiresAt"),
            )
        }

    suspend fun confirmTotpEnrollment(code: String): List<String> = withContext(Dispatchers.IO) {
        execute("/api/security/totp/confirm", "POST", JSONObject().put("totp", code.trim())).json
            .optJSONArray("recoveryCodes").toStringList()
    }

    suspend fun regenerateRecoveryCodes(password: String, totp: String = ""): List<String> =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/totp/recovery-codes", "POST", body).json
                .optJSONArray("recoveryCodes").toStringList()
        }

    suspend fun disableTotp(password: String, totp: String = ""): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("password", password)
        if (totp.isNotBlank()) body.put("totp", totp.trim())
        execute("/api/security/totp", "DELETE", body).json.optBoolean("currentSessionRevoked")
    }

    suspend fun passkeys(): List<PlatformPasskey> = withContext(Dispatchers.IO) {
        execute("/api/security/passkeys").json.optJSONArray("passkeys").objects().map { item ->
            PlatformPasskey(
                id = item.optString("id"),
                name = item.optString("name", "Passkey"),
                deviceType = item.nullableString("deviceType"),
                createdAt = item.nullableString("createdAt"),
                lastUsedAt = item.nullableString("lastUsedAt"),
            )
        }
    }

    suspend fun beginPasskeyRegistration(password: String, totp: String = ""): PasskeyRegistrationChallenge =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val json = execute("/api/security/passkeys/options", "POST", body).json
            PasskeyRegistrationChallenge(
                challengeId = json.optString("challengeId"),
                optionsJson = json.optJSONObject("options")?.toString()
                    ?: throw ApiException("服务器未返回 Passkey 注册参数。", 500, "PASSKEY_OPTIONS_MISSING"),
            )
        }

    suspend fun completePasskeyRegistration(
        challengeId: String,
        responseJson: String,
        name: String,
    ): Unit = withContext(Dispatchers.IO) {
        execute(
            "/api/security/passkeys/verify",
            "POST",
            JSONObject()
                .put("challengeId", challengeId)
                .put("response", JSONObject(responseJson))
                .put("name", name),
        )
        Unit
    }

    suspend fun deletePasskey(id: String, password: String, totp: String = ""): Unit =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            execute("/api/security/passkeys/${encodePath(id)}", "DELETE", body)
            Unit
        }

    suspend fun iot(): IotData = withContext(Dispatchers.IO) {
        val status = execute("/apps/iot/api/status").json
        val devicesJson = execute("/apps/iot/api/devices").json
        val scenesJson = execute("/apps/iot/api/automations/scenes").jsonArray
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
        IotData(
            mqttConnected = status.optBoolean("mqttConnected"),
            deviceOnline = status.optBoolean("deviceOnline"),
            connectionState = status.optString("connectionState", "unknown"),
            messagesReceived = status.optLong("messagesReceived"),
            devices = devices,
            scenes = scenesJson.objects().map { item ->
                IotScene(
                    id = item.optString("id"),
                    name = item.optString("name", "未命名场景"),
                    actionCount = item.optJSONArray("actions")?.length() ?: 0,
                    updatedAt = item.nullableString("updated_at") ?: item.nullableString("updatedAt"),
                )
            },
        )
    }

    suspend fun ct8(): Ct8Data = withContext(Dispatchers.IO) {
        val statsEnvelope = execute("/apps/core/api/ct8/stats").json
        val statusEnvelope = execute("/apps/core/api/ct8/status?limit=6").json
        val stats = statsEnvelope.optJSONObject("stats") ?: JSONObject()
        val status = statusEnvelope.optJSONObject("data") ?: JSONObject()
        val active = status.optJSONObject("activeTask")
        val latest = status.optJSONObject("latest") ?: status.optJSONArray("runs").objects().firstOrNull()
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

    suspend fun updateIncident(
        id: String,
        action: String,
        note: String = "",
        assignedTo: String = "",
        muteMinutes: Int? = null,
        stepId: String? = null,
        completed: Boolean? = null,
        postmortem: IncidentPostmortem? = null,
    ): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", action)
        if (note.isNotBlank()) body.put("note", note.trim())
        if (assignedTo.isNotBlank()) body.put("assignedTo", assignedTo.trim())
        if (muteMinutes != null) body.put("muteMinutes", muteMinutes)
        if (!stepId.isNullOrBlank()) body.put("stepId", stepId.trim())
        if (completed != null) body.put("completed", completed)
        if (postmortem != null) {
            body.put(
                "postmortem",
                JSONObject()
                    .put("summary", postmortem.summary.trim())
                    .put("rootCause", postmortem.rootCause.trim())
                    .put("impact", postmortem.impact.trim())
                    .put("correctiveActions", postmortem.correctiveActions.trim()),
            )
        }
        execute("/api/incidents/${encodePath(id)}/actions", "POST", body)
        Unit
    }

    suspend fun approveConfiguration(id: String, note: String = ""): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
        if (note.isNotBlank()) body.put("note", note.trim())
        execute("/api/configuration/changes/${encodePath(id)}/approve", "POST", body)
        Unit
    }

    suspend fun rejectConfiguration(id: String, note: String = ""): Unit = withContext(Dispatchers.IO) {
        val body = JSONObject()
        if (note.isNotBlank()) body.put("note", note.trim())
        execute("/api/configuration/changes/${encodePath(id)}/reject", "POST", body)
        Unit
    }

    suspend fun runDiagnostics(): DiagnosticData = withContext(Dispatchers.IO) {
        val json = execute("/api/diagnostics/run", "POST", JSONObject(), timeoutSeconds = 45).json
        DiagnosticData(
            checks = json.optJSONArray("checks").objects().map { item ->
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

    suspend fun triggerBackup(): Unit = withContext(Dispatchers.IO) {
        execute("/api/backups/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun triggerCt8(): Unit = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/trigger", "POST", JSONObject().put("inputs", JSONObject()), timeoutSeconds = 45)
        Unit
    }

    suspend fun runIotScene(id: String): Unit = withContext(Dispatchers.IO) {
        execute("/apps/iot/api/automations/scenes/${encodePath(id)}/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun controlIotRelay(deviceId: String, relayId: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
        execute(
            "/apps/iot/api/devices/${encodePath(deviceId)}/relays/${encodePath(relayId)}/control",
            "POST",
            JSONObject().put("status", if (enabled) "ON" else "OFF"),
            timeoutSeconds = 15,
        )
        Unit
    }

    private fun execute(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = true,
        timeoutSeconds: Long = 30,
    ): ApiResponse {
        val requestBuilder = Request.Builder()
            .url("${BuildConfig.PLATFORM_BASE_URL}$path")
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
        if (authenticated) {
            val cookie = sessionStore.readCookie()
                ?: throw ApiException("登录会话已失效，请重新登录。", 401, "UNAUTHORIZED")
            requestBuilder.header("Cookie", cookie)
        }
        if (method != "GET") {
            requestBuilder.header("X-Platform-Request", "console")
            if (platformOrigin.isNotBlank()) requestBuilder.header("Origin", platformOrigin)
        }
        val requestBody = if (method == "GET") null else (body ?: JSONObject()).toString().toRequestBody(jsonMediaType)
        requestBuilder.method(method, requestBody)

        val requestClient = if (timeoutSeconds == 30L) client else client.newBuilder()
            .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .build()
        requestClient.newCall(requestBuilder.build()).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = runCatching { if (raw.isBlank() || raw.trimStart().startsWith("[")) JSONObject() else JSONObject(raw) }.getOrElse { JSONObject() }
            val jsonArray = runCatching { if (raw.trimStart().startsWith("[")) JSONArray(raw) else JSONArray() }.getOrElse { JSONArray() }
            if (!response.isSuccessful) {
                if (response.code == 401 || response.code == 403 && json.optString("code") == "UNAUTHORIZED") {
                    sessionStore.clear()
                }
                throw ApiException(
                    json.optString("message", json.optString("error", "请求失败（HTTP ${response.code}）")),
                    response.code,
                    json.optString("code", "HTTP_ERROR"),
                    json.optJSONObject("details"),
                )
            }
            if (authenticated) sessionStore.markUsed()
            return ApiResponse(json, jsonArray, extractSessionCookie(response.headers.values("Set-Cookie")))
        }
    }

    private fun ApiResponse.toLoginResult(
        user: PlatformUser,
        recoveryCodes: List<String> = emptyList(),
    ): LoginResult {
        val cookie = cookie ?: throw ApiException("服务器未返回安全会话。", 500, "SESSION_MISSING")
        val session = json.optJSONObject("session") ?: JSONObject()
        val expiresAtMillis = session.nullableString("expiresAt")
            ?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: decodeSessionExpiry(cookie)
        if (expiresAtMillis <= System.currentTimeMillis()) {
            throw ApiException("服务器返回的会话有效期无效。", 500, "SESSION_EXPIRY_INVALID")
        }
        return LoginResult(
            user = user,
            sessionCookie = cookie,
            sessionExpiresAtMillis = expiresAtMillis,
            sessionIdleMinutes = session.optInt("idleTimeoutMinutes", 30).coerceAtLeast(1),
            recoveryCodes = recoveryCodes,
        )
    }

    private fun decodeSessionExpiry(cookie: String): Long {
        return runCatching {
            val token = cookie.substringAfter('=', "")
            val payload = token.substringBefore('.')
            val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            JSONObject(String(decoded, StandardCharsets.UTF_8)).optLong("exp") * 1000L
        }.getOrDefault(0L)
    }

    private fun extractSessionCookie(headers: List<String>): String? = headers
        .map { it.substringBefore(';').trim() }
        .firstOrNull { it.startsWith("__Host-my_platform_session=") || it.startsWith("my_platform_session=") }

    private fun encodePath(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

    private data class ApiResponse(val json: JSONObject, val jsonArray: JSONArray, val cookie: String?)
}

private fun JSONObject?.toPlatformUser(): PlatformUser {
    val json = this ?: throw ApiException("登录响应缺少账号信息。", 500, "USER_MISSING")
    return PlatformUser(
        username = json.optString("username", "admin"),
        role = json.optString("role", "viewer"),
        totpEnabled = json.optBoolean("totpEnabled"),
        passkeyCount = json.optInt("passkeyCount"),
    )
}

private fun JSONObject.toQrLoginTarget(): QrLoginTarget {
    val browser = optJSONObject("browser") ?: JSONObject()
    return QrLoginTarget(
        requestId = optString("requestId"),
        status = optString("status", "scanned"),
        verificationCode = optString("verificationCode"),
        browser = QrLoginBrowser(
            label = browser.optString("label", "未知浏览器"),
            ip = browser.optString("ip", "未知 IP"),
            userAgent = browser.optString("userAgent", "未知设备"),
        ),
        expiresAt = optString("expiresAt"),
        confirmationMethod = optString("confirmationMethod", "biometric"),
    )
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
    title = optString("title", "运行事件"),
    description = optString("description"),
    severity = optString("severity", "warning"),
    status = optString("status", "open"),
    source = optString("source", "platform"),
    serviceId = nullableString("serviceId"),
    openedAt = nullableString("openedAt"),
    firstSeenAt = nullableString("firstSeenAt"),
    lastSeenAt = nullableString("lastSeenAt"),
    updatedAt = nullableString("updatedAt") ?: nullableString("lastSeenAt"),
    assignedTo = nullableString("assignedTo"),
    timeline = optJSONArray("timeline").objects().map { item ->
        IncidentTimelineEntry(
            type = item.optString("type", "event"),
            message = item.optString("message", "事件已更新"),
            actor = item.optString("actor", "system"),
            at = item.nullableString("at"),
        )
    },
    runbookSteps = optJSONArray("runbookSteps").objects().map { item ->
        IncidentRunbookStep(
            id = item.optString("id"),
            title = item.optString("title", item.optString("id", "处置步骤")),
            completed = item.optBoolean("completed"),
        )
    },
    postmortem = optJSONObject("postmortem")?.let { pm ->
        IncidentPostmortem(
            summary = pm.optString("summary"),
            rootCause = pm.optString("rootCause"),
            impact = pm.optString("impact"),
            correctiveActions = pm.optString("correctiveActions"),
            completedAt = pm.nullableString("completedAt"),
        )
    },
)

private fun JSONObject.toAuditInfo() = AuditInfo(
    id = optString("id", optString("_id")),
    action = optString("action", "platform.event"),
    actor = optString("actor", "system"),
    outcome = optString("outcome", "success"),
    occurredAt = nullableString("occurredAt") ?: nullableString("createdAt"),
)

private fun JSONArray?.objects(): List<JSONObject> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optJSONObject(index)?.let(::add)
    }
}

private fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
}

private fun JSONObject?.optStringOr(key: String, fallback: String): String = this?.optString(key, fallback) ?: fallback

private fun JSONObject.nullableString(key: String): String? =
    takeIf { has(key) && !isNull(key) }?.optString(key)?.takeIf { it.isNotBlank() }

private fun JSONObject.optLongOrNull(key: String): Long? =
    takeIf { has(key) && !isNull(key) }?.optLong(key)?.takeIf { it != 0L }

private fun JSONObject.optIntOrNull(key: String): Int? =
    takeIf { has(key) && !isNull(key) }?.optInt(key)

private fun JSONObject.optDoubleOrNull(key: String): Double? =
    takeIf { has(key) && !isNull(key) }?.optDouble(key)?.takeIf { it.isFinite() }
