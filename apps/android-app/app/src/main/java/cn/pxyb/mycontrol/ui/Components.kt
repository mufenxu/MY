package cn.pxyb.mycontrol.ui

import androidx.compose.runtime.Immutable

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material.icons.rounded.Check
import androidx.compose.ui.semantics.Role
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.material3.minimumInteractiveComponentSize
import cn.pxyb.mycontrol.ui.theme.AppHaptics
import cn.pxyb.mycontrol.ui.theme.MotionTokens
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.unit.sp
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import cn.pxyb.mycontrol.data.ServiceInfo
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.distinctUntilChanged
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val PlatformTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")
    .withZone(ZoneId.systemDefault())

@Immutable
data class StatusStyle(
    val label: String,
    val foreground: Color,
    val background: Color,
    val icon: ImageVector,
)

val AppCardShape = RoundedCornerShape(18.dp)
val AppSearchFieldShape = RoundedCornerShape(20.dp)
private val AppDialogShape = RoundedCornerShape(24.dp)

/** 统一按压反馈：按下轻微缩放，松开时用柔和弹性恢复。 */
@Composable
fun Modifier.pressFeedback(
    interactionSource: MutableInteractionSource,
    pressedScale: Float = 0.97f,
): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale = animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "press-scale",
    )
    return this.graphicsLayer {
        val currentScale = scale.value
        scaleX = currentScale
        scaleY = currentScale
    }
}

@Composable
fun statusStyle(status: String): StatusStyle = when (status.lowercase()) {
    "healthy", "operational", "succeeded", "success", "passed", "resolved", "connected", "online" ->
        StatusStyle(
            "正常",
            MaterialTheme.colorScheme.secondary,
            MaterialTheme.colorScheme.secondaryContainer,
            Icons.Outlined.CheckCircle,
        )
    "critical", "failed", "failure", "offline", "outage", "error", "breached" ->
        StatusStyle(
            "异常",
            MaterialTheme.colorScheme.error,
            MaterialTheme.colorScheme.errorContainer,
            Icons.Outlined.ErrorOutline,
        )
    "warning", "degraded", "action_required", "overdue", "unhealthy" ->
        StatusStyle(
            "需关注",
            MaterialTheme.colorScheme.tertiary,
            MaterialTheme.colorScheme.tertiaryContainer,
            Icons.Outlined.WarningAmber,
        )
    "running", "pending", "queued", "acknowledged", "in_progress" ->
        StatusStyle(
            "处理中",
            MaterialTheme.colorScheme.primary,
            MaterialTheme.colorScheme.primaryContainer,
            Icons.Outlined.Schedule,
        )
    else -> StatusStyle("未确认", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant, Icons.Outlined.Schedule)
}

@Composable
fun StatusBadge(status: String, label: String? = null, modifier: Modifier = Modifier) {
    val style = statusStyle(status)
    Surface(
        modifier = modifier,
        color = style.background,
        contentColor = style.foreground,
        shape = RoundedCornerShape(10.dp),
        border = BorderStroke(0.5.dp, style.foreground.copy(alpha = 0.2f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(style.icon, contentDescription = null, modifier = Modifier.size(13.dp))
            Text(
                label ?: style.label,
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp)
            )
        }
    }
}

@Composable
fun AppPanel(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Card(
        modifier = Modifier
            .clip(AppCardShape)
            .then(modifier)
            .then(
                if (onClick != null) {
                    Modifier
                        .pressFeedback(interactionSource)
                        .clickable(
                            interactionSource = interactionSource,
                            indication = LocalIndication.current,
                            onClick = onClick,
                        )
                } else {
                    Modifier
                }
            )
            .fillMaxWidth(),
        shape = AppCardShape,
        colors = CardDefaults.cardColors(containerColor = glassCardColor()),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        content()
    }
}

@Composable
fun AppNotificationButton(
    unreadCount: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        AppHeaderIconButton(
            icon = Icons.Outlined.Notifications,
            contentDescription = if (unreadCount > 0) "通知中心，$unreadCount 条未读" else "通知中心",
            onClick = onClick,
        )
        val badge = unreadBadgeLabel(unreadCount)
        if (badge.isNotEmpty()) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = 4.dp, y = (-3).dp)
                    .heightIn(min = 18.dp)
                    .semantics { contentDescription = "$unreadCount 条未读通知" },
                shape = CircleShape,
                color = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onError,
            ) {
                Box(
                    modifier = Modifier.padding(horizontal = 5.dp, vertical = 1.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = badge,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

@Composable
fun AdaptiveMetricGrid(
    itemCount: Int,
    maxColumns: Int,
    modifier: Modifier = Modifier,
    content: @Composable RowScope.(Int) -> Unit,
) {
    BoxWithConstraints(modifier = modifier) {
        val columns = metricGridColumnCount(maxWidth, LocalDensity.current.fontScale, maxColumns)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            (0 until itemCount).chunked(columns).forEach { rowItems ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    rowItems.forEach { index -> content(index) }
                    repeat(columns - rowItems.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
fun SectionHeader(
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                ),
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (!subtitle.isNullOrBlank()) {
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall.copy(
                        fontSize = 11.5.sp,
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun MetricCell(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
) {
    val displayValueColor = if (isSystemInDarkTheme()) lerp(valueColor, Color.White, 0.28f) else valueColor
    Column(modifier = modifier.padding(vertical = 2.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(3.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 16.5.sp,
            ),
            color = displayValueColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun IconTile(icon: ImageVector, tint: Color, background: Color, modifier: Modifier = Modifier) {
    val darkTheme = isSystemInDarkTheme()
    val contentTint = if (darkTheme) lerp(tint, Color.White, 0.3f) else tint
    val container = if (darkTheme) {
        contentTint.copy(alpha = 0.16f).compositeOver(MaterialTheme.colorScheme.surface)
    } else {
        background
    }
    Box(
        modifier = modifier
            .size(44.dp)
            .background(container, MaterialTheme.shapes.medium),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = contentTint, modifier = Modifier.size(22.dp))
    }
}

@Composable
fun FeedbackBanner(
    message: String,
    error: Boolean,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    val foreground = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer
    val background = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer
    val haptics = LocalHapticFeedback.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(background, RoundedCornerShape(16.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(9.dp),
    ) {
        Icon(
            if (error) Icons.Outlined.ErrorOutline else Icons.Outlined.CheckCircle,
            contentDescription = null,
            tint = foreground,
            modifier = Modifier.size(18.dp),
        )
        Text(message, style = MaterialTheme.typography.bodyMedium, color = foreground, modifier = Modifier.weight(1f))
        if (onRetry != null) {
            Surface(
                onClick = {
                    AppHaptics.tick(haptics)
                    onRetry()
                },
                modifier = Modifier
                    .minimumInteractiveComponentSize()
                    .pressFeedback(remember { MutableInteractionSource() }, pressedScale = 0.94f),
                shape = RoundedCornerShape(8.dp),
                color = foreground.copy(alpha = 0.14f),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        Icons.Outlined.Refresh,
                        contentDescription = "重试",
                        tint = foreground,
                        modifier = Modifier.size(14.dp),
                    )
                    Text(
                        "重试",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = foreground,
                    )
                }
            }
        }
    }
}

/**
 * 标准毛玻璃微光骨架卡片 (GlassShimmerCard)
 * 具备与 AppPanel 一致的 20.dp 圆角、发丝描边和毛玻璃底色，带有平滑扫过的流光动效
 */
@Composable
fun GlassShimmerCard(
    modifier: Modifier = Modifier,
    height: Dp = 72.dp,
    shape: RoundedCornerShape = RoundedCornerShape(20.dp),
) {
    val dark = isSystemInDarkTheme()
    val glass = rememberGlassPalette(radius = 20.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .glassPanel(glass)
            .clip(shape)
            .glassShimmer(dark),
    )
}

/**
 * 列表微光骨架屏 (GlassShimmerList)
 * 一键生成指定数量的骨架卡片流，间距严格对齐 12.dp 规范，避免布局突兀跳动
 */
@Composable
fun GlassShimmerList(
    itemCount: Int = 3,
    modifier: Modifier = Modifier,
    itemHeight: Dp = 72.dp,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        repeat(itemCount) {
            GlassShimmerCard(height = itemHeight)
        }
    }
}

@Composable
fun LoadingBlock(label: String, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier.fillMaxWidth().padding(vertical = 28.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
        Text(label, modifier = Modifier.padding(start = 10.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

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
        val dark = isSystemInDarkTheme()
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
                        .statusBarsPadding()
                        .navigationBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 20.dp)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = {},
                        )
                } else {
                    Modifier
                        .imePadding()
                        .navigationBarsPadding()
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

/** 弹窗主操作按钮：对齐 BrandBlue 官方科技蓝与 46dp 标准高度。 */
// ---------------- 全 App 现代统一按钮体系 (方案 A：极光流光玻璃胶囊) ----------------

/**
 * 全 App 现代主行动按钮 (Aurora Glass Pill)
 *
 * 采用方案 A 极光流光全圆角胶囊：
 * 1. 形状：全圆角胶囊 RoundedCornerShape(50)；
 * 2. 材质：以 BrandBlue 为基准的主题主色，饱满圆润；
 * 3. 触感：内置 pressFeedback 物理弹性微缩放 + AppHaptics.tick 细腻微触感；
 * 4. 状态：支持可选图标 icon、loading 加载平滑 Spinner、enabled 禁用态。
 */
@Composable
fun AppButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: Shape = RoundedCornerShape(50),
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .height(height)
            .pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(
            defaultElevation = 0.dp,
            pressedElevation = 0.dp,
            focusedElevation = 0.dp,
            hoveredElevation = 0.dp,
            disabledElevation = 0.dp,
        ),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary,
            disabledContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.38f),
            disabledContentColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.75f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onPrimary,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.5.sp,
                    letterSpacing = (-0.1).sp,
                )
            }
        }
    }
}

/**
 * 全 App 现代次要行动按钮 (Frosted Glass Pill)
 *
 * 采用通透半透明磨砂质感 + 1dp 发丝描边 + 50% 胶囊圆角，悬浮在极光背景上，主次分明。
 */
@Composable
fun AppSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: Shape = RoundedCornerShape(50),
) {
    val dark = isSystemInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }

    val bgColor = if (dark) Color.White.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.65f)
    val borderColor = if (dark) Color.White.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.08f)

    Button(
        onClick = {
            AppHaptics.tick(haptics)
            onClick()
        },
        modifier = modifier
            .height(height)
            .pressFeedback(interactionSource)
            .border(1.dp, borderColor, shape),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = bgColor,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.5.sp,
                    letterSpacing = (-0.1).sp,
                )
            }
        }
    }
}

/**
 * 全 App 现代危险警示按钮 (Rose Glass Pill)
 *
 * 柔和玫瑰浅底 + 珊瑚红文字与发丝描边，全圆角胶囊形态。
 */
@Composable
fun AppDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true,
    loading: Boolean = false,
    height: Dp = 46.dp,
    shape: Shape = RoundedCornerShape(50),
) {
    val haptics = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val dark = isSystemInDarkTheme()

    val bgColor = if (dark) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.7f)
    val borderColor = if (dark) MaterialTheme.colorScheme.error.copy(alpha = 0.35f) else MaterialTheme.colorScheme.error.copy(alpha = 0.2f)

    Button(
        onClick = {
            AppHaptics.heavy(haptics)
            onClick()
        },
        modifier = modifier
            .height(height)
            .pressFeedback(interactionSource)
            .border(1.dp, borderColor, shape),
        interactionSource = interactionSource,
        enabled = enabled && !loading,
        shape = shape,
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = bgColor,
            contentColor = MaterialTheme.colorScheme.error,
            disabledContainerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f),
            disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp),
    ) {
        if (loading) {
            CircularProgressIndicator(
                modifier = Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp),
                        tint = MaterialTheme.colorScheme.error,
                    )
                }
                Text(
                    text = text,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.5.sp,
                    letterSpacing = (-0.1).sp,
                )
            }
        }
    }
}

/** 弹窗主操作按钮：对齐全圆角胶囊与 46dp 标准高度。 */
@Composable
fun AppDialogPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}

/** 弹窗次要操作按钮：半透明磨砂全圆角胶囊。 */
@Composable
fun AppDialogSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppSecondaryButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}

/** 弹窗危险操作按钮：柔和危险色全圆角胶囊。 */
@Composable
fun AppDialogDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    AppDangerButton(
        text = text,
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        loading = busy,
        height = 46.dp,
        shape = RoundedCornerShape(50),
    )
}

// ---------------- 滑动时间选择器（研讨间 / 座位预约共用） ----------------

internal fun reservationTimeMinutes(value: String): Int? {
    val match = Regex("^(\\d{1,2}):([0-5]\\d)$").matchEntire(value.trim()) ?: return null
    val minutes = match.groupValues[1].toInt() * 60 + match.groupValues[2].toInt()
    return minutes.takeIf { it in 0..1440 }
}

internal fun formatMinutesToTime(minutes: Int): String {
    val clamped = minutes.coerceIn(0, 1440)
    val h = clamped / 60
    val m = clamped % 60
    return String.format(Locale.ROOT, "%02d:%02d", h, m)
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun <T> WheelPicker(
    items: List<T>,
    selectedIndex: Int,
    onSelectedIndexChanged: (Int) -> Unit,
    modifier: Modifier = Modifier,
    visibleItemCount: Int = 3,
    itemHeight: androidx.compose.ui.unit.Dp = 44.dp,
    unitText: String? = null,
    formatItem: (T) -> String = { it.toString() },
) {
    val listState = rememberLazyListState(
        initialFirstVisibleItemIndex = selectedIndex.coerceIn(0, (items.size - 1).coerceAtLeast(0)),
    )
    val flingBehavior = rememberSnapFlingBehavior(lazyListState = listState)
    val coroutineScope = rememberCoroutineScope()

    val centerIndex by remember(items) {
        derivedStateOf {
            val layoutInfo = listState.layoutInfo
            val visibleItems = layoutInfo.visibleItemsInfo
            if (visibleItems.isEmpty()) return@derivedStateOf selectedIndex
            val viewportCenter = (layoutInfo.viewportStartOffset + layoutInfo.viewportEndOffset) / 2
            val closest = visibleItems.minByOrNull { item ->
                val itemCenter = item.offset + item.size / 2
                kotlin.math.abs(itemCenter - viewportCenter)
            }
            closest?.index ?: selectedIndex
        }
    }

    // 实时感知当前处于正中心的项，无延迟通知外层更新
    LaunchedEffect(listState) {
        snapshotFlow { centerIndex }
            .distinctUntilChanged()
            .collect { index ->
                if (index in items.indices && index != selectedIndex) {
                    onSelectedIndexChanged(index)
                }
            }
    }

    // 仅当外部主动变更 selectedIndex 时，且滚轮未在滑动中，执行平滑滚动定位
    LaunchedEffect(selectedIndex) {
        if (!listState.isScrollInProgress && centerIndex != selectedIndex && selectedIndex in items.indices) {
            listState.animateScrollToItem(selectedIndex)
        }
    }

    val verticalPadding = itemHeight * ((visibleItemCount - 1) / 2)

    Box(
        modifier = modifier.height(itemHeight * visibleItemCount),
        contentAlignment = Alignment.Center,
    ) {
        LazyColumn(
            state = listState,
            flingBehavior = flingBehavior,
            contentPadding = PaddingValues(vertical = verticalPadding),
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            itemsIndexed(items) { index, item ->
                val isSelected = index == centerIndex
                val distance = kotlin.math.abs(index - centerIndex)
                val alpha = when (distance) {
                    0 -> 1f
                    1 -> 0.45f
                    else -> 0.2f
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(itemHeight)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                        ) {
                            if (index in items.indices) {
                                onSelectedIndexChanged(index)
                                coroutineScope.launch {
                                    listState.animateScrollToItem(index)
                                }
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            text = formatItem(item),
                            style = if (isSelected) {
                                MaterialTheme.typography.titleLarge.copy(
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.Bold,
                                )
                            } else {
                                MaterialTheme.typography.bodyLarge.copy(
                                    fontSize = 17.sp,
                                    fontWeight = FontWeight.Normal,
                                )
                            },
                            color = if (isSelected) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = alpha)
                            },
                            textAlign = TextAlign.Center,
                        )
                        if (isSelected && !unitText.isNullOrBlank()) {
                            Spacer(Modifier.width(2.dp))
                            Text(
                                text = unitText,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                ),
                                color = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.padding(bottom = 6.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
internal fun WheelTimePickerModal(
    title: String,
    currentTime: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
    minTime: String = "00:00",
    maxTime: String = "23:59",
    minuteStep: Int = 1,
) {
    val minMin = (reservationTimeMinutes(minTime) ?: 0).coerceIn(0, 1439)
    val maxMin = (reservationTimeMinutes(maxTime) ?: 1439).coerceIn(minMin, 1439)
    val clampedCurrentMin = (reservationTimeMinutes(currentTime) ?: minMin).coerceIn(minMin, maxMin)

    val currentH = clampedCurrentMin / 60
    val currentM = clampedCurrentMin % 60

    val minH = minMin / 60
    val maxH = maxMin / 60

    val hours = remember(minH, maxH) {
        (minH..maxH).map { String.format(Locale.ROOT, "%02d", it) }
    }

    val initHourIndex = remember(hours, currentH) {
        val found = hours.indexOfFirst { it.toIntOrNull() == currentH }
        if (found >= 0) found else 0
    }
    var selectedHourIndex by remember { mutableIntStateOf(initHourIndex) }

    val safeHourIndex = selectedHourIndex.coerceIn(0, (hours.size - 1).coerceAtLeast(0))
    val selectedHour = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }.toIntOrNull() ?: minH

    val minutesForHour = remember(selectedHour, minMin, maxMin, minuteStep) {
        val list = mutableListOf<String>()
        val startM = if (selectedHour == minH) minMin % 60 else 0
        val endM = if (selectedHour == maxH) maxMin % 60 else 59
        val step = minuteStep.coerceAtLeast(1)
        for (m in 0..59 step step) {
            if (m in startM..endM) {
                list.add(String.format(Locale.ROOT, "%02d", m))
            }
        }
        if (list.isEmpty()) {
            list.add(String.format(Locale.ROOT, "%02d", startM.coerceIn(0, 59)))
        }
        list
    }

    val initMinuteIndex = remember(minutesForHour, currentM) {
        val found = minutesForHour.indexOfFirst { (it.toIntOrNull() ?: 0) >= currentM }
        if (found >= 0) found else (minutesForHour.size - 1).coerceAtLeast(0)
    }
    var selectedMinuteIndex by remember(minutesForHour) { mutableIntStateOf(initMinuteIndex) }

    val safeMinuteIndex = selectedMinuteIndex.coerceIn(0, (minutesForHour.size - 1).coerceAtLeast(0))
    val chosenHourStr = hours.getOrElse(safeHourIndex) { hours.firstOrNull() ?: "08" }
    val chosenMinuteStr = minutesForHour.getOrElse(safeMinuteIndex) { minutesForHour.firstOrNull() ?: "00" }
    val formattedTime = "$chosenHourStr:$chosenMinuteStr"

    val rangeHint = if (minTime != "00:00" || maxTime != "23:59") "（开放范围 $minTime - $maxTime）" else ""

    AppDialog(
        onDismissRequest = onDismiss,
        icon = Icons.Outlined.AccessTime,
        iconTint = MaterialTheme.colorScheme.primary,
        iconBackground = MaterialTheme.colorScheme.primaryContainer,
        title = title,
        subtitle = "当前选择：$formattedTime$rangeHint",
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = "取消",
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                )
                AppDialogPrimaryButton(
                    text = "确定",
                    onClick = {
                        onConfirm(formattedTime)
                        onDismiss()
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        },
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 12.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WheelPicker(
                items = hours,
                selectedIndex = safeHourIndex,
                onSelectedIndexChanged = { selectedHourIndex = it },
                unitText = "时",
                modifier = Modifier.weight(1f),
            )
            WheelPicker(
                items = minutesForHour,
                selectedIndex = safeMinuteIndex,
                onSelectedIndexChanged = { selectedMinuteIndex = it },
                unitText = "分",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
internal fun ReservationTimeRangePicker(
    startTime: String,
    endTime: String,
    onStartTimeChange: (String) -> Unit,
    onEndTimeChange: (String) -> Unit,
    sectionTitle: String,
    minStartTime: String = "08:00",
    maxStartTime: String = "20:45",
    minEndTime: String = "08:15",
    maxEndTime: String = "21:45",
    minuteStep: Int = 15,
    minDurationMinutes: Int? = 60,
    maxDurationMinutes: Int? = 240,
    quickDurationOptions: List<Int> = listOf(60, 90, 120, 180, 240),
    defaultAutoDurationMinutes: Int = 120,
) {
    var pickingTarget by remember { mutableStateOf<String?>(null) }

    val startMin = reservationTimeMinutes(startTime)
    val endMin = reservationTimeMinutes(endTime)
    val durationMin = if (startMin != null && endMin != null && endMin > startMin) endMin - startMin else null
    val hasDurationRule = minDurationMinutes != null || maxDurationMinutes != null
    val isDurationValid = durationMin != null && hasDurationRule &&
        (minDurationMinutes == null || durationMin >= minDurationMinutes) &&
        (maxDurationMinutes == null || durationMin <= maxDurationMinutes)
    val maxEndMin = reservationTimeMinutes(maxEndTime) ?: 1290

    if (pickingTarget != null) {
        val isStart = pickingTarget == "start"
        WheelTimePickerModal(
            title = if (isStart) "选择开始时间" else "选择结束时间",
            currentTime = if (isStart) startTime else endTime,
            minTime = if (isStart) minStartTime else minEndTime,
            maxTime = if (isStart) maxStartTime else maxEndTime,
            minuteStep = minuteStep,
            onDismiss = { pickingTarget = null },
            onConfirm = { chosen ->
                if (isStart) {
                    onStartTimeChange(chosen)
                    val newStartMin = reservationTimeMinutes(chosen)
                    if (newStartMin != null) {
                        val currEndMin = reservationTimeMinutes(endTime)
                        val durationBroken = currEndMin == null || currEndMin <= newStartMin ||
                            (minDurationMinutes != null && (currEndMin - newStartMin) < minDurationMinutes) ||
                            (maxDurationMinutes != null && (currEndMin - newStartMin) > maxDurationMinutes)
                        if (durationBroken) {
                            val autoEndMin = (newStartMin + defaultAutoDurationMinutes).coerceAtMost(maxEndMin)
                            onEndTimeChange(formatMinutesToTime(autoEndMin))
                        }
                    }
                } else {
                    onEndTimeChange(chosen)
                }
            },
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        // 1. 顶部标题与时长标签
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = sectionTitle,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (hasDurationRule && durationMin != null) {
                val hours = durationMin / 60
                val mins = durationMin % 60
                val durationText = "${if (hours > 0) "${hours}小时" else ""}${if (mins > 0) "${mins}分钟" else ""}"
                val statusColor = if (isDurationValid) Color(0xFF15803D) else MaterialTheme.colorScheme.error
                val statusBg = if (isDurationValid) Color(0xFFDCFCE7).copy(alpha = 0.55f) else MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)
                val ruleText = when {
                    minDurationMinutes != null && maxDurationMinutes != null ->
                        "需${minDurationMinutes / 60}~${maxDurationMinutes / 60}小时"
                    minDurationMinutes != null -> "至少${minDurationMinutes / 60}小时"
                    else -> "至多${maxDurationMinutes!! / 60}小时"
                }
                Surface(
                    shape = RoundedCornerShape(999.dp),
                    color = statusBg,
                    border = BorderStroke(1.dp, statusColor.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(
                            if (isDurationValid) Icons.Outlined.CheckCircle else Icons.Outlined.WarningAmber,
                            contentDescription = null,
                            tint = statusColor,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = if (isDurationValid) "时长 $durationText (合规)" else "时长 $durationText ($ruleText)",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = statusColor,
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        // 2. 双联时间大卡片（点击直接唤起选择弹窗）
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // 开始时间卡片
            Surface(
                onClick = { pickingTarget = "start" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "开始时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = startTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }

            // 中间箭头指示
            Box(
                modifier = Modifier
                    .size(26.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.ArrowForward,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(14.dp),
                )
            }

            // 结束时间卡片
            Surface(
                onClick = { pickingTarget = "end" },
                shape = RoundedCornerShape(12.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "结束时间",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            Icons.Outlined.AccessTime,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(
                            text = endTime,
                            style = MaterialTheme.typography.titleMedium.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 17.5.sp,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }

        // 3. 常用时长一键快速推算（从开始时间自动顺延）
        if (quickDurationOptions.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = "快捷时长推算（从开始时间自动顺延）",
                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    quickDurationOptions.forEach { durationMinutes ->
                        val isCurrentDuration = durationMin == durationMinutes
                        Surface(
                            onClick = {
                                val curStartMin = reservationTimeMinutes(startTime) ?: 540
                                val targetEndMin = (curStartMin + durationMinutes).coerceAtMost(maxEndMin)
                                onEndTimeChange(formatMinutesToTime(targetEndMin))
                            },
                            shape = RoundedCornerShape(8.dp),
                            color = if (isCurrentDuration) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            border = BorderStroke(
                                1.dp,
                                if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f),
                            ),
                            modifier = Modifier
                                .weight(1f)
                                .height(32.dp),
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    text = durationQuickLabel(durationMinutes),
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                    fontWeight = if (isCurrentDuration) FontWeight.Bold else FontWeight.Medium,
                                    color = if (isCurrentDuration) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun durationQuickLabel(minutes: Int): String {
    val hours = minutes / 60
    val rem = minutes % 60
    return when {
        rem == 0 -> "${hours}小时"
        rem == 30 -> "${hours}.5小时"
        else -> "${minutes}分钟"
    }
}

/** 弹窗统一输入框：浅填色 + 细描边。 */
@Composable
fun DialogTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = 1,
    isPassword: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
) {
    val dark = isSystemInDarkTheme()
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        label = {
            Text(
                label,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium),
            )
        },
        singleLine = singleLine && minLines <= 1,
        minLines = minLines,
        maxLines = maxLines.coerceAtLeast(minLines),
        enabled = enabled,
        visualTransformation = if (isPassword) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(18.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
            unfocusedBorderColor = if (dark) Color.White.copy(alpha = 0.10f) else Color(0xFFE2E8F0),
            disabledBorderColor = if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFFE2E8F0),
            focusedContainerColor = if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFFF8FAFC),
            unfocusedContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else Color(0xFFF8FAFC),
            disabledContainerColor = if (dark) Color.White.copy(alpha = 0.02f) else MaterialTheme.colorScheme.surfaceVariant,
            focusedLabelColor = MaterialTheme.colorScheme.primary,
            unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
            cursorColor = MaterialTheme.colorScheme.primary,
        ),
    )
}

/** 弹窗内说明文字。 */
@Composable
fun DialogInfoText(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 21.sp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.fillMaxWidth(),
    )
}

/** 通用的现代确认弹窗。 */
@Composable
fun AppConfirmDialog(
    title: String,
    detail: String,
    confirmLabel: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
    busy: Boolean = false,
    dismissLabel: String = "取消",
) {
    AppDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        modifier = modifier,
        icon = icon,
        iconTint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        iconBackground = if (danger) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
        title = title,
        content = {
            DialogInfoText(detail)
        },
        footer = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AppDialogSecondaryButton(
                    text = dismissLabel,
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                    enabled = !busy,
                )
                if (danger) {
                    AppDialogDangerButton(
                        text = confirmLabel,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        busy = busy,
                    )
                } else {
                    AppDialogPrimaryButton(
                        text = confirmLabel,
                        onClick = onConfirm,
                        modifier = Modifier.weight(1f),
                        enabled = !busy,
                        busy = busy,
                    )
                }
            }
        },
    )
}

/** 顶部悬浮的现代提示 Toast：浅色模式白卡片 / 深色模式深色卡片，按成功/失败切换图标配色。 */
@Composable
fun AppToast(
    message: String,
    error: Boolean,
    modifier: Modifier = Modifier,
) {
    val dark = isSystemInDarkTheme()
    val accentColor = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary
    val container = accentColor
        .copy(alpha = if (dark) 0.1f else 0.035f)
        .compositeOver(MaterialTheme.colorScheme.surface)
    val contentColor = MaterialTheme.colorScheme.onSurface
    val border = accentColor.copy(alpha = if (dark) 0.3f else 0.16f)
    val iconBackground = accentColor.copy(alpha = if (dark) 0.18f else 0.1f)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = container,
        contentColor = contentColor,
        shadowElevation = 0.dp,
        border = BorderStroke(1.dp, border),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(11.dp),
        ) {
            Surface(
                shape = CircleShape,
                color = iconBackground,
                modifier = Modifier.size(34.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = if (error) Icons.Outlined.ErrorOutline else Icons.Outlined.CheckCircle,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    lineHeight = 20.sp,
                ),
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
fun EmptyBlock(title: String, detail: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(vertical = 24.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Outlined.CheckCircle,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
            modifier = Modifier.size(28.dp),
        )
        Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
        Text(detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun formatPlatformTime(value: String?): String = remember(value) {
    formatPlatformTimeValue(value)
}

private fun formatPlatformTimeValue(value: String?): String {
    if (value.isNullOrBlank()) return "暂无"
    val instant = runCatching { Instant.parse(value) }.getOrNull()
        ?: runCatching { OffsetDateTime.parse(value).toInstant() }.getOrNull()
        ?: return value.take(16)
    return PlatformTimeFormatter.format(instant)
}

fun formatLastActive(value: Long?): String {
    if (value == null) return "暂无数据"
    val normalized = if (value < 10_000_000_000L) value * 1000 else value
    return PlatformTimeFormatter.format(Instant.ofEpochMilli(normalized))
}

/** 下拉刷新容器：列表位于顶部时下拉，带动指示器与内容位移动画。 */
@Composable
fun PullToRefresh(
    isRefreshing: Boolean,
    onRefresh: (() -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    atTop: () -> Boolean,
    content: @Composable BoxScope.() -> Unit,
) {
    val density = LocalDensity.current
    val haptics = LocalHapticFeedback.current
    val thresholdPx = with(density) { 76.dp.toPx() }
    val maxPullPx = with(density) { 150.dp.toPx() }
    val indicatorSizePx = with(density) { 42.dp.toPx() }
    val dragMultiplier = 0.5f

    var pullOffset by remember { mutableFloatStateOf(0f) }
    var indicatorVisible by remember { mutableStateOf(false) }
    var triggered by remember { mutableStateOf(false) }
    val settleJob = remember { mutableStateOf<Job?>(null) }
    val coroutineScope = rememberCoroutineScope()
    val currentIsRefreshing by rememberUpdatedState(isRefreshing)
    val currentOnRefresh by rememberUpdatedState(onRefresh)
    val currentAtTop by rememberUpdatedState(atTop)
    val currentEnabled by rememberUpdatedState(enabled)

    fun animatePullTo(target: Float) {
        settleJob.value?.cancel()
        settleJob.value = coroutineScope.launch {
            animate(
                initialValue = pullOffset,
                targetValue = target,
                animationSpec = spring(
                    dampingRatio = Spring.DampingRatioNoBouncy,
                    stiffness = Spring.StiffnessMedium,
                ),
            ) { value, _ ->
                pullOffset = value
            }
            pullOffset = target
            if (target == 0f && !triggered) indicatorVisible = false
        }
    }

    fun settlePull() {
        when {
            !currentEnabled -> animatePullTo(0f)
            currentIsRefreshing || triggered -> animatePullTo(thresholdPx)
            pullOffset >= thresholdPx -> {
                triggered = true
                AppHaptics.refreshSnap(haptics)
                animatePullTo(thresholdPx)
                currentOnRefresh?.invoke()
            }
            else -> animatePullTo(0f)
        }
    }

    LaunchedEffect(isRefreshing) {
        if (isRefreshing) {
            // 后台刷新（切页/自动刷新）不显示指示器；只有手动下拉触发后等待完成
        } else if (triggered) {
            triggered = false
            animatePullTo(0f)
        }
    }

    val connection = remember {
        object : NestedScrollConnection {
            override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                if (source != NestedScrollSource.Drag || currentIsRefreshing) return Offset.Zero
                // 当下拉刷新处于展开状态且用户向上收回时，优先在 preScroll 消费
                if (delta < 0f && pullOffset > 0f) {
                    settleJob.value?.cancel()
                    val consumed = delta.coerceAtLeast(-pullOffset / dragMultiplier)
                    pullOffset = (pullOffset + consumed * dragMultiplier).coerceAtLeast(0f)
                    if (pullOffset == 0f && !triggered) indicatorVisible = false
                    return Offset(0f, consumed)
                }
                return Offset.Zero
            }

            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                // 当列表已经滚动到最顶部且无法再滚动、产生剩余正向位移时，才触发下拉刷新
                if (currentEnabled && source == NestedScrollSource.Drag && delta > 0f && !currentIsRefreshing) {
                    settleJob.value?.cancel()
                    indicatorVisible = true
                    pullOffset = (pullOffset + delta * dragMultiplier).coerceAtMost(maxPullPx)
                    return Offset(0f, delta)
                }
                return Offset.Zero
            }

            override suspend fun onPreFling(available: Velocity): Velocity {
                if (pullOffset > 0f && !currentIsRefreshing) {
                    if (available.y > 0f) {
                        settlePull()
                    } else {
                        animatePullTo(0f)
                    }
                    return available
                }
                return Velocity.Zero
            }
        }
    }

    val dragReleaseModifier = if (pullOffset > 0f) {
        Modifier.pointerInput(Unit) {
            awaitEachGesture {
                val down = awaitFirstDown(requireUnconsumed = false)
                var watching = true
                while (watching) {
                    val event = awaitPointerEvent(PointerEventPass.Final)
                    val change = event.changes.firstOrNull { it.id == down.id }
                    if (change == null || !change.pressed) {
                        if (pullOffset > 0f) settlePull()
                        watching = false
                    }
                }
            }
        }
    } else {
        Modifier
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .nestedScroll(connection)
            .then(dragReleaseModifier)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                // 下拉时只做 placement 偏移，避免滚动页面常驻一个全屏绘制层。
                .offset { IntOffset(0, pullOffset.roundToInt()) }
        ) {
            content()
        }
        if (indicatorVisible || (triggered && isRefreshing)) {
            Surface(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .offset { IntOffset(0, (pullOffset - indicatorSizePx).roundToInt()) }
                    .size(42.dp),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.surface,
                shadowElevation = 6.dp,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isRefreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Outlined.ArrowDownward,
                            contentDescription = "下拉刷新",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .size(20.dp)
                                .graphicsLayer {
                                    rotationZ = (pullOffset / thresholdPx).coerceIn(0f, 1f) * 180f
                                },
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ImmersiveHeader(
    title: String,
    subtitle: String = "生产环境 · 智控中心 LIVE",
    actions: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val glass = rememberGlassPalette(radius = 20.dp)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .glassPanel(glass)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    title,
                    style = MaterialTheme.typography.titleLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 22.sp,
                        letterSpacing = (-0.2).sp
                    ),
                    color = MaterialTheme.colorScheme.onBackground
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 3.dp)
                ) {
                    Box(
                        Modifier
                            .size(7.dp)
                            .background(MaterialTheme.colorScheme.secondary, CircleShape)
                    )
                    Text(
                        subtitle,
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 6.dp)
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(start = 12.dp)
            ) {
                actions?.invoke()
            }
        }
    }
}

/**
 * 高颜值极简现代纯 Icon 顶栏按钮 (搜索、扫码通用双子按钮)
 */
@Composable
fun ModernHeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 38.dp,
    iconSize: Dp = 20.dp,
    shape: RoundedCornerShape = RoundedCornerShape(12.dp),
    iconTint: Color = Color(0xFF2563EB),
    containerColor: Color = Color(0xFFEFF6FF),
    borderColor: Color = Color(0xFFDBEAFE),
) {
    val interactionSource = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        interactionSource = interactionSource,
        modifier = modifier
            .size(size)
            .pressFeedback(interactionSource),
        shape = shape,
        color = containerColor,
        border = BorderStroke(0.8.dp, borderColor),
        shadowElevation = 0.dp,
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = iconTint,
                modifier = Modifier.size(iconSize),
            )
        }
    }
}

/**
 * 现代化 App 启动 Splash 开屏动画 (Ultra-Modern Dynamic Splash System)
 * 具备自适应智能就绪响应、动态极光流光底衬、全息悬浮晶体徽章、星轨粒子与沉浸式揭幕退场。
 * 极致性能架构：基于 Animatable 与纯 GPU RenderNode 矩阵变换，0 次重组（Zero Recomposition）与 0 内存开销。
 */
@Composable
fun ModernAnimatedSplashScreen(
    onSplashFinished: () -> Unit,
    modifier: Modifier = Modifier,
    isDataReady: Boolean = true,
    isExiting: Boolean = false,
    onSplashExitFinished: (() -> Unit)? = null,
) {
    val isDark = isSystemInDarkTheme()
    val primaryColor = MaterialTheme.colorScheme.primary
    val secondaryColor = MaterialTheme.colorScheme.secondary

    // 动效控制器 (Animatable)
    val introProgress = remember { Animatable(0f) }
    val gleamProgress = remember { Animatable(0f) }
    val beamProgress = remember { Animatable(0f) }
    val exitProgress = remember { Animatable(0f) }

    // 循环环境呼吸与星轨自转动效
    val infiniteTransition = rememberInfiniteTransition(label = "SplashInfiniteTransition")
    val orbitAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 6000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "orbitAngle",
    )
    val ambientPulse by infiniteTransition.animateFloat(
        initialValue = 0.85f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "ambientPulse",
    )

    // 静态缓存渐变颜色与 Brush，彻底规避每帧 GC 分配
    val bgGradient = remember(isDark) {
        if (isDark) {
            listOf(
                Color(0xFF0B101D),
                Color(0xFF0F172A),
                Color(0xFF080C14),
            )
        } else {
            listOf(
                Color(0xFFF8FAFC),
                Color(0xFFF1F5F9),
                Color(0xFFE2E8F0),
            )
        }
    }

    val primaryGlowColor = remember(isDark, primaryColor) {
        if (isDark) primaryColor.copy(alpha = 0.22f) else primaryColor.copy(alpha = 0.14f)
    }
    val secondaryGlowColor = remember(isDark, secondaryColor) {
        if (isDark) secondaryColor.copy(alpha = 0.16f) else secondaryColor.copy(alpha = 0.09f)
    }

    // 启动入场调度：极速并行驱动弹簧入场、全息扫光与能量条
    LaunchedEffect(Unit) {
        // 1. 弹性升起入场 (400ms 内完成优雅初现)
        launch {
            introProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 420,
                    easing = CubicBezierEasing(0.16f, 1f, 0.3f, 1f),
                ),
            )
        }
        // 2. 能量光束伸展
        launch {
            beamProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 500,
                    easing = CubicBezierEasing(0.2f, 0.0f, 0.2f, 1.0f),
                ),
            )
        }
        // 3. 全息晶体流光扫描 (在徽章展露后丝滑掠过)
        launch {
            kotlinx.coroutines.delay(120)
            gleamProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 550,
                    easing = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f),
                ),
            )
        }
    }

    // 智能就绪自适应控制：保证 ~450ms 最短黄金展示期后，只要数据就绪即刻无缝触发退场
    val currentIsDataReady by rememberUpdatedState(isDataReady)
    val currentOnSplashFinished by rememberUpdatedState(onSplashFinished)
    LaunchedEffect(Unit) {
        val startTime = System.currentTimeMillis()
        val minDisplayMs = 450L
        while (true) {
            val elapsed = System.currentTimeMillis() - startTime
            if (elapsed >= minDisplayMs && currentIsDataReady) {
                currentOnSplashFinished()
                break
            }
            kotlinx.coroutines.delay(16)
        }
    }

    // 退场阶段驱动：轻盈上浮微散 + 景深揭幕
    val currentOnSplashExitFinished by rememberUpdatedState(onSplashExitFinished)
    LaunchedEffect(isExiting) {
        if (isExiting) {
            exitProgress.animateTo(
                targetValue = 1f,
                animationSpec = tween(
                    durationMillis = 360,
                    easing = CubicBezierEasing(0.32f, 0f, 0.15f, 1f),
                ),
            )
            currentOnSplashExitFinished?.invoke()
        }
    }

    val badgeShape = remember { RoundedCornerShape(26.dp) }
    val chipShape = remember { RoundedCornerShape(20.dp) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .graphicsLayer {
                val exit = exitProgress.value
                // 退场时背景透明度与径向微缩放，产生深度揭幕视差
                alpha = (1f - exit).coerceIn(0f, 1f)
                scaleX = 1f + 0.08f * exit
                scaleY = 1f + 0.08f * exit
            }
            .background(
                brush = Brush.verticalGradient(bgGradient)
            ),
        contentAlignment = Alignment.Center,
    ) {
        // --- 1. 背景动态极光光晕 (Ambient Dynamic Aurora Glow) ---
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    val p = introProgress.value
                    val exit = exitProgress.value
                    alpha = (p * (1f - exit)).coerceIn(0f, 1f)
                }
        ) {
            val centerOffset = Offset(size.width * 0.5f, size.height * 0.44f)
            val radius = size.minDimension * 0.65f * ambientPulse

            // 主极光光晕（科技蓝）
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(primaryGlowColor, Color.Transparent),
                    center = centerOffset,
                    radius = radius,
                ),
                radius = radius,
                center = centerOffset,
            )

            // 辅极光光晕（翠绿与青蓝交融，偏右上微旋）
            val secondaryCenter = Offset(
                x = size.width * (0.52f + 0.06f * kotlin.math.cos(Math.toRadians(orbitAngle.toDouble())).toFloat()),
                y = size.height * (0.42f + 0.05f * kotlin.math.sin(Math.toRadians(orbitAngle.toDouble())).toFloat()),
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(secondaryGlowColor, Color.Transparent),
                    center = secondaryCenter,
                    radius = radius * 0.82f,
                ),
                radius = radius * 0.82f,
                center = secondaryCenter,
            )
        }

        // --- 2. 核心内容层（徽章、星轨、品牌文字与状态芯片）---
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.graphicsLayer {
                val exit = exitProgress.value
                // 退场时核心内容轻盈上浮并淡出
                translationY = -32f * exit
            }
        ) {
            // 徽章与星轨环体系
            Box(
                modifier = Modifier.size(136.dp),
                contentAlignment = Alignment.Center,
            ) {
                // 星轨能量光环与光子粒子 (Orbital Pulse & Photon Orbit)
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer {
                            val p = introProgress.value
                            alpha = p * 0.85f
                            scaleX = 0.7f + 0.3f * p
                            scaleY = 0.7f + 0.3f * p
                        }
                ) {
                    val ringRadius = size.minDimension * 0.46f
                    val centerPt = Offset(size.width / 2f, size.height / 2f)

                    // 细微能量轨道环
                    drawCircle(
                        color = if (isDark) Color(0xFF38BDF8).copy(alpha = 0.18f) else primaryColor.copy(alpha = 0.15f),
                        radius = ringRadius,
                        center = centerPt,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.5.dp.toPx()),
                    )

                    // 轨道上顺时针运转的光子节点 (Photon Particle 1)
                    val rad1 = Math.toRadians(orbitAngle.toDouble())
                    val photon1X = centerPt.x + ringRadius * kotlin.math.cos(rad1).toFloat()
                    val photon1Y = centerPt.y + ringRadius * kotlin.math.sin(rad1).toFloat()
                    drawCircle(
                        color = if (isDark) Color(0xFF38BDF8) else primaryColor,
                        radius = 2.5.dp.toPx(),
                        center = Offset(photon1X, photon1Y),
                    )

                    // 轨道对侧逆相位运转的光子节点 (Photon Particle 2)
                    val rad2 = Math.toRadians((orbitAngle + 180f).toDouble())
                    val photon2X = centerPt.x + ringRadius * kotlin.math.cos(rad2).toFloat()
                    val photon2Y = centerPt.y + ringRadius * kotlin.math.sin(rad2).toFloat()
                    drawCircle(
                        color = if (isDark) Color(0xFF34D399) else secondaryColor,
                        radius = 2.dp.toPx(),
                        center = Offset(photon2X, photon2Y),
                    )
                }

                // 全息悬浮晶体 Logo 徽章 (Prismatic Holographic Emblem)
                Box(
                    modifier = Modifier
                        .size(86.dp)
                        .graphicsLayer {
                            val p = introProgress.value
                            val scale = 0.55f + 0.45f * p
                            scaleX = scale
                            scaleY = scale
                            alpha = p
                            // 悬浮微动效
                            translationY = (1f - p) * 28f
                            shadowElevation = if (isDark) 16.dp.toPx() else 12.dp.toPx()
                            shape = badgeShape
                            clip = true
                        }
                        .background(
                            brush = if (isDark) {
                                Brush.linearGradient(
                                    colors = listOf(
                                        Color(0xFF1E293B),
                                        Color(0xFF0F172A),
                                    )
                                )
                            } else {
                                Brush.linearGradient(
                                    colors = listOf(
                                        Color(0xFFFFFFFF),
                                        Color(0xFFF8FAFC),
                                    )
                                )
                            }
                        )
                        .border(
                            width = 1.2.dp,
                            brush = Brush.linearGradient(
                                colors = if (isDark) {
                                    listOf(
                                        Color(0xFF38BDF8).copy(alpha = 0.6f),
                                        Color(0xFF10B981).copy(alpha = 0.3f),
                                        Color(0xFF334155).copy(alpha = 0.4f),
                                    )
                                } else {
                                    listOf(
                                        Color(0xFFFFFFFF),
                                        primaryColor.copy(alpha = 0.35f),
                                        Color(0xFFE2E8F0),
                                    )
                                }
                            ),
                            shape = badgeShape,
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    // Logo 图像
                    androidx.compose.foundation.Image(
                        painter = painterResource(cn.pxyb.mycontrol.R.drawable.platform_logo),
                        contentDescription = "智控中心 Logo",
                        modifier = Modifier.size(54.dp),
                    )

                    // 全息流光扫描层 (Holographic Gleam Sweep)
                    val gleam = gleamProgress.value
                    if (gleam in 0.01f..0.99f) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val sweepX = size.width * (gleam * 2.2f - 0.6f)
                            drawRect(
                                brush = Brush.linearGradient(
                                    colors = listOf(
                                        Color.Transparent,
                                        Color.White.copy(alpha = if (isDark) 0.32f else 0.5f),
                                        Color.Transparent,
                                    ),
                                    start = Offset(sweepX - 25.dp.toPx(), 0f),
                                    end = Offset(sweepX + 25.dp.toPx(), size.height),
                                )
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(20.dp))

            // 品牌排版与状态芯片 (Brand Typography & Cyber Badge)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.graphicsLayer {
                    val p = introProgress.value
                    translationY = (1f - p) * 18f
                    alpha = p
                }
            ) {
                // 主标题：MY CONTROL
                Text(
                    text = "MY CONTROL",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.Black,
                        fontSize = 27.sp,
                        letterSpacing = 2.4.sp,
                    ),
                    color = if (isDark) Color(0xFFF8FAFC) else Color(0xFF0F172A),
                )

                Spacer(Modifier.height(10.dp))

                // 微胶囊芯片状态徽章 (Cyber-pill Chip Badge)
                Surface(
                    shape = chipShape,
                    color = if (isDark) Color(0xFF1E293B).copy(alpha = 0.75f) else Color(0xFFFFFFFF).copy(alpha = 0.85f),
                    border = BorderStroke(
                        width = 1.dp,
                        color = if (isDark) Color(0xFF334155).copy(alpha = 0.8f) else Color(0xFFE2E8F0),
                    ),
                    shadowElevation = if (isDark) 2.dp else 1.dp,
                    modifier = Modifier.padding(horizontal = 4.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 5.dp)
                    ) {
                        // 呼吸绿核指示灯 (Pulse Green Core)
                        Box(
                            modifier = Modifier
                                .size(6.5.dp)
                                .graphicsLayer {
                                    scaleX = ambientPulse
                                    scaleY = ambientPulse
                                }
                                .background(Color(0xFF10B981), CircleShape)
                        )
                        Spacer(Modifier.width(7.dp))
                        Text(
                            text = "智控中心 · 统一控制平台",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.5.sp,
                                letterSpacing = 0.6.sp,
                            ),
                            color = if (isDark) Color(0xFF94A3B8) else Color(0xFF475569),
                        )
                    }
                }

                Spacer(Modifier.height(28.dp))

                // 极细极光能量条 (Aurora Energy Beam)
                Box(
                    modifier = Modifier
                        .width(96.dp)
                        .height(2.5.dp)
                        .clip(CircleShape)
                        .background(
                            if (isDark) Color(0xFF1E293B) else Color(0xFFE2E8F0)
                        ),
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxHeight()
                            .fillMaxWidth(fraction = beamProgress.value)
                            .clip(CircleShape)
                            .background(
                                brush = Brush.horizontalGradient(
                                    colors = listOf(
                                        primaryColor,
                                        Color(0xFF38BDF8),
                                        Color(0xFF34D399),
                                    )
                                )
                            )
                    )
                }
            }
        }
    }
}

/**
 * 现代化开关：胶囊轨道 + 圆形拇指 + 选中对勾图标，带按压反馈与弹性动画。
 * 配色跟随主题（默认 primary，可传 tint 覆盖）；关闭态使用半透明轨道，暗色/亮色均适配。
 * 与玻璃卡片规范一致：不添加投影。
 */
@Composable
fun AppSwitch(
    checked: Boolean,
    onCheckedChange: ((Boolean) -> Unit)?,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: Color? = null,
) {
    val dark = isSystemInDarkTheme()
    val haptics = LocalHapticFeedback.current
    val accent = tint ?: MaterialTheme.colorScheme.primary
    val interactive = enabled && onCheckedChange != null
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()

    val trackWidth = 44.dp
    val trackHeight = 26.dp
    val thumbSize = 20.dp
    val thumbTravel = trackWidth - thumbSize - 2.dp

    val thumbOffset by animateDpAsState(
        targetValue = if (checked) thumbTravel else 0.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "appSwitchThumb",
    )
    val thumbScale by animateFloatAsState(
        targetValue = if (pressed) 1.12f else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "appSwitchThumbScale",
    )
    val trackColor by animateColorAsState(
        targetValue = when {
            !enabled -> if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.06f)
            checked -> accent
            else -> if (dark) Color.White.copy(alpha = 0.16f) else Color.Black.copy(alpha = 0.10f)
        },
        animationSpec = tween(durationMillis = MotionTokens.DurationShort),
        label = "appSwitchTrack",
    )
    val thumbColor = when {
        checked -> if (enabled) Color.White else if (dark) Color.White.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.70f)
        else -> if (dark) Color(0xFFE2E8F0) else Color.White
    }
    val thumbBorder = when {
        checked || !enabled -> Color.Transparent
        dark -> Color.White.copy(alpha = 0.35f)
        else -> Color.Black.copy(alpha = 0.12f)
    }
    val iconTint = if (enabled) accent else if (dark) Color.White.copy(alpha = 0.5f) else Color.Black.copy(alpha = 0.3f)

    Box(
        modifier = modifier
            .minimumInteractiveComponentSize()
            .width(trackWidth)
            .height(trackHeight)
            .clip(RoundedCornerShape(50))
            .background(trackColor)
            .then(
                if (interactive) {
                    Modifier.toggleable(
                        value = checked,
                        role = Role.Switch,
                        interactionSource = interactionSource,
                        indication = null,
                    ) { newValue ->
                        AppHaptics.tick(haptics)
                        onCheckedChange?.invoke(newValue)
                    }
                } else {
                    Modifier
                }
            )
    ) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .clip(RoundedCornerShape(50))
                .background(
                    Brush.verticalGradient(
                        colors = listOf(
                            Color.White.copy(alpha = if (dark) 0.10f else 0.26f),
                            Color.Transparent,
                        )
                    )
                )
        )
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .offset(x = 1.dp + thumbOffset)
                .size(thumbSize)
                .graphicsLayer {
                    scaleX = thumbScale
                    scaleY = thumbScale
                }
                .clip(CircleShape)
                .background(thumbColor)
                .border(1.dp, thumbBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = checked,
                enter = scaleIn(animationSpec = tween(durationMillis = 150), initialScale = 0.4f) +
                    fadeIn(animationSpec = tween(durationMillis = 120)),
                exit = scaleOut(animationSpec = tween(durationMillis = 120), targetScale = 0.4f) +
                    fadeOut(animationSpec = tween(durationMillis = 90)),
            ) {
                Icon(
                    imageVector = Icons.Rounded.Check,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(12.dp),
                )
            }
        }
    }
}
