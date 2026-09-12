package cn.pxyb.mycontrol.ui.components.display

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.util.QrUtils

@Composable
fun AppQrCode(
    dataUrl: String?,
    contentDescription: String,
    modifier: Modifier = Modifier,
    size: Dp = 180.dp,
    errorMessage: String = "二维码加载失败",
) {
    val bitmap = remember(dataUrl) { QrUtils.decodeDataUrlToBitmap(dataUrl) }
    // 固定白底与留白，保证深色主题下二维码仍有可扫描的对比度。
    Surface(modifier = modifier.size(size), shape = AppCardShape, color = Color.White) {
        Box(modifier = Modifier.padding(12.dp), contentAlignment = Alignment.Center) {
            if (bitmap != null) {
                Image(bitmap = bitmap, contentDescription = contentDescription)
            } else {
                Text(errorMessage, color = Color.Black, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
            }
        }
    }
}
