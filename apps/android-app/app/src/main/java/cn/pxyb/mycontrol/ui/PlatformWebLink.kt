package cn.pxyb.mycontrol.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent

internal fun openPlatformWebLink(context: Context, url: String) {
    val uri = Uri.parse(url)
    val intent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .build()
        .intent
        .apply {
            setPackage(CHROME_PACKAGE)
        }
    try {
        intent.data = uri
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
            })
        }
    }
}

private const val CHROME_PACKAGE = "com.android.chrome"
