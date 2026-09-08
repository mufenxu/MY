package cn.pxyb.mycontrol.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

// Primary Tech Accent Colors
val BrandBlue = Color(0xFF2563EB)
val BrandCyan = Color(0xFF3B82F6)
val BrandLightBlue = Color(0xFF60A5FA)
val BrandGreen = Color(0xFF10B981)
val BrandAccent = Color(0xFFF59E0B)
val AccentInk = Color(0xFF0F172A)

val Forest = Color(0xFF059669)
val ForestSoft = Color(0xFF10B981)
val Mint = Color(0xFF34D399)
val MintPale = Color(0xFFD1FAE5)
val Ink = Color(0xFF0F172A)
val InkMuted = Color(0xFF475569)
val Canvas = Color(0xFFF6F8FD)
val Surface = Color(0xFFFFFFFF)
val Border = Color(0xFFE2E8F0)
val Coral = Color(0xFFEF4444)
val CoralPale = Color(0xFFFEE2E2)
val Amber = Color(0xFFD97706)
val AmberPale = Color(0xFFFEF3C7)
val Ocean = BrandBlue
val OceanPale = Color(0xFFEFF6FF)

val DarkCanvas = Color(0xFF0F172A)
val DarkSurface = Color(0xFF1E293B)
val DarkSurfaceRaised = Color(0xFF334155)
val DarkBorder = Color(0xFF334155)
val DarkText = Color(0xFFF8FAFC)
val DarkMuted = Color(0xFFB4C0D2)

@Immutable
data class AccentColors(
    val foreground: Color,
    val container: Color,
    val border: Color,
)

object ColorTokens {
    val SurfaceSubtle = Color(0xFFF1F5F9)
    val SurfaceDim = Color(0xFFE2E8F0)
    val SurfaceContainerLow = Color(0xFFF8FAFC)
    val SurfaceContainer = Color(0xFFF1F5F9)
    val SurfaceContainerHigh = Color(0xFFE9EEF5)
    val SurfaceContainerHighest = Color(0xFFE2E8F0)
    val DarkSurfaceLowest = Color(0xFF0B1220)
    val DarkSurfaceLow = Color(0xFF172033)
    val DarkSurfaceHigh = Color(0xFF263449)
    val OutlineLight = Color(0xFF64748B)
    val OutlineDark = Color(0xFF71839C)
    val OutlineVariantLight = Border
    val OutlineVariantDark = DarkBorder

    // 每组文字、底色和边框一起切换，避免夜间出现浅色块或低对比度文字。
    val BlueLight = AccentColors(BrandBlue, OceanPale, Color(0xFFBFDBFE))
    val BlueDark = AccentColors(Color(0xFF93C5FD), Color(0xFF1C3355), Color(0xFF365780))
    val GreenLight = AccentColors(Color(0xFF047857), Color(0xFFECFDF5), Color(0xFFA7F3D0))
    val GreenDark = AccentColors(Color(0xFF6EE7B7), Color(0xFF133C32), Color(0xFF2D6450))
    val AmberLight = AccentColors(Color(0xFF92400E), Color(0xFFFFFBEB), Color(0xFFFDE68A))
    val AmberDark = AccentColors(Color(0xFFFCD34D), Color(0xFF44321C), Color(0xFF78572C))
    val RedLight = AccentColors(Color(0xFFB91C1C), Color(0xFFFEF2F2), Color(0xFFFECACA))
    val RedDark = AccentColors(Color(0xFFFCA5A5), Color(0xFF48272E), Color(0xFF7D414C))
    val PurpleLight = AccentColors(Color(0xFF6D28D9), Color(0xFFF5F3FF), Color(0xFFDDD6FE))
    val PurpleDark = AccentColors(Color(0xFFC4B5FD), Color(0xFF33294D), Color(0xFF5B487C))
    val SkyLight = AccentColors(Color(0xFF0369A1), Color(0xFFF0F9FF), Color(0xFFBAE6FD))
    val SkyDark = AccentColors(Color(0xFF7DD3FC), Color(0xFF18394E), Color(0xFF2D617D))
    val TealLight = AccentColors(Color(0xFF0F766E), Color(0xFFF0FDFA), Color(0xFF99F6E4))
    val TealDark = AccentColors(Color(0xFF5EEAD4), Color(0xFF153B3A), Color(0xFF306460))
    val IndigoLight = AccentColors(Color(0xFF4338CA), Color(0xFFEEF2FF), Color(0xFFC7D2FE))
    val IndigoDark = AccentColors(Color(0xFFA5B4FC), Color(0xFF293153), Color(0xFF4C5985))
    val OrangeLight = AccentColors(Color(0xFF9A3412), Color(0xFFFFF7ED), Color(0xFFFED7AA))
    val OrangeDark = AccentColors(Color(0xFFFDBA74), Color(0xFF462E24), Color(0xFF78503B))
    val PinkLight = AccentColors(Color(0xFFBE185D), Color(0xFFFDF2F8), Color(0xFFFBCFE8))
    val PinkDark = AccentColors(Color(0xFFF9A8D4), Color(0xFF452A40), Color(0xFF774764))
    val CyanLight = AccentColors(Color(0xFF0E7490), Color(0xFFECFEFF), Color(0xFFA5F3FC))
    val CyanDark = AccentColors(Color(0xFF67E8F9), Color(0xFF173B45), Color(0xFF30616F))

    val Blue: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) BlueDark else BlueLight
    val Green: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) GreenDark else GreenLight
    val Amber: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) AmberDark else AmberLight
    val Red: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) RedDark else RedLight
    val Purple: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) PurpleDark else PurpleLight
    val Sky: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) SkyDark else SkyLight
    val Teal: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) TealDark else TealLight
    val Indigo: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) IndigoDark else IndigoLight
    val Orange: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) OrangeDark else OrangeLight
    val Pink: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) PinkDark else PinkLight
    val Cyan: AccentColors
        @Composable @ReadOnlyComposable get() = if (isAppInDarkTheme()) CyanDark else CyanLight
}
