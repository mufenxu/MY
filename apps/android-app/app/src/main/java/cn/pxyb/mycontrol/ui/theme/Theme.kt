package cn.pxyb.mycontrol.ui.theme

import android.app.Activity
import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColors = lightColorScheme(
    primary = HomeFocusBlue,
    onPrimary = Surface,
    primaryContainer = ColorTokens.PrimaryContainerLight,
    onPrimaryContainer = Ink,
    secondary = ColorTokens.GreenLight.foreground,
    onSecondary = Surface,
    secondaryContainer = ColorTokens.GreenLight.container,
    onSecondaryContainer = ColorTokens.GreenLight.foreground,
    tertiary = ColorTokens.AmberLight.foreground,
    onTertiary = Surface,
    tertiaryContainer = ColorTokens.AmberLight.container,
    onTertiaryContainer = ColorTokens.AmberLight.foreground,
    error = ColorTokens.RedLight.foreground,
    onError = Surface,
    errorContainer = ColorTokens.RedLight.container,
    onErrorContainer = ColorTokens.RedLight.foreground,
    background = ColorTokens.BackgroundLight,
    onBackground = ColorTokens.TextLight,
    surface = ColorTokens.AppSurfaceLight,
    onSurface = ColorTokens.TextLight,
    surfaceVariant = ColorTokens.FieldSurfaceLight,
    onSurfaceVariant = ColorTokens.TextMutedLight,
    outline = ColorTokens.OutlineLight,
    outlineVariant = ColorTokens.AppOutlineLight,
    surfaceTint = HomeFocusBlue,
    inverseSurface = DarkSurface,
    inverseOnSurface = DarkText,
    inversePrimary = ColorTokens.BlueDark.foreground,
    surfaceDim = ColorTokens.SurfaceDim,
    surfaceBright = Surface,
    surfaceContainerLowest = Surface,
    surfaceContainerLow = ColorTokens.ContainerLowLight,
    surfaceContainer = ColorTokens.AppSurfaceLight,
    surfaceContainerHigh = ColorTokens.ContainerHighLight,
    surfaceContainerHighest = ColorTokens.ContainerHighestLight,
)

private val DarkColors = darkColorScheme(
    primary = ColorTokens.PrimaryDark,
    onPrimary = DarkCanvas,
    primaryContainer = ColorTokens.PrimaryContainerDark,
    onPrimaryContainer = ColorTokens.BlueDark.foreground,
    secondary = ColorTokens.GreenDark.foreground,
    onSecondary = DarkCanvas,
    secondaryContainer = ColorTokens.GreenDark.container,
    onSecondaryContainer = ColorTokens.GreenDark.foreground,
    tertiary = ColorTokens.AmberDark.foreground,
    onTertiary = DarkCanvas,
    tertiaryContainer = ColorTokens.AmberDark.container,
    onTertiaryContainer = ColorTokens.AmberDark.foreground,
    error = ColorTokens.RedDark.foreground,
    onError = DarkCanvas,
    errorContainer = ColorTokens.RedDark.container,
    onErrorContainer = ColorTokens.RedDark.foreground,
    background = ColorTokens.BackgroundDark,
    onBackground = ColorTokens.TextDark,
    surface = ColorTokens.AppSurfaceDark,
    onSurface = ColorTokens.TextDark,
    surfaceVariant = ColorTokens.FieldSurfaceDark,
    onSurfaceVariant = ColorTokens.TextMutedDark,
    outline = ColorTokens.OutlineDark,
    outlineVariant = ColorTokens.AppOutlineDark,
    surfaceTint = ColorTokens.PrimaryDark,
    inverseSurface = ColorTokens.SurfaceContainerHighest,
    inverseOnSurface = Ink,
    inversePrimary = BrandBlue,
    surfaceDim = DarkCanvas,
    surfaceBright = DarkSurfaceRaised,
    surfaceContainerLowest = ColorTokens.DarkSurfaceLowest,
    surfaceContainerLow = ColorTokens.ContainerLowDark,
    surfaceContainer = ColorTokens.AppSurfaceDark,
    surfaceContainerHigh = ColorTokens.ContainerHighDark,
    surfaceContainerHighest = ColorTokens.ContainerHighestDark,
)

private val LocalAppDarkTheme = staticCompositionLocalOf { false }

@Composable
@ReadOnlyComposable
fun isAppInDarkTheme(): Boolean = LocalAppDarkTheme.current

@Composable
fun MYControlTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    val colors = if (darkTheme) DarkColors else LightColors
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.setBackgroundDrawable(ColorDrawable(colors.background.toArgb()))
            window.statusBarColor = android.graphics.Color.TRANSPARENT
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
    CompositionLocalProvider(
        LocalAppDarkTheme provides darkTheme,
        LocalContentColor provides colors.onBackground,
    ) {
        MaterialTheme(
            colorScheme = colors,
            typography = AppTypography,
            shapes = AppShapes,
            content = content,
        )
    }
}
