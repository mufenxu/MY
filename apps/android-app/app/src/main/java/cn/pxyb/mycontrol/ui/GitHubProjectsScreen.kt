package cn.pxyb.mycontrol.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale

@Composable
fun GitHubProjectsScreen(
    repositories: List<GitHubRepositoryRecord>,
    loaded: Boolean,
    busy: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onUpdateVisibility: (owner: String, repo: String, visibility: String) -> Unit,
) {
    var pendingToggle by remember { mutableStateOf<GitHubRepositoryRecord?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AppSecondaryHeader(
            title = "GitHub 项目",
            subtitle = "仓库可见性管理",
            onBack = onBack,
            actions = {
                IconButton(onClick = onRefresh, enabled = !busy) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "刷新")
                }
            },
        )

        when {
            !loaded -> Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
            repositories.isEmpty() -> GitHubEmptyState(onRefresh = onRefresh)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(repositories, key = { it.fullName }) { repository ->
                    GitHubRepositoryCard(
                        repository = repository,
                        enabled = !busy,
                        onToggleVisibility = { target -> pendingToggle = repository.copy(visibility = target) },
                    )
                }
            }
        }
    }

    val toggle = pendingToggle
    if (toggle != null) {
        val makingPublic = toggle.visibility == "public"
        AlertDialog(
            onDismissRequest = { pendingToggle = null },
            title = { Text(if (makingPublic) "设为公开？" else "设为私有？") },
            text = {
                Text(
                    text = if (makingPublic) {
                        "“${toggle.fullName}”将变为公开，任何人在 GitHub 上都能访问。确定继续吗？"
                    } else {
                        "“${toggle.fullName}”将变为私有，仅你和有权限的协作者可访问；已有 fork 会与上游脱离。确定继续吗？"
                    }
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        pendingToggle = null
                        onUpdateVisibility(toggle.ownerName(), toggle.name, toggle.visibility)
                    },
                ) {
                    Text(if (makingPublic) "设为公开" else "设为私有")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingToggle = null }) {
                    Text("取消")
                }
            },
        )
    }
}

@Composable
private fun GitHubRepositoryCard(
    repository: GitHubRepositoryRecord,
    enabled: Boolean,
    onToggleVisibility: (String) -> Unit,
) {
    val isPrivate = repository.visibility == "private"
    val isInternal = repository.visibility == "internal"
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = repository.fullName,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = repository.description ?: "暂无描述",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                AppSwitch(
                    checked = !isPrivate,
                    onCheckedChange = { checked ->
                        onToggleVisibility(if (checked) "public" else "private")
                    },
                    enabled = enabled && !isInternal,
                    tint = Ocean,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                VisibilityBadge(repository.visibility)
                repository.language?.let { language ->
                    Text(
                        text = language,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(modifier = Modifier.weight(1f))
                repository.updatedAt?.take(10)?.let { updated ->
                    Text(
                        text = "更新于 $updated",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun VisibilityBadge(visibility: String) {
    val (label, foreground, background) = when (visibility) {
        "private" -> Triple("私有", Amber, AmberPale)
        "internal" -> Triple("内部", Coral, CoralPale)
        else -> Triple("公开", Ocean, OceanPale)
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(background)
            .padding(horizontal = 8.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(
                color = foreground,
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
            ),
        )
    }
}

@Composable
private fun GitHubEmptyState(onRefresh: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "没有可展示的仓库",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(4.dp))
            TextButton(onClick = onRefresh) {
                Text("重新加载")
            }
        }
    }
}

private fun GitHubRepositoryRecord.ownerName(): String = fullName.substringBefore('/')