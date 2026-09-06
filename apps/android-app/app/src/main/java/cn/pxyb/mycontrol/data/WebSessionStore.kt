package cn.pxyb.mycontrol.data

import android.webkit.CookieManager
import android.webkit.WebStorage
import kotlin.coroutines.resume
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine

internal object WebSessionStore {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    @Volatile private var clearing: Job? = null

    @Synchronized fun clear() {
        val previous = clearing
        val job = scope.launch(start = CoroutineStart.LAZY) {
            previous?.join()
            suspendCancellableCoroutine { continuation ->
                CookieManager.getInstance().removeAllCookies {
                    CookieManager.getInstance().flush()
                    WebStorage.getInstance().deleteAllData()
                    continuation.resume(Unit)
                }
            }
        }
        clearing = job
        job.start()
    }

    suspend fun awaitCleared() {
        do {
            val pending = clearing
            pending?.join()
        } while (pending !== clearing)
    }
}
