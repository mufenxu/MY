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

private val LightColors = lightColorScheme(
    primary = Forest,
    onPrimary = Surface,
    primaryContainer = MintPale,
    onPrimaryContainer = Forest,
    secondary = Ocean,
    onSecondary = Surface,
    secondaryContainer = OceanPale,
    onSecondaryContainer = Ocean,
    tertiary = Amber,
    onTertiary = Surface,
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
)

private val DarkColors = darkColorScheme(
    primary = Mint,
    onPrimary = Forest,
    primaryContainer = ForestSoft,
    onPrimaryContainer = DarkText,
    secondary = ColorTokens.OceanDark,
    onSecondary = DarkCanvas,
    secondaryContainer = ColorTokens.OceanContainerDark,
    onSecondaryContainer = DarkText,
    tertiary = ColorTokens.AmberDark,
    onTertiary = DarkCanvas,
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
)

object ColorTokens {
    val SurfaceSubtle = androidx.compose.ui.graphics.Color(0xFFF0F3F1)
    val OceanDark = androidx.compose.ui.graphics.Color(0xFF8BC6DE)
    val OceanContainerDark = androidx.compose.ui.graphics.Color(0xFF1F4556)
    val AmberDark = androidx.compose.ui.graphics.Color(0xFFF0C26F)
    val CoralDark = androidx.compose.ui.graphics.Color(0xFFFFB4AE)
    val CoralContainerDark = androidx.compose.ui.graphics.Color(0xFF6A302D)
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
            window.navigationBarColor = colors.background.toArgb()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
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

