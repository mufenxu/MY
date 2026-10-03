package cn.pxyb.mycontrol.ui.components.dialog

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.components.layout.ProvideAppContentLayout
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

enum class AppDialogSize(val maxWidth: Dp) {
    Compact(480.dp),
    Form(720.dp),
    Workspace(1040.dp),
}

/** 统一弹窗：手机底部弹层、大屏居中；主题实色表面与共享进出场动效。 */
@Composable
fun AppDialog(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.primary,
    iconBackground: Color = MaterialTheme.colorScheme.primaryContainer,
    title: String? = null,
    subtitle: String? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 20.dp, vertical = 16.dp),
    size: AppDialogSize = AppDialogSize.Compact,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val visibility = remember { MutableTransitionState(false).apply { targetState = true } }
    var dismissRequested by remember { mutableStateOf(false) }
    val requestDismiss = { dismissRequested = true; visibility.targetState = false }
    LaunchedEffect(visibility.isIdle, visibility.currentState, dismissRequested) {
        if (dismissRequested && visibility.isIdle && !visibility.currentState) onDismissRequest()
    }

    Dialog(
        onDismissRequest = requestDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            decorFitsSystemWindows = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = true,
        ),
    ) {
        val view = LocalView.current
        val dark = isAppInDarkTheme()
        val dimAlpha = if (dark) 0.42f else 0.28f
        SideEffect {
            val window = (view.parent as? DialogWindowProvider)?.window ?: return@SideEffect
            WindowCompat.setDecorFitsSystemWindows(window, false)
            window.setBackgroundDrawable(ColorDrawable(android.graphics.Color.TRANSPARENT))
            window.statusBarColor = android.graphics.Color.TRANSPARENT
            window.navigationBarColor = android.graphics.Color.TRANSPARENT
            window.setDimAmount(dimAlpha)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }

        val adaptive = LocalAdaptiveWindow.current
        val isTablet = adaptive.isTabletOrExpanded

        val sheetColor = MaterialTheme.colorScheme.surface
        val sheetBorder = MaterialTheme.colorScheme.outlineVariant

        val sheetShape = if (isTablet) {
            RoundedCornerShape(24.dp)
        } else {
            RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp, bottomStart = 0.dp, bottomEnd = 0.dp)
        }

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = requestDismiss,
                ),
            contentAlignment = if (isTablet) Alignment.Center else Alignment.BottomCenter,
        ) {
            AnimatedVisibility(
                visibleState = visibility,
                enter = if (isTablet) {
                    fadeIn(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing)) +
                        scaleIn(initialScale = 0.96f, animationSpec = MotionTokens.softSpring())
                } else {
                    slideInVertically(
                        initialOffsetY = { it },
                        animationSpec = MotionTokens.sheetSpring(),
                    ) + fadeIn(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing))
                },
                exit = if (isTablet) {
                    fadeOut(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing)) +
                        scaleOut(targetScale = 0.96f, animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing))
                } else {
                    slideOutVertically(
                        targetOffsetY = { it },
                        animationSpec = tween(durationMillis = MotionTokens.DurationShort, easing = FastOutSlowInEasing),
                    ) + fadeOut(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing))
                },
                modifier = if (isTablet) {
                    Modifier
                        .imePadding()
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .padding(horizontal = 24.dp, vertical = 20.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {},
                        )
                } else {
                    Modifier
                        .imePadding()
                        .windowInsetsPadding(WindowInsets.safeDrawing)
                        .fillMaxWidth()
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {},
                        )
                },
            ) {
                Box(
                    modifier = modifier
                        .then(
                            if (isTablet) Modifier.widthIn(max = size.maxWidth).fillMaxWidth()
                            else Modifier.fillMaxWidth()
                        )
                        .clip(sheetShape)
                        .background(sheetColor)
                        .border(0.5.dp, sheetBorder, sheetShape),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(bottom = if (!isTablet) 8.dp else 0.dp),
                    ) {
                        // 顶部小手柄（仅手机底置模式展示）
                        if (!isTablet) {
                            Box(
                                modifier = Modifier
                                    .padding(top = 10.dp, bottom = 4.dp)
                                    .size(width = 36.dp, height = 4.dp)
                                    .clip(RoundedCornerShape(50))
                                    .background(
                                        if (dark) Color.White.copy(alpha = 0.24f)
                                        else Color.Black.copy(alpha = 0.16f)
                                    )
                                    .align(Alignment.CenterHorizontally),
                            )
                        }

                        // 页眉栏：左侧图标与标题，右侧圆形关闭键
                        if (icon != null || title != null || subtitle != null) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(
                                        start = 20.dp,
                                        end = 16.dp,
                                        top = if (isTablet) 20.dp else 12.dp,
                                        bottom = 12.dp,
                                    ),
                                horizontalArrangement = Arrangement.spacedBy(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                if (icon != null) {
                                    Box(
                                        modifier = Modifier
                                            .size(38.dp)
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(iconBackground.copy(alpha = if (dark) 0.85f else 0.95f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = icon,
                                            contentDescription = null,
                                            tint = iconTint,
                                            modifier = Modifier.size(20.dp),
                                        )
                                    }
                                }
                                Column(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(4.dp),
                                ) {
                                    if (title != null) {
                                        Text(
                                            text = title,
                                            style = MaterialTheme.typography.titleLarge,
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                    }
                                    if (subtitle != null) {
                                        Text(
                                            text = subtitle,
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                fontSize = 13.sp,
                                                lineHeight = 20.sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                AppHeaderIconButton(
                                    icon = Icons.Outlined.Close,
                                    contentDescription = "关闭",
                                    onClick = requestDismiss,
                                    size = 32.dp,
                                )
                            }
                        }

                        // 弹窗内容区域
                        ProvideAppContentLayout(
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .fillMaxWidth()
                                .padding(contentPadding),
                            contentMaxWidth = size.maxWidth,
                        ) {
                            Column(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalAlignment = Alignment.Start,
                                verticalArrangement = Arrangement.spacedBy(12.dp),
                            ) {
                                content()
                            }
                        }

                        // 底部操作区
                        if (footer != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 20.dp, vertical = 12.dp),
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(12.dp),
                                ) {
                                    footer()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
