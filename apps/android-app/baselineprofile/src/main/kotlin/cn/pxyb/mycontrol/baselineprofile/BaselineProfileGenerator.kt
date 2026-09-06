package cn.pxyb.mycontrol.baselineprofile

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import androidx.benchmark.macro.BaselineProfileMode
import androidx.benchmark.macro.CompilationMode
import androidx.benchmark.macro.MacrobenchmarkScope
import androidx.benchmark.macro.StartupMode
import androidx.benchmark.macro.StartupTimingMetric
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.benchmark.macro.junit4.MacrobenchmarkRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Direction
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val baselineProfileRule = BaselineProfileRule()

    @Before
    fun prepare() = prepareOfflineAccount()

    @Test
    fun generateStartupProfile() = baselineProfileRule.collect(
        packageName = PACKAGE,
        includeInStartupProfile = true,
        profileBlock = {
            openHome()
        },
    )

    @Test
    fun generateInteractionProfile() = baselineProfileRule.collect(
        packageName = PACKAGE,
        includeInStartupProfile = false,
    ) {
        openHome()
        scrollList()
        device.findObject(By.text("设备")).click()
        check(device.wait(Until.hasObject(By.text("本地验证器")), 10_000)) { "设备页未就绪" }
        device.findObject(By.text("本地验证器")).click()
        check(device.wait(Until.hasObject(By.text("离线生成 TOTP 动态验证码")), 10_000)) { "验证器页未就绪" }
        device.pressBack()
        check(device.wait(Until.hasObject(By.text("我的")), 10_000)) { "返回设备页失败" }
        device.findObject(By.text("我的")).click()
        check(device.wait(Until.hasObject(By.text("账号与安全")), 10_000)) { "我的页面未就绪" }
        scrollList()
        startActivityAndWait(Intent(Intent.ACTION_VIEW, Uri.parse("mycontrol://open?tab=notifications"))
            .setComponent(ComponentName(PACKAGE, MAIN_ACTIVITY)))
        check(device.wait(Until.hasObject(By.textContains("示例通知")), 10_000)) { "通知列表未加载" }
        scrollList()
        device.pressBack()
    }
}

@RunWith(AndroidJUnit4::class)
class StartupBenchmark {

    @get:Rule
    val macrobenchmarkRule = MacrobenchmarkRule()

    @Before
    fun prepare() = prepareOfflineAccount()

    @Test
    fun coldStartupWithInstalledProfile() = macrobenchmarkRule.measureRepeated(
        packageName = PACKAGE,
        metrics = listOf(StartupTimingMetric()),
        compilationMode = CompilationMode.Partial(baselineProfileMode = BaselineProfileMode.Require),
        startupMode = StartupMode.COLD,
        iterations = 5,
        setupBlock = { pressHome() },
        measureBlock = { openHome() },
    )
}

private fun prepareOfflineAccount() {
    val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    device.executeShellCommand("am start -W -n $PACKAGE/cn.pxyb.mycontrol.benchmark.BenchmarkFixtureActivity")
    check(device.wait(Until.hasObject(By.text("基准数据已准备")), 20_000)) { "基准数据初始化未完成" }
    device.pressHome()
}

private fun MacrobenchmarkScope.openHome() {
    startActivityAndWait(Intent().setComponent(ComponentName(PACKAGE, MAIN_ACTIVITY))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK))
    check(device.wait(Until.hasObject(By.text("设备")), 20_000)) { "工作台未就绪" }
}

private fun MacrobenchmarkScope.scrollList() {
    listOf(Direction.DOWN, Direction.UP).forEach { direction ->
        device.waitForIdle()
        val list = device.wait(Until.findObject(By.scrollable(true)), 5_000) ?: error("未找到可滚动列表")
        list.setGestureMargin(device.displayWidth / 5)
        list.scroll(direction, 0.8f)
        device.waitForIdle()
    }
}

private const val PACKAGE = "cn.pxyb.mycontrol.benchmark"
private const val MAIN_ACTIVITY = "cn.pxyb.mycontrol.MainActivity"
