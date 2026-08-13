package cn.pxyb.mycontrol.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.OpenInNew
import androidx.compose.material.icons.outlined.AdminPanelSettings
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Hub
import androidx.compose.material.icons.outlined.Router
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Security
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cn.pxyb.mycontrol.BuildConfig
import cn.pxyb.mycontrol.data.AdminPortalCategory
import cn.pxyb.mycontrol.data.AdminPortalLink
import cn.pxyb.mycontrol.data.adminPortals
import cn.pxyb.mycontrol.ui.theme.Amber
import cn.pxyb.mycontrol.ui.theme.AmberPale
import cn.pxyb.mycontrol.ui.theme.Coral
import cn.pxyb.mycontrol.ui.theme.CoralPale
import cn.pxyb.mycontrol.ui.theme.Forest
import cn.pxyb.mycontrol.ui.theme.MintPale
import cn.pxyb.mycontrol.ui.theme.Ocean
import cn.pxyb.mycontrol.ui.theme.OceanPale
import kotlinx.coroutines.launch

@Composable
fun AdminPortalScreen(
    contentPadding: PaddingValues,
    onBack: () -> Unit,
    requestWebLoginUrl: suspend (String) -> String,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val portals = remember { adminPortals(BuildConfig.PLATFORM_BASE_URL) }
    var openingPortalId by remember { mutableStateOf<String?>(null) }
    var openError by remember { mutableStateOf<String?>(null) }

    fun requestAndOpen(portal: AdminPortalLink) {
        if (openingPortalId != null) return
        scope.launch {
            openingPortalId = portal.id
            openError = null
            runCatching { requestWebLoginUrl(portal.url) }
                .onSuccess { loginUrl -> openAdminPortal(context, loginUrl) }
                .onFailure { error ->
                    openError = error.message?.takeIf { it.isNotBlank() } ?: "自动登录链接生成失败，请稍后重试。"
                }
            openingPortalId = null
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = appPageContentPadding(contentPadding),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "header") {
            AppSecondaryHeader(
                title = "管理后台",
                subtitle = "使用浏览器安全环境打开后台管理页面",
                onBack = onBack,
            )
        }

        item(key = "notice") {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.72f),
                contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
                shape = RoundedCornerShape(18.dp),
                border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.18f)),
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(Icons.Outlined.Security, contentDescription = null, modifier = Modifier.size(21.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("登录态和密码由浏览器托管", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                        Text(
                            "Android 只作为入口中心，不保存后台密码，也不把后台页面嵌入 WebView。",
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            }
        }

        openError?.let { message ->
            item(key = "open-error") {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.errorContainer,
                    contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Text(
                        text = message,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(14.dp),
                    )
                }
            }
        }

        items(portals, key = AdminPortalLink::id) { portal ->
            AdminPortalCard(
                portal = portal,
                busy = openingPortalId == portal.id,
                onOpen = { requestAndOpen(portal) },
            )
        }

        item(key = "bottom-space") {
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun AdminPortalCard(
    portal: AdminPortalLink,
    busy: Boolean,
    onOpen: () -> Unit,
) {
    val style = adminPortalStyle(portal)
    AppPanel(onClick = { if (!busy) onOpen() }) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            IconTile(style.icon, style.accent, style.background)
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        portal.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    StatusBadge(
                        status = if (portal.category == AdminPortalCategory.Console) "running" else "healthy",
                        label = if (portal.category == AdminPortalCategory.Console) "控制台" else "后台",
                    )
                }
                Text(
                    portal.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    portal.url,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.outline,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Button(onClick = onOpen, enabled = !busy, shape = RoundedCornerShape(14.dp)) {
                Icon(Icons.AutoMirrored.Outlined.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                Text("打开")
            }
        }
    }
}

private data class AdminPortalStyle(
    val icon: ImageVector,
    val accent: Color,
    val background: Color,
)

private fun adminPortalStyle(portal: AdminPortalLink): AdminPortalStyle = when (portal.id) {
    "admin-console" -> AdminPortalStyle(Icons.Outlined.Dashboard, Ocean, OceanPale)
    "core-admin" -> AdminPortalStyle(Icons.Outlined.Cloud, Forest, MintPale)
    "exam-admin" -> AdminPortalStyle(Icons.Outlined.AdminPanelSettings, Amber, AmberPale)
    "campus-admin" -> AdminPortalStyle(Icons.Outlined.School, Ocean, OceanPale)
    "iot-admin" -> AdminPortalStyle(Icons.Outlined.Router, Coral, CoralPale)
    else -> AdminPortalStyle(Icons.Outlined.Hub, Ocean, OceanPale)
}

private fun openAdminPortal(context: Context, url: String) {
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
