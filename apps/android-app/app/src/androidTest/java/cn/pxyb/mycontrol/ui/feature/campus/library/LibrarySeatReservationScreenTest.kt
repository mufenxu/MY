package cn.pxyb.mycontrol.ui.feature.campus.library

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 座位预约页的渲染级回归。
 *
 * 这一屏有千余行、二十多个回调，是最容易在重构中被改坏却无人察觉的地方。
 * 测试只锁两件事：进入即拉取的必要数据，以及三个页签的互相切换。
 */
@RunWith(AndroidJUnit4::class)
class LibrarySeatReservationScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private var overviewLoads = 0
    private var reservationLoads = 0
    private var currentUseLoads = 0

    private fun showScreen(
        state: LibrarySeatUiState = LibrarySeatUiState(),
        initialTab: LibrarySeatTab = LibrarySeatTab.Book,
    ) {
        compose.setContent {
            MYControlTheme(darkTheme = false) {
                LibrarySeatReservationScreen(
                    state = state,
                    initialTab = initialTab,
                    contentPadding = PaddingValues(0.dp),
                    onBack = {},
                    onRefresh = {},
                    onLoadOverview = { overviewLoads++ },
                    onInvalidateQuery = {},
                    onQueryAreas = { _, _, _, _, _, _, _, _ -> },
                    onLoadSeats = { _, _, _, _, _ -> },
                    onQueryFloorSeats = { _, _, _, _, _ -> },
                    onLoadTimeline = { _, _ -> },
                    onSubmitReservation = { _, _ -> },
                    onLoadReservations = { reservationLoads++ },
                    onLoadReservationHistory = {},
                    onLoadMoreHistory = {},
                    onLoadCurrentUse = { currentUseLoads++ },
                    onLoadBreaches = {},
                    onLoadMoreBreaches = {},
                    onLoadDoorLogs = {},
                    onLoadMakeLife = {},
                    onCheckIn = {},
                    onLeaveSeat = {},
                    onStopSeat = {},
                    onCancelReservation = {},
                    onOpenOfficialReservation = {},
                    onLoadWaitlists = {},
                    onCreateWaitlist = { _, _ -> },
                    onSetWaitlistEnabled = { _, _, _ -> },
                    onDeleteWaitlist = { _, _ -> },
                    onClearFeedback = {},
                )
            }
        }
    }

    @Test
    fun 进入页面即拉取概览我的预约与当前使用() {
        showScreen()
        compose.waitForIdle()

        assertEquals(1, overviewLoads)
        assertEquals(1, reservationLoads)
        assertEquals(1, currentUseLoads)
    }

    @Test
    fun 三个页签与查询条件同时可见() {
        showScreen()

        compose.onNodeWithText("查询座位").assertExists()
        compose.onNodeWithText("我的预约").assertExists()
        compose.onNodeWithText("候补预约").assertExists()
        compose.onNodeWithText("场馆").assertExists()
        compose.onNodeWithText("楼层").assertExists()
    }

    @Test
    fun 切到我的预约后隐藏查询条件() {
        showScreen()

        compose.onNodeWithText("我的预约").performClick()

        compose.onNodeWithText("场馆").assertDoesNotExist()
    }
}
