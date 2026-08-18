package cn.pxyb.mycontrol.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import cn.pxyb.mycontrol.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

enum class AppUpdatePhase {
    Idle,
    Checking,
    Current,
    Available,
    Downloading,
    ReadyToInstall,
    InstallPermissionRequired,
    Installing,
    Error,
}

data class AppUpdateUiState(
    val phase: AppUpdatePhase = AppUpdatePhase.Idle,
    val info: AppUpdateInfo? = null,
    val progress: Int = 0,
    val error: String? = null,
    val downloadedApkPath: String? = null,
)

sealed interface AppInstallResult {
    data object Started : AppInstallResult
    data object PermissionRequired : AppInstallResult
}

class AppUpdateManager(private val context: Context) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    suspend fun fetchLatest(): AppUpdateInfo = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(BuildConfig.APP_UPDATE_MANIFEST_URL)
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("GitHub Release 请求失败（HTTP ${response.code}）")
            val body = response.body ?: throw IOException("GitHub Release 未返回版本清单")
            val contentLength = body.contentLength()
            require(contentLength == -1L || contentLength in 1L..MAX_MANIFEST_BYTES) { "版本清单大小无效" }
            val source = body.source()
            require(!source.request(MAX_MANIFEST_BYTES + 1L)) { "版本清单大小无效" }
            val raw = source.readUtf8()
            require(raw.isNotBlank()) { "版本清单为空" }
            parseAppUpdateManifest(raw)
        }
    }

    suspend fun download(
        update: AppUpdateInfo,
        onProgress: (Int) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val updateDirectory = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(updateDirectory, "my-control-${update.versionName}.apk")
        val temporary = File(updateDirectory, "${target.name}.part")
        try {
            val request = Request.Builder()
                .url(update.apkUrl)
                .header("Accept", "application/vnd.android.package-archive")
                .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) throw IOException("APK 下载失败（HTTP ${response.code}）")
                val body = response.body ?: throw IOException("APK 下载内容为空")
                body.byteStream().use { input ->
                    temporary.outputStream().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var total = 0L
                        var lastProgress = -1
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            total += read
                            require(total <= update.apkSize) { "APK 下载大小超过版本清单" }
                            output.write(buffer, 0, read)
                            val progress = ((total * 100L) / update.apkSize).toInt().coerceIn(0, 100)
                            if (progress != lastProgress) {
                                lastProgress = progress
                                onProgress(progress)
                            }
                        }
                    }
                }
            }
            val archiveIdentity = packageIdentity(temporary)
            val installedIdentity = packageIdentity(
                context.packageManager.getPackageInfo(
                    context.packageName,
                    PackageManager.GET_SIGNING_CERTIFICATES,
                ),
            )
            verifyUpdateArtifact(update, temporary, archiveIdentity, installedIdentity)
            if (target.exists()) target.delete()
            check(temporary.renameTo(target)) { "无法保存已验证的 APK" }
            onProgress(100)
            target
        } catch (error: Throwable) {
            temporary.delete()
            throw error
        }
    }

    fun install(apkFile: File): AppInstallResult {
        require(apkFile.isFile) { "待安装 APK 不存在" }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            context.startActivity(Intent(
                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return AppInstallResult.PermissionRequired
        }
        val apkUri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
        context.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
        return AppInstallResult.Started
    }

    fun openReleasesPage(url: String? = null) {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url ?: BuildConfig.APP_RELEASES_URL)).apply {
            addCategory(Intent.CATEGORY_BROWSABLE)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
    }

    private fun packageIdentity(file: File): AppPackageIdentity {
        val packageInfo = context.packageManager.getPackageArchiveInfo(
            file.path,
            PackageManager.GET_SIGNING_CERTIFICATES,
        ) ?: throw IllegalArgumentException("APK 包信息无效")
        return packageIdentity(packageInfo)
    }

    private fun packageIdentity(packageInfo: android.content.pm.PackageInfo): AppPackageIdentity {
        val signingInfo = packageInfo.signingInfo ?: throw IllegalArgumentException("APK 签名信息缺失")
        val signers = signingInfo.apkContentsSigners
            .map { signature -> sha256(signature.toByteArray()) }
            .toSet()
        return AppPackageIdentity(packageInfo.packageName, packageInfo.longVersionCode, signers)
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString(separator = "") { byte -> "%02x".format(byte) }

    private companion object {
        const val MAX_MANIFEST_BYTES = 512 * 1024
    }
}
