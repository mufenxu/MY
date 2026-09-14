package cn.pxyb.mycontrol.data

import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Debug
import android.os.SystemClock
import cn.pxyb.mycontrol.BuildConfig
import java.io.File
import java.security.MessageDigest

/** Local tamper signals are a defence in depth; only the server can establish attested device trust. */
internal object RuntimeSecurity {
    private lateinit var application: Context
    private var checkedAt = -30_000L
    private var cachedFailure: String? = null

    fun initialize(context: Context) { application = context.applicationContext }

    @Synchronized fun requireSafeEnvironment() {
        if (BuildConfig.BUILD_TYPE != "release") return
        if (SystemClock.elapsedRealtime() - checkedAt >= 30_000) {
            cachedFailure = evaluate()
            checkedAt = SystemClock.elapsedRealtime()
        }
        cachedFailure?.let { throw ApiException(it, 401, "DEVICE_RISK_DETECTED") }
    }

    private fun evaluate(): String? {
        if (Debug.isDebuggerConnected() || Debug.waitingForDebugger() ||
            application.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) {
            return "当前应用处于调试状态，无法访问安全数据。请安装官方正式版本。"
        }
        val signers = runCatching {
            @Suppress("DEPRECATION")
            application.packageManager.getPackageInfo(application.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
                .signingInfo?.apkContentsSigners?.map {
                    MessageDigest.getInstance("SHA-256").digest(it.toByteArray()).joinToString("") { byte -> "%02x".format(byte) }
                }
        }.getOrNull()
        if (BuildConfig.APP_SIGNING_CERT_SHA256.isBlank() || signers.isNullOrEmpty() ||
            signers.any { it != BuildConfig.APP_SIGNING_CERT_SHA256 }) {
            return "应用签名验证失败，请重新安装官方版本。"
        }
        if (listOf("/system/bin/su", "/system/xbin/su", "/sbin/su", "/sbin/.magisk", "/data/adb/magisk")
                .any { File(it).exists() }) {
            return "检测到设备 Root 风险，请使用未修改系统的设备访问安全数据。"
        }
        val injected = runCatching {
            File("/proc/self/maps").useLines { lines ->
                lines.take(8192).any { line ->
                    val path = line.lowercase()
                    listOf("libfrida", "frida-agent", "xposed", "lsposed", "substrate").any(path::contains)
                }
            }
        }.getOrDefault(false)
        val traced = runCatching {
            File("/proc/self/status").useLines { lines ->
                lines.firstOrNull { it.startsWith("TracerPid:") }?.substringAfter(':')?.trim()?.toIntOrNull()?.let { it != 0 } == true
            }
        }.getOrDefault(false)
        return if (injected || traced) "检测到进程注入或跟踪风险，请关闭相关工具并恢复系统后重试。" else null
    }
}
