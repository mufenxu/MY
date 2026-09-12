package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.LibrarySeatArea
import cn.pxyb.mycontrol.data.LibrarySeatFloorSeat
import cn.pxyb.mycontrol.data.LibrarySeatStatus
import cn.pxyb.mycontrol.ui.components.display.AppMetricCell
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.theme.ColorTokens

@Composable
internal fun AreaCard(
    area: LibrarySeatArea,
    selected: Boolean,
    onClick: () -> Unit,
) {
    AppPanel(onClick = onClick) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Outlined.Chair,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                            tint = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Spacer(Modifier.width(6.dp))
                        Text(
                            text = area.name,
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = listOfNotNull(area.buildingName.takeIf(String::isNotBlank), area.floorName.takeIf(String::isNotBlank)).joinToString(" · "),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = "可用 ${area.seatFree}",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                AppMetricCell("总座位", area.seatTotal.toString(), Modifier.weight(1f))
                AppMetricCell("可预约", area.seatFree.toString(), Modifier.weight(1f))
                AppMetricCell("时长", if (area.maxMinute > 0) "${area.maxMinute / 60}h" else "--", Modifier.weight(1f))
            }
        }
    }
}

@Composable
internal fun SeatChip(
    seat: LibrarySeatStatus,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val container = when {
        selected && seat.isFree -> MaterialTheme.colorScheme.primaryContainer
        seat.isFree -> MaterialTheme.colorScheme.surface
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val contentColor = if (seat.isFree) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = container,
        contentColor = contentColor,
        border = BorderStroke(
            1.dp,
            when {
                selected && seat.isFree -> MaterialTheme.colorScheme.primary
                seat.isFree -> MaterialTheme.colorScheme.outlineVariant
                else -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f)
            },
        ),
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(enabled = seat.isFree, onClick = onClick),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = seat.label,
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = seat.statusText,
                style = MaterialTheme.typography.labelSmall,
                color = if (seat.isFree) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
internal fun SecondFloorSeatMap(
    floorSeats: List<LibrarySeatFloorSeat>,
    selectedLabels: Set<Int> = emptySet(),
    allowMissingSeats: Boolean = false,
    onSeatClick: (LibrarySeatFloorSeat) -> Unit,
) {
    val seatByLabel = remember(floorSeats) {
        floorSeats.groupBy { it.seat.label.toIntOrNull() }
            .mapValues { (_, entries) -> entries.first() }
    }
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(6.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        for (row in 0 until 9) {
            if (row == 3 || row == 6) SecondFloorWallRow()
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                for (col in 0 until 5) {
                    val label = row * 5 + col + 1
                    val floorSeat = seatByLabel[label]
                    SecondFloorSeatCell(
                        label = label,
                        floorSeat = floorSeat,
                        faceDown = col % 2 == 0,
                        selected = label in selectedLabels,
                        onClick = floorSeat?.let { seat -> { onSeatClick(seat) } }
                            ?: if (allowMissingSeats) {
                                {
                                    onSeatClick(
                                        LibrarySeatFloorSeat(
                                            areaId = "",
                                            areaName = "",
                                            seat = LibrarySeatStatus(
                                                id = label.toString(),
                                                label = label.toString(),
                                            ),
                                        )
                                    )
                                }
                            } else {
                                null
                            },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun SecondFloorSeatCell(
    label: Int,
    floorSeat: LibrarySeatFloorSeat?,
    faceDown: Boolean,
    selected: Boolean = false,
    onClick: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val seat = floorSeat?.seat
    val shape = RoundedCornerShape(7.dp)
    val background = when {
        selected -> MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)
        seat == null -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.30f)
        seat.isFree -> ColorTokens.Green.foreground.copy(alpha = 0.16f)
        seat.status.equals("IN_USE", ignoreCase = true) -> MaterialTheme.colorScheme.surfaceVariant
        else -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)
    }
    val borderColor = when {
        selected -> MaterialTheme.colorScheme.primary
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)
        seat.isFree -> ColorTokens.Green.foreground.copy(alpha = 0.8f)
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    val backColor = when {
        selected -> MaterialTheme.colorScheme.primary
        seat == null -> MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
        seat.isFree -> ColorTokens.Green.foreground
        else -> MaterialTheme.colorScheme.outlineVariant
    }
    Column(
        modifier = modifier
            .height(50.dp)
            .clip(shape)
            .background(background)
            .border(1.dp, borderColor, shape)
            .clickable(enabled = onClick != null, onClick = onClick ?: {}),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (faceDown) {
            SeatBackBar(backColor)
            SeatNumber(if (seat == null) label.toString() else seat.label, seat == null)
        } else {
            SeatNumber(if (seat == null) label.toString() else seat.label, seat == null)
            SeatBackBar(backColor)
        }
    }
}

@Composable
private fun SeatBackBar(color: Color) {
    Box(
        modifier = Modifier
            .width(26.dp)
            .height(10.dp)
            .clip(RoundedCornerShape(3.dp))
            .background(color),
    )
}

@Composable
private fun SeatNumber(text: String, empty: Boolean) {
    Text(
        text = text,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
        color = if (empty) MaterialTheme.colorScheme.outlineVariant else MaterialTheme.colorScheme.onSurface,
        maxLines = 1,
        modifier = Modifier.padding(vertical = 2.dp),
    )
}

@Composable
private fun SecondFloorWallRow() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        repeat(4) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(8.dp)
                    .clip(RoundedCornerShape(3.dp))
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.30f)),
            )
        }
        Spacer(Modifier.weight(1f))
    }
}

internal fun isSecondFloorName(name: String): Boolean {
    val normalized = name.trim()
    return normalized.contains("二层") ||
        normalized.contains("二楼") ||
        normalized.contains("2层") ||
        normalized.contains("2楼") ||
        normalized.startsWith("2")
}
