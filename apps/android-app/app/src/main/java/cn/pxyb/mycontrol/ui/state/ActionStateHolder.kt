package cn.pxyb.mycontrol.ui.state

import cn.pxyb.mycontrol.data.PlatformApi
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

data class ActionUiState(
    val running: Set<String> = emptySet(),
    val errors: Map<String, String> = emptyMap(),
    val completions: Map<String, Int> = emptyMap(),
)

class ActionStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    onSessionExpired: (String) -> Unit,
    private val canRun: () -> Boolean,
    private val onFeedback: (String?, String?) -> Unit,
) : FeatureStateHolder<ActionUiState>(parentScope, ActionUiState(), onSessionExpired) {
    private val confirmationMutex = Mutex()
    private val jobs = mutableMapOf<String, Job>()

    override fun clearPendingState(current: ActionUiState) = current.copy(running = emptySet())

    fun run(
        action: String,
        successMessage: String? = null,
        confirmation: (suspend () -> Boolean)? = null,
        failureMessage: String = "操作失败，请稍后重试。",
        block: suspend () -> Unit,
    ) {
        if (!canRun()) return
        if (mutableState.value.running.blocksAction(action)) {
            mutableState.update { it.copy(errors = it.errors + (action to "相关操作正在进行，请稍后重试。")) }
            onFeedback("相关操作正在进行，请稍后重试。", null)
            return
        }
        mutableState.update { it.copy(running = it.running + action, errors = it.errors - action) }
        onFeedback(null, null)
        val job = scope.launch(start = CoroutineStart.LAZY) {
            try {
                api.withRequestMetadata(allowCache = false) {
                    val confirmed = confirmation == null || confirmationMutex.withLock { confirmation() }
                    if (!confirmed) return@withRequestMetadata
                    block()
                    currentCoroutineContext().ensureActive()
                    mutableState.update {
                        it.copy(completions = it.completions + (action to ((it.completions[action] ?: 0) + 1)))
                    }
                    if (successMessage != null) onFeedback(null, successMessage)
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                val message = error.message ?: failureMessage
                mutableState.update { it.copy(errors = it.errors + (action to message)) }
                onFeedback(message, null)
            } finally {
                if (jobs[action] === currentCoroutineContext()[Job]) {
                    jobs.remove(action)
                    mutableState.update { it.copy(running = it.running - action) }
                }
            }
        }
        jobs[action] = job
        job.start()
    }
}

internal fun actionResources(action: String): Set<String> = when {
    action == "diagnostics" -> setOf("iot", "incidents", "backup", "diagnostics")
    action.startsWith("scene") || action.startsWith("rule-") || action.startsWith("relay:") -> setOf("iot")
    action.startsWith("incident-") -> setOf("incidents")
    action.startsWith("github-") -> setOf("github")
    action in setOf("session", "password", "recovery-codes", "desktop-magic-link") ||
        action.startsWith("totp-") || action.startsWith("passkey-") -> setOf("security")
    action in setOf("campus-reservation", "official-campus-reservation", "official-library-seat-reservation") -> setOf("campus-web")
    else -> setOf(action)
}

internal fun Set<String>.blocksAction(action: String): Boolean {
    val resources = actionResources(action)
    return any { running -> actionResources(running).any(resources::contains) }
}
