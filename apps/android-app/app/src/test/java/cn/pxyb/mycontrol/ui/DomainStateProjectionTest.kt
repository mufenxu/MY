package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.CampusFreeClassrooms
import cn.pxyb.mycontrol.data.CampusOverview
import cn.pxyb.mycontrol.data.CampusTimetable
import cn.pxyb.mycontrol.data.PlatformPasskey
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.TotpEnrollment
import cn.pxyb.mycontrol.ui.feature.account.AccountSecurityUiState
import cn.pxyb.mycontrol.ui.feature.account.toAccountManagementUiState
import cn.pxyb.mycontrol.ui.feature.campus.CampusDataUiState
import cn.pxyb.mycontrol.ui.feature.campus.toFreeClassroomUiState
import cn.pxyb.mycontrol.ui.feature.google.GoogleAccountsUiState
import cn.pxyb.mycontrol.ui.feature.google.toGoogleAccountDeskUiState
import cn.pxyb.mycontrol.ui.feature.workspace.toTodayUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 领域状态拆出 [AppUiState] 之后，界面投影必须真的接上新数据源。
 * 这里只锁「字段确实来自领域状态」这一点，投影里的 section 状态不在此测。
 */
class DomainStateProjectionTest {
    @Test
    fun `google desk projection reads accounts and pending migration from the domain state`() {
        val domain = GoogleAccountsUiState(
            accounts = emptyList(),
            loading = true,
            migrationPending = true,
            error = "读取失败",
        )

        val projected = domain.toGoogleAccountDeskUiState(busyAction = "google-accounts")

        assertEquals("google-accounts", projected.busyAction)
        assertEquals(true, projected.googleAccountMigrationPending)
        assertEquals(true, projected.loading)
        assertEquals("读取失败", projected.error)
    }

    @Test
    fun `account management projection reads security flow state`() {
        val securityFlow = AccountSecurityUiState(
            totpEnrollment = TotpEnrollment(secret = "SECRET", uri = "otpauth://x", qrDataUrl = null, expiresAt = null),
            recoveryCodes = listOf("AAAA-BBBB"),
            passkeys = listOf(PlatformPasskey(id = "pk1", name = "手机", deviceType = null, createdAt = null, lastUsedAt = null)),
            reauthenticatedUntil = 1_700_000_000_000,
        )

        val projected = AppUiState().toAccountManagementUiState(securityFlow)

        assertEquals("SECRET", projected.totpEnrollment?.secret)
        assertEquals(listOf("AAAA-BBBB"), projected.recoveryCodes)
        assertEquals("pk1", projected.passkeys.single().id)
        assertEquals(1_700_000_000_000, projected.reauthenticatedUntil)
    }

    @Test
    fun `today projection reads campus cache instead of AppUiState`() {
        val campus = CampusDataUiState(
            timetable = CampusTimetable(courses = emptyList()),
            overview = CampusOverview(cardBalance = "42.00"),
            freeClassrooms = CampusFreeClassrooms(rooms = 7),
            resourceExpiries = listOf(ResourceExpiry(id = "r1", type = "云服务", name = "云主机", expiresAt = "2026-11-01", advanceNoticeDays = 3)),
        )

        val today = AppUiState().toTodayUiState(campus)
        val freeClassroom = AppUiState().toFreeClassroomUiState(campus)

        assertEquals(campus.timetable, today.timetable)
        assertEquals("42.00", today.campusOverview?.cardBalance)
        assertEquals(1, today.resourceExpiries.size)
        assertEquals(7, freeClassroom.result?.rooms)
        assertNull(AppUiState().toFreeClassroomUiState(CampusDataUiState()).result)
    }
}
