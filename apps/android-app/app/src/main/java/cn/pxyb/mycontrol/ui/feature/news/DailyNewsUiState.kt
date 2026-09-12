package cn.pxyb.mycontrol.ui.feature.news

import androidx.compose.runtime.Immutable
import cn.pxyb.mycontrol.data.DailyNews
import cn.pxyb.mycontrol.ui.AppUiState
import cn.pxyb.mycontrol.ui.DataSection
import cn.pxyb.mycontrol.ui.isRefreshing
import cn.pxyb.mycontrol.ui.sectionError

@Immutable
data class DailyNewsUiState(
    val refreshing: Boolean,
    val error: String?,
    val news: DailyNews?,
)

internal fun AppUiState.toDailyNewsUiState() = DailyNewsUiState(
    refreshing = isRefreshing(DataSection.DailyNews),
    error = sectionError(DataSection.DailyNews),
    news = dailyNews,
)
