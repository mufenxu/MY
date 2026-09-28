package cn.pxyb.mycontrol.ui.feature.notifications

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.ui.components.button.AppSecondaryButton
import cn.pxyb.mycontrol.ui.components.layout.AppPanel

@Composable
internal fun BackgroundDeliverySettings() {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val manager = remember { context.getSystemService(Context.POWER_SERVICE) as PowerManager }
    var unrestricted by remember { mutableStateOf(manager.isIgnoringBatteryOptimizations(context.packageName)) }
    var message by remember { mutableStateOf<String?>(null) }
    DisposableEffect(owner) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) unrestricted = manager.isIgnoringBatteryOptimizations(context.packageName) }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
    fun open(intent: Intent) {
        runCatching { context.startActivity(intent) }.onFailure {
            runCatching { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) }
                .onFailure { message = "请手动打开系统设置 → 应用管理 → MY，检查自启动与电池限制。" }
        }
    }
    AppPanel {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("后台提醒", style = MaterialTheme.typography.titleMedium)
            Text("当前使用本地定时提醒与后台同步，无需 Google 服务或厂商推送账号。课程提前 15 分钟提醒；待办按设置的提醒时间执行。")
            Text("${if (unrestricted) "系统电池优化已豁免" else "系统电池优化仍可能限制后台运行"}。后台同步通常以 15 分钟为周期，系统可能延迟执行，本地提醒也不保证准点。")
            if (SessionStore(context).isLockEnabled()) Text("应用锁已开启：锁定时暂停网络同步，已保存到本机的课程和待办仍可安排本地提醒。", style = MaterialTheme.typography.bodySmall)
            if (Build.MANUFACTURER.equals("xiaomi", true) || Build.MANUFACTURER.equals("redmi", true)) {
                Text("小米手机：允许自启动，将省电策略设为“无限制”，并可在最近任务中锁定应用。强行停止应用后需手动打开才能恢复后台任务。")
                AppSecondaryButton("打开自启动设置", onClick = {
                    open(Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")))
                })
            }
            AppSecondaryButton("查看电池优化设置", onClick = { open(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) })
            AppSecondaryButton("打开应用系统设置", onClick = { open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))) })
            message?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        }
    }
}
