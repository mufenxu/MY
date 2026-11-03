package cn.pxyb.mycontrol.ui.feature.auth

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.provider.Settings
import android.view.LayoutInflater
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
import androidx.compose.runtime.mutableIntStateOf
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
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import cn.pxyb.mycontrol.ui.theme.isAppInDarkTheme
import kotlinx.coroutines.delay

/** 手机版母版 1080×1920，与 `res/raw/login_bg_phone.mp4` 保持一致。 */
private const val LOGIN_BG_PHONE_ASPECT = 1080f / 1920f

/** 视频底边淡出的高度，用来把视频的浅色收尾接到页面底色上。 */
private val LOGIN_BG_FADE_HEIGHT = 160.dp

/** 首帧就绪后海报淡出的时长，足够盖住 ExoPlayer 起播的定位抖动。 */
private const val LOGIN_BG_POSTER_FADE_MS = 400

/** 两路画面交接时的过渡时长。素材首尾同帧，这段过渡只用来吞掉解码抖动。 */
private const val LOGIN_BG_SWAP_FADE_MS = 140

/** 备用实例迟迟不出首帧就退回单实例循环：宁可定格一下，也不能停在半截画面上。 */
private const val LOGIN_BG_STANDBY_TIMEOUT_MS = 2500L

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

/**
 * 用两个播放器实例轮流播放，而不是 `REPEAT_MODE_ONE`。
 *
 * 单实例回环时，播放器必须把位置 seek 回 0，这会触发解码器 flush 并从关键帧重解，
 * 真机上表现为 100~200ms 的画面定格——素材做得再干净也补不回来。
 *
 * 这里改成：A 在播的同时 B 已经停在 0 位、首帧落在自己的 surface 上。A 播到结尾的
 * 一瞬间让 B 开始播，两路素材首尾同帧，交接点上画面内容一致，看不到切换痕迹。
 */
@OptIn(markerClass = [UnstableApi::class])
@Composable
private fun LoginBackdropPlayer(
    videoRes: Int,
    landscape: Boolean,
    onFirstFrame: () -> Unit,
) {
    val context = LocalContext.current
    val players = remember(videoRes) { arrayOfNulls<ExoPlayer>(2) }
    var activeSlot by remember(videoRes) { mutableIntStateOf(0) }
    var standbyReady by remember(videoRes) { mutableStateOf(false) }
    var singleLoop by remember(videoRes) { mutableStateOf(false) }
    var firstFrameReported by remember(videoRes) { mutableStateOf(false) }
    var playersAttached by remember(videoRes) { mutableStateOf(false) }

    DisposableEffect(videoRes) {
        val uri = "android.resource://${context.packageName}/$videoRes".toUri()
        val slots = arrayOfNulls<ExoPlayer>(2)
        val listeners = arrayOfNulls<Player.Listener>(2)

        for (index in 0 until 2) {
            val player = runCatching {
                ExoPlayer.Builder(context).build().apply {
                    setMediaItem(MediaItem.fromUri(uri))
                    volume = 0f
                    // 交给 repeatMode 就会回到上面说的 seek + flush，这里必须由我们自己调度。
                    repeatMode = Player.REPEAT_MODE_OFF
                    playWhenReady = index == 0
                    prepare()
                }
            }.getOrNull() ?: continue

            val listener = object : Player.Listener {
                override fun onRenderedFirstFrame() {
                    if (index == 1) standbyReady = true
                    if (index == 0 && !firstFrameReported) {
                        firstFrameReported = true
                        onFirstFrame()
                    }
                }

                override fun onPlayerError(error: PlaybackException) {
                    // 备用的那路起不来（低端机只肯给一个 1080p 解码器时会这样）。
                    // 退回单实例循环：会定格一下，但不会停在最后一帧不动。
                    if (index == 1 && !singleLoop) {
                        singleLoop = true
                        slots[0]?.repeatMode = Player.REPEAT_MODE_ONE
                    }
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    if (singleLoop || playbackState != Player.STATE_ENDED) return
                    if (index != activeSlot) return
                    val incoming = slots[1 - index] ?: return
                    // 两路素材首尾同帧，交接点上画面内容一致，交换不会有可见跳变。
                    incoming.play()
                    activeSlot = 1 - index
                    // 这一路在后台回到起点，下次交接时它已经停在首帧上等着。
                    player.pause()
                    player.seekTo(0)
                }
            }
            player.addListener(listener)
            slots[index] = player
            listeners[index] = listener
        }

        for (index in 0 until 2) players[index] = slots[index]
        // 触发一次重组，让 AndroidView 的 update 把 player 补挂到视图上。
        playersAttached = true

        onDispose {
            for (index in 0 until 2) {
                val player = slots[index] ?: continue
                listeners[index]?.let(player::removeListener)
                player.release()
            }
            players.fill(null)
        }
    }

    LaunchedEffect(videoRes, standbyReady, singleLoop) {
        if (standbyReady || singleLoop) return@LaunchedEffect
        delay(LOGIN_BG_STANDBY_TIMEOUT_MS)
        if (!standbyReady) {
            singleLoop = true
            players[0]?.repeatMode = Player.REPEAT_MODE_ONE
        }
    }

    // 页面不可见时立刻暂停，否则锁屏后仍在后台解码，既耗电也可能被系统回收。
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, videoRes) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> players[activeSlot]?.play()
                Lifecycle.Event.ON_STOP -> players.forEach { player -> player?.pause() }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // 上层实例用透明度接管画面：0 时完全让给下层，1 时完全盖住下层。
    // 交接点两路内容相同，过渡期间不会露出底色。
    val topAlpha by animateFloatAsState(
        targetValue = if (activeSlot == 1) 1f else 0f,
        animationSpec = tween(durationMillis = LOGIN_BG_SWAP_FADE_MS),
        label = "login-bg-swap",
    )

    AndroidView(
        factory = { ctx -> createBackdropView(ctx, landscape) },
        update = { view ->
            if (playersAttached && view.player !== players[0]) view.player = players[0]
            view.alpha = 1f
        },
        modifier = Modifier.fillMaxSize(),
    )
    AndroidView(
        factory = { ctx -> createBackdropView(ctx, landscape) },
        update = { view ->
            if (playersAttached && view.player !== players[1]) view.player = players[1]
            view.alpha = topAlpha
        },
        modifier = Modifier.fillMaxSize(),
    )
}

// Compose 的 AndroidView 自行管理子视图布局，不需要 root 来解析 layout params，
// 这里的 null 是刻意的；PlayerView 的 surface_type 只能由 XML 属性指定，没有对应的代码接口。
@SuppressLint("InflateParams")
@OptIn(markerClass = [UnstableApi::class])
private fun createBackdropView(context: Context, landscape: Boolean): PlayerView {
    val view = LayoutInflater.from(context)
        .inflate(R.layout.view_login_backdrop, null) as PlayerView
    view.useController = false
    view.setKeepContentOnPlayerReset(true)
    view.resizeMode = if (landscape) {
        AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    } else {
        AspectRatioFrameLayout.RESIZE_MODE_FIT
    }
    return view
}
