package cn.pxyb.mycontrol.ui

import androidx.compose.animation.Crossfade
import android.graphics.drawable.ColorDrawable
import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Refresh
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val PlatformTimeFormatter = DateTimeFormatter.ofPattern("MM-dd HH:mm")
    .withZone(ZoneId.systemDefault())

data class StatusStyle(
    val label: String,
    val foreground: Color,
    val background: Color,
    val icon: ImageVector,
)

val AppCardShape = RoundedCornerShape(20.dp)

@Composable
fun statusStyle(status: String): StatusStyle = when (status.lowercase()) {
    "healthy", "operational", "succeeded", "success", "passed", "resolved", "connected", "online" ->
        StatusStyle(
            "正常",
            Color(0xFF047857),
            Color(0xFFD1FAE5),
            Icons.Outlined.CheckCircle,
        )
    "critical", "failed", "failure", "offline", "outage", "error", "breached" ->
        StatusStyle(
            "异常",
            Color(0xFFB91C1C),
            Color(0xFFFEE2E2),
            Icons.Outlined.ErrorOutline,
        )
    "warning", "degraded", "action_required", "overdue", "unhealthy" ->
        StatusStyle(
            "需关注",
            Color(0xFFB45309),
            Color(0xFFFEF3C7),
            Icons.Outlined.WarningAmber,
        )
    "running", "pending", "queued", "acknowledged", "in_progress" ->
        StatusStyle(
            "处理中",
            Color(0xFF1D4ED8),
            Color(0xFFEFF6FF),
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
    content: @Composable () -> Unit,
) {
    Card(
        modifier = Modifier
            .clip(AppCardShape)
            .then(modifier)
            .fillMaxWidth(),
        shape = AppCardShape,
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFCFCFA)),
        border = BorderStroke(0.5.dp, Color.Black.copy(alpha = 0.04f)),
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
            .background(background, MaterialTheme.shapes.medium)
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

        val sheetColor = if (dark) Color(0xFF1E293B) else Color(0xFFFFFBFE)
        val sheetBorder = if (dark) Color.White.copy(alpha = 0.08f) else Color.Black.copy(alpha = 0.05f)
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
                            shape = RoundedCornerShape(28.dp),
                            ambientColor = Color.Black.copy(alpha = 0.18f),
                            spotColor = Color.Black.copy(alpha = 0.22f),
                        )
                        .clip(RoundedCornerShape(28.dp))
                        .background(sheetColor)
                        .background(headerWash)
                        .border(1.dp, sheetBorder, RoundedCornerShape(28.dp)),
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
                                    .background(
                                        if (dark) Color.White.copy(alpha = 0.04f)
                                        else Color(0xFFF8FAFC).copy(alpha = 0.92f),
                                    )
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
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled && !busy,
        shape = RoundedCornerShape(16.dp),
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
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled && !busy,
        shape = RoundedCornerShape(16.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (dark) Color.White.copy(alpha = 0.08f) else Color(0xFFF1F5F9),
            contentColor = MaterialTheme.colorScheme.onSurface,
            disabledContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else Color(0xFFF8FAFC),
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
    val dark = isSystemInDarkTheme()
    Button(
        onClick = onClick,
        modifier = modifier.height(48.dp),
        enabled = enabled && !busy,
        shape = RoundedCornerShape(16.dp),
        elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp, pressedElevation = 0.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (dark) Color(0xFF7F1D1D) else Color(0xFFFEE2E2),
            contentColor = if (dark) Color(0xFFFECACA) else Color(0xFFB91C1C),
            disabledContainerColor = if (dark) Color(0xFF7F1D1D).copy(alpha = 0.45f) else Color(0xFFFEE2E2).copy(alpha = 0.55f),
            disabledContentColor = if (dark) Color(0xFFFECACA).copy(alpha = 0.55f) else Color(0xFFB91C1C).copy(alpha = 0.45f),
        ),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
    ) {
        if (busy) {
            CircularProgressIndicator(
                Modifier.size(18.dp),
                strokeWidth = 2.dp,
                color = if (dark) Color(0xFFFECACA) else Color(0xFFB91C1C),
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
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.85f),
            unfocusedBorderColor = if (dark) Color.White.copy(alpha = 0.10f) else Color(0xFFE2E8F0),
            disabledBorderColor = if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFFE2E8F0),
            focusedContainerColor = if (dark) Color.White.copy(alpha = 0.06f) else Color(0xFFF8FAFC),
            unfocusedContainerColor = if (dark) Color.White.copy(alpha = 0.04f) else Color(0xFFF8FAFC),
            disabledContainerColor = if (dark) Color.White.copy(alpha = 0.02f) else Color(0xFFF1F5F9),
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
        iconTint = if (danger) {
            if (isSystemInDarkTheme()) Color(0xFFFCA5A5) else Color(0xFFDC2626)
        } else {
            MaterialTheme.colorScheme.primary
        },
        iconBackground = if (danger) {
            if (isSystemInDarkTheme()) Color(0xFF7F1D1D).copy(alpha = 0.55f) else Color(0xFFFEE2E2)
        } else {
            MaterialTheme.colorScheme.primaryContainer
        },
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
    val container = if (dark) Color(0xFF1E293B).copy(alpha = 0.94f) else Color(0xFF0F172A).copy(alpha = 0.95f)
    val border = if (dark) Color(0xFF475569).copy(alpha = 0.55f) else Color.White.copy(alpha = 0.22f)
    val iconColor = if (error) Color(0xFFFCA5A5) else Color(0xFF93C5FD)
    val iconBackground = Color.White.copy(alpha = if (dark) 0.14f else 0.16f)
    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(18.dp),
        color = container,
        contentColor = Color(0xFFF8FAFC),
        shadowElevation = 16.dp,
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
                        tint = iconColor,
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

@Composable
fun ImmersiveHeader(
    title: String,
    subtitle: String = "生产环境 · 智控中心 LIVE",
    refreshing: Boolean = false,
    onRefresh: (() -> Unit)? = null,
    actions: (@Composable () -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
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

            if (onRefresh != null) {
                Surface(
                    color = MaterialTheme.colorScheme.surface,
                    shape = CircleShape,
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                ) {
                    androidx.compose.material3.IconButton(
                        onClick = onRefresh,
                        enabled = !refreshing,
                        modifier = Modifier.size(42.dp)
                    ) {
                        Crossfade(targetState = refreshing, animationSpec = tween(160), label = "refresh") { busy ->
                            if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.primary)
                            else Icon(Icons.Outlined.Refresh, contentDescription = "刷新", tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}
