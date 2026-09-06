package cn.pxyb.mycontrol

import android.app.Activity
import android.app.Application
import android.os.Bundle
import cn.pxyb.mycontrol.data.SessionStore

class MyControlApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppSessionLifecycle.initialize(this)
    }
}

internal object AppSessionLifecycle : Application.ActivityLifecycleCallbacks {
    private lateinit var sessionStore: SessionStore
    private var startedActivities = 0
    private var authenticationRequests = 0
    @Volatile var isForeground = false
        private set

    fun initialize(application: Application) {
        sessionStore = SessionStore(application)
        application.registerActivityLifecycleCallbacks(this)
    }

    fun beginAuthentication() { authenticationRequests += 1 }

    fun endAuthentication() {
        authenticationRequests = (authenticationRequests - 1).coerceAtLeast(0)
        lockWhenBackground()
    }

    private fun lockWhenBackground() {
        if (!isForeground && authenticationRequests == 0 && sessionStore.isLockEnabled()) sessionStore.lock()
    }

    override fun onActivityStarted(activity: Activity) {
        startedActivities += 1
        isForeground = true
    }

    override fun onActivityStopped(activity: Activity) {
        startedActivities = (startedActivities - 1).coerceAtLeast(0)
        if (startedActivities == 0 && !activity.isChangingConfigurations) {
            isForeground = false
            lockWhenBackground()
        }
    }

    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
