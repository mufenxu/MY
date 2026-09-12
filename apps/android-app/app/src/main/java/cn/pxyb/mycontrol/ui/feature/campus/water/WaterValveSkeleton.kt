package cn.pxyb.mycontrol.ui.feature.campus.water

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.glassShimmer
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
internal fun WaterValveSkeletonList(
    count: Int = 2,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        repeat(count) {
            WaterValveSkeletonCard()
        }
    }
}

@Composable
private fun WaterValveSkeletonCard(
    modifier: Modifier = Modifier,
) {
    val dark = isAppInDarkTheme()
    val pulseTransition = rememberInfiniteTransition(label = "valveSkeletonPulse")
    val pulseAlpha by pulseTransition.animateFloat(
        initialValue = 0.32f,
        targetValue = 0.72f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 950, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "skeletonPulseAlpha",
    )

    AppPanel(
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 620.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 13.dp)
                .glassShimmer(dark),
            verticalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            // 1. 顶部 Header 骨架（与方案二头部完全一致）
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                // 拖拽手柄微光
                Box(
                    modifier = Modifier
                        .size(width = 19.dp, height = 12.dp)
                        .background(
                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.25f),
                            RoundedCornerShape(3.dp),
                        ),
                )
                // 32dp 设备圆角水滴底座微光
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.9f),
                            RoundedCornerShape(10.dp),
                        ),
                )
                // 标题与编号微光条
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.52f)
                            .height(15.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha),
                                RoundedCornerShape(4.dp),
                            ),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(0.3f)
                            .height(10.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.65f),
                                RoundedCornerShape(3.dp),
                            ),
                    )
                }
                // 状态指示小胶囊微光
                Box(
                    modifier = Modifier
                        .size(width = 56.dp, height = 26.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.75f),
                            CircleShape,
                        )
                        .border(
                            0.8.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                            CircleShape,
                        ),
                )
                // 删除按钮微光
                Box(
                    modifier = Modifier
                        .size(31.dp)
                        .background(
                            MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.6f),
                            CircleShape,
                        )
                        .border(
                            0.8.dp,
                            MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                            CircleShape,
                        ),
                )
            }

            // 2. 主体左右分栏骨架（左侧两块微卡，右侧 108dp 大圆盘中控罗盘骨架，完全对称方案二）
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                // 左侧两张微卡骨架
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    repeat(2) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.45f),
                            border = BorderStroke(
                                0.8.dp,
                                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.35f),
                            ),
                        ) {
                            Column(
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                verticalArrangement = Arrangement.spacedBy(5.dp),
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(width = 44.dp, height = 11.dp)
                                            .background(
                                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.28f),
                                                RoundedCornerShape(3.dp),
                                            ),
                                    )
                                    Box(
                                        modifier = Modifier
                                            .size(width = 36.dp, height = 9.dp)
                                            .background(
                                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.2f),
                                                RoundedCornerShape(3.dp),
                                            ),
                                    )
                                }
                                Box(
                                    modifier = Modifier
                                        .size(width = 68.dp, height = 18.dp)
                                        .background(
                                            MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.38f),
                                            RoundedCornerShape(4.dp),
                                        ),
                                )
                            }
                        }
                    }
                    // 设备状态小字骨架
                    Box(
                        modifier = Modifier
                            .padding(start = 2.dp)
                            .size(width = 115.dp, height = 11.dp)
                            .background(
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.22f),
                                RoundedCornerShape(3.dp),
                            ),
                    )
                }

                // 右侧大中控罗盘骨架（108dp 饱满圆形，方案二同款尺寸）
                Box(
                    modifier = Modifier.size(108.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(100.dp)
                            .background(
                                MaterialTheme.colorScheme.surfaceVariant.copy(alpha = pulseAlpha * 0.65f),
                                CircleShape,
                            )
                            .border(
                                2.dp,
                                MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f),
                                CircleShape,
                            ),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(24.dp)
                                    .background(
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.25f),
                                        CircleShape,
                                    ),
                            )
                            Box(
                                modifier = Modifier
                                    .size(width = 46.dp, height = 11.dp)
                                    .background(
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.3f),
                                        RoundedCornerShape(3.dp),
                                    ),
                            )
                            Box(
                                modifier = Modifier
                                    .size(width = 32.dp, height = 9.dp)
                                    .background(
                                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.2f),
                                        RoundedCornerShape(3.dp),
                                    ),
                            )
                        }
                    }
                }
            }

            // 3. 底部同步时间微光骨架
            Box(
                modifier = Modifier
                    .align(Alignment.End)
                    .size(width = 90.dp, height = 10.dp)
                    .background(
                        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = pulseAlpha * 0.2f),
                        RoundedCornerShape(3.dp),
                    ),
            )
        }
    }
}
