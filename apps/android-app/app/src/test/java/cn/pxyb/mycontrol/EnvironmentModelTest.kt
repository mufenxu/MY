package cn.pxyb.mycontrol

import cn.pxyb.mycontrol.data.EnvironmentSummary
import cn.pxyb.mycontrol.data.EnvironmentVariable
import cn.pxyb.mycontrol.data.attentionVariables
import cn.pxyb.mycontrol.data.environmentConclusion
import org.junit.Assert.assertEquals
import org.junit.Test

class EnvironmentModelTest {
    @Test
    fun `environment summary uses plain language conclusions`() {
        assertEquals("环境配置正常", environmentConclusion(EnvironmentSummary(available = true, state = "healthy")))
        assertEquals(
            "2 项配置需要处理",
            environmentConclusion(EnvironmentSummary(available = true, state = "attention", missing = 1, verificationFailed = 1)),
        )
        assertEquals(
            "3 项配置等待服务重启",
            environmentConclusion(EnvironmentSummary(available = true, state = "restart_required", restartRequired = 3)),
        )
        assertEquals("环境诊断暂不可用", environmentConclusion(EnvironmentSummary(available = false, state = "unavailable")))
    }

    @Test
    fun `android detail keeps only attention and restart items prominent`() {
        val variables = listOf(
            EnvironmentVariable("OK", "正常配置", "platform", "统一平台", emptyList(), false, false, true, "valid", "配置格式有效。", "loaded", "passed"),
            EnvironmentVariable("MISSING", "缺少配置", "iot", "IoT 服务", listOf("iot-service"), true, true, false, "missing", "尚未配置。", "not_applicable", "failed"),
            EnvironmentVariable("RESTART", "等待重启", "core", "综合服务", listOf("core-api"), false, false, true, "valid", "配置格式有效。", "restart_required", "passed"),
            EnvironmentVariable("INACTIVE", "未启用", "platform", "统一平台", emptyList(), false, false, false, "inactive", "功能未启用。", "not_applicable", "not_applicable"),
        )

        assertEquals(listOf("MISSING", "RESTART"), attentionVariables(variables).map { it.key })
    }
}
