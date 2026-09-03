package cn.pxyb.mycontrol.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Easing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType

/**
 * 设计系统统一动效令牌 (Motion Tokens)
 * 规范应用内过渡、展开、弹窗与反馈动画的节奏与时长
 */
object MotionTokens {
    /** 轻量微交互时长（如按钮缩放、指示器切换、图标旋转）：160ms */
    const val DurationShort = 160

    /** 标准组件过渡时长（如卡片展开、淡入淡出、Tab内容切换）：240ms */
    const val DurationMedium = 240

    /** 页面级大转场/全屏弹窗时长：320ms */
    const val DurationLong = 320

    /** 快速缓动曲线 */
    val FastEasing: Easing = FastOutSlowInEasing

    /** 强调型标准缓动曲线（Material 3 Emphasized Decelerate） */
    val EmphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1.0f)

    /** 标准平滑弹簧规范 */
    val StandardSpring: SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioNoBouncy,
        stiffness = Spring.StiffnessMedium,
    )

    /** 轻微弹性弹簧规范（用于图标选中跳动、手势回弹） */
    val BouncySpring: SpringSpec<Float> = spring(
        dampingRatio = Spring.DampingRatioMediumBouncy,
        stiffness = Spring.StiffnessMediumLow,
    )

    fun <T> fastTween() = tween<T>(DurationShort, easing = FastEasing)
    fun <T> standardTween() = tween<T>(DurationMedium, easing = EmphasizedDecelerate)
    fun <T> pageTween() = tween<T>(DurationLong, easing = EmphasizedDecelerate)
}

/**
 * 触觉反馈工具助手 (Haptic Feedback)
 * 提供标准化、低侵入的振动感知体验
 */
object AppHaptics {
    /** 适用于开关切换、底部导航Tab切换、单选框切换等微触感 */
    fun tick(haptics: HapticFeedback?) {
        runCatching {
            haptics?.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    /** 适用于下拉刷新到达触发临界点时的齿轮感 */
    fun refreshSnap(haptics: HapticFeedback?) {
        runCatching {
            haptics?.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        }
    }

    /** 适用于长按、危险操作删除、二次确认等较强触感 */
    fun heavy(haptics: HapticFeedback?) {
        runCatching {
            haptics?.performHapticFeedback(HapticFeedbackType.LongPress)
        }
    }
}
