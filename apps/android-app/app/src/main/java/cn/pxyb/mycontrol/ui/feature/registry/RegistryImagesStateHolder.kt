package cn.pxyb.mycontrol.ui.feature.registry

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.AcrImageCatalog
import cn.pxyb.mycontrol.data.AcrImageMutation
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Immutable
data class RegistryImagesUiState(
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val deleting: Boolean = false,
    val pruning: Boolean = false,
    val error: String? = null,
    val message: String? = null,
    val catalog: AcrImageCatalog? = null,
    val selected: Set<String> = emptySet(),
    val keepCount: Int = 5,
    val includeUnknown: Boolean = false,
    val plan: AcrImageMutation? = null,
)

internal fun summarizeAcrMutation(result: AcrImageMutation, verb: String): String {
    val parts = mutableListOf("已$verb ${result.deleted.size} 个镜像版本")
    if (result.skipped.isNotEmpty()) parts += "跳过 ${result.skipped.size} 个"
    if (result.failed.isNotEmpty()) parts += "失败 ${result.failed.size} 个"
    if (result.remaining > 0) parts += "还有 ${result.remaining} 个待下一次清理"
    return parts.joinToString("，") + "。"
}

class RegistryImagesStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<RegistryImagesUiState>(
    parentScope,
    RegistryImagesUiState(),
    onSessionExpired,
) {
    fun load(force: Boolean = false) {
        if (!force && mutableState.value.catalog != null && mutableState.value.error == null) return
        launchAction(
            isBusy = { loading || refreshing || deleting || pruning },
            start = { copy(loading = catalog == null, refreshing = catalog != null, error = null, message = null) },
            action = { api.acrImages(refresh = force) },
            success = { catalog ->
                copy(
                    loading = false,
                    refreshing = false,
                    catalog = catalog,
                    selected = selected.filter { tag -> catalog.hasTag(tag) }.toSet(),
                    error = null,
                )
            },
            failure = { error ->
                copy(
                    loading = false,
                    refreshing = false,
                    error = error.message ?: "镜像列表加载失败，请稍后重试。",
                )
            },
        )
    }

    fun toggle(tag: String) {
        mutableState.update { state ->
            val selected = if (tag in state.selected) state.selected - tag else state.selected + tag
            state.copy(selected = selected, error = null, message = null)
        }
    }

    fun togglePrefix(prefix: String, selected: Boolean) {
        mutableState.update { state ->
            val tags = state.catalog?.groups?.firstOrNull { it.prefix == prefix }?.tags?.map { it.tag }.orEmpty()
            val next = if (selected) state.selected + tags else state.selected - tags.toSet()
            state.copy(selected = next, error = null, message = null)
        }
    }

    fun clearSelection() = mutableState.update { it.copy(selected = emptySet()) }

    fun updateKeepCount(value: Int) =
        mutableState.update { it.copy(keepCount = value.coerceIn(1, 50), plan = null) }

    fun updateIncludeUnknown(value: Boolean) =
        mutableState.update { it.copy(includeUnknown = value, plan = null) }

    fun deleteSelected(confirmation: suspend () -> Boolean) {
        val current = mutableState.value
        val tags = current.selected.toList()
        if (tags.isEmpty() || current.deleting || current.pruning) return
        scope.launch {
            mutableState.update { it.copy(deleting = true, error = null, message = null) }
            try {
                if (!confirmation()) {
                    mutableState.update { it.copy(deleting = false) }
                    return@launch
                }
                val result = api.deleteAcrImages(tags)
                mutableState.update {
                    it.copy(deleting = false, selected = emptySet(), message = summarizeAcrMutation(result, "删除"))
                }
                load(force = true)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update { it.copy(deleting = false, error = error.message ?: "删除镜像失败，请稍后重试。") }
            }
        }
    }

    fun previewPrune() {
        val current = mutableState.value
        if (current.pruning || current.deleting || current.catalog?.canDelete != true) return
        scope.launch {
            mutableState.update { it.copy(pruning = true, error = null, message = null, plan = null) }
            try {
                val plan = api.pruneAcrImages(
                    keep = current.keepCount,
                    includeUnknown = current.includeUnknown,
                    dryRun = true,
                )
                mutableState.update {
                    if (plan.plan.isEmpty()) {
                        it.copy(pruning = false, plan = null, message = "没有需要清理的历史版本。")
                    } else {
                        it.copy(pruning = false, plan = plan)
                    }
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update { it.copy(pruning = false, error = error.message ?: "生成清理计划失败，请稍后重试。") }
            }
        }
    }

    fun executePrune(confirmation: suspend () -> Boolean) {
        val current = mutableState.value
        if (current.pruning || current.deleting || current.plan == null) return
        scope.launch {
            mutableState.update { it.copy(pruning = true, error = null, message = null) }
            try {
                if (!confirmation()) {
                    mutableState.update { it.copy(pruning = false) }
                    return@launch
                }
                val result = api.pruneAcrImages(
                    keep = current.keepCount,
                    includeUnknown = current.includeUnknown,
                    dryRun = false,
                )
                mutableState.update {
                    it.copy(
                        pruning = false,
                        plan = null,
                        selected = emptySet(),
                        message = summarizeAcrMutation(result, "清理"),
                    )
                }
                load(force = true)
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update { it.copy(pruning = false, error = error.message ?: "清理镜像失败，请稍后重试。") }
            }
        }
    }

    fun discardPlan() = mutableState.update { it.copy(plan = null) }

    fun clearFeedback() = mutableState.update { it.copy(error = null, message = null) }

    override fun clearPendingState(current: RegistryImagesUiState) = current.copy(
        loading = false,
        refreshing = false,
        deleting = false,
        pruning = false,
    )
}

internal fun AcrImageCatalog.hasTag(tag: String): Boolean =
    groups.any { group -> group.tags.any { it.tag == tag } }
