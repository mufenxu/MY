package cn.pxyb.mycontrol.update

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.app.DownloadManager
import androidx.core.content.FileProvider
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext

import okhttp3.Request
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.CancellationException
import java.util.concurrent.TimeUnit
import java.util.UUID

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
    private val client = HttpClientProvider.newBuilder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .callTimeout(10, TimeUnit.MINUTES)
        .build()

    fun cleanupInstalledUpdates() {
        val files = File(context.cacheDir, "updates").listFiles() ?: return
        files.forEach { file ->
            if (!file.isFile) return@forEach
            val packageInfo = runCatching {
                context.packageManager.getPackageArchiveInfo(file.path, 0)
            }.getOrNull()
            if (packageInfo == null || packageInfo.longVersionCode <= BuildConfig.VERSION_CODE) {
                file.delete()
            }
        }
    }

    suspend fun fetchLatest(): AppUpdateInfo = withContext(Dispatchers.IO) {
        var lastError: Throwable? = null
        manifestUrls().forEach { manifestUrl ->
            try {
                return@withContext fetchManifest(manifestUrl)
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                lastError = error
            }
        }
        throw IOException("版本清单请求失败，主下载源和备用源均不可用", lastError)
    }

    suspend fun download(
        update: AppUpdateInfo,
        requireNewer: Boolean = true,
        onProgress: (Int) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val updateDirectory = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(updateDirectory, "my-control-${update.versionName}.apk")
        val temporary = File(updateDirectory, "${target.name}.part")
        var lastError: Throwable? = null
        update.apkUrls.forEach { apkUrl ->
            try {
                downloadArtifact(apkUrl, update, temporary, onProgress)
                verifyDownloadedApk(update, temporary, requireNewer)
                if (target.exists()) target.delete()
                check(temporary.renameTo(target)) { "无法保存已验证的 APK" }
                onProgress(100)
                return@withContext target
            } catch (error: Throwable) {
                if (error is CancellationException) throw error
                lastError = error
                temporary.delete()
            }
        }
        throw IOException("APK 下载失败，主下载源和备用源均不可用", lastError)
    }

    suspend fun downloadArchive(update: AppUpdateInfo, onProgress: (Int) -> Unit): File =
        withContext(Dispatchers.IO) {
            val existing = File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                "MY/my-control-${update.versionName}.apk",
            )
            if (existing.isFile) {
                try {
                    verifyDownloadedApk(update, existing, requireNewer = false)
                    currentCoroutineContext().ensureActive()
                    onProgress(100)
                    return@withContext existing
                } catch (error: Exception) {
                    if (error is CancellationException || isAppUpdateSigningMismatch(error)) throw error
                }
            }
            val fileName = if (existing.exists()) {
                "MY/my-control-${update.versionName}-${UUID.randomUUID()}.apk"
            } else {
                "MY/${existing.name}"
            }
            var lastError: Throwable? = null
            for (apkUrl in update.apkUrls) {
                try {
                    return@withContext downloadArchiveWithManager(apkUrl, update, fileName, onProgress)
                } catch (error: Throwable) {
                    if (error is CancellationException) throw error
                    lastError = error
                }
            }
            throw IOException("安装包下载失败，主下载源和备用源均不可用", lastError)
        }

    private suspend fun downloadArchiveWithManager(
        apkUrl: String,
        update: AppUpdateInfo,
        fileName: String,
        onProgress: (Int) -> Unit,
    ): File {
        currentCoroutineContext().ensureActive()
        val request = DownloadManager.Request(Uri.parse(apkUrl))
            .setTitle("MY Control ${update.versionName}")
            .setDescription("正在下载历史安装包")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)

        val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val downloadId = manager.enqueue(request)
        val query = DownloadManager.Query().setFilterById(downloadId)
        var verified = false
        try {
            while (true) {
                currentCoroutineContext().ensureActive()
                manager.query(query).use { cursor ->
                    if (!cursor.moveToFirst()) throw IOException("系统下载任务已丢失")
                    val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                    val totalBytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
                    val downloadedBytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
                    if (totalBytes > 0) onProgress(((downloadedBytes * 100L) / totalBytes).toInt().coerceIn(0, 100))
                    when (status) {
                        DownloadManager.STATUS_SUCCESSFUL -> {
                            val localUri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI))
                            val filePath = Uri.parse(localUri).path ?: throw IOException("系统下载地址无效")
                            val apkFile = verifyDownloadedApk(update, File(filePath), requireNewer = false)
                            currentCoroutineContext().ensureActive()
                            onProgress(100)
                            verified = true
                            return apkFile
                        }
                        DownloadManager.STATUS_FAILED -> {
                            val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
                            throw IOException("系统下载失败（原因 $reason）")
                        }
                        else -> Unit
                    }
                }
                delay(500)
            }
        } finally {
            if (!verified) manager.remove(downloadId)
        }
    }

    private fun manifestUrls(): List<String> = listOf(
        BuildConfig.APP_UPDATE_MANIFEST_URL,
        BuildConfig.APP_UPDATE_MANIFEST_FALLBACK_URL,
    ).filter(String::isNotBlank).distinct()

    private fun fetchManifest(manifestUrl: String): AppUpdateInfo {
        val request = Request.Builder()
            .url(manifestUrl)
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("版本清单请求失败（HTTP ${response.code}）")
            val body = response.body ?: throw IOException("版本清单内容为空")
            val contentLength = body.contentLength()
            require(contentLength == -1L || contentLength in 1L..MAX_MANIFEST_BYTES) { "版本清单大小无效" }
            val source = body.source()
            require(!source.request(MAX_MANIFEST_BYTES + 1L)) { "版本清单大小无效" }
            val raw = source.readUtf8()
            require(raw.isNotBlank()) { "版本清单为空" }
            return parseAppUpdateManifest(raw)
        }
    }

    private fun downloadArtifact(
        apkUrl: String,
        update: AppUpdateInfo,
        temporary: File,
        onProgress: (Int) -> Unit,
    ) {
        val request = Request.Builder()
            .url(apkUrl)
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

    private fun verifyDownloadedApk(update: AppUpdateInfo, file: File, requireNewer: Boolean): File =
        verifyUpdateArtifact(
            update,
            file,
            packageIdentity(file),
            packageIdentity(context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)),
            requireNewer,
        )

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
