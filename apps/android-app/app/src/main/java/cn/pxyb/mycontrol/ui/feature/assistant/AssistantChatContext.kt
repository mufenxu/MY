package cn.pxyb.mycontrol.ui.feature.assistant

import cn.pxyb.mycontrol.data.activeUnreadCount
import cn.pxyb.mycontrol.data.isSnoozedAt
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataUiState
import java.time.LocalDate
import org.json.JSONObject

/**
 * 组装发给 AI 助手的上下文 JSON。
 *
 * 这张表直接决定助手「知不知道用户今天有什么课、哪些待办没做、备份还健不健康」，
 * 少一个字段就是一次答非所问。此前它藏在 [cn.pxyb.mycontrol.ui.AppViewModel] 里，
 * 既测不到也看不出漏了什么，所以抽成纯函数：不碰 IO、不读时间以外的全局状态。
 */
internal fun buildAssistantChatContext(
    state: AppUiState,
    campus: CampusDataUiState,
    today: LocalDate = LocalDate.now(),
    nowMillis: Long = System.currentTimeMillis(),
): JSONObject = JSONObject().apply {
    put("date", today.toString())
    put("generatedAt", nowMillis)
    state.assistantSnapshot?.let { snapshot ->
        put("nextActionTitle", snapshot.nextAction.title)
        put("nextActionDetail", snapshot.nextAction.detail)
        put("nextActionDestination", snapshot.nextAction.destination.deepLinkValue)
        put("morningBrief", snapshot.morningBrief)
        put("eveningBrief", snapshot.eveningBrief)
    }
    val pendingTodos = state.todoSnapshot.tasks.filter { !it.completed }
    if (pendingTodos.isNotEmpty()) {
        put("pendingTodoCount", pendingTodos.size)
        put("pendingTodos", pendingTodos.take(8).joinToString("；") { it.title })
    }
    val courses = campus.timetable?.courses.orEmpty()
    if (courses.isNotEmpty()) {
        put("timetable", courses.take(12).joinToString("；") { course ->
            "${course.dayName} ${course.timeRange} ${course.courseName} @ ${course.location}"
        })
    }
    val activeIncidents = state.activeIncidents
    if (activeIncidents.isNotEmpty()) {
        put("incidents", activeIncidents.take(6).joinToString("；") { "${it.severity} ${it.title}" })
    }
    // 未读与「稍后提醒」都按同一个时间点判定：这里若各自取 System.currentTimeMillis()，
    // 长耗时组装时会出现「角标算未读、明细却已排除」的自相矛盾。
    val unreadAlerts = state.alerts.activeUnreadCount(nowMillis)
    put("unreadAlertCount", unreadAlerts)
    if (unreadAlerts > 0) {
        put(
            "recentAlerts",
            state.alerts.filter { !it.read && !it.isSnoozedAt(nowMillis) }.take(6).joinToString("；") { it.title },
        )
    }
    campus.resourceExpiries.takeIf { it.isNotEmpty() }?.let { expiries ->
        put("resourceExpiries", expiries.take(6).joinToString("；") { "${it.type} ${it.name} 于 ${it.expiresAt} 到期" })
    }
    state.backup?.let { backup ->
        put("backupAgeHours", backup.ageHours?.toString() ?: "未知")
        put("backupRpoState", backup.rpoState)
        put("backupValidCount", backup.validBackups)
    }
}
