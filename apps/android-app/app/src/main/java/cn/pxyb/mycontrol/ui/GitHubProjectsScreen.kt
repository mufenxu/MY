package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import androidx.compose.material.icons.outlined.RocketLaunch

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.ForkRight
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.RocketLaunch
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImagePainter
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import cn.pxyb.mycontrol.data.GitHubProfileRecord
import cn.pxyb.mycontrol.data.GitHubReleaseRecord
import cn.pxyb.mycontrol.data.GitHubRepositoryRecord

@Composable
fun GitHubProjectsScreen(
    repositories: List<GitHubRepositoryRecord>,
    loaded: Boolean,
    busy: Boolean,
    profile: GitHubProfileRecord?,
    profileLoaded: Boolean,
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
    val dark = isAppInDarkTheme()
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
        AppSubPage(
            title = "GitHub 项目",
            subtitle = "账号与仓库管理",
            onBack = onBack,
            contentPadding = contentPadding,
            refreshing = busy,
            onRefresh = onRefresh,
            actions = {
                AppHeaderIconButton(
                    icon = Icons.Outlined.Refresh,
                    contentDescription = "刷新",
                    onClick = onRefresh,
                    enabled = !busy,
                    loading = busy,
                )
            },
        ) {
            when {
                !profileLoaded && profile == null -> item(key = "github-account-loading") {
                    LoadingBlock("正在加载账号信息")
                }
                profile != null -> item(key = "github-account-profile") {
                    GitHubAccountCard(profile = profile)
                }
                repositories.isNotEmpty() -> item(key = "github-account-summary") {
                    GitHubRepositoriesSummaryCard(repositories = repositories)
                }
            }
            when {
                !loaded -> item(key = "github-projects-shimmer") {
                    GlassShimmerList(itemCount = 3, itemHeight = 104.dp)
                }
                repositories.isEmpty() -> item(key = "github-projects-empty") {
                    GitHubEmptyState(onRefresh = onRefresh)
                }
                else -> {
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
    AppSubPage(
        title = repo.fullName,
        subtitle = "Releases 管理",
        onBack = onBack,
        contentPadding = contentPadding,
        refreshing = busy,
        onRefresh = onRefresh,
        actions = {
            AppHeaderIconButton(
                icon = Icons.Outlined.Refresh,
                contentDescription = "刷新",
                onClick = onRefresh,
                enabled = !busy,
                loading = busy,
            )
            AppHeaderIconButton(
                icon = Icons.Outlined.Add,
                contentDescription = "新建 Release",
                onClick = onCreateRelease,
                enabled = !busy,
            )
        },
    ) {
        when {
            !loaded -> item(key = "github-releases-shimmer") {
                GlassShimmerList(itemCount = 3, itemHeight = 84.dp)
            }
            releases.isEmpty() -> item(key = "github-releases-empty") {
                GitHubReleasesEmptyState(onCreate = onCreateRelease)
            }
            else -> {
                items(
                    releases,
                    key = { release ->
                        "${release.tagName}:${release.publishedAt}:${release.assetsCount}"
                    },
                ) { release ->
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
                    tint = ColorTokens.Blue.foreground,
                )
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                VisibilityBadge(repository.visibility)
                if (repository.archived) {
                    AppStatusBadge(
                        label = "已归档",
                        semantic = AppStatusSemantic.Warning,
                    )
                }
                repository.language?.let { language ->
                    Text(
                        text = language,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
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
            if (repository.starCount > 0 || repository.forkCount > 0 || repository.fork) {
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (repository.starCount > 0) {
                        GitHubMetricItem(
                            icon = Icons.Filled.Star,
                            tint = ColorTokens.Amber.foreground,
                            text = repository.starCount.toString(),
                        )
                    }
                    if (repository.forkCount > 0) {
                        GitHubMetricItem(
                            icon = Icons.Outlined.ForkRight,
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            text = repository.forkCount.toString(),
                        )
                    }
                    if (repository.fork) {
                        Text(
                            text = "Fork 仓库",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
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
private fun GitHubMetricItem(icon: ImageVector, tint: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(14.dp),
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun GitHubAccountCard(profile: GitHubProfileRecord) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GitHubAvatar(name = profile.login, avatarUrl = profile.avatarUrl, size = 46.dp)
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = profile.name?.takeIf { it.isNotBlank() } ?: profile.login,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "@${profile.login} · 当前 GitHub 账号",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    profile.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = bio,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                MetricCell(
                    label = "公开仓库",
                    value = profile.publicRepos?.toString() ?: "--",
                    modifier = Modifier.weight(1f),
                )
                MetricCell(
                    label = "粉丝",
                    value = profile.followers?.toString() ?: "--",
                    modifier = Modifier.weight(1f),
                )
                MetricCell(
                    label = "关注",
                    value = profile.following?.toString() ?: "--",
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun GitHubRepositoriesSummaryCard(repositories: List<GitHubRepositoryRecord>) {
    val owner = repositories.first().ownerName()
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = glassCardColor(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)),
        shadowElevation = 0.dp,
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GitHubAvatar(name = owner, avatarUrl = null, size = 46.dp)
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = owner,
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = "GitHub 账号资料暂不可用，以下为仓库列表统计",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                MetricCell(
                    label = "仓库",
                    value = repositories.size.toString(),
                    modifier = Modifier.weight(1f),
                )
                MetricCell(
                    label = "公开",
                    value = repositories.count { !it.isPrivate }.toString(),
                    modifier = Modifier.weight(1f),
                )
                MetricCell(
                    label = "私有",
                    value = repositories.count { it.isPrivate }.toString(),
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun GitHubAvatar(name: String, avatarUrl: String?, size: Dp) {
    if (avatarUrl.isNullOrBlank()) {
        GitHubInitialAvatar(name = name, size = size)
        return
    }
    SubcomposeAsyncImage(
        model = avatarUrl,
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier
            .size(size)
            .clip(CircleShape),
    ) {
        when (painter.state) {
            is AsyncImagePainter.State.Success -> SubcomposeAsyncImageContent()
            else -> GitHubInitialAvatar(name = name, size = size)
        }
    }
}

@Composable
private fun GitHubInitialAvatar(name: String, size: Dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .background(ColorTokens.Blue.container),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.take(1).uppercase(),
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = ColorTokens.Blue.foreground,
        )
    }
}

@Composable
private fun VisibilityBadge(visibility: String) {
    val (label, semantic) = when (visibility) {
        "private" -> "私有" to AppStatusSemantic.Warning
        "internal" -> "内部" to AppStatusSemantic.Error
        else -> "公开" to AppStatusSemantic.Info
    }
    AppStatusBadge(label = label, semantic = semantic)
}

@Composable
private fun ReleaseBadge(release: GitHubReleaseRecord) {
    val (label, semantic) = when {
        release.draft -> "草稿" to AppStatusSemantic.Warning
        else -> "预发布" to AppStatusSemantic.Error
    }
    AppStatusBadge(label = label, semantic = semantic)
}

@Composable
private fun GitHubEmptyState(onRefresh: () -> Unit) {
    AppEmptyState(
        title = "没有可展示的仓库",
        detail = "请检查网络或点击下方按钮重新加载",
        icon = Icons.Outlined.Public,
        actionText = "重新加载",
        onAction = onRefresh,
    )
}

@Composable
private fun GitHubReleasesEmptyState(onCreate: () -> Unit) {
    AppEmptyState(
        title = "还没有 Release",
        detail = "当前仓库尚未发布任何版本发行包",
        icon = Icons.Outlined.RocketLaunch,
        actionText = "新建 Release",
        onAction = onCreate,
    )
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
