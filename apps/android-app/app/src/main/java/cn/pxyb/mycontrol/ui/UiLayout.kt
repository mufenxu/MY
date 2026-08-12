package cn.pxyb.mycontrol.ui

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

internal fun quickActionColumnCount(maxWidth: Dp, fontScale: Float): Int = when {
    fontScale >= 1.3f || maxWidth < 360.dp -> 2
    maxWidth < 600.dp -> 3
    else -> 4
}
