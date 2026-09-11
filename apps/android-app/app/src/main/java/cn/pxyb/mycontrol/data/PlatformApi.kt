package cn.pxyb.mycontrol.data

import android.os.Build
import cn.pxyb.mycontrol.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.Locale

class PlatformApi(
    private val sessionStore: SessionStore,
    private val snapshotStore: ResponseSnapshotStore,
) {
    init {
        snapshotStore.setAccount(sessionStore.readActiveUsername())
    }

    fun setAccount(username: String?) {
        snapshotStore.setAccount(username)
    }
    internal val http = PlatformHttpClient(sessionStore, snapshotStore)
    val auth = PlatformAuthRepository(http, sessionStore, snapshotStore)
    val campus = CampusRepository(http)
    val iot = IotRepository(http)

    suspend fun isOffline(): Boolean = http.isOffline()
    suspend fun cachedAtMillis(): Long? = http.cachedAtMillis()

    suspend fun <T> withRequestMetadata(allowCache: Boolean = true, block: suspend () -> T): PlatformResult<T> =
        http.withRequestMetadata(allowCache, block)

    suspend fun externalApplications(): List<ExternalApplication> = withContext(Dispatchers.IO) {
        parseExternalApplications(execute(EXTERNAL_APPLICATIONS_PATH).json)
    }

    suspend fun launchExternalApplication(id: String): ExternalApplicationLaunch = withContext(Dispatchers.IO) {
        parseExternalApplicationLaunch(
            execute(
                "$EXTERNAL_APPLICATIONS_PATH/${encodePath(id)}/launch",
                "POST",
                JSONObject(),
            ).json,
        )
    }

    suspend fun overview(force: Boolean = false): OverviewData = withContext(Dispatchers.IO) {
        val path = if (force) "/api/operations/overview?refresh=1" else "/api/operations/overview"
        val json = execute(path).json
        OverviewData(
            services = json.optJSONArray("services").platformObjects().map { it.toServiceInfo() },
            incidents = json.optJSONArray("incidents").platformObjects().map { it.toIncidentInfo() },
            audits = json.optJSONArray("audit").platformObjects().map { it.toAuditInfo() },
            refreshedAt = json.nullableString("refreshedAt") ?: json.nullableString("generatedAt"),
        )
    }

    suspend fun incidents(): List<IncidentInfo> = withContext(Dispatchers.IO) {
        execute("/api/incidents?limit=100").json
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
        execute("/api/incidents/${encodePath(id)}/actions", "POST", body).json
            .optJSONObject("incident")
            ?.toIncidentInfo()
            ?: throw ApiException("异常操作未返回有效结果。", 502, "INCIDENT_ACTION_INVALID")
    }

    suspend fun tasks(): TaskData = withContext(Dispatchers.IO) {
        val json = execute("/api/tasks?limit=100").json
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

    suspend fun todos(): TodoSnapshot = withContext(Dispatchers.IO) {
        execute(TODOS_PATH).json.toTodoSnapshotEnvelope()
    }

    suspend fun dailyNews(): DailyNews = withContext(Dispatchers.IO) {
        val data = execute(DAILY_NEWS_PATH).json.optJSONObject("data") ?: JSONObject()
        DailyNews(
            news = data.optJSONArray("news").toStringList(),
            tip = data.optString("tip"),
            date = data.optString("date"),
            isMaintenance = data.optBoolean("isMaintenance"),
        )
    }

    suspend fun appNotifications(
        limit: Int = 50,
        cursor: String? = null,
        unreadOnly: Boolean = false,
    ): AppNotificationPage = withContext(Dispatchers.IO) {
        val query = buildList {
            add("limit=${limit.coerceIn(1, 100)}")
            cursor?.takeIf(String::isNotBlank)?.let { add("cursor=${encodePath(it)}") }
            if (unreadOnly) add("unreadOnly=true")
        }.joinToString("&")
        execute("/api/app/notifications?$query").json
            .toAppNotificationPage()
    }

    suspend fun allAppNotifications(maxItems: Int = 200): List<AppAlertRecord> = withContext(Dispatchers.IO) {
        val result = mutableListOf<AppAlertRecord>()
        var cursor: String? = null
        repeat(3) {
            val page = appNotifications(limit = 100, cursor = cursor)
            result += page.items
            if (result.size >= maxItems || page.nextCursor == null) return@withContext result.take(maxItems)
            cursor = page.nextCursor
        }
        result.take(maxItems)
    }

    suspend fun markAppNotificationRead(id: String) = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/${encodePath(id)}/read", "POST", JSONObject())
        Unit
    }

    suspend fun markAppNotificationUnread(id: String) = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/${encodePath(id)}/unread", "POST", JSONObject())
        Unit
    }

    suspend fun snoozeAppNotification(id: String, snoozedUntilMillis: Long) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/notifications/${encodePath(id)}/snooze",
            "POST",
            JSONObject().put("snoozedUntil", Instant.ofEpochMilli(snoozedUntilMillis).toString()),
        )
        Unit
    }

    suspend fun archiveAppNotification(id: String) = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/${encodePath(id)}", "DELETE")
        Unit
    }

    suspend fun markAllAppNotificationsRead() = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/read-all", "POST", JSONObject())
        Unit
    }

    suspend fun clearReadAppNotifications() = withContext(Dispatchers.IO) {
        execute("/api/app/notifications/clear-read", "POST", JSONObject())
        Unit
    }

    suspend fun appNotificationPreference(): AppNotificationPreference = withContext(Dispatchers.IO) {
        execute("/api/app/preferences").json
            .optJSONObject("preference")
            ?.toAppNotificationPreference()
            ?: AppNotificationPreference()
    }

    suspend fun saveAppNotificationPreference(preference: AppNotificationPreference) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/preferences",
            "PUT",
            JSONObject()
                .put("enabled", preference.enabled)
                .put(
                    "quietHours",
                    JSONObject()
                        .put("enabled", preference.quietHoursEnabled)
                        .put("startHour", preference.quietStartHour)
                        .put("endHour", preference.quietEndHour),
                )
                .put("timezoneOffsetMinutes", preference.timezoneOffsetMinutes),
        )
        Unit
    }

    suspend fun registerAppDevice(installationId: String) = withContext(Dispatchers.IO) {
        execute(
            "/api/app/devices",
            "POST",
            JSONObject()
                .put("installationId", installationId)
                .put("provider", "poll")
                .put("appVersion", BuildConfig.VERSION_NAME)
                .put("deviceModel", "${Build.MANUFACTURER} ${Build.MODEL}".trim()),
        )
        Unit
    }

    suspend fun mutateTodos(revision: Int, mutations: List<TodoMutation>): TodoSnapshot =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("revision", revision)
                .put("operations", JSONArray().apply { mutations.forEach { put(it.toJson()) } })
            execute("$TODOS_PATH/mutations", "POST", body).json.toTodoSnapshotEnvelope()
        }

    suspend fun resourceExpiries(): List<ResourceExpiry> = withContext(Dispatchers.IO) {
        execute(RESOURCE_EXPIRIES_PATH).json.optJSONArray("data").platformObjects().map { item ->
            ResourceExpiry(
                id = item.optString("id"),
                type = item.optString("type"),
                name = item.optString("name", "未命名资源"),
                expiresAt = item.optString("expiresAt"),
                advanceNoticeDays = item.optInt("advanceNoticeDays").coerceAtLeast(0),
            )
        }
    }

    suspend fun releases(): ReleaseData = withContext(Dispatchers.IO) {
        val json = execute("/api/releases").json
        ReleaseData(
            builds = json.optJSONArray("builds").platformObjects().map { item ->
                ReleaseBuild(
                    id = item.optString("id"),
                    status = item.optString("status", "unknown"),
                    conclusion = item.optString("conclusion", item.optString("status", "unknown")),
                    revision = item.optString("revision", item.optString("sha", "")),
                    createdAt = item.nullableString("createdAt") ?: item.nullableString("startedAt"),
                    components = item.optJSONArray("artifacts").platformObjects().mapNotNull { it.nullableString("component") },
                )
            },
        )
    }

    suspend fun androidReleases(): AndroidReleaseCatalog = withContext(Dispatchers.IO) {
        parseAndroidReleaseCatalog(execute("/api/android-releases").json)
    }

    suspend fun saveAndroidReleaseDraft(versionName: String, notes: String): AndroidReleaseDraft =
        withContext(Dispatchers.IO) {
            execute(
                "/api/android-releases/draft",
                "PUT",
                JSONObject()
                    .put("versionName", versionName)
                    .put("notes", notes),
            ).json.toAndroidReleaseDraft()
        }

    suspend fun dispatchAndroidBuild(): AndroidReleaseDispatchResult = withContext(Dispatchers.IO) {
        val json = execute("/api/android-releases/build", "POST", JSONObject()).json
        AndroidReleaseDispatchResult(
            dispatched = json.optBoolean("dispatched"),
            workflow = json.optString("workflow"),
            ref = json.optString("ref"),
        )
    }

    suspend fun acrImages(refresh: Boolean = false): AcrImageCatalog = withContext(Dispatchers.IO) {
        val path = if (refresh) "$ACR_IMAGES_PATH?refresh=1" else ACR_IMAGES_PATH
        parseAcrImageCatalog(execute(path, timeoutSeconds = 45).json)
    }

    suspend fun deleteAcrImages(tags: List<String>): AcrImageMutation = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("confirm", true)
            .put("tags", JSONArray().apply { tags.forEach { put(it) } })
        parseAcrImageMutation(execute("$ACR_IMAGES_PATH/delete", "POST", body, timeoutSeconds = 180).json)
    }

    suspend fun pruneAcrImages(
        keep: Int,
        prefixes: List<String> = emptyList(),
        includeUnknown: Boolean = false,
        dryRun: Boolean = true,
    ): AcrImageMutation = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("keep", keep)
            .put("includeUnknown", includeUnknown)
            .put("dryRun", dryRun)
            .put("confirm", !dryRun)
        if (prefixes.isNotEmpty()) {
            body.put("prefixes", JSONArray().apply { prefixes.forEach { put(it) } })
        }
        parseAcrImageMutation(execute("$ACR_IMAGES_PATH/prune", "POST", body, timeoutSeconds = 180).json)
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

    suspend fun ct8(): Ct8Data = withContext(Dispatchers.IO) {
        val statsEnvelope = execute("/apps/core/api/ct8/stats").json
        val statusEnvelope = execute("/apps/core/api/ct8/status?limit=6").json
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

    suspend fun runDiagnostics(): DiagnosticData = withContext(Dispatchers.IO) {
        val json = execute("/api/diagnostics/run", "POST", JSONObject(), timeoutSeconds = 45).json
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

    suspend fun triggerBackup(): Unit = withContext(Dispatchers.IO) {
        execute("/api/backups/run", "POST", JSONObject(), timeoutSeconds = 45)
        Unit
    }

    suspend fun triggerCt8(): Unit = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/trigger", "POST", JSONObject().put("inputs", JSONObject()), timeoutSeconds = 45)
        Unit
    }

    suspend fun githubRepositories(): List<GitHubRepositoryRecord> = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/repos").json
            .optJSONArray("repositories")
            .platformObjects()
            .map { it.toGitHubRepositoryRecord() }
    }

    suspend fun githubProfile(): GitHubProfileRecord? = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/profile").json
            .optJSONObject("profile")
            ?.toGitHubProfileRecord()
    }

    suspend fun updateGitHubVisibility(
        owner: String,
        repo: String,
        visibility: String,
    ): GitHubRepositoryRecord = withContext(Dispatchers.IO) {
        val body = JSONObject().put("visibility", visibility)
        val repository = execute(
            "/apps/core/api/ct8/repos/${encodePath(owner)}/${encodePath(repo)}/visibility",
            "PATCH",
            body,
        ).json.optJSONObject("repository")
        repository?.toGitHubRepositoryRecord()
            ?: throw ApiException("服务器未返回更新后的仓库信息。", 502, "INVALID_RESPONSE")
    }

    suspend fun githubReleases(owner: String, repo: String): List<GitHubReleaseRecord> = withContext(Dispatchers.IO) {
        execute("/apps/core/api/ct8/repos/${encodePath(owner)}/${encodePath(repo)}/releases").json
            .optJSONArray("releases")
            .platformObjects()
            .map { it.toGitHubReleaseRecord() }
    }

    suspend fun createGitHubRelease(
        owner: String,
        repo: String,
        tag: String,
        name: String,
        body: String,
        draft: Boolean,
        prerelease: Boolean,
    ): GitHubReleaseRecord = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("tag", tag)
            .put("name", name)
            .put("body", body)
            .put("draft", draft)
            .put("prerelease", prerelease)
        val release = execute(
            "/apps/core/api/ct8/repos/${encodePath(owner)}/${encodePath(repo)}/releases",
            "POST",
            payload,
        ).json.optJSONObject("release")
        release?.toGitHubReleaseRecord()
            ?: throw ApiException("服务器未返回新建的发行版本。", 502, "INVALID_RESPONSE")
    }
    suspend fun assistantChat(
        messages: List<AssistantChatTurn>,
        context: JSONObject,
    ): AssistantChatReply = withContext(Dispatchers.IO) {
        val messageArray = JSONArray()
        messages.forEach { turn ->
            messageArray.put(
                JSONObject()
                    .put("role", turn.role)
                    .put("content", turn.content),
            )
        }
        val body = JSONObject()
            .put("messages", messageArray)
            .put("context", context)
        val json = execute("/api/assistant/chat", "POST", body, timeoutSeconds = 60).json
        val suggestionArray = json.optJSONArray("suggestions")
        val suggestions = buildList {
            if (suggestionArray != null) {
                for (i in 0 until suggestionArray.length()) {
                    val item = suggestionArray.optJSONObject(i) ?: continue
                    val title = item.optString("title").trim()
                    val destination = item.optString("destination").trim()
                    if (title.isNotEmpty() && destination.isNotEmpty()) {
                        add(AssistantSuggestion(title = title, destination = destination))
                    }
                }
            }
        }
        val actionArray = json.optJSONArray("actions")
        val actions = buildList {
            if (actionArray != null) {
                for (i in 0 until actionArray.length()) {
                    val item = actionArray.optJSONObject(i) ?: continue
                    val type = item.optString("type").trim()
                    if (type.isNotEmpty()) {
                        add(AssistantActionItem(type = type, title = item.optString("title").trim()))
                    }
                }
            }
        }
        AssistantChatReply(
            reply = json.optString("reply"),
            suggestions = suggestions,
            actions = actions,
        )
    }

    suspend fun googleAccounts(): GoogleAccountSnapshot = withContext(Dispatchers.IO) {
        execute("/api/google-accounts").json.toGoogleAccountSnapshot()
    }

    suspend fun replaceGoogleAccounts(
        accounts: List<GoogleAccountRecord>,
        revision: Int,
    ): GoogleAccountSnapshot = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("revision", revision)
            .put("accounts", JSONArray().apply { accounts.forEach { put(it.toGoogleAccountJson()) } })
        execute("/api/google-accounts", "PUT", body).json.toGoogleAccountSnapshot()
    }

    private suspend fun execute(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = true,
        timeoutSeconds: Long = 30,
    ): PlatformResponse = http.execute(path, method, body, authenticated, timeoutSeconds)

    private companion object {
        const val AUTH_STATUS_PATH = "/api/auth/status"
        const val EXTERNAL_APPLICATIONS_PATH = "/api/external-apps"
        const val TODOS_PATH = "/apps/core/api/todos"
        const val ACR_IMAGES_PATH = "/api/acr/images"
        const val DAILY_NEWS_PATH = "/apps/core/api/news/daily"
        const val RESOURCE_EXPIRIES_PATH = "/apps/core/api/resources/expiry-summary"
    }
}

internal fun parseExternalApplications(json: JSONObject): List<ExternalApplication> =
    json.optJSONArray("applications").platformObjects().map { item ->
        val health = item.optJSONObject("health") ?: JSONObject()
        ExternalApplication(
            id = item.optString("id"),
            kind = item.optString("kind", "oidc"),
            name = item.optString("name", "外部应用"),
            description = item.optString("description"),
            launchUrl = item.optString("launchUrl"),
            healthUrl = item.nullableString("healthUrl"),
            requiredRole = item.optString("requiredRole", "viewer"),
            openMode = item.optString("openMode", "webview"),
            enabled = item.optBoolean("enabled", true),
            canAccess = item.optBoolean("canAccess", false),
            health = ExternalApplicationHealth(
                state = health.optString("state", "unmonitored"),
                httpStatus = health.optIntOrNull("httpStatus"),
                latencyMs = health.optLongOrNull("latencyMs"),
                checkedAt = health.nullableString("checkedAt"),
            ),
        )
    }

internal fun parseExternalApplicationLaunch(json: JSONObject) = ExternalApplicationLaunch(
    loginUrl = json.optString("loginUrl"),
    openMode = json.optString("openMode", "webview"),
    expiresAt = json.nullableString("expiresAt"),
    autoLogin = json.optJSONObject("autoLogin")?.let { autoLogin ->
        ExternalApplicationAutoLogin(
            loginUrl = autoLogin.optString("loginUrl"),
            username = autoLogin.optString("username"),
            password = autoLogin.optString("password"),
            homeUrl = autoLogin.nullableString("homeUrl"),
        )
    },
)

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

private fun JSONObject.toGoogleAccountSnapshot(): GoogleAccountSnapshot {
    val data = optJSONArray("accounts") ?: optJSONArray("data") ?: JSONArray()
    return GoogleAccountSnapshot(
        accounts = data.toGoogleAccounts(),
        revision = optInt("revision", 0).coerceAtLeast(0),
    )
}

private fun JSONArray.toGoogleAccounts(): List<GoogleAccountRecord> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let { add(it.toGoogleAccount()) }
}

private fun JSONObject.toGoogleAccount(): GoogleAccountRecord {
    val aliases = (optJSONArray("aliases") ?: JSONArray()).toGoogleAliases()
    return GoogleAccountRecord(
        id = optString("id"),
        primaryEmail = optString("primaryEmail"),
        displayName = optString("displayName"),
        emailStatus = optString("emailStatus", "unknown"),
        openAiStatus = optString("openAiStatus").ifBlank {
            if (aliases.any { it.openAiStatus == "registered" }) "registered" else "unregistered"
        },
        note = optString("note"),
        lastCheckedAt = optLongOrNull("lastCheckedAt"),
        nextReviewAt = optLongOrNull("nextReviewAt"),
        tags = (optJSONArray("tags") ?: JSONArray()).toStrings(),
        archived = optBoolean("archived", false),
        aliases = aliases,
    )
}

private fun JSONArray.toGoogleAliases(): List<GoogleAliasRecord> = buildList {
    for (index in 0 until length()) optJSONObject(index)?.let { add(it.toGoogleAlias()) }
}

private fun JSONObject.toGoogleAlias(): GoogleAliasRecord = GoogleAliasRecord(
    id = optString("id"),
    address = optString("address"),
    aliasType = optString("aliasType", "plus"),
    aliasStatus = optString("aliasStatus", "candidate"),
    openAiStatus = optString("openAiStatus", "unregistered"),
    registeredAt = optLongOrNull("registeredAt"),
    lastVerifiedAt = optLongOrNull("lastVerifiedAt"),
    note = optString("note"),
)

private fun GoogleAccountRecord.toGoogleAccountJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("primaryEmail", primaryEmail)
    put("displayName", displayName)
    put("emailStatus", emailStatus)
    put("openAiStatus", openAiStatus)
    put("note", note)
    put("lastCheckedAt", lastCheckedAt ?: JSONObject.NULL)
    put("nextReviewAt", nextReviewAt ?: JSONObject.NULL)
    put("tags", JSONArray().apply { tags.forEach { put(it) } })
    put("archived", archived)
    put("aliases", JSONArray().apply { aliases.forEach { put(it.toGoogleAliasJson()) } })
}

private fun GoogleAliasRecord.toGoogleAliasJson(): JSONObject = JSONObject().apply {
    put("id", id)
    put("address", address)
    put("aliasType", aliasType)
    put("aliasStatus", aliasStatus)
    put("openAiStatus", openAiStatus)
    put("registeredAt", registeredAt ?: JSONObject.NULL)
    put("lastVerifiedAt", lastVerifiedAt ?: JSONObject.NULL)
    put("note", note)
}

private fun JSONArray.toStrings(): List<String> = buildList {
    for (index in 0 until length()) {
        optString(index).trim().takeIf(String::isNotBlank)?.let(::add)
    }
}.distinct()

internal fun JSONArray?.toInts(): List<Int> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optInt(index).takeIf { it > 0 }?.let(::add)
    }
}

private fun JSONObject.toTodoSnapshotEnvelope(): TodoSnapshot {
    val data = optJSONArray("data") ?: optJSONArray("tasks") ?: JSONArray()
    return TodoSnapshot(
        tasks = data.platformObjects().mapNotNull(JSONObject::toTodoTask),
        revision = optInt("revision", 0).coerceAtLeast(0),
    )
}

internal fun JSONArray?.platformObjects(): List<JSONObject> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optJSONObject(index)?.let(::add)
    }
}

internal fun parseCampusReservationSpacesPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<CampusReservationSpace> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val directList = when (payload) {
        is JSONArray -> payload.platformObjects().filter(JSONObject::isCampusReservationSpaceRow)
        is JSONObject -> payload.optJSONArray("data").platformObjects().filter(JSONObject::isCampusReservationSpaceRow)
        else -> emptyList()
    }
    val targetList = directList.takeIf { it.isNotEmpty() } ?: findNestedCampusReservationSpaceRows(payload)
    return targetList.mapNotNull(JSONObject::toCampusReservationSpace)
}

internal fun parseLibrarySeatOverviewPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): LibrarySeatOverview {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val root = when (payload) {
        is JSONObject -> payload
        is JSONArray -> JSONObject().put("buildings", payload)
        else -> JSONObject()
    }
    val venuesSource = root.optJSONArray("buildings")
        ?: root.optJSONArray("venues")
        ?: root.optJSONArray("list")
        ?: root.optJSONArray("data")
        ?: JSONArray()
    val venues = venuesSource.platformObjects().mapNotNull { row ->
        val id = row.seatString("id", "buildingId", "value")
        val name = row.seatString("name", "buildingName", "label").ifBlank { if (id.isNotBlank()) "场馆 $id" else "" }
        if (id.isBlank() || name.isBlank()) return@mapNotNull null
        val floorsSource = row.optJSONArray("floors")
            ?: row.optJSONArray("floorList")
            ?: row.optJSONArray("children")
            ?: JSONArray()
        LibrarySeatVenue(
            id = id,
            name = name,
            floors = floorsSource.platformObjects().mapNotNull { floor ->
                val floorId = floor.seatString("id", "floorId", "value")
                val floorName = floor.seatString("name", "floorName", "label").ifBlank { if (floorId.isNotBlank()) "楼层 $floorId" else "" }
                if (floorId.isBlank() || floorName.isBlank()) null else LibrarySeatFloor(floorId, floorName)
            }
        )
    }
    val dates = (root.optJSONArray("dates")
        ?: root.optJSONObject("data")?.optJSONArray("dates")
        ?: json.optJSONArray("dates")
        ?: jsonArray).strings()
    return LibrarySeatOverview(venues = venues, dates = dates)
}

internal fun parseLibrarySeatAreasPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<LibrarySeatArea> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.platformObjects()
        is JSONObject -> payload.optJSONArray("areas")?.platformObjects()
            ?: payload.optJSONArray("pageList")?.platformObjects()
            ?: payload.optJSONArray("list")?.platformObjects()
            ?: payload.optJSONArray("rows")?.platformObjects()
            ?: payload.optJSONArray("records")?.platformObjects()
            ?: payload.optJSONObject("data")?.optJSONArray("pageList")?.platformObjects()
            ?: payload.optJSONObject("data")?.optJSONArray("list")?.platformObjects()
            ?: payload.optJSONObject("data")?.optJSONArray("rows")?.platformObjects()
            ?: payload.optJSONObject("data")?.optJSONArray("records")?.platformObjects()
            ?: emptyList()
        else -> emptyList()
    }
    return rows.mapNotNull { row ->
        val id = row.seatString("id", "roomId", "areaId", "area_id")
        if (id.isBlank()) return@mapNotNull null
        LibrarySeatArea(
            id = id,
            venueId = row.seatString("buildingId", "venueId"),
            floorId = row.seatString("floorId"),
            name = row.seatString("name", "roomName").ifBlank { "阅览区 $id" },
            nameE = row.seatString("nameE", "englishName"),
            buildingName = row.seatString("buildingName", "venueName"),
            floorName = row.seatString("floorName"),
            seatTotal = row.optionalSeatInt("seatTotal", "total"),
            seatFree = row.optionalSeatInt("seatFree", "free"),
            seatLock = row.optionalSeatInt("seatLock", "locked"),
            seatScene = row.optionalSeatInt("seatScene", "scene"),
            maxMinute = row.optionalSeatInt("maxMinute"),
            type = row.seatString("type"),
            markMode = row.optionalSeatInt("markMode"),
        )
    }
}

internal fun parseLibrarySeatSeatsPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<LibrarySeatStatus> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.platformObjects()
        is JSONObject -> {
            val direct = mutableListOf<JSONObject>()
            val keys = payload.keys()
            while (keys.hasNext()) {
                val value = payload.opt(keys.next())
                when (value) {
                    is JSONObject -> direct.add(value)
                    is JSONArray -> direct.addAll(value.platformObjects())
                }
            }
            direct
        }
        else -> emptyList()
    }
    return rows.mapNotNull { row ->
        val id = row.seatString("id", "seatId")
        if (id.isBlank()) return@mapNotNull null
        val status = row.seatString("status")
        LibrarySeatStatus(
            id = id,
            label = row.seatString("label", "seatNo", "no").ifBlank { id },
            name = row.seatString("name", "seatName").ifBlank { "座位 $id" },
            status = status,
            statusText = when (status.uppercase()) {
                "FREE" -> "可预约"
                "IN_USE" -> "已占用"
                "LOCK", "LOCKED" -> "锁定"
                "BROKEN" -> "不可用"
                else -> status.ifBlank { "未知" }
            },
            isFree = status.equals("FREE", ignoreCase = true),
        )
    }.sortedWith(compareBy<LibrarySeatStatus> { it.label.toIntOrNull() ?: Int.MAX_VALUE }.thenBy { it.label })
}

internal fun parseLibrarySeatReservationRecordsPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): List<LibrarySeatReservationRecord> {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.platformObjects()
        is JSONObject -> payload.optJSONArray("list")?.platformObjects()
            ?: payload.optJSONArray("records")?.platformObjects()
            ?: payload.optJSONArray("pageList")?.platformObjects()
            ?: emptyList()
        else -> emptyList()
    }
    return rows.mapNotNull { parseLibrarySeatReservationRecord(it) }
}

internal fun parseLibrarySeatReservationHistoryPayload(
    json: JSONObject,
    jsonArray: JSONArray = JSONArray(),
): LibrarySeatReservationHistory {
    val payload = json.opt("data") ?: json.takeIf { it.length() > 0 } ?: jsonArray
    val rows = when (payload) {
        is JSONArray -> payload.platformObjects()
        is JSONObject -> payload.optJSONArray("list")?.platformObjects()
            ?: payload.optJSONArray("records")?.platformObjects()
            ?: emptyList()
        else -> emptyList()
    }
    val total = if (payload is JSONObject) payload.optInt("total", payload.optInt("count", rows.size)) else rows.size
    return LibrarySeatReservationHistory(
        total = total,
        records = rows.mapNotNull { parseLibrarySeatReservationRecord(it) },
    )
}

internal fun parseLibrarySeatReservationRecord(row: JSONObject): LibrarySeatReservationRecord? {
    val id = row.seatString("id")
    if (id.isBlank()) return null
    val status = row.seatString("status")
    return LibrarySeatReservationRecord(
        id = id,
        seatId = row.seatString("seatId"),
        seatLabel = row.seatString("seatLabel", "seatNo"),
        receipt = row.seatString("receipt"),
        date = row.seatString("date", "makeDateStr", "makeDate"),
        startTime = row.seatString("startTime", "makeBeginStr"),
        endTime = row.seatString("endTime", "makeEndStr"),
        actualTime = row.seatString("actualTime", "actualStr"),
        location = row.seatString("location"),
        buildName = row.seatString("buildName"),
        floorName = row.seatString("floorName"),
        roomName = row.seatString("roomName"),
        status = status,
        statusText = when (status.uppercase()) {
            "RESERVE" -> "预约"
            "CHECK_IN" -> "履约中"
            "AWAY" -> "暂离"
            "LEAVE_EARLY" -> "早退"
            "STOP" -> "已结束"
            "MISS" -> "失约"
            "CANCEL" -> "已取消"
            "NO_STOP" -> "未签退"
            else -> status.ifBlank { "未知" }
        },
        message = row.seatString("message"),
        awayRange = row.seatString("awayRange"),
    )
}

internal fun JSONObject.toLibrarySeatWaitlistTask(): LibrarySeatWaitlistTask? {
    val id = seatString("id")
    if (id.isBlank()) return null
    val status = seatString("status").ifBlank { "listening" }
    return LibrarySeatWaitlistTask(
        id = id,
        enabled = optBoolean("enabled", false),
        venueId = seatString("venueId"),
        venueName = seatString("venueName"),
        floorId = seatString("floorId"),
        floorName = seatString("floorName"),
        date = seatString("date"),
        startMinute = optInt("startMinute", 0),
        endMinute = optInt("endMinute", 0),
        minLabel = optInt("minLabel", 1),
        maxLabel = optInt("maxLabel", 45),
        seatLabels = optJSONArray("seatLabels").toInts(),
        status = status,
        statusText = when (status) {
            "success" -> "已预约成功"
            "failed" -> "已停止"
            "stopped" -> "已停止"
            "expired" -> "时段已结束"
            else -> "监听中"
        },
        lastMessage = seatString("lastMessage"),
        lastAreaName = seatString("lastAreaName"),
        lastSeatLabel = seatString("lastSeatLabel"),
        lastSeatId = seatString("lastSeatId"),
        consecutiveFailures = optInt("consecutiveFailures", 0),
        createdAt = seatString("createdAt"),
        updatedAt = seatString("updatedAt"),
        lastRunAt = seatString("lastRunAt"),
    )
}

private fun findNestedCampusReservationSpaceRows(value: Any?): List<JSONObject> {
    val queue = ArrayDeque<Any>()
    val foundArrays = mutableListOf<List<JSONObject>>()
    if (value is JSONObject || value is JSONArray) queue.add(value)

    val seen = mutableSetOf<Any>()
    while (queue.isNotEmpty()) {
        val current = queue.removeFirst()
        if (!seen.add(current)) continue
        when (current) {
            is JSONArray -> {
                val list = current.platformObjects().filter(JSONObject::isNamedCampusReservationSpaceRow)
                if (list.isNotEmpty()) foundArrays.add(list)
                for (i in 0 until current.length()) {
                    current.opt(i)?.let { if (it is JSONObject || it is JSONArray) queue.add(it) }
                }
            }
            is JSONObject -> {
                val keys = current.keys()
                while (keys.hasNext()) {
                    current.opt(keys.next())?.let { if (it is JSONObject || it is JSONArray) queue.add(it) }
                }
            }
        }
    }
    return foundArrays.maxByOrNull { it.size } ?: emptyList()
}

private fun JSONObject.seatString(vararg keys: String): String {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        val text = opt(key)?.toString()?.trim().orEmpty()
        if (text.isNotBlank()) return text
    }
    return ""
}

private fun JSONObject.optionalSeatInt(vararg keys: String): Int {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        val value = opt(key)
        val number = when (value) {
            is Number -> value.toInt()
            else -> value?.toString()?.trim()?.toIntOrNull()
        }
        if (number != null) return number
    }
    return 0
}

private fun JSONObject.toCampusReservationSpace(): CampusReservationSpace? {
    val id = campusReservationSpaceId()
    if (id <= 0) return null
    return CampusReservationSpace(
        id = id,
        name = campusReservationSpaceName() ?: "空间 $id",
    )
}

private fun JSONObject.isCampusReservationSpaceRow(): Boolean =
    campusReservationSpaceId() > 0

private fun JSONObject.isNamedCampusReservationSpaceRow(): Boolean =
    isCampusReservationSpaceRow() && campusReservationSpaceName() != null

private fun JSONObject.campusReservationSpaceId(): Int =
    optInt("id", optInt("area_id", optInt("areaId", 0)))

private fun JSONObject.campusReservationSpaceName(): String? =
    displayString("name")
        ?: displayString("area_name")
        ?: displayString("areaName")
        ?: displayString("title")
        ?: displayString("room_name")

private fun JSONArray?.strings(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optString(index).takeIf(String::isNotBlank)?.let(::add)
    }
}

internal fun JSONArray?.toStringList(): List<String> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) optString(index).takeIf { it.isNotBlank() }?.let(::add)
    }
}

private fun JSONObject?.optStringOr(key: String, fallback: String): String = this?.optString(key, fallback) ?: fallback

private fun JSONObject.toGitHubRepositoryRecord(): GitHubRepositoryRecord = GitHubRepositoryRecord(
    name = optString("name"),
    fullName = optString("full_name", optString("fullName", optString("name"))),
    description = nullableString("description"),
    visibility = optString("visibility", if (optBoolean("private")) "private" else "public"),
    isPrivate = optBoolean("private"),
    htmlUrl = nullableString("html_url") ?: nullableString("htmlUrl"),
    language = nullableString("language"),
    defaultBranch = nullableString("default_branch") ?: nullableString("defaultBranch"),
    updatedAt = nullableString("updated_at") ?: nullableString("updatedAt"),
    starCount = optInt("stargazers_count", 0),
    forkCount = optInt("forks_count", 0),
    fork = optBoolean("fork"),
    archived = optBoolean("archived"),
)
private fun JSONObject.toGitHubProfileRecord(): GitHubProfileRecord = GitHubProfileRecord(
    login = optString("login"),
    name = nullableString("name"),
    avatarUrl = nullableString("avatar_url") ?: nullableString("avatarUrl"),
    htmlUrl = nullableString("html_url") ?: nullableString("htmlUrl"),
    bio = nullableString("bio"),
    publicRepos = nullableInt("public_repos"),
    followers = nullableInt("followers"),
    following = nullableInt("following"),
)
private fun JSONObject.toGitHubReleaseRecord(): GitHubReleaseRecord = GitHubReleaseRecord(
    tagName = optString("tag_name"),
    name = nullableString("name"),
    body = nullableString("body"),
    draft = optBoolean("draft"),
    prerelease = optBoolean("prerelease"),
    publishedAt = nullableString("published_at") ?: nullableString("created_at"),
    htmlUrl = nullableString("html_url"),
    targetCommitish = nullableString("target_commitish"),
    assetsCount = optInt("assets_count", 0),
)

internal fun parseAndroidReleaseCatalog(json: JSONObject): AndroidReleaseCatalog {
    val releases = json.optJSONArray("releases").platformObjects().map { it.toAndroidReleaseRecord() }
    return AndroidReleaseCatalog(
        draft = json.optJSONObject("draft")?.toAndroidReleaseDraft(),
        releases = releases,
        latest = json.optJSONObject("latest")?.toAndroidReleaseRecord(),
        buildInProgress = json.optBoolean("buildInProgress"),
    )
}

private fun JSONObject.toAndroidReleaseDraft(): AndroidReleaseDraft = AndroidReleaseDraft(
    id = optString("id"),
    versionName = optString("versionName"),
    versionCode = optInt("versionCode"),
    tag = optString("tag"),
    notes = optString("notes"),
    createdAt = nullableString("createdAt"),
    updatedAt = nullableString("updatedAt"),
)

private fun JSONObject.toAndroidReleaseRecord(): AndroidReleaseRecord = AndroidReleaseRecord(
    id = optString("id"),
    versionName = optString("versionName"),
    versionCode = optInt("versionCode"),
    tag = optString("tag"),
    apkUrl = nullableString("apkUrl"),
    fallbackApkUrl = nullableString("fallbackApkUrl"),
    sha256 = nullableString("sha256"),
    apkSize = optLong("apkSize"),
    releaseUrl = nullableString("releaseUrl"),
    publishedAt = nullableString("publishedAt"),
    notes = optString("notes"),
    installable = optBoolean("installable"),
)
internal fun JSONObject.nullableString(key: String): String? =
    takeIf { has(key) && !isNull(key) }?.optString(key)?.takeIf { it.isNotBlank() }

internal fun parseAcrImageCatalog(json: JSONObject): AcrImageCatalog {
    val timeline = json.optJSONObject("commitTimeline") ?: JSONObject()
    val limits = json.optJSONObject("limits") ?: JSONObject()
    return AcrImageCatalog(
        repository = json.optString("repository"),
        registry = json.optString("registry"),
        tagCount = json.optInt("tagCount"),
        credentialsConfigured = json.optBoolean("credentialsConfigured"),
        canDelete = json.optBoolean("canDelete"),
        timelineAvailable = timeline.optBoolean("available"),
        unknownTimelineTags = timeline.optInt("unknownTags"),
        protectedTags = json.optJSONArray("protectedTags").platformObjects().map { item ->
            AcrProtectedTag(
                tag = item.optString("tag"),
                reason = item.optString("reason", "protected"),
                digest = item.nullableString("digest"),
            )
        },
        groups = json.optJSONArray("groups").platformObjects().map { group ->
            AcrImageGroup(
                prefix = group.optString("prefix"),
                tags = group.optJSONArray("tags").platformObjects().map { item ->
                    AcrImageTag(
                        tag = item.optString("tag"),
                        revision = item.nullableString("revision"),
                        createdAt = item.nullableString("createdAt"),
                    )
                },
            )
        },
        otherTags = json.optJSONArray("otherTags").platformStringList(),
        maxBatch = limits.optInt("maxBatch", 60),
        fetchedAt = json.nullableString("fetchedAt"),
    )
}

internal fun parseAcrImageMutation(json: JSONObject): AcrImageMutation = AcrImageMutation(
    deleted = json.optJSONArray("deleted").toAcrOutcomes(),
    skipped = json.optJSONArray("skipped").toAcrOutcomes(),
    failed = json.optJSONArray("failed").toAcrOutcomes(),
    plan = json.optJSONArray("plan").toAcrPlannedTags(),
    planned = json.optInt("planned"),
    remaining = json.optInt("remaining"),
)

private fun JSONArray?.toAcrPlannedTags(): List<AcrPlannedTag> = platformObjects().map { item ->
    AcrPlannedTag(
        tag = item.optString("tag"),
        prefix = item.nullableString("prefix"),
        createdAt = item.nullableString("createdAt"),
    )
}

private fun JSONArray?.toAcrOutcomes(): List<AcrImageOutcome> = platformObjects().map { item ->
    AcrImageOutcome(
        tag = item.optString("tag"),
        digest = item.nullableString("digest"),
        reason = item.nullableString("reason"),
    )
}

private fun JSONArray?.platformStringList(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { index -> optString(index).takeIf { it.isNotBlank() } }
}

private fun JSONObject.nullableInt(key: String): Int? =
    takeIf { has(key) && !isNull(key) }?.optInt(key)

internal fun JSONObject.displayString(key: String): String? = opt(key)
    ?.takeUnless { it == JSONObject.NULL }
    ?.toString()
    ?.trim()
    ?.takeIf { it.isNotBlank() }

internal fun formatCampusReservationRulesForDisplay(value: Any?): String {
    val sections = mutableListOf<String>()
    collectCampusReservationRuleSections(value, sections)
    return sections
        .map(::htmlToPlainCampusText)
        .filter { it.isNotBlank() && it != "暂无数据" }
        .distinct()
        .joinToString("\n\n")
        .ifBlank { "暂无规则信息" }
}

private fun collectCampusReservationRuleSections(value: Any?, sections: MutableList<String>) {
    when (value) {
        null, JSONObject.NULL -> Unit
        is JSONObject -> {
            val keys = value.keys()
            while (keys.hasNext()) collectCampusReservationRuleSections(value.opt(keys.next()), sections)
        }
        is JSONArray -> {
            for (index in 0 until value.length()) collectCampusReservationRuleSections(value.opt(index), sections)
        }
        is String -> sections.add(value)
    }
}

private fun htmlToPlainCampusText(value: String): String {
    var text = decodeCampusHtmlEntities(value.trim())
    text = text
        .replace(Regex("(?i)<\\s*br\\s*/?\\s*>"), "\n")
        .replace(Regex("(?i)<\\s*/\\s*(p|div|li|tr|h[1-6])\\s*>"), "\n")
        .replace(Regex("(?i)<\\s*(p|div|li|tr|h[1-6])\\b[^>]*>"), "\n")
        .replace(Regex("<[^>]+>"), "")
    text = decodeCampusHtmlEntities(text)
    return text
        .replace('\u00A0', ' ')
        .replace(Regex("[\\t ]+"), " ")
        .lines()
        .map { it.trim() }
        .filter { it.isNotBlank() }
        .joinToString("\n")
}

private fun decodeCampusHtmlEntities(value: String): String {
    val named = value
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
    return Regex("&#(x?[0-9a-fA-F]+);").replace(named) { match ->
        val raw = match.groupValues[1]
        val codePoint = if (raw.startsWith("x", ignoreCase = true)) {
            raw.drop(1).toIntOrNull(16)
        } else {
            raw.toIntOrNull()
        }
        if (codePoint != null && Character.isValidCodePoint(codePoint)) {
            String(Character.toChars(codePoint))
        } else {
            match.value
        }
    }
}

private val reservationStartTimeKeys = listOf(
    "startTime",
    "start_time",
    "start",
    "beginTime",
    "begin_time",
    "begin",
    "openTime",
    "open_time",
    "startMinute",
    "start_minute",
)

private val reservationEndTimeKeys = listOf(
    "endTime",
    "end_time",
    "end",
    "closeTime",
    "close_time",
    "finishTime",
    "finish_time",
    "endMinute",
    "end_minute",
)

internal fun JSONArray?.toReservationTimeWindows(): List<CampusReservationTimeWindow> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optJSONObject(index)?.toReservationTimeWindow()?.let(::add)
        }
    }.distinct()
}

private fun JSONObject.toReservationTimeWindow(): CampusReservationTimeWindow? {
    val start = firstReservationTime(reservationStartTimeKeys)
    val end = firstReservationTime(reservationEndTimeKeys)
    return if (start != null && end != null && end > start) {
        CampusReservationTimeWindow(start = start.toReservationTimeText(), end = end.toReservationTimeText())
    } else {
        null
    }
}

private fun JSONObject.firstReservationTime(keys: List<String>): Int? {
    for (key in keys) {
        if (!has(key) || isNull(key)) continue
        parseReservationTime(opt(key))?.let { return it }
    }
    return null
}

private fun parseReservationTime(value: Any?): Int? {
    return when (value) {
        is Number -> value.toInt().takeIf { it in 0..1440 }
        else -> {
            val text = value?.toString()?.trim().orEmpty()
            val match = Regex("^(\\d{1,2}):([0-5]\\d)(?::[0-5]\\d)?$").matchEntire(text) ?: return null
            (match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()).takeIf { it in 0..1440 }
        }
    }
}

private fun Int.toReservationTimeText(): String {
    val hour = this / 60
    val minute = this % 60
    return String.format(Locale.ROOT, "%02d:%02d", hour, minute)
}

internal fun JSONObject.optionalInt(key: String): Int? = opt(key)
    ?.takeUnless { it == JSONObject.NULL }
    ?.toString()
    ?.toIntOrNull()

internal fun JSONObject.optLongOrNull(key: String): Long? =
    takeIf { has(key) && !isNull(key) }?.optLong(key)?.takeIf { it != 0L }

internal fun JSONObject.optIntOrNull(key: String): Int? =
    takeIf { has(key) && !isNull(key) }?.optInt(key)

internal fun JSONObject.optDoubleOrNull(key: String): Double? =
    takeIf { has(key) && !isNull(key) }?.optDouble(key)?.takeIf { it.isFinite() }

internal fun JSONObject.toCampusAutoReservationTask(): CampusAutoReservationTask {
    val candidatesArray = optJSONArray("candidates") ?: JSONArray()
    val candidates = buildList {
        for (i in 0 until candidatesArray.length()) {
            val obj = candidatesArray.optJSONObject(i) ?: continue
            add(
                CampusAutoReservationCandidate(
                    areaId = obj.optInt("areaId", obj.optInt("area_id", 0)),
                    startTime = obj.optString("startTime", obj.optString("start_time", "09:00")),
                    endTime = obj.optString("endTime", obj.optString("end_time", "11:00")),
                )
            )
        }
    }
    val attemptsArray = optJSONArray("lastAttempts") ?: JSONArray()
    val attempts = buildList {
        for (i in 0 until attemptsArray.length()) {
            val obj = attemptsArray.optJSONObject(i) ?: continue
            add(
                CampusAutoReservationAttempt(
                    candidateIndex = obj.optInt("candidateIndex", obj.optInt("candidate_index", -1)),
                    status = obj.optString("status"),
                    conflict = obj.optBoolean("conflict", false),
                    transient = obj.optBoolean("transient", false),
                    attempt = obj.optInt("attempt", 1),
                    message = obj.optString("message").ifBlank { null },
                )
            )
        }
    }
    val enabled = optBoolean("enabled", true)
    val lastStatus = nullableString("lastStatus")
    val status = optString("status").ifBlank {
        when {
            enabled -> "waiting"
            lastStatus != null -> lastStatus
            else -> "disabled"
        }
    }
    val statusText = optString("statusText").ifBlank { campusAutoReservationStatusText(status) }
    val reservationObject = optJSONObject("lastReservation")
    return CampusAutoReservationTask(
        id = optString("id"),
        name = optString("name"),
        enabled = enabled,
        status = status,
        statusText = statusText,
        nextRunAt = nullableString("nextRunAt"),
        reservationDate = optString("reservationDate", optString("reservation_date", optString("startDate", optString("start_date", "")))),
        executeDate = optString("executeDate", optString("execute_date", optString("runDate", optString("run_date", "")))),
        executeTime = optString("executeTime", optString("execute_time", "08:30")),
        candidates = candidates,
        title = optString("title"),
        content = optString("content"),
        mobile = optString("mobile", optString("phone", "")),
        open = optBoolean("open", false),
        lastStatus = lastStatus,
        lastMessage = nullableString("lastMessage"),
        lastCandidateIndex = optIntOrNull("lastCandidateIndex"),
        lastRunAt = nullableString("lastRunAt"),
        lastAttempts = attempts,
        lastReservation = reservationObject?.let {
            CampusAutoReservationRecord(
                id = it.optString("id", it.optString("order_id", it.optString("orderId", ""))),
                date = it.optString("date", it.optString("start_date", it.optString("startDate", ""))),
                startTime = it.optString("startTime", it.optString("start_time", "")),
                endTime = it.optString("endTime", it.optString("end_time", "")),
            )
        },
        createdAt = nullableString("createdAt"),
        updatedAt = nullableString("updatedAt"),
    )
}

private fun campusAutoReservationStatusText(status: String): String = when (status) {
    "waiting" -> "等待运行"
    "ready" -> "待执行"
    "running" -> "正在执行"
    "succeeded" -> "已完成"
    "failed" -> "执行失败"
    "auth_required" -> "需重新登录"
    "expired" -> "已过期"
    "invalid" -> "配置无效"
    else -> "已停用"
}

internal fun CampusAutoReservationTask.toJson(): JSONObject = JSONObject().apply {
    put("name", name.trim())
    put("enabled", enabled)
    put("reservationDate", reservationDate.trim())
    put("executeDate", executeDate.trim())
    put("executeTime", executeTime.trim())
    put("title", title.trim())
    put("content", content.trim())
    put("mobile", mobile.trim())
    put("open", open)
    val candidatesArr = JSONArray()
    candidates.forEach { candidate ->
        candidatesArr.put(
            JSONObject().apply {
                put("areaId", candidate.areaId)
                put("startTime", candidate.startTime)
                put("endTime", candidate.endTime)
            }
        )
    }
    put("candidates", candidatesArr)
}

internal fun JSONObject.toCampusMyReservation(): CampusMyReservation = CampusMyReservation(
    id = optString("id", optString("order_id", optString("orderId", ""))),
    spaceId = optInt("spaceId", optInt("space_id", optInt("areaId", optInt("area_id", 0)))),
    spaceName = optString("spaceName", optString("space_name", optString("areaName", optString("area_name", optString("room_name", optString("name", "研讨间")))))),
    date = optString("date", optString("order_date", optString("reserve_date", ""))),
    startTime = optString("startTime", optString("start_time", optString("begin_time", ""))),
    endTime = optString("endTime", optString("end_time", optString("finish_time", ""))),
    title = optString("title", optString("subject", "个人预约研讨")),
    statusText = optString("statusText", optString("status_text", optString("status_name", optString("status", "预约成功")))),
    canCancel = optBoolean("canCancel", true),
    createdAt = optString("createdAt", optString("created_at", "")),
)

internal fun formatCampusJsonValue(value: Any?): String = when (value) {
    null, JSONObject.NULL, "" -> "暂无数据"
    is JSONObject -> {
        val keys = value.keys()
        val lines = mutableListOf<String>()
        while (keys.hasNext()) {
            val key = keys.next()
            val item = value.opt(key)
            lines.add("$key：${formatCampusJsonValue(item)}")
        }
        lines.joinToString("\n").ifBlank { "暂无数据" }
    }
    is JSONArray -> {
        val lines = mutableListOf<String>()
        for (i in 0 until value.length()) {
            lines.add(formatCampusJsonValue(value.opt(i)))
        }
        lines.joinToString("\n").ifBlank { "暂无数据" }
    }
    else -> value.toString()
}

internal fun encodePath(value: String): String = java.net.URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")
