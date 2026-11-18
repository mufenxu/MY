package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.glassShimmer
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 标准骨架卡片 (GlassShimmerCard)
 * 表面直接复用 [AppPanel]，圆角、发丝描边与浅色柔和投影和数据卡片完全一致，
 * 只在卡内叠一层平滑扫过的微光。
 */
@Composable
fun GlassShimmerCard(
    modifier: Modifier = Modifier,
    height: Dp = 72.dp,
) {
    val dark = isAppInDarkTheme()
    AppPanel(modifier = modifier.height(height)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(height)
                .glassShimmer(dark),
        )
    }
}

/**
 * 列表微光骨架屏 (GlassShimmerList)
 * 一键生成指定数量的骨架卡片流，间距严格对齐 12.dp 规范，避免布局突兀跳动
 */
@Composable
fun GlassShimmerList(
    itemCount: Int = 3,
    modifier: Modifier = Modifier,
    itemHeight: Dp = 72.dp,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(itemCount) {
            GlassShimmerCard(height = itemHeight)
        }
    }
}
