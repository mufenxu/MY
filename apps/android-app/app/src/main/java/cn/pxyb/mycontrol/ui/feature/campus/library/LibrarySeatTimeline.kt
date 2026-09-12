package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatTimeline

/** 座位当日可用时段条：主色区间为可预约时段，竖线为已占用时段分界。 */
@Composable
internal fun SeatAvailabilityTimeline(
    timeline: LibrarySeatTimeline,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            val barWidth = maxWidth
            timeline.free.forEach { slice ->
                Box(
                    modifier = Modifier
                        .offset(x = barWidth * (slice.left / 100f))
                        .width(barWidth * (slice.width / 100f))
                        .height(14.dp)
                        .background(MaterialTheme.colorScheme.primary),
                )
            }
            timeline.marks.forEach { mark ->
                Box(
                    modifier = Modifier
                        .offset(x = barWidth * (mark.left / 100f))
                        .width(2.dp)
                        .height(14.dp)
                        .background(MaterialTheme.colorScheme.outline),
                )
            }
        }
        val summary = when {
            loading -> "正在读取该座位的可用时段…"
            timeline.isEmpty -> "暂无该座位的时段数据，可直接按所选时间提交预约。"
            else -> "可预约 ${timeline.free.size} 段 · 已占用 ${timeline.marks.size} 处 · 绿色为可预约"
        }
        Text(
            text = summary,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
