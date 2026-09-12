package cn.pxyb.mycontrol.ui.feature.scenes

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.IotData
import cn.pxyb.mycontrol.data.QuickScenePreference
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError
import cn.pxyb.mycontrol.ui.state.actionResources

@Immutable
data class ScenesUiState(
    val refreshing: Boolean,
    val sectionError: String?,
    val busyAction: String?,
    val offlineMode: Boolean,
    val iot: IotData?,
    val quickScene: QuickScenePreference?,
    val pendingSceneId: String?,
    val sceneSaveError: String? = null,
    val ruleSaveError: String? = null,
    val sceneSaveCount: Int = 0,
    val ruleSaveCount: Int = 0,
)

internal fun AppUiState.toScenesUiState() = ScenesUiState(
    refreshing = isRefreshing(DataSection.Iot),
    sectionError = sectionError(DataSection.Iot),
    busyAction = actions.running.firstOrNull { "iot" in actionResources(it) },
    offlineMode = sectionLoadStates[DataSection.Iot]?.fromCache == true,
    iot = iot,
    quickScene = quickScene,
    pendingSceneId = pendingSceneId,
    sceneSaveError = actions.errors["scene-edit"],
    ruleSaveError = actions.errors["rule-edit"],
    sceneSaveCount = actions.completions["scene-edit"] ?: 0,
    ruleSaveCount = actions.completions["rule-edit"] ?: 0,
)
