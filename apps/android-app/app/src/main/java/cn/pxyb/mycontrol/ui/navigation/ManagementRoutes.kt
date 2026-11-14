package cn.pxyb.mycontrol.ui.navigation

import androidx.compose.runtime.getValue
import androidx.compose.ui.semantics.role
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import cn.pxyb.mycontrol.ui.feature.google.GoogleAccountDeskScreen
import cn.pxyb.mycontrol.ui.feature.projects.GitHubProjectsScreen
import cn.pxyb.mycontrol.ui.feature.projects.ProjectsScreen
import cn.pxyb.mycontrol.ui.feature.registry.RegistryImagesScreen
import cn.pxyb.mycontrol.ui.feature.releases.AndroidReleaseScreen

/** 项目与资产管理路由：项目总览、Google 账号台、GitHub 项目、Android 发布、镜像仓库。 */
internal fun NavGraphBuilder.managementRoutes(shell: ShellRouteContext) = with(shell) {
    composable(AppRoute.Projects) {
        val projectsState by viewModel.projectsState.collectAsStateWithLifecycle()
        ProjectsScreen(
            state = projectsState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = onRefresh,
            onOpenGitHubProjects = { navigateToSubScreen(AppRoute.GitHubProjects) },
            onOpenAndroidReleases = { navigateToSubScreen(AppRoute.AndroidReleases) },
            onOpenRegistryImages = { navigateToSubScreen(AppRoute.RegistryImages) },
            onTriggerCt8 = { viewModel.triggerCt8(onSensitiveActionConfirmation) },
        )
    }
    composable(AppRoute.GoogleAccounts) {
        val googleAccountState by viewModel.googleAccountDeskState.collectAsStateWithLifecycle()
        GoogleAccountDeskScreen(
            focusedId = searchTarget?.takeIf { currentRoute == AppRoute.GoogleAccounts && it.destination == cn.pxyb.mycontrol.ui.feature.search.SearchDestination.GoogleAccounts }?.focusId,
            onFocusConsumed = viewModel::consumeSearchTarget,
            state = googleAccountState,
            contentPadding = contentPadding,
            onDismiss = navigateBackFromSubScreen,
            onRefresh = { viewModel.googleAccounts.loadGoogleAccounts(force = true) },
            onAddAccount = viewModel.googleAccounts::addGoogleAccount,
            onImportAccounts = viewModel.googleAccounts::importGoogleAccounts,
            onUpdateAccount = viewModel.googleAccounts::updateGoogleAccount,
            onDeleteAccount = viewModel.googleAccounts::deleteGoogleAccount,
            onBulkUpdateAccounts = viewModel.googleAccounts::bulkUpdateGoogleAccounts,
            onBulkArchiveAccounts = viewModel.googleAccounts::bulkSetGoogleAccountsArchived,
            onBulkDeleteAccounts = viewModel.googleAccounts::bulkDeleteGoogleAccounts,
            onAddAlias = viewModel.googleAccounts::addGoogleAlias,
            onUpdateAlias = viewModel.googleAccounts::updateGoogleAlias,
            onDeleteAlias = viewModel.googleAccounts::deleteGoogleAlias,
            onUploadLocalAccounts = viewModel.googleAccounts::uploadLocalGoogleAccounts,
            onDiscardLocalAccounts = viewModel.googleAccounts::discardLocalGoogleAccounts,
        )
    }
    composable(AppRoute.GitHubProjects) {
        val githubState by viewModel.githubProjectsState.collectAsStateWithLifecycle()
        GitHubProjectsScreen(
            repositories = githubState.repositories,
            loaded = githubState.repositoriesLoaded,
            busy = githubState.visibilityBusy,
            profile = githubState.profile,
            profileLoaded = githubState.profileLoaded,
            releases = githubState.releases,
            releasesLoaded = githubState.releasesLoaded,
            releasesRepoFullName = githubState.releasesRepoFullName,
            releasesBusy = githubState.releasesBusy,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = viewModel.githubProjects::refresh,
            onLoadReleases = { owner, repo -> viewModel.githubProjects.loadReleases(owner, repo) },
            onCreateRelease = { owner, repo, tag, name, body, draft, prerelease ->
                viewModel.githubProjects.createRelease(owner, repo, tag, name, body, draft, prerelease, onSensitiveActionConfirmation)
            },
            onUpdateVisibility = { owner, repo, visibility ->
                viewModel.githubProjects.updateVisibility(owner, repo, visibility, onSensitiveActionConfirmation)
            },
        )
    }
    composable(AppRoute.AndroidReleases) {
        val androidReleaseState by viewModel.androidReleaseState.collectAsStateWithLifecycle()
        val profileState by viewModel.profileState.collectAsStateWithLifecycle()
        AndroidReleaseScreen(
            state = androidReleaseState,
            appUpdate = profileState.appUpdate,
            canManage = profileState.user?.role == "super_admin",
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = { viewModel.loadAndroidReleases(force = true) },
            onLoad = { viewModel.loadAndroidReleases() },
            onSaveDraft = { versionName, notes ->
                viewModel.saveAndroidReleaseDraft(versionName, notes)
            },
            onDispatchBuild = {
                viewModel.dispatchAndroidBuild(onSensitiveActionConfirmation)
            },
            onDownload = viewModel::downloadAndroidRelease,
            onInstallDownloaded = viewModel::installDownloadedAppUpdate,
        )
    }
    composable(AppRoute.RegistryImages) {
        val registryState by viewModel.registryImagesState.collectAsStateWithLifecycle()
        val profileState by viewModel.profileState.collectAsStateWithLifecycle()
        RegistryImagesScreen(
            state = registryState,
            canManage = profileState.user?.role == "super_admin",
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onLoad = { viewModel.loadRegistryImages() },
            onRefresh = { viewModel.loadRegistryImages(force = true) },
            onToggle = viewModel::toggleRegistryImage,
            onTogglePrefix = { prefix, selected -> viewModel.toggleRegistryImagePrefix(prefix, selected) },
            onClearSelection = viewModel::clearRegistryImageSelection,
            onDeleteSelected = { viewModel.deleteRegistryImages(onSensitiveActionConfirmation) },
            onKeepCountChange = viewModel::updateRegistryImageKeepCount,
            onIncludeUnknownChange = viewModel::updateRegistryImageIncludeUnknown,
            onPrunePreview = viewModel::previewRegistryImagePrune,
            onPruneConfirm = { viewModel.executeRegistryImagePrune(onSensitiveActionConfirmation) },
            onPruneDismiss = viewModel::discardRegistryImagePlan,
            onDismissFeedback = viewModel::clearRegistryImageFeedback,
        )
    }
}
