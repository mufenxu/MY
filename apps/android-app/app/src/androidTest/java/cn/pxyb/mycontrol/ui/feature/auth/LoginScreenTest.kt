package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import cn.pxyb.mycontrol.testing.loginState
import cn.pxyb.mycontrol.ui.theme.MYControlTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * 登录主链路的设备侧回归。
 *
 * 这里只验证「界面契约」：字段可输入、按钮可用性由输入决定、提交把哪些值交给上层。
 * 真实鉴权仍由 JVM 侧策略测试与后端测试负责，测试不触网。
 */
@RunWith(AndroidJUnit4::class)
class LoginScreenTest {

    @get:Rule
    val compose = createComposeRule()

    private data class Attempt(
        val username: String,
        val password: String,
        val factor: String,
        val recoveryCode: Boolean,
    )

    private val attempts = mutableListOf<Attempt>()

    private fun showLoginScreen(state: AppEntryUiState = loginState()) {
        compose.setContent {
            MYControlTheme(darkTheme = false) {
                LoginScreen(
                    state = state,
                    onLogin = { username, password, factor, recoveryCode ->
                        attempts += Attempt(username, password, factor, recoveryCode)
                    },
                    onPasskeyLogin = {},
                    onStartDeviceLogin = {},
                    onCancelDeviceLogin = {},
                    onRetryLoginCapabilities = {},
                    onBackFromSecondFactor = {},
                    onBotChallengeComplete = {},
                    onRecoverAccount = { _, _ -> },
                    onRecoveryCodesSaved = {},
                )
            }
        }
    }

    @Test
    fun 账号密码为空时登录按钮不可点击() {
        showLoginScreen()

        compose.onNodeWithText("账号").assertIsDisplayed()
        compose.onNodeWithText("密码").assertIsDisplayed()
        compose.onNode(hasText("登录") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun 只填账号时登录按钮仍不可点击() {
        showLoginScreen()

        compose.onNodeWithTag("login-username").performTextInput("alice")

        compose.onNode(hasText("登录") and hasClickAction()).assertIsNotEnabled()
    }

    @Test
    fun 账号密码齐全后可提交且回传原始值() {
        showLoginScreen()

        compose.onNodeWithTag("login-username").performTextInput("alice")
        compose.onNodeWithTag("login-password").performTextInput("s3cret!")
        compose.onNode(hasText("登录") and hasClickAction()).assertIsEnabled().performClick()

        assertEquals(listOf(Attempt("alice", "s3cret!", "", false)), attempts)
    }

    @Test
    fun 未完成人机验证时登录按钮保持禁用() {
        showLoginScreen(loginState(botChallengeRequired = true, botChallengeReady = false))

        compose.onNodeWithTag("login-username").performTextInput("alice")
        compose.onNodeWithTag("login-password").performTextInput("s3cret!")

        compose.onNode(hasText("登录") and hasClickAction()).assertIsNotEnabled()
        compose.onNodeWithText("完成人机验证").assertIsDisplayed()
    }

    @Test
    fun 二次验证态下满六位动态码才可提交() {
        showLoginScreen(loginState(secondFactorRequired = true))

        // 二次验证分支不再展示账号密码，只保留动态码入口。
        compose.onNodeWithText("动态验证码 (2FA)").assertIsDisplayed()
        compose.onNode(hasText("验证并登录") and hasClickAction()).assertIsNotEnabled()

        compose.onNodeWithTag("login-factor").performTextInput("123456")

        compose.onNode(hasText("验证并登录") and hasClickAction()).assertIsEnabled()
        // 走输入法的「完成」提交：既能验证键盘提交链路，也不受软键盘遮挡按钮的影响。
        compose.onNodeWithTag("login-factor").performImeAction()

        assertEquals(listOf(Attempt("", "", "123456", false)), attempts)
    }

    @Test
    fun 错误信息展示在登录表单上方() {
        showLoginScreen(loginState(error = "账号或密码错误"))

        compose.onNodeWithText("账号或密码错误").assertIsDisplayed()
    }

    @Test
    fun 建议账号会预填到输入框() {
        showLoginScreen(loginState(suggestedUsername = "remembered"))

        compose.onNodeWithText("remembered").assertIsDisplayed()
    }
}
