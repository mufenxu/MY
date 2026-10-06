package cn.pxyb.mycontrol.ui.feature.authenticator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun AuthenticatorCloudPanel(
  state: AuthenticatorUiState,
  newRecoveryCode: () -> String,
  onEnable: (String) -> Unit,
  onRestore: (String) -> Unit,
  onSync: () -> Unit,
  onRotate: (String) -> Unit,
  onDeleteCloud: () -> Unit,
  onRestoreHistory: (Int) -> Unit,
  onOpenSecurity: () -> Unit,
  onExport: (android.net.Uri) -> Unit,
  onImport: (android.net.Uri, String) -> Unit,
) {
  var dialog by remember { mutableStateOf<String?>(null) }
  var recovery by remember { mutableStateOf("") }
  var recoveryCopied by remember(recovery) { mutableStateOf(false) }
  val context = LocalContext.current
  var confirmation by remember { mutableStateOf("") }
  var acknowledged by remember { mutableStateOf(false) }
  var historySelection by remember { mutableStateOf<VaultHistory?>(null) }
  var historyOpen by remember { mutableStateOf(false) }
  var managementOpen by remember { mutableStateOf(false) }
  var importUri by remember { mutableStateOf<android.net.Uri?>(null) }
  val exportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
    androidx.activity.result.contract.ActivityResultContracts.CreateDocument("application/json"),
  ) { uri -> if (uri != null) onExport(uri) }
  val importLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
    androidx.activity.result.contract.ActivityResultContracts.OpenDocument(),
  ) { uri -> if (uri != null) { importUri = uri; confirmation = ""; dialog = "file" } }

  LaunchedEffect(state.locked) {
    if (state.locked) { dialog = null; recovery = ""; confirmation = ""; acknowledged = false; historyOpen = false; historySelection = null }
  }
  fun dismiss() { dialog = null; recovery = ""; confirmation = ""; acknowledged = false }
  fun begin(mode: String) { recovery = newRecoveryCode(); confirmation = ""; acknowledged = false; dialog = mode }
  val formatter = remember { SimpleDateFormat("MM-dd HH:mm", Locale.CHINA) }
  AppPanel {
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Text("加密云端备份", style = MaterialTheme.typography.titleMedium)
      Text(
        when {
          state.locked -> "解锁验证器后管理备份与恢复。"
          state.busy -> "正在安全处理，请稍候……"
          state.pending -> "尚未完成同步 · 本地验证码仍可离线使用"
          state.cloudEnabled -> "已加密同步 · ${state.devices} 台授权设备"
          state.cloudExists -> "发现此账号的云端保险库，可使用恢复密钥恢复。"
          else -> "尚未启用 · 手机丢失或卸载后，本地数据可能无法恢复。"
        }, style = MaterialTheme.typography.bodyMedium,
      )
      if (!state.locked) {
        if (state.lastSyncedAt > 0) Text("最近确认同步：${formatter.format(Date(state.lastSyncedAt))}", style = MaterialTheme.typography.labelMedium)
        if (state.cloudEnabled) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AppButton(if (state.needsReauthentication) "验证并同步" else "立即同步", onSync, enabled = !state.busy, modifier = Modifier.weight(1f))
            AppSecondaryButton(if (managementOpen) "收起管理" else "备份管理", { managementOpen = !managementOpen }, enabled = !state.busy, modifier = Modifier.weight(1f))
          }
        } else {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!state.cloudExists) AppButton("启用备份", { begin("enable") }, enabled = !state.busy, modifier = Modifier.weight(1f))
            AppSecondaryButton("从云端恢复", { dialog = "restore" }, enabled = !state.busy, modifier = Modifier.weight(1f))
          }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          AppSecondaryButton("文件恢复", { importLauncher.launch(arrayOf("application/json", "application/octet-stream")) }, enabled = !state.busy, modifier = Modifier.weight(1f))
          AppSecondaryButton("账号安全", onOpenSecurity, enabled = !state.busy, modifier = Modifier.weight(1f))
        }
        if (state.cloudEnabled && managementOpen) {
            AppSecondaryButton("导出加密文件", { exportLauncher.launch("MY-authenticator-backup.json") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            AppSecondaryButton("历史备份", { historyOpen = !historyOpen }, enabled = !state.busy && state.history.isNotEmpty(), modifier = Modifier.fillMaxWidth())
            if (historyOpen) {
              Text("最近 30 天，最多 40 个版本。恢复只补回缺失条目，不覆盖当前条目。", style = MaterialTheme.typography.bodySmall)
              state.history.forEach { item ->
                AppSecondaryButton("版本 ${item.revision} · ${formatter.format(Date(item.updatedAt))}", { historySelection = item }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
              }
            }
            AppSecondaryButton("更换恢复密钥并撤销其他设备", { begin("rotate") }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            AppSecondaryButton("使用恢复密钥重新授权", { dialog = "restore" }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            AppDangerButton("删除云端备份", { dialog = "delete" }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
        }
      }
      Text("端到端加密 · 服务器只保存密文。请独立保管恢复密钥，以便换机恢复。",
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
  if (dialog == "enable" || dialog == "rotate") {
    val rotating = dialog == "rotate"
    AppDialogForm(
      title = if (rotating) "更换保险库密钥" else "保管你的恢复密钥",
      subtitle = if (acknowledged) "回填已保存的完整恢复密钥，确认你能够找回它" else "请抄写并离线保存；此密钥不会上传服务器",
      onDismissRequest = ::dismiss,
      confirmText = if (acknowledged) "验证并启用" else "我已保存，继续",
      enabled = !acknowledged || confirmation.replace("-", "").filterNot(Char::isWhitespace).equals(recovery.replace("-", ""), true),
      onConfirm = {
        if (!acknowledged) acknowledged = true
        else { val code = recovery; dismiss(); if (rotating) onRotate(code) else onEnable(code) }
      },
    ) {
      if (!acknowledged) AppPanel(onClick = {
        copyAuthenticatorCode(context, recovery, 60_000L, label = "验证器恢复密钥")
        recoveryCopied = true
      }) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Text(recovery, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyLarge)
          Text(
            if (recoveryCopied) "已复制 · 60 秒后自动清理本次复制" else "点击复制恢复密钥",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
          )
        }
      }
      else AppTextField(value = confirmation, onValueChange = { confirmation = it.take(100) }, label = "完整恢复密钥", isPassword = true)
      Text("恢复密钥与所有授权设备同时丢失后，平台无法找回数据。请将平台登录恢复码另行保存，或在另一设备配置可用的 Passkey，避免丢手机后无法登录。",
        style = MaterialTheme.typography.bodySmall)
      Text("启用与恢复需要账号 Passkey 二次验证；未配置时请先进入账号安全。", style = MaterialTheme.typography.bodySmall)
      if (rotating) Text("将撤销其他设备的保险库授权，旧恢复密钥和云端历史备份将失效。已泄露的第三方验证器密钥仍需到对应网站重新绑定。", style = MaterialTheme.typography.bodySmall)
    }
  }
  if (dialog == "restore" || dialog == "file") AppDialogForm(
    title = if (dialog == "file") "恢复加密文件" else "恢复加密保险库", subtitle = "恢复密钥只在本机用于解密，不会发送给服务器",
    onDismissRequest = ::dismiss, confirmText = "验证并恢复", enabled = confirmation.isNotBlank(),
    onConfirm = { val code = confirmation; val fromFile = dialog == "file"; val uri = importUri; dismiss(); if (fromFile && uri != null) onImport(uri, code) else onRestore(code) },
  ) {
    AppTextField(value = confirmation, onValueChange = { confirmation = it.take(100) }, label = "恢复密钥", isPassword = true)
    Text("恢复后合并此账号的本地条目；不会自动清空本地验证器。", style = MaterialTheme.typography.bodySmall)
  }
  if (dialog == "delete") AppConfirmDialog(
    title = "删除云端备份", icon = Icons.Outlined.Security, detail = "删除当前保险库及在线历史版本，并停止本机同步。本地条目保留，其他设备不会自动重建该备份。离线服务器备份按保留策略过期。",
    confirmLabel = "删除云端备份", dismissLabel = "取消", danger = true,
    onDismiss = ::dismiss, onConfirm = { dismiss(); onDeleteCloud() },
  )
  historySelection?.let { item -> AppConfirmDialog(
    title = "恢复历史条目", icon = Icons.Outlined.Security, detail = "将版本 ${item.revision} 中缺失的条目补回当前保险库，并同步到其他设备。",
    confirmLabel = "恢复", dismissLabel = "取消", onDismiss = { historySelection = null },
    onConfirm = { historySelection = null; onRestoreHistory(item.revision) },
  ) }
}
