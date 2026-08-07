package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import android.content.Context
import android.content.Intent
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Unarchive
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private const val FILTER_ALL = "all"
private const val FILTER_UNREGISTERED = "unregistered"
private const val FILTER_REGISTERED = "registered"
private const val FILTER_ATTENTION = "attention"
private const val SORT_ATTENTION = "attention"
private const val SORT_EMAIL = "email"
private const val SORT_RECENT = "recent"
private const val SORT_REVIEW = "review"

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
    state: GoogleAccountDeskUiState,
    contentPadding: PaddingValues,
    onDismiss: () -> Unit,
    onAddAccount: (String, String, String, String, String, String, String) -> Unit,
    onImportAccounts: (String) -> Unit,
    onUpdateAccount: (String, String, String, String, String, String, String, String) -> Unit,
    onDeleteAccount: (String) -> Unit,
    onBulkUpdateAccounts: (Set<String>, String) -> Unit,
    onBulkArchiveAccounts: (Set<String>, Boolean) -> Unit,
    onBulkDeleteAccounts: (Set<String>) -> Unit,
    onAddAlias: (String, String, String) -> Unit,
    onUpdateAlias: (String, String, String, String, String) -> Unit,
    onDeleteAlias: (String, String) -> Unit,
    onUploadLocalAccounts: () -> Unit,
    onDiscardLocalAccounts: () -> Unit,
) {
    BackHandler(enabled = true, onBack = onDismiss)
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(FILTER_ALL) }
    var sort by rememberSaveable { mutableStateOf(SORT_ATTENTION) }
    var showArchived by rememberSaveable { mutableStateOf(false) }
    var actionMenuExpanded by remember { mutableStateOf(false) }
    var bulkStatusMenuExpanded by remember { mutableStateOf(false) }
    var selectionMode by rememberSaveable { mutableStateOf(false) }
    var selectedAccountIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var confirmBulkDelete by remember { mutableStateOf(false) }
    var selectedAccountId by rememberSaveable { mutableStateOf<String?>(null) }
    var detailAccountId by rememberSaveable { mutableStateOf<String?>(null) }
    var showAddAccount by rememberSaveable { mutableStateOf(false) }
    var showImportAccounts by rememberSaveable { mutableStateOf(false) }
    var editingAccount by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var addingAliasFor by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var editingAlias by remember { mutableStateOf<Pair<String, GoogleAliasRecord>?>(null) }
    var deletingAccount by remember { mutableStateOf<GoogleAccountRecord?>(null) }
    var deletingAlias by remember { mutableStateOf<Pair<String, GoogleAliasRecord>?>(null) }

    LaunchedEffect(state.googleAccounts) {
        val validIds = state.googleAccounts.map { it.id }.toSet()
        if (state.googleAccounts.none { it.id == selectedAccountId }) {
            selectedAccountId = null
        }
        if (state.googleAccounts.none { it.id == detailAccountId }) {
            detailAccountId = null
        }
        selectedAccountIds = selectedAccountIds.intersect(validIds)
    }

    val accounts = state.googleAccounts
    val aliases = accounts.flatMap { it.aliases }
    val filteredAccounts = accounts.filter { account ->
        val matchesQuery = query.isBlank() ||
            account.primaryEmail.contains(query.trim(), ignoreCase = true) ||
            account.displayName.contains(query.trim(), ignoreCase = true) ||
            account.note.contains(query.trim(), ignoreCase = true) ||
            account.tags.any { it.contains(query.trim(), ignoreCase = true) } ||
            account.aliases.any {
                it.address.contains(query.trim(), ignoreCase = true) ||
                    it.note.contains(query.trim(), ignoreCase = true)
            }
        val matchesFilter = when (filter) {
            FILTER_UNREGISTERED -> account.openAiStatus == OPENAI_UNREGISTERED
            FILTER_REGISTERED -> account.openAiStatus == OPENAI_REGISTERED
            FILTER_ATTENTION -> accountNeedsAttention(account)
            else -> true
        }
        matchesQuery && matchesFilter
    }
    val sortedAccounts = filteredAccounts
        .filter { showArchived || !it.archived }
        .sortedWith(accountComparator(sort))
    val detailAccount = accounts.firstOrNull { it.id == detailAccountId }
    val busy = state.busyAction == "google-accounts"
    val context = LocalContext.current
    val selectedAccounts = accounts.filter { it.id in selectedAccountIds }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = appPageContentPadding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            AppSecondaryHeader(
                title = "Google 邮箱台账",
                subtitle = "记录主邮箱、别名和 OpenAI 使用状态",
                onBack = onDismiss,
                actions = {
                    AppHeaderIconButton(
                        icon = Icons.Outlined.Add,
                        contentDescription = "添加主邮箱",
                        onClick = { showAddAccount = true },
                        enabled = !busy && !state.googleAccountMigrationPending,
                    )
                    AppHeaderIconButton(
                        icon = Icons.Outlined.ContentPaste,
                        contentDescription = "批量导入邮箱",
                        onClick = { showImportAccounts = true },
                        enabled = !busy && !state.googleAccountMigrationPending,
                    )
                    Box {
                        AppHeaderIconButton(
                            icon = Icons.Outlined.MoreVert,
                            contentDescription = "更多操作",
                            onClick = { actionMenuExpanded = true },
                        )
                        DropdownMenu(
                            expanded = actionMenuExpanded,
                            onDismissRequest = { actionMenuExpanded = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text(if (selectionMode) "退出批量管理" else "批量管理") },
                                leadingIcon = { Icon(Icons.Outlined.Checklist, contentDescription = null) },
                                onClick = {
                                    selectionMode = !selectionMode
                                    selectedAccountIds = emptySet()
                                    actionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("按${sortLabel(sort)}排序") },
                                leadingIcon = { Icon(Icons.AutoMirrored.Outlined.Sort, contentDescription = null) },
                                onClick = {
                                    sort = nextSort(sort)
                                    actionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text(if (showArchived) "隐藏归档邮箱" else "显示归档邮箱") },
                                leadingIcon = { Icon(if (showArchived) Icons.Outlined.Archive else Icons.Outlined.Unarchive, contentDescription = null) },
                                onClick = {
                                    showArchived = !showArchived
                                    actionMenuExpanded = false
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("导出台账备份") },
                                leadingIcon = { Icon(Icons.Outlined.FileDownload, contentDescription = null) },
                                onClick = {
                                    exportGoogleAccounts(context, accounts)
                                    actionMenuExpanded = false
                                },
                            )
                        }
                    }
                },
            )
        }

        item {
            AppPanel {
                Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        MetricCell("主邮箱", accounts.size.toString(), Modifier.weight(1f))
                        MetricCell("别名", aliases.size.toString(), Modifier.weight(1f))
                        MetricCell(
                            "已注册",
                            accounts.count { it.openAiStatus == OPENAI_REGISTERED }.toString(),
                            Modifier.weight(1f),
                            Color(0xFF047857),
                        )
                        MetricCell(
                            "待处理",
                            accounts.count { it.openAiStatus != OPENAI_REGISTERED }.toString(),
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
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                shape = AppSearchFieldShape,
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Email),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
            )
        }

        item {
            StatusFilterRow(selected = filter, onSelect = { filter = it })
        }

        if (selectionMode) {
            item {
                AppPanel {
                    Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                "已选择 ${selectedAccountIds.size} 个邮箱",
                                modifier = Modifier.weight(1f),
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            TextButton(onClick = {
                                val allVisibleIds = sortedAccounts.map { it.id }.toSet()
                                selectedAccountIds = if (selectedAccountIds.containsAll(allVisibleIds)) emptySet() else allVisibleIds
                            }) {
                                Text(if (sortedAccounts.isNotEmpty() && selectedAccountIds.containsAll(sortedAccounts.map { it.id })) "取消全选" else "全选")
                            }
                            TextButton(onClick = {
                                selectionMode = false
                                selectedAccountIds = emptySet()
                            }) {
                                Text("完成")
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box {
                                TextButton(
                                    onClick = { bulkStatusMenuExpanded = true },
                                    enabled = selectedAccountIds.isNotEmpty() && !busy,
                                ) {
                                    Text("标记状态")
                                }
                                DropdownMenu(
                                    expanded = bulkStatusMenuExpanded,
                                    onDismissRequest = { bulkStatusMenuExpanded = false },
                                ) {
                                    listOf(OPENAI_REGISTERED, OPENAI_UNREGISTERED, OPENAI_VERIFICATION, OPENAI_ABNORMAL).forEach { status ->
                                        DropdownMenuItem(
                                            text = { Text(openAiStatusLabel(status)) },
                                            onClick = {
                                                onBulkUpdateAccounts(selectedAccountIds, status)
                                                bulkStatusMenuExpanded = false
                                                selectionMode = false
                                                selectedAccountIds = emptySet()
                                            },
                                        )
                                    }
                                }
                            }
                            TextButton(
                                onClick = {
                                    onBulkArchiveAccounts(selectedAccountIds, selectedAccounts.any { !it.archived })
                                    selectionMode = false
                                    selectedAccountIds = emptySet()
                                },
                                enabled = selectedAccountIds.isNotEmpty() && !busy,
                            ) {
                                Icon(
                                    if (selectedAccounts.any { !it.archived }) Icons.Outlined.Archive else Icons.Outlined.Unarchive,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Text(if (selectedAccounts.any { !it.archived }) "归档" else "恢复")
                            }
                            TextButton(
                                onClick = { confirmBulkDelete = true },
                                enabled = selectedAccountIds.isNotEmpty() && !busy,
                            ) {
                                Icon(Icons.Outlined.DeleteSweep, contentDescription = null, modifier = Modifier.size(18.dp))
                                Text("删除")
                            }
                        }
                    }
                }
            }
        }

        if (sortedAccounts.isEmpty()) {
            item {
                AppPanel {
                    EmptyBlock(
                        if (accounts.isEmpty()) "还没有邮箱记录" else "没有匹配的邮箱",
                        if (accounts.isEmpty()) "点击右上角添加一个 Google 主邮箱。" else "换一个筛选条件或搜索关键词。",
                    )
                }
            }
        } else {
            items(sortedAccounts, key = { it.id }, contentType = { "google-account" }) { account ->
                GoogleAccountRow(
                    account = account,
                    selected = account.id == selectedAccountId && !selectionMode,
                    selectionMode = selectionMode,
                    bulkSelected = account.id in selectedAccountIds,
                    onClick = {
                        if (selectionMode) {
                            selectedAccountIds = if (account.id in selectedAccountIds) {
                                selectedAccountIds - account.id
                            } else {
                                selectedAccountIds + account.id
                            }
                        } else {
                            selectedAccountId = account.id
                            detailAccountId = account.id
                        }
                    },
                )
            }
        }
    }

    detailAccount?.let { account ->
        GoogleAccountDetailDialog(
            account = account,
            busy = busy,
            onDismiss = { detailAccountId = null },
            onEdit = { editingAccount = account },
            onDelete = { deletingAccount = account },
            onToggleArchive = {
                onBulkArchiveAccounts(setOf(account.id), !account.archived)
                detailAccountId = null
            },
            onAddAlias = { addingAliasFor = account },
            onEditAlias = { alias -> editingAlias = account.id to alias },
            onDeleteAlias = { alias -> deletingAlias = account.id to alias },
        )
    }

    if (showAddAccount) {
        GoogleAccountFormDialog(
            account = null,
            busy = busy,
            onDismiss = { if (!busy) showAddAccount = false },
            onSubmit = { email, name, emailStatus, openAiStatus, tags, nextReviewAt, note ->
                onAddAccount(email, name, emailStatus, openAiStatus, tags, nextReviewAt, note)
                showAddAccount = false
            },
        )
    }
    if (showImportAccounts) {
        GoogleAccountImportDialog(
            busy = busy,
            existingEmails = accounts.map { it.primaryEmail }.toSet(),
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
            onSubmit = { email, name, emailStatus, openAiStatus, tags, nextReviewAt, note ->
                onUpdateAccount(account.id, email, name, emailStatus, openAiStatus, tags, nextReviewAt, note)
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
                detailAccountId = null
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
    if (confirmBulkDelete) {
        AppConfirmDialog(
            title = "删除已选择的邮箱？",
            detail = "将删除 ${selectedAccountIds.size} 个邮箱及其别名记录，不能恢复。",
            confirmLabel = "删除记录",
            onDismiss = { if (!busy) confirmBulkDelete = false },
            onConfirm = {
                onBulkDeleteAccounts(selectedAccountIds)
                confirmBulkDelete = false
                selectionMode = false
                selectedAccountIds = emptySet()
            },
            icon = Icons.Outlined.DeleteSweep,
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
                    .clip(RoundedCornerShape(12.dp))
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
    selectionMode: Boolean,
    bulkSelected: Boolean,
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
                        account.tags.takeIf { it.isNotEmpty() }?.joinToString(" · "),
                        account.nextReviewAt?.let { "检查 ${reviewLabel(it)}" },
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusBadge(
                status = openAiStatusKey(account.openAiStatus),
                label = openAiStatusLabel(account.openAiStatus),
            )
            if (selectionMode) {
                Checkbox(checked = bulkSelected, onCheckedChange = { onClick() })
            } else if (selected) {
                Icon(Icons.Outlined.MoreVert, contentDescription = "已选中", tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
private fun GoogleAccountDetailDialog(
    account: GoogleAccountRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleArchive: () -> Unit,
    onAddAlias: () -> Unit,
    onEditAlias: (GoogleAliasRecord) -> Unit,
    onDeleteAlias: (GoogleAliasRecord) -> Unit,
) {
    AppDialog(
        onDismissRequest = onDismiss,
        contentPadding = PaddingValues(0.dp),
        content = {
            GoogleAccountDetail(
                account = account,
                busy = busy,
                onEdit = onEdit,
                onDelete = onDelete,
                onToggleArchive = onToggleArchive,
                onAddAlias = onAddAlias,
                onEditAlias = onEditAlias,
                onDeleteAlias = onDeleteAlias,
            )
        },
    )
}

@Composable
private fun GoogleAccountDetail(
    account: GoogleAccountRecord,
    busy: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleArchive: () -> Unit,
    onAddAlias: () -> Unit,
    onEditAlias: (GoogleAliasRecord) -> Unit,
    onDeleteAlias: (GoogleAliasRecord) -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = 620.dp)
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 18.dp),
    ) {
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
                IconButton(onClick = onToggleArchive, enabled = !busy) {
                    Icon(
                        if (account.archived) Icons.Outlined.Unarchive else Icons.Outlined.Archive,
                        contentDescription = if (account.archived) "恢复邮箱" else "归档邮箱",
                    )
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("邮箱", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    StatusBadge(accountStatusKey(account.emailStatus), accountStatusLabel(account.emailStatus))
                }
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("OpenAI", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    StatusBadge(openAiStatusKey(account.openAiStatus), openAiStatusLabel(account.openAiStatus))
                }
            }
            if (account.tags.isNotEmpty()) {
                Text("标签：${account.tags.joinToString(" · ")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            account.nextReviewAt?.let {
                Text(
                    if (it <= System.currentTimeMillis()) "检查日期：已到期（${reviewLabel(it)}）" else "检查日期：${reviewLabel(it)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (it <= System.currentTimeMillis()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                )
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

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.Email,
        title = if (account == null) "添加 Google 邮箱" else "编辑邮箱记录",
        subtitle = "只记录邮箱资产，不保存 Google 密码或验证码。",
        content = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 500.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(11.dp),
            ) {
                DialogTextField(email, { email = it; localError = null }, "主邮箱", keyboardType = KeyboardType.Email, enabled = !busy)
                DialogTextField(name, { name = it }, "显示名称（可选）", enabled = !busy)
                DeskStatusPicker("邮箱状态", status, listOf(EMAIL_NORMAL, EMAIL_ATTENTION, EMAIL_UNAVAILABLE, EMAIL_UNKNOWN)) { status = it }
                DeskStatusPicker("OpenAI 状态", openAiStatus, listOf(OPENAI_UNREGISTERED, OPENAI_REGISTERED, OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN)) { openAiStatus = it }
                DialogTextField(tags, { tags = it }, "标签（逗号分隔，可选）", enabled = !busy)
                DialogTextField(nextReviewAt, { nextReviewAt = it }, "检查日期（yyyy-MM-dd，可选）", enabled = !busy)
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
                            onSubmit(email, name, status, openAiStatus, tags, nextReviewAt, note)
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
            if (rawText.isNotBlank()) {
                Text(
                    "预览：可导入 ${newEmails.size} 个，已存在 $existingCount 个，重复 $duplicateCount 个，无效 $invalidCount 个。",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
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
        subtitle = "默认按主邮箱后追加 + 三位编号生成，例如 name+001@gmail.com。",
        content = {
            Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                DialogTextField(address, { address = it; localError = null }, "别名地址", keyboardType = KeyboardType.Email, enabled = !busy)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    DialogTextField(tag, { tag = it }, "编号（可选，如 002）", modifier = Modifier.weight(1f), enabled = !busy)
                    OutlinedButton(onClick = {
                        val generated = numberedAlias(
                            account.primaryEmail,
                            tag.ifBlank { nextAliasNumber(account) },
                        )
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
    numberedAlias(account.primaryEmail, nextAliasNumber(account)) ?: ""

private fun nextAliasNumber(account: GoogleAccountRecord): String {
    val local = account.primaryEmail.substringBefore('@')
    val domain = account.primaryEmail.substringAfter('@')
    val usedAddresses = account.aliases.map { it.address }.toSet() + account.primaryEmail
    val nextIndex = (1..9999).firstOrNull { index ->
        "$local+${index.toString().padStart(3, '0')}@$domain" !in usedAddresses
    } ?: (account.aliases.size + 1)
    return nextIndex.toString().padStart(3, '0')
}

private fun numberedAlias(primaryEmail: String, number: String): String? {
    val local = primaryEmail.substringBefore('@').takeIf(String::isNotBlank) ?: return null
    val domain = primaryEmail.substringAfter('@').takeIf(String::isNotBlank) ?: return null
    val normalizedNumber = number.trim().filter(Char::isDigit).toIntOrNull() ?: return null
    return "$local+${normalizedNumber.toString().padStart(3, '0')}@$domain"
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
    "custom" -> "自定义别名"
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

private fun accountNeedsAttention(account: GoogleAccountRecord): Boolean =
    account.emailStatus != EMAIL_NORMAL ||
        account.openAiStatus in setOf(OPENAI_VERIFICATION, OPENAI_ABNORMAL, OPENAI_DISABLED, OPENAI_UNKNOWN) ||
        account.nextReviewAt?.let { it <= System.currentTimeMillis() } == true

private fun accountComparator(sort: String): Comparator<GoogleAccountRecord> = when (sort) {
    SORT_EMAIL -> compareBy { it.primaryEmail }
    SORT_RECENT -> compareByDescending<GoogleAccountRecord> { it.lastCheckedAt ?: 0L }
    SORT_REVIEW -> compareBy<GoogleAccountRecord> { it.nextReviewAt ?: Long.MAX_VALUE }
        .thenBy { it.primaryEmail }
    else -> compareByDescending<GoogleAccountRecord> { accountNeedsAttention(it) }
        .thenBy { it.nextReviewAt ?: Long.MAX_VALUE }
        .thenBy { it.primaryEmail }
}

private fun sortLabel(sort: String): String = when (sort) {
    SORT_EMAIL -> "邮箱"
    SORT_RECENT -> "最近确认"
    SORT_REVIEW -> "检查日期"
    else -> "待处理"
}

private fun nextSort(sort: String): String = when (sort) {
    SORT_ATTENTION -> SORT_EMAIL
    SORT_EMAIL -> SORT_RECENT
    SORT_RECENT -> SORT_REVIEW
    else -> SORT_ATTENTION
}

private fun normalizeGoogleAddress(address: String): String = address.trim().lowercase()

private fun isValidGoogleAddress(address: String): Boolean =
    address.length <= 254 && address.count { it == '@' } == 1 &&
        address.substringBefore('@').isNotBlank() &&
        address.substringAfter('@').contains('.') &&
        address.none(Char::isWhitespace)

private fun reviewLabel(millis: Long): String =
    DateTimeFormatter.ofPattern("yyyy-MM-dd").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(millis))

private fun reviewDateInput(millis: Long): String = reviewLabel(millis)

private fun exportGoogleAccounts(context: Context, accounts: List<GoogleAccountRecord>) {
    val payload = JSONObject().apply {
        put("version", 1)
        put("exportedAt", System.currentTimeMillis())
        put("accounts", JSONArray().apply {
            accounts.forEach { account ->
                put(JSONObject().apply {
                    put("id", account.id)
                    put("primaryEmail", account.primaryEmail)
                    put("displayName", account.displayName)
                    put("emailStatus", account.emailStatus)
                    put("openAiStatus", account.openAiStatus)
                    put("note", account.note)
                    put("lastCheckedAt", account.lastCheckedAt ?: JSONObject.NULL)
                    put("nextReviewAt", account.nextReviewAt ?: JSONObject.NULL)
                    put("tags", JSONArray().apply { account.tags.forEach { put(it) } })
                    put("archived", account.archived)
                    put("aliases", JSONArray().apply {
                        account.aliases.forEach { alias ->
                            put(JSONObject().apply {
                                put("id", alias.id)
                                put("address", alias.address)
                                put("aliasType", alias.aliasType)
                                put("aliasStatus", alias.aliasStatus)
                                put("openAiStatus", alias.openAiStatus)
                                put("registeredAt", alias.registeredAt ?: JSONObject.NULL)
                                put("lastVerifiedAt", alias.lastVerifiedAt ?: JSONObject.NULL)
                                put("note", alias.note)
                            })
                        }
                    })
                })
            }
        })
    }
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_SUBJECT, "Google 邮箱台账备份")
        putExtra(Intent.EXTRA_TEXT, payload.toString(2))
    }
    context.startActivity(Intent.createChooser(shareIntent, "导出邮箱台账"))
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
