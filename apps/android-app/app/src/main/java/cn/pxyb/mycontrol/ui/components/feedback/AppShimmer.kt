package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.glassPanel
import cn.pxyb.mycontrol.ui.components.layout.glassShimmer
import cn.pxyb.mycontrol.ui.components.layout.rememberGlassPalette
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/**
 * 标准毛玻璃微光骨架卡片 (GlassShimmerCard)
 * 具备与 AppPanel 一致的 20.dp 圆角、发丝描边和毛玻璃底色，带有平滑扫过的流光动效
 */
@Composable
fun GlassShimmerCard(
    modifier: Modifier = Modifier,
    height: Dp = 72.dp,
    shape: RoundedCornerShape = RoundedCornerShape(20.dp),
) {
    val dark = isAppInDarkTheme()
    val glass = rememberGlassPalette(radius = 20.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .glassPanel(glass)
            .clip(shape)
            .glassShimmer(dark),
    )
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
