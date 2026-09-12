package cn.pxyb.mycontrol.ui.feature.google

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AlternateEmail
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Unarchive
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import cn.pxyb.mycontrol.data.GoogleAliasRecord
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppDialogSize
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton

@Composable
internal fun GoogleAccountDetailDialog(
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
        title = "邮箱详情",
        size = AppDialogSize.Form,
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
internal fun GoogleAccountDetail(
    account: GoogleAccountRecord,
    busy: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onToggleArchive: () -> Unit,
    onAddAlias: () -> Unit,
    onEditAlias: (GoogleAliasRecord) -> Unit,
    onDeleteAlias: (GoogleAliasRecord) -> Unit,
    scrollable: Boolean = true,
) {
    val clipboard = LocalClipboardManager.current
    val scrollState = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (scrollable) Modifier.verticalScroll(scrollState) else Modifier)
            .padding(horizontal = 18.dp, vertical = 18.dp),
    ) {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            account.primaryEmail,
                            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        AppHeaderIconButton(
                            icon = Icons.Outlined.ContentCopy,
                            contentDescription = "复制主邮箱",
                            onClick = { clipboard.setText(AnnotatedString(account.primaryEmail)) },
                        )
                    }
                    if (account.displayName.isNotBlank()) {
                        Text(account.displayName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
            ) {
                AppHeaderIconButton(Icons.Outlined.Edit, "编辑邮箱", onEdit, enabled = !busy)
                AppHeaderIconButton(Icons.Outlined.DeleteOutline, "删除邮箱", onDelete, enabled = !busy, iconTint = MaterialTheme.colorScheme.error)
                AppHeaderIconButton(
                    icon = if (account.archived) Icons.Outlined.Unarchive else Icons.Outlined.Archive,
                    contentDescription = if (account.archived) "恢复邮箱" else "归档邮箱",
                    onClick = onToggleArchive,
                    enabled = !busy,
                )
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
                    AppStatusBadge(accountStatusKey(account.emailStatus), accountStatusLabel(account.emailStatus))
                }
                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("OpenAI", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    AppStatusBadge(openAiStatusKey(account.openAiStatus), openAiStatusLabel(account.openAiStatus))
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
                AppEmptyState("暂无别名", detail = "可以添加一个 Gmail +tag 候选地址。")
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
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.End),
        ) {
            AppHeaderIconButton(Icons.Outlined.ContentCopy, "复制别名", onCopy, enabled = !busy)
            AppHeaderIconButton(Icons.Outlined.Edit, "编辑别名", onEdit, enabled = !busy)
            AppHeaderIconButton(Icons.Outlined.DeleteOutline, "删除别名", onDelete, enabled = !busy, iconTint = MaterialTheme.colorScheme.error)
        }
        Row(
            modifier = Modifier.padding(start = 29.dp, top = 7.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            AppStatusBadge(openAiStatusKey(alias.openAiStatus), "OpenAI：${openAiStatusLabel(alias.openAiStatus)}")
            alias.lastVerifiedAt?.let {
                Text("确认于 ${formatDeskTime(it)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 5.dp))
            }
        }
        if (alias.note.isNotBlank()) {
            Text(alias.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 29.dp, top = 4.dp))
        }
    }
}
