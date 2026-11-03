package cn.pxyb.mycontrol.ui.feature.auth

import android.content.res.Configuration
import android.provider.Settings
import androidx.annotation.OptIn
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme

/** 手机版母版 1080×1920，与 `res/raw/login_bg_phone.mp4` 保持一致。 */
private const val LOGIN_BG_PHONE_ASPECT = 1080f / 1920f

/** 视频底边淡出的高度，用来把视频的浅色收尾接到页面底色上。 */
private val LOGIN_BG_FADE_HEIGHT = 160.dp

/** 首帧就绪后海报淡出的时长，足够盖住 ExoPlayer 起播的定位抖动。 */
private const val LOGIN_BG_POSTER_FADE_MS = 400

/**
 * 登录页背景。
 *
 * 浅色主题下播放背景视频；深色主题没有配套素材，沿用原来的几何底纹，
 * 避免整块白底画面在暗背景上过曝。
 */
@Composable
internal fun LoginBackdrop(modifier: Modifier = Modifier) {
    if (isAppInDarkTheme()) {
        LoginAmbientBackground()
        return
    }
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val background = ColorTokens.LoginBackgroundLight
    Box(modifier = modifier.fillMaxSize().background(background)) {
        // 竖屏按宽度铺满、贴顶放置，不做 zoom 裁切——素材里地球、柱状图都贴着左右边缘。
        // 横屏用平板版，比例差距小，直接铺满裁切。
        val videoModifier = if (landscape) {
            Modifier.fillMaxSize()
        } else {
            Modifier.fillMaxWidth().aspectRatio(LOGIN_BG_PHONE_ASPECT).align(Alignment.TopCenter)
        }
        Box(modifier = videoModifier) {
            LoginBackdropVideo(landscape = landscape, fadeColor = background)
        }
    }
}

@Composable
private fun BoxScope.LoginBackdropVideo(landscape: Boolean, fadeColor: Color) {
    val context = LocalContext.current
    val videoRes = if (landscape) R.raw.login_bg_tablet else R.raw.login_bg_phone
    val posterRes = if (landscape) R.drawable.login_poster_tablet else R.drawable.login_poster_phone
    // 系统开启「移除动画」时不再播放，只留静态首帧，避免无障碍设置被忽略。
    val reduceMotion = remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    var firstFrameReady by remember { mutableStateOf(false) }
    // 旋转后换成另一套素材，重新用海报压住切换瞬间。
    LaunchedEffect(videoRes) { firstFrameReady = false }
    val posterAlpha by animateFloatAsState(
        targetValue = if (firstFrameReady || reduceMotion) 0f else 1f,
        animationSpec = tween(durationMillis = LOGIN_BG_POSTER_FADE_MS),
        label = "login-poster-alpha",
    )

    Image(
        painter = painterResource(posterRes),
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = Modifier.fillMaxSize().graphicsLayer { alpha = posterAlpha },
    )
    if (!reduceMotion) {
        LoginBackdropPlayer(
            videoRes = videoRes,
            landscape = landscape,
            onFirstFrame = { firstFrameReady = true },
        )
    }
    // 视频不铺满整屏，底边用渐隐过渡到底色，避免出现一条硬边。
    Box(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .height(LOGIN_BG_FADE_HEIGHT)
            .background(Brush.verticalGradient(listOf(Color.Transparent, fadeColor))),
    )
}

@OptIn(markerClass = [UnstableApi::class])
@Composable
private fun LoginBackdropPlayer(videoRes: Int, landscape: Boolean, onFirstFrame: () -> Unit) {
    val context = LocalContext.current
    val player = remember {
        ExoPlayer.Builder(context).build().apply {
            // 素材是「正放 10 秒 + 倒放 10 秒」的回旋版，首尾同帧。
            // REPEAT_MODE_ONE 是预载式循环，播完直接接上，不像 setLooping 那样回到 0 秒重定位。
            repeatMode = Player.REPEAT_MODE_ONE
            volume = 0f
            playWhenReady = true
        }
    }

    DisposableEffect(player) {
        val listener = object : Player.Listener {
            override fun onRenderedFirstFrame() = onFirstFrame()
        }
        player.addListener(listener)
        onDispose {
            player.removeListener(listener)
            player.release()
        }
    }

    LaunchedEffect(player, videoRes) {
        player.setMediaItem(MediaItem.fromUri("android.resource://${context.packageName}/$videoRes".toUri()))
        player.prepare()
    }

    // 页面不可见时立刻暂停，否则锁屏后仍在后台解码，既耗电也可能被系统回收。
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, player) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> player.play()
                Lifecycle.Event.ON_STOP -> player.pause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val exoPlayer = player
    AndroidView(
        factory = { ctx ->
            PlayerView(ctx).apply {
                useController = false
                // 快门透明，海报才能从视频下面透出来，直到首帧就绪。
                setShutterBackgroundColor(android.graphics.Color.TRANSPARENT)
                setKeepContentOnPlayerReset(true)
                resizeMode = if (landscape) {
                    AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                } else {
                    AspectRatioFrameLayout.RESIZE_MODE_FIT
                }
                setBackgroundColor(android.graphics.Color.TRANSPARENT)
                setPlayer(exoPlayer)
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}
