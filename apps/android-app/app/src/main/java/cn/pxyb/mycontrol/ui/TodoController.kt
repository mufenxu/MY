package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.TodoMutation
import cn.pxyb.mycontrol.data.TodoRepository
import cn.pxyb.mycontrol.data.TodoTask
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class TodoController(
    parentScope: CoroutineScope,
    private val repository: TodoRepository,
    private val appState: MutableStateFlow<AppUiState>,
    private val onSessionExpired: (String) -> Unit,
) {
    private val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    private val mutationMutex = Mutex()

    init {
        parentScope.launch {
            repository.state.collect { workspace ->
                appState.update { current ->
                    if (workspace.username == null || current.user?.username != workspace.username || current.locked) current
                    else current.copy(todoSnapshot = workspace.snapshot, pendingTodoMutations = workspace.pendingCount)
                }
            }
        }
    }

    fun cancelPending() = scope.coroutineContext.cancelChildren()

    suspend fun load() = repository.load()

    suspend fun refresh() = repository.sync(refresh = true)

    fun save(task: TodoTask) {
        if (task.title.isBlank()) return
        mutateLocal {
            repository.enqueue(TodoMutation("upsert", task.copy(title = task.title.trim(), updatedAt = System.currentTimeMillis())))
        }
    }

    fun toggle(id: String) = mutateLocal { repository.updateTask(id) { it.copy(completed = !it.completed) } }

    fun delete(id: String) = mutateLocal { repository.enqueue(TodoMutation("delete", id = id)) }

    private fun mutateLocal(block: suspend () -> Unit) {
        val current = appState.value
        if (current.user == null || current.locked || current.busyAction == "logout") return
        scope.launch {
            var saved = false
            try {
                mutationMutex.withLock { block() }
                saved = true
                appState.update { it.copy(message = "待办已保存，正在同步。", error = null) }
                repository.syncPending()
                appState.update { it.copy(message = "待办已同步。") }
            } catch (error: Throwable) {
                handleFeatureRequestFailure(error, onSessionExpired)
                appState.update {
                    if (saved && error is IOException) it.copy(message = "已离线保存，联网后自动同步。")
                    else it.copy(error = error.message ?: "待办暂未同步，请稍后重试。")
                }
            }
        }
    }
}
