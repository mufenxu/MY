package cn.pxyb.mycontrol.util

import java.io.ByteArrayOutputStream
import java.io.InputStream

internal fun InputStream.readBoundedBytes(limit: Int): ByteArray {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (output.size() <= limit) {
        val count = read(buffer, 0, minOf(buffer.size, limit + 1 - output.size()))
        if (count < 0) break
        if (count == 0) break
        output.write(buffer, 0, count)
    }
    require(output.size() <= limit) { "文件超过大小限制，请裁剪或精简后重试。" }
    return output.toByteArray()
}
