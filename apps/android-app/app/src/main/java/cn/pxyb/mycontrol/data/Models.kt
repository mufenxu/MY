package cn.pxyb.mycontrol.data

data class PlatformUser(
    val username: String,
    val role: String,
    val totpEnabled: Boolean,
    val passkeyCount: Int,
)

data class LoginResult(
    val user: PlatformUser,
    val sessionCookie: String,
    val sessionExpiresAtMillis: Long,
    val sessionIdleMinutes: Int,
    val recoveryCodes: List<String> = emptyList(),
)

data class LoginCapabilities(
    val androidPasskeySupported: Boolean,
)

data class PasskeyChallenge(
    val username: String,
    val challengeId: String,
    val optionsJson: String,
)

data class QrLoginBrowser(
    val label: String,
    val ip: String,
    val userAgent: String,
)

data class QrLoginTarget(
    val requestId: String,
    val status: String,
    val verificationCode: String,
    val browser: QrLoginBrowser,
    val expiresAt: String,
    val confirmationMethod: String,
)

data class QrPasskeyChallenge(
    val challengeId: String,
    val optionsJson: String,
)

data class ServiceInfo(
    val id: String,
    val name: String,
    val category: String,
    val state: String,
    val latencyMs: Long?,
    val httpStatus: Int?,
    val adminUrl: String?,
)

data class IncidentRunbookStep(
    val id: String,
    val title: String,
    val completed: Boolean,
)

data class IncidentPostmortem(
    val summary: String = "",
    val rootCause: String = "",
    val impact: String = "",
    val correctiveActions: String = "",
    val completedAt: String? = null,
)

data class IncidentInfo(
    val id: String,
    val title: String,
    val description: String,
    val severity: String,
    val status: String,
    val source: String,
    val serviceId: String?,
    val openedAt: String?,
    val firstSeenAt: String?,
    val lastSeenAt: String?,
    val updatedAt: String?,
    val assignedTo: String?,
    val timeline: List<IncidentTimelineEntry>,
    val runbookSteps: List<IncidentRunbookStep> = emptyList(),
    val postmortem: IncidentPostmortem? = null,
)

data class IncidentTimelineEntry(
    val type: String,
    val message: String,
    val actor: String,
    val at: String?,
)

data class AuditInfo(
    val id: String,
    val action: String,
    val actor: String,
    val outcome: String,
    val occurredAt: String?,
)

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

data class TaskData(
    val tasks: List<PlatformTask>,
    val generatedAt: String?,
)

data class ReleaseBuild(
    val id: String,
    val status: String,
    val conclusion: String,
    val revision: String,
    val createdAt: String?,
    val components: List<String>,
)

data class ReleaseDeployment(
    val id: String,
    val status: String,
    val action: String,
    val requestedBy: String,
    val createdAt: String?,
    val components: List<String>,
)

data class ReleaseData(
    val builds: List<ReleaseBuild>,
    val deployments: List<ReleaseDeployment>,
    val actionsEnabled: Boolean,
    val runnerConnected: Boolean,
)

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

data class DeviceInfo(
    val id: String,
    val name: String,
    val online: Boolean,
    val temperature: Double?,
    val humidity: Double?,
    val lastActive: Long?,
    val relays: Map<String, String?> = emptyMap(),
)

data class IotScene(
    val id: String,
    val name: String,
    val actionCount: Int,
    val updatedAt: String?,
)

data class IotData(
    val mqttConnected: Boolean,
    val deviceOnline: Boolean,
    val connectionState: String,
    val messagesReceived: Long,
    val devices: List<DeviceInfo>,
    val scenes: List<IotScene>,
)

data class Ct8Data(
    val totalHosts: Int?,
    val successHosts: Int?,
    val failedHosts: Int?,
    val activeStatus: String,
    val latestStatus: String,
    val latestRunId: String?,
    val lastRunAt: String?,
)

data class DiagnosticCheck(
    val id: String,
    val label: String,
    val status: String,
    val message: String,
)

data class DiagnosticData(
    val checks: List<DiagnosticCheck>,
    val checkedAt: String?,
)

data class SecuritySession(
    val nonce: String,
    val subject: String,
    val role: String,
    val ip: String,
    val userAgent: String,
    val createdAt: String?,
    val lastSeenAt: String?,
    val expiresAt: String?,
    val current: Boolean,
)

data class SecurityData(
    val sessions: List<SecuritySession>,
    val totpEnabled: Boolean,
    val passkeyCount: Int,
    val recoveryCodesRemaining: Int,
    val sessionTtlHours: Int,
    val sessionIdleMinutes: Int,
)

data class PlatformPasskey(
    val id: String,
    val name: String,
    val deviceType: String?,
    val createdAt: String?,
    val lastUsedAt: String?,
)

data class TotpEnrollment(
    val secret: String,
    val uri: String,
    val qrDataUrl: String?,
    val expiresAt: String?,
)

data class PasskeyRegistrationChallenge(
    val challengeId: String,
    val optionsJson: String,
)

class ApiException(
    message: String,
    val status: Int,
    val code: String,
    val details: org.json.JSONObject? = null,
) : Exception(message)
