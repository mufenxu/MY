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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatTimeline
import cn.pxyb.mycontrol.ui.theme.ColorTokens

/** 座位当日可用时段条：绿色区间为可预约时段，红色为已占用，竖线为时段分界，下方为官方返回的时刻刻度。 */
@Composable
internal fun SeatAvailabilityTimeline(
    timeline: LibrarySeatTimeline,
    loading: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .height(14.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(ColorTokens.Red.foreground.copy(alpha = 0.55f)),
        ) {
            val barWidth = maxWidth
            timeline.free.forEach { slice ->
                Box(
                    modifier = Modifier
                        .offset(x = barWidth * (slice.left / 100f))
                        .width(barWidth * (slice.width / 100f))
                        .height(14.dp)
                        .background(ColorTokens.Green.foreground),
                )
            }
            timeline.marks.forEach { mark ->
                Box(
                    modifier = Modifier
                        .offset(x = (barWidth * (mark.left / 100f) - 1.dp).coerceIn(0.dp, (barWidth - 2.dp).coerceAtLeast(0.dp)))
                        .width(2.dp)
                        .height(14.dp)
                        .background(MaterialTheme.colorScheme.surface),
                )
            }
        }
        val labeledMarks = timeline.marks.filter { it.label.isNotBlank() }
        if (labeledMarks.isNotEmpty()) {
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(15.dp),
            ) {
                val slotWidth = 44.dp
                val barWidth = maxWidth
                val maxOffset = (barWidth - slotWidth).coerceAtLeast(0.dp)
                labeledMarks.forEach { mark ->
                    val center = barWidth * (mark.left.coerceIn(0f, 100f) / 100f)
                    Text(
                        text = mark.label,
                        modifier = Modifier
                            .offset(x = (center - slotWidth / 2).coerceIn(0.dp, maxOffset))
                            .width(slotWidth),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                        overflow = TextOverflow.Clip,
                    )
                }
            }
        }
        val summary = when {
            loading -> "正在读取该座位的可用时段…"
            timeline.isEmpty -> "暂无该座位的时段数据，可直接按所选时间提交预约。"
            else -> "绿色 = 可预约 · 红色 = 已占用 · 可预约 ${timeline.free.size} 段"
        }
        Text(
            text = summary,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
