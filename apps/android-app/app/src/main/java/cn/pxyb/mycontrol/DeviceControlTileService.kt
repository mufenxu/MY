package cn.pxyb.mycontrol

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.ComponentName
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import cn.pxyb.mycontrol.ui.MainTab
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.SessionStore

class DeviceControlTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        updateTileState()
    }

    private fun updateTileState() {
        val username = SessionStore(this).readActiveUsername()
        val quickScene = PersonalWorkspaceStore(this).apply { setAccount(username) }.readQuickScene()
        val preferences = getSharedPreferences("my_control_widget", Context.MODE_PRIVATE)
        val statusTone = preferences.getString("status_tone", "healthy")
        val incidents = preferences.getString("incidents", "0")?.toIntOrNull() ?: 0

        qsTile?.apply {
            icon = android.graphics.drawable.Icon.createWithResource(this@DeviceControlTileService, R.drawable.ic_qs_tile_device_control)
            if (incidents > 0 || statusTone == "attention") {
                state = Tile.STATE_ACTIVE
                label = quickScene?.sceneName ?: getString(R.string.tile_device_control)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    subtitle = if (incidents > 0) "需关注 · $incidents 次告警" else "需要关注"
                }
            } else {
                state = Tile.STATE_INACTIVE
                label = quickScene?.sceneName ?: getString(R.string.tile_device_control)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    subtitle = if (quickScene == null) "运行正常" else "点击打开场景确认"
                }
            }
            updateTile()
        }
    }

    @SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val username = SessionStore(this).readActiveUsername()
        val quickScene = PersonalWorkspaceStore(this).apply { setAccount(username) }.readQuickScene()
        val intent = if (quickScene == null) {
            DeepLinks.openIntent(this, tab = MainTab.Notifications)
        } else {
            DeepLinks.openIntent(this, destination = "scenes", sceneId = quickScene.sceneId)
        }.apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        }
        unlockAndRun {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                val pendingIntent = PendingIntent.getActivity(
                    this,
                    63001,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                startActivityAndCollapse(pendingIntent)
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
        }
    }

    companion object {
        fun requestRefresh(context: Context) {
            requestListeningState(context, ComponentName(context, DeviceControlTileService::class.java))
        }
    }
}
