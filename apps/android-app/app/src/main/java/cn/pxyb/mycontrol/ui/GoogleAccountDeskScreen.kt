package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.statusBarsPadding
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val FILTER_ALL = "all"
private const val FILTER_UNREGISTERED = "unregistered"
private const val FILTER_REGISTERED = "registered"
private const val FILTER_ATTENTION = "attention"

private const val EMAIL_NORMAL = "normal"
private const val EMAIL_ATTENTION = "attention"
private const val EMAIL_UNAVAILABLE = "unavailable"
private const val EMAIL_UNKNOWN = "unknown"

private const val ALIAS_CANDIDATE = "candidate"
private const val ALIAS_CONFIRMED = "confirmed"
private const val ALIAS_UNAVAILABLE = "unavailable"

private const val OPENAI_UNREGISTERED = "unregistered"
private const val OPENAI_REGISTERED = "registered"
private const val OPENAI_VERIFICATION = "verification"
private const val OPENAI_ABNORMAL = "abnormal"
private const val OPENAI_DISABLED = "disabled"
private const val OPENAI_UNKNOWN = "unknown"

private val DeskTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
    .withZone(ZoneId.systemDefault())

@Composable
fun GoogleAccountDeskScreen(
    state: AppUiState,
    contentPadding: PaddingValues,
    onDismiss: () -> Unit,
    onAddAccount: (String, String, String) -> Unit,
    onImportAccounts: (String) -> Unit,
    onUpdateAccount: (String, String, String, String, String) -> Unit,
    onDeleteAccount: (String) -> Unit,
    onAddAlias: (String, String, String) -> Unit,
    onUpdateAlias: (String, String, String, String, String) -> Unit,
    onDeleteAlias: (String, String) -> Unit,
    onUploadLocalAccounts: () -> Unit,
    onDiscardLocalAccounts: () -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(FILTER_ALL) }
    var selectedAccountId by rememberSaveable { mutableStateOf<String?>(null) }
    var showAddAccount by rememberSaveable { mutableStateOf(false) }
    var showImportAccounts by rememberSaveable { mutableStateOf(false) }
    var editingAccount by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var addingAliasFor by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var editingAlias by remember { mutableStateOf<Pair<String, GoogleAliasRecord>?>(null) }
    var deletingAccount by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var deletingAlias by remember { mutableStateOf<Pair<String, GoogleAliasRecord>?>(null) }

    LaunchedEffect(state.googleAccounts) {
        if (state.googleAccounts.none { it.id == selectedAccountId }) {
            selectedAccountId = state.googleAccounts.firstOrNull()?.id
        }
    }

    val accounts = state.googleAccounts
    val aliases = accounts.flatMap { it.aliases }
    val filteredAccounts = accounts.filter { account ->
        val matchesQuery = query.isBlank() ||
            account.primaryEmail.contains(query.trim(), ignoreCase = true) ||
            account.displayName.contains(query.trim(), ignoreCase = true) ||
            account.aliases.any { it.address.contains(query.trim(), ignoreCase = true) }
        val matchesFilter = when (filter) {
            FILTER_UNREGISTERED -> account.aliases.isEmpty() || account.aliases.any { it.openAiStatus == OPENAI_UNREGISTERED }
            FILTER_REGISTERED -> account.aliases.any { it.openAiStatus == OPENAI_REGISTERED }
            FILTER_ATTENTION -> account.emailStatus != EMAIL_NORMAL || account.aliases.any {
                it.openAiStatus in setOf(OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED)
            }
            else -> true
        }
        matchesQuery && matchesFilter
    }
    val selectedAccount = accounts.firstOrNull { it.id == selectedAccountId }
    val busy = state.busyAction == "google-accounts"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = contentPadding.calculateTopPadding() + 8.dp,
            bottom = contentPadding.calculateBottomPadding() + 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onDismiss) {
                    Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "返回")
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Google 邮箱台账", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                    Text(
                        "记录主邮箱、别名和 OpenAI 使用状态",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { showAddAccount = true }, enabled = !busy && !state.googleAccountMigrationPending) {
                    Icon(Icons.Outlined.Add, contentDescription = "添加主邮箱", tint = MaterialTheme.colorScheme.primary)
                }
                IconButton(onClick = { showImportAccounts = true }, enabled = !busy && !state.googleAccountMigrationPending) {
                    Icon(Icons.Outlined.ContentPaste, contentDescription = "批量导入邮箱", tint = MaterialTheme.colorScheme.primary)
                }
            }
        }

        item {
            AppPanel {
                Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MetricCell("主邮箱", accounts.size.toString(), Modifier.weight(1f))
                        MetricCell("别名", aliases.size.toString(), Modifier.weight(1f))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        MetricCell(
                            "已注册",
                            aliases.count { it.openAiStatus == OPENAI_REGISTERED }.toString(),
                            Modifier.weight(1f),
                            Color(0xFF047857),
                        )
                        MetricCell(
                            "待处理",
                            aliases.count { it.openAiStatus != OPENAI_REGISTERED }.toString(),
                            Modifier.weight(1f),
                            Color(0xFFB45309),
                        )
                    }
                }
            }
        }

        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("搜索邮箱或备注") },
                singleLine = true,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
            )
        }

        item {
            StatusFilterRow(selected = filter, onSelect = { filter = it })
        }

        if (filteredAccounts.isEmpty()) {
            item {
                AppPanel {
                    EmptyBlock(
                        if (accounts.isEmpty()) "还没有邮箱记录" else "没有匹配的邮箱",
                        if (accounts.isEmpty()) "点击右上角添加一个 Google 主邮箱。" else "换一个筛选条件或搜索关键词。",
                    )
                }
            }
        } else {
            items(filteredAccounts, key = { it.id }, contentType = { "google-account" }) { account ->
                GoogleAccountRow(
                    account = account,
                    selected = account.id == selectedAccountId,
                    onClick = { selectedAccountId = account.id },
                )
            }
        }

        selectedAccount?.let { account ->
            item(key = "google-account-detail-${account.id}", contentType = "google-account-detail") {
                GoogleAccountDetail(
                    account = account,
                    busy = busy,
                    onEdit = { editingAccount = account },
                    onDelete = { deletingAccount = account },
                    onAddAlias = { addingAliasFor = account },
                    onEditAlias = { alias -> editingAlias = account.id to alias },
                    onDeleteAlias = { alias -> deletingAlias = account.id to alias },
                )
            }
        }
    }

    if (showAddAccount) {
        GoogleAccountFormDialog(
            account = null,
            busy = busy,
            onDismiss = { if (!busy) showAddAccount = false },
            onSubmit = { email, name, status, note ->
                onAddAccount(email, name, note)
                showAddAccount = false
            },
        )
    }
    if (showImportAccounts) {
        GoogleAccountImportDialog(
            busy = busy,
            onDismiss = { if (!busy) showImportAccounts = false },
            onSubmit = { rawText ->
                onImportAccounts(rawText)
                showImportAccounts = false
            },
        )
    }
    editingAccount?.let { account ->
        GoogleAccountFormDialog(
            account = account,
            busy = busy,
            onDismiss = { if (!busy) editingAccount = null },
            onSubmit = { email, name, status, note ->
                onUpdateAccount(account.id, email, name, status, note)
                editingAccount = null
            },
        )
    }
    addingAliasFor?.let { account ->
        GoogleAliasFormDialog(
            account = account,
            busy = busy,
            onDismiss = { if (!busy) addingAliasFor = null },
            onSubmit = { address ->
                onAddAlias(account.id, address, "plus")
                addingAliasFor = null
            },
        )
    }
    editingAlias?.let { (accountId, alias) ->
        GoogleAliasStatusDialog(
            alias = alias,
            busy = busy,
            onDismiss = { if (!busy) editingAlias = null },
            onSubmit = { aliasStatus, openAiStatus, note ->
                onUpdateAlias(accountId, alias.id, aliasStatus, openAiStatus, note)
                editingAlias = null
            },
        )
    }
    deletingAccount?.let { account ->
        AppConfirmDialog(
            title = "删除邮箱记录？",
            detail = "将同时删除 ${account.aliases.size} 个别名记录，不能恢复。",
            confirmLabel = "删除记录",
            onDismiss = { if (!busy) deletingAccount = null },
            onConfirm = {
                onDeleteAccount(account.id)
                deletingAccount = null
                selectedAccountId = null
            },
            icon = Icons.Outlined.DeleteOutline,
            danger = true,
            busy = busy,
        )
    }
    deletingAlias?.let { (accountId, alias) ->
        AppConfirmDialog(
            title = "删除这个别名？",
            detail = alias.address,
            confirmLabel = "删除别名",
            onDismiss = { if (!busy) deletingAlias = null },
            onConfirm = {
                onDeleteAlias(accountId, alias.id)
                deletingAlias = null
            },
            icon = Icons.Outlined.DeleteOutline,
            danger = true,
            busy = busy,
        )
    }
    if (state.googleAccountMigrationPending) {
        AppDialog(
            onDismissRequest = {},
            icon = Icons.Outlined.CloudSync,
            title = "发现本机邮箱记录",
            subtitle = "服务器台账为空，本机缓存中有 ${state.googleAccounts.size} 个主邮箱。",
            content = {
                Text(
                    "请选择如何处理这批记录。上传后会作为当前账号的服务器台账；清除后只会删除本机缓存。",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            },
            footer = {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "清除本机缓存",
                        onClick = onDiscardLocalAccounts,
                        modifier = Modifier.weight(1f),
                        busy = busy,
                    )
                    AppDialogPrimaryButton(
                        text = "上传到服务器",
                        onClick = onUploadLocalAccounts,
                        modifier = Modifier.weight(1f),
                        busy = busy,
                    )
                }
            },
        )
    }
}

@Composable
private fun StatusFilterRow(selected: String, onSelect: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        listOf(
            FILTER_ALL to "全部",
            FILTER_UNREGISTERED to "未注册",
            FILTER_REGISTERED to "已注册",
            FILTER_ATTENTION to "需处理",
        ).forEach { (value, label) ->
            Surface(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(value) },
                color = if (selected == value) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(
                    0.5.dp,
                    if (selected == value) MaterialTheme.colorScheme.primary.copy(alpha = 0.3f)
                    else MaterialTheme.colorScheme.outlineVariant,
                ),
            ) {
                Text(
                    label,
                    modifier = Modifier.padding(vertical = 9.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    style = MaterialTheme.typography.labelMedium,
                    color = if (selected == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun GoogleAccountRow(
    account: GoogleAccountRecord,
    selected: Boolean,
    onClick: () -> Unit,
) {
    AppPanel(modifier = Modifier.clickable(onClick = onClick)) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.45f),
                shape = RoundedCornerShape(12.dp),
            ) {
                Icon(
                    Icons.Outlined.Email,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(9.dp).size(21.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(account.primaryEmail, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOfNotNull(
                        account.displayName.takeIf(String::isNotBlank),
                        "${account.aliases.size} 个别名",
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusBadge(
                status = accountStatusKey(account.emailStatus),
                label = accountStatusLabel(account.emailStatus),
            )
            if (selected) {
                Icon(Icons.Outlined.MoreVert, contentDescription = "已选中", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun GoogleAccountDetail(
    account: GoogleAccountRecord,
    busy: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onAddAlias: () -> Unit,
    onEditAlias: (GoogleAliasRecord) -> Unit,
    onDeleteAlias: (GoogleAliasRecord) -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    AppPanel {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("邮箱详情", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(4.dp))
                    Text(account.primaryEmail, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (account.displayName.isNotBlank()) {
                        Text(account.displayName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                IconButton(onClick = onEdit, enabled = !busy) {
                    Icon(Icons.Outlined.Edit, contentDescription = "编辑邮箱")
                }
                IconButton(onClick = onDelete, enabled = !busy) {
                    Icon(Icons.Outlined.DeleteOutline, contentDescription = "删除邮箱", tint = MaterialTheme.colorScheme.error)
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("邮箱状态", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                StatusBadge(accountStatusKey(account.emailStatus), accountStatusLabel(account.emailStatus))
            }
            account.lastCheckedAt?.let {
                Text("最近确认：${formatDeskTime(it)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (account.note.isNotBlank()) {
                Text(account.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("邮箱别名", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text("候选地址需要手动确认，不能保证第三方服务接受。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = onAddAlias, enabled = !busy) {
                    Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                    Text("添加")
                }
            }
            if (account.aliases.isEmpty()) {
                EmptyBlock("暂无别名", "可以添加一个 Gmail +tag 候选地址。")
            } else {
                account.aliases.forEachIndexed { index, alias ->
                    if (index > 0) HorizontalDivider()
                    GoogleAliasRow(
                        alias = alias,
                        busy = busy,
                        onCopy = { clipboard.setText(AnnotatedString(alias.address)) },
                        onEdit = { onEditAlias(alias) },
                        onDelete = { onDeleteAlias(alias) },
                    )
                }
            }
        }
    }
}

@Composable
private fun GoogleAliasRow(
    alias: GoogleAliasRecord,
    busy: Boolean,
    onCopy: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Icon(Icons.Outlined.AlternateEmail, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 2.dp).size(20.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(alias.address, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${aliasTypeLabel(alias.aliasType)} · 别名${aliasStatusLabel(alias.aliasStatus)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            IconButton(onClick = onCopy, enabled = !busy, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Outlined.ContentCopy, contentDescription = "复制别名", modifier = Modifier.size(18.dp))
            }
            IconButton(onClick = onEdit, enabled = !busy, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Outlined.Edit, contentDescription = "编辑别名", modifier = Modifier.size(18.dp))
            }
            IconButton(onClick = onDelete, enabled = !busy, modifier = Modifier.size(34.dp)) {
                Icon(Icons.Outlined.DeleteOutline, contentDescription = "删除别名", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(18.dp))
            }
        }
        Row(
            modifier = Modifier.padding(start = 29.dp, top = 7.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            StatusBadge(openAiStatusKey(alias.openAiStatus), "OpenAI：${openAiStatusLabel(alias.openAiStatus)}")
            alias.lastVerifiedAt?.let {
                Text("确认于 ${formatDeskTime(it)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
            }
        }
        if (alias.note.isNotBlank()) {
            Text(alias.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 29.dp, top = 4.dp))
        }
    }
}

@Composable
private fun GoogleAccountFormDialog(
    account: GoogleAccountRecord?,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, String) -> Unit,
) {
    var email by rememberSaveable(account?.id) { mutableStateOf(account?.primaryEmail.orEmpty()) }
    var name by rememberSaveable(account?.id) { mutableStateOf(account?.displayName.orEmpty()) }
    var status by rememberSaveable(account?.id) { mutableStateOf(account?.emailStatus ?: EMAIL_UNKNOWN) }
    var note by rememberSaveable(account?.id) { mutableStateOf(account?.note.orEmpty()) }
    var localError by rememberSaveable(account?.id) { mutableStateOf<String?>(null) }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Email,
        title = if (account == null) "添加 Google 邮箱" else "编辑邮箱记录",
        subtitle = "只记录邮箱资产，不保存 Google 密码或验证码。",
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                DialogTextField(email, { email = it; localError = null }, "主邮箱", keyboardType = KeyboardType.Email, enabled = !busy)
                DialogTextField(name, { name = it }, "显示名称（可选）", enabled = !busy)
                if (account != null) {
                    DeskStatusPicker("邮箱状态", status, listOf(EMAIL_NORMAL, EMAIL_ATTENTION, EMAIL_UNAVAILABLE, EMAIL_UNKNOWN)) { status = it }
                }
                DialogTextField(note, { note = it }, "备注（可选）", enabled = !busy, singleLine = false, minLines = 2, maxLines = 3)
                if (localError != null) DeskDialogError(localError)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f), enabled = !busy)
                AppDialogPrimaryButton(
                    if (account == null) "添加" else "保存",
                    onClick = {
                        if (!email.contains("@")) localError = "请输入邮箱地址。"
                        else {
                            onSubmit(email, name, status, note)
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun GoogleAccountImportDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var rawText by rememberSaveable { mutableStateOf("") }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.ContentPaste,
        title = "批量导入主邮箱",
        subtitle = "每行一个地址，也支持用逗号或分号分隔。只导入邮箱，不会读取其他账号信息。",
        content = {
            DialogTextField(
                value = rawText,
                onValueChange = { rawText = it },
                label = "粘贴邮箱列表",
                enabled = !busy,
                singleLine = false,
                minLines = 6,
                maxLines = 10,
                keyboardType = KeyboardType.Email,
            )
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f), enabled = !busy)
                AppDialogPrimaryButton(
                    "导入",
                    onClick = { onSubmit(rawText) },
                    modifier = Modifier.weight(1f),
                    enabled = !busy && rawText.isNotBlank(),
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun GoogleAliasFormDialog(
    account: GoogleAccountRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    var address by rememberSaveable(account.id) { mutableStateOf(nextAliasSuggestion(account)) }
    var tag by rememberSaveable(account.id) { mutableStateOf("") }
    var localError by rememberSaveable(account.id) { mutableStateOf<String?>(null) }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.AlternateEmail,
        title = "添加邮箱别名",
        subtitle = "Gmail +tag 会投递到同一个主邮箱，不能当作独立 Google 账号。",
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                DialogTextField(address, { address = it; localError = null }, "别名地址", keyboardType = KeyboardType.Email, enabled = !busy)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    DialogTextField(tag, { tag = it }, "标签（可生成候选）", modifier = Modifier.weight(1f), enabled = !busy)
                    OutlinedButton(onClick = {
                        val generated = plusAlias(account.primaryEmail, tag.ifBlank { "openai" })
                        if (generated != null) address = generated
                    }, enabled = !busy) {
                        Text("生成")
                    }
                }
                Text("生成的地址仅作为候选，请在实际使用后手动标记状态。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (localError != null) DeskDialogError(localError)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f), enabled = !busy)
                AppDialogPrimaryButton(
                    "添加",
                    onClick = {
                        if (!address.contains("@")) localError = "请输入别名地址。"
                        else onSubmit(address)
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    )
}

@Composable
private fun GoogleAliasStatusDialog(
    alias: GoogleAliasRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String) -> Unit,
) {
    var aliasStatus by rememberSaveable(alias.id) { mutableStateOf(alias.aliasStatus) }
    var openAiStatus by rememberSaveable(alias.id) { mutableStateOf(alias.openAiStatus) }
    var note by rememberSaveable(alias.id) { mutableStateOf(alias.note) }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Edit,
        title = "更新别名状态",
        subtitle = alias.address,
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                DeskStatusPicker("别名状态", aliasStatus, listOf(ALIAS_CANDIDATE, ALIAS_CONFIRMED, ALIAS_UNAVAILABLE)) { aliasStatus = it }
                DeskStatusPicker("OpenAI 状态", openAiStatus, listOf(OPENAI_UNREGISTERED, OPENAI_REGISTERED, OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN)) { openAiStatus = it }
                DialogTextField(note, { note = it }, "备注（可选）", enabled = !busy, singleLine = false, minLines = 2, maxLines = 3)
                Text("状态来自你的手动确认，不会自动登录或探测第三方账号。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogSecondaryButton("取消", onDismiss, Modifier.weight(1f), enabled = !busy)
                AppDialogPrimaryButton("保存", { onSubmit(aliasStatus, openAiStatus, note) }, Modifier.weight(1f), enabled = !busy, busy = busy)
            }
        },
    )
}

@Composable
private fun DeskStatusPicker(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column(modifier = Modifier.fillMaxWidth()) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(14.dp)) {
                Text(statusOptionLabel(value), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Outlined.MoreVert, contentDescription = "选择状态", modifier = Modifier.size(18.dp))
            }
            DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                options.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(statusOptionLabel(option)) },
                        onClick = {
                            onSelect(option)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

private fun nextAliasSuggestion(account: GoogleAccountRecord): String =
    plusAlias(account.primaryEmail, "openai${account.aliases.size + 1}") ?: ""

private fun plusAlias(primaryEmail: String, tag: String): String? {
    val local = primaryEmail.substringBefore('@').takeIf(String::isNotBlank) ?: return null
    val domain = primaryEmail.substringAfter('@').takeIf(String::isNotBlank) ?: return null
    val normalizedTag = tag.trim().replace(Regex("[^A-Za-z0-9_-]"), "-").trim('-')
    if (normalizedTag.isBlank()) return null
    return "$local+$normalizedTag@$domain"
}

private fun accountStatusKey(status: String): String = when (status) {
    EMAIL_NORMAL -> "healthy"
    EMAIL_ATTENTION -> "warning"
    EMAIL_UNAVAILABLE -> "critical"
    else -> "unknown"
}

private fun accountStatusLabel(status: String): String = when (status) {
    EMAIL_NORMAL -> "正常"
    EMAIL_ATTENTION -> "需关注"
    EMAIL_UNAVAILABLE -> "不可用"
    else -> "未确认"
}

private fun aliasStatusLabel(status: String): String = when (status) {
    ALIAS_CONFIRMED -> "已确认"
    ALIAS_UNAVAILABLE -> "不可用"
    else -> "候选"
}

private fun aliasTypeLabel(type: String): String = when (type) {
    "plus" -> "+tag 别名"
    "workspace" -> "Workspace 别名"
    "custom" -> "自定义域名"
    else -> "其他别名"
}

private fun openAiStatusKey(status: String): String = when (status) {
    OPENAI_REGISTERED -> "healthy"
    OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED -> "warning"
    OPENAI_UNREGISTERED -> "pending"
    else -> "unknown"
}

private fun openAiStatusLabel(status: String): String = when (status) {
    OPENAI_REGISTERED -> "已注册正常"
    OPENAI_VERIFICATION -> "需要验证"
    OPENAI_ABNORMAL -> "暂时异常"
    OPENAI_DISABLED -> "已停用"
    OPENAI_UNREGISTERED -> "未注册"
    else -> "未确认"
}

private fun statusOptionLabel(status: String): String = when (status) {
    EMAIL_NORMAL -> "邮箱正常"
    EMAIL_ATTENTION -> "邮箱需关注"
    EMAIL_UNAVAILABLE -> "邮箱不可用"
    EMAIL_UNKNOWN -> "邮箱未确认"
    ALIAS_CANDIDATE -> "别名候选"
    ALIAS_CONFIRMED -> "别名已确认"
    ALIAS_UNAVAILABLE -> "别名不可用"
    else -> openAiStatusLabel(status)
}

private fun formatDeskTime(millis: Long): String = DeskTimeFormatter.format(Instant.ofEpochMilli(millis))

@Composable
private fun DeskDialogError(message: String?) {
    if (!message.isNullOrBlank()) {
        Text(
            message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
        )
    }
}
