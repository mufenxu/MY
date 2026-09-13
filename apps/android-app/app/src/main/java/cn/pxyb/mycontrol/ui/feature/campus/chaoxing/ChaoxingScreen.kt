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
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Refresh
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import cn.pxyb.mycontrol.data.ChaoxingActivity
import cn.pxyb.mycontrol.data.ChaoxingCourse
import cn.pxyb.mycontrol.ui.PlatformWebActivity
import cn.pxyb.mycontrol.ui.components.button.AppButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogPrimaryButton
import cn.pxyb.mycontrol.ui.components.button.AppDialogSecondaryButton
import cn.pxyb.mycontrol.ui.components.button.AppInlineDangerButton
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.dialog.AppDialog
import cn.pxyb.mycontrol.ui.components.display.AppActionRow
import cn.pxyb.mycontrol.ui.components.display.AppDetailRow
import cn.pxyb.mycontrol.ui.components.feedback.AppEmptyState
import cn.pxyb.mycontrol.ui.components.feedback.AppFeedbackBanner
import cn.pxyb.mycontrol.ui.components.feedback.GlassShimmerList
import cn.pxyb.mycontrol.ui.components.input.AppSelectField
import cn.pxyb.mycontrol.ui.components.input.AppSelectOption
import cn.pxyb.mycontrol.ui.components.layout.AppHeaderIconButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel
import cn.pxyb.mycontrol.ui.components.layout.AppSubPage
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
    onSelectCourse: (ChaoxingCourse) -> Unit,
    onOpenActivity: (ChaoxingActivity) -> Unit,
    onRefreshSelected: () -> Unit,
    onCloseActivity: () -> Unit,
    onLocate: (Context) -> Unit,
    onSign: () -> Unit,
    onReport: (String) -> Unit,
    onClearFeedback: () -> Unit,
) {
    val context = LocalContext.current
    var courseExpanded by remember { mutableStateOf(false) }
    var confirmDisconnect by remember { mutableStateOf(false) }
    var returningFromOfficial by remember { mutableStateOf(false) }
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
    LaunchedEffect(Unit) { onRefresh() }
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
                AppPanel {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("连接学习通", style = MaterialTheme.typography.titleMedium)
                        Text("通过学习通官方页面登录，连接后可查看自己的课程、签到活动和官方记录。", style = MaterialTheme.typography.bodyMedium)
                        AppButton("登录学习通", { loginLauncher.launch(PlatformWebActivity.createChaoxingLoginIntent(context)) },
                            modifier = Modifier.fillMaxWidth(), loading = state.operation == "connect", enabled = !state.busy, icon = Icons.Outlined.School)
                    }
                }
            }
        } else {
            item {
                AppPanel {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(state.session.name, style = MaterialTheme.typography.titleMedium)
                        if (state.session.school.isNotBlank()) Text(state.session.school, style = MaterialTheme.typography.bodyMedium)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            AppSecondaryButton("重新登录", { loginLauncher.launch(PlatformWebActivity.createChaoxingLoginIntent(context)) }, enabled = !state.busy, modifier = Modifier.weight(1f))
                            AppInlineDangerButton("断开连接", { confirmDisconnect = true }, enabled = !state.busy)
                        }
                    }
                }
            }
            if (state.courses.isEmpty()) {
                item { AppEmptyState("暂无课程", detail = "当前学习通账号未返回课程，可以刷新或重新连接账号。") }
            } else {
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
                        AppPanel {
                            AppActionRow(title = activity.name, icon = if (activity.type == "4") Icons.Outlined.LocationOn else Icons.Outlined.CheckCircle,
                                subtitle = "${activity.typeText} · ${if (activity.active) "进行中" else "已结束或未开始"}\n${activity.recordText} · ${signTime(activity.startTime)}",
                                enabled = !state.busy, onClick = { onOpenActivity(activity) })
                        }
                    }
                }
                if (state.busy && state.operation == "detail" && state.selected == null) item { GlassShimmerList(itemCount = 1) }
            }
        }
    }

    if (confirmDisconnect) {
        AppDialog(title = "断开学习通连接", subtitle = "将移除服务器保存的学习通会话，之后需要重新连接。",
            onDismissRequest = { confirmDisconnect = false }, footer = {
                AppDialogDangerButton("断开连接", { confirmDisconnect = false; onDisconnect() }, modifier = Modifier.fillMaxWidth())
            }) { Text("学习通中的课程和签到记录会保留。", style = MaterialTheme.typography.bodyMedium) }
    }

    state.selected?.let { activity ->
        AppDialog(title = activity.name, subtitle = state.course?.name, onDismissRequest = onCloseActivity,
            footer = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    if (activity.active && activity.recordStatus == 0 && (state.officialRequired || activity.requiresOfficial)) {
                        AppDialogPrimaryButton("打开学习通", ::openOfficial, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    } else if (activity.canSign && !state.pending) {
                        AppDialogPrimaryButton(if (activity.type == "4") "使用当前位置签到" else "确认签到", onSign,
                            modifier = Modifier.fillMaxWidth(), busy = state.operation == "sign", enabled = !state.busy && (activity.type != "4" || state.location != null))
                    }
                    AppDialogSecondaryButton("刷新官方记录", onRefreshSelected, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, busy = state.operation == "detail")
                }
            }) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                AppDetailRow("签到类型", activity.typeText)
                AppDetailRow("官方记录", activity.recordText)
                AppDetailRow("截止时间", if (activity.endTime > 0) signTime(activity.endTime) else "以老师结束活动为准")
                if (activity.locationText.isNotBlank()) AppDetailRow("要求地点", activity.locationText)
                if (activity.locationRange > 0) AppDetailRow("签到范围", "${activity.locationRange} 米")
                if (activity.requirements.isNotEmpty()) AppDetailRow("附加要求", activity.requirements.joinToString("、"))
                if (state.message != null) AppFeedbackBanner(state.message, state.error, onRetry = onRefreshSelected, retryText = "刷新记录", autoDismissDurationMillis = null, onDismiss = onClearFeedback)
                if (activity.active && activity.recordStatus == 0 && (state.officialRequired || activity.requiresOfficial)) {
                    Text("请在学习通中使用与 ${state.session.name} 相同的账号完成此活动，返回后可在此刷新官方记录。", style = MaterialTheme.typography.bodyMedium)
                } else if (activity.canSign && activity.type == "4" && !state.pending) {
                    state.location?.let { location ->
                        AppDetailRow("当前位置", location.address)
                        AppDetailRow("定位精度", "约 ${location.accuracy.toInt()} 米")
                        if (location.isMock) Text("系统将此位置标记为模拟定位。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    AppSecondaryButton(if (state.location == null) "获取当前位置" else "重新定位", {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) onLocate(context)
                        else permissions.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                    }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy, loading = state.operation == "locate")
                    Text("确认签到时，会将本次位置提交至学习通。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

private fun signTime(value: Long): String = if (value <= 0) "时间未知" else
    DateTimeFormatter.ofPattern("MM-dd HH:mm", Locale.CHINA).withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(value))
