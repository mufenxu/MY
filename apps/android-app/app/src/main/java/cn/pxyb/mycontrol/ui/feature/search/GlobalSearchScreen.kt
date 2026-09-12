package cn.pxyb.mycontrol.ui.feature.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Devices
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.AppLoadingState
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppSearchBar
import cn.pxyb.mycontrol.ui.components.filter.AppFilterChip
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.adaptiveGridColumnCount
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import kotlinx.coroutines.flow.first

@Composable
fun GlobalSearchScreen(
    state: GlobalSearchUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onSelect: (GlobalSearchItem) -> Unit,
    focusRequest: Int = 0,
) {
    var query by rememberSaveable { mutableStateOf("") }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    val searchFocus = remember { FocusRequester() }
    val listState = rememberLazyListState()
    LaunchedEffect(focusRequest) {
        listState.scrollToItem(0)
        snapshotFlow { listState.layoutInfo.visibleItemsInfo.any { it.key == "search-input" } }.first { it }
        searchFocus.requestFocus()
    }
    val categories = remember(state.items) { state.items.map { it.category }.distinct() }
    val results = remember(query, category, state.items) {
        val normalized = query.trim()
        val matches = if (normalized.isBlank()) {
            if (category != null) state.items else
            state.items.filter { it.featureRoute != null } + state.items.filter { it.featureRoute == null }.take(12)
        } else {
            state.items.filter { item ->
                item.title.contains(normalized, ignoreCase = true) ||
                    item.detail.contains(normalized, ignoreCase = true) ||
                    item.category.contains(normalized, ignoreCase = true)
            }
        }
        matches.filter { category == null || it.category == category }.take(100)
    }

    val columns = adaptiveGridColumnCount(
        maxWidth = appContentWidth() - AppPageHorizontalPadding * 2,
        fontScale = LocalDensity.current.fontScale,
        minCellWidth = 300.dp,
        maxColumns = 4,
    )

    AppSubPage(
        title = "全局搜索",
        subtitle = "功能入口、应用与个人数据",
        onBack = onBack,
        contentPadding = contentPadding,
        pinHeader = true,
        listState = listState,
        refreshing = state.refreshing,
    ) {
        item(key = "search-input") {
            AppSearchBar(
                modifier = Modifier.focusRequester(searchFocus),
                query = query,
                onQueryChange = { query = it },
                placeholder = "搜索功能、课程、设备或任务",
            )
        }
        item(key = "search-categories") {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppFilterChip("全部", selected = category == null, onClick = { category = null })
                categories.forEach { value ->
                    AppFilterChip(value, selected = category == value, onClick = { category = value })
                }
            }
        }
        if (state.refreshing && results.isEmpty()) {
            item(key = "search-shimmer") {
                GlassShimmerList(itemCount = if (columns > 1) 6 else 4, itemHeight = 64.dp)
            }
        } else if (state.refreshing) {
            item(key = "search-loading") {
                AppLoadingState("正在更新搜索数据")
            }
        }
        state.error?.let { message ->
            item(key = "search-error") {
                AppFeedbackBanner(message = message, error = true)
            }
        }
        if (results.isEmpty() && !state.refreshing) {
            item(key = "search-empty") {
                AppPanel {
                    AppEmptyState(
                        title = "没有匹配结果",
                        detail = "换个关键词试试",
                        icon = Icons.Outlined.Search,
                    )
                }
            }
        } else if (columns > 1) {
            val rows = results.chunked(columns)
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
                    repeat(columns - rowItems.size) {
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
            AppIconTile(
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
    SearchDestination.Overview, SearchDestination.Operations -> Icons.Outlined.Cloud
    SearchDestination.Notifications -> Icons.Outlined.Notifications
    SearchDestination.Tools -> Icons.Outlined.Devices
    SearchDestination.GoogleAccounts -> Icons.Outlined.Email
    SearchDestination.Today, SearchDestination.Timetable -> Icons.Outlined.CalendarMonth
    SearchDestination.Todos -> Icons.Outlined.Checklist
    SearchDestination.Scenes -> Icons.Outlined.Tune
}
