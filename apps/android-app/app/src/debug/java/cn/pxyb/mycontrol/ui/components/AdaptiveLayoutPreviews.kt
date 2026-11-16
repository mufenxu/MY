package cn.pxyb.mycontrol.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AppAdaptivePanes
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSectionColumns
import cn.pxyb.mycontrol.ui.components.layout.AppWorkspaceContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.components.layout.ProvideAdaptiveWindowContext
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.navigation.AppNavigationRail
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.theme.MYControlTheme

// 大屏骨架预览：盯住导航轨切换点、分区双列与列表-详情双栏在各档宽度和大字号下的回落。
@Preview(name = "中等宽度 · 平板竖屏", widthDp = 700, heightDp = 1000)
@Preview(name = "展开宽度 · 平板横屏", widthDp = 1280, heightDp = 800)
@Preview(name = "展开宽度 · 大字号", widthDp = 1280, heightDp = 800, fontScale = 1.5f)
@Preview(name = "展开宽度 · 矮窗口", widthDp = 900, heightDp = 420)
@Composable
private fun LightAdaptiveShellPreview() = AdaptiveShellPreview(dark = false)

@Preview(name = "深色 · 平板横屏", widthDp = 1280, heightDp = 800)
@Composable
private fun DarkAdaptiveShellPreview() = AdaptiveShellPreview(dark = true)

@Composable
private fun AdaptiveShellPreview(dark: Boolean) {
    MYControlTheme(darkTheme = dark) {
        Surface(color = MaterialTheme.colorScheme.background) {
            ProvideAdaptiveWindowContext {
                val window = LocalAdaptiveWindow.current
                Row(Modifier.fillMaxSize()) {
                    if (window.usesNavigationRail) {
                        AppNavigationRail(
                            selectedTab = MainTab.Overview,
                            onSelectTab = {},
                            unreadAlerts = 128,
                            onOpenNotifications = {},
                            onOpenSearch = {},
                            onOpenQrLogin = {},
                            onOpenSettings = {},
                        )
                    }
                    ProvideAppContentLayout(
                        modifier = Modifier.weight(1f).fillMaxHeight().padding(16.dp),
                        contentMaxWidth = AppWorkspaceContentMaxWidth,
                    ) {
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(
                                "窗口 ${window.widthSizeClass} / ${window.heightSizeClass} · 内容宽度 ${appContentWidth()}",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            AppSectionColumns(
                                leadingWeight = 1.4f,
                                leading = { PreviewCard("主分区", "宽度足够时与右侧分区并排，否则上下排列。") },
                                trailing = { PreviewCard("辅助分区", "大字号会抬高双列阈值，避免文字被挤压。") },
                            )
                            AppAdaptivePanes(
                                showDetail = false,
                                modifier = Modifier.weight(1f),
                                listPane = { PreviewCard("列表栏", "双栏时固定在左侧，单栏时占满整行。") },
                                detailPane = { PreviewCard("详情栏", "只有双栏或已选中条目时显示。") },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PreviewCard(title: String, detail: String) {
    AppPanel(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
