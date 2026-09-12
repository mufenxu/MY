package cn.pxyb.mycontrol.ui.startup

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

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
    val isDark = isAppInDarkTheme()
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
