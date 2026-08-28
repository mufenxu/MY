package cn.pxyb.mycontrol.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import cn.pxyb.mycontrol.data.PlatformWebCookie

internal fun openPlatformWebLink(
    context: Context,
    url: String,
    title: String? = null,
    trustedDownloadUrl: String? = null,
    initialCookies: List<PlatformWebCookie> = emptyList(),
) {
    try {
        val intent = PlatformWebActivity.createIntent(context, url, title, trustedDownloadUrl, initialCookies).apply {
            if (context !is android.app.Activity) {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        context.startActivity(intent)
    } catch (_: Exception) {
        val uri = Uri.parse(url)
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                addCategory(Intent.CATEGORY_BROWSABLE)
                if (context !is android.app.Activity) {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            })
        }
    }
}
