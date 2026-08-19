package cn.pxyb.mycontrol.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal fun quickActionColumnCount(maxWidth: Dp, fontScale: Float): Int = when {
    fontScale >= 1.3f || maxWidth < 360.dp -> 2
    maxWidth < 600.dp -> 3
    else -> 4
}

internal fun metricGridColumnCount(maxWidth: Dp, fontScale: Float, maxColumns: Int): Int = when {
    fontScale >= 1.3f || maxWidth < 360.dp -> minOf(2, maxColumns)
    maxWidth < 600.dp -> minOf(3, maxColumns)
    else -> maxColumns
}

internal fun unreadBadgeLabel(count: Int): String = when {
    count <= 0 -> ""
    count > 99 -> "99+"
    else -> count.toString()
}
