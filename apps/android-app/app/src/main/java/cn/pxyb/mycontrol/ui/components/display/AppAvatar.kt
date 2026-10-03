package cn.pxyb.mycontrol.ui.components.display

import cn.pxyb.mycontrol.ui.theme.AccentColors
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage

/**
 * 通用头像组件
 */
@Composable
fun AppAvatar(
    name: String,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    size: Dp = 40.dp,
    shape: Shape = CircleShape,
    statusColor: Color? = null,
) {
    val accents = listOf(ColorTokens.Blue, ColorTokens.Purple, ColorTokens.Green,
        ColorTokens.Amber, ColorTokens.Pink, ColorTokens.Cyan)
    val accent = accents[Math.floorMod(name.hashCode(), accents.size)]

    val initials = remember(name) {
        val trimmed = name.trim()
        when {
            trimmed.isEmpty() -> "U"
            trimmed.first().isLetter() -> trimmed.first().uppercase()
            else -> trimmed.take(1)
        }
    }

    Box(modifier = modifier.size(size)) {
        if (!imageUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = imageUrl,
                contentDescription = name,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(size)
                    .clip(shape),
                loading = {
                    DefaultInitialsAvatar(initials, accent, shape, size)
                },
                error = {
                    DefaultInitialsAvatar(initials, accent, shape, size)
                },
            )
        } else {
            DefaultInitialsAvatar(initials, accent, shape, size)
        }

        if (statusColor != null) {
            val dotSize = (size.value * 0.28f).coerceIn(8f, 14f).dp
            Box(
                modifier = Modifier
                    .size(dotSize)
                    .align(Alignment.BottomEnd)
                    .offset(x = 1.dp, y = 1.dp)
                    .clip(CircleShape)
                    .background(statusColor)
                    .border(1.5.dp, MaterialTheme.colorScheme.surface, CircleShape),
            )
        }
    }
}

@Composable
private fun DefaultInitialsAvatar(
    initials: String,
    accent: AccentColors,
    shape: Shape,
    size: Dp,
) {
    val fontSize = (size.value * 0.42f).coerceAtLeast(11f).sp
    Box(
        modifier = Modifier
            .size(size)
            .clip(shape)
            .background(accent.container),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = fontSize,
                fontWeight = FontWeight.Bold,
            ),
            color = accent.foreground,
        )
    }
}
