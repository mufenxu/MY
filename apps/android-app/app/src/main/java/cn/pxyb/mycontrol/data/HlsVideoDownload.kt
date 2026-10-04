package cn.pxyb.mycontrol.data

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.math.BigInteger
import java.net.URI
import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Dispatcher
import okhttp3.Request
import okhttp3.Response

internal class HlsDownloadException(message: String) : IOException(message)

internal data class HlsSegment(val url: String, val keyUrl: String?, val iv: ByteArray)

internal fun parseHlsSegments(text: String, playlistUrl: String): List<HlsSegment> {
  if (!text.trimStart().startsWith("#EXTM3U")) {
    throw HlsDownloadException("播放链接已失效或无法访问，请重新解析。")
  }
  val lines = text.lineSequence().map(String::trim).filter(String::isNotEmpty).toList()
  if ("#EXT-X-ENDLIST" !in lines) throw HlsDownloadException("暂不支持直播，请使用完整视频链接。")
  if (lines.any { line -> listOf("#EXT-X-MAP:", "#EXT-X-BYTERANGE:", "#EXT-X-DISCONTINUITY", "#EXT-X-STREAM-INF:", "#EXT-X-GAP").any(line::startsWith) }) {
    throw HlsDownloadException("此视频的分片格式暂不支持合并。")
  }
  val base = URI(playlistUrl)
  fun resolve(value: String): String {
    val uri = base.resolve(value)
    if (uri.scheme !in setOf("https", "http") || uri.host.isNullOrBlank() || uri.userInfo != null) {
      throw HlsDownloadException("视频分片地址无效。")
    }
    return uri.toASCIIString()
  }
  var sequence = 0L
  var keyUrl: String? = null
  var explicitIv: ByteArray? = null
  var expectingSegment = false
  val segments = mutableListOf<HlsSegment>()
  for (line in lines) {
    when {
      line.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> sequence = line.substringAfter(':').toLong().also {
        if (it < 0) throw HlsDownloadException("视频分片序号无效。")
      }
      line.startsWith("#EXT-X-KEY:") -> {
        val attributes = Regex("([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)").findAll(line.substringAfter(':'))
          .associate { it.groupValues[1] to it.groupValues[2].removeSurrounding("\"") }
        when (attributes["METHOD"]) {
          "NONE" -> { keyUrl = null; explicitIv = null }
          "AES-128" -> {
            if (attributes["KEYFORMAT"]?.let { it != "identity" } == true) {
              throw HlsDownloadException("不支持此视频的加密格式。")
            }
            keyUrl = resolve(attributes["URI"] ?: throw HlsDownloadException("视频缺少解密地址。"))
            explicitIv = attributes["IV"]?.let { value ->
              val hex = value.removePrefix("0x").removePrefix("0X")
              if (!hex.matches(Regex("[0-9a-fA-F]{1,32}"))) throw HlsDownloadException("视频解密参数无效。")
              hex.padStart(32, '0').chunked(2).map { it.toInt(16).toByte() }.toByteArray()
            }
          }
          else -> throw HlsDownloadException("不支持此视频的加密格式。")
        }
      }
      line.startsWith("#EXTINF:") -> expectingSegment = true
      !line.startsWith('#') -> {
        if (!expectingSegment) throw HlsDownloadException("视频分片列表不完整。")
        val iv = explicitIv ?: ByteArray(16).also { bytes ->
          val number = BigInteger.valueOf(sequence).toByteArray()
          number.copyInto(bytes, 16 - number.size)
        }
        segments += HlsSegment(resolve(line), keyUrl, iv)
        sequence++
        expectingSegment = false
      }
    }
  }
  if (segments.isEmpty() || expectingSegment) throw HlsDownloadException("没有找到完整的视频分片。")
  return segments
}

internal class HlsVideoDownload(private val headers: Map<String, String>) {
  private companion object {
    const val SEGMENT_CONCURRENCY = 6
    // 下载独立排队，保留共享客户端的连接池、超时与证书配置。
    val client by lazy {
      HttpClientProvider.newBuilder().dispatcher(Dispatcher().apply {
        maxRequests = SEGMENT_CONCURRENCY
        maxRequestsPerHost = SEGMENT_CONCURRENCY
      }).build()
    }
  }

  private suspend fun fetch(url: String, limit: Int): Pair<String, ByteArray> = suspendCancellableCoroutine { continuation ->
    val request = Request.Builder().url(url).apply {
      headers.filterKeys { it.lowercase() in setOf("referer", "user-agent", "origin") }
        .forEach { (name, value) -> header(name, value) }
    }.build()
    val call = client.newCall(request)
    continuation.invokeOnCancellation { call.cancel() }
    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        if (continuation.isActive) continuation.resumeWithException(HlsDownloadException("视频下载中断，请检查网络后重新下载。"))
      }

      override fun onResponse(call: Call, response: Response) {
        try {
          val result = response.use {
            if (!it.isSuccessful) throw HlsDownloadException("视频源返回 ${it.code}，请重新解析链接后下载。")
            val body = it.body ?: throw HlsDownloadException("视频源返回空内容。")
            val bytes = ByteArrayOutputStream()
            body.byteStream().use { input ->
              val buffer = ByteArray(32 * 1024)
              while (continuation.isActive) {
                val count = input.read(buffer)
                if (count < 0) break
                if (bytes.size() + count > limit) throw HlsDownloadException("视频分片过大，暂时无法处理。")
                bytes.write(buffer, 0, count)
              }
            }
            it.request.url.toString() to bytes.toByteArray()
          }
          if (continuation.isActive) continuation.resume(result)
        } catch (error: Exception) {
          if (continuation.isActive) continuation.resumeWithException(error)
        }
      }
    })
  }

  suspend fun download(url: String, destination: File, onProgress: suspend (Int, Int) -> Unit) = coroutineScope {
    val (playlistUrl, manifest) = fetch(url, 8 * 1024 * 1024)
    val segments = parseHlsSegments(manifest.toString(Charsets.UTF_8), playlistUrl)
    var lastKeyUrl: String? = null
    var lastKey = ByteArray(0)
    // 仅预取六个分片；按列表顺序消费，避免乱序合并或为整个视频积压内存。
    val pending = ArrayDeque<Deferred<ByteArray>>()
    var nextSegment = 0
    fun prefetch() {
      if (nextSegment >= segments.size) return
      val segment = segments[nextSegment++]
      pending.addLast(async { fetch(segment.url, 32 * 1024 * 1024).second })
    }
    repeat(minOf(SEGMENT_CONCURRENCY, segments.size)) { prefetch() }
    destination.outputStream().buffered().use { output ->
      segments.forEachIndexed { index, segment ->
        currentCoroutineContext().ensureActive()
        val bytes = pending.removeFirst().await()
        val clear = if (segment.keyUrl != null) {
          if (lastKeyUrl != segment.keyUrl) {
            lastKey = fetch(segment.keyUrl, 16).second
            if (lastKey.size != 16) throw HlsDownloadException("视频解密信息无效，请重新解析。")
            lastKeyUrl = segment.keyUrl
          }
          Cipher.getInstance("AES/CBC/PKCS5Padding").run {
            init(Cipher.DECRYPT_MODE, SecretKeySpec(lastKey, "AES"), IvParameterSpec(segment.iv))
            doFinal(bytes)
          }
        } else bytes
        if (clear.size < 188 || clear.size % 188 != 0 || clear.indices.step(188).any { clear[it] != 0x47.toByte() }) {
          throw HlsDownloadException("视频分片内容无效，已停止保存，请重新解析。")
        }
        output.write(clear)
        prefetch()
        onProgress(index + 1, segments.size)
      }
    }
  }
}

internal suspend fun remuxHlsToMp4(source: File, destination: File) {
  val extractor = MediaExtractor()
  var muxer: MediaMuxer? = null
  try {
    extractor.setDataSource(source.absolutePath)
    val output = MediaMuxer(destination.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    muxer = output
    val tracks = mutableMapOf<Int, Int>()
    for (index in 0 until extractor.trackCount) {
      val format = extractor.getTrackFormat(index)
      val mime = format.getString(MediaFormat.KEY_MIME).orEmpty()
      if (mime.startsWith("video/") || mime.startsWith("audio/")) {
        tracks[index] = output.addTrack(format)
        extractor.selectTrack(index)
      }
    }
    if (tracks.isEmpty()) throw HlsDownloadException("设备无法识别此视频的编码。")
    output.start()
    var buffer = ByteBuffer.allocateDirect(1024 * 1024)
    val info = MediaCodec.BufferInfo()
    val writtenTracks = mutableSetOf<Int>()
    val firstTime = extractor.sampleTime
    while (extractor.sampleTrackIndex >= 0) {
      currentCoroutineContext().ensureActive()
      val sampleSize = extractor.sampleSize
      if (sampleSize > 32 * 1024 * 1024) throw HlsDownloadException("视频帧过大，设备无法合并。")
      if (sampleSize > buffer.capacity()) buffer = ByteBuffer.allocateDirect(sampleSize.toInt())
      buffer.clear()
      val size = extractor.readSampleData(buffer, 0)
      if (size < 0) break
      val track = extractor.sampleTrackIndex
      info.set(0, size, (extractor.sampleTime - firstTime).coerceAtLeast(0),
        if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
      output.writeSampleData(tracks.getValue(track), buffer, info)
      writtenTracks += track
      extractor.advance()
    }
    if (writtenTracks.size != tracks.size) throw HlsDownloadException("视频音轨或画面不完整，无法保存。")
    output.stop()
  } finally {
    extractor.release()
    muxer?.release()
  }
}
