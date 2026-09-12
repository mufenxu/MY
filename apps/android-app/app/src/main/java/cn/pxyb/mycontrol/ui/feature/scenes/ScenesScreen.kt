package cn.pxyb.mycontrol.ui.feature.scenes

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AutomationCondition
import cn.pxyb.mycontrol.data.AutomationRule
import cn.pxyb.mycontrol.data.AutomationRun
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppSkeletonList
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.sectionError

@Composable
fun ScenesScreen(
    state: ScenesUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onRun: (String) -> Unit,
    onSave: (String?, String, List<IotSceneAction>) -> Unit,
    onDelete: (String) -> Unit,
    onSaveRule: (String?, String, Boolean, AutomationCondition, List<IotSceneAction>, Int) -> Unit,
    onToggleRule: (String, Boolean) -> Unit,
    onDeleteRule: (String) -> Unit,
    onWriteNfc: (String, String) -> Unit,
    onSetQuickScene: (String, String) -> Unit,
    onConsumePendingScene: () -> Unit,
) {
    var editingId by rememberSaveable { mutableStateOf<String?>(null) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var editingRuleId by rememberSaveable { mutableStateOf<String?>(null) }
    var addingRule by rememberSaveable { mutableStateOf(false) }
    var pendingSceneSave by rememberSaveable { mutableStateOf<Int?>(null) }
    var pendingRuleSave by rememberSaveable { mutableStateOf<Int?>(null) }
    val scenes = state.iot?.scenes.orEmpty()
    val rules = state.iot?.rules.orEmpty()
    val editing = scenes.firstOrNull { it.id == editingId }
    val editingRule = rules.firstOrNull { it.id == editingRuleId }
    LaunchedEffect(state.sceneSaveCount) {
        if (pendingSceneSave?.let { state.sceneSaveCount > it } == true) {
            adding = false
            editingId = null
            pendingSceneSave = null
        }
    }
    LaunchedEffect(state.ruleSaveCount) {
        if (pendingRuleSave?.let { state.ruleSaveCount > it } == true) {
            addingRule = false
            editingRuleId = null
            pendingRuleSave = null
        }
    }
    val runs = state.iot?.runs.orEmpty()
    val pendingScene = scenes.firstOrNull { it.id == state.pendingSceneId }
    LaunchedEffect(state.pendingSceneId, scenes) {
        if (state.pendingSceneId != null && scenes.isNotEmpty() && pendingScene == null) {
            onConsumePendingScene()
        }
    }

    AppSubPage(
        title = "场景与自动化",
        subtitle = "手动控制场景或配置条件自动联动执行",
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing,
        onRefresh = onRefresh,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.Add,
                contentDescription = "新建场景",
                onClick = { adding = true },
                enabled = !state.offlineMode,
            )
        },
    ) {
        if (state.offlineMode) {
            item(key = "scenes-offline", contentType = "banner") {
                AppFeedbackBanner("离线时仅可查看场景，联网后才能执行或编辑。", error = false)
            }
        }
        state.sectionError?.let { message ->
            item(key = "scenes-error", contentType = "banner") {
                AppFeedbackBanner(message, error = true)
            }
        }

        item(key = "scenes-title", contentType = "section") {
            Text(
                text = "手动执行场景",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 4.dp, bottom = 2.dp)
            )
        }

        if (state.refreshing && scenes.isEmpty()) {
            item(key = "scenes-loading", contentType = "loading") {
                AppSkeletonList(
                    rowCount = 2,
                    leadingSize = 34.dp,
                    lineWidths = listOf(0.34f, 0.6f),
                )
            }
        } else if (scenes.isEmpty()) {
            item(key = "scenes-empty", contentType = "empty") {
                AppEmptyState("还没有智能场景", detail = "新建场景后，可以把多个设备动作合并为一次操作。")
            }
        } else {
            items(scenes, key = IotScene::id, contentType = { "scene" }) { scene ->
                SceneCard(
                    scene = scene,
                    busy = state.busyAction != null,
                    enabled = !state.offlineMode,
                    onRun = onRun,
                    onEdit = { editingId = scene.id },
                    onDelete = onDelete,
                    onWriteNfc = { onWriteNfc(scene.id, scene.name) },
                    onSetQuickScene = { onSetQuickScene(scene.id, scene.name) },
                    quickScene = state.quickScene?.sceneId == scene.id,
                )
            }
        }

        item(key = "scenes-spacer", contentType = "spacer") {
            Spacer(Modifier.height(8.dp))
        }

        item(key = "rules-title", contentType = "section") {
            AppSectionHeader(
                title = "条件自动化",
                subtitle = "${rules.size} 条真实规则，由 IoT 服务执行并审计",
                trailing = {
                    IconButton(
                        onClick = { addingRule = true },
                        enabled = !state.offlineMode && state.iot?.devices.orEmpty().isNotEmpty() && scenes.isNotEmpty(),
                    ) {
                        Icon(Icons.Outlined.Add, contentDescription = "新建自动化规则")
                    }
                },
            )
        }

        if (state.refreshing && rules.isEmpty()) {
            item(key = "rules-loading", contentType = "loading") {
                AppSkeletonList(
                    rowCount = 2,
                    leadingSize = 34.dp,
                    lineWidths = listOf(0.34f, 0.6f),
                )
            }
        } else if (rules.isEmpty()) {
            item(key = "rules-empty", contentType = "empty") {
                AppEmptyState("还没有自动化规则", detail = "先创建场景，再按设备状态或环境指标配置自动执行条件。")
            }
        } else {
            items(rules, key = AutomationRule::id, contentType = { "automation-rule" }) { rule ->
                AutomationRuleCard(
                    rule = rule,
                    devices = state.iot?.devices.orEmpty(),
                    busy = state.busyAction != null,
                    onToggle = { enabled -> onToggleRule(rule.id, enabled) },
                    onEdit = { editingRuleId = rule.id },
                    onDelete = { onDeleteRule(rule.id) },
                )
            }
        }

        item(key = "runs-title", contentType = "section") {
            AppSectionHeader(title = "最近执行", subtitle = "规则和场景的真实指令结果")
        }
        if (runs.isEmpty()) {
            item(key = "runs-empty", contentType = "empty") {
                AppEmptyState("暂无执行记录", detail = "手动运行场景或规则触发后会在这里留下审计记录。")
            }
        } else {
            items(runs.take(8), key = AutomationRun::id, contentType = { "automation-run" }) { run ->
                AutomationRunCard(run)
            }
        }
    }
    if (adding || editing != null) {
        SceneEditorDialog(
            scene = editing,
            devices = state.iot?.devices.orEmpty(),
            busy = state.busyAction == "scene-edit",
            error = state.sceneSaveError.takeIf { pendingSceneSave != null },
            onDismiss = { adding = false; editingId = null; pendingSceneSave = null },
            onSave = { id, name, actions ->
                pendingSceneSave = state.sceneSaveCount
                onSave(id, name, actions)
            },
        )
    }
    if (addingRule || editingRule != null) {
        AutomationRuleEditorDialog(
            rule = editingRule,
            devices = state.iot?.devices.orEmpty(),
            scenes = state.iot?.scenes.orEmpty(),
            busy = state.busyAction == "rule-edit",
            error = state.ruleSaveError.takeIf { pendingRuleSave != null },
            onDismiss = { addingRule = false; editingRuleId = null; pendingRuleSave = null },
            onSave = { id, name, enabled, condition, actions, cooldownSeconds ->
                pendingRuleSave = state.ruleSaveCount
                onSaveRule(id, name, enabled, condition, actions, cooldownSeconds)
            },
        )
    }
    if (pendingScene != null) {
        AppConfirmDialog(
            title = "执行“${pendingScene.name}”？",
            detail = "这是从 NFC、快捷磁贴或桌面小组件打开的场景。确认后仍会验证设备身份。",
            confirmLabel = "确认执行",
            onDismiss = onConsumePendingScene,
            onConfirm = {
                onConsumePendingScene()
                onRun(pendingScene.id)
            },
            icon = Icons.Outlined.PlayArrow,
        )
    }
}
