package cn.pxyb.mycontrol.ui.feature.campus.timetable

import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

private val LightCoursePalette = listOf(
    ColorTokens.BlueLight, ColorTokens.GreenLight, ColorTokens.PurpleLight,
    ColorTokens.OrangeLight, ColorTokens.CyanLight, ColorTokens.PinkLight, ColorTokens.AmberLight,
)

private val DarkCoursePalette = listOf(
    ColorTokens.BlueDark, ColorTokens.GreenDark, ColorTokens.PurpleDark,
    ColorTokens.OrangeDark, ColorTokens.CyanDark, ColorTokens.PinkDark, ColorTokens.AmberDark,
)

@Composable
internal fun getCourseColorScheme(courseName: String): cn.pxyb.mycontrol.ui.theme.AccentColors {
    val palette = if (isAppInDarkTheme()) DarkCoursePalette else LightCoursePalette
    val index = kotlin.math.abs(courseName.hashCode()) % palette.size
    return palette[index]
}
