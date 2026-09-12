package cn.pxyb.mycontrol.ui.feature.campus.water

import cn.pxyb.mycontrol.data.CampusWaterValve
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class WaterValveStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    private val canRun: () -> Boolean,
    onSessionExpired: (String) -> Unit,
) : FeatureStateHolder<WaterValveUiState>(parentScope, WaterValveUiState(), onSessionExpired) {
    private val waterValveMutex = Mutex()
    private var waterBillJob: Job? = null

    override fun clearPendingState(current: WaterValveUiState) =
        current.copy(refreshing = false, busy = false, billLoading = false)

    fun refreshWaterValve(force: Boolean = false) {
        if (!canRun() || mutableState.value.refreshing) return
        scope.launch {
            waterValveMutex.withLock {
                if (!force && mutableState.value.valve.bound) return@withLock
                mutableState.update { it.copy(refreshing = true, error = null) }
                try {
                    val valve = api.withRequestMetadata { api.campus.campusWaterValve() }.value
                    mutableState.update {
                        it.copy(
                            valve = valve,
                            error = valve.error,
                        )
                    }
                } catch (error: Throwable) {
                    handleRequestFailure(error)
                    mutableState.update {
                        it.copy(
                            error = error.message ?: "饮水机状态加载失败，请重试。",
                        )
                    }
                } finally {
                    if (isActive) mutableState.update { it.copy(refreshing = false) }
                }
            }
        }
    }

    fun refreshWaterBill(month: String, force: Boolean = false) {
        if (!canRun()) return
        waterBillJob?.cancel()
        if (!force && mutableState.value.bill?.month == month) {
            mutableState.update { it.copy(billLoading = false) }
            return
        }
        waterBillJob = scope.launch {
            mutableState.update { it.copy(billLoading = true, billError = null) }
            try {
                val bill = api.withRequestMetadata { api.campus.campusWaterBill(month) }.value
                mutableState.update {
                    it.copy(
                        bill = bill,
                        billError = bill.error,
                    )
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update {
                    it.copy(
                        billError = error.message ?: "生活用水账单加载失败，请重试。",
                    )
                }
            } finally {
                if (isActive) mutableState.update { it.copy(billLoading = false) }
            }
        }
    }

    fun bindWaterValve(rawCode: String) = runWaterValveAction(
        successMessage = "饮水机绑定成功",
        failureMessage = "饮水机绑定失败，请重试。",
        action = { api.campus.bindCampusWaterValve(rawCode) },
    )

    fun openWaterValve(seqNo: String) = runWaterValveAction(
        successMessage = "饮水机已开启",
        failureMessage = "饮水机开启失败，请重试。",
        action = { api.campus.openCampusWaterValve(seqNo) },
    )

    fun closeWaterValve(seqNo: String) = runWaterValveAction(
        successMessage = "饮水机已关闭",
        failureMessage = "饮水机关闭失败，请重试。",
        action = { api.campus.closeCampusWaterValve(seqNo) },
    )

    fun unbindWaterValve(seqNo: String) = runWaterValveAction(
        successMessage = "饮水机绑定已删除",
        failureMessage = "饮水机绑定删除失败，请重试。",
        action = { api.campus.unbindCampusWaterValve(seqNo) },
    )

    fun reorderWaterValves(seqNos: List<String>) = runWaterValveAction(
        successMessage = "饮水机排序已保存",
        failureMessage = "饮水机排序保存失败，请重试。",
        action = { api.campus.reorderCampusWaterValves(seqNos) },
    )

    private fun runWaterValveAction(
        successMessage: String,
        failureMessage: String,
        action: suspend () -> CampusWaterValve,
    ) {
        if (!canRun() || mutableState.value.busy) return
        mutableState.update {
            it.copy(busy = true, error = null, message = null)
        }
        scope.launch {
            try {
                waterValveMutex.withLock {
                    val valve = api.withRequestMetadata(allowCache = false) { action() }.value
                    mutableState.update {
                        it.copy(
                            valve = valve,
                            message = successMessage,
                        )
                    }
                }
            } catch (error: Throwable) {
                handleRequestFailure(error)
                mutableState.update { it.copy(error = error.message ?: failureMessage) }
            } finally {
                if (isActive) mutableState.update { it.copy(busy = false) }
            }
        }
    }

    fun clearWaterValveFeedback() {
        mutableState.update { it.copy(error = null, message = null) }
    }
}
