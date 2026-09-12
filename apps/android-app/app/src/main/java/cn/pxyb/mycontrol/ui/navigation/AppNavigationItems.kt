package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.ui.graphics.vector.ImageVector

internal data class TabItem(val tab: MainTab, val label: String, val icon: ImageVector)

internal val appNavigationTabs = listOf(
    TabItem(MainTab.Overview, "今日", Icons.Outlined.Home),
    TabItem(MainTab.Operations, "状态", Icons.Outlined.Settings),
    TabItem(MainTab.Tools, "设备", Icons.Outlined.Hub),
    TabItem(MainTab.Profile, "我的", Icons.Outlined.Person),
)
