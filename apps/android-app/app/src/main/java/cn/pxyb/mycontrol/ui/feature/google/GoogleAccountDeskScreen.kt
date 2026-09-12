package cn.pxyb.mycontrol.ui.feature.google

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Sort
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.ContentPaste
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.DeleteSweep
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Unarchive
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppSearchBar
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSecondaryHeader
import cn.pxyb.mycontrol.ui.components.layout.LocalAppNavigationHandlesBack
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
fun GoogleAccountDeskScreen(
    state: GoogleAccountDeskUiState,
    contentPadding: PaddingValues,
    onDismiss: () -> Unit,
    onRefresh: () -> Unit,
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
    BackHandler(enabled = !LocalAppNavigationHandlesBack.current, onBack = onDismiss)
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
    val isTablet = useTwoPaneLayout()
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
    val busy = state.busyAction == "google-accounts" || state.loading
    val context = LocalContext.current
    val selectedAccounts = accounts.filter { it.id in selectedAccountIds }

    val filterCounts = remember(accounts) {
        mapOf(
            FILTER_ALL to accounts.size,
            FILTER_UNREGISTERED to accounts.count { it.openAiStatus == OPENAI_UNREGISTERED },
            FILTER_REGISTERED to accounts.count { it.openAiStatus == OPENAI_REGISTERED },
            FILTER_ATTENTION to accounts.count { accountNeedsAttention(it) },
        )
    }

    val dark = isAppInDarkTheme()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .auroraBackdrop(dark)
            .imePadding(),
        contentPadding = appPageContentPadding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            AppSecondaryHeader(
                title = "Google 邮箱台账",
                subtitle = "记录主邮箱、别名和 OpenAI 使用状态",
                onBack = onDismiss,
                actions = {
                    AppHeaderIconButton(
                        icon = Icons.Outlined.Refresh,
                        contentDescription = "刷新邮箱台账",
                        onClick = onRefresh,
                        enabled = !busy,
                        loading = state.loading,
                    )
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

        state.error?.let { message ->
            item(key = "google-accounts-error") {
                AppFeedbackBanner(message, error = true, onRetry = onRefresh, autoDismissDurationMillis = null)
            }
        }

        item {
            DeskStatsDashboard(
                accountsCount = accounts.size,
                aliasesCount = aliases.size,
                registeredCount = accounts.count { it.openAiStatus == OPENAI_REGISTERED },
                pendingCount = accounts.count { it.openAiStatus != OPENAI_REGISTERED },
            )
        }

        item {
            AppSearchBar(
                query = query,
                onQueryChange = { query = it }, keyboardType = KeyboardType.Email)
        }

        item {
            StatusFilterRow(
                selected = filter,
                onSelect = { filter = it },
                counts = filterCounts,
            )
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

        if (state.loading && accounts.isEmpty()) {
            item(key = "google-accounts-loading") { GlassShimmerList() }
        } else if (sortedAccounts.isEmpty()) {
            item {
                AppPanel {
                    AppEmptyState(
                        if (accounts.isEmpty()) "还没有邮箱记录" else "没有匹配的邮箱",
                        detail = if (accounts.isEmpty()) "点击右上角添加一个 Google 主邮箱。" else "换一个筛选条件或搜索关键词。",
                    )
                }
            }
        } else if (isTablet) {
            // 平板双列卡片流
            val rows = sortedAccounts.chunked(2)
            items(rows, key = { it.first().id }, contentType = { "google-account-row" }) { rowAccounts ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    rowAccounts.forEach { account ->
                        Box(modifier = Modifier.weight(1f)) {
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
                    if (rowAccounts.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
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
