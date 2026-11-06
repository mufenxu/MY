package cn.pxyb.mycontrol

import android.app.Application
import cn.pxyb.mycontrol.data.AndroidCalendarSync
import cn.pxyb.mycontrol.data.AssistantPreferences
import cn.pxyb.mycontrol.data.GoogleAccountStore
import cn.pxyb.mycontrol.data.HomePreferences
import cn.pxyb.mycontrol.data.PersonalWorkspaceStore
import cn.pxyb.mycontrol.data.PlatformApi
import cn.pxyb.mycontrol.data.ResponseSnapshotStore
import cn.pxyb.mycontrol.data.SessionStore
import cn.pxyb.mycontrol.update.AppUpdateManager

/**
 * 应用级手工 DI 容器（2026-11 架构整理）。
 *
 * 统一持有跨域共享的无状态/单例组件，替代原先各组件（AppViewModel、
 * MainActivity、Worker）各自 `new` 造成的隐性多实例。带跨域 wiring
 * 的 StateHolder/Controller 仍在 AppViewModel 组装，它们的回调绑定
 * AppViewModel 私有状态，不属于容器的职责。
 *
 * 不引入 Hilt/Koin：单 module 应用下手工容器的编译开销与心智成本最低，
 * 见 docs/engineering-standards.md 的依赖纪律。
 */
class AppContainer(private val application: Application) {

    val sessionStore: SessionStore by lazy { SessionStore(application) }

    val snapshotStore: ResponseSnapshotStore by lazy { ResponseSnapshotStore(application) }

    val api: PlatformApi by lazy { PlatformApi(sessionStore, snapshotStore) }

    val googleAccountStore: GoogleAccountStore by lazy { GoogleAccountStore(application) }

    val homePreferences: HomePreferences by lazy { HomePreferences(application) }

    val assistantPreferences: AssistantPreferences by lazy { AssistantPreferences(application) }

    val personalStore: PersonalWorkspaceStore by lazy { PersonalWorkspaceStore(application) }

    val alertNotifier: AlertNotifier by lazy { AlertNotifier(application) }

    val androidCalendarSync: AndroidCalendarSync by lazy { AndroidCalendarSync(application) }

    val appUpdateManager: AppUpdateManager by lazy { AppUpdateManager(application) }
}
