package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

@Composable
fun GlobalSearchScreen(
    state: GlobalSearchUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onSelect: (GlobalSearchItem) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val results = remember(query, state.items) {
        val normalized = query.trim()
        if (normalized.isBlank()) {
            state.items.take(20)
        } else {
            state.items.filter { item ->
                item.title.contains(normalized, ignoreCase = true) ||
                    item.detail.contains(normalized, ignoreCase = true) ||
                    item.category.contains(normalized, ignoreCase = true)
            }.take(100)
        }
    }

    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded

    AppSubPage(
        title = "全局搜索",
        subtitle = "应用、服务、任务、课程、设备与资源",
        onBack = onBack,
        contentPadding = contentPadding,
        pinHeader = true,
        refreshing = state.refreshing,
        modifier = Modifier.imePadding(),
    ) {
        item(key = "search-input") {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("搜索名称、状态或内容") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = "搜索") },
                singleLine = true,
                shape = AppSearchFieldShape,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
                    unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
                ),
            )
        }
        if (state.refreshing) {
            item(key = "search-loading") {
                LoadingBlock("正在更新搜索数据")
            }
        }
        state.error?.let { message ->
            item(key = "search-error") {
                FeedbackBanner(message = message, error = true)
            }
        }
        if (results.isEmpty() && !state.refreshing) {
            item(key = "search-empty") {
                AppPanel { EmptyBlock("没有匹配结果", "换个关键词试试") }
            }
        } else if (isTablet) {
            // 平板双列卡片流
            val rows = results.chunked(2)
            items(rows, key = { it.first().id }, contentType = { "search-result-row" }) { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    rowItems.forEach { item ->
                        Box(modifier = Modifier.weight(1f)) {
                            SearchResultRow(item = item, onClick = { onSelect(item) })
                        }
                    }
                    if (rowItems.size == 1) {
                        Spacer(modifier = Modifier.weight(1f))
                    }
                }
            }
        } else {
            items(results, key = GlobalSearchItem::id, contentType = { "search-result" }) { item ->
                SearchResultRow(item = item, onClick = { onSelect(item) })
            }
        }
    }
}

@Composable
private fun SearchResultRow(item: GlobalSearchItem, onClick: () -> Unit) {
    AppPanel(onClick = onClick) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            IconTile(
                icon = searchResultIcon(item.destination),
                tint = MaterialTheme.colorScheme.primary,
                background = MaterialTheme.colorScheme.primaryContainer,
                modifier = Modifier.size(38.dp),
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(item.category, item.detail).filter(String::isNotBlank).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(Icons.Outlined.ChevronRight, contentDescription = "打开", tint = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

private fun searchResultIcon(destination: SearchDestination): ImageVector = when (destination) {
    SearchDestination.Overview -> Icons.Outlined.Cloud
    SearchDestination.Notifications -> Icons.Outlined.Notifications
    SearchDestination.Tools -> Icons.Outlined.Devices
    SearchDestination.GoogleAccounts -> Icons.Outlined.Email
    SearchDestination.Today -> Icons.Outlined.CalendarMonth
    SearchDestination.Scenes -> Icons.Outlined.Tune
}
