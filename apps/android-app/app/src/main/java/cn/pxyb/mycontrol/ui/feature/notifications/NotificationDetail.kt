package cn.pxyb.mycontrol.ui.feature.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.MarkEmailRead
import androidx.compose.material.icons.outlined.MarkEmailUnread
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Restore
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.data.AppAlertRecord
import cn.pxyb.mycontrol.data.AppNotificationAction
import cn.pxyb.mycontrol.data.AppNotificationBlock
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.data.kind
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.layout.AppPageBottomSpacing
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppPageTopSpacing
import cn.pxyb.mycontrol.ui.components.layout.AppSecondaryHeader
import cn.pxyb.mycontrol.ui.components.layout.AppAdaptivePanes
import cn.pxyb.mycontrol.ui.components.layout.AppReadingContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.PullToRefresh
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.components.layout.glassCardColor
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.theme.AppCardShape
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/** 平板 / 大屏：左侧列表 + 右侧详情的经典双栏布局。 */
@Composable
internal fun NotificationTwoPaneLayout(
    title: String,
    subtitle: String,
    contentPadding: PaddingValues,
    refreshing: Boolean,
    onRefresh: () -> Unit,
    onBack: () -> Unit,
    actions: (@Composable RowScope.() -> Unit)?,
    listState: LazyListState,
    selectedAlert: AppAlertRecord?,
    onAction: (AppAlertRecord, AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    listContent: LazyListScope.() -> Unit,
) {
    val dark = isAppInDarkTheme()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .auroraBackdrop(dark)
            .padding(
                top = contentPadding.calculateTopPadding(),
                bottom = contentPadding.calculateBottomPadding(),
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = AppPageHorizontalPadding)
                .padding(top = AppPageTopSpacing, bottom = 8.dp),
        ) {
            AppSecondaryHeader(
                title = title,
                subtitle = subtitle,
                onBack = onBack,
                actions = actions,
            )
        }
        AppAdaptivePanes(
            showDetail = true,
            twoPane = true,
            listPane = {
                PullToRefresh(
                    isRefreshing = refreshing,
                    onRefresh = onRefresh,
                    atTop = {
                        listState.firstVisibleItemIndex == 0 && listState.firstVisibleItemScrollOffset == 0
                    },
                ) {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(
                            start = AppPageHorizontalPadding,
                            end = AppPageHorizontalPadding,
                            top = 4.dp,
                            bottom = AppPageBottomSpacing,
                        ),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        content = listContent,
                    )
                }
            },
            detailPane = {
                Box(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 4.dp),
                    contentAlignment = Alignment.TopCenter,
                ) {
                    val detailModifier = Modifier.widthIn(max = AppReadingContentMaxWidth).fillMaxSize()
                    if (selectedAlert != null) {
                        key(selectedAlert.id) {
                            NotificationDetailPane(
                                alert = selectedAlert,
                                onAction = { onAction(selectedAlert, it) },
                                onMarkRead = onMarkRead,
                                onMarkUnread = onMarkUnread,
                                onArchive = onArchive,
                                onSnooze = onSnooze,
                                modifier = detailModifier,
                            )
                        }
                    } else {
                        NotificationDetailPlaceholder(modifier = detailModifier)
                    }
                }
            },
        )
    }
}

@Composable
private fun NotificationDetailPlaceholder(modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        shape = AppCardShape,
        color = glassCardColor(),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AppIconTile(
                icon = Icons.Outlined.Notifications,
                tint = ColorTokens.Blue.foreground,
                background = ColorTokens.Blue.container,
            )
            Spacer(Modifier.height(14.dp))
            Text(
                "选择一条通知查看详情",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "左侧列表支持搜索、筛选与左滑归档；选中后的完整内容、结构化字段与快捷操作会显示在这里。",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun NotificationDetailPane(
    alert: AppAlertRecord,
    onAction: (AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
    onArchive: (String) -> Unit,
    onSnooze: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val kind = alert.kind()
    val accent = notificationKindColors(kind)
    val snoozed = alert.isSnoozedAt()

    Surface(
        modifier = modifier,
        shape = AppCardShape,
        color = glassCardColor(),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.6f)),
        shadowElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppIconTile(
                        icon = notificationKindIcon(kind),
                        tint = accent.foreground,
                        background = accent.container,
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        NotificationTag(text = kind.label, accent = accent)
                        Text(
                            text = relativeTimeLabel(alert.createdAt),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                if (!alert.read) {
                    Text(
                        text = "未读",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = ColorTokens.Blue.foreground,
                    )
                }
            }

            Text(
                text = alert.title,
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            )

            if (alert.body.isNotBlank()) {
                Surface(
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = alert.body,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(14.dp),
                    )
                }
            }

            alert.contentBlocks.forEach { block -> NotificationBlockView(block) }

            if (alert.actions.isNotEmpty()) {
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
                Text(
                    text = "快捷操作",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                alert.actions.forEach { action ->
                    AppButton(
                        text = action.label,
                        icon = Icons.Outlined.OpenInNew,
                        onClick = { onAction(action) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))

            if (snoozed) {
                AppSecondaryButton(
                    text = "取消稍后",
                    onClick = { onMarkUnread(alert.id) },
                    modifier = Modifier.fillMaxWidth(),
                    icon = Icons.Outlined.Restore,
                )
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppSecondaryButton(
                        text = if (alert.read) "标为未读" else "标为已读",
                        onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                        modifier = Modifier.weight(1f),
                        icon = if (alert.read) Icons.Outlined.MarkEmailUnread else Icons.Outlined.MarkEmailRead,
                    )
                    AppSecondaryButton(
                        text = "稍后提醒",
                        onClick = { onSnooze(alert.id) },
                        modifier = Modifier.weight(1f),
                        icon = Icons.Outlined.AccessTime,
                    )
                }
            }

            AppSecondaryButton(
                text = "归档",
                onClick = { onArchive(alert.id) },
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Outlined.Archive,
            )
        }
    }
}

@Composable
internal fun NotificationDetailDialog(
    alert: AppAlertRecord,
    onDismiss: () -> Unit,
    onAction: (AppNotificationAction) -> Unit,
    onMarkRead: (String) -> Unit,
    onMarkUnread: (String) -> Unit,
) {
    val kind = alert.kind()
    val accent = notificationKindColors(kind)

    AppDialog(
        onDismissRequest = onDismiss,
        icon = notificationKindIcon(kind),
        iconTint = accent.foreground,
        iconBackground = accent.container,
        title = alert.title,
        subtitle = "${relativeTimeLabel(alert.createdAt)} · ${kind.label}",
        modifier = Modifier.heightIn(max = 640.dp),
        footer = {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                AppDialogSecondaryButton(
                    text = if (alert.read) "标为未读" else "标为已读",
                    onClick = { if (alert.read) onMarkUnread(alert.id) else onMarkRead(alert.id) },
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton("关闭", onDismiss, Modifier.weight(1f))
            }
        },
    ) {
        if (alert.body.isNotBlank()) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = alert.body,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(12.dp),
                )
            }
        }

        alert.contentBlocks.forEach { block -> NotificationBlockView(block) }

        if (alert.actions.isNotEmpty()) {
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            alert.actions.forEach { action ->
                AppButton(
                    text = action.label,
                    icon = Icons.Outlined.OpenInNew,
                    onClick = { onAction(action) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun NotificationBlockView(block: AppNotificationBlock) {
    val uriHandler = LocalUriHandler.current
    when (block.type) {
        "text" -> Text(block.text, style = MaterialTheme.typography.bodyLarge)
        "markdown" -> Text(block.markdown, style = MaterialTheme.typography.bodyLarge)
        "keyValue" -> Surface(
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f),
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                block.items.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            text = item.key,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(0.38f),
                        )
                        Text(
                            text = item.value,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(0.62f),
                        )
                    }
                }
            }
        }
        "list" -> Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            block.listItems.forEach { item ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(
                        modifier = Modifier
                            .padding(top = 6.dp)
                            .size(6.dp)
                            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(3.dp)),
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            text = item.title,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        if (item.description.isNotBlank()) {
                            Text(
                                text = item.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
        "progress" -> Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = block.label,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = "${block.value ?: 0}%",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
            LinearProgressIndicator(
                progress = { ((block.value ?: 0).coerceIn(0, 100)) / 100f },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(8.dp)
                    .clip(RoundedCornerShape(4.dp)),
            )
        }
        "image", "attachment" -> Surface(
            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.2f),
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = block.alt.ifBlank { block.fileName.ifBlank { block.url } },
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.weight(1f),
                )
                if (block.url.isNotBlank()) {
                    TextButton(onClick = { runCatching { uriHandler.openUri(block.url) } }) {
                        Icon(
                            imageVector = Icons.Outlined.OpenInNew,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(if (block.type == "image") "查看图片" else "打开附件")
                    }
                }
            }
        }
        else -> if (block.text.isNotBlank()) Text(block.text, style = MaterialTheme.typography.bodyLarge)
    }
}
