package cn.pxyb.mycontrol.data

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import cn.pxyb.mycontrol.MainActivity
import java.io.File
import java.io.OutputStream
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject

class HlsDownloadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  private val notifications = context.getSystemService(NotificationManager::class.java)
  private val title get() = inputData.getString("title").orEmpty().ifBlank { "视频下载" }

  override suspend fun getForegroundInfo(): ForegroundInfo {
    notifications.createNotificationChannel(NotificationChannel(CHANNEL, "视频下载", NotificationManager.IMPORTANCE_LOW))
    val notification = notification("正在准备下载", ongoing = true)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else ForegroundInfo(NOTIFICATION_ID, notification)
  }

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val transport = File(applicationContext.cacheDir, "hls-$id.ts")
    val mp4 = File(applicationContext.cacheDir, "hls-$id.mp4")
    var failureMessage = "视频下载失败，请检查网络和存储空间后重新下载。"
    try {
      setForeground(getForegroundInfo())
      val url = inputData.getString("url") ?: throw HlsDownloadException("下载地址已失效，请重新解析。")
      val headerJson = JSONObject(inputData.getString("headers") ?: "{}")
      val headers = headerJson.keys().asSequence().associateWith { headerJson.getString(it) }
      var lastUpdate = 0L
      HlsVideoDownload(headers).download(url, transport) { completed, total ->
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastUpdate >= 1000 || completed == total) {
          updateStatus("正在下载 $completed / $total", completed * 100 / total)
          lastUpdate = now
        }
      }
      failureMessage = "MP4 合并失败，设备可能不支持此视频编码，或存储空间不足。"
      updateStatus("正在合并为 MP4")
      remuxHlsToMp4(transport, mp4)
      // 合并成功后再公开文件，下载目录不会显示半成品。
      transport.delete()
      failureMessage = "保存 MP4 失败，请检查下载目录权限和存储空间。"
      updateStatus("正在保存 MP4")
      saveToDownloads(mp4, inputData.getString("fileName") ?: "视频下载.mp4")
      val message = "MP4 已保存到下载目录"
      notifySafely(notification(message, ongoing = false))
      Result.success(workDataOf(STATUS to message))
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (error: Exception) {
      // 网络与媒体异常可能带签名 URL，仅向界面返回受控的中文错误。
      val message = (error as? HlsDownloadException)?.message ?: failureMessage
      notifySafely(notification(message, ongoing = false))
      Result.failure(workDataOf(STATUS to message))
    } finally {
      transport.delete()
      mp4.delete()
    }
  }

  private suspend fun updateStatus(message: String, percent: Int = -1) {
    setProgress(workDataOf(STATUS to message))
    notifySafely(notification(message, ongoing = true, percent = percent))
  }

  private fun notification(message: String, ongoing: Boolean, percent: Int = -1): Notification {
    val open = PendingIntent.getActivity(applicationContext, 0, Intent(applicationContext, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(applicationContext, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title)
      .setContentText(message)
      .setStyle(NotificationCompat.BigTextStyle().bigText(message))
      .setContentIntent(open)
      .setOnlyAlertOnce(true)
      .setOngoing(ongoing)
      .setAutoCancel(!ongoing)
      .apply {
        if (ongoing) {
          setProgress(100, percent.coerceAtLeast(0), percent < 0)
          addAction(0, "取消下载", WorkManager.getInstance(applicationContext).createCancelPendingIntent(id))
        }
      }.build()
  }

  private fun notifySafely(notification: Notification) {
    val notificationId = if (notification.flags and Notification.FLAG_ONGOING_EVENT != 0) NOTIFICATION_ID else NOTIFICATION_ID + 1
    runCatching { notifications.notify(notificationId, notification) }
  }

  private suspend fun copyVideo(source: File, output: OutputStream) {
    source.inputStream().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        currentCoroutineContext().ensureActive()
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
      }
    }
  }

  private suspend fun saveToDownloads(source: File, fileName: String) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val resolver = applicationContext.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
        put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4")
        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
        ?: throw HlsDownloadException("无法创建下载文件，请检查存储空间。")
      try {
        resolver.openOutputStream(uri)?.use { copyVideo(source, it) }
          ?: throw HlsDownloadException("无法写入下载目录。")
        currentCoroutineContext().ensureActive()
        resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (error: Exception) {
        resolver.delete(uri, null, null)
        throw error
      }
    } else {
      @Suppress("DEPRECATION")
      val directory = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
      directory.mkdirs()
      val target = File.createTempFile(fileName.removeSuffix(".mp4").take(60) + "-", ".mp4", directory)
      try {
        target.outputStream().use { copyVideo(source, it) }
        currentCoroutineContext().ensureActive()
        MediaScannerConnection.scanFile(applicationContext, arrayOf(target.absolutePath), arrayOf("video/mp4"), null)
      } catch (error: Exception) {
        target.delete()
        throw error
      }
    }
  }

  companion object {
    const val WORK_NAME = "hls-video-download"
    const val STATUS = "status"
    private const val CHANNEL = "media_download"
    private const val NOTIFICATION_ID = 7401

    fun enqueue(context: Context, url: String, headers: Map<String, String>, title: String, fileName: String) {
      val request = OneTimeWorkRequestBuilder<HlsDownloadWorker>()
        .setInputData(workDataOf("url" to url, "headers" to JSONObject(headers).toString(), "title" to title, "fileName" to fileName))
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
    }
  }
}
