package cn.pxyb.mycontrol.ui.components.dialog

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
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
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.LocalAdaptiveWindow
import cn.pxyb.mycontrol.ui.theme.BrandBlue
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

// ---------------- 现代统一弹窗 ----------------

/**
 * 全 App 统一的原生极光弹窗体系 (AppDialog / Bottom Sheet Drawer)
 *
 * 1. 手机端自适应为【底部半模态流光抽屉】(Bottom Sheet)，带有顶部 36×4dp 极简拖拽手柄、28dp 大圆角与弹性滑出动效，
 *    彻底解决旧版居中大方块单手难以够到、压迫感强烈的痛点；
 * 2. 平板/折叠大屏端自适应为【沉浸居中悬浮卡片】(最大宽 480dp，四周 24dp 磨砂圆角)，保持大屏视觉焦点；
 * 3. 材质纯正：去除旧版粗暴的彩色彩晕与深色脏阴影，采用 App 原生磨砂底色 + 顶部微高光 + 1dp 发丝白描边；
 * 4. 页眉标配轻巧关闭键与精致微标，底部标配 BrandBlue (#2563EB) 高度统一的胶囊按钮组。
 */
@Composable
fun AppDialog(
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.primary,
    iconBackground: Color = MaterialTheme.colorScheme.primaryContainer,
    title: String? = null,
    subtitle: String? = null,
    contentPadding: PaddingValues = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
    footer: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    Dialog(
        onDismissRequest = onDismissRequest,
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

        val sheetColor = if (dark) {
            MaterialTheme.colorScheme.surface.copy(alpha = 0.94f)
        } else {
            MaterialTheme.colorScheme.surface.copy(alpha = 0.97f)
        }
        val sheetBorder = if (dark) {
            Color.White.copy(alpha = 0.14f)
        } else {
            Color.Black.copy(alpha = 0.08f)
        }
        val topHighlight = Brush.verticalGradient(
            colorStops = arrayOf(
                0.0f to (if (dark) Color.White.copy(alpha = 0.09f) else Color.White.copy(alpha = 0.35f)),
                0.15f to Color.Transparent,
                1.0f to Color.Transparent,
            ),
        )

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
                    onClick = onDismissRequest,
                ),
            contentAlignment = if (isTablet) Alignment.Center else Alignment.BottomCenter,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = if (isTablet) {
                    fadeIn(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing)) +
                        scaleIn(initialScale = 0.94f, animationSpec = tween(MotionTokens.DurationMedium, easing = MotionTokens.EmphasizedDecelerate))
                } else {
                    slideInVertically(
                        initialOffsetY = { it },
                        animationSpec = tween(durationMillis = 260, easing = CubicBezierEasing(0.1f, 0.9f, 0.2f, 1.0f)),
                    ) + fadeIn(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing))
                },
                exit = if (isTablet) {
                    fadeOut(animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing)) +
                        scaleOut(targetScale = 0.96f, animationSpec = tween(MotionTokens.DurationShort, easing = MotionTokens.FastEasing))
                } else {
                    slideOutVertically(
                        targetOffsetY = { it },
                        animationSpec = tween(durationMillis = 200, easing = FastOutSlowInEasing),
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
                            if (isTablet) Modifier.widthIn(max = 480.dp).fillMaxWidth()
                            else Modifier.fillMaxWidth()
                        )
                        .clip(sheetShape)
                        .background(sheetColor)
                        .background(topHighlight)
                        .border(1.dp, sheetBorder, sheetShape),
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
                                        top = if (isTablet) 20.dp else 10.dp,
                                        bottom = 4.dp,
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
                                    verticalArrangement = Arrangement.spacedBy(2.dp),
                                ) {
                                    if (title != null) {
                                        Text(
                                            text = title,
                                            style = MaterialTheme.typography.titleMedium.copy(
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 17.sp,
                                                letterSpacing = (-0.2).sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                    }
                                    if (subtitle != null) {
                                        Text(
                                            text = subtitle,
                                            style = MaterialTheme.typography.bodySmall.copy(
                                                fontSize = 12.5.sp,
                                                lineHeight = 17.sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                                AppHeaderIconButton(
                                    icon = Icons.Outlined.Close,
                                    contentDescription = "关闭",
                                    onClick = onDismissRequest,
                                    size = 32.dp,
                                )
                            }
                        }

                        // 弹窗内容区域
                        Column(
                            modifier = Modifier
                                .weight(1f, fill = false)
                                .fillMaxWidth()
                                .padding(contentPadding),
                            horizontalAlignment = Alignment.Start,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            content()
                        }

                        // 底部操作区
                        if (footer != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 18.dp, vertical = 10.dp),
                            ) {
                                Column(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalArrangement = Arrangement.spacedBy(10.dp),
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
