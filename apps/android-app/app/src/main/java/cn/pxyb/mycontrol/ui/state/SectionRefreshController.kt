package cn.pxyb.mycontrol.ui.state

import android.os.SystemClock
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.SectionLoadState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

internal class SectionRefreshController(
    private val scope: CoroutineScope,
    private val api: PlatformApi,
    private val mutableState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
) {
    private val refreshJobs = mutableMapOf<DataSection, Job>()
    private val lastRefreshElapsedMs = mutableMapOf<DataSection, Long>()

    fun launchRefresh(
        section: DataSection,
        force: Boolean = false,
        publishError: Boolean = force,
        block: suspend () -> Unit,
    ) {
        if (mutableState.value.user == null || refreshJobs[section]?.isActive == true) return
        if (cn.pxyb.mycontrol.BuildConfig.DEBUG && mutableState.value.user?.id == "admin-demo") return
        val now = SystemClock.elapsedRealtime()
        val lastRefresh = lastRefreshElapsedMs[section]
        if (!force && lastRefresh != null && now - lastRefresh < REFRESH_CACHE_WINDOW_MS) return
        updateSectionLoadState(section) { it.copy(refreshing = true, error = null) }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            val refreshJob = currentCoroutineContext()[Job]
            api.withRequestMetadata {
                try {
                    block()
                    lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
                    val fromCache = api.isOffline()
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(error = null, updatedAtMillis = System.currentTimeMillis(), fromCache = fromCache, cachedAtMillis = cachedAt)
                    }
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(
                            error = error.message ?: "请稍后重试。",
                            fromCache = it.fromCache || cachedAt != null,
                            cachedAtMillis = cachedAt ?: it.cachedAtMillis,
                        )
                    }
                    if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
                        onSessionExpired(error.message ?: "登录会话已失效，请重新登录。")
                    } else if (publishError) {
                        mutableState.update { it.copy(error = "部分数据暂不可用：${error.message ?: "请稍后重试。"}") }
                    }
                } finally {
                    if (refreshJobs[section] === refreshJob) {
                        refreshJobs.remove(section)
                        updateSectionLoadState(section) { it.copy(refreshing = false) }
                        updateRefreshingState()
                    }
                }
            }
        }
        refreshJobs[section] = job
        job.start()
        updateRefreshingState()
    }

    fun cancelRefreshes() {
        refreshJobs.values.toList().forEach { it.cancel() }
        refreshJobs.clear()
        mutableState.update { current ->
            current.copy(
                refreshing = false,
                sectionLoadStates = current.sectionLoadStates.mapValues { (_, state) -> state.copy(refreshing = false) },
            )
        }
    }

    fun clearRefreshCache() {
        lastRefreshElapsedMs.clear()
    }

    private fun updateRefreshingState() {
        val refreshing = refreshJobs.values.any { it.isActive }
        mutableState.update { current ->
            if (current.refreshing == refreshing) current else current.copy(refreshing = refreshing)
        }
    }

    private fun updateSectionLoadState(
        section: DataSection,
        transform: (SectionLoadState) -> SectionLoadState,
    ) {
        mutableState.update { current ->
            val sections = current.sectionLoadStates + (section to transform(current.sectionLoadStates[section] ?: SectionLoadState()))
            current.copy(
                sectionLoadStates = sections,
                offlineMode = sections.values.any { it.fromCache },
                cachedAtMillis = sections.values.filter { it.fromCache }.mapNotNull { it.cachedAtMillis }.minOrNull(),
            )
        }
    }

    private companion object {
        const val REFRESH_CACHE_WINDOW_MS = 30_000L
    }
}
