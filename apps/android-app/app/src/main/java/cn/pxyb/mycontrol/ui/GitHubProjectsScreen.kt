package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
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
    releases: List<GitHubReleaseRecord>,
    releasesLoaded: Boolean,
    releasesRepoFullName: String?,
    releasesBusy: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onLoadReleases: (owner: String, repo: String) -> Unit,
    onCreateRelease: (owner: String, repo: String, tag: String, name: String, body: String, draft: Boolean, prerelease: Boolean) -> Unit,
    onUpdateVisibility: (owner: String, repo: String, visibility: String) -> Unit,
) {
    var selectedRepo by remember { mutableStateOf<GitHubRepositoryRecord?>(null) }
    var pendingToggle by remember { mutableStateOf<GitHubRepositoryRecord?>(null) }
    var createOpen by remember { mutableStateOf(false) }

    val activeRepo = selectedRepo
    BackHandler(enabled = activeRepo != null) { selectedRepo = null }

    if (activeRepo != null) {
        LaunchedEffect(activeRepo.fullName) {
            onLoadReleases(activeRepo.ownerName(), activeRepo.name)
        }
        GitHubReleasesPane(
            repo = activeRepo,
            releases = releases,
            loaded = releasesLoaded && releasesRepoFullName == activeRepo.fullName,
            busy = releasesBusy,
            contentPadding = contentPadding,
            onBack = { selectedRepo = null },
            onRefresh = { onLoadReleases(activeRepo.ownerName(), activeRepo.name) },
            onCreateRelease = { createOpen = true },
        )
    } else {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(appPageContentPadding(contentPadding)),
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
                            onOpenReleases = { selectedRepo = repository },
                        )
                    }
                }
            }
        }

        val toggle = pendingToggle
        if (toggle != null) {
            val makingPublic = toggle.visibility == "public"
            AppDialog(
                onDismissRequest = { pendingToggle = null },
                icon = if (makingPublic) Icons.Outlined.Public else Icons.Outlined.Lock,
                title = if (makingPublic) "设为公开？" else "设为私有？",
                subtitle = if (makingPublic) {
                    "「${toggle.fullName}」将变为公开，任何人在 GitHub 上都能访问。"
                } else {
                    "「${toggle.fullName}」将变为私有，仅你和有权限的协作者可访问；已有 fork 会与上游脱离。"
                },
                footer = {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        AppDialogSecondaryButton(
                            text = "取消",
                            onClick = { pendingToggle = null },
                            modifier = Modifier.weight(1f),
                        )
                        AppDialogPrimaryButton(
                            text = if (makingPublic) "设为公开" else "设为私有",
                            onClick = {
                                pendingToggle = null
                                onUpdateVisibility(toggle.ownerName(), toggle.name, toggle.visibility)
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                },
            ) { }
        }
    }

    if (createOpen && activeRepo != null) {
        CreateReleaseDialog(
            repo = activeRepo,
            busy = releasesBusy,
            onDismiss = { createOpen = false },
            onCreate = { tag, name, body, draft, prerelease ->
                createOpen = false
                onCreateRelease(activeRepo.ownerName(), activeRepo.name, tag, name, body, draft, prerelease)
            },
        )
    }
}

@Composable
private fun GitHubReleasesPane(
    repo: GitHubRepositoryRecord,
    releases: List<GitHubReleaseRecord>,
    loaded: Boolean,
    busy: Boolean,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onCreateRelease: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(appPageContentPadding(contentPadding)),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AppSecondaryHeader(
            title = repo.fullName,
            subtitle = "Releases 管理",
            onBack = onBack,
            actions = {
                IconButton(onClick = onRefresh, enabled = !busy) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "刷新")
                }
                IconButton(onClick = onCreateRelease, enabled = !busy) {
                    Icon(Icons.Outlined.Add, contentDescription = "新建 Release")
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
            releases.isEmpty() -> GitHubReleasesEmptyState(onCreate = onCreateRelease)
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(releases, key = { it.tagName }) { release ->
                    GitHubReleaseCard(release)
                }
            }
        }
    }
}

@Composable
private fun GitHubReleaseCard(release: GitHubReleaseRecord) {
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
                        text = release.name?.takeIf { it.isNotBlank() } ?: release.tagName,
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = release.tagName,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                if (release.draft || release.prerelease) {
                    Spacer(modifier = Modifier.width(8.dp))
                    ReleaseBadge(release)
                }
            }
            release.body?.takeIf { it.isNotBlank() }?.let { body ->
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = body,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = release.publishedAt?.take(10)?.let { "发布于 $it" } ?: "尚未发布",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (release.assetsCount > 0) {
                    Text(
                        text = "${release.assetsCount} 个附件",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun GitHubRepositoryCard(
    repository: GitHubRepositoryRecord,
    enabled: Boolean,
    onToggleVisibility: (String) -> Unit,
    onOpenReleases: () -> Unit,
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
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(onClick = onOpenReleases)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = Icons.Outlined.RocketLaunch,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Releases 管理",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = MaterialTheme.colorScheme.primary,
                )
                Spacer(modifier = Modifier.weight(1f))
                Icon(
                    imageVector = Icons.Outlined.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun StatusBadge(label: String, foreground: Color, background: Color) {
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
private fun VisibilityBadge(visibility: String) {
    val (label, foreground, background) = when (visibility) {
        "private" -> Triple("私有", Amber, AmberPale)
        "internal" -> Triple("内部", Coral, CoralPale)
        else -> Triple("公开", Ocean, OceanPale)
    }
    StatusBadge(label, foreground, background)
}

@Composable
private fun ReleaseBadge(release: GitHubReleaseRecord) {
    val (label, foreground, background) = when {
        release.draft -> Triple("草稿", Amber, AmberPale)
        else -> Triple("预发布", Coral, CoralPale)
    }
    StatusBadge(label, foreground, background)
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

@Composable
private fun GitHubReleasesEmptyState(onCreate: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "还没有 Release",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(modifier = Modifier.height(4.dp))
            TextButton(onClick = onCreate) {
                Text("新建 Release")
            }
        }
    }
}

@Composable
private fun CreateReleaseDialog(
    repo: GitHubRepositoryRecord,
    busy: Boolean,
    onDismiss: () -> Unit,
    onCreate: (tag: String, name: String, body: String, draft: Boolean, prerelease: Boolean) -> Unit,
) {
    var tag by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var draft by remember { mutableStateOf(false) }
    var prerelease by remember { mutableStateOf(false) }
    var localError by remember { mutableStateOf<String?>(null) }

    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        icon = Icons.Outlined.RocketLaunch,
        title = "新建 Release",
        subtitle = "将在 ${repo.fullName} 上创建，标签（tag）必填。",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                AppDialogPrimaryButton(
                    text = "创建",
                    onClick = {
                        if (tag.isBlank()) {
                            localError = "请填写标签（tag），如 v1.0.0。"
                            return@AppDialogPrimaryButton
                        }
                        onCreate(tag.trim(), name.trim(), body.trim(), draft, prerelease)
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                    busy = busy,
                )
            }
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            DialogTextField(
                value = tag,
                onValueChange = { tag = it; localError = null },
                label = "标签（如 v1.0.0）",
                enabled = !busy,
            )
            DialogTextField(
                value = name,
                onValueChange = { name = it },
                label = "标题（留空则用标签）",
                enabled = !busy,
            )
            DialogTextField(
                value = body,
                onValueChange = { body = it },
                label = "发布说明",
                singleLine = false,
                minLines = 3,
                maxLines = 5,
                enabled = !busy,
            )
            ReleaseOptionSwitch(
                checked = draft,
                onCheckedChange = { draft = it },
                enabled = !busy,
                title = "草稿",
                description = "仅自己可见，不会向公众展示",
            )
            ReleaseOptionSwitch(
                checked = prerelease,
                onCheckedChange = { prerelease = it },
                enabled = !busy,
                title = "预发布",
                description = "标记为预发布版本，供测试使用",
            )
            localError?.let { error ->
                Text(
                    text = error,
                    style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun ReleaseOptionSwitch(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean,
    title: String,
    description: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppSwitch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
        Column {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
            )
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun GitHubRepositoryRecord.ownerName(): String = fullName.substringBefore('/')