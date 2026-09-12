package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogForm
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.input.AppTextField

@Composable
internal fun GoogleAccountFormDialog(
    account: GoogleAccountRecord?,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, String, String, String, String) -> Unit,
) {
    var email by rememberSaveable(account?.id) { mutableStateOf(account?.primaryEmail.orEmpty()) }
    var name by rememberSaveable(account?.id) { mutableStateOf(account?.displayName.orEmpty()) }
    var status by rememberSaveable(account?.id) { mutableStateOf(account?.emailStatus ?: EMAIL_UNKNOWN) }
    var openAiStatus by rememberSaveable(account?.id) { mutableStateOf(account?.openAiStatus ?: OPENAI_UNREGISTERED) }
    var tags by rememberSaveable(account?.id) { mutableStateOf(account?.tags?.joinToString(", ").orEmpty()) }
    var nextReviewAt by rememberSaveable(account?.id) { mutableStateOf(account?.nextReviewAt?.let(::reviewDateInput).orEmpty()) }
    var note by rememberSaveable(account?.id) { mutableStateOf(account?.note.orEmpty()) }
    var localError by rememberSaveable(account?.id) { mutableStateOf<String?>(null) }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Email,
        title = if (account == null) "添加 Google 邮箱" else "编辑邮箱记录",
        subtitle = "只记录邮箱资产，不保存 Google 密码或验证码。",
        confirmText = if (account == null) "添加" else "保存",
        onConfirm = {
                        if (!email.contains("@")) localError = "请输入邮箱地址。"
                        else {
                            onSubmit(email, name, status, openAiStatus, tags, nextReviewAt, note)
                        }
                    },
        loading = busy,
        enabled = !busy,
        errorMessage = localError,
        content = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 500.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppTextField(value = email, onValueChange = { email = it; localError = null }, label = "主邮箱", keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), enabled = !busy)
                AppTextField(value = name, onValueChange = { name = it }, label = "显示名称（可选）", enabled = !busy)
                DeskStatusPicker("邮箱状态", status, listOf(EMAIL_NORMAL, EMAIL_ATTENTION, EMAIL_UNAVAILABLE, EMAIL_UNKNOWN), enabled = !busy) { status = it }
                DeskStatusPicker("OpenAI 状态", openAiStatus, listOf(OPENAI_UNREGISTERED, OPENAI_REGISTERED, OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN), enabled = !busy) { openAiStatus = it }
                AppTextField(value = tags, onValueChange = { tags = it }, label = "标签（逗号分隔，可选）", enabled = !busy)
                AppTextField(value = nextReviewAt, onValueChange = { nextReviewAt = it }, label = "检查日期（yyyy-MM-dd，可选）", enabled = !busy)
                AppTextField(value = note, onValueChange = { note = it }, label = "备注（可选）", enabled = !busy, singleLine = false, minLines = 2, maxLines = 3)

            }
        },
    )
}

@Composable
internal fun GoogleAccountImportDialog(
    busy: Boolean,
    existingEmails: Set<String>,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var rawText by rememberSaveable { mutableStateOf("") }
    val tokens = rawText.split(Regex("[\\s,;，；]+"))
        .map(::normalizeGoogleAddress)
        .filter(String::isNotBlank)
    val validTokens = tokens.filter(::isValidGoogleAddress)
    val uniqueValid = validTokens.distinct()
    val newEmails = uniqueValid.filterNot(existingEmails::contains)
    val invalidCount = tokens.count { !isValidGoogleAddress(it) }
    val duplicateCount = validTokens.size - uniqueValid.size
    val existingCount = uniqueValid.size - newEmails.size

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.ContentPaste,
        title = "批量导入主邮箱",
        subtitle = "每行一个地址，也支持用逗号或分号分隔。只导入邮箱，不会读取其他账号信息。",
        confirmText = "导入",
        onConfirm = { onSubmit(rawText) },
        loading = busy,
        enabled = !busy && rawText.isNotBlank(),
        content = {
            AppTextField(
                value = rawText,
                onValueChange = { rawText = it },
                label = "粘贴邮箱列表",
                enabled = !busy,
                singleLine = false,
                minLines = 6,
                maxLines = 10,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            if (rawText.isNotBlank()) {
                Text(
                    "预览：可导入 ${newEmails.size} 个，已存在 $existingCount 个，重复 $duplicateCount 个，无效 $invalidCount 个。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        },
    )
}

@Composable
internal fun GoogleAliasFormDialog(
    account: GoogleAccountRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var address by rememberSaveable(account.id) { mutableStateOf(nextAliasSuggestion(account)) }
    var tag by rememberSaveable(account.id) { mutableStateOf("") }
    var localError by rememberSaveable(account.id) { mutableStateOf<String?>(null) }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.AlternateEmail,
        title = "添加邮箱别名",
        subtitle = "默认按主邮箱后追加 + 三位编号生成，例如 name+001@gmail.com。",
        confirmText = "添加",
        onConfirm = {
                        if (!address.contains("@")) localError = "请输入别名地址。"
                        else onSubmit(address)
                    },
        loading = busy,
        enabled = !busy,
        errorMessage = localError,
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppTextField(value = address, onValueChange = { address = it; localError = null }, label = "别名地址", keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), enabled = !busy)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    AppTextField(value = tag, onValueChange = { tag = it }, label = "编号（可选，如 002）", modifier = Modifier.weight(1f), enabled = !busy)
                    AppSecondaryButton(text = "生成", onClick = {
                        val generated = numberedAlias(
                            account.primaryEmail,
                            tag.ifBlank { nextAliasNumber(account) },
                        )
                        if (generated != null) address = generated
                    }, enabled = !busy)
                }
                Text("生成的地址仅作为候选，请在实际使用后手动标记状态。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            }
        },
    )
}

@Composable
internal fun GoogleAliasStatusDialog(
    alias: GoogleAliasRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String) -> Unit,
) {
    var aliasStatus by rememberSaveable(alias.id) { mutableStateOf(alias.aliasStatus) }
    var openAiStatus by rememberSaveable(alias.id) { mutableStateOf(alias.openAiStatus) }
    var note by rememberSaveable(alias.id) { mutableStateOf(alias.note) }

    AppDialogForm(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Edit,
        title = "更新别名状态",
        subtitle = alias.address,
        confirmText = "保存",
        onConfirm = { onSubmit(aliasStatus, openAiStatus, note) },
        loading = busy,
        enabled = !busy,
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                DeskStatusPicker("别名状态", aliasStatus, listOf(ALIAS_CANDIDATE, ALIAS_CONFIRMED, ALIAS_UNAVAILABLE), enabled = !busy) { aliasStatus = it }
                DeskStatusPicker("OpenAI 状态", openAiStatus, listOf(OPENAI_UNREGISTERED, OPENAI_REGISTERED, OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN), enabled = !busy) { openAiStatus = it }
                AppTextField(value = note, onValueChange = { note = it }, label = "备注（可选）", enabled = !busy, singleLine = false, minLines = 2, maxLines = 3)
                Text("状态来自你的手动确认，不会自动登录或探测第三方账号。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
}


@Composable
private fun DeskStatusPicker(
    label: String,
    value: String,
    options: List<String>,
    enabled: Boolean = true,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    AppSelectField(
        label = label,
        value = value,
        options = options.map { AppSelectOption(it, statusOptionLabel(it)) },
        onValueChange = onSelect,
        expanded = expanded,
        onExpandedChange = { expanded = it },
        enabled = enabled,
    )
}
