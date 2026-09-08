package cn.pxyb.mycontrol.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

data class TodoWorkspace(
    val username: String? = null,
    val snapshot: TodoSnapshot = TodoSnapshot(),
    val pendingCount: Int = 0,
)

class TodoRepository(
    context: Context,
    private val api: PlatformApi,
    private val sessionStore: SessionStore,
) {
    private val store = PersonalWorkspaceStore(context)
    private val mutableState = MutableStateFlow(TodoWorkspace())
    val state = mutableState.asStateFlow()

    suspend fun load(): TodoWorkspace = withStore(api.http.currentSession()) {
        publish(readTodoSnapshot(), readPendingTodoMutations())
    }

    suspend fun enqueue(mutation: TodoMutation) = withStore(api.http.currentSession()) {
        enqueueMutation(mutation)
    }

    suspend fun updateTask(id: String, update: (TodoTask) -> TodoTask) = withStore(api.http.currentSession()) {
        val task = applyTodoMutations(readTodoSnapshot(), readPendingTodoMutations()).tasks.firstOrNull { it.id == id }
            ?: return@withStore
        enqueueMutation(TodoMutation("upsert", update(task).copy(updatedAt = System.currentTimeMillis())))
    }

    private fun PersonalWorkspaceStore.enqueueMutation(mutation: TodoMutation): TodoWorkspace {
        val targetId = mutation.task?.id ?: mutation.id
        val pending = readPendingTodoMutations().filterNot { (it.task?.id ?: it.id) == targetId } + mutation
        val snapshot = applyTodoMutations(readTodoSnapshot(), pending)
        // Persist the operation first so an interrupted snapshot write remains recoverable.
        writePendingTodoMutations(pending)
        writeTodoSnapshot(snapshot)
        return publish(snapshot, pending)
    }

    suspend fun sync(refresh: Boolean): TodoWorkspace {
        val session = api.http.currentSession()
        return syncMutex.withLock {
            var local = withStore(session) { publish(readTodoSnapshot(), readPendingTodoMutations()) }
            if (refresh) {
                val response = api.todos()
                local = withStore(session) {
                    val current = readTodoSnapshot()
                    val remote = response.takeIf { it.revision >= current.revision } ?: current
                    val pending = readPendingTodoMutations()
                    val merged = applyTodoMutations(remote, pending)
                    writeTodoSnapshot(merged)
                    publish(merged, pending)
                }
                if (api.isOffline()) return@withLock local
            }
            while (local.pendingCount > 0) {
                val (current, sent) = withStore(session) {
                    readTodoSnapshot() to readPendingTodoMutations().take(MAX_SYNC_OPERATIONS)
                }
                if (sent.isEmpty()) return@withLock withStore(session) { publish(readTodoSnapshot(), emptyList()) }
                val synced = try {
                    api.mutateTodos(current.revision, sent)
                } catch (error: ApiException) {
                    if (error.code != "TODO_REVISION_CONFLICT") throw error
                    val latest = api.todos()
                    if (api.isOffline()) throw error
                    api.mutateTodos(latest.revision, sent)
                }
                local = withStore(session) {
                    // A newer edit of the same task must survive an earlier request's acknowledgement.
                    val remaining = readPendingTodoMutations().filterNot { it in sent }
                    val merged = applyTodoMutations(synced, remaining)
                    writeTodoSnapshot(merged)
                    writePendingTodoMutations(remaining)
                    publish(merged, remaining)
                }
            }
            local
        }
    }

    suspend fun syncPending(): TodoWorkspace = api.withRequestMetadata(allowCache = false) { sync(refresh = false) }.value

    private fun PersonalWorkspaceStore.publish(snapshot: TodoSnapshot, pending: List<TodoMutation>): TodoWorkspace =
        TodoWorkspace(sessionStore.readActiveUsername(), applyTodoMutations(snapshot, pending), pending.size).also {
            mutableState.value = it
        }

    private suspend fun <T> withStore(session: SessionRequest, block: PersonalWorkspaceStore.() -> T): T =
        withContext(Dispatchers.IO) {
            sessionStore.withRequestSession(session) {
                synchronized(dataLock) {
                    store.setAccount(session.username)
                    store.block()
                }
            }
        }

    private companion object {
        const val MAX_SYNC_OPERATIONS = 100
        val syncMutex = Mutex()
        val dataLock = Any()
    }
}

internal fun applyTodoMutations(snapshot: TodoSnapshot, mutations: List<TodoMutation>): TodoSnapshot {
    val tasks = snapshot.tasks.associateBy(TodoTask::id).toMutableMap()
    mutations.forEach { mutation ->
        when (mutation.type) {
            "upsert" -> mutation.task?.let { tasks[it.id] = it }
            "delete" -> mutation.id?.let(tasks::remove)
        }
    }
    return snapshot.copy(tasks = tasks.values.sortedWith(compareBy<TodoTask> { it.completed }.thenBy { it.dueAt ?: Long.MAX_VALUE }))
}
