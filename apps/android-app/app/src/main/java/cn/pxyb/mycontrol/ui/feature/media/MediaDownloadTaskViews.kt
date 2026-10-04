package cn.pxyb.mycontrol.ui.feature.media

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Smartphone
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.MediaDownloadTarget
import cn.pxyb.mycontrol.data.MediaDownloadTask
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import coil.compose.SubcomposeAsyncImage

@Composable
private fun MediaCover(url: String) {
  val shape = RoundedCornerShape(12.dp)
  Box(Modifier.size(64.dp).clip(shape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
    if (url.isBlank()) Icon(Icons.Outlined.Movie, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    else SubcomposeAsyncImage(model = url, contentDescription = "视频封面", contentScale = ContentScale.Crop,
      modifier = Modifier.size(64.dp),
      error = { Box(contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Movie, contentDescription = null) } })
  }
}

@Composable
internal fun MediaResultHeading(result: MediaDownloadTarget) {
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
    MediaCover(result.cover)
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      Text(result.title.ifBlank { "未命名作品" }, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
      Text(listOf(mediaPlatformLabel(result.platform), result.author, formatMediaDuration(result.durationMillis))
        .filter(String::isNotBlank).joinToString(" · "), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
  }
}

@Composable
internal fun MediaTaskCard(task: MediaDownloadTask, onCancel: () -> Unit, onRetry: () -> Unit,
  onOpen: () -> Unit, compact: Boolean = false) {
  val status = when (task.state) {
    "completed" -> "已完成"
    "failed" -> "下载失败"
    "cancelled" -> "已取消"
    "merging" -> "正在合并"
    "saving" -> "正在保存"
    "downloading" -> "正在下载"
    else -> "等待下载"
  }
  AppPanel {
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
        MediaCover(task.cover)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
          Text(task.title.ifBlank { "未命名作品" }, style = MaterialTheme.typography.titleSmall,
            maxLines = 2, overflow = TextOverflow.Ellipsis)
          Text(task.format, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
          if (!compact) Text(status, style = MaterialTheme.typography.labelMedium,
            color = if (task.state == "failed") MaterialTheme.colorScheme.error else if (task.active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (compact) AppHeaderIconButton(icon = Icons.Outlined.FolderOpen, contentDescription = "查看下载目录", onClick = onOpen)
        else if (task.completed) Icon(Icons.Outlined.CheckCircle, contentDescription = "已完成", tint = MaterialTheme.colorScheme.primary)
      }
      if (!compact) {
        if (task.active) {
          if (task.percent >= 0) LinearProgressIndicator(progress = { task.percent / 100f }, modifier = Modifier.fillMaxWidth())
          else LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
          Text(task.detail, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodySmall,
            color = if (task.state == "failed") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
          if (task.active && task.percent >= 0) Text("${task.percent}%", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
        if (task.hls && task.active) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            listOf("下载分片" to "downloading", "合并视频" to "merging", "保存到本地" to "saving").forEach { (label, stage) ->
              Text(label, style = MaterialTheme.typography.labelSmall, fontWeight = if (task.state == stage) FontWeight.SemiBold else FontWeight.Normal,
                color = if (task.state == stage) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
        if (task.active) {
          Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.secondaryContainer).padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Smartphone, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSecondaryContainer)
            Text("离开页面后，下载将在后台继续", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSecondaryContainer)
          }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
          if (task.active) AppSecondaryButton(text = "取消下载", onClick = onCancel)
          else if (task.completed) AppSecondaryButton(text = "查看文件", icon = Icons.Outlined.FolderOpen, onClick = onOpen)
          else if (task.source.isNotBlank()) AppSecondaryButton(text = "重新解析", onClick = onRetry)
        }
      }
    }
  }
}
