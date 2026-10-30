package cn.pxyb.mycontrol.ui.feature.campus.account

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 短信登录弹窗的可提交判定。
 *
 * 这里锁定的是「什么时候允许发码 / 允许提交」这条界面契约：按钮可点但服务端必然
 * 拒绝的情况（手机号位数不对、验证码没填满、还没发码就提交）必须提前挡住。
 */
class SchoolAccountUiStateTest {

    @Test
    fun `valid mainland mobile numbers unlock sending`() {
        assertTrue(SchoolAccountUiState(phone = "13800138000").phoneValid)
        assertTrue(SchoolAccountUiState(phone = "19912345678").phoneValid)
        assertTrue(SchoolAccountUiState(phone = "13800138000").canSend)
    }

    @Test
    fun `incomplete or non mainland numbers stay blocked`() {
        assertFalse(SchoolAccountUiState(phone = "1380013800").phoneValid)
        assertFalse(SchoolAccountUiState(phone = "23800138000").phoneValid)
        assertFalse(SchoolAccountUiState(phone = "").phoneValid)
        assertFalse(SchoolAccountUiState(phone = "1380013800").canSend)
    }

    @Test
    fun `sending is blocked while cooling down or already challenged`() {
        val phone = "13800138000"
        assertFalse(SchoolAccountUiState(phone = phone, cooldownSeconds = 42).canSend)
        assertFalse(SchoolAccountUiState(phone = phone, sending = true).canSend)
        assertFalse(SchoolAccountUiState(phone = phone, pendingId = "pending-1").canSend)
    }

    @Test
    fun `verification needs a full six digit code and a pending challenge`() {
        val ready = SchoolAccountUiState(phase = SchoolAccountPhase.Code, pendingId = "pending-1", code = "123456")
        assertTrue(ready.canVerify)

        assertFalse(ready.copy(code = "12345").canVerify)
        assertFalse(ready.copy(pendingId = "").canVerify)
        assertFalse(ready.copy(verifying = true).canVerify)
    }
}
