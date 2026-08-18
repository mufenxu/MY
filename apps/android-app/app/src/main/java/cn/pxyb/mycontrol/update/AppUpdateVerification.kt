package cn.pxyb.mycontrol.update

import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

data class AppPackageIdentity(
    val packageName: String,
    val versionCode: Long,
    val signerSha256: Set<String>,
) {
    init {
        require(signerSha256.isNotEmpty()) { "APK signing certificate is missing" }
    }
}

internal class AppUpdateSignatureMismatchException : IllegalArgumentException(
    "Downloaded APK signing certificate does not match installed application",
)

internal fun isAppUpdateSigningMismatch(error: Throwable): Boolean {
    var current: Throwable? = error
    while (current != null) {
        if (current is AppUpdateSignatureMismatchException) return true
        current = current.cause
    }
    return false
}

fun verifyUpdateArtifact(
    update: AppUpdateInfo,
    apkFile: File,
    archiveIdentity: AppPackageIdentity,
    installedIdentity: AppPackageIdentity,
): File {
    require(apkFile.isFile) { "Downloaded APK is missing" }
    require(apkFile.length() == update.apkSize) { "Downloaded APK size does not match release" }
    require(sha256(apkFile) == update.sha256.lowercase()) { "Downloaded APK checksum does not match release" }
    require(archiveIdentity.packageName == update.packageName) { "Downloaded APK package does not match release" }
    require(archiveIdentity.versionCode == update.versionCode.toLong()) { "Downloaded APK version does not match release" }
    require(installedIdentity.packageName == update.packageName) { "Installed package does not match release" }
    require(update.isNewerThan(installedIdentity.versionCode.toInt())) { "Downloaded APK is not newer than installed version" }
    if (archiveIdentity.signerSha256 != installedIdentity.signerSha256) {
        throw AppUpdateSignatureMismatchException()
    }
    return apkFile
}

fun sha256(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    FileInputStream(file).use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            digest.update(buffer, 0, read)
        }
    }
    return digest.digest().joinToString(separator = "") { byte -> "%02x".format(byte) }
}
