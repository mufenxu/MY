package cn.pxyb.mycontrol.ui.state

import android.os.SystemClock
import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.isSchoolAccountRequired
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.SectionLoadState
import cn.pxyb.mycontrol.ui.withSectionLoadState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.joinAll

/** 读数据失败的全局提示前缀；外壳据此判断该错误可以安全地就地重试（只重读，不重放操作）。 */
internal const val SECTION_REFRESH_ERROR_PREFIX = "部分数据暂不可用"

internal class SectionRefreshController(
    private val scope: CoroutineScope,
    private val api: PlatformApi,
    private val mutableState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
    private val onSchoolAccountRequired: () -> Unit = {},
) {
    private val refreshJobs = mutableMapOf<DataSection, Job>()
    private val lastRefreshElapsedMs = mutableMapOf<DataSection, Long>()

    fun launchRefresh(
        section: DataSection,
        force: Boolean = false,
        publishError: Boolean = force,
        preloadCache: (suspend () -> Unit)? = null,
        block: suspend () -> Unit,
    ) {
        if (mutableState.value.let { it.user == null || it.locked || it.busyAction == "logout" } || refreshJobs[section]?.isActive == true) return
        val now = SystemClock.elapsedRealtime()
        val lastRefresh = lastRefreshElapsedMs[section]
        if (!force && lastRefresh != null && now - lastRefresh < REFRESH_CACHE_WINDOW_MS) return
        updateSectionLoadState(section) { it.copy(refreshing = true, error = null) }
        val job = scope.launch(start = CoroutineStart.LAZY) {
            val refreshJob = currentCoroutineContext()[Job]
            api.withRequestMetadata {
                try {
                    if (preloadCache != null && mutableState.value.sectionLoadStates[section]?.updatedAtMillis == null) {
                        try {
                            val cached = api.withCachedResponses { preloadCache() }
                            updateSectionLoadState(section) {
                                it.copy(fromCache = cached.fromCache, cachedAtMillis = cached.cachedAtMillis)
                            }
                        } catch (error: Exception) {
                            if (error is CancellationException) throw error
                            // 缺失或失效的缓存交给正常网络请求处理。
                        }
                    }
                    block()
                    val fromCache = api.isOffline()
                    if (!fromCache) lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(error = null, updatedAtMillis = System.currentTimeMillis(), fromCache = fromCache,
                            cachedAtMillis = cachedAt, cacheFallback = fromCache)
                    }
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    val cachedAt = api.cachedAtMillis()
                    updateSectionLoadState(section) {
                        it.copy(
                            error = error.message ?: "请稍后重试。",
                            fromCache = it.fromCache || cachedAt != null,
                            cachedAtMillis = cachedAt ?: it.cachedAtMillis,
                            cacheFallback = it.fromCache || cachedAt != null,
                        )
                    }
                    if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
                        onSessionExpired(error.message ?: "登录会话已失效，请重新登录。")
                    } else if (error is ApiException && isSchoolAccountRequired(error.status, error.code)) {
                        // 学校账号失效由弹窗统一接管，不再往顶部堆一条全局错误横幅。
                        onSchoolAccountRequired()
                    } else if (publishError) {
                        mutableState.update { it.copy(error = "${SECTION_REFRESH_ERROR_PREFIX}：${error.message ?: "请稍后重试。"}") }
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

    /**
     * 聚合操作自行取数（一键巡检、触发备份/CT8）后补记分区状态。
     *
     * 这些路径不走 [launchRefresh]，数据是同步拿到的，但它同样代表「该分区已是最新」。
     * 不登记的话分区会停在旧的 `updatedAtMillis` 与 `fromCache` 上：概览页继续挂离线横幅，
     * 场景页因为 `fromCache` 继续禁用控制，而界面显示的数据其实已经刷新过了。
     *
     * 只应传入确实取到新数据的分区；失败的请求仍由 [launchRefresh] 的错误路径负责。
     */
    suspend fun recordExternalRefresh(sections: Collection<DataSection>) {
        if (sections.isEmpty()) return
        val fromCache = api.isOffline()
        val cachedAt = api.cachedAtMillis()
        val now = System.currentTimeMillis()
        sections.forEach { section ->
            lastRefreshElapsedMs[section] = SystemClock.elapsedRealtime()
            updateSectionLoadState(section) {
                it.copy(
                    error = null,
                    updatedAtMillis = now,
                    fromCache = fromCache,
                    cachedAtMillis = cachedAt,
                    cacheFallback = fromCache,
                )
            }
        }
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

    fun retryUnavailableSections() {
        mutableState.value.sectionLoadStates.forEach { (section, state) ->
            if (state.fromCache || state.error != null) lastRefreshElapsedMs.remove(section)
        }
    }

    suspend fun awaitCurrentRefreshes() {
        refreshJobs.values.toList().joinAll()
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
        mutableState.update { it.withSectionLoadState(section, transform) }
    }

    private companion object {
        const val REFRESH_CACHE_WINDOW_MS = 30_000L
    }
}
