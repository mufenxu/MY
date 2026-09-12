package cn.pxyb.mycontrol.ui.feature.assistant

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.outlined.AutoAwesome
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
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.text.input.ImeAction
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
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.components.layout.appContentHeight
import cn.pxyb.mycontrol.ui.components.layout.appContentWidth
import cn.pxyb.mycontrol.ui.components.layout.useTwoPaneLayout
import cn.pxyb.mycontrol.ui.components.feedback.AppTypingDots
import cn.pxyb.mycontrol.ui.components.layout.AppPageBottomSpacing
import cn.pxyb.mycontrol.ui.components.layout.AppPageHorizontalPadding
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSecondaryHeader
import cn.pxyb.mycontrol.ui.components.layout.LocalAppNavigationHandlesBack
import cn.pxyb.mycontrol.ui.components.layout.appPageContentPadding
import cn.pxyb.mycontrol.ui.components.layout.auroraBackdrop
import cn.pxyb.mycontrol.ui.navigation.MainTab
import cn.pxyb.mycontrol.ui.navigation.WorkspaceDestination
import cn.pxyb.mycontrol.ui.theme.AppSearchFieldShape
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

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
    var input by rememberSaveable { mutableStateOf("") }
    var pendingAction by remember { mutableStateOf<AssistantActionItem?>(null) }
    val listState = rememberLazyListState()
    val twoPane = useTwoPaneLayout(1040.dp)

    LaunchedEffect(state.messages.size, state.sending) {
        if (state.messages.isNotEmpty()) {
            listState.animateScrollToItem(state.messages.lastIndex + if (state.sending) 1 else 0)
        }
    }

    AppSubPage(
        title = "AI 助手",
        subtitle = "基于工作台状态回答并跳转",
        onBack = onBack,
        contentPadding = contentPadding,
        pinHeader = true,
        listState = listState,
        body = {
            Row(Modifier.fillMaxSize()) {
                ProvideAppContentLayout(Modifier.weight(1f).fillMaxHeight()) {
                    Column(Modifier.fillMaxSize()) {
                        LazyColumn(
                            state = listState,
                            modifier = Modifier.fillMaxWidth().weight(1f),
                            contentPadding = PaddingValues(horizontal = AppPageHorizontalPadding, vertical = 12.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            if (state.messages.isEmpty()) {
                                item(key = "assistant-welcome") { AssistantWelcomeCard() }
                            } else {
                                items(state.messages, key = { it.id }, contentType = { it.role }) { message ->
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
                                        onActionClick = { pendingAction = it },
                                    )
                                }
                            }
                            if (state.sending) {
                                item(key = "assistant-loading") { AssistantTypingBubble() }
                            }
                            state.error?.let { message ->
                                item(key = "assistant-error") { AppFeedbackBanner(message, error = true) }
                            }
                        }
                        if (!twoPane && appContentHeight() >= 400.dp) {
                            QuickCommandRow(onCommand = onSend, enabled = !state.sending)
                        }
                        AssistantInputBar(
                            value = input,
                            enabled = !state.sending,
                            onValueChange = { input = it },
                            onSend = {
                                val message = input.trim()
                                if (message.isNotEmpty() && !state.sending) {
                                    input = ""
                                    onSend(message)
                                }
                            },
                        )
                    }
                }
                if (twoPane) {
                    Column(
                        modifier = Modifier
                            .width(280.dp)
                            .fillMaxHeight()
                            .verticalScroll(rememberScrollState())
                            .padding(start = 12.dp, end = AppPageHorizontalPadding),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("快捷指令", style = MaterialTheme.typography.titleMedium)
                        assistantQuickCommands.forEach { command ->
                            AppSecondaryButton(
                                text = command,
                                onClick = { onSend(command) },
                                enabled = !state.sending,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        AppPanel {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text("键盘输入", style = MaterialTheme.typography.titleSmall)
                                Text(
                                    "Enter 换行，Ctrl+Enter 发送。操作建议会在确认后执行。",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        },
    )
    pendingAction?.let { action ->
        AppConfirmDialog(
            title = "确认操作",
            detail = "确认要执行：" + assistantActionLabel(action) + "？",
            confirmLabel = "确认",
            icon = Icons.Outlined.AutoAwesome,
            onDismiss = { pendingAction = null },
            onConfirm = {
                onExecuteAction(action)
                pendingAction = null
            },
        )
    }
}

@Composable
private fun AssistantTypingBubble() {
    AppPanel {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            AppTypingDots()
            Text(
                text = "AI 助手正在思考",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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

private val assistantQuickCommands = listOf(
        "今天怎么安排？",
        "还有哪些待办？",
        "汇总未读告警",
        "备份和资源到期情况",
)

@Composable
private fun QuickCommandRow(onCommand: (String) -> Unit, enabled: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = AppPageHorizontalPadding)
            .padding(top = 4.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        assistantQuickCommands.forEach { command ->
            AppSecondaryButton(
                text = command,
                onClick = { onCommand(command) },
                enabled = enabled,
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
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
            modifier = Modifier.widthIn(max = ((appContentWidth() - AppPageHorizontalPadding * 2) * 0.88f).coerceAtMost(640.dp)),
        ) {
            SelectionContainer {
            Text(
                text = message.content,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
            )
            }
        }
        if (message.suggestions.isNotEmpty()) {
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
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
            FlowRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
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
private fun ActionChip(action: AssistantActionItem, onClick: () -> Unit) {
    AppSecondaryButton(text = assistantActionLabel(action), onClick = onClick)
}

private fun assistantActionLabel(action: AssistantActionItem): String = when (action.type) {
    "create_todo" -> "创建待办「${action.title}」"
    "complete_todo" -> "完成待办「${action.title}」"
    "mark_alerts_read" -> "通知全部标为已读"
    else -> action.title.ifBlank { "执行操作" }
}

@Composable
private fun SuggestionChip(suggestion: AssistantSuggestion, onClick: () -> Unit) {
    AppSecondaryButton(text = suggestion.title, onClick = onClick)
}

@Composable
private fun AssistantInputBar(
    value: String,
    enabled: Boolean,
    onValueChange: (String) -> Unit,
    onSend: () -> Unit,
) {
    val canSend = enabled && value.isNotBlank()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = AppPageHorizontalPadding)
            .padding(top = 12.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AppTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .weight(1f)
                .onPreviewKeyEvent { event ->
                    if (event.type == KeyEventType.KeyDown && event.key == Key.Enter &&
                        (event.isCtrlPressed || event.isMetaPressed) && canSend
                    ) {
                        onSend()
                        true
                    } else false
                },
            placeholder = "问问今天怎么安排…",
            enabled = enabled,
            clearable = false,
            singleLine = false,
            maxLines = 4,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (canSend) onSend() }),
        )
        AppHeaderIconButton(
            icon = Icons.AutoMirrored.Filled.Send,
            contentDescription = "发送消息",
            onClick = onSend,
            enabled = canSend,
            size = 48.dp,
            iconSize = 21.dp,
            iconTint = if (canSend) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
            containerColor = if (canSend) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh,
            shape = CircleShape,
        )
    }
}
