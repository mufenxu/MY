package cn.pxyb.mycontrol.ui.components.feedback

import androidx.compose.runtime.staticCompositionLocalOf

/** 页面向应用级提示（外壳顶部的 [AppToast]）投递一条短反馈的入口。 */
fun interface AppFeedbackHost {
    fun show(message: String, error: Boolean)
}

/**
 * 业务页面的一次性短提示统一走这里，不再直接调用系统 Toast，保证位置和样式一致。
 * 认证外壳负责提供实现；未提供时（预览、单测）静默忽略。
 */
val LocalAppFeedback = staticCompositionLocalOf { AppFeedbackHost { _, _ -> } }
