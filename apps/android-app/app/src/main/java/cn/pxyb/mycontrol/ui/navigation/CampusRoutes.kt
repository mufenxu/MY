package cn.pxyb.mycontrol.ui.navigation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import cn.pxyb.mycontrol.ui.feature.campus.FreeClassroomScreen
import cn.pxyb.mycontrol.ui.feature.campus.chaoxing.ChaoxingScreen
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatReservationScreen
import cn.pxyb.mycontrol.ui.feature.campus.library.LibrarySeatTab
import cn.pxyb.mycontrol.ui.feature.campus.reservation.ReservationScreen
import cn.pxyb.mycontrol.ui.feature.campus.water.WaterValveScreen
import cn.pxyb.mycontrol.ui.feature.media.MediaDownloadScreen
import cn.pxyb.mycontrol.ui.feature.news.DailyNewsScreen
import cn.pxyb.mycontrol.ui.feature.workspace.TodayScreen
import cn.pxyb.mycontrol.ui.openPlatformWebLink
import java.time.YearMonth
import kotlinx.coroutines.launch

/** 校园与个人工作区路由：日程/课表/待办、学习、电费、成绩、空教室、学习通、水阀、空间与座位预约。 */
internal fun NavGraphBuilder.campusRoutes(shell: ShellRouteContext) = with(shell) {
    (listOf(WorkspaceDestination.Today, WorkspaceDestination.Timetable, WorkspaceDestination.Campus, WorkspaceDestination.Todos)
        .map { it.route() to it } + (AppRoute.Agenda to WorkspaceDestination.Today)).forEach { (route, destination) ->
        composable(route) {
            val todayState by viewModel.todayState.collectAsStateWithLifecycle()
            val agendaState by viewModel.agenda.state.collectAsStateWithLifecycle()
            val context = LocalContext.current
            val calendarPermissions = remember {
                arrayOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
            }
            val calendarPermissionLauncher = rememberLauncherForActivityResult(
                ActivityResultContracts.RequestMultiplePermissions(),
            ) { result ->
                if (calendarPermissions.all { result[it] == true }) {
                    viewModel.syncAndroidCalendar()
                } else {
                    viewModel.reportCalendarPermissionDenied()
                }
            }
            TodayScreen(
                onSectionChange = { section -> if (currentRoute == route) viewModel.selectWorkspaceSection(section) },
                searchTarget = searchTarget?.takeIf { currentRoute == route },
                onSearchTargetConsumed = viewModel::consumeSearchTarget,
                state = todayState,
                agendaState = agendaState,
                onRefreshAgenda = viewModel.agenda::refresh,
                contentPadding = contentPadding,
                onBack = navigateBackFromSubScreen,
                onRefresh = { viewModel.refreshCurrentWorkspace() },
                onSaveTodo = viewModel::saveTodo,
                onToggleTodo = viewModel::toggleTodo,
                onDeleteTodo = viewModel::deleteTodo,
                onSyncCalendar = {
                    if (calendarPermissions.all { permission ->
                            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
                        }
                    ) {
                        viewModel.syncAndroidCalendar()
                    } else {
                        calendarPermissionLauncher.launch(calendarPermissions)
                    }
                },
                onOpenNotifications = { navigateToTab(MainTab.Notifications) },
                onOpenFreeClassrooms = {
                    navigateToSubScreen(AppRoute.FreeClassrooms)
                },
                onOpenReservation = {
                    navigateToSubScreen(AppRoute.Reservation)
                },
                onOpenLibrarySeatReservation = {
                    navigateToSubScreen(AppRoute.LibrarySeatReservation)
                },
                onOpenWaterValve = {
                    navigateToSubScreen(AppRoute.CampusWaterValve)
                },
                onOpenChaoxing = { navigateToSubScreen(AppRoute.Chaoxing) },
                onOpenSchoolAccountLogin = viewModel::openSchoolAccountLogin,
                onConsumeSharedDraft = viewModel::consumeSharedTodoDraft,
                onOpenFeature = navigateToSubScreen,
                initialSection = destination,
            )
        }
    }
    composable(AppRoute.Study) {
        val study by viewModel.study.state.collectAsStateWithLifecycle()
        val today by viewModel.todayState.collectAsStateWithLifecycle()
        cn.pxyb.mycontrol.ui.feature.study.StudyScreen(study, today.timetable?.courses.orEmpty(), today.todoSnapshot.tasks,
            contentPadding, navigateBackFromSubScreen, viewModel.study::load, viewModel.study::start, viewModel.study::finish)
    }
    composable(AppRoute.Energy) {
        val energy by viewModel.energy.state.collectAsStateWithLifecycle()
        cn.pxyb.mycontrol.ui.feature.campus.energy.EnergyScreen(energy, contentPadding, navigateBackFromSubScreen, viewModel.energy::load, viewModel.energy::saveSettings)
    }
    composable(AppRoute.Grades) {
        val grades by viewModel.grades.state.collectAsStateWithLifecycle()
        val today by viewModel.todayState.collectAsStateWithLifecycle()
        cn.pxyb.mycontrol.ui.feature.campus.grades.GradesScreen(grades, today.campusOverview?.gpa, contentPadding,
            navigateBackFromSubScreen, { viewModel.grades.load(); viewModel.refreshCampusGpa() }, viewModel.grades::save, viewModel.grades::remove, viewModel.grades::savePlan)
    }
    composable(AppRoute.Screenshot) {
        val screenshot by viewModel.screenshot.state.collectAsStateWithLifecycle()
        cn.pxyb.mycontrol.ui.feature.todos.ScreenshotTodoScreen(screenshot, contentPadding, navigateBackFromSubScreen, viewModel.screenshot::recognize,
            { task, location -> viewModel.screenshot.saveSource(task, location, viewModel.todos::saveImported) },
            { navigateToSubScreen(AppRoute.Todos) })
    }
    composable(AppRoute.DailyNews) {
        val dailyNewsState by viewModel.dailyNewsState.collectAsStateWithLifecycle()
        DailyNewsScreen(
            state = dailyNewsState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = viewModel::refreshDailyNews,
        )
    }
    composable(AppRoute.MediaDownload) {
        val mediaDownloadState by viewModel.mediaDownloadState.collectAsStateWithLifecycle()
        LaunchedEffect(Unit) { viewModel.mediaDownload.refreshHistory() }
        MediaDownloadScreen(
            state = mediaDownloadState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onShareTextChange = viewModel.mediaDownload::updateShareText,
            onParse = viewModel.mediaDownload::parse,
            onDownloadQueued = viewModel.mediaDownload::reportDownloadQueued,
            onDownloadFailed = viewModel.mediaDownload::reportDownloadFailure,
            onPasteClipboard = viewModel.mediaDownload::pasteClipboard,
            onClipboardScanned = viewModel.mediaDownload::offerClipboardLink,
            onAutoPasteChange = viewModel.mediaDownload::setAutoPaste,
            onAcceptClipboardLink = viewModel.mediaDownload::acceptClipboardLink,
            onDismissClipboardLink = viewModel.mediaDownload::dismissClipboardLink,
            onClearHistory = viewModel.mediaDownload::clearHistory,
            onLinkCopied = viewModel.mediaDownload::reportLinkCopied,
        )
    }
    composable(AppRoute.FreeClassrooms) {
        val freeClassroomState by viewModel.freeClassroomState.collectAsStateWithLifecycle()
        FreeClassroomScreen(
            state = freeClassroomState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onQuery = viewModel::queryFreeClassrooms,
        )
    }
    composable(AppRoute.Chaoxing) {
        val chaoxingState by viewModel.chaoxing.state.collectAsStateWithLifecycle()
        LaunchedEffect(state.pendingChaoxingOpen) {
            if (state.pendingChaoxingOpen) viewModel.consumePendingChaoxingOpen()
        }
        ChaoxingScreen(
            state = chaoxingState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = viewModel.chaoxing::refresh,
            onConnect = viewModel.chaoxing::connect,
            onDisconnect = viewModel.chaoxing::disconnect,
            onConnectSignProvider = viewModel.chaoxing::connectSignProvider,
            onDisconnectSignProvider = viewModel.chaoxing::disconnectSignProvider,
            onSelectCourse = viewModel.chaoxing::selectCourse,
            onOpenActivity = viewModel.chaoxing::openActivity,
            onRefreshSelected = viewModel.chaoxing::refreshSelected,
            onCloseActivity = viewModel.chaoxing::closeActivity,
            onLocate = viewModel.chaoxing::locate,
            onSign = viewModel.chaoxing::sign,
            onCaptchaVerified = viewModel.chaoxing::signWithCaptcha,
            onToggleAutoSign = viewModel.chaoxing::toggleAutoSign,
            onAddAutoSignTime = viewModel.chaoxing::addAutoSignTime,
            onRemoveAutoSignTime = viewModel.chaoxing::removeAutoSignTime,
            onSaveAutoSignLocation = viewModel.chaoxing::saveAutoSignLocation,
            onSelectAutoSignCourse = viewModel.chaoxing::selectAutoSignCourse,
            onRunAutoSign = viewModel.chaoxing::runAutoSign,
            onReport = viewModel.chaoxing::report,
            onClearFeedback = viewModel.chaoxing::clearFeedback,
        )
    }
    composable(AppRoute.CampusWaterValve) {
        val waterValveState by viewModel.waterValveState.collectAsStateWithLifecycle()
        WaterValveScreen(
            state = waterValveState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = { force ->
                viewModel.refreshWaterValve(force)
                if (force) viewModel.refreshWaterBill(YearMonth.now().toString(), true)
            },
            onBind = viewModel::bindWaterValve,
            onOpen = viewModel::openWaterValve,
            onClose = viewModel::closeWaterValve,
            onUnbind = viewModel::unbindWaterValve,
            onReorder = viewModel::reorderWaterValves,
            onQueryBill = viewModel::refreshWaterBill,
            onClearFeedback = viewModel::clearWaterValveFeedback,
        )
    }
    composable(AppRoute.Reservation) {
        val today by viewModel.todayState.collectAsStateWithLifecycle()
        val agenda by viewModel.agenda.state.collectAsStateWithLifecycle()
        LaunchedEffect(Unit) { viewModel.agenda.refresh() }
        val guard = cn.pxyb.mycontrol.ui.feature.agenda.rememberReservationConflictGuard(today.timetable, agenda)
        val reservationState by viewModel.reservations.state.collectAsStateWithLifecycle()
        val context = LocalContext.current
        ReservationScreen(
            state = reservationState,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = viewModel.reservations::refreshReservation,
            onLoadSpaces = viewModel.reservations::loadReservationSpaces,
            onLoadAutoCandidateSpaces = viewModel.reservations::loadAutoCandidateSpaces,
            onLoadMyReservations = viewModel.reservations::loadMyReservations,
            onOpenOfficialReservation = {
                viewModel.openOfficialCampusReservation { session ->
                    openPlatformWebLink(
                        context,
                        session.url,
                        "空间预约",
                        initialCookies = session.cookies,
                    )
                }
            },
            onRefreshIdentityCode = viewModel.reservations::refreshIdentityCode,
            onQueryRulesAndAvailability = viewModel.reservations::queryReservationRulesAndAvailability,
            onQuerySpacesByTime = viewModel.reservations::queryAvailableSpacesByTime,
            onSubmitReservation = { request, done ->
                guard(request.date, cn.pxyb.mycontrol.ui.feature.agenda.agendaMinute(request.startTime) ?: 0,
                    cn.pxyb.mycontrol.ui.feature.agenda.agendaMinute(request.endTime) ?: 0, null) {
                    viewModel.reservations.submitReservation(request) { viewModel.agenda.refresh(); done() }
                }
            },
            onLoadAutoTasks = viewModel.reservations::loadAutoReservationTasks,
            onSaveAutoTask = viewModel.reservations::saveAutoReservationTask,
            onToggleAutoTask = viewModel.reservations::toggleAutoReservationTask,
            onDeleteAutoTask = viewModel.reservations::deleteAutoReservationTask,
            onCancelReservation = viewModel.reservations::cancelMyReservation,
            onEndReservation = viewModel.reservations::endMyReservation,
            onRescheduleReservation = { id, request, done ->
                guard(request.date, cn.pxyb.mycontrol.ui.feature.agenda.agendaMinute(request.startTime) ?: 0,
                    cn.pxyb.mycontrol.ui.feature.agenda.agendaMinute(request.endTime) ?: 0, "room:$id") {
                    viewModel.reservations.rescheduleMyReservation(id, request) { viewModel.agenda.refresh(); done() }
                }
            },
            onClearFeedback = viewModel.reservations::clearReservationFeedback,
        )
    }
    composable(AppRoute.LibrarySeatReservation) {
        val today by viewModel.todayState.collectAsStateWithLifecycle()
        val agenda by viewModel.agenda.state.collectAsStateWithLifecycle()
        LaunchedEffect(Unit) { viewModel.agenda.refresh() }
        val guard = cn.pxyb.mycontrol.ui.feature.agenda.rememberReservationConflictGuard(today.timetable, agenda)
        val librarySeatState by viewModel.librarySeats.state.collectAsStateWithLifecycle()
        val context = LocalContext.current
        val initialTab = if (state.pendingLibrarySeatMyReservations) {
            LibrarySeatTab.My
        } else {
            LibrarySeatTab.Book
        }
        LaunchedEffect(state.pendingLibrarySeatMyReservations) {
            if (state.pendingLibrarySeatMyReservations) {
                viewModel.consumePendingLibrarySeatMyReservations()
            }
        }
        LibrarySeatReservationScreen(
            state = librarySeatState,
            initialTab = initialTab,
            contentPadding = contentPadding,
            onBack = navigateBackFromSubScreen,
            onRefresh = viewModel.librarySeats::refreshLibrarySeat,
            onLoadOverview = { force -> viewModel.librarySeats.loadLibrarySeatOverview(force) },
            onInvalidateQuery = viewModel.librarySeats::clearLibrarySeatQuery,
            onQueryAreas = { venueId, date, startMinute, endMinute, floorId, pageSize, power, window ->
                viewModel.librarySeats.queryLibrarySeatAreas(
                    venueId = venueId,
                    date = date,
                    startMinute = startMinute,
                    endMinute = endMinute,
                    floorId = floorId,
                    pageSize = pageSize,
                    currentPage = 1,
                    power = power,
                    window = window,
                )
            },
            onLoadSeats = viewModel.librarySeats::loadLibrarySeatSeats,
            onQueryFloorSeats = viewModel.librarySeats::queryLibrarySeatFloorSeats,
            onLoadTimeline = { seatId, date ->
                viewModel.librarySeats.loadLibrarySeatTimeline(seatId, date)
            },
            onSubmitReservation = { request, done ->
                guard(request.date, request.startMinute, request.endMinute, null) {
                    viewModel.librarySeats.submitLibrarySeatReservation(request) { viewModel.agenda.refresh(); done() }
                }
            },
            onLoadReservations = viewModel.librarySeats::loadLibrarySeatReservations,
            onLoadReservationHistory = { viewModel.librarySeats.loadLibrarySeatReservationHistory() },
            onLoadMoreHistory = { viewModel.librarySeats.loadLibrarySeatReservationHistory(loadMore = true) },
            onLoadCurrentUse = { viewModel.librarySeats.loadLibrarySeatCurrentUse() },
            onLoadBreaches = { viewModel.librarySeats.loadLibrarySeatBreaches() },
            onLoadMoreBreaches = { viewModel.librarySeats.loadLibrarySeatBreaches(loadMore = true) },
            onLoadDoorLogs = { viewModel.librarySeats.loadLibrarySeatDoorLogs() },
            onLoadMakeLife = { reservationId ->
                viewModel.librarySeats.loadLibrarySeatMakeLife(reservationId)
            },
            onCheckIn = viewModel.librarySeats::checkInLibrarySeat,
            onLeaveSeat = viewModel.librarySeats::leaveLibrarySeat,
            onStopSeat = viewModel.librarySeats::stopLibrarySeat,
            onCancelReservation = viewModel.librarySeats::cancelLibrarySeatReservation,
            onOpenOfficialReservation = {
                viewModel.openOfficialLibrarySeatReservation { session ->
                    openPlatformWebLink(
                        context,
                        session.url,
                        "座位预约",
                        initialCookies = session.cookies,
                    )
                }
            },
            onLoadWaitlists = viewModel.librarySeats::loadLibrarySeatWaitlists,
            onCreateWaitlist = { request, onSuccess ->
                viewModel.librarySeats.createLibrarySeatWaitlist(request, onSuccess)
            },
            onSetWaitlistEnabled = { taskId, enabled, onSuccess ->
                viewModel.librarySeats.setLibrarySeatWaitlistEnabled(taskId, enabled, onSuccess)
            },
            onDeleteWaitlist = { taskId, onSuccess ->
                viewModel.librarySeats.deleteLibrarySeatWaitlist(taskId, onSuccess)
            },
            onClearFeedback = viewModel.librarySeats::clearLibrarySeatFeedback,
        )
    }
}
