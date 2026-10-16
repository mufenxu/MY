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

    const val DurationTabTransition = 180
    const val DurationNavigation = 200
    const val DurationPress = 75
    const val DurationRelease = 140
    const val DurationExit = 150
    const val PressedScale = 0.995f

    const val DurationShimmer = 1100
    const val DurationStatusRotation = 4000
    const val DurationStatusPulse = 1400

    /** 快速缓动曲线 */
    val FastEasing: Easing = FastOutSlowInEasing

    /** 强调型标准缓动曲线（Material 3 Emphasized Decelerate） */
    val EmphasizedDecelerate: Easing = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1.0f)

    /** 轻抬入场：平滑减速，不产生过冲。 */
    val SmoothEasing: Easing = CubicBezierEasing(0.2f, 0.75f, 0.2f, 1f)

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
    fun <T> standardTween() = tween<T>(DurationMedium, easing = SmoothEasing)
    fun <T> pageTween() = tween<T>(DurationLong, easing = EmphasizedDecelerate)
    fun <T> tabTween() = tween<T>(DurationTabTransition, easing = SmoothEasing)
    fun <T> navigationTween() = tween<T>(DurationNavigation, easing = SmoothEasing)
    fun <T> exitTween() = tween<T>(DurationExit, easing = SmoothEasing)

    /** 展开与手势保持速度连续，但不再回弹。 */
    fun <T> softSpring() = spring<T>(dampingRatio = 1f, stiffness = 420f)

    /** 按下轻压，松开平滑恢复。 */
    fun <T> pressTween() = tween<T>(DurationPress, easing = SmoothEasing)
    fun <T> releaseTween() = tween<T>(DurationRelease, easing = SmoothEasing)

    /** 弹层保留自然减速，长距离进入时不过冲。 */
    fun <T> sheetSpring() = spring<T>(dampingRatio = 1f, stiffness = 380f)

    /** 滚动进度柔性追随，不过冲；宽高与淡入淡出共用一个进度。 */
    fun followSpring() = spring(dampingRatio = 1f, stiffness = 1100f, visibilityThreshold = 0.001f)
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
