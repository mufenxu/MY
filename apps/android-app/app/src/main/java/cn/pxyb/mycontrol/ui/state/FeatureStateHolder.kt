package cn.pxyb.mycontrol.ui.state

import cn.pxyb.mycontrol.data.ApiException
import cn.pxyb.mycontrol.data.isSchoolAccountRequired
import cn.pxyb.mycontrol.data.shouldInvalidatePlatformSession
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

abstract class FeatureStateHolder<S>(
    parentScope: CoroutineScope,
    private val initialState: S,
    private val onSessionExpired: (String) -> Unit,
    /**
     * 学校账号失效时的回调。默认空实现，只有校园域的 StateHolder 需要注入；
     * 平台会话失效仍走 [onSessionExpired]，两者不可混用。
     */
    private val onSchoolAccountRequired: () -> Unit = {},
) {
    protected val scope = CoroutineScope(parentScope.coroutineContext + SupervisorJob(parentScope.coroutineContext[Job]))
    protected val mutableState = MutableStateFlow(initialState)
    val state = mutableState.asStateFlow()

    fun reset() {
        scope.coroutineContext.cancelChildren()
        mutableState.value = initialState
    }

    fun cancelPending() {
        scope.coroutineContext.cancelChildren()
        mutableState.update(::clearPendingState)
    }

    protected abstract fun clearPendingState(current: S): S

    protected fun handleRequestFailure(error: Throwable) {
        handleFeatureRequestFailure(error, onSessionExpired, onSchoolAccountRequired)
    }

    protected fun <T> launchAction(
        isBusy: S.() -> Boolean,
        start: S.() -> S,
        action: suspend () -> T,
        success: S.(T) -> S,
        failure: S.(Throwable) -> S,
        afterSuccess: () -> Unit = {},
    ) {
        if (mutableState.value.isBusy()) return
        scope.launch {
            mutableState.update { it.start() }
            try {
                val result = action()
                mutableState.update { it.success(result) }
                afterSuccess()
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update { it.failure(error) }
            }
        }
    }
}

internal fun handleFeatureRequestFailure(
    error: Throwable,
    onSessionExpired: (String) -> Unit,
    onSchoolAccountRequired: () -> Unit = {},
) {
    if (error is CancellationException) throw error
    if (error is ApiException && shouldInvalidatePlatformSession(error.status, error.code)) {
        onSessionExpired(error.message ?: "登录会话已失效，请重新登录。")
        throw CancellationException("登录会话已失效。", error)
    }
    // 学校账号失效只拉起弹窗，不中断调用方：页面仍要落到「待连接」空态，
    // 用户取消登录后也能继续浏览其余功能。
    if (error is ApiException && isSchoolAccountRequired(error.status, error.code)) {
        onSchoolAccountRequired()
    }
}
