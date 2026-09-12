package cn.pxyb.mycontrol.ui.feature.campus.water

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusWaterBill
import cn.pxyb.mycontrol.data.CampusWaterValve

@Immutable
data class WaterValveUiState(
    val refreshing: Boolean = false,
    val busy: Boolean = false,
    val valve: CampusWaterValve = CampusWaterValve(),
    val bill: CampusWaterBill? = null,
    val billLoading: Boolean = false,
    val billError: String? = null,
    val error: String? = null,
    val message: String? = null,
)
