package cn.pxyb.mycontrol.data

import android.app.DownloadManager
import android.content.Context
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

internal data class MediaDownloadTask(
  val id: String,
  val hls: Boolean,
  val title: String,
  val cover: String,
  val format: String,
  val source: String,
  val createdAt: Long = System.currentTimeMillis(),
  val state: String = "queued",
  val detail: String = "等待下载",
  val percent: Int = -1,
) {
  val active: Boolean get() = state in setOf("queued", "downloading", "merging", "saving")
  val completed: Boolean get() = state == "completed"
}

// 只记录本页面创建的任务，避免把 APK 更新等其他系统下载混入视频列表。
internal class MediaDownloadTasks(private val context: Context) {
  private val preferences = context.getSharedPreferences("media_download_tasks", Context.MODE_PRIVATE)

  fun read(account: String?): List<MediaDownloadTask> = synchronized(lock) {
    val key = scopedStorageKey(account, "tasks") ?: return@synchronized emptyList()
    val array = runCatching { JSONArray(preferences.getString(key, "[]")) }.getOrElse { JSONArray() }
    (0 until array.length()).mapNotNull { index ->
      val item = array.optJSONObject(index) ?: return@mapNotNull null
      MediaDownloadTask(item.optString("id"), item.optBoolean("hls"), item.optString("title"),
        item.optString("cover"), item.optString("format"), item.optString("source"), item.optLong("createdAt"),
        item.optString("state", "queued"), item.optString("detail"), item.optInt("percent", -1))
    }
  }

  fun record(account: String?, task: MediaDownloadTask) = synchronized(lock) {
    write(account, listOf(task) + read(account).filterNot { it.id == task.id })
  }

  fun update(account: String?, id: String, state: String, detail: String, percent: Int = -1) = synchronized(lock) {
    val previous = read(account)
    val next = previous.map { if (it.id == id) it.copy(state = state, detail = detail, percent = percent) else it }
    if (next != previous) write(account, next)
  }

  private fun write(account: String?, tasks: List<MediaDownloadTask>) {
    val key = scopedStorageKey(account, "tasks") ?: return
    val retained = tasks.filter { it.active } + tasks.filterNot { it.active }.take(100)
    val array = JSONArray()
    retained.sortedByDescending { it.createdAt }.forEach { task ->
      array.put(JSONObject().put("id", task.id).put("hls", task.hls).put("title", task.title)
        .put("cover", task.cover).put("format", task.format).put("source", task.source)
        .put("createdAt", task.createdAt).put("state", task.state).put("detail", task.detail).put("percent", task.percent))
    }
    preferences.edit().putString(key, array.toString()).apply()
  }

  // 在页面前台的 IO 协程轮询，真实状态分别由 DownloadManager 与 WorkManager 提供。
  fun refresh(account: String?): List<MediaDownloadTask> {
    val tasks = read(account).filter { it.active }
    val manager = context.getSystemService(DownloadManager::class.java)
    val direct = tasks.filterNot { it.hls }
    if (direct.isNotEmpty()) {
      val found = mutableSetOf<String>()
      manager.query(DownloadManager.Query().setFilterById(*direct.map { it.id.toLong() }.toLongArray()))?.use { cursor ->
        while (cursor.moveToNext()) {
          val id = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)).toString()
          found += id
          val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
          val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
          val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
          val percent = if (total > 0) (downloaded * 100 / total).toInt().coerceIn(0, 100) else -1
          val (state, detail) = when (status) {
            DownloadManager.STATUS_SUCCESSFUL -> "completed" to "已保存到下载目录"
            DownloadManager.STATUS_FAILED -> "failed" to "下载失败，请重新解析链接后下载"
            DownloadManager.STATUS_PAUSED -> "queued" to "等待网络或系统恢复下载"
            DownloadManager.STATUS_RUNNING -> "downloading" to "正在下载${if (percent >= 0) " · $percent%" else ""}"
            else -> "queued" to "等待下载"
          }
          update(account, id, state, detail, percent)
        }
      }
      direct.filterNot { it.id in found }.forEach { update(account, it.id, "cancelled", "下载任务已取消或移除") }
    }
    val workManager = WorkManager.getInstance(context)
    tasks.filter { it.hls }.forEach { task ->
      val work = workManager.getWorkInfoById(UUID.fromString(task.id)).get()
      when (work?.state) {
        WorkInfo.State.CANCELLED -> update(account, task.id, "cancelled", "下载已取消")
        WorkInfo.State.FAILED -> update(account, task.id, "failed", work.outputData.getString(HlsDownloadWorker.STATUS) ?: "下载失败，请重新解析")
        WorkInfo.State.SUCCEEDED -> update(account, task.id, "completed", "MP4 已保存到下载目录", 100)
        null -> if (System.currentTimeMillis() - task.createdAt > 30_000) update(account, task.id, "failed", "任务已失效，请重新解析链接")
        else -> Unit // 分片、合并和保存进度由 Worker 写入，保留准确的阶段。
      }
    }
    return read(account)
  }

  fun cancel(account: String?, task: MediaDownloadTask) {
    if (task.hls) WorkManager.getInstance(context).cancelWorkById(UUID.fromString(task.id)).result.get()
    else context.getSystemService(DownloadManager::class.java).remove(task.id.toLong())
    update(account, task.id, "cancelled", "下载已取消")
  }

  private companion object { val lock = Any() }
}
