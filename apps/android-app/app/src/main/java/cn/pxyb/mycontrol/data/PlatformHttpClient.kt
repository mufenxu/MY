package cn.pxyb.mycontrol.data

import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.core.network.HttpClientProvider
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.AbstractCoroutineContextElement
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener

data class PlatformResult<T>(
    val value: T,
    val fromCache: Boolean,
    val cachedAtMillis: Long?,
)

internal class PlatformResponse(val json: JSONObject, val jsonArray: JSONArray, val cookie: String?)

internal fun decodePlatformJson(raw: String): Pair<JSONObject, JSONArray> {
    try {
        val tokenizer = JSONTokener(raw)
        val value = tokenizer.nextValue()
        require(tokenizer.nextClean() == '\u0000')
        return when (value) {
            is JSONObject -> value to JSONArray()
            is JSONArray -> JSONObject() to value
            else -> throw IllegalArgumentException()
        }
    } catch (_: Exception) {
        throw ApiException("服务器返回的数据格式异常，请稍后重试。", 502, "INVALID_RESPONSE")
    }
}

internal class PlatformHttpClient(
    private val sessionStore: SessionStore,
    private val snapshotStore: ResponseSnapshotStore,
) {
    private val client = HttpClientProvider.client
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    suspend fun isOffline(): Boolean = currentCoroutineContext()[RequestBatch]?.cachedAtMillis != null

    suspend fun cachedAtMillis(): Long? = currentCoroutineContext()[RequestBatch]?.cachedAtMillis

    suspend fun currentSession(): SessionRequest =
        currentCoroutineContext()[RequestBatch]?.session ?: sessionStore.captureRequestSession()

    suspend fun invalidateSession(session: SessionRequest) {
        val endedGeneration = sessionStore.clearRequestSession(session)
        currentCoroutineContext()[RequestBatch]?.endedGeneration = endedGeneration
    }

    suspend fun <T> withRequestMetadata(
        allowCache: Boolean = true,
        block: suspend () -> T,
    ): PlatformResult<T> {
        val batch = RequestBatch(sessionStore.captureRequestSession(), allowCache)
        return withContext(batch) {
            val value = block()
            sessionStore.withRequestSession(batch.session, batch.endedGeneration) {
                PlatformResult(value, batch.cachedAtMillis != null, batch.cachedAtMillis)
            }
        }
    }

    suspend fun execute(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = true,
        timeoutSeconds: Long = 30,
        cookieOverride: String? = null,
    ): PlatformResponse {
        val batch = currentCoroutineContext()[RequestBatch]
        val session = if (authenticated) {
            currentSession().takeIf { !it.cookie.isNullOrBlank() }
                ?: throw ApiException("登录会话已失效，请重新登录。", 401, "UNAUTHORIZED")
        } else null
        val request = Request.Builder()
            .url("${BuildConfig.PLATFORM_BASE_URL}$path")
            .header("Accept", "application/json")
            .header("User-Agent", "MY-Control-Android/${BuildConfig.VERSION_NAME}")
            .header("X-Platform-Device-Id", sessionStore.readOrCreateDeviceId())
        session?.let { request.header("Cookie", requireNotNull(it.cookie)).tag(SessionRequest::class.java, it) }
        cookieOverride?.let { request.header("Cookie", it) }
        if (method != "GET") {
            request.header("X-Platform-Request", "console")
                .header("Origin", BuildConfig.PLATFORM_BASE_URL)
        }
        request.method(method, if (method == "GET") null else (body ?: JSONObject()).toString().toRequestBody(jsonMediaType))
        val requestClient = if (timeoutSeconds == 30L) client else client.newBuilder()
            .readTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .writeTimeout(timeoutSeconds, TimeUnit.SECONDS)
            .callTimeout(timeoutSeconds + 15, TimeUnit.SECONDS)
            .build()
        val cacheable = authenticated && method == "GET" &&
            (path in CACHEABLE_PATHS || path.startsWith("/apps/iot/api/devices/") && path.endsWith("/insights?range=24h"))

        return suspendCancellableCoroutine { continuation ->
            val call = requestClient.newCall(request.build())
            continuation.invokeOnCancellation { call.cancel() }
            fun failOrReadCache(error: Exception) {
                if (!continuation.isActive) return
                try {
                    val result = sessionStore.withRequestSession(session) {
                        if (error !is IOException || call.isCanceled() || !cacheable || batch?.allowCache == false) throw error
                        val snapshot = snapshotStore.read(path, scope = session?.accountScope) ?: throw error
                        val (json, array) = decodePlatformJson(snapshot.body)
                        batch?.recordCache(snapshot.savedAtMillis)
                        PlatformResponse(json, array, null)
                    }
                    continuation.resume(result)
                } catch (failure: Exception) {
                    if (continuation.isActive) {
                        val reported = if (failure is IOException) IOException(
                            when (failure) {
                                is javax.net.ssl.SSLException -> "安全连接验证失败，请检查设备时间或网络环境。"
                                is java.io.InterruptedIOException -> "请求超时，请稍后重试。"
                                else -> "网络连接失败，请检查网络后重试。"
                            }, failure,
                        ) else failure
                        continuation.resumeWithException(reported)
                    }
                }
            }
            try {
                sessionStore.withRequestSession(session) {
                    if (!continuation.isActive) throw CancellationException("请求已取消")
                    call.enqueue(object : Callback {
                        override fun onResponse(call: Call, response: Response) {
                            try {
                                val result = response.use {
                                    if (!continuation.isActive) return
                                    val raw = response.body?.string().orEmpty()
                                    val (json, array) = if (response.isSuccessful) {
                                        if (response.code in setOf(204, 205) && raw.isBlank()) JSONObject() to JSONArray()
                                        else decodePlatformJson(raw)
                                    } else {
                                        runCatching { decodePlatformJson(raw) }.getOrElse { JSONObject() to JSONArray() }
                                    }
                                    sessionStore.withRequestSession(session) {
                                        if (!continuation.isActive) throw CancellationException("请求已取消")
                                        if (!response.isSuccessful) {
                                            val code = json.optString("code", "HTTP_ERROR")
                                            if (session != null && shouldInvalidatePlatformSession(response.code, code)) {
                                                val endedGeneration = sessionStore.clearRequestSession(session)
                                                batch?.endedGeneration = endedGeneration
                                            }
                                            throw ApiException(
                                                json.optString("message", json.optString("error", "请求失败（HTTP ${response.code}）")),
                                                response.code, code, json.optJSONObject("details"),
                                            )
                                        }
                                        if (session != null) sessionStore.markUsed()
                                        if (cacheable) snapshotStore.write(path, raw, scope = session?.accountScope)
                                        PlatformResponse(json, array, response.headers.values("Set-Cookie")
                                            .map { it.substringBefore(';').trim() }
                                            .firstOrNull { it.startsWith("__Host-my_platform_session=") || it.startsWith("my_platform_session=") })
                                    }
                                }
                                continuation.resume(result)
                            } catch (error: Exception) {
                                if (error is IOException) failOrReadCache(error)
                                else if (continuation.isActive) continuation.resumeWithException(error)
                            }
                        }

                        override fun onFailure(call: Call, e: IOException) {
                            failOrReadCache(e)
                        }
                    })
                }
            } catch (error: CancellationException) {
                continuation.cancel(error)
            }
        }
    }

    private class RequestBatch(val session: SessionRequest, val allowCache: Boolean) :
        AbstractCoroutineContextElement(Key) {
        @Volatile var endedGeneration: Long? = null
        @Volatile var cachedAtMillis: Long? = null
            private set

        @Synchronized fun recordCache(savedAtMillis: Long) {
            cachedAtMillis = minOf(cachedAtMillis ?: savedAtMillis, savedAtMillis)
        }

        companion object Key : CoroutineContext.Key<RequestBatch>
    }

    private companion object {
        val CACHEABLE_PATHS = setOf(
            "/api/auth/status", "/api/operations/overview", "/api/incidents?limit=100", "/api/tasks?limit=100",
            "/api/external-apps", "/apps/core/api/todos", CAMPUS_TIMETABLE_PATH,
            "/apps/core/api/resources/expiry-summary", "/apps/iot/api/status", "/apps/iot/api/devices",
            "/apps/iot/api/automations/scenes", "/apps/iot/api/automations/rules", "/apps/iot/api/automations/runs?limit=20",
        )
    }
}
