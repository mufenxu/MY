package cn.pxyb.mycontrol.util

import android.graphics.BitmapFactory
import android.util.Base64
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap

/**
 * 二维码与图片 Base64 Data URL 编解码通用工具
 */
object QrUtils {

    /**
     * 将 "data:image/...;base64,..." 格式的 Data URL 字符串解析为 Compose 的 ImageBitmap。
     * 解析失败或格式不正确时安全返回 null，不抛出异常。
     */
    fun decodeDataUrlToBitmap(dataUrl: String?): ImageBitmap? {
        if (dataUrl.isNullOrBlank()) return null
        val commaIndex = dataUrl.indexOf(',')
        if (commaIndex < 0) return null
        val base64Part = dataUrl.substring(commaIndex + 1).trim()
        if (base64Part.isEmpty()) return null

        return try {
            val bytes = Base64.decode(base64Part, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            bitmap?.asImageBitmap()
        } catch (_: Throwable) {
            null
        }
    }
}
