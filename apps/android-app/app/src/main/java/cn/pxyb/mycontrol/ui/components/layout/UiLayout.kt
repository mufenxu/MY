package cn.pxyb.mycontrol.ui.components.layout

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal fun quickActionColumnCount(maxWidth: Dp, fontScale: Float): Int = when {
    fontScale >= 1.3f || maxWidth < 340.dp -> 3
    maxWidth < 600.dp -> 4
    else -> 5
}

internal fun metricGridColumnCount(maxWidth: Dp, fontScale: Float, maxColumns: Int): Int = when {
    fontScale >= 1.3f || maxWidth < 360.dp -> minOf(2, maxColumns)
    maxWidth < 600.dp -> minOf(3, maxColumns)
    else -> maxColumns
}

internal fun adaptiveGridColumnCount(
    maxWidth: Dp,
    fontScale: Float,
    minCellWidth: Dp,
    maxColumns: Int,
    spacing: Dp = 12.dp,
): Int = ((maxWidth + spacing) / (minCellWidth * fontScale.coerceAtLeast(1f) + spacing))
    .toInt()
    .coerceIn(1, maxColumns)

internal fun unreadBadgeLabel(count: Int): String = when {
    count <= 0 -> ""
    count > 99 -> "99+"
    else -> count.toString()
}

internal fun <T> LazyListScope.appGridItems(
    values: List<T>,
    columns: Int,
    itemKey: (T) -> Any,
    contentType: String,
    itemContent: @Composable (T) -> Unit,
) {
    val rows = values.chunked(columns)
    items(
        count = rows.size,
        key = { index -> "$contentType:${itemKey(rows[index].first())}" },
        contentType = { contentType },
    ) { index ->
        val row = rows[index]
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            row.forEach { value ->
                key(itemKey(value)) {
                    Box(Modifier.weight(1f)) { itemContent(value) }
                }
            }
            repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
        }
    }
}
