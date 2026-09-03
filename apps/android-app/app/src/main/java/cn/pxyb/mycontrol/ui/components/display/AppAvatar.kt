package cn.pxyb.mycontrol.ui.components.display

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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import kotlin.math.abs

private val AvatarGradients = listOf(
    Color(0xFF3B82F6) to Color(0xFF1D4ED8), // 科技蓝
    Color(0xFF8B5CF6) to Color(0xFF6D28D9), // 极光紫
    Color(0xFF10B981) to Color(0xFF047857), // 翡翠绿
    Color(0xFFF59E0B) to Color(0xFFD97706), // 琥珀黄
    Color(0xFFEC4899) to Color(0xFFBE185D), // 玫粉
    Color(0xFF06B6D4) to Color(0xFF0E7490), // 青蓝
)

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
    val gradient = remember(name) {
        val hash = abs(name.hashCode())
        val pair = AvatarGradients[hash % AvatarGradients.size]
        Brush.linearGradient(listOf(pair.first, pair.second))
    }

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
                    DefaultInitialsAvatar(initials, gradient, shape, size)
                },
                error = {
                    DefaultInitialsAvatar(initials, gradient, shape, size)
                },
            )
        } else {
            DefaultInitialsAvatar(initials, gradient, shape, size)
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
    gradient: Brush,
    shape: Shape,
    size: Dp,
) {
    val fontSize = (size.value * 0.42f).coerceAtLeast(11f).sp
    Box(
        modifier = Modifier
            .size(size)
            .clip(shape)
            .background(gradient),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.titleMedium.copy(
                fontSize = fontSize,
                fontWeight = FontWeight.Bold,
            ),
            color = Color.White,
        )
    }
}
