package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.data.AssistantActionItem
import cn.pxyb.mycontrol.data.AssistantSuggestion

@Composable
fun AssistantScreen(
    state: AssistantChatUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onOpenWorkspace: (WorkspaceDestination) -> Unit,
    onOpenOperations: () -> Unit,
    onSelectTab: (MainTab) -> Unit,
    onSend: (String) -> Unit,
    onExecuteAction: (AssistantActionItem) -> Unit,
) {
    BackHandler(onBack = onBack)
    var input by rememberSaveable { mutableStateOf("") }
    var pendingAction by remember { mutableStateOf<AssistantActionItem?>(null) }
    val listState = rememberLazyListState()
    val dark = isSystemInDarkTheme()

    LaunchedEffect(state.messages.size, state.sending) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .auroraBackdrop(dark)
            .imePadding(),
    ) {
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentPadding = appPageContentPadding(contentPadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "assistant-header") {
                AppSecondaryHeader(
                    title = "AI 助手",
                    subtitle = "基于工作台状态回答并跳转",
                    onBack = onBack,
                )
            }
            if (state.messages.isEmpty()) {
                item(key = "assistant-welcome") {
                    AssistantWelcomeCard()
                }
            } else {
                items(
                    state.messages,
                    key = { message -> message.id },
                    contentType = { message -> message.role },
                ) { message ->
                    AssistantMessageBubble(
                        message = message,
                        onSuggestionClick = { destination ->
                            when (destination) {
                                "today" -> onOpenWorkspace(WorkspaceDestination.Today)
                                "notifications" -> onOpenWorkspace(WorkspaceDestination.Notifications)
                                "operations" -> onOpenOperations()
                                "profile" -> onSelectTab(MainTab.Profile)
                            }
                        },
                        onActionClick = { action -> pendingAction = action },
                    )
                }
            }
            if (state.sending) {
                item(key = "assistant-loading") {
                    LoadingBlock("AI 助手正在思考")
                }
            }
            state.error?.let { message ->
                item(key = "assistant-error") {
                    FeedbackBanner(message = message, error = true)
                }
            }
        }
        QuickCommandRow(
            onCommand = { command -> onSend(command) },
        )
        AssistantInputBar(
            value = input,
            enabled = !state.sending,
            onValueChange = { input = it },
            onSend = {
                val text = input
                input = ""
                onSend(text)
            },
        )
    }
    pendingAction?.let { action ->
        AlertDialog(
            onDismissRequest = { pendingAction = null },
            title = { Text("确认操作") },
            text = { Text("确认要执行：${assistantActionLabel(action)}？") },
            confirmButton = {
                TextButton(
                    onClick = {
                        onExecuteAction(action)
                        pendingAction = null
                    },
                ) {
                    Text("确认")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingAction = null }) {
                    Text("取消")
                }
            },
        )
    }
}

@Composable
private fun AssistantWelcomeCard() {
    AppPanel {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(
                    Icons.Outlined.AutoAwesome,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp),
                )
                Column {
                    Text(
                        "AI 助手",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    )
                    Text(
                        "可以直接提问，或点下方快捷指令生成今日概览",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.5.sp,
                    )
                }
            }
        }
    }
}

@Composable
private fun QuickCommandRow(onCommand: (String) -> Unit) {
    val commands = listOf(
        "今天怎么安排？",
        "还有哪些待办？",
        "汇总未读告警",
        "备份和资源到期情况",
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = AppPageHorizontalPadding)
            .padding(top = 4.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        commands.forEach { command ->
            Surface(
                onClick = { onCommand(command) },
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.55f),
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Text(
                    command,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    style = MaterialTheme.typography.labelMedium,
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun AssistantMessageBubble(
    message: AssistantChatMessageUi,
    onSuggestionClick: (String) -> Unit,
    onActionClick: (AssistantActionItem) -> Unit,
) {
    val isUser = message.role == "user"
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isUser) Alignment.End else Alignment.Start,
    ) {
        Surface(
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = if (isUser) 18.dp else 6.dp,
                bottomEnd = if (isUser) 6.dp else 18.dp,
            ),
            color = if (isUser) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.6f)
            },
            contentColor = if (isUser) {
                MaterialTheme.colorScheme.onPrimary
            } else {
                MaterialTheme.colorScheme.onSurface
            },
            modifier = Modifier.widthIn(max = 340.dp),
        ) {
            Text(
                text = message.content,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                fontSize = 14.sp,
            )
        }
        if (message.suggestions.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                message.suggestions.forEach { suggestion ->
                    SuggestionChip(
                        suggestion = suggestion,
                        onClick = { onSuggestionClick(suggestion.destination) },
                    )
                }
            }
        }
        if (message.actions.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                message.actions.forEach { action ->
                    ActionChip(
                        action = action,
                        onClick = { onActionClick(action) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ActionChip(
    action: AssistantActionItem,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.6f),
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
    ) {
        Text(
            assistantActionLabel(action),
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            style = MaterialTheme.typography.labelMedium,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun assistantActionLabel(action: AssistantActionItem): String = when (action.type) {
    "create_todo" -> "创建待办「${action.title}」"
    "complete_todo" -> "完成待办「${action.title}」"
    "mark_alerts_read" -> "通知全部标为已读"
    else -> action.title.ifBlank { "执行操作" }
}

@Composable
private fun SuggestionChip(
    suggestion: AssistantSuggestion,
    onClick: () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.55f),
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
    ) {
        Text(
            suggestion.title,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            style = MaterialTheme.typography.labelMedium,
            fontSize = 12.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun AssistantInputBar(
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppPageHorizontalPadding)
            .padding(top = 8.dp, bottom = AppPageBottomSpacing),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = { Text("问问今天怎么安排…") },
            enabled = enabled,
            singleLine = true,
            shape = AppSearchFieldShape,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = MaterialTheme.colorScheme.surface,
                unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
                unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant,
            ),
        )
        val canSend = enabled && value.isNotBlank()
        val primary = MaterialTheme.colorScheme.primary
        val secondary = MaterialTheme.colorScheme.secondary
        val surfaceVariant = MaterialTheme.colorScheme.surfaceVariant
        val onSurfaceVariant = MaterialTheme.colorScheme.onSurfaceVariant
        val outlineVariant = MaterialTheme.colorScheme.outlineVariant
        Box(
            modifier = Modifier
                .size(44.dp)
                .shadow(
                    elevation = if (canSend) 6.dp else 0.dp,
                    shape = CircleShape,
                    clip = false,
                    ambientColor = primary.copy(alpha = 0.35f),
                    spotColor = primary.copy(alpha = 0.35f),
                )
                .clip(CircleShape)
                .background(
                    if (canSend) {
                        Brush.linearGradient(listOf(primary, secondary))
                    } else {
                        SolidColor(surfaceVariant.copy(alpha = 0.6f))
                    },
                )
                .border(
                    1.dp,
                    if (canSend) {
                        Color.White.copy(alpha = 0.4f)
                    } else {
                        outlineVariant.copy(alpha = 0.6f)
                    },
                    CircleShape,
                )
                .clickable(enabled = canSend, onClick = onSend),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.AutoMirrored.Filled.Send,
                contentDescription = "发送",
                tint = if (canSend) {
                    Color.White
                } else {
                    onSurfaceVariant.copy(alpha = 0.4f)
                },
                modifier = Modifier.size(21.dp),
            )
        }
    }
}
