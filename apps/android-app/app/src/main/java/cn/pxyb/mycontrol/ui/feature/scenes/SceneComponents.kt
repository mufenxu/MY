package cn.pxyb.mycontrol.ui.feature.scenes

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DashboardCustomize
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Nfc
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.DeviceInfo
import cn.pxyb.mycontrol.data.IotScene
import cn.pxyb.mycontrol.data.IotSceneAction
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.dialog.DialogInfoText
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.input.AppSwitch
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun SceneCard(
    scene: IotScene,
    busy: Boolean,
    enabled: Boolean,
    onRun: (String) -> Unit,
    onEdit: () -> Unit,
    onDelete: (String) -> Unit,
    onWriteNfc: () -> Unit,
    onSetQuickScene: () -> Unit,
    quickScene: Boolean,
) {
    AppPanel {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppIconTile(Icons.Outlined.Tune, ColorTokens.Green.foreground, ColorTokens.Green.container)
                Column(Modifier.weight(1f)) {
                    Text(scene.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("${scene.actionCount} 个设备动作", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onEdit, enabled = enabled && !busy) { Icon(Icons.Outlined.Edit, "编辑") }
                IconButton(onClick = { onDelete(scene.id) }, enabled = enabled && !busy) { Icon(Icons.Outlined.DeleteOutline, "删除") }
            }
            AppButton(
                text = "执行场景",
                icon = Icons.Outlined.PlayArrow,
                onClick = { onRun(scene.id) },
                enabled = enabled && !busy,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AppSecondaryButton(
                    text = "写入 NFC",
                    icon = Icons.Outlined.Nfc,
                    onClick = onWriteNfc,
                    enabled = enabled && !busy,
                    modifier = Modifier.weight(1f),
                )
                AppSecondaryButton(
                    text = if (quickScene) "当前磁贴" else "设为磁贴",
                    icon = Icons.Outlined.DashboardCustomize,
                    onClick = onSetQuickScene,
                    enabled = enabled && !busy,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
internal fun SceneEditorDialog(
    scene: IotScene?,
    devices: List<cn.pxyb.mycontrol.data.DeviceInfo>,
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (String?, String, List<IotSceneAction>) -> Unit,
) {
    var name by rememberSaveable(scene?.id) { mutableStateOf(scene?.name.orEmpty()) }
    val actionsSaver = remember {
        listSaver<List<IotSceneAction>, String>(
            save = { actions -> actions.flatMap { listOf(it.deviceId, it.relayId, it.status) } },
            restore = { values -> values.chunked(3).map { IotSceneAction(it[0], it[1], it[2]) } },
        )
    }
    var actions by rememberSaveable(scene?.id, stateSaver = actionsSaver) { mutableStateOf(scene?.actions.orEmpty()) }
    val endpoints = devices.flatMap { device -> device.relays.keys.sorted().map { relay -> Triple(device.id, device.name, relay) } }
    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Tune,
        title = if (scene == null) "新建智能场景" else "编辑智能场景",
        subtitle = "只显示后端已确认的真实设备与继电器",
        modifier = Modifier.heightIn(max = 760.dp),
        onConfirm = { onSave(scene?.id, name.trim(), actions) },
        enabled = name.isNotBlank() && actions.isNotEmpty(),
        loading = busy,
        errorMessage = error,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            AppTextField(value = name, onValueChange = { name = it }, label = "场景名称", enabled = !busy)
            if (endpoints.isEmpty()) {
                DialogInfoText("当前没有可配置的继电器设备。")
            } else {
                endpoints.forEach { (deviceId, deviceName, relayId) ->
                    val current = actions.firstOrNull { it.deviceId == deviceId && it.relayId == relayId }
                    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(deviceName, style = MaterialTheme.typography.titleSmall)
                                    Text(relayId, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                AppSwitch(
                                    checked = current != null,
                                    enabled = !busy,
                                    onCheckedChange = { checked ->
                                        actions = if (checked) actions + IotSceneAction(deviceId, relayId, "ON")
                                        else actions.filterNot { it.deviceId == deviceId && it.relayId == relayId }
                                    },
                                )
                            }
                            if (current != null) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AppFilterChip(label = "打开", selected = current.status == "ON", enabled = !busy, onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "ON") else it } })
                                    AppFilterChip(label = "关闭", selected = current.status == "OFF", enabled = !busy, onClick = { actions = actions.map { if (it.deviceId == deviceId && it.relayId == relayId) it.copy(status = "OFF") else it } })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
