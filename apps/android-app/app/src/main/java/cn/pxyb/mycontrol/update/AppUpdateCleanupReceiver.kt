package cn.pxyb.mycontrol.update

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.io.File

class AppUpdateCleanupReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        File(context.cacheDir, "updates").deleteRecursively()
    }
}
