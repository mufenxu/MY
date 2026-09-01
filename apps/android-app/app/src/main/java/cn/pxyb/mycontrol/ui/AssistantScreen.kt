package cn.pxyb.mycontrol.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
) {
    BackHandler(onBack = onBack)
    var input by rememberSaveable { mutableStateOf("") }
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
                    AssistantWelcomeCard(
                        onExample = { example -> onSend(example) },
                    )
                }
            } else {
                itemsIndexed(
                    state.messages,
                    key = { index, _ -> "assistant-message-$index" },
                    contentType = { _, message -> message.role },
                ) { _, message ->
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
}

@Composable
private fun AssistantWelcomeCard(onExample: (String) -> Unit) {
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
                        "可以结合课表、待办、告警和备份状态回答你的问题",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.5.sp,
                    )
                }
            }
            val examples = listOf(
                "我今天有什么安排？",
                "我还有哪些待办没完成？",
                "帮我总结一下未读告警",
                "系统备份和资源到期情况怎么样？",
            )
            examples.forEach { example ->
                Surface(
                    onClick = { onExample(example) },
                    shape = AppSearchFieldShape,
                    color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.55f),
                    contentColor = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        example,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        fontSize = 13.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}

@Composable
private fun AssistantMessageBubble(
    message: AssistantChatMessageUi,
    onSuggestionClick: (String) -> Unit,
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
    }
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
        IconButton(
            onClick = onSend,
            enabled = enabled && value.isNotBlank(),
            modifier = Modifier.size(44.dp),
        ) {
            Icon(
                Icons.Outlined.Send,
                contentDescription = "发送",
                tint = if (value.isNotBlank()) {
                    MaterialTheme.colorScheme.primary
                } else {
                    MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                },
            )
        }
    }
}
