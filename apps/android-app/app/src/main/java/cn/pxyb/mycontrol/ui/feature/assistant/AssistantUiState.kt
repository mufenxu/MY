package cn.pxyb.mycontrol.ui.feature.assistant

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.AssistantActionItem
import cn.pxyb.mycontrol.data.AssistantSuggestion
import java.util.UUID

@Immutable
data class AssistantChatMessageUi(
    val id: String = UUID.randomUUID().toString(),
    val role: String,
    val content: String,
    val suggestions: List<AssistantSuggestion> = emptyList(),
    val actions: List<AssistantActionItem> = emptyList(),
)

@Immutable
data class AssistantChatUiState(
    val messages: List<AssistantChatMessageUi> = emptyList(),
    val sending: Boolean = false,
    val error: String? = null,
)
