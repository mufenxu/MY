package cn.pxyb.mycontrol.ui.feature.campus.account

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 学校账号短信登录弹窗的设备侧回归。
 *
 * 这里锁的是「输入到什么程度才允许提交」这条契约：手机号没填满、验证码不满 6 位、
 * 还没有发码就提交，界面必须挡住而不是把无效请求发到学校。这类门限改坏在编译期
 * 发现不了，只能靠界面断言。
 *
 * 按约定只断言界面契约：不连后端、不依赖真实手机号，网络与倒计时由 JVM 单测负责。
 */
@RunWith(AndroidJUnit4::class)
class SchoolAccountLoginDialogTest {

    @get:Rule
    val compose = createComposeRule()

    private var sendRequests = 0
    private var verifyRequests = 0
    private var resendRequests = 0
    private var backRequests = 0
    private var dismissRequests = 0

    /** 输入后按软键盘的完成键提交：底部按钮可能被键盘遮挡，点按容易随机失败。 */
    private fun typeAndSubmit(tag: String, text: String) {
        compose.onNodeWithTag(tag).performTextInput(text)
        compose.onNodeWithTag(tag).performImeAction()
    }

    private fun showDialog(initial: SchoolAccountUiState) {
        compose.setContent {
            var state by remember { mutableStateOf(initial) }
            MYControlTheme(darkTheme = false) {
                SchoolAccountLoginDialog(
                    state = state,
                    onDismiss = { dismissRequests++ },
                    onPhoneChange = { state = state.copy(phone = it, error = null) },
                    onCodeChange = { state = state.copy(code = it, error = null) },
                    onSendCode = { sendRequests++ },
                    onResendCode = { resendRequests++ },
                    onBackToPhone = { backRequests++ },
                    onVerify = { verifyRequests++ },
                )
            }
        }
    }

    @Test
    fun hiddenStateRendersNothing() {
        showDialog(SchoolAccountUiState(visible = false))

        compose.onNodeWithTag(SCHOOL_ACCOUNT_PHONE_TAG).assertDoesNotExist()
        compose.onNodeWithTag(SCHOOL_ACCOUNT_CODE_TAG).assertDoesNotExist()
    }

    @Test
    fun phoneStageSubmitsOnlyWhenTheNumberIsComplete() {
        showDialog(SchoolAccountUiState(visible = true))

        typeAndSubmit(SCHOOL_ACCOUNT_PHONE_TAG, "13800138000")
        assertEquals(1, sendRequests)

        compose.onNodeWithTag(SCHOOL_ACCOUNT_PHONE_TAG).assertExists()
        compose.onNodeWithTag(SCHOOL_ACCOUNT_CODE_TAG).assertDoesNotExist()
    }

    @Test
    fun incompletePhoneDoesNotTriggerSending() {
        showDialog(SchoolAccountUiState(visible = true))

        typeAndSubmit(SCHOOL_ACCOUNT_PHONE_TAG, "1380")

        assertEquals(0, sendRequests)
    }

    @Test
    fun codeStageSubmitsOnlyWithASixDigitCode() {
        showDialog(
            SchoolAccountUiState(
                visible = true,
                phase = SchoolAccountPhase.Code,
                phone = "13800138000",
                maskedPhone = "138****8000",
                pendingId = "pending-1",
            )
        )

        typeAndSubmit(SCHOOL_ACCOUNT_CODE_TAG, "123456")
        assertEquals(1, verifyRequests)

        compose.onNodeWithTag(SCHOOL_ACCOUNT_PHONE_TAG).assertDoesNotExist()
    }

    @Test
    fun shortCodeDoesNotTriggerVerification() {
        showDialog(
            SchoolAccountUiState(
                visible = true,
                phase = SchoolAccountPhase.Code,
                phone = "13800138000",
                pendingId = "pending-1",
            )
        )

        typeAndSubmit(SCHOOL_ACCOUNT_CODE_TAG, "12345")

        assertEquals(0, verifyRequests)
        assertEquals(0, resendRequests)
        assertEquals(0, backRequests)
        assertEquals(0, dismissRequests)
    }
}
