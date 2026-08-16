package cn.pxyb.mycontrol.data

/** 只用于展示规则当前是否命中；真正的执行和审计由 IoT 服务负责。 */
object AutomationEngine {
    fun matches(rule: AutomationRule, devices: List<DeviceInfo>): Boolean {
        val device = devices.firstOrNull { it.id == rule.condition.deviceId } ?: return false
        val actual = when (rule.condition.metric) {
            "temperature" -> device.temperature?.toString()
            "humidity" -> device.humidity?.toString()
            "online" -> if (device.online) "ONLINE" else "OFFLINE"
            "relay" -> rule.condition.relayId?.let { device.relays[it]?.uppercase() }
            else -> null
        } ?: return false
        val expected = rule.condition.value
        return when (rule.condition.operator) {
            "gt" -> actual.toDoubleOrNull()?.let { it > (expected.toDoubleOrNull() ?: return false) } ?: false
            "gte" -> actual.toDoubleOrNull()?.let { it >= (expected.toDoubleOrNull() ?: return false) } ?: false
            "lt" -> actual.toDoubleOrNull()?.let { it < (expected.toDoubleOrNull() ?: return false) } ?: false
            "lte" -> actual.toDoubleOrNull()?.let { it <= (expected.toDoubleOrNull() ?: return false) } ?: false
            "eq" -> actual.equals(expected, ignoreCase = true)
            "neq" -> !actual.equals(expected, ignoreCase = true)
            else -> false
        }
    }
}
