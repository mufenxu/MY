package cn.pxyb.mycontrol.ui.components.glass

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.unit.IntSize

/**
 * 液态玻璃的取样状态。
 *
 * 底栏需要看到"背后真实内容"的模糊结果，而 Compose 无法直接对兄弟节点做背景模糊，
 * 因此把被取样的内容录进一个可复用的图形层，再由玻璃层按底栏位置取样。
 * 仅在 API 31+（RenderEffect 可用）启用，低版本由调用方退化为半透明表面。
 */
@Stable
class GlassBackdropState internal constructor(
    internal val layer: GraphicsLayer,
) {
    internal var originInRoot by mutableStateOf(Offset.Zero)
    internal var sizePx by mutableStateOf(IntSize.Zero)

    internal val isReady: Boolean get() = sizePx.width > 0 && sizePx.height > 0
}

@Composable
fun rememberGlassBackdrop(): GlassBackdropState {
    val layer = rememberGraphicsLayer()
    return remember(layer) { GlassBackdropState(layer) }
}

/** 标记被玻璃取样的内容：内容照常绘制，同时录入图形层供玻璃层取样。 */
fun Modifier.glassBackdropSource(state: GlassBackdropState): Modifier {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return this
    return this
        .onGloballyPositioned { coordinates ->
            state.originInRoot = coordinates.positionInRoot()
            state.sizePx = coordinates.size
        }
        .drawWithContent {
            state.layer.record { this@drawWithContent.drawContent() }
            drawLayer(state.layer)
        }
}
