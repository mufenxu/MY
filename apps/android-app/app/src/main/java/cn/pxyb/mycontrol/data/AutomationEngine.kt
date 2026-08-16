package cn.pxyb.mycontrol.data

import androidx.compose.runtime.Immutable

object AutomationEngine {

    /**
     * 根据当前系统告警、离线设备与触发阈值，评估已启用的自动化联动规则。
     */
    fun evaluateRules(
        rules: List<AutomationRule>,
        activeIncidents: List<IncidentInfo>,
        offlineDeviceCount: Int,
        currentTimeMillis: Long = System.currentTimeMillis(),
    ): List<AutomationTriggerResult> {
        if (rules.isEmpty()) return emptyList()

        val results = mutableListOf<AutomationTriggerResult>()

        for (rule in rules) {
            if (!rule.enabled) continue

            var isMatched = false
            var matchReason = ""

            when (rule.triggerType) {
                "incident" -> {
                    val criticalCount = activeIncidents.count {
                        rule.triggerValue.isBlank() || it.severity.equals(rule.triggerValue, ignoreCase = true)
                    }
                    if (criticalCount > 0) {
                        isMatched = true
                        matchReason = "检测到 $criticalCount 项满足条件的系统告警"
                    }
                }
                "device_offline" -> {
                    val minThreshold = rule.triggerValue.toIntOrNull() ?: 1
                    if (offlineDeviceCount >= minThreshold) {
                        isMatched = true
                        matchReason = "检测到 $offlineDeviceCount 台设备离线"
                    }
                }
                "schedule" -> {
                    val lastTrigger = rule.lastTriggeredAt ?: 0L
                    if (currentTimeMillis - lastTrigger >= 3600_000L) {
                        isMatched = true
                        matchReason = "计划任务周期触发"
                    }
                }
            }

            if (isMatched) {
                results.add(
                    AutomationTriggerResult(
                        rule = rule,
                        matchedReason = matchReason,
                        triggeredAt = currentTimeMillis
                    )
                )
            }
        }

        return results
    }
}

@Immutable
data class AutomationTriggerResult(
    val rule: AutomationRule,
    val matchedReason: String,
    val triggeredAt: Long,
)
