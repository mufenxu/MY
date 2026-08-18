package cn.pxyb.mycontrol.update

import org.json.JSONObject
import java.net.URI

private const val APPLICATION_ID = "cn.pxyb.mycontrol"
private const val VERSION_PART_FACTOR = 1_000

data class AppVersion(
    val major: Int,
    val minor: Int,
    val patch: Int,
) : Comparable<AppVersion> {
    val versionCode: Int = Math.addExact(
        Math.addExact(Math.multiplyExact(major, VERSION_PART_FACTOR * VERSION_PART_FACTOR), Math.multiplyExact(minor, VERSION_PART_FACTOR)),
        patch,
    )

    init {
        require(major >= 0) { "Version major must not be negative" }
        require(minor in 0 until VERSION_PART_FACTOR) { "Version minor must be between 0 and 999" }
        require(patch in 0 until VERSION_PART_FACTOR) { "Version patch must be between 0 and 999" }
    }

    override fun compareTo(other: AppVersion): Int = versionCode.compareTo(other.versionCode)

    override fun toString(): String = "$major.$minor.$patch"

    companion object {
        private val pattern = Regex("^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$")

        fun parse(value: String): AppVersion {
            val match = pattern.matchEntire(value) ?: throw IllegalArgumentException("Invalid semantic version: $value")
            return try {
                AppVersion(
                    major = match.groupValues[1].toInt(),
                    minor = match.groupValues[2].toInt(),
                    patch = match.groupValues[3].toInt(),
                )
            } catch (error: ArithmeticException) {
                throw IllegalArgumentException("Version is too large: $value", error)
            } catch (error: NumberFormatException) {
                throw IllegalArgumentException("Version is too large: $value", error)
            }
        }
    }
}

data class AppUpdateInfo(
    val packageName: String,
    val versionName: String,
    val versionCode: Int,
    val tag: String,
    val apkUrl: String,
    val fallbackApkUrl: String? = null,
    val sha256: String,
    val apkSize: Long,
    val releaseUrl: String,
    val publishedAt: String,
    val notes: String,
) {
    fun isNewerThan(installedVersionCode: Int): Boolean = versionCode > installedVersionCode

    val apkUrls: List<String>
        get() = listOfNotNull(apkUrl, fallbackApkUrl).distinct()
}

fun parseAppUpdateManifest(raw: String): AppUpdateInfo {
    val json = JSONObject(raw)
    val packageName = json.getString("packageName")
    require(packageName == APPLICATION_ID) { "Unexpected package name: $packageName" }

    val versionName = json.getString("versionName")
    val appVersion = AppVersion.parse(versionName)
    val versionCode = json.getInt("versionCode")
    require(versionCode == appVersion.versionCode) { "Version code does not match version name" }

    val tag = json.getString("tag")
    require(tag == "android-v$versionName") { "Release tag does not match version name" }

    val apkUrl = json.getString("apkUrl").requireHttpsUrl("apkUrl")
    val fallbackApkUrl = json.optString("fallbackApkUrl")
        .takeIf { it.isNotBlank() }
        ?.also { it.requireHttpsUrl("fallbackApkUrl") }
    val releaseUrl = json.getString("releaseUrl").requireHttpsUrl("releaseUrl")
    val sha256 = json.getString("sha256").lowercase()
    require(sha256.matches(Regex("^[0-9a-f]{64}$"))) { "Invalid APK SHA-256" }

    val apkSize = json.getLong("apkSize")
    require(apkSize > 0) { "APK size must be positive" }

    return AppUpdateInfo(
        packageName = packageName,
        versionName = versionName,
        versionCode = versionCode,
        tag = tag,
        apkUrl = apkUrl,
        fallbackApkUrl = fallbackApkUrl,
        sha256 = sha256,
        apkSize = apkSize,
        releaseUrl = releaseUrl,
        publishedAt = json.getString("publishedAt"),
        notes = json.optString("notes"),
    )
}

private fun String.requireHttpsUrl(fieldName: String): String {
    val uri = runCatching { URI(this) }
        .getOrElse { throw IllegalArgumentException("Invalid $fieldName", it) }
    require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) {
        "$fieldName must use HTTPS"
    }
    return this
}
