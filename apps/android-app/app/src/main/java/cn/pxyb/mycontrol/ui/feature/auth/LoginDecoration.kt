package cn.pxyb.mycontrol.ui.feature.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.ui.legal.PrivacyPolicyDialog
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

@Composable
internal fun LoginAmbientBackground() {
    val dark = isAppInDarkTheme()
    val background = if (dark) ColorTokens.LoginBackgroundDark else ColorTokens.LoginBackgroundLight
    val geometry = if (dark) ColorTokens.LoginGeometryDark else ColorTokens.LoginGeometryLight
    val corner = if (dark) ColorTokens.LoginCornerDark else ColorTokens.LoginCornerLight
    val dot = if (dark) ColorTokens.LoginDotDark else ColorTokens.LoginDotLight
    val outline = if (dark) ColorTokens.LoginOutlineDark else ColorTokens.LoginOutlineLight
    Box(
        modifier = Modifier
            .fillMaxSize()
            .drawWithCache {
                val band = Path().apply {
                    moveTo(0f, size.height * 0.16f)
                    lineTo(size.width * 0.72f, 0f)
                    lineTo(size.width, 0f)
                    lineTo(size.width, size.height * 0.12f)
                    lineTo(0f, size.height * 0.42f)
                    close()
                }
                val bottomCorner = Path().apply {
                    moveTo(0f, size.height * 0.78f)
                    lineTo(size.width, size.height)
                    lineTo(0f, size.height)
                    close()
                }
                val gridStep = 18.dp.toPx()
                val dotRadius = 0.8.dp.toPx()
                val gridHeight = size.height * 0.4f
                val outlineSize = minOf(size.width * 0.77f, 360.dp.toPx())
                val outlineOrigin = Offset(size.width - outlineSize * 0.62f, 60.dp.toPx())
                val outlineStroke = Stroke(1.dp.toPx())
                onDrawBehind {
                    drawRect(background)
                    drawPath(band, geometry)
                    drawPath(bottomCorner, corner)
                    var y = gridStep / 2
                    while (y < gridHeight) {
                        var x = gridStep / 2
                        while (x < size.width) {
                            val fade = (1f - x / size.width - y / gridHeight).coerceIn(0f, 1f)
                            drawCircle(dot.copy(alpha = dot.alpha * fade), dotRadius, Offset(x, y))
                            x += gridStep
                        }
                        y += gridStep
                    }
                    rotate(-28f, outlineOrigin + Offset(outlineSize / 2, outlineSize / 2)) {
                        drawRoundRect(
                            color = outline,
                            topLeft = outlineOrigin,
                            size = Size(outlineSize, outlineSize),
                            cornerRadius = CornerRadius(64.dp.toPx()),
                            style = outlineStroke,
                        )
                    }
                }
            }
    )
}

@Composable
internal fun LoginHeader() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Surface(
            modifier = Modifier.size(56.dp),
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Image(
                    painter = painterResource(R.drawable.platform_logo),
                    contentDescription = "智控中心",
                    modifier = Modifier.size(40.dp),
                )
            }
        }

        Spacer(Modifier.height(16.dp))

        Text(
            "登录智控中心",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )

        Text(
            "你的应用与日常，一处掌握",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 8.dp),
        )
    }
}

@Composable
internal fun LoginFooter() {
    var showPrivacyPolicy by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                Icons.Outlined.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                modifier = Modifier.size(12.dp)
            )
            Spacer(Modifier.width(4.dp))
            Text(
                "© 2026 智控中心 · 安全传输已加密",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f)
            )
        }
        Text(
            "系统版本 v${BuildConfig.VERSION_NAME}",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
            modifier = Modifier.padding(top = 3.dp)
        )
        Text(
            "登录即代表你已阅读并同意《隐私政策》",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.58f),
            modifier = Modifier.padding(top = 6.dp).clickable { showPrivacyPolicy = true },
        )
    }

    if (showPrivacyPolicy) {
        PrivacyPolicyDialog(onDismiss = { showPrivacyPolicy = false })
    }
}

@Composable
internal fun BrandMark(compact: Boolean = false) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            shape = MaterialTheme.shapes.medium,
            color = MaterialTheme.colorScheme.surface,
            shadowElevation = 4.dp,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
        ) {
            androidx.compose.foundation.Image(
                painter = painterResource(R.drawable.platform_logo),
                contentDescription = "智控中心",
                modifier = Modifier
                    .padding(6.dp)
                    .size(if (compact) 32.dp else 40.dp),
            )
        }
        Column {
            Text(
                "智控中心",
                style = if (compact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                letterSpacing = 0.sp,
            )
            if (!compact) Text(
                "SMART CONTROL CENTER",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
