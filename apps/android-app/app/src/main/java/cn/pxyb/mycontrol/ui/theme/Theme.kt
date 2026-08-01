package cn.pxyb.mycontrol.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = BrandBlue,
    onPrimary = Surface,
    primaryContainer = OceanPale,
    onPrimaryContainer = Ink,
    secondary = BrandGreen,
    onSecondary = Surface,
    secondaryContainer = MintPale,
    onSecondaryContainer = Forest,
    tertiary = BrandAccent,
    onTertiary = AccentInk,
    tertiaryContainer = AmberPale,
    onTertiaryContainer = Ink,
    error = Coral,
    errorContainer = CoralPale,
    onErrorContainer = Ink,
    background = Canvas,
    onBackground = Ink,
    surface = Surface,
    onSurface = Ink,
    surfaceVariant = ColorTokens.SurfaceSubtle,
    onSurfaceVariant = InkMuted,
    outline = Border,
    outlineVariant = ColorTokens.OutlineVariantLight,
)

private val DarkColors = darkColorScheme(
    primary = BrandCyan,
    onPrimary = DarkCanvas,
    primaryContainer = ColorTokens.BlueContainerDark,
    onPrimaryContainer = DarkText,
    secondary = ColorTokens.GreenDark,
    onSecondary = DarkCanvas,
    secondaryContainer = ColorTokens.GreenContainerDark,
    onSecondaryContainer = DarkText,
    tertiary = ColorTokens.AmberDark,
    onTertiary = DarkCanvas,
    tertiaryContainer = ColorTokens.AmberContainerDark,
    onTertiaryContainer = DarkText,
    error = ColorTokens.CoralDark,
    errorContainer = ColorTokens.CoralContainerDark,
    onErrorContainer = DarkText,
    background = DarkCanvas,
    onBackground = DarkText,
    surface = DarkSurface,
    onSurface = DarkText,
    surfaceVariant = DarkSurfaceRaised,
    onSurfaceVariant = DarkMuted,
    outline = DarkBorder,
    outlineVariant = ColorTokens.OutlineVariantDark,
)

object ColorTokens {
    val SurfaceSubtle = androidx.compose.ui.graphics.Color(0xFFF1F5F9)
    val OutlineVariantLight = androidx.compose.ui.graphics.Color(0xFFE2E8F0)
    val OutlineVariantDark = androidx.compose.ui.graphics.Color(0xFF334155)
    val BlueContainerDark = androidx.compose.ui.graphics.Color(0xFF1E3A8A)
    val GreenContainerDark = androidx.compose.ui.graphics.Color(0xFF065F46)
    val AmberContainerDark = androidx.compose.ui.graphics.Color(0xFF78350F)
    val GreenDark = androidx.compose.ui.graphics.Color(0xFF34D399)
    val AmberDark = androidx.compose.ui.graphics.Color(0xFFFBBF24)
    val CoralDark = androidx.compose.ui.graphics.Color(0xFFF87171)
    val CoralContainerDark = androidx.compose.ui.graphics.Color(0xFF7F1D1D)
}

@Composable
fun MYControlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colors.background.toArgb()
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    MaterialTheme(
        colorScheme = colors,
        typography = AppTypography,
        shapes = AppShapes,
        content = content,
    )
}
