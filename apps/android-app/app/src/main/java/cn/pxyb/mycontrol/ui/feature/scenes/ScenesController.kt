package cn.pxyb.mycontrol.ui.feature.scenes

import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.IotRepository
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.state.ActionStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

class ScenesController(
    parentScope: CoroutineScope,
    private val repository: IotRepository,
    private val actionState: ActionStateHolder,
    private val appState: MutableStateFlow<AppUiState>,
    private val onRefresh: () -> Unit,
    private val onPublishWidget: suspend () -> Unit,
) {
    val state: StateFlow<ScenesUiState> = appState
        .map(AppUiState::toScenesUiState)
        .distinctUntilChanged()
        .stateIn(parentScope, SharingStarted.WhileSubscribed(5_000), appState.value.toScenesUiState())

    fun saveIotScene(id: String?, name: String, actions: List<IotSceneAction>) {
        if (name.isBlank() || actions.isEmpty()) {
            appState.update { it.copy(error = "请填写场景名称并至少添加一个设备动作。") }
            return
        }
        actionState.run("scene-edit", if (id == null) "智能场景已创建。" else "智能场景已更新。") {
            if (id == null) repository.createIotScene(name, actions) else repository.updateIotScene(id, name, actions)
            onRefresh()
        }
    }

    fun deleteIotScene(id: String, confirmation: suspend () -> Boolean) =
        actionState.run("scene-delete", "智能场景已删除。", confirmation) {
            repository.deleteIotScene(id)
            appState.update { it.copy(iot = repository.dashboard()) }
        }

    fun saveIotRule(
        id: String?,
        name: String,
        enabled: Boolean,
        condition: AutomationCondition,
        actions: List<IotSceneAction>,
        cooldownSeconds: Int,
        confirmation: suspend () -> Boolean,
    ) {
        if (name.isBlank() || condition.deviceId.isBlank() || actions.isEmpty()) {
            appState.update { it.copy(error = "请填写规则名称、触发条件并选择执行场景。") }
            return
        }
        actionState.run("rule-edit", if (id == null) "自动化规则已创建。" else "自动化规则已更新。", confirmation) {
            if (id == null) {
                repository.createIotRule(name, condition, actions, cooldownSeconds)
            } else {
                repository.updateIotRule(id, name, enabled, condition, actions, cooldownSeconds)
            }
            onRefresh()
        }
    }

    fun setIotRuleEnabled(id: String, enabled: Boolean, confirmation: suspend () -> Boolean) =
        actionState.run("rule-toggle", if (enabled) "自动化规则已启用。" else "自动化规则已停用。", confirmation) {
            repository.setIotRuleEnabled(id, enabled)
            appState.update { it.copy(iot = repository.dashboard()) }
        }

    fun deleteIotRule(id: String, confirmation: suspend () -> Boolean) =
        actionState.run("rule-delete", "自动化规则已删除。", confirmation) {
            repository.deleteIotRule(id)
            appState.update { it.copy(iot = repository.dashboard()) }
        }

    fun runIotScene(id: String, confirmation: suspend () -> Boolean) =
        actionState.run("scene", "IoT 场景指令已进入执行队列。", confirmation) {
            repository.runIotScene(id)
            appState.update { it.copy(iot = repository.dashboard()) }
            onPublishWidget()
        }
}
