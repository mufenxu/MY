package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.LinkOff
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import cn.pxyb.mycontrol.data.ChaoxingActivity
import cn.pxyb.mycontrol.data.ChaoxingCourse
import cn.pxyb.mycontrol.ui.PlatformWebActivity
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppInlineDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.dialog.AppConfirmDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDivider
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.display.AppIconTile
import cn.pxyb.mycontrol.ui.components.display.AppListCard
import cn.pxyb.mycontrol.ui.components.display.AppSectionHeader
import cn.pxyb.mycontrol.ui.components.display.AppStatusBadge
import cn.pxyb.mycontrol.ui.components.display.AppStatusSemantic
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.input.AppTextField
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
import cn.pxyb.mycontrol.ui.components.picker.AppTimePickerModal
import cn.pxyb.mycontrol.ui.theme.ColorTokens
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun ChaoxingScreen(
    state: ChaoxingUiState,
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onConnect: (String) -> Unit,
    onDisconnect: () -> Unit,
    onConnectSignProvider: (String, String) -> Unit,
    onDisconnectSignProvider: () -> Unit,
    onSelectCourse: (ChaoxingCourse) -> Unit,
    onOpenActivity: (ChaoxingActivity) -> Unit,
    onRefreshSelected: () -> Unit,
    onCloseActivity: () -> Unit,
    onLocate: (Context) -> Unit,
    onSign: () -> Unit,
    onCaptchaVerified: (String, String) -> Unit,
    onToggleAutoSign: (Boolean) -> Unit,
    onAddAutoSignTime: (String) -> Unit,
    onRemoveAutoSignTime: (String) -> Unit,
    onSaveAutoSignLocation: (Context) -> Unit,
    onSelectAutoSignCourse: (ChaoxingCourse?) -> Unit,
    onRunAutoSign: () -> Unit,
    onReport: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    val context = LocalContext.current
    var courseExpanded by remember { mutableStateOf(false) }
    var confirmDisconnect by remember { mutableStateOf(false) }
    var confirmDisconnectProvider by remember { mutableStateOf(false) }
    var confirmSign by remember(state.selected?.id) { mutableStateOf(false) }
    var timeToConfirm by remember { mutableStateOf<String?>(null) }
    var showSignProvider by remember { mutableStateOf(false) }
    var showAutoSignTimePicker by remember { mutableStateOf(false) }
    var returningFromOfficial by remember { mutableStateOf(false) }
    var showCaptcha by remember(state.selected?.id) { mutableStateOf(false) }
    val currentRefreshSelected by rememberUpdatedState(onRefreshSelected)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val loginLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val cookies = result.data?.getStringExtra(PlatformWebActivity.RESULT_CHAOXING_SESSION)
            result.data?.removeExtra(PlatformWebActivity.RESULT_CHAOXING_SESSION)
            if (!cookies.isNullOrBlank()) onConnect(cookies)
        }
    }
    val permissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) onLocate(context)
        else onReport("位置签到需要精确位置权限，请在系统设置中为 MY 开启后重试。")
    }
    val autoSignPermissions = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) onSaveAutoSignLocation(context)
        else onReport("定时签到需要精确位置权限，请在系统设置中为 MY 开启后重试。")
    }
    LaunchedEffect(Unit) { onRefresh() }
    LaunchedEffect(state.session.connected, state.session.signProviderConnected) {
        if (!state.session.connected || state.session.signProviderConnected) showSignProvider = false
    }
    DisposableEffect(Unit) { onDispose(onCloseActivity) }
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME && returningFromOfficial) {
                returningFromOfficial = false
                currentRefreshSelected()
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    fun openSignProvider() {
        onClearFeedback()
        showSignProvider = true
    }

    fun openOfficial() {
        val activity = state.selected ?: return
        val url = Uri.parse("https://mobilelearn.chaoxing.com/newsign/preSign").buildUpon()
            .appendQueryParameter("courseId", activity.courseId).appendQueryParameter("classId", activity.classId)
            .appendQueryParameter("activePrimaryId", activity.id).appendQueryParameter("general", "1")
            .appendQueryParameter("sys", "1").appendQueryParameter("ls", "1").appendQueryParameter("appType", "15").build()
        val direct = Intent(Intent.ACTION_VIEW, url).setPackage("com.chaoxing.mobile")
        val intent = direct.takeIf { it.resolveActivity(context.packageManager) != null }
            ?: context.packageManager.getLaunchIntentForPackage("com.chaoxing.mobile")
        if (intent == null) {
            onReport("请先安装学习通客户端，再打开对应课程的签到活动。")
            return
        }
        runCatching { context.startActivity(intent); returningFromOfficial = true }
            .onFailure { onReport("无法打开学习通，请手动进入对应课程完成签到。") }
    }

    AppSubPage(
        title = "学习通签到", subtitle = "课程活动与签到记录", onBack = onBack, contentPadding = contentPadding,
        refreshing = state.busy && state.operation == "refresh", onRefresh = onRefresh,
        actions = { AppHeaderIconButton(Icons.Outlined.Refresh, "刷新学习通", onRefresh, enabled = !state.busy) },
    ) {
        if (state.message != null && state.selected == null) {
            item { AppFeedbackBanner(state.message, state.error, onRetry = onRefresh, autoDismissDurationMillis = null, onDismiss = onClearFeedback) }
        }
        if (!state.loaded) {
            item { GlassShimmerList() }
        } else if (!state.session.connected) {
            item {
                AppSectionHeader(title = "账号", subtitle = "连接后可读取课程与签到活动", accent = ColorTokens.Blue.foreground)
            }
            item {
                AppPanel {
                    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AppIconTile(Icons.Outlined.School, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("连接学习通", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                                Text("使用学习通官方页面登录，连接后可查看课程、签到活动和官方记录。",
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        AppButton("登录学习通", { loginLauncher.launch(PlatformWebActivity.createChaoxingLoginIntent(context)) },
                            modifier = Modifier.fillMaxWidth(), loading = state.operation == "connect", enabled = !state.busy, icon = Icons.Outlined.School)
                    }
                }
            }
        } else {
            item {
                AppSectionHeader(title = "账号", subtitle = "学习通会话与帮你签服务", accent = ColorTokens.Blue.foreground)
            }
            item {
                AppPanel {
                    Column(Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            AppIconTile(Icons.Outlined.School, ColorTokens.Blue.foreground, ColorTokens.Blue.container)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(state.session.name, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (state.session.school.isNotBlank()) {
                                    Text(state.session.school, style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                            AppStatusBadge(
                                label = if (state.session.signProviderConnected) "帮你签已连接" else "帮你签未连接",
                                semantic = if (state.session.signProviderConnected) AppStatusSemantic.Success else AppStatusSemantic.Neutral,
                            )
                        }
                        AppDivider()
                        if (state.session.signProviderConnected) {
                            AppActionRow(
                                title = "帮你签服务",
                                subtitle = "已连接 · 位置签到由帮你签提交",
                                icon = Icons.Outlined.CloudSync,
                                enabled = !state.busy,
                                onClick = null,
                                trailingContent = {
                                    AppInlineDangerButton("断开帮你签", { confirmDisconnectProvider = true }, enabled = !state.busy)
                                },
                            )
                        } else {
                            AppActionRow(
                                title = "帮你签服务",
                                subtitle = "未连接 · 连接后位置签到由帮你签提交",
                                icon = Icons.Outlined.CloudSync,
                                enabled = !state.busy,
                                onClick = ::openSignProvider,
                            )
                        }
                        AppDivider()
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AppSecondaryButton("重新登录", { loginLauncher.launch(PlatformWebActivity.createChaoxingLoginIntent(context)) },
                                enabled = !state.busy, modifier = Modifier.weight(1f))
                            AppDangerButton("断开学习通", { confirmDisconnect = true },
                                enabled = !state.busy, modifier = Modifier.weight(1f))
                        }
                    }
                }
            }
            item {
                AppSectionHeader(
                    title = "定时签到",
                    subtitle = listOfNotNull(
                        if (state.autoSign.enabled) "已开启" else "未开启",
                        state.autoSign.times.takeIf { it.isNotEmpty() }?.joinToString("、"),
                    ).joinToString(" · "),
                    accent = ColorTokens.Purple.foreground,
                )
            }
            item {
                ChaoxingAutoSignPanel(
                    state = state,
                    onToggleAutoSign = onToggleAutoSign,
                    onRequestAddTime = { showAutoSignTimePicker = true },
                    onRemoveAutoSignTime = onRemoveAutoSignTime,
                    onSelectAutoSignCourse = onSelectAutoSignCourse,
                    onRequestLocation = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) onSaveAutoSignLocation(context)
                        else autoSignPermissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    },
                    onRunAutoSign = onRunAutoSign,
                )
            }
            if (state.courses.isEmpty()) {
                item {
                    AppSectionHeader(title = "课程活动", subtitle = "选择课程查看签到活动", accent = ColorTokens.Green.foreground)
                }
                item { AppEmptyState("暂无课程", detail = "当前学习通账号未返回课程，可以刷新或重新连接账号。") }
            } else {
                item {
                    AppSectionHeader(
                        title = "课程活动",
                        subtitle = state.course?.name?.takeIf(String::isNotBlank) ?: "选择课程查看签到活动",
                        accent = ColorTokens.Green.foreground,
                    )
                }
                item {
                    AppSelectField("选择课程", state.course?.key,
                        state.courses.map { AppSelectOption(it.key, it.name, listOf(it.teacher, it.className).filter(String::isNotBlank).joinToString(" · ")) },
                        onValueChange = { key -> courseExpanded = false; state.courses.firstOrNull { it.key == key }?.let(onSelectCourse) },
                        expanded = courseExpanded, onExpandedChange = { courseExpanded = it }, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
                }
                if (state.busy && state.operation == "activities") {
                    item { GlassShimmerList() }
                } else if (state.activities.isEmpty()) {
                    item { AppEmptyState("暂无签到活动", detail = "当前课程没有返回签到活动，请在老师发起后刷新。") }
                } else {
                    items(state.activities, key = { it.id }) { activity ->
                        val accent = if (activity.type == "4") ColorTokens.Sky else ColorTokens.Teal
                        AppListCard(
                            title = activity.name,
                            subtitle = listOfNotNull(
                                activity.typeText.takeIf(String::isNotBlank),
                                if (activity.active) "进行中" else "已结束或未开始",
                                signTime(activity.startTime).takeIf { activity.startTime > 0 },
                            ).joinToString(" · "),
                            leading = {
                                AppIconTile(
                                    icon = if (activity.type == "4") Icons.Outlined.LocationOn else Icons.Outlined.CheckCircle,
                                    tint = accent.foreground,
                                    background = accent.container,
                                )
                            },
                            trailing = { AppStatusBadge(label = activity.recordText, semantic = recordSemantic(activity)) },
                            enabled = !state.busy,
                            onClick = { onOpenActivity(activity) },
                        )
                    }
                }
                if (state.busy && state.operation == "detail" && state.selected == null) item { GlassShimmerList(itemCount = 1) }
            }
        }
    }

    if (showSignProvider) {
        SignProviderConnectionDialog(state, onConnectSignProvider, onDismiss = { showSignProvider = false })
    }

    if (showAutoSignTimePicker) {
        AppTimePickerModal(title = "添加签到时刻", currentTime = state.autoSign.times.lastOrNull() ?: "08:00",
            onDismiss = { showAutoSignTimePicker = false },
            onConfirm = { time -> showAutoSignTimePicker = false; timeToConfirm = time })
    }

    timeToConfirm?.let { time ->
        AppConfirmDialog(
            title = "添加签到时刻？",
            detail = "将添加每天 $time 的签到计划。" + if (state.autoSign.enabled) {
                "定时签到已开启，新时刻保存后会自动生效，并使用保存的位置提交签到。"
            } else {
                "开启定时签到后，会在此时刻检查并提交签到。"
            },
            confirmLabel = "确认添加",
            icon = Icons.Outlined.Schedule,
            busy = state.busy,
            onDismiss = { timeToConfirm = null },
            onConfirm = { timeToConfirm = null; onAddAutoSignTime(time) },
        )
    }
    if (confirmDisconnectProvider) {
        AppConfirmDialog(
            title = "断开帮你签服务？",
            detail = "将移除保存的帮你签连接，依赖此服务的签到和自动任务可能无法继续，需要重新连接后才能使用。",
            confirmLabel = "确认断开",
            icon = Icons.Outlined.LinkOff,
            danger = true,
            busy = state.busy,
            onDismiss = { confirmDisconnectProvider = false },
            onConfirm = { confirmDisconnectProvider = false; onDisconnectSignProvider() },
        )
    }
    if (confirmDisconnect) {
        AppConfirmDialog(
            title = "断开学习通连接？",
            detail = "将移除服务器保存的学习通会话，之后需要重新连接。学习通中的课程和签到记录会保留。",
            confirmLabel = "确认断开",
            icon = Icons.Outlined.LinkOff,
            danger = true,
            busy = state.busy,
            onDismiss = { confirmDisconnect = false },
            onConfirm = { confirmDisconnect = false; onDisconnect() },
        )
    }

    state.selected?.let { activity ->
        if (showSignProvider) return@let
        if (showCaptcha && state.captchaRequired && activity.canSign && !state.pending && !state.officialRequired) {
            ChaoxingCaptchaDialog(
                onDismiss = { showCaptcha = false },
                onVerified = { validate ->
                    showCaptcha = false
                    onCaptchaVerified(activity.id, validate)
                },
            )
            return@let
        }
        AppDialog(title = activity.name, subtitle = state.course?.name, onDismissRequest = onCloseActivity,
            footer = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (activity.active && activity.recordStatus == 0 && (state.officialRequired || activity.requiresOfficial)) {
                        AppDialogPrimaryButton("打开学习通", ::openOfficial, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    } else if (activity.canSign && !state.pending) {
                        val providerReady = activity.type == "4" && state.session.signProviderConnected
                        AppDialogPrimaryButton(when {
                            activity.type != "4" -> "打开学习通"
                            !providerReady -> "连接帮你签服务"
                            state.captchaRequired -> "验证并继续签到"
                            else -> "使用当前位置签到"
                        }, {
                            when {
                                activity.type != "4" -> openOfficial()
                                !providerReady -> openSignProvider()
                                else -> confirmSign = true
                            }
                        },
                            modifier = Modifier.fillMaxWidth(), busy = state.operation == "sign",
                            enabled = !state.busy && (activity.type != "4" || !providerReady || state.location != null))
                    }
                    AppDialogSecondaryButton("刷新官方记录", onRefreshSelected, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, busy = state.operation == "detail")
                }
            }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    AppDetailRow("签到类型", activity.typeText)
                    if (activity.type == "4" && state.session.signProviderConnected) AppDetailRow("签到服务", "帮你签")
                    AppDetailRow("官方记录", activity.recordText)
                    AppDetailRow("截止时间", if (activity.endTime > 0) signTime(activity.endTime) else "以老师结束活动为准")
                    if (state.captchaRequired && !activity.signed) AppDetailRow("安全验证", "在 MY 内完成学习通验证码后继续签到")
                }
                if (activity.locationText.isNotBlank() || activity.locationRange > 0 || activity.requirements.isNotEmpty()) {
                    AppDivider(paddingStart = 0.dp, paddingEnd = 0.dp)
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        if (activity.locationText.isNotBlank()) AppDetailRow("要求地点", activity.locationText)
                        if (activity.locationRange > 0) AppDetailRow("签到范围", "${activity.locationRange} 米")
                        if (activity.requirements.isNotEmpty()) AppDetailRow("附加要求", activity.requirements.joinToString("、"))
                    }
                }
                if (state.message != null) AppFeedbackBanner(state.message, state.error, onRetry = onRefreshSelected, retryText = "刷新记录", autoDismissDurationMillis = null, onDismiss = onClearFeedback)
                if (activity.active && activity.recordStatus == 0 && (state.officialRequired || activity.requiresOfficial)) {
                    Text("请在学习通中使用与 ${state.session.name} 相同的账号完成此活动，返回后可在此刷新官方记录。", style = MaterialTheme.typography.bodyMedium)
                } else if (activity.canSign && activity.type == "4" && !state.pending) {
                    AppDivider(paddingStart = 0.dp, paddingEnd = 0.dp)
                    state.location?.let { location ->
                        AppDetailRow("当前位置", location.address)
                        AppDetailRow("定位精度", "约 ${location.accuracy.toInt()} 米")
                        if (location.isMock) Text("系统将此位置标记为模拟定位。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    AppSecondaryButton(if (state.location == null) "获取当前位置" else "重新定位", {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) onLocate(context)
                        else permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, loading = state.operation == "locate")
                    Text("确认签到时，会将本次位置和账号资料发送至帮你签服务（lovegcu.xyz），并消耗该服务的可用次数。",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (confirmSign) {
            AppConfirmDialog(
                title = "提交本次签到？",
                detail = "活动：${activity.name}\n位置：${state.location?.address.orEmpty()}\n将把账号和本次位置资料发送至帮你签服务（lovegcu.xyz），消耗服务次数并向学校提交签到。请确认活动和位置无误。",
                confirmLabel = "确认签到",
                icon = Icons.Outlined.CheckCircle,
                danger = true,
                busy = state.busy,
                onDismiss = { confirmSign = false },
                onConfirm = {
                    confirmSign = false
                    if (state.captchaRequired) showCaptcha = true else onSign()
                },
            )
        }
    }
}

@Composable
private fun SignProviderConnectionDialog(state: ChaoxingUiState, onConnect: (String, String) -> Unit, onDismiss: () -> Unit) {
    var phone by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) password = ""
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    AppDialog(title = "连接帮你签服务", subtitle = "使用与 ${state.session.name} 相同的学习通账号",
        onDismissRequest = { if (!state.busy) onDismiss() }, footer = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDialogPrimaryButton("连接并启用", {
                    val credential = password
                    password = ""
                    onConnect(phone.trim(), credential)
                }, modifier = Modifier.fillMaxWidth(), busy = state.operation == "provider-connect",
                    enabled = !state.busy && phone.isNotBlank() && password.isNotEmpty())
                AppDialogSecondaryButton("取消", onDismiss, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
            }
        }) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("账号和密码将发送至帮你签服务（lovegcu.xyz）用于连接。MY 不保存密码。", style = MaterialTheme.typography.bodyMedium)
            Text("启用后，位置签到会向该服务发送本次位置和账号资料，并消耗其可用次数。", style = MaterialTheme.typography.bodySmall)
            AppTextField(phone, { phone = it }, label = "学习通账号", enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            AppTextField(password, { password = it }, label = "学习通密码", isPassword = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth())
            if (state.message != null && state.error) AppFeedbackBanner(state.message, error = true, autoDismissDurationMillis = null)
        }
    }
}

private fun signTime(value: Long): String = if (value <= 0) "时间未知" else
    DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.CHINA).withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(value))

private fun recordSemantic(activity: ChaoxingActivity): AppStatusSemantic = when {
    activity.signed -> AppStatusSemantic.Success
    activity.active -> AppStatusSemantic.Warning
    else -> AppStatusSemantic.Neutral
}
