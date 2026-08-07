package cn.pxyb.mycontrol.ui

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

class AuthenticatedShellInsetsTest {
    @Test
    fun secondaryPageKeepsEverySafeDrawingInset() {
        val insets = resolveAuthenticatedShellInsets(
            safeTop = 28.dp,
            safeStart = 6.dp,
            safeEnd = 8.dp,
            safeBottom = 34.dp,
            isSubScreen = true,
        )

        assertEquals(28.dp, insets.navigationTop)
        assertEquals(6.dp, insets.navigationStart)
        assertEquals(8.dp, insets.navigationEnd)
        assertEquals(50.dp, insets.contentBottom)
    }

    @Test
    fun mainPageKeepsNavigationClearOfTheGestureArea() {
        val insets = resolveAuthenticatedShellInsets(
            safeTop = 24.dp,
            safeStart = 0.dp,
            safeEnd = 0.dp,
            safeBottom = 30.dp,
            isSubScreen = false,
        )

        assertEquals(120.dp, insets.contentBottom)
    }
}
