package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.ui.unit.Dp
import cn.pxyb.mycontrol.ui.components.layout.AppFormContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.AppReadingContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.AppTabletContentMaxWidth
import cn.pxyb.mycontrol.ui.components.layout.AppWorkspaceContentMaxWidth
import cn.pxyb.mycontrol.ui.feature.auth.AppEntryUiState

internal object AppRoute {
    const val Overview = "overview"
    const val Events = "events"
    const val Tools = "tools"
    const val Authenticator = "authenticator"
    const val Profile = "profile"
    const val Operations = "operations"
    const val Account = "account"
    const val GoogleAccounts = "google-accounts"
    const val GitHubProjects = "github-projects"
    const val AndroidReleases = "android-releases"
    const val RegistryImages = "registry-images"
    const val Projects = "projects"
    const val NotificationSettings = "notification-settings"
    const val LoginSessions = "login-sessions"
    const val Search = "search"
    const val Assistant = "assistant"
    const val Today = "today"
    const val Timetable = "timetable"
    const val Campus = "campus"
    const val Todos = "todos"
    const val FreeClassrooms = "free-classrooms"
    const val Reservation = "reservation"
    const val LibrarySeatReservation = "library-seat-reservation"
    const val CampusWaterValve = "campus-water-valve"
    const val Chaoxing = "chaoxing"
    const val Notifications = "notifications"
    const val DailyNews = "daily-news"
    const val Scenes = "scenes"
}

internal fun contentMaxWidthForRoute(route: String): Dp = when (route) {
    AppRoute.DailyNews -> AppReadingContentMaxWidth
    AppRoute.NotificationSettings, AppRoute.LoginSessions, AppRoute.CampusWaterValve -> AppFormContentMaxWidth
    AppRoute.Overview, AppRoute.Operations, AppRoute.Tools, AppRoute.Today,
    AppRoute.Timetable, AppRoute.Campus, AppRoute.Todos, AppRoute.FreeClassrooms,
    AppRoute.Reservation, AppRoute.LibrarySeatReservation, AppRoute.Notifications, AppRoute.Chaoxing,
    AppRoute.GoogleAccounts, AppRoute.GitHubProjects, AppRoute.Projects,
    AppRoute.RegistryImages, AppRoute.AndroidReleases, AppRoute.Search, AppRoute.Scenes -> AppWorkspaceContentMaxWidth
    else -> AppTabletContentMaxWidth
}

internal fun MainTab.route(): String = when (this) {
    MainTab.Overview -> AppRoute.Overview
    MainTab.Notifications -> AppRoute.Notifications
    MainTab.Operations -> AppRoute.Operations
    MainTab.Tools -> AppRoute.Tools
    MainTab.Profile -> AppRoute.Profile
}

internal fun WorkspaceDestination.route(): String = when (this) {
    WorkspaceDestination.Today -> AppRoute.Today
    WorkspaceDestination.Timetable -> AppRoute.Timetable
    WorkspaceDestination.Campus -> AppRoute.Campus
    WorkspaceDestination.Todos -> AppRoute.Todos
    WorkspaceDestination.Notifications -> AppRoute.Notifications
    WorkspaceDestination.Scenes -> AppRoute.Scenes
    WorkspaceDestination.Projects -> AppRoute.Projects
}

internal fun AppEntryUiState.requestedRoute(): String = when {
    pendingLibrarySeatMyReservations -> AppRoute.LibrarySeatReservation
    workspaceDestination != null -> workspaceDestination.route()
    globalSearchOpen -> AppRoute.Search
    googleAccountDeskOpen -> AppRoute.GoogleAccounts
    githubProjectsOpen -> AppRoute.GitHubProjects
    accountManagementOpen -> AppRoute.Account
    assistantOpen -> AppRoute.Assistant
    else -> selectedTab.route()
}

internal fun primaryTabForRoute(route: String?): MainTab? = when (route) {
    AppRoute.Overview, AppRoute.Search, AppRoute.Assistant,
    AppRoute.Today, AppRoute.Timetable, AppRoute.Campus, AppRoute.Todos,
    AppRoute.FreeClassrooms, AppRoute.Reservation, AppRoute.LibrarySeatReservation,
    AppRoute.CampusWaterValve, AppRoute.DailyNews, AppRoute.Notifications, AppRoute.Chaoxing -> MainTab.Overview
    AppRoute.Operations, AppRoute.Projects, AppRoute.GitHubProjects,
    AppRoute.AndroidReleases, AppRoute.RegistryImages -> MainTab.Operations
    AppRoute.Tools, AppRoute.Scenes -> MainTab.Tools
    AppRoute.Profile, AppRoute.Account, AppRoute.GoogleAccounts,
    AppRoute.Authenticator, AppRoute.LoginSessions, AppRoute.NotificationSettings -> MainTab.Profile
    else -> null
}

internal fun parentTabForSubScreen(route: String?, previousRoute: String?): MainTab? = when (route) {
    AppRoute.GoogleAccounts -> primaryTabForRoute(previousRoute) ?: MainTab.Profile
    AppRoute.Account, AppRoute.Authenticator, AppRoute.LoginSessions,
    AppRoute.NotificationSettings -> MainTab.Profile
    AppRoute.Projects, AppRoute.GitHubProjects, AppRoute.AndroidReleases,
    AppRoute.RegistryImages -> MainTab.Operations
    AppRoute.Scenes -> MainTab.Tools
    AppRoute.Assistant, AppRoute.Notifications, AppRoute.Search,
    AppRoute.Today, AppRoute.Timetable, AppRoute.Campus, AppRoute.Todos,
    AppRoute.FreeClassrooms, AppRoute.Reservation, AppRoute.LibrarySeatReservation,
    AppRoute.CampusWaterValve, AppRoute.DailyNews, AppRoute.Chaoxing -> MainTab.Overview
    else -> null
}

internal fun parentRouteForSubScreen(route: String?, previousRoute: String?): String? = when (route) {
    AppRoute.Chaoxing -> AppRoute.Campus
    AppRoute.GitHubProjects, AppRoute.AndroidReleases, AppRoute.RegistryImages -> AppRoute.Projects
    AppRoute.LoginSessions -> AppRoute.Account
    AppRoute.NotificationSettings -> if (previousRoute == AppRoute.Notifications) AppRoute.Notifications else AppRoute.Profile
    else -> parentTabForSubScreen(route, previousRoute)?.route()
}
