package cn.pxyb.mycontrol.ui.feature.campus

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.ui.state.FeatureStateHolder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.update

/**
 * 校园数据缓存。
 *
 * 迁移自 [cn.pxyb.mycontrol.ui.AppUiState] 的 4 个平铺字段。这四项都是「多屏共享的只读数据」：
 * 课程表喂课表组件与提醒，概览把 GPA/校园生活/电费三路结果合并成一个对象，
 * 空教室与资源到期同时出现在今日、运维与全局搜索里，所以放在同一个 StateHolder 里合并写入，
 * 避免各处 `copy(campusOverview = ...)` 互相覆盖。
 *
 * 没有忙碌/错误标记：刷新节奏由 `SectionRefreshController` 的 section 状态统一管理。
 */
@Immutable
data class CampusDataUiState(
    val timetable: CampusTimetable? = null,
    val overview: CampusOverview? = null,
    val freeClassrooms: CampusFreeClassrooms? = null,
    val resourceExpiries: List<ResourceExpiry> = emptyList(),
)

class CampusDataStateHolder(
    parentScope: CoroutineScope,
    private val api: PlatformApi,
    onSessionExpired: (String) -> Unit,
    onSchoolAccountRequired: () -> Unit = {},
) : FeatureStateHolder<CampusDataUiState>(parentScope, CampusDataUiState(), onSessionExpired, onSchoolAccountRequired) {
    /** 纯数据缓存，没有需要撤销的「进行中」标记。 */
    override fun clearPendingState(current: CampusDataUiState): CampusDataUiState = current

    suspend fun reloadTimetable() {
        val timetable = api.campus.campusTimetable()
        mutableState.update { it.copy(timetable = timetable) }
    }

    suspend fun reloadGpa() {
        val gpa = api.campus.campusGpa()
        updateOverview { it.copy(gpa = gpa) }
    }

    /** 首页概览用的空教室：同时补进概览与用户主动查询的结果位。 */
    suspend fun reloadFreeClassrooms() {
        val classrooms = api.campus.campusFreeClassrooms()
        mutableState.update {
            it.copy(
                overview = (it.overview ?: CampusOverview()).copy(freeClassrooms = classrooms),
                freeClassrooms = it.freeClassrooms ?: classrooms,
            )
        }
    }

    suspend fun reloadCampusLife() {
        val life = api.campus.campusLife()
        updateOverview { it.copy(cardBalance = life.cardBalance, waterCode = life.waterCode, dormitory = life.dormitory) }
    }

    suspend fun reloadCampusEnergy() {
        val energy = api.campus.campusEnergy()
        updateOverview { it.copy(energyBalance = energy.balance, energyRoom = energy.room) }
    }

    /** 用户主动查询空教室（可按日期/节次/楼栋过滤）。 */
    suspend fun queryFreeClassrooms(dayplus: Int, sections: List<Int>, building: String) {
        val result = api.campus.campusFreeClassrooms(dayplus, sections, building)
        mutableState.update { it.copy(freeClassrooms = result) }
    }

    suspend fun reloadResourceExpiries() = setResourceExpiries(api.resourceExpiries())

    fun setResourceExpiries(resources: List<ResourceExpiry>) {
        mutableState.update { it.copy(resourceExpiries = resources) }
    }

    private fun updateOverview(transform: (CampusOverview) -> CampusOverview) {
        mutableState.update { it.mergingOverview(transform) }
    }
}

/**
 * 首页刷新空教室时的合并规则：概览里的默认条件结果总是更新，
 * 但用户主动查询过的结果位保持不动，否则下拉刷新会把筛选结果冲掉。
 */
internal fun CampusDataUiState.mergingFreeClassrooms(classrooms: CampusFreeClassrooms) = copy(
    overview = (overview ?: CampusOverview()).copy(freeClassrooms = classrooms),
    freeClassrooms = freeClassrooms ?: classrooms,
)

/** 校园概览是按字段逐步补全的，任何一路回来都只覆盖自己那几个字段。 */
internal fun CampusDataUiState.mergingOverview(transform: (CampusOverview) -> CampusOverview) =
    copy(overview = transform(overview ?: CampusOverview()))
