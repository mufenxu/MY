package cn.pxyb.mycontrol.ui

import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.material.icons.outlined.CenterFocusWeak
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.OpenInNew
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Speed
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.LocalIndication
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
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalDensity
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
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private val PlatformTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")
    .withZone(ZoneId.systemDefault())

data class StatusStyle(
    val label: String,
    val foreground: Color,
    val background: Color,
    val icon: ImageVector,
)

val AppCardShape = RoundedCornerShape(24.dp)
val AppSearchFieldShape = RoundedCornerShape(24.dp)
private val AppDialogShape = RoundedCornerShape(28.dp)

/** 统一按压反馈：按下轻微缩放，松开时用柔和弹性恢复。 */
@Composable
fun Modifier.pressFeedback(
    interactionSource: MutableInteractionSource,
    pressedScale: Float = 0.97f,
): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMedium,
        ),
        label = "press-scale",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
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
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        content()
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
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            if (!subtitle.isNullOrBlank()) {
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
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
    Column(modifier = modifier.padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        Text(
            value,
            style = MaterialTheme.typography.titleLarge,
            color = displayValueColor,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
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
fun FeedbackBanner(message: String, error: Boolean, modifier: Modifier = Modifier) {
    val foreground = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer
    val background = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer
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
 * 全 App 统一的现代弹窗容器：柔和遮罩、圆角卡片、入场缩放动画，
 * 标题居中展示，底部为分隔线 + 全宽/双列胶囊按钮。
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
    contentPadding: PaddingValues = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
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
        val dimAlpha = if (dark) 0.58f else 0.38f
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

        val sheetColor = MaterialTheme.colorScheme.surface
        val sheetBorder = MaterialTheme.colorScheme.outlineVariant
        val headerWash = Brush.verticalGradient(
            colors = listOf(
                iconBackground.copy(alpha = if (dark) 0.34f else 0.55f),
                sheetColor.copy(alpha = 0f),
            ),
        )

        Box(
            modifier = Modifier
                .fillMaxSize()
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismissRequest,
                ),
            contentAlignment = Alignment.Center,
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = fadeIn(animationSpec = tween(150)) +
                    scaleIn(initialScale = 0.94f, animationSpec = tween(220, easing = FastOutSlowInEasing)),
                exit = fadeOut(animationSpec = tween(110)) +
                    scaleOut(targetScale = 0.97f, animationSpec = tween(130)),
                modifier = Modifier
                    .imePadding()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 18.dp, vertical = 16.dp)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = {},
                    ),
            ) {
                Box(
                    modifier = modifier
                        .widthIn(max = 420.dp)
                        .fillMaxWidth()
                        .shadow(
                            elevation = 28.dp,
                            shape = AppDialogShape,
                            ambientColor = Color.Black.copy(alpha = 0.18f),
                            spotColor = Color.Black.copy(alpha = 0.22f),
                        )
                        .clip(AppDialogShape)
                        .background(sheetColor)
                        .background(headerWash)
                        .border(1.dp, sheetBorder, AppDialogShape),
                ) {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        if (icon != null || title != null || subtitle != null) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(start = 20.dp, end = 20.dp, top = 20.dp, bottom = 4.dp),
                                horizontalArrangement = Arrangement.spacedBy(14.dp),
                                verticalAlignment = Alignment.Top,
                            ) {
                                if (icon != null) {
                                    Box(
                                        modifier = Modifier
                                            .size(48.dp)
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(iconBackground.copy(alpha = if (dark) 0.9f else 1f)),
                                        contentAlignment = Alignment.Center,
                                    ) {
                                        Icon(
                                            imageVector = icon,
                                            contentDescription = null,
                                            tint = iconTint,
                                            modifier = Modifier.size(24.dp),
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
                                            style = MaterialTheme.typography.titleLarge.copy(
                                                fontWeight = FontWeight.SemiBold,
                                                fontSize = 19.sp,
                                                lineHeight = 25.sp,
                                                letterSpacing = (-0.2).sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurface,
                                        )
                                    }
                                    if (subtitle != null) {
                                        Text(
                                            text = subtitle,
                                            style = MaterialTheme.typography.bodyMedium.copy(
                                                fontSize = 13.5.sp,
                                                lineHeight = 19.sp,
                                            ),
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }

                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(contentPadding),
                            horizontalAlignment = Alignment.Start,
                            verticalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            content()
                        }

                        if (footer != null) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 16.dp, vertical = 14.dp),
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


/** 弹窗主操作按钮：柔和圆角主色按钮。 */
@Composable
fun AppDialogPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp).pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !busy,
        shape = RoundedCornerShape(18.dp),
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
            disabledContentColor = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f),
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onPrimary,
            )
        } else {
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
    }
}

/** 弹窗次要操作按钮：浅底弱强调。 */
@Composable
fun AppDialogSecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val dark = isSystemInDarkTheme()
    val interactionSource = remember { MutableInteractionSource() }
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp).pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !busy,
        shape = RoundedCornerShape(18.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (dark) Color.White.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surfaceVariant,
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
            disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
    }
}

/** 弹窗危险操作按钮：柔和危险色。 */
@Composable
fun AppDialogDangerButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    busy: Boolean = false,
) {
    val interactionSource = remember { MutableInteractionSource() }
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp).pressFeedback(interactionSource),
        interactionSource = interactionSource,
        enabled = enabled && !busy,
        shape = RoundedCornerShape(18.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.errorContainer,
            contentColor = MaterialTheme.colorScheme.error,
            disabledContainerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.45f),
            disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = MaterialTheme.colorScheme.error,
            )
        } else {
            Text(text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
        }
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
    val container = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer
    val contentColor = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSecondaryContainer
    val accentColor = if (error) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.secondary
    val border = accentColor.copy(alpha = if (dark) 0.32f else 0.18f)
    val iconBackground = accentColor.copy(alpha = if (dark) 0.2f else 0.12f)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(20.dp),
        color = container,
        contentColor = contentColor,
        shadowElevation = 10.dp,
        border = BorderStroke(0.5.dp, border),
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
                if (delta < 0f && pullOffset > 0f) {
                    settleJob.value?.cancel()
                    val consumed = delta.coerceAtLeast(-pullOffset / dragMultiplier)
                    pullOffset = (pullOffset + consumed * dragMultiplier).coerceAtLeast(0f)
                    if (pullOffset == 0f && !triggered) indicatorVisible = false
                    return Offset(0f, consumed)
                }
                if (currentEnabled && delta > 0f && currentAtTop()) {
                    settleJob.value?.cancel()
                    indicatorVisible = true
                    pullOffset = (pullOffset + delta * dragMultiplier).coerceAtMost(maxPullPx)
                    return Offset(0f, delta)
                }
                return Offset.Zero
            }

            override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
                val delta = available.y
                if (currentEnabled && source == NestedScrollSource.Drag && delta > 0f && currentAtTop() && !currentIsRefreshing) {
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

    Box(
        modifier = modifier
            .fillMaxSize()
            .nestedScroll(connection)
            .pointerInput(Unit) {
                awaitEachGesture {
                    val down = awaitFirstDown(requireUnconsumed = false)
                    var watching = true
                    while (watching) {
                        val event = awaitPointerEvent(PointerEventPass.Final)
                        val change = event.changes.firstOrNull { it.id == down.id }
                        if (change == null || !change.pressed) {
                            if (pullOffset > 0f) settlePull()
                            watching = false
                        } else if (event.changes.any { it.isConsumed } && pullOffset <= 0f) {
                            // 子容器正在正常滚动，不干预下拉刷新
                            watching = false
                        }
                    }
                }
            }
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                // 高频位移只失效绘制层，避免拖动时重组整页内容。
                .graphicsLayer { translationY = pullOffset }
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
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                title,
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 24.sp
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

/** 
 * 高颜值极简现代纯 Icon 顶栏按钮 (搜索、扫码通用双子按钮)
 */
@Composable
fun ModernHeaderIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    iconTint: Color = Color(0xFF2563EB),
    containerColor: Color = Color(0xFFEFF6FF),
    borderColor: Color = Color(0xFFDBEAFE),
) {
    val interactionSource = remember { MutableInteractionSource() }
    Surface(
        onClick = onClick,
        interactionSource = interactionSource,
        modifier = modifier
            .size(42.dp)
            .pressFeedback(interactionSource),
        shape = RoundedCornerShape(14.dp),
        color = containerColor,
        border = BorderStroke(1.dp, borderColor),
        shadowElevation = 0.5.dp,
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = iconTint,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

/**
 * 极其高颜值、流线极客风的现代化 App 启动 Splash 开屏动画
 */
@Composable
fun ModernAnimatedSplashScreen(
    onSplashFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var startAnimation by remember { mutableStateOf(false) }

    val logoScale by animateFloatAsState(
        targetValue = if (startAnimation) 1.0f else 0.6f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioMediumBouncy,
            stiffness = Spring.StiffnessLow,
        ),
        label = "logoScale",
    )

    val logoAlpha by animateFloatAsState(
        targetValue = if (startAnimation) 1.0f else 0f,
        animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
        label = "logoAlpha",
    )

    val textOffset by animateFloatAsState(
        targetValue = if (startAnimation) 0f else 24f,
        animationSpec = tween(durationMillis = 700, easing = FastOutSlowInEasing),
        label = "textOffset",
    )

    LaunchedEffect(Unit) {
        startAnimation = true
        kotlinx.coroutines.delay(1200)
        onSplashFinished()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        // 背景极光 Halo Aura 弥散光晕
        Box(
            modifier = Modifier
                .size(240.dp)
                .background(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Color(0xFF3B82F6).copy(alpha = 0.12f * logoAlpha),
                            Color(0xFF10B981).copy(alpha = 0.06f * logoAlpha),
                            Color.Transparent,
                        )
                    ),
                    shape = CircleShape,
                )
        )

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            // 缩放层只处理动画；圆角表面独立裁剪背景、边框与图标。
            val logoShape = RoundedCornerShape(26.dp)
            Box(
                modifier = Modifier
                    .graphicsLayer {
                        scaleX = logoScale
                        scaleY = logoScale
                        alpha = logoAlpha
                    }
                    .size(84.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(logoShape)
                        .background(Color.White)
                        .border(1.dp, Color(0xFFEFF6FF), logoShape),
                    contentAlignment = Alignment.Center,
                ) {
                    androidx.compose.foundation.Image(
                        painter = painterResource(cn.pxyb.mycontrol.R.drawable.platform_logo),
                        contentDescription = "智控中心 Logo",
                        modifier = Modifier.size(56.dp),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            // 品牌文字与微光字样
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.graphicsLayer {
                    translationY = textOffset
                    alpha = logoAlpha
                }
            ) {
                Text(
                    text = "MY CONTROL",
                    style = MaterialTheme.typography.headlineLarge.copy(
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 28.sp,
                        letterSpacing = 1.sp,
                    ),
                    color = MaterialTheme.colorScheme.onBackground,
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.padding(top = 8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(Color(0xFF10B981), CircleShape)
                    )
                    Text(
                        text = "智控中心 · 统一控制平台",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }

                Spacer(Modifier.height(32.dp))

                // 流线亮光 Indicator
                LinearProgressIndicator(
                    modifier = Modifier
                        .width(72.dp)
                        .height(3.dp)
                        .clip(CircleShape),
                    color = Color(0xFF2563EB),
                    trackColor = Color(0xFFEFF6FF),
                )
            }
        }
    }
}

/**
 * 首页服务监控跳转管理后台专用的现代加载过渡弹窗。
 * 解决换取 Cookie 和打开 Web 管理后台期间的空白等待体验，
 * 提供带有目标服务状态色、旋转渐变光弧、动态呼吸涟漪与多阶段状态说明的高级交互动效。
 */
@Composable
fun ServiceLaunchingDialog(
    service: ServiceInfo,
    errorMessage: String? = null,
    onDismissRequest: () -> Unit,
    onRetry: () -> Unit,
) {
    val isError = errorMessage != null
    val style = statusStyle(service.state)
    var stepIndex by remember(service.id, isError) { mutableStateOf(0) }

    LaunchedEffect(service.id, isError) {
        if (!isError) {
            stepIndex = 0
            delay(550)
            stepIndex = 1
            delay(850)
            stepIndex = 2
        }
    }

    val stepText = when (stepIndex) {
        0 -> "正在建立安全会话通道..."
        1 -> "正在换取免密访问凭据..."
        else -> "正在启动管理后台，请稍候..."
    }

    AppDialog(
        onDismissRequest = onDismissRequest,
        modifier = Modifier.widthIn(max = 380.dp),
        contentPadding = PaddingValues(horizontal = 24.dp, vertical = 20.dp),
        footer = {
            if (isError) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    AppDialogSecondaryButton(
                        text = "取消",
                        onClick = onDismissRequest,
                        modifier = Modifier.weight(1f),
                    )
                    AppDialogPrimaryButton(
                        text = "重新尝试",
                        onClick = onRetry,
                        modifier = Modifier.weight(1.2f),
                    )
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    TextButton(
                        onClick = onDismissRequest,
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text(
                            "取消跳转",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.75f),
                        )
                    }
                }
            }
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // 1. 核心动画与图标容器
            Box(
                modifier = Modifier
                    .size(112.dp)
                    .padding(4.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (isError) {
                    Box(
                        modifier = Modifier
                            .size(76.dp)
                            .clip(CircleShape)
                            .background(MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.8f))
                            .border(1.5.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(38.dp),
                        )
                    }
                } else {
                    ServiceOrbitProgressAnimation(
                        accentColor = style.foreground,
                        backgroundColor = style.background,
                    ) {
                        val icon = if (service.category == "miniapp") Icons.Outlined.Hub else Icons.Outlined.Speed
                        Box(
                            modifier = Modifier
                                .size(56.dp)
                                .clip(RoundedCornerShape(18.dp))
                                .background(style.background)
                                .border(1.dp, style.foreground.copy(alpha = 0.25f), RoundedCornerShape(18.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = style.foreground,
                                modifier = Modifier.size(28.dp),
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.height(14.dp))

            // 2. 服务信息与状态标签
            Text(
                text = service.name,
                style = MaterialTheme.typography.titleLarge.copy(
                    fontWeight = FontWeight.Bold,
                    fontSize = 20.sp,
                ),
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            Row(
                modifier = Modifier.padding(top = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                val stateDesc = listOfNotNull(
                    service.category.takeIf { it.isNotBlank() }?.let { if (it == "miniapp") "小程序应用" else "核心服务" },
                    service.httpStatus?.let { "HTTP $it" },
                    service.latencyMs?.let { "$it ms" },
                ).joinToString(" · ").ifBlank { "在线微服务" }

                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .background(style.foreground, CircleShape),
                )
                Text(
                    text = stateDesc,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            Spacer(Modifier.height(20.dp))

            // 3. 阶段状态提示 / 错误提示卡片
            if (isError) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.3f)),
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(
                            Icons.Outlined.ErrorOutline,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp),
                        )
                        Text(
                            text = errorMessage ?: "换取登录凭据失败，请重试。",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                    border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.4f)),
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.OpenInNew,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(16.dp),
                            )
                            Text(
                                text = stepText,
                                style = MaterialTheme.typography.bodyMedium.copy(
                                    fontWeight = FontWeight.Medium,
                                    fontSize = 13.5.sp,
                                ),
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }

                        // 科技感流线 Progress Indicator
                        LinearProgressIndicator(
                            modifier = Modifier
                                .fillMaxWidth(0.85f)
                                .height(3.5.dp)
                                .clip(CircleShape),
                            color = MaterialTheme.colorScheme.primary,
                            trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f),
                        )
                    }
                }
            }
        }
    }
}

/**
 * 科技感旋转光弧与呼吸波纹动效容器
 */
@Composable
private fun ServiceOrbitProgressAnimation(
    accentColor: Color,
    backgroundColor: Color,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val transition = rememberInfiniteTransition(label = "service-orbit")
    val rotationFast by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "orbit-fast",
    )
    val rotationSlow by transition.animateFloat(
        initialValue = 360f,
        targetValue = 0f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "orbit-slow",
    )
    val pulseScale by transition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.18f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-scale",
    )
    val pulseAlpha by transition.animateFloat(
        initialValue = 0.45f,
        targetValue = 0.12f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse-alpha",
    )

    Box(
        modifier = modifier.size(104.dp),
        contentAlignment = Alignment.Center,
    ) {
        // 1. 外部柔和呼吸扩散光环
        Box(
            modifier = Modifier
                .size(86.dp)
                .graphicsLayer {
                    scaleX = pulseScale
                    scaleY = pulseScale
                    alpha = pulseAlpha
                }
                .background(accentColor.copy(alpha = 0.35f), CircleShape)
        )

        // 2. 外部双层旋转科技光弧
        Canvas(modifier = Modifier.size(92.dp)) {
            val strokeWidthOuter = 2.5.dp.toPx()
            val strokeWidthInner = 1.8.dp.toPx()

            // 外层顺时针光弧
            drawArc(
                color = accentColor,
                startAngle = rotationFast,
                sweepAngle = 100f,
                useCenter = false,
                style = Stroke(width = strokeWidthOuter, cap = StrokeCap.Round),
            )
            drawArc(
                color = accentColor.copy(alpha = 0.3f),
                startAngle = rotationFast + 180f,
                sweepAngle = 60f,
                useCenter = false,
                style = Stroke(width = strokeWidthOuter, cap = StrokeCap.Round),
            )

            // 内层逆时针辅光弧
            drawArc(
                color = accentColor.copy(alpha = 0.6f),
                startAngle = rotationSlow,
                sweepAngle = 70f,
                useCenter = false,
                style = Stroke(width = strokeWidthInner, cap = StrokeCap.Round),
            )
        }

        // 3. 中心内容（微服务图标）
        content()
    }
}

