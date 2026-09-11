package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/**
 * 统一加载占位（AppLoadingState）
 *
 * 替代系统默认菊花：极光轨道加载环 + 呼吸脉冲文案，深浅色自适应，可嵌入卡片、弹窗与列表任意容器。
 * 长列表与首屏优先使用同构骨架屏（AppSkeletonList / AppSkeletonInlineRows）。
 */
@Composable
fun AppLoadingState(
    label: String,
    modifier: Modifier = Modifier,
) {
    val pulse = rememberSkeletonPulse(minAlpha = 0.5f, maxAlpha = 1f, durationMillis = 980)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppOrbitLoader(size = 34.dp, strokeWidth = 3.dp)
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulse),
        )
    }
}