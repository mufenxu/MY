package cn.pxyb.mycontrol.ui.feature.campus.chaoxing

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Address
import android.location.Geocoder
import android.location.Location
import android.location.LocationManager
import android.os.CancellationSignal
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import androidx.core.location.LocationManagerCompat
import cn.pxyb.mycontrol.data.ChaoxingLocation
import java.util.Locale
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

@SuppressLint("MissingPermission")
internal suspend fun currentChaoxingLocation(context: Context): ChaoxingLocation {
    check(ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { "请允许精确位置权限后再定位。" }
    val manager = context.getSystemService(LocationManager::class.java)
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { it in manager.allProviders && manager.isProviderEnabled(it) }
    check(providers.isNotEmpty()) { "请先开启手机的定位服务。" }
    var best: Location? = null
    val fix = withTimeoutOrNull(25000) {
        suspendCancellableCoroutine<Location?> { continuation ->
            val signals = providers.map { CancellationSignal() }
            var remaining = providers.size
            continuation.invokeOnCancellation { signals.forEach(CancellationSignal::cancel) }
            fun receive(location: Location?) {
                if (!continuation.isActive) return
                remaining--
                if (location != null && location.hasAccuracy() && location.accuracy > 0 && System.currentTimeMillis() - location.time in 0..120000) {
                    if (best == null || location.accuracy < best!!.accuracy) best = location
                }
                if ((best?.accuracy ?: Float.MAX_VALUE) <= 100 || remaining == 0) {
                    continuation.resume(best)
                    signals.forEach(CancellationSignal::cancel)
                }
            }
            providers.forEachIndexed { index, provider ->
                if (continuation.isActive) {
                    try {
                        LocationManagerCompat.getCurrentLocation(manager, provider, signals[index], ContextCompat.getMainExecutor(context), ::receive)
                    } catch (_: IllegalArgumentException) { receive(null) }
                    catch (_: SecurityException) { receive(null) }
                }
            }
        }
    } ?: best
    check(fix != null && fix.accuracy <= 1000) { "未获取到足够精确的位置，请到信号较好的位置重试。" }
    val (latitude, longitude) = wgs84ToBd09(fix.latitude, fix.longitude)
    val address = withTimeoutOrNull(4000) {
        if (!Geocoder.isPresent()) return@withTimeoutOrNull null
        val geocoder = Geocoder(context, Locale.CHINA)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            suspendCancellableCoroutine<String?> { continuation ->
                val listener = object : Geocoder.GeocodeListener {
                    override fun onGeocode(addresses: MutableList<Address>) {
                        if (continuation.isActive) continuation.resume(addresses.firstOrNull()?.getAddressLine(0))
                    }
                    override fun onError(errorMessage: String?) {
                        if (continuation.isActive) continuation.resume(null)
                    }
                }
                geocoder.getFromLocation(fix.latitude, fix.longitude, 1, listener)
            }
        } else {
            try {
                runInterruptible(Dispatchers.IO) {
                    @Suppress("DEPRECATION")
                    geocoder.getFromLocation(fix.latitude, fix.longitude, 1)?.firstOrNull()?.getAddressLine(0)
                }
            } catch (_: IOException) { null }
        }
    }?.takeIf(String::isNotBlank) ?: String.format(Locale.US, "经度 %.6f，纬度 %.6f", longitude, latitude)
    return ChaoxingLocation(latitude, longitude, fix.accuracy, fix.time, address, LocationCompat.isMock(fix))
}

// The official sign page plots client coordinates directly with BMap.Point (BD-09).
internal fun wgs84ToBd09(latitude: Double, longitude: Double): Pair<Double, Double> {
    if (longitude !in 72.004..137.8347 || latitude !in 0.8293..55.8271) return latitude to longitude
    val x = longitude - 105.0
    val y = latitude - 35.0
    var dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
    dLat += (20 * sin(6 * x * PI) + 20 * sin(2 * x * PI)) * 2 / 3
    dLat += (20 * sin(y * PI) + 40 * sin(y / 3 * PI)) * 2 / 3
    dLat += (160 * sin(y / 12 * PI) + 320 * sin(y * PI / 30)) * 2 / 3
    var dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
    dLon += (20 * sin(6 * x * PI) + 20 * sin(2 * x * PI)) * 2 / 3
    dLon += (20 * sin(x * PI) + 40 * sin(x / 3 * PI)) * 2 / 3
    dLon += (150 * sin(x / 12 * PI) + 300 * sin(x / 30 * PI)) * 2 / 3
    val rad = latitude / 180 * PI
    val magic = 1 - 0.00669342162296594323 * sin(rad) * sin(rad)
    val gcjLat = latitude + dLat * 180 / ((6378245.0 * (1 - 0.00669342162296594323)) / (magic * sqrt(magic)) * PI)
    val gcjLon = longitude + dLon * 180 / (6378245.0 / sqrt(magic) * cos(rad) * PI)
    val z = sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * sin(gcjLat * PI * 3000 / 180)
    val theta = atan2(gcjLat, gcjLon) + 0.000003 * cos(gcjLon * PI * 3000 / 180)
    return (z * sin(theta) + 0.006) to (z * cos(theta) + 0.0065)
}
