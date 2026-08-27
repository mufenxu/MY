package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Apartment
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.MeetingRoom
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.CampusFreeClassroomBuilding
import cn.pxyb.mycontrol.data.CampusFreeClassroomOption
import cn.pxyb.mycontrol.data.CampusFreeClassroomRoom
import cn.pxyb.mycontrol.data.CampusSectionTime
import java.time.LocalTime

private val fallbackBuildingOptions = listOf(
    CampusFreeClassroomOption("study", "自习常用楼"),
    CampusFreeClassroomOption("203", "教一"),
    CampusFreeClassroomOption("205", "教二"),
    CampusFreeClassroomOption("202", "实验楼"),
    CampusFreeClassroomOption("201", "图书馆"),
    CampusFreeClassroomOption("111", "1号学院楼"),
    CampusFreeClassroomOption("112", "2号学院楼"),
    CampusFreeClassroomOption("701", "综合楼"),
    CampusFreeClassroomOption("all", "全部新校区"),
)

private val fallbackSectionTimes = listOf(
    CampusSectionTime(1, "08:00", "08:45"),
    CampusSectionTime(2, "08:50", "09:35"),
    CampusSectionTime(3, "09:50", "10:35"),
    CampusSectionTime(4, "10:40", "11:25"),
    CampusSectionTime(5, "11:30", "12:15"),
    CampusSectionTime(6, "14:00", "14:45"),
    CampusSectionTime(7, "14:50", "15:35"),
    CampusSectionTime(8, "15:50", "16:35"),
    CampusSectionTime(9, "16:40", "17:25"),
    CampusSectionTime(10, "17:30", "18:15"),
    CampusSectionTime(11, "19:00", "19:45"),
    CampusSectionTime(12, "19:50", "20:35"),
)

@Composable
fun FreeClassroomScreen(
    state: FreeClassroomUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onQuery: (Int, List<Int>, String) -> Unit,
) {
    val initialSections = remember { currentSectionPreset() }
    var dayplus by rememberSaveable { mutableIntStateOf(0) }
    var building by rememberSaveable { mutableStateOf("study") }
    var sectionMask by rememberSaveable { mutableIntStateOf(sectionsToMask(initialSections)) }
    val selectedSections = remember(sectionMask) { sectionsFromMask(sectionMask) }
    val result = state.result
    val sectionTimes = result?.sectionTimes?.takeIf(List<CampusSectionTime>::isNotEmpty) ?: fallbackSectionTimes
    val buildingOptions = remember(result?.buildingOptions) {
        val remoteByValue = result?.buildingOptions.orEmpty().associateBy(CampusFreeClassroomOption::value)
        fallbackBuildingOptions.map { remoteByValue[it.value] ?: it }
    }
    val selectedBuildingName = buildingOptions.firstOrNull { it.value == building }?.name ?: "自习常用楼"

    LaunchedEffect(Unit) {
        onQuery(dayplus, selectedSections, building)
    }

    val adaptive = LocalAdaptiveWindow.current
    val isTablet = adaptive.isTabletOrExpanded
    val roomColumns = if (isTablet) 4 else 2

    WorkspacePage(
        title = "空教室查询",
        subtitle = listOfNotNull(
            result?.dayLabel,
            result?.date,
            result?.weekday,
        ).joinToString(" · ").ifBlank { "新校区空闲教室" },
        contentPadding = contentPadding,
        onBack = onBack,
        refreshing = state.refreshing,
        onRefresh = { onQuery(dayplus, selectedSections, building) },
    ) {
        item(key = "free-room-filters", contentType = "filters") {
            FreeClassroomFilters(
                dayplus = dayplus,
                building = building,
                selectedBuildingName = selectedBuildingName,
                buildingOptions = buildingOptions,
                sectionTimes = sectionTimes,
                sectionMask = sectionMask,
                refreshing = state.refreshing,
                onDayChange = { value ->
                    dayplus = value
                    onQuery(value, sectionsFromMask(sectionMask), building)
                },
                onBuildingChange = { value ->
                    building = value
                    onQuery(dayplus, sectionsFromMask(sectionMask), value)
                },
                onSectionMaskChange = { sectionMask = it },
                onPreset = { sections ->
                    sectionMask = sectionsToMask(sections)
                    onQuery(dayplus, sections, building)
                },
                onQuery = { onQuery(dayplus, sectionsFromMask(sectionMask), building) },
            )
        }

        state.error?.let { message ->
            item(key = "free-room-error", contentType = "banner") {
                FeedbackBanner(
                    message = if (message.contains("登录") || message.contains("会话")) {
                        "学校账号登录已失效，请重新登录后再查询。"
                    } else {
                        "空教室查询失败：$message"
                    },
                    error = true,
                )
            }
        }

        if (result == null && state.refreshing) {
            item(key = "free-room-loading", contentType = "loading") {
                AppPanel {
                    Row(
                        modifier = Modifier.padding(20.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("正在查询空闲教室", style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        }

        result?.let { data ->
            item(key = "free-room-result-title", contentType = "section") {
                SectionHeader(
                    title = "查询结果",
                    subtitle = listOfNotNull(
                        data.building?.name,
                        sectionRangeText(data.sections.ifEmpty { selectedSections }, data.sectionTimes.ifEmpty { sectionTimes }),
                    ).joinToString(" · "),
                )
            }
            item(key = "free-room-stats", contentType = "summary") {
                FreeClassroomStats(
                    buildings = data.buildingCount ?: data.buildings.size,
                    rooms = data.rooms ?: data.buildings.sumOf(CampusFreeClassroomBuilding::roomCount),
                    seats = data.seats ?: data.buildings.sumOf(CampusFreeClassroomBuilding::seats),
                )
            }

            if (data.buildings.isEmpty() && !state.refreshing) {
                item(key = "free-room-empty", contentType = "empty") {
                    EmptyBlock("当前条件下暂无空闲教室", "可以更换楼宇、日期或节次后重新查询。")
                }
            }

            data.buildings.forEach { item ->
                item(key = "building-${item.number}", contentType = "building") {
                    FreeClassroomBuildingHeader(item)
                }
                items(
                    items = item.rooms.chunked(roomColumns),
                    key = { rooms -> "rooms-${item.number}-${rooms.joinToString("-") { it.room }}" },
                    contentType = { "rooms" },
                ) { rooms ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        rooms.forEach { room ->
                            FreeClassroomRoomCard(room, Modifier.weight(1f))
                        }
                        repeat(roomColumns - rooms.size) {
                            Spacer(Modifier.weight(1f))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FreeClassroomFilters(
    dayplus: Int,
    building: String,
    selectedBuildingName: String,
    buildingOptions: List<CampusFreeClassroomOption>,
    sectionTimes: List<CampusSectionTime>,
    sectionMask: Int,
    refreshing: Boolean,
    onDayChange: (Int) -> Unit,
    onBuildingChange: (String) -> Unit,
    onSectionMaskChange: (Int) -> Unit,
    onPreset: (List<Int>) -> Unit,
    onQuery: () -> Unit,
) {
    var buildingMenuOpen by remember { mutableStateOf(false) }
    AppPanel {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            SectionHeader("筛选条件", "选择日期、楼宇和需要连续空闲的节次")
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                listOf("今天", "明天", "后天").forEachIndexed { index, label ->
                    FilterChip(
                        selected = dayplus == index,
                        onClick = { onDayChange(index) },
                        label = { Text(label) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            Box(modifier = Modifier.fillMaxWidth()) {
                Surface(
                    onClick = { buildingMenuOpen = true },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.Apartment, contentDescription = null, modifier = Modifier.size(19.dp))
                        Text(
                            selectedBuildingName,
                            modifier = Modifier.padding(start = 10.dp).weight(1f),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Icon(Icons.Outlined.ExpandMore, contentDescription = "选择教学楼")
                    }
                }
                DropdownMenu(
                    expanded = buildingMenuOpen,
                    onDismissRequest = { buildingMenuOpen = false },
                ) {
                    buildingOptions.forEach { option ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    option.name,
                                    fontWeight = if (option.value == building) FontWeight.Bold else FontWeight.Normal,
                                )
                            },
                            onClick = {
                                buildingMenuOpen = false
                                onBuildingChange(option.value)
                            },
                        )
                    }
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("选择节次", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    listOf(
                        "当前" to currentSectionPreset(),
                        "上午" to (1..5).toList(),
                        "下午" to (6..10).toList(),
                        "晚上" to listOf(11, 12),
                    ).forEach { (label, sections) ->
                        FilterChip(
                            selected = sectionsFromMask(sectionMask) == sections,
                            onClick = { onPreset(sections) },
                            label = { Text(label) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                sectionTimes.sortedBy(CampusSectionTime::section).chunked(4).forEach { rowSections ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        rowSections.forEach { item ->
                            val selected = sectionMask and (1 shl (item.section - 1)) != 0
                            Surface(
                                onClick = {
                                    val changed = sectionMask xor (1 shl (item.section - 1))
                                    if (changed != 0) onSectionMaskChange(changed)
                                },
                                modifier = Modifier.weight(1f).height(58.dp),
                                shape = RoundedCornerShape(8.dp),
                                color = if (selected) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                                },
                                border = BorderStroke(
                                    1.dp,
                                    if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant,
                                ),
                            ) {
                                Column(
                                    horizontalAlignment = Alignment.CenterHorizontally,
                                    verticalArrangement = Arrangement.Center,
                                ) {
                                    Text(
                                        "第${item.section}节",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.Bold,
                                    )
                                    Text(
                                        item.start,
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }
            }

            Text(
                sectionRangeText(sectionsFromMask(sectionMask), sectionTimes),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(
                onClick = onQuery,
                enabled = !refreshing,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
            ) {
                if (refreshing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(18.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Icon(Icons.Outlined.Search, contentDescription = null, modifier = Modifier.size(19.dp))
                }
                Text(if (refreshing) "查询中" else "查询空教室", modifier = Modifier.padding(start = 8.dp))
            }
        }
    }
}

@Composable
private fun FreeClassroomStats(buildings: Int, rooms: Int, seats: Int) {
    AppPanel {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            FreeClassroomMetric(Icons.Outlined.Apartment, "开放楼宇", buildings, "栋", Modifier.weight(1f))
            FreeClassroomMetric(Icons.Outlined.MeetingRoom, "空闲教室", rooms, "间", Modifier.weight(1f))
            FreeClassroomMetric(Icons.Outlined.Chair, "空余座位", seats, "个", Modifier.weight(1f))
        }
    }
}

@Composable
private fun FreeClassroomMetric(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: Int,
    unit: String,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            "$value $unit",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun FreeClassroomBuildingHeader(building: CampusFreeClassroomBuilding) {
    AppPanel {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            IconTile(Icons.Outlined.Apartment, Color(0xFF047857), Color(0xFFD1FAE5))
            Column(modifier = Modifier.weight(1f)) {
                Text(building.name.ifBlank { "教学楼" }, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    building.number.takeIf(String::isNotBlank)?.let { "楼宇编号 $it" } ?: "新校区",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${building.roomCount} 间", fontWeight = FontWeight.Bold, color = Color(0xFF047857))
                Text("${building.seats} 座", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun FreeClassroomRoomCard(room: CampusFreeClassroomRoom, modifier: Modifier = Modifier) {
    AppPanel(modifier = modifier) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Text(
                room.room.ifBlank { "教室待同步" },
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                listOfNotNull(
                    room.floor?.takeIf(String::isNotBlank),
                    room.seats?.let { "$it 座" },
                ).joinToString(" · ").ifBlank { "可用" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

private fun currentSectionPreset(now: LocalTime = LocalTime.now()): List<Int> = when {
    !now.isAfter(LocalTime.of(9, 35)) -> listOf(1, 2)
    !now.isAfter(LocalTime.of(12, 15)) -> listOf(3, 4, 5)
    !now.isAfter(LocalTime.of(15, 35)) -> listOf(6, 7)
    !now.isAfter(LocalTime.of(18, 15)) -> listOf(8, 9, 10)
    else -> listOf(11, 12)
}

private fun sectionsToMask(sections: List<Int>): Int = sections
    .filter { it in 1..12 }
    .fold(0) { mask, section -> mask or (1 shl (section - 1)) }

private fun sectionsFromMask(mask: Int): List<Int> = (1..12).filter { section ->
    mask and (1 shl (section - 1)) != 0
}.ifEmpty { listOf(11, 12) }

private fun sectionRangeText(sections: List<Int>, sectionTimes: List<CampusSectionTime>): String {
    val selected = sections.filter { it in 1..12 }.distinct().sorted()
    if (selected.isEmpty()) return "--"
    val bySection = sectionTimes.associateBy(CampusSectionTime::section)
    val start = bySection[selected.first()]?.start
    val end = bySection[selected.last()]?.end
    val range = if (!start.isNullOrBlank() && !end.isNullOrBlank()) " · $start-$end" else ""
    return "第${selected.joinToString(",")}节$range"
}
