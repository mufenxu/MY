package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

@Immutable
data class PlatformUser(
    val username: String,
    val role: String,
    val totpEnabled: Boolean,
    val passkeyCount: Int,
)

@Immutable
data class LoginResult(
    val user: PlatformUser,
    val sessionCookie: String,
    val sessionExpiresAtMillis: Long,
    val sessionIdleMinutes: Int,
    val recoveryCodes: List<String> = emptyList(),
)

@Immutable
data class LoginCapabilities(
    val androidPasskeySupported: Boolean,
)

@Immutable
data class PasskeyChallenge(
    val username: String,
    val challengeId: String,
    val optionsJson: String,
)

@Immutable
data class QrLoginBrowser(
    val label: String,
    val ip: String,
    val userAgent: String,
)

@Immutable
data class QrLoginTarget(
    val requestId: String,
    val status: String,
    val verificationCode: String,
    val browser: QrLoginBrowser,
    val expiresAt: String,
    val confirmationMethod: String,
)

@Immutable
data class QrPasskeyChallenge(
    val challengeId: String,
    val optionsJson: String,
)

@Immutable
data class QrLoginRequest(
    val requestId: String,
    val requesterVerifier: String,
    val qrDataUrl: String,
    val expiresAt: String,
)

@Immutable
data class QrLoginRequestStatus(
    val requestId: String,
    val status: String,
    val expiresAt: String,
)

@Immutable
data class WebLoginLink(
    val loginUrl: String,
    val redirect: String,
    val expiresAt: String?,
)

@Immutable
data class PlatformWebCookie(
    val url: String,
    val value: String,
)

@Immutable
data class PlatformWebSession(
    val url: String,
    val cookies: List<PlatformWebCookie>,
)

@Immutable
data class ExternalApplicationHealth(
    val state: String,
    val httpStatus: Int?,
    val latencyMs: Long?,
    val checkedAt: String?,
)

@Immutable
data class ExternalApplication(
    val id: String,
    val name: String,
    val description: String,
    val launchUrl: String,
    val healthUrl: String?,
    val requiredRole: String,
    val openMode: String,
    val enabled: Boolean,
    val canAccess: Boolean,
    val health: ExternalApplicationHealth,
)

@Immutable
data class ExternalApplicationLaunch(
    val loginUrl: String,
    val openMode: String,
    val expiresAt: String?,
    val autoLogin: ExternalApplicationAutoLogin? = null,
)

@Immutable
data class ExternalApplicationAutoLogin(
    val loginUrl: String,
    val username: String,
    val password: String,
    val homeUrl: String?,
)

@Immutable
data class ServiceInfo(
    val id: String,
    val name: String,
    val category: String,
    val state: String,
    val latencyMs: Long?,
    val httpStatus: Int?,
    val adminUrl: String?,
)

@Immutable
data class IncidentInfo(
    val id: String,
    val title: String,
    val description: String,
    val severity: String,
    val status: String,
    val source: String,
    val serviceId: String?,
    val openedAt: String?,
    val updatedAt: String?,
)

@Immutable
data class AuditInfo(
    val id: String,
    val action: String,
    val actor: String,
    val outcome: String,
    val occurredAt: String?,
)

@Immutable
data class OverviewData(
    val services: List<ServiceInfo>,
    val incidents: List<IncidentInfo>,
    val audits: List<AuditInfo>,
    val refreshedAt: String?,
) {
    val healthyCount: Int get() = services.count { it.state == "healthy" }
    val monitoredCount: Int get() = services.count { it.state != "unmonitored" }
    val averageLatencyMs: Long?
        get() = services.mapNotNull { it.latencyMs }.takeIf { it.isNotEmpty() }?.average()?.toLong()
}

@Immutable
data class PlatformTask(
    val id: String,
    val title: String,
    val detail: String,
    val status: String,
    val source: String,
    val sourceId: String? = null,
    val requestedBy: String,
    val updatedAt: String?,
)

@Immutable
data class TaskData(
    val tasks: List<PlatformTask>,
    val generatedAt: String?,
)

@Immutable
data class ReleaseBuild(
    val id: String,
    val status: String,
    val conclusion: String,
    val revision: String,
    val createdAt: String?,
    val components: List<String>,
)

@Immutable
data class ReleaseData(
    val builds: List<ReleaseBuild>,
)

@Immutable
data class BackupQuality(
    val latestName: String?,
    val latestAt: String?,
    val ageHours: Double?,
    val rpoHours: Int,
    val rpoState: String,
    val validBackups: Int,
    val offsiteConfigured: Boolean,
    val offsiteHealthy: Boolean?,
    val canBackup: Boolean,
    val checkedAt: String?,
)

@Immutable
data class DeviceInfo(
    val id: String,
    val name: String,
    val online: Boolean,
    val temperature: Double?,
    val humidity: Double?,
    val lastActive: Long?,
    val relays: Map<String, String?> = emptyMap(),
)

@Immutable
data class IotScene(
    val id: String,
    val name: String,
    val actionCount: Int,
    val updatedAt: String?,
    val actions: List<IotSceneAction> = emptyList(),
)

@Immutable
data class IotSceneAction(
    val deviceId: String,
    val relayId: String,
    val status: String,
)

@Immutable
data class AutomationCondition(
    val deviceId: String,
    val metric: String,
    val operator: String,
    val value: String,
    val relayId: String? = null,
)

@Immutable
data class AutomationRule(
    val id: String,
    val name: String,
    val enabled: Boolean = true,
    val condition: AutomationCondition,
    val actions: List<IotSceneAction>,
    val cooldownSeconds: Int = 300,
    val version: Int = 1,
    val createdAt: Long? = null,
    val updatedAt: Long? = null,
    val lastTriggeredAt: Long? = null,
)

@Immutable
data class AutomationRunResult(
    val deviceId: String,
    val relayId: String,
    val status: String,
    val state: String,
    val message: String = "",
)

@Immutable
data class AutomationRun(
    val id: String,
    val sourceType: String,
    val sourceId: String,
    val sourceName: String,
    val actor: String,
    val state: String,
    val deviceConfirmed: Boolean,
    val results: List<AutomationRunResult>,
    val createdAt: Long?,
)

@Immutable
data class TelemetryMetricSummary(
    val count: Int,
    val minimum: Double?,
    val maximum: Double?,
    val average: Double?,
)

@Immutable
data class TelemetrySeriesPoint(
    val createdAt: Long,
    val sampleCount: Int,
    val temperature: Double?,
    val humidity: Double?,
)

@Immutable
data class DeviceTelemetryInsight(
    val deviceId: String,
    val deviceName: String,
    val state: String,
    val range: String,
    val generatedAt: Long?,
    val sampleCount: Int,
    val temperature: TelemetryMetricSummary,
    val humidity: TelemetryMetricSummary,
    val anomalyCount: Int,
    val series: List<TelemetrySeriesPoint>,
)

@Immutable
data class IotData(
    val mqttConnected: Boolean,
    val deviceOnline: Boolean,
    val connectionState: String,
    val messagesReceived: Long,
    val devices: List<DeviceInfo>,
    val scenes: List<IotScene>,
    val rules: List<AutomationRule>,
    val runs: List<AutomationRun>,
    val insights: List<DeviceTelemetryInsight>,
)

@Immutable
data class Ct8Data(
    val totalHosts: Int?,
    val successHosts: Int?,
    val failedHosts: Int?,
    val activeStatus: String,
    val latestStatus: String,
    val latestRunId: String?,
    val lastRunAt: String?,
)

@Immutable
data class DiagnosticCheck(
    val id: String,
    val label: String,
    val status: String,
    val message: String,
)

@Immutable
data class DiagnosticData(
    val checks: List<DiagnosticCheck>,
    val checkedAt: String?,
)

@Immutable
data class SecuritySession(
    val nonce: String,
    val subject: String,
    val role: String,
    val ip: String,
    val userAgent: String,
    val deviceName: String = "",
    val createdAt: String?,
    val lastSeenAt: String?,
    val expiresAt: String?,
    val sessionKind: String,
    val parentSessionNonce: String?,
    val deviceId: String?,
    val current: Boolean,
)

@Immutable
data class SecurityData(
    val sessions: List<SecuritySession>,
    val totpEnabled: Boolean,
    val passkeyCount: Int,
    val recoveryCodesRemaining: Int,
    val sessionTtlHours: Int,
    val sessionIdleMinutes: Int,
)

@Immutable
data class PlatformPasskey(
    val id: String,
    val name: String,
    val deviceType: String?,
    val createdAt: String?,
    val lastUsedAt: String?,
)

@Immutable
data class TotpEnrollment(
    val secret: String,
    val uri: String,
    val qrDataUrl: String?,
    val expiresAt: String?,
)

@Immutable
data class PasskeyRegistrationChallenge(
    val challengeId: String,
    val optionsJson: String,
)

@Immutable
data class GoogleAccountRecord(
    val id: String,
    val primaryEmail: String,
    val displayName: String = "",
    val emailStatus: String = "unknown",
    val openAiStatus: String = "unregistered",
    val note: String = "",
    val lastCheckedAt: Long? = null,
    val nextReviewAt: Long? = null,
    val tags: List<String> = emptyList(),
    val archived: Boolean = false,
    val aliases: List<GoogleAliasRecord> = emptyList(),
)

@Immutable
data class GoogleAliasRecord(
    val id: String,
    val address: String,
    val aliasType: String = "plus",
    val aliasStatus: String = "candidate",
    val openAiStatus: String = "unregistered",
    val registeredAt: Long? = null,
    val lastVerifiedAt: Long? = null,
    val note: String = "",
)

@Immutable
data class GoogleAccountSnapshot(
    val accounts: List<GoogleAccountRecord>,
    val revision: Int,
)

class ApiException(
    message: String,
    val status: Int,
    val code: String,
    val details: org.json.JSONObject? = null,
) : Exception(message)

@Immutable
data class AssistantSuggestion(
    val title: String,
    val destination: String,
)

@Immutable
data class AssistantActionItem(
    val type: String,
    val title: String = "",
)

@Immutable
data class AssistantChatReply(
    val reply: String,
    val suggestions: List<AssistantSuggestion> = emptyList(),
    val actions: List<AssistantActionItem> = emptyList(),
)

data class AssistantChatTurn(
    val role: String,
    val content: String,
)

@Immutable
data class GitHubRepositoryRecord(
    val name: String,
    val fullName: String,
    val description: String?,
    val visibility: String,
    val isPrivate: Boolean,
    val htmlUrl: String?,
    val language: String?,
    val defaultBranch: String?,
    val updatedAt: String?,
    val archived: Boolean,
)
