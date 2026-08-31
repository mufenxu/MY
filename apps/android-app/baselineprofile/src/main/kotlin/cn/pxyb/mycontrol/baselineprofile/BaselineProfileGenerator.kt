package cn.pxyb.mycontrol.baselineprofile

import android.content.ComponentName
import android.content.Intent
import androidx.benchmark.macro.junit4.BaselineProfileRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {

    @get:Rule
    val baselineProfileRule = BaselineProfileRule()

    @Test
    fun generateStartupProfile() = baselineProfileRule.collect(
        packageName = "cn.pxyb.mycontrol",
        includeInStartupProfile = true,
        profileBlock = {
            startActivityAndWait(
                Intent().setComponent(
                    ComponentName("cn.pxyb.mycontrol", "cn.pxyb.mycontrol.MainActivity"),
                ),
            )
        },
    )
}
