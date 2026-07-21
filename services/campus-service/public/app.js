"use strict";
const p=window.HguPlatformRuntime;
const {
  balanceRemark,
  compactDormitory,
  currentMonth,
  defaultFreeRoomSections,
  defaultSectionTimes,
  empty,
  escapeHtml,
  firstMatchingValue,
  formatCardDealTime,
  formatSyncTime,
  formatValue,
  freeSectionPreset,
  freeSectionRangeText,
  minutesFromTime,
  money,
  numberText,
  unitFor
} = window.HguFormatters;
const state = {
  loading: false,
  month: currentMonth(),
  campusMode: "month",
  campusMonth: currentMonth(),
  summary: null,
  campus: null,
  timetable: null,
  academicGpa: null,
  face: null,
  timetableSource: "current",
  timetableWeek: "all",
  timetableDay: "all",
  courseSearch: "",
  freeRooms: null,
  evaluations: null,
  evaluationAuto: null,
  evaluationDraft: null,
  evaluationCourse: null,
  identity: null,
  identityCodeMode: "qr",
  freeDayplus: "0",
  freeBuilding: "study",
  freeSections: defaultFreeRoomSections(),
  users: [],
  invites: [],
  lastSyncedAt: null,
  appAuth: null,
  auth: null
};

let identityCodeRefreshTimer = null;
let evaluationCountdownTimer = null;
let evaluationAutoPollTimer = null;
let noticeClearTimer = null;
let enhancedControlsReady = false;
const enhancedControls = new Map();
let activeDialogResolve = null;
let activeDialogFocus = null;
let appSessionExpiredHandled = false;
let nativeAppLoginError = new URLSearchParams(window.location.search).get("appLoginError");

const nodes = {
  themeToggle: document.querySelector("#themeToggleButton"),
  adminNavLink: document.querySelector("#adminNavLink"),
  appGate: document.querySelector("#appGate"),
  appAuthStatusText: document.querySelector("#appAuthStatusText"),
  appLoginForm: document.querySelector("#appLoginForm"),
  appUsernameInput: document.querySelector("#appUsernameInput"),
  appPasswordInput: document.querySelector("#appPasswordInput"),
  appLoginButton: document.querySelector("#appLoginButton"),
  inviteRegisterToggleButton: document.querySelector("#inviteRegisterToggleButton"),
  inviteRegisterForm: document.querySelector("#inviteRegisterForm"),
  inviteCodeInput: document.querySelector("#inviteCodeInput"),
  inviteUsernameInput: document.querySelector("#inviteUsernameInput"),
  invitePasswordInput: document.querySelector("#invitePasswordInput"),
  inviteRegisterButton: document.querySelector("#inviteRegisterButton"),
  appLogoutButton: document.querySelector("#appLogoutButton"),
  authPanel: document.querySelector("#authPanel"),
  authStatusText: document.querySelector("#authStatusText"),
  loginForm: document.querySelector("#loginForm"),
  usernameInput: document.querySelector("#usernameInput"),
  passwordInput: document.querySelector("#passwordInput"),
  rememberInput: document.querySelector("#rememberInput"),
  loginButton: document.querySelector("#loginButton"),
  logoutButton: document.querySelector("#logoutButton"),
  status: document.querySelector("#status"),
  overviewStudyText: document.querySelector("#overviewStudyText"),
  overviewStudyMeta: document.querySelector("#overviewStudyMeta"),
  overviewCampusText: document.querySelector("#overviewCampusText"),
  overviewCampusMeta: document.querySelector("#overviewCampusMeta"),
  overviewEnergyText: document.querySelector("#overviewEnergyText"),
  overviewEnergyMeta: document.querySelector("#overviewEnergyMeta"),
  overviewSyncText: document.querySelector("#overviewSyncText"),
  overviewSyncMeta: document.querySelector("#overviewSyncMeta"),
  overviewCourseDetail: document.querySelector("#overviewCourseDetail"),
  overviewRoomDetail: document.querySelector("#overviewRoomDetail"),
  overviewTermDetail: document.querySelector("#overviewTermDetail"),
  overviewGpaText: document.querySelector("#overviewGpaText"),
  overviewGpaMeta: document.querySelector("#overviewGpaMeta"),
  overviewCoreGpaDetail: document.querySelector("#overviewCoreGpaDetail"),
  overviewRequiredGpaDetail: document.querySelector("#overviewRequiredGpaDetail"),
  overviewDegreeGpaDetail: document.querySelector("#overviewDegreeGpaDetail"),
  overviewDormDetail: document.querySelector("#overviewDormDetail"),
  overviewWaterDetail: document.querySelector("#overviewWaterDetail"),
  overviewCardDetail: document.querySelector("#overviewCardDetail"),
  overviewEnergyRoomDetail: document.querySelector("#overviewEnergyRoomDetail"),
  overviewMeterDetail: document.querySelector("#overviewMeterDetail"),
  overviewMonthDetail: document.querySelector("#overviewMonthDetail"),
  overviewAuthDetail: document.querySelector("#overviewAuthDetail"),
  overviewServiceDetail: document.querySelector("#overviewServiceDetail"),
  overviewSyncDetail: document.querySelector("#overviewSyncDetail"),
  monthInput: document.querySelector("#monthInput"),
  refreshButton: document.querySelector("#refreshButton"),
  energyRefreshButton: document.querySelector("#energyRefreshButton"),
  energyRechargeButton: document.querySelector("#energyRechargeButton"),
  accountText: document.querySelector("#accountText"),
  ownerText: document.querySelector("#ownerText"),
  stateText: document.querySelector("#stateText"),
  balanceText: document.querySelector("#balanceText"),
  balanceRemark: document.querySelector("#balanceRemark"),
  monthKwhText: document.querySelector("#monthKwhText"),
  overFeeText: document.querySelector("#overFeeText"),
  meterOnlineText: document.querySelector("#meterOnlineText"),
  meterTotalText: document.querySelector("#meterTotalText"),
  billMonthText: document.querySelector("#billMonthText"),
  billList: document.querySelector("#billList"),
  meterCategoryText: document.querySelector("#meterCategoryText"),
  meterList: document.querySelector("#meterList"),
  packageCountText: document.querySelector("#packageCountText"),
  packageList: document.querySelector("#packageList"),
  timetableRefreshButton: document.querySelector("#timetableRefreshButton"),
  timetableSyncText: document.querySelector("#timetableSyncText"),
  timetableHeadingText: document.querySelector("#timetableHeadingText"),
  timetableSourceSelect: document.querySelector("#timetableSourceSelect"),
  courseCountText: document.querySelector("#courseCountText"),
  sessionCountText: document.querySelector("#sessionCountText"),
  locationCountText: document.querySelector("#locationCountText"),
  academicCalendarText: document.querySelector("#academicCalendarText"),
  timetableTermText: document.querySelector("#timetableTermText"),
  timetableWeekSelect: document.querySelector("#timetableWeekSelect"),
  timetableDaySelect: document.querySelector("#timetableDaySelect"),
  courseSearchInput: document.querySelector("#courseSearchInput"),
  timetableSummary: document.querySelector("#timetableSummary"),
  timetableGrid: document.querySelector("#timetableGrid"),
  courseListText: document.querySelector("#courseListText"),
  courseList: document.querySelector("#courseList"),
  freeDaySelect: document.querySelector("#freeDaySelect"),
  freeBuildingSelect: document.querySelector("#freeBuildingSelect"),
  freeRoomRefreshButton: document.querySelector("#freeRoomRefreshButton"),
  freeRoomSyncText: document.querySelector("#freeRoomSyncText"),
  freeSectionPicker: document.querySelector("#freeSectionPicker"),
  freeRoomBuildingCountText: document.querySelector("#freeRoomBuildingCountText"),
  freeRoomCountText: document.querySelector("#freeRoomCountText"),
  freeSeatCountText: document.querySelector("#freeSeatCountText"),
  freeSectionText: document.querySelector("#freeSectionText"),
  freeRoomList: document.querySelector("#freeRoomList"),
  evaluationRefreshButton: document.querySelector("#evaluationRefreshButton"),
  evaluationAutoButton: document.querySelector("#evaluationAutoButton"),
  evaluationAutoStopButton: document.querySelector("#evaluationAutoStopButton"),
  evaluationAutoPanel: document.querySelector("#evaluationAutoPanel"),
  evaluationAutoTitle: document.querySelector("#evaluationAutoTitle"),
  evaluationAutoText: document.querySelector("#evaluationAutoText"),
  evaluationAutoProgressBar: document.querySelector("#evaluationAutoProgressBar"),
  evaluationAutoProgressText: document.querySelector("#evaluationAutoProgressText"),
  evaluationAutoList: document.querySelector("#evaluationAutoList"),
  evaluationSyncText: document.querySelector("#evaluationSyncText"),
  evaluationTotalText: document.querySelector("#evaluationTotalText"),
  evaluationPendingText: document.querySelector("#evaluationPendingText"),
  evaluationCompletedText: document.querySelector("#evaluationCompletedText"),
  evaluationListMeta: document.querySelector("#evaluationListMeta"),
  evaluationList: document.querySelector("#evaluationList"),
  evaluationEditor: document.querySelector("#evaluationEditor"),
  evaluationEditorTitle: document.querySelector("#evaluationEditorTitle"),
  evaluationEditorMeta: document.querySelector("#evaluationEditorMeta"),
  evaluationCloseButton: document.querySelector("#evaluationCloseButton"),
  evaluationFillMaxButton: document.querySelector("#evaluationFillMaxButton"),
  evaluationForm: document.querySelector("#evaluationForm"),
  evaluationQuestions: document.querySelector("#evaluationQuestions"),
  evaluationReadyTitle: document.querySelector("#evaluationReadyTitle"),
  evaluationReadyText: document.querySelector("#evaluationReadyText"),
  evaluationSubmitButton: document.querySelector("#evaluationSubmitButton"),
  campusSyncText: document.querySelector("#campusSyncText"),
  campusModeSelect: document.querySelector("#campusModeSelect"),
  campusMonthInput: document.querySelector("#campusMonthInput"),
  campusRefreshButton: document.querySelector("#campusRefreshButton"),
  campusRechargeButton: document.querySelector("#campusRechargeButton"),
  identityNameText: document.querySelector("#identityNameText"),
  identityCodeText: document.querySelector("#identityCodeText"),
  identityAvatar: document.querySelector("#identityAvatar"),
  identityFacts: document.querySelector("#identityFacts"),
  identityStatusText: document.querySelector("#identityStatusText"),
  identityRefreshButton: document.querySelector("#identityRefreshButton"),
  identityQrButton: document.querySelector("#identityQrButton"),
  identityBarcodeButton: document.querySelector("#identityBarcodeButton"),
  identityCodeRefreshButton: document.querySelector("#identityCodeRefreshButton"),
  identityCodeModeTitle: document.querySelector("#identityCodeModeTitle"),
  identityCodeImage: document.querySelector("#identityCodeImage"),
  identityCodeEmpty: document.querySelector("#identityCodeEmpty"),
  identityCodeMeta: document.querySelector("#identityCodeMeta"),
  identityFaceRefreshButton: document.querySelector("#identityFaceRefreshButton"),
  identityFaceOfficialButton: document.querySelector("#identityFaceOfficialButton"),
  identityFacePhoto: document.querySelector("#identityFacePhoto"),
  identityFaceEmpty: document.querySelector("#identityFaceEmpty"),
  identityFaceStatusText: document.querySelector("#identityFaceStatusText"),
  identityFaceModeText: document.querySelector("#identityFaceModeText"),
  identityFaceSyncText: document.querySelector("#identityFaceSyncText"),
  identityFaceNotice: document.querySelector("#identityFaceNotice"),
  cardBalanceText: document.querySelector("#cardBalanceText"),
  cardBalanceRemark: document.querySelector("#cardBalanceRemark"),
  cardWalletCountText: document.querySelector("#cardWalletCountText"),
  waterCodeText: document.querySelector("#waterCodeText"),
  waterCodeRemark: document.querySelector("#waterCodeRemark"),
  waterCodeRefreshButton: document.querySelector("#waterCodeRefreshButton"),
  waterAmountText: document.querySelector("#waterAmountText"),
  accommodationSyncText: document.querySelector("#accommodationSyncText"),
  accommodationPlaceText: document.querySelector("#accommodationPlaceText"),
  accommodationClassText: document.querySelector("#accommodationClassText"),
  accommodationStudentText: document.querySelector("#accommodationStudentText"),
  accommodationNameText: document.querySelector("#accommodationNameText"),
  accommodationStatusText: document.querySelector("#accommodationStatusText"),
  accommodationDateText: document.querySelector("#accommodationDateText"),
  accommodationFeeText: document.querySelector("#accommodationFeeText"),
  accommodationDeviceText: document.querySelector("#accommodationDeviceText"),
  roommateCountText: document.querySelector("#roommateCountText"),
  roommateList: document.querySelector("#roommateList"),
  cardBillMonthText: document.querySelector("#cardBillMonthText"),
  cardBillList: document.querySelector("#cardBillList"),
  waterBillMonthText: document.querySelector("#waterBillMonthText"),
  waterBillList: document.querySelector("#waterBillList"),
  adminRefreshButton: document.querySelector("#adminRefreshButton"),
  adminSyncText: document.querySelector("#adminSyncText"),
  adminCreateUserForm: document.querySelector("#adminCreateUserForm"),
  adminCreateUsernameInput: document.querySelector("#adminCreateUsernameInput"),
  adminCreatePasswordInput: document.querySelector("#adminCreatePasswordInput"),
  adminCreateRoleSelect: document.querySelector("#adminCreateRoleSelect"),
  adminCreateUserButton: document.querySelector("#adminCreateUserButton"),
  inviteCreateForm: document.querySelector("#inviteCreateForm"),
  inviteNoteInput: document.querySelector("#inviteNoteInput"),
  inviteRoleSelect: document.querySelector("#inviteRoleSelect"),
  inviteExpirySelect: document.querySelector("#inviteExpirySelect"),
  inviteCreateButton: document.querySelector("#inviteCreateButton"),
  inviteCreatedBox: document.querySelector("#inviteCreatedBox"),
  changePasswordForm: document.querySelector("#changePasswordForm"),
  currentPasswordInput: document.querySelector("#currentPasswordInput"),
  newPasswordInput: document.querySelector("#newPasswordInput"),
  changePasswordButton: document.querySelector("#changePasswordButton"),
  adminCurrentUserText: document.querySelector("#adminCurrentUserText"),
  adminUserCountText: document.querySelector("#adminUserCountText"),
  adminUserList: document.querySelector("#adminUserList"),
  inviteCountText: document.querySelector("#inviteCountText"),
  inviteList: document.querySelector("#inviteList"),
  dialogBackdrop: document.querySelector("#dialogBackdrop"),
  dialogPanel: document.querySelector("#dialogPanel"),
  dialogToneIcon: document.querySelector("#dialogToneIcon"),
  dialogKicker: document.querySelector("#dialogKicker"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogMessage: document.querySelector("#dialogMessage"),
  dialogInput: document.querySelector("#dialogInput"),
  dialogInputContainer: document.querySelector("#dialogInputContainer"),
  dialogPasswordToggle: document.querySelector("#dialogPasswordToggle"),
  dialogHint: document.querySelector("#dialogHint"),
  dialogCancelButton: document.querySelector("#dialogCancelButton"),
  dialogConfirmButton: document.querySelector("#dialogConfirmButton"),
  dialogCloseButton: document.querySelector("#dialogCloseButton")
};

nodes.monthInput.value = state.month;
nodes.campusModeSelect.value = state.campusMode;
nodes.campusMonthInput.value = state.campusMonth;
nodes.freeDaySelect.value = state.freeDayplus;
nodes.freeBuildingSelect.value = state.freeBuilding;
nodes.timetableSourceSelect.value = state.timetableSource;
nodes.timetableWeekSelect.value = state.timetableWeek;
nodes.timetableDaySelect.value = state.timetableDay;
updateCampusControls();
renderFreeSectionPicker();
nodes.appLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginApp();
});
nodes.inviteRegisterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  registerWithInvite();
});
nodes.inviteRegisterToggleButton?.addEventListener("click", () => toggleInviteRegister());
nodes.appLogoutButton.addEventListener("click", () => logoutApp());
nodes.themeToggle.addEventListener("click", () => toggleTheme());
nodes.monthInput.addEventListener("change", () => {
  state.month = nodes.monthInput.value || currentMonth();
  refreshEnergy();
});
nodes.refreshButton.addEventListener("click", () => refresh());
nodes.energyRefreshButton.addEventListener("click", () => refreshEnergy());
nodes.energyRechargeButton.addEventListener("click", () => openEnergyRecharge());
nodes.campusModeSelect.addEventListener("change", () => {
  state.campusMode = nodes.campusModeSelect.value === "month" ? "month" : "recent";
  updateCampusControls();
  refreshCampus();
});
nodes.campusMonthInput.addEventListener("change", () => {
  state.campusMonth = nodes.campusMonthInput.value || currentMonth();
  refreshCampus();
});
nodes.campusRefreshButton.addEventListener("click", () => refreshCampus());
nodes.campusRechargeButton.addEventListener("click", () => openCampusRecharge());
nodes.identityRefreshButton.addEventListener("click", () => refreshIdentity());
nodes.identityCodeRefreshButton.addEventListener("click", () => refreshIdentityCode());
nodes.identityFaceRefreshButton.addEventListener("click", () => refreshIdentityFace());
nodes.identityFaceOfficialButton.addEventListener("click", () => openIdentityFaceOfficial());
nodes.identityQrButton.addEventListener("click", () => {
  state.identityCodeMode = "qr";
  renderIdentityCard();
});
nodes.identityBarcodeButton.addEventListener("click", () => {
  state.identityCodeMode = "barcode";
  renderIdentityCard();
});
nodes.waterCodeRefreshButton.addEventListener("click", () => refreshWaterCode());
nodes.timetableRefreshButton.addEventListener("click", () => refreshTimetable());
nodes.timetableSourceSelect.addEventListener("change", () => {
  state.timetableSource = nodes.timetableSourceSelect.value === "selection" ? "selection" : "current";
  state.timetableWeek = "all";
  refreshTimetable();
});
nodes.timetableWeekSelect.addEventListener("change", () => {
  state.timetableWeek = nodes.timetableWeekSelect.value || "all";
  renderTimetable();
});
nodes.timetableDaySelect.addEventListener("change", () => {
  state.timetableDay = nodes.timetableDaySelect.value || "all";
  renderTimetable();
});
nodes.courseSearchInput.addEventListener("input", () => {
  state.courseSearch = nodes.courseSearchInput.value.trim();
  renderTimetable();
});
nodes.timetableGrid.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-scroll-day]");
  if (!trigger) return;
  const day = Number(trigger.dataset.scrollDay);
  const column = nodes.timetableGrid.querySelector(`.day-column[data-day="${day}"]`);
  if (!column) return;
  nodes.timetableGrid.querySelectorAll("[data-scroll-day]").forEach((button) => {
    button.classList.toggle("active", button === trigger);
  });
  column.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
});
nodes.freeDaySelect.addEventListener("change", () => {
  state.freeDayplus = nodes.freeDaySelect.value || "0";
  refreshFreeRooms();
});
nodes.freeBuildingSelect.addEventListener("change", () => {
  state.freeBuilding = nodes.freeBuildingSelect.value || "study";
  refreshFreeRooms();
});
nodes.freeRoomRefreshButton.addEventListener("click", () => refreshFreeRooms());
nodes.evaluationRefreshButton?.addEventListener("click", () => refreshEvaluations());
nodes.evaluationAutoButton?.addEventListener("click", () => startEvaluationAuto());
nodes.evaluationAutoStopButton?.addEventListener("click", () => stopEvaluationAuto());
nodes.evaluationList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-evaluation-open]");
  if (!button) return;
  openEvaluation(button.dataset.evaluationOpen);
});
nodes.evaluationCloseButton?.addEventListener("click", () => closeEvaluationEditor());
nodes.evaluationFillMaxButton?.addEventListener("click", () => fillEvaluationMaximums());
nodes.evaluationForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  submitEvaluation();
});
nodes.freeSectionPicker.addEventListener("change", () => {
  const checked = [...nodes.freeSectionPicker.querySelectorAll("input:checked")].map((input) => Number(input.value));
  state.freeSections = checked.length ? checked : defaultFreeRoomSections();
  renderFreeSectionPicker();
});
document.querySelectorAll("[data-free-preset]").forEach((button) => {
  button.addEventListener("click", () => {
    state.freeSections = freeSectionPreset(button.dataset.freePreset);
    renderFreeSectionPicker();
    refreshFreeRooms();
  });
});
nodes.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  login();
});
nodes.logoutButton.addEventListener("click", () => logout());
nodes.adminRefreshButton?.addEventListener("click", () => loadAdminData());
nodes.adminCreateUserForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  createUser();
});
nodes.inviteCreateForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  createInvite();
});
nodes.changePasswordForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  changePassword();
});
nodes.adminUserList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-user-action]");
  if (!button) return;
  handleUserAction(button);
});
nodes.inviteList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-invite-action]");
  if (!button) return;
  handleInviteAction(button);
});
nodes.inviteCreatedBox?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-copy-text]");
  if (!button) return;
  copyText(button.dataset.copyText || "", "邀请码已复制。");
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-password-toggle]");
  if (!button) return;
  togglePasswordVisibility(button);
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelIdentityCodeRefresh();
    return;
  }
  scheduleIdentityCodeRefresh(state.identity?.code || {});
});

window.__HGU_APP_READY__ = true;
initDialog();
initEnhancedControls();
init();

async function init() {
  initTheme();
  await loadAppAuthStatus();
  if (!canUseApp()) {
    clearAllData();
    return;
  }
  await loadAuthStatus();
  await refresh({ initial: true });
}

function initDialog() {
  if (!nodes.dialogBackdrop) return;
  nodes.dialogCancelButton?.addEventListener("click", () => closeDialog({ confirmed: false, value: null }));
  nodes.dialogCloseButton?.addEventListener("click", () => closeDialog({ confirmed: false, value: null }));
  nodes.dialogConfirmButton?.addEventListener("click", () => {
    const expectsInput = nodes.dialogInput && !nodes.dialogInput.hidden;
    if (expectsInput && nodes.dialogInput.required && !nodes.dialogInput.value.trim()) {
      nodes.dialogHint.hidden = false;
      nodes.dialogHint.textContent = "请输入内容后继续。";
      nodes.dialogInput.focus();
      return;
    }
    closeDialog({
      confirmed: true,
      value: expectsInput ? nodes.dialogInput.value : null
    });
  });
  nodes.dialogInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      nodes.dialogConfirmButton?.click();
    }
  });
  nodes.dialogBackdrop.addEventListener("click", (event) => {
    if (event.target === nodes.dialogBackdrop) {
      closeDialog({ confirmed: false, value: null });
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !nodes.dialogBackdrop.hidden) {
      closeDialog({ confirmed: false, value: null });
    }
  });
}

function closeDialog(result) {
  if (!activeDialogResolve || !nodes.dialogBackdrop) return;
  const resolve = activeDialogResolve;
  activeDialogResolve = null;
  nodes.dialogBackdrop.dataset.open = "false";
  window.setTimeout(() => {
    nodes.dialogBackdrop.hidden = true;
    if (nodes.dialogInputContainer) {
      nodes.dialogInputContainer.hidden = true;
    }
    nodes.dialogInput.hidden = true;
    nodes.dialogInput.value = "";
    nodes.dialogInput.required = false;
    if (nodes.dialogPasswordToggle) {
      nodes.dialogPasswordToggle.hidden = true;
    }
    nodes.dialogHint.hidden = true;
    nodes.dialogHint.textContent = "";
    if (activeDialogFocus?.focus) activeDialogFocus.focus();
    activeDialogFocus = null;
  }, 140);
  resolve(result);
}

function showDialog({
  title = "确认操作",
  message = "请确认是否继续。",
  kicker = "操作确认",
  confirmText = "确认",
  cancelText = "取消",
  tone = "default",
  input = false,
  inputType = "text",
  inputPlaceholder = "",
  inputValue = "",
  inputRequired = false,
  hint = ""
} = {}) {
  if (!nodes.dialogBackdrop) {
    setNotice(message, tone === "danger" ? "error" : "");
    return Promise.resolve({ confirmed: false, value: null });
  }
  if (activeDialogResolve) {
    closeDialog({ confirmed: false, value: null });
  }
  activeDialogFocus = document.activeElement;
  nodes.dialogBackdrop.hidden = false;
  nodes.dialogBackdrop.dataset.open = "false";
  nodes.dialogBackdrop.dataset.tone = tone;
  nodes.dialogTitle.textContent = title;
  nodes.dialogMessage.textContent = message;
  nodes.dialogKicker.textContent = kicker;
  nodes.dialogCancelButton.textContent = cancelText;
  nodes.dialogConfirmButton.textContent = confirmText;
  const isInput = Boolean(input);
  const isPassword = inputType === "password";
  if (nodes.dialogInputContainer) {
    nodes.dialogInputContainer.hidden = !isInput;
  }
  nodes.dialogInput.hidden = !isInput;
  nodes.dialogInput.type = inputType;
  nodes.dialogInput.value = inputValue;
  nodes.dialogInput.placeholder = inputPlaceholder;
  nodes.dialogInput.required = Boolean(inputRequired);
  if (nodes.dialogPasswordToggle) {
    nodes.dialogPasswordToggle.hidden = !isInput || !isPassword;
    nodes.dialogPasswordToggle.classList.remove("is-visible");
  }
  nodes.dialogHint.hidden = !hint;
  nodes.dialogHint.textContent = hint;
  requestAnimationFrame(() => {
    nodes.dialogBackdrop.dataset.open = "true";
    if (input) {
      nodes.dialogInput.focus();
      nodes.dialogInput.select();
    } else {
      nodes.dialogConfirmButton.focus();
    }
  });
  return new Promise((resolve) => {
    activeDialogResolve = resolve;
  });
}

async function confirmDialog(options) {
  const result = await showDialog(options);
  return result.confirmed;
}

async function promptDialog(options) {
  return showDialog({ ...options, input: true });
}

function togglePasswordVisibility(button) {
  const inputId = button.dataset.passwordToggle;
  const input = inputId ? document.getElementById(inputId) : null;
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
  button.classList.toggle("is-visible", !visible);
  input.focus({ preventScroll: true });
}

function canUseApp() {
  return Boolean(state.appAuth && (!state.appAuth.required || state.appAuth.authenticated));
}

function readStoredAppSessionToken() {
  return window.__HGU_EMBEDDED_SESSION__?.read() || "";
}

function isEmbeddedWechatBrowser() {
  return Boolean(
    window.__HGU_EMBEDDED_SESSION__?.isEmbeddedWechat?.()
    || /MicroMessenger/i.test(window.navigator?.userAgent || "")
  );
}

function storeAppSessionToken(token, expiresAt) {
  window.__HGU_EMBEDDED_SESSION__?.store(token, expiresAt);
}

function rememberAppAuthSession(session) {
  if (session?.sessionToken) storeAppSessionToken(session.sessionToken, session.expiresAt);
  else if (!session?.authenticated) storeAppSessionToken("");
  if (!session || !("sessionToken" in session)) return session;
  const remembered = { ...session };
  delete remembered.sessionToken;
  return remembered;
}

function shouldHandleAppAccessError(path, options, error) {
  return !options.skipAppAuthHandling
    && !String(path || "").startsWith("/api/app-auth/")
    && p.isAppAccessError(error);
}

function handleAppAccessExpired(error) {
  if (appSessionExpiredHandled && !canUseApp()) return;
  appSessionExpiredHandled = true;
  state.appAuth = { required: true, authenticated: false, csrfToken: null, expiresAt: null };
  state.auth = { hasCookie: false, source: "none" };
  storeAppSessionToken("");
  clearAllData();
  renderAppGate(new Error(error?.message || "系统访问会话已失效，请先解锁系统。"));
}

function renderAppGate(error) {
  const unlocked = canUseApp();
  document.body.dataset.appLocked = unlocked ? "false" : "true";
  document.querySelector("#platformConsoleLink").hidden = !state.appAuth?.platformSso;
  nodes.refreshButton.disabled = !unlocked;
  nodes.appLogoutButton.hidden = !state.appAuth?.required || !unlocked;
  updateAdminVisibility();

  if (!state.appAuth) {
    nodes.appAuthStatusText.textContent = "正在检查访问会话...";
    return;
  }
  if (!error && !unlocked && nativeAppLoginError) {
    nodes.appAuthStatusText.textContent = nativeAppLoginError === "rate-limited"
      ? "登录尝试次数较多，请稍后再试。"
      : "系统账号或密码不正确。";
    nativeAppLoginError = null;
    window.history.replaceState(null, "", window.location.pathname);
    return;
  }
  if (error) {
    const message = p.isAppAccessError(error)
      ? `${error.message || "系统访问会话已失效。"} 请先解锁系统账号；这里还没有校验学校账号密码。`
      : (error.message || "访问验证失败，请稍后重试。");
    nodes.appAuthStatusText.textContent = message;
    return;
  }
  if (unlocked) {
    const expiresAt = state.appAuth.expiresAt ? new Date(state.appAuth.expiresAt).toLocaleString() : "";
    const username = state.appAuth.user?.username ? `${state.appAuth.user.username}，` : "";
    nodes.appAuthStatusText.textContent = expiresAt ? `${username}系统已登录，有效至 ${expiresAt}` : `${username}系统已登录。`;
    return;
  }
  nodes.appAuthStatusText.textContent = "请输入系统账号和密码后继续。";
}

async function loadAppAuthStatus() {
  try {
    state.appAuth = rememberAppAuthSession(await api("/api/app-auth/status", { skipCsrf: true }));
    if (!state.appAuth?.authenticated) storeAppSessionToken("");
    appSessionExpiredHandled = false;
    renderAppGate();
    updateAdminVisibility();
  } catch (error) {
    state.appAuth = { required: true, authenticated: false, csrfToken: null, expiresAt: null };
    renderAppGate(error);
  }
}

async function loginApp() {
  const username = nodes.appUsernameInput?.value.trim();
  const password = nodes.appPasswordInput.value;
  const embeddedWechat = isEmbeddedWechatBrowser();
  let nativeFallbackSubmitted = false;
  if (!password) {
    renderAppGate(new Error("请输入系统密码。"));
    nodes.appPasswordInput.focus();
    return;
  }

  nodes.appLoginButton.disabled = true;
  nodes.appLoginButton.textContent = "验证中";
  try {
    state.appAuth = rememberAppAuthSession(await api("/api/app-auth/login", {
      method: "POST",
      body: { username, password },
      skipCsrf: true,
      timeoutMs: embeddedWechat ? 20_000 : undefined
    }));
    appSessionExpiredHandled = false;
    if (nodes.appUsernameInput) nodes.appUsernameInput.value = "";
    nodes.appPasswordInput.value = "";
    renderAppGate();
    updateAdminVisibility();
    await loadAuthStatus();
    await refresh();
  } catch (error) {
    if (embeddedWechat && (!error?.status || error.status === 504)) {
      nativeFallbackSubmitted = true;
      nodes.appLoginButton.textContent = "切换登录";
      nodes.appAuthStatusText.textContent = "微信客户端响应较慢，正在切换兼容登录方式...";
      HTMLFormElement.prototype.submit.call(nodes.appLoginForm);
      return;
    }
    renderAppGate(error);
  } finally {
    if (!nativeFallbackSubmitted) {
      nodes.appLoginButton.disabled = false;
      nodes.appLoginButton.textContent = "解锁系统";
    }
  }
}

function toggleInviteRegister(force) {
  const form = nodes.inviteRegisterForm;
  if (!form) return;
  const on = force ?? form.hidden;
  nodes.appLoginForm.hidden = on;
  form.hidden = !on;
  if (nodes.inviteRegisterToggleButton) {
    nodes.inviteRegisterToggleButton.textContent = on ? "收起注册" : "使用邀请码注册";
  }
  if (on) {
    nodes.appAuthStatusText.textContent = "请输入邀请码，并设置你的系统用户名和密码。";
    nodes.inviteCodeInput?.focus();
  } else if (!canUseApp()) {
    nodes.appAuthStatusText.textContent = "请输入系统账号和密码后继续。";
  }
}

async function registerWithInvite() {
  const inviteCode = nodes.inviteCodeInput.value.trim();
  const username = nodes.inviteUsernameInput.value.trim();
  const password = nodes.invitePasswordInput.value;
  if (!inviteCode || !username || !password) {
    renderAppGate(new Error("请输入邀请码、新系统用户名和密码。"));
    return;
  }

  nodes.inviteRegisterButton.disabled = true;
  nodes.inviteRegisterButton.textContent = "注册中";
  try {
    state.appAuth = rememberAppAuthSession(await api("/api/app-auth/register", {
      method: "POST",
      body: { inviteCode, username, password },
      skipCsrf: true
    }));
    appSessionExpiredHandled = false;
    nodes.inviteCodeInput.value = "";
    nodes.inviteUsernameInput.value = "";
    nodes.invitePasswordInput.value = "";
    toggleInviteRegister(false);
    renderAppGate();
    updateAdminVisibility();
    await loadAuthStatus();
    await refresh();
    setNotice("系统账号已创建，请继续连接学校账号。", "");
  } catch (error) {
    renderAppGate(error);
  } finally {
    nodes.inviteRegisterButton.disabled = false;
    nodes.inviteRegisterButton.textContent = "注册并进入系统";
  }
}

async function logoutApp() {
  if (state.appAuth?.platformSso) {
    await p.logout();
    return;
  }
  nodes.appLogoutButton.disabled = true;
  try {
    state.appAuth = await api("/api/app-auth/logout", { method: "POST" });
  } catch {
    state.appAuth = { required: true, authenticated: false, csrfToken: null, expiresAt: null };
  } finally {
    storeAppSessionToken("");
    clearAllData();
    renderAppGate();
    updateAdminVisibility();
    nodes.appLogoutButton.disabled = false;
  }
}

async function loadAuthStatus() {
  try {
    state.auth = await api("/api/auth/status");
    renderAuth();
  } catch (error) {
    state.auth = { hasCookie: false, source: "none" };
    renderAuth(error);
  }
}

async function login() {
  const username = nodes.usernameInput.value.trim();
  const password = nodes.passwordInput.value;
  if (!username || !password) {
    setNotice("请输入学号/工号和统一身份认证密码。", "error");
    return;
  }

  nodes.loginButton.disabled = true;
  nodes.loginButton.textContent = "登录中";
  setNotice("正在连接学校统一身份认证，并同步学业、校园账户和能耗数据...", "");
  try {
    await api("/api/auth/login", {
      method: "POST",
      body: {
        username,
        password,
        rememberMe: nodes.rememberInput.checked
      }
    });
    nodes.passwordInput.value = "";
    await loadAuthStatus();
    await refresh();
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    nodes.loginButton.disabled = false;
    nodes.loginButton.textContent = state.auth?.needsLogin ? "重新登录并保存会话" : "登录并保存会话";
  }
}

async function logout() {
  nodes.logoutButton.disabled = true;
  try {
    await api("/api/auth/logout", { method: "POST" });
    clearAllData();
    await loadAuthStatus();
    setNotice("已清除本项目保存的学校会话。", "");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    nodes.logoutButton.disabled = false;
  }
}

function isAdminUser() {
  return state.appAuth?.user?.role === "admin";
}

function updateAdminVisibility() {
  if (nodes.adminNavLink) nodes.adminNavLink.hidden = !isAdminUser();
  if (nodes.adminCurrentUserText) {
    const user = state.appAuth?.user;
    nodes.adminCurrentUserText.textContent = user ? `${user.username} · ${user.role}` : "--";
  }
  if (!isAdminUser() && window.location.hash === "#admin") {
    window.location.hash = "#overview";
  }
}

async function loadUsers() {
  if (!isAdminUser()) return;
  if (nodes.adminSyncText) nodes.adminSyncText.textContent = "加载中";
  try {
    state.users = await api("/api/users");
    renderUsers();
    if (nodes.adminSyncText) nodes.adminSyncText.textContent = `已更新 ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (nodes.adminSyncText) nodes.adminSyncText.textContent = "加载失败";
    setNotice(error.message, "error");
  }
}

async function loadInvites() {
  if (!isAdminUser()) return;
  try {
    state.invites = await api("/api/invites");
    renderInvites();
  } catch (error) {
    setNotice(error.message, "error");
  }
}

async function loadAdminData() {
  if (!isAdminUser()) return;
  await Promise.allSettled([loadUsers(), loadInvites()]);
}

async function createUser() {
  const username = nodes.adminCreateUsernameInput.value.trim();
  const password = nodes.adminCreatePasswordInput.value;
  const role = nodes.adminCreateRoleSelect.value === "admin" ? "admin" : "user";
  if (!username || !password) {
    setNotice("请输入系统用户名和初始密码。", "error");
    return;
  }
  nodes.adminCreateUserButton.disabled = true;
  try {
    await api("/api/users", {
      method: "POST",
      body: { username, password, role }
    });
    nodes.adminCreateUsernameInput.value = "";
    nodes.adminCreatePasswordInput.value = "";
    nodes.adminCreateRoleSelect.value = "user";
    setNotice(`已创建系统账号 ${username}。`, "");
    await loadUsers();
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    nodes.adminCreateUserButton.disabled = false;
  }
}

async function createInvite() {
  const note = nodes.inviteNoteInput.value.trim();
  const role = nodes.inviteRoleSelect.value === "admin" ? "admin" : "user";
  const expiresInDays = Number(nodes.inviteExpirySelect.value || 7);
  nodes.inviteCreateButton.disabled = true;
  try {
    const invite = await api("/api/invites", {
      method: "POST",
      body: { note, role, expiresInDays }
    });
    nodes.inviteNoteInput.value = "";
    nodes.inviteRoleSelect.value = "user";
    nodes.inviteExpirySelect.value = "7";
    renderCreatedInvite(invite);
    setNotice("邀请码已生成。", "");
    await loadInvites();
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    nodes.inviteCreateButton.disabled = false;
  }
}

async function changePassword() {
  const currentPassword = nodes.currentPasswordInput.value;
  const newPassword = nodes.newPasswordInput.value;
  if (!currentPassword || !newPassword) {
    setNotice("请输入当前密码和新密码。", "error");
    return;
  }
  nodes.changePasswordButton.disabled = true;
  try {
    state.appAuth = rememberAppAuthSession(await api("/api/app-auth/password", {
      method: "POST",
      body: { currentPassword, newPassword }
    }));
    nodes.currentPasswordInput.value = "";
    nodes.newPasswordInput.value = "";
    setNotice("系统密码已更新。", "");
  } catch (error) {
    setNotice(error.message, "error");
  } finally {
    nodes.changePasswordButton.disabled = false;
  }
}

async function handleUserAction(button) {
  const userId = button.dataset.userId;
  const action = button.dataset.userAction;
  const user = state.users.find((item) => item.id === userId);
  if (!user) return;
  try {
    if (action === "toggle") {
      const disabled = !user.disabled;
      const verb = disabled ? "停用" : "启用";
      const confirmed = await confirmDialog({
        title: `${verb}系统账号`,
        message: `确认${verb}账号 ${user.username}？`,
        confirmText: verb,
        tone: disabled ? "danger" : "default"
      });
      if (!confirmed) return;
      await api(`/api/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: { disabled }
      });
      setNotice(`已${verb}账号 ${user.username}。`, "");
      await loadUsers();
      return;
    }
    if (action === "password") {
      const result = await promptDialog({
        title: "重置系统密码",
        message: `为 ${user.username} 设置新系统密码。`,
        confirmText: "保存密码",
        inputType: "password",
        inputPlaceholder: "至少 12 位",
        inputRequired: true,
        hint: "新密码只会保存为哈希，无法再次查看。"
      });
      if (!result.confirmed) return;
      const password = result.value.trim();
      if (!password) return;
      await api(`/api/users/${encodeURIComponent(userId)}/password`, {
        method: "POST",
        body: { password }
      });
      setNotice(`已重置 ${user.username} 的系统密码。`, "");
      return;
    }
    if (action === "delete") {
      const confirmed = await confirmDialog({
        title: "删除系统账号",
        message: `确认删除账号 ${user.username}？该账号保存的学校会话和课表缓存也会删除。`,
        confirmText: "删除账号",
        tone: "danger"
      });
      if (!confirmed) return;
      await api(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      setNotice(`已删除账号 ${user.username}。`, "");
      await loadUsers();
    }
  } catch (error) {
    setNotice(error.message, "error");
  }
}

async function handleInviteAction(button) {
  const inviteId = button.dataset.inviteId;
  const action = button.dataset.inviteAction;
  const invite = state.invites.find((item) => item.id === inviteId);
  if (!invite) return;
  try {
    const visibleCode = invite.code || invite.codePreview || "";
    if (action === "copy") {
      await copyText(invite.code, "已复制");
      return;
    }
    if (action === "revoke") {
      const confirmed = await confirmDialog({
        title: "撤销邀请码",
        message: `确认撤销邀请码 ${visibleCode}？撤销后将不能再用于注册。`,
        confirmText: "撤销",
        tone: "danger"
      });
      if (!confirmed) return;
      await api(`/api/invites/${encodeURIComponent(inviteId)}`, {
        method: "PATCH",
        body: { revoked: true }
      });
      setNotice("邀请码已撤销。", "");
      await loadInvites();
      return;
    }
    if (action === "delete") {
      const confirmed = await confirmDialog({
        title: "删除邀请码",
        message: `确认删除邀请码 ${visibleCode}？删除后列表中不再保留这条记录。`,
        confirmText: "删除",
        tone: "danger"
      });
      if (!confirmed) return;
      await api(`/api/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" });
      setNotice("邀请码已删除。", "");
      await loadInvites();
    }
  } catch (error) {
    setNotice(error.message, "error");
  }
}

async function copyText(text, successMessage = "已复制。") {
  if (!text) {
    setNotice("没有可复制的内容。", "error");
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setNotice(successMessage, "ok");
    return true;
  } catch {
    setNotice("复制失败，请手动选中后复制。", "error");
    return false;
  }
}

function renderCreatedInvite(invite) {
  if (!nodes.inviteCreatedBox) return;
  if (!invite?.code) {
    nodes.inviteCreatedBox.hidden = true;
    nodes.inviteCreatedBox.innerHTML = "";
    return;
  }
  nodes.inviteCreatedBox.hidden = false;
  nodes.inviteCreatedBox.innerHTML = `
    <span>新邀请码</span>
    <div class="invite-code-line">
      <strong>${escapeHtml(invite.code)}</strong>
      <button type="button" class="ghost" data-copy-text="${escapeHtml(invite.code)}">复制</button>
    </div>
    <small>已存</small>
  `;
}

function schoolAccountLabel(user) {
  if (!user.hasSchoolSession) return "未绑定学号/工号";
  const base = user.schoolAccount ? `学号/工号 ${user.schoolAccount}` : "未记录学号/工号";
  if (user.schoolSessionNeedsLogin || user.schoolSessionStatus === "expired") {
    return `${base} · 需重新登录`;
  }
  const updatedAt = formatSessionDate(user.schoolSessionUpdatedAt);
  return updatedAt ? `${base} · ${updatedAt}` : base;
}

function renderUsers() {
  if (!nodes.adminUserList) return;
  const users = Array.isArray(state.users) ? state.users : [];
  nodes.adminUserCountText.textContent = users.length ? `${users.length} 个账号` : "--";
  if (!users.length) {
    nodes.adminUserList.innerHTML = empty("暂无系统账号");
    return;
  }
  const currentUserId = state.appAuth?.user?.id;
  nodes.adminUserList.innerHTML = users.map((user) => {
    const isSelf = user.id === currentUserId;
    const schoolText = schoolAccountLabel(user);
    const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "从未登录";
    return `
      <article class="admin-user-row ${user.disabled ? "disabled" : ""}">
        <div class="admin-user-main">
          <strong>${escapeHtml(user.username)}${isSelf ? "（当前）" : ""}</strong>
          <span>${escapeHtml(user.role === "admin" ? "管理员" : "普通用户")} · ${escapeHtml(user.disabled ? "已停用" : "已启用")}</span>
        </div>
        <div class="admin-user-meta">
          <span>学校账号：${escapeHtml(schoolText)}</span>
          <span>上次登录：${escapeHtml(lastLogin)}</span>
        </div>
        <div class="admin-user-actions">
          <button type="button" class="ghost" data-user-action="password" data-user-id="${escapeHtml(user.id)}">重置密码</button>
          <button type="button" class="ghost" data-user-action="toggle" data-user-id="${escapeHtml(user.id)}" ${isSelf ? "disabled" : ""}>${user.disabled ? "启用" : "停用"}</button>
          <button type="button" class="ghost danger" data-user-action="delete" data-user-id="${escapeHtml(user.id)}" ${isSelf ? "disabled" : ""}>删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function inviteStatusText(status) {
  return {
    active: "可用",
    used: "已使用",
    expired: "已过期",
    revoked: "已撤销"
  }[status] || status || "--";
}

function renderInvites() {
  if (!nodes.inviteList) return;
  const invites = Array.isArray(state.invites) ? state.invites : [];
  nodes.inviteCountText.textContent = invites.length ? `${invites.length} 个邀请码` : "--";
  if (!invites.length) {
    nodes.inviteList.innerHTML = empty("暂无邀请码");
    return;
  }
  nodes.inviteList.innerHTML = invites.map((invite) => {
    const canRevoke = invite.status === "active";
    const visibleCode = invite.code || invite.codePreview || "--";
    const hasCode = invite.code;
    const expiresAt = invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : "永不过期";
    const usedText = invite.usedBy ? `使用者：${invite.usedBy}` : `创建者：${invite.createdBy || "--"}`;
    return `
      <article class="invite-row ${escapeHtml(invite.status)} ${hasCode ? "" : "preview"}">
        <div class="invite-main">
          <div class="invite-code-box">
            <strong class="invite-code-text">${escapeHtml(visibleCode)}</strong>
          </div>
          <span class="invite-status">${escapeHtml(inviteStatusText(invite.status))} · ${escapeHtml(invite.role === "admin" ? "管理员" : "普通用户")}</span>
        </div>
        <div class="invite-meta">
          <span>有效期：${escapeHtml(expiresAt)}</span>
          <span>${escapeHtml(usedText)}</span>
          ${invite.note ? `<span>备注：${escapeHtml(invite.note)}</span>` : ""}
        </div>
        <div class="invite-actions">
          <button type="button" class="ghost" data-invite-action="copy" data-invite-id="${escapeHtml(invite.id)}" ${hasCode ? "" : "disabled"}>${hasCode ? "复制" : "无"}</button>
          <button type="button" class="ghost danger" data-invite-action="revoke" data-invite-id="${escapeHtml(invite.id)}" ${canRevoke ? "" : "disabled"}>撤销</button>
          <button type="button" class="ghost danger" data-invite-action="delete" data-invite-id="${escapeHtml(invite.id)}">删除</button>
        </div>
      </article>
    `;
  }).join("");
}

function clearAllData() {
  state.summary = null;
  state.campus = null;
  state.timetable = null;
  state.academicGpa = null;
  state.evaluations = null;
  state.evaluationAuto = null;
  state.evaluationDraft = null;
  state.evaluationCourse = null;
  state.face = null;
  state.freeRooms = null;
  state.identity = null;
  state.users = [];
  state.invites = [];
  state.lastSyncedAt = null;
  state.auth = null;
  clearDashboard();
  clearCampus();
  clearIdentity();
  clearIdentityFace();
  clearTimetable();
  clearFreeRooms();
  closeEvaluationEditor();
  stopEvaluationAutoPolling();
  renderEvaluationAuto();
  renderEvaluations();
  renderUsers();
  renderInvites();
  renderAuth();
  renderOverview();
}

async function refresh({ initial = false } = {}) {
  state.loading = true;
  renderLoading();
  nodes.overviewSyncText.textContent = "同步中";
  nodes.overviewSyncMeta.textContent = "正在更新所有板块";
  const academicPromise = (async () => {
    await refreshTimetable({ silent: true });
    await refreshGpa({ silent: true });
    if (!initial) {
      await refreshEvaluations({ silent: true });
      await refreshFreeRooms({ silent: true });
    }
  })();
  const requests = [
    refreshEnergy({ silent: true }),
    refreshCampus({ silent: true }),
    refreshIdentity({ silent: true }),
    academicPromise
  ];

  await Promise.allSettled(requests);
  const currentNotice = nodes.status.querySelector(".notice");
  if (currentNotice && !currentNotice.classList.contains("error")) {
    nodes.status.innerHTML = "";
  }

  state.loading = false;
  nodes.refreshButton.disabled = false;
  nodes.refreshButton.textContent = "同步全部";
  renderOverview();
  await loadAuthStatus();
  if(initial) setTimeout(refreshFreeRooms,0,{silent:true});
}

async function refreshEnergy({ silent = false } = {}) {
  if (!silent) {
    nodes.energyRefreshButton.disabled = true;
    nodes.energyRefreshButton.textContent = "查询中";
  }

  try {
    state.summary = await api(`/api/energy/summary?time=${encodeURIComponent(state.month)}`);
    markSynced();
    renderEnergy();
    if (!silent) setNotice(`${state.month} 能耗数据已同步。`, "ok");
    return true;
  } catch (error) {
    renderError(error);
    renderOverview();
    return false;
  } finally {
    nodes.energyRefreshButton.disabled = false;
    nodes.energyRefreshButton.textContent = "查询能耗";
  }
}

async function refreshCampus({ silent = false } = {}) {
  if (!silent) {
    nodes.campusRefreshButton.disabled = true;
    nodes.campusRefreshButton.textContent = "查询中";
    nodes.campusSyncText.textContent = "同步中";
  }

  try {
    state.campus = await api(`/api/campus/summary?${campusQueryString()}`);
    if (/账号在其他地方登录|登录已失效|登录过期/.test(JSON.stringify(state.campus?.water))) {
      state.campus.water = await api(`/api/campus/water?${campusQueryString()}`);
    }
    markSynced();
    renderCampus();
  } catch (error) {
    renderCampusError(error);
  } finally {
    nodes.campusRefreshButton.disabled = false;
    nodes.campusRefreshButton.textContent = "查询";
  }
}

async function refreshIdentity({ silent = false } = {}) {
  if (!silent) {
    nodes.identityRefreshButton.disabled = true;
    nodes.identityRefreshButton.textContent = "同步中";
    nodes.identityStatusText.textContent = "同步中";
  }

  try {
    state.identity = await api("/api/identity-card");
    markSynced();
    renderIdentityCard();
    if (!silent) setNotice("校园身份卡已同步。", "ok");
    return true;
  } catch (error) {
    state.identity = { error: error.message, status: error.status };
    renderIdentityCard();
    if (!silent) setNotice(error.message || "暂时无法同步校园身份卡。", "error");
    return false;
  } finally {
    nodes.identityRefreshButton.disabled = false;
    nodes.identityRefreshButton.textContent = "同步身份";
  }
}

async function refreshIdentityCode({ silent = false } = {}) {
  if (!silent) {
    nodes.identityCodeRefreshButton.disabled = true;
    nodes.identityCodeRefreshButton.textContent = "刷新中";
  }
  try {
    const code = await api("/api/identity-card/code", { method: "POST" });
    state.identity ||= {};
    state.identity.code = code;
    renderIdentityCard();
    if (!silent) setNotice("个人身份码已刷新，请以当前显示为准。", "ok");
  } catch (error) {
    state.identity ||= {};
    state.identity.code = { error: error.message || "个人身份码刷新失败。" };
    renderIdentityCard();
    if (!silent) setNotice(error.message || "个人身份码刷新失败。", "error");
  } finally {
    if (!silent) {
      nodes.identityCodeRefreshButton.disabled = false;
      nodes.identityCodeRefreshButton.textContent = "刷新";
    }
  }
}

async function refreshIdentityFace({ silent = false } = {}) {
  if (!silent) {
    nodes.identityFaceRefreshButton.disabled = true;
    nodes.identityFaceRefreshButton.textContent = "同步中";
    nodes.identityFaceStatusText.textContent = "同步中";
  }
  try {
    state.face = await api("/api/identity-face");
    renderIdentityFace();
    return true;
  } catch (error) {
    state.face = { error: error.message, status: error.status };
    renderIdentityFace();
    if (!silent) setNotice(error.message || "暂时无法同步人脸信息。", "error");
    return false;
  } finally {
    if (!silent) {
      nodes.identityFaceRefreshButton.disabled = false;
      nodes.identityFaceRefreshButton.textContent = "同步人脸";
    }
  }
}

async function openIdentityFaceOfficial() {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  nodes.identityFaceOfficialButton.disabled = true;
  nodes.identityFaceOfficialButton.textContent = "打开中";
  try {
    const link = await api("/api/identity-face/link");
    if (!link?.url) throw new Error("学校未返回人脸信息入口。");
    if (popup) {
      popup.location.href = link.url;
    } else {
      window.location.href = link.url;
    }
    setNotice(link.autoLogin
      ? "已使用本系统保存的 CAS 会话生成一次性官方跳转，正在打开学校人脸信息页。采集、上传和协议确认会在 my.hgu.edu.cn 完成。"
      : "已打开学校官方人脸信息页面。采集、上传和协议确认会在 my.hgu.edu.cn 完成。", "ok");
  } catch (error) {
    if (popup) popup.close();
    setNotice(error.message || "暂时无法打开学校官方人脸信息页面。", "error");
  } finally {
    nodes.identityFaceOfficialButton.disabled = false;
    nodes.identityFaceOfficialButton.textContent = "官方采集页";
  }
}

async function openEnergyRecharge() {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  nodes.energyRechargeButton.disabled = true;
  nodes.energyRechargeButton.textContent = "打开中";
  try {
    const link = await api("/api/energy/recharge-link");
    if (!link?.url) throw new Error("学校未返回能耗充值入口");
    if (popup) {
      popup.location.href = link.url;
    } else {
      window.location.href = link.url;
    }
    setNotice("已打开能耗充值页，请在官方页面完成支付。", "ok");
  } catch (error) {
    if (popup) popup.close();
    const message = error.status === 401
      ? "统一身份认证会话已失效，请在本系统重新登录后再打开能耗充值。"
      : (error.message || "暂时无法打开能耗官方充值页面");
    setNotice(message, "error");
  } finally {
    nodes.energyRechargeButton.disabled = false;
    nodes.energyRechargeButton.textContent = "官方充值";
  }
}

async function openCampusRecharge() {
  const popup = window.open("about:blank", "_blank");
  if (popup) popup.opener = null;
  nodes.campusRechargeButton.disabled = true;
  nodes.campusRechargeButton.textContent = "打开中";
  try {
    const link = await api("/api/campus/recharge-link");
    if (!link?.url) throw new Error("学校未返回充值入口");
    if (popup) {
      popup.location.href = link.url;
    } else {
      window.location.href = link.url;
    }
    setNotice("已打开一卡通充值页，请在官方页面完成支付。", "ok");
  } catch (error) {
    if (popup) popup.close();
    const message = error.status === 401
      ? "学校一卡通会话已失效，请重新登录后再打开充值。"
      : (error.message || "暂时无法打开官方充值页面");
    setNotice(message, "error");
  } finally {
    nodes.campusRechargeButton.disabled = false;
    nodes.campusRechargeButton.textContent = "官方充值";
  }
}

async function refreshWaterCode() {
  const currentCode = nodes.waterCodeText.textContent.trim();
  const confirmText = currentCode && currentCode !== "--"
    ? "重新获取会刷新当前用水/电码，旧码可能失效。继续吗？"
    : "现在向学校重新获取用水/电码吗？";
  const confirmed = await confirmDialog({
    title: "重新获取用水/电码",
    message: confirmText,
    confirmText: "重新获取",
    tone: "warning"
  });
  if (!confirmed) return;

  nodes.waterCodeRefreshButton.disabled = true;
  nodes.waterCodeRefreshButton.textContent = "获取中";
  nodes.waterCodeRefreshButton.setAttribute("aria-busy", "true");
  try {
    const result = await api("/api/campus/water-code/refresh", { method: "POST" });
    state.campus ||= {};
    state.campus.water ||= {};
    state.campus.water.account = result.account || state.campus.water.account;
    state.campus.water.waterCode = result.waterCode || result;
    renderCampusWater(state.campus.water);
    renderOverview();
    setNotice("已重新获取用水/电码，请以当前显示为准。", "ok");
  } catch (error) {
    const message = error.status === 401
      ? "学校一卡通会话已失效，请重新登录后再获取用水/电码。"
      : (error.message || "暂时无法重新获取用水/电码。");
    setNotice(message, "error");
  } finally {
    nodes.waterCodeRefreshButton.disabled = false;
    nodes.waterCodeRefreshButton.textContent = "重新获取";
    nodes.waterCodeRefreshButton.removeAttribute("aria-busy");
  }
}

async function refreshTimetable({ silent = false } = {}) {
  if (!silent) {
    nodes.timetableRefreshButton.disabled = true;
    nodes.timetableRefreshButton.textContent = "同步中";
    setSyncStatus(nodes.timetableSyncText, "同步中");
  }

  try {
    state.timetable = await api(`/api/academic/timetable?source=${encodeURIComponent(state.timetableSource)}`);
    markSynced();
    renderTimetable();
  } catch (error) {
    renderTimetableError(error);
  } finally {
    nodes.timetableRefreshButton.disabled = false;
    nodes.timetableRefreshButton.textContent = "同步课表";
  }
}

async function refreshGpa({ silent = false } = {}) {
  try {
    state.academicGpa = await api("/api/academic/gpa");
    markSynced();
    renderOverview();
    return true;
  } catch (error) {
    state.academicGpa = { error: error.message, status: error.status };
    renderOverview();
    if (!silent) setNotice(error.message || "暂时无法同步 GPA 成绩。", "error");
    return false;
  }
}

async function refreshFreeRooms({silent=false}={}) {
  if (state.freeRooms===1) return;
  state.freeRooms=1;
  if(!silent){
    nodes.freeRoomRefreshButton.disabled=true;
    nodes.freeRoomRefreshButton.textContent="查询中";
    nodes.freeRoomSyncText.textContent="同步中";
  }

  try {
    state.freeRooms=await api(`/api/academic/free-classrooms?${freeRoomQueryString()}`);
    markSynced();
    renderFreeRooms();
  } catch (error) {
    state.freeRooms=0;
    renderFreeRoomError(error);
  } finally {
    nodes.freeRoomRefreshButton.disabled=false;
    nodes.freeRoomRefreshButton.textContent="查询空教室";
  }
}

async function refreshEvaluations({ silent = false } = {}) {
  if (!nodes.evaluationRefreshButton) return false;
  if (!silent) {
    nodes.evaluationRefreshButton.disabled = true;
    nodes.evaluationRefreshButton.textContent = "同步中";
    nodes.evaluationSyncText.textContent = "正在读取教务系统";
  }
  try {
    state.evaluations = await api("/api/academic/evaluations");
    renderEvaluations();
    if (!silent) setNotice("教学评估清单已同步。", "ok");
    return true;
  } catch (error) {
    state.evaluations = { error: error.message, status: error.status, records: [] };
    renderEvaluations();
    if (!silent) setNotice(error.message || "暂时无法同步教学评估。", "error");
    return false;
  } finally {
    nodes.evaluationRefreshButton.disabled = false;
    nodes.evaluationRefreshButton.textContent = "同步评估";
  }
}

function evaluationAutoIsActive(data = state.evaluationAuto) {
  return ["queued", "running", "canceling"].includes(data?.status);
}

function evaluationAutoIsTerminal(data = state.evaluationAuto) {
  return ["completed", "completed_with_errors", "failed", "canceled"].includes(data?.status);
}

function startEvaluationAutoPolling() {
  if (evaluationAutoPollTimer) return;
  evaluationAutoPollTimer = window.setInterval(() => {
    refreshEvaluationAutoStatus({ silent: true });
  }, 2000);
}

function stopEvaluationAutoPolling() {
  if (!evaluationAutoPollTimer) return;
  window.clearInterval(evaluationAutoPollTimer);
  evaluationAutoPollTimer = null;
}

async function refreshEvaluationAutoStatus({ silent = false } = {}) {
  if (!nodes.evaluationAutoPanel) return false;
  const previous = state.evaluationAuto;
  try {
    const data = await api("/api/academic/evaluations/auto");
    state.evaluationAuto = data;
    renderEvaluationAuto();
    if (evaluationAutoIsActive(data)) startEvaluationAutoPolling();
    else stopEvaluationAutoPolling();
    if (evaluationAutoIsTerminal(data) && evaluationAutoIsActive(previous)) {
      await refreshEvaluations({ silent: true });
      if (!silent) setNotice(evaluationAutoNotice(data), data.status === "failed" ? "error" : "ok");
    }
    return true;
  } catch (error) {
    if (!silent) setNotice(error.message || "无法读取自动评教状态。", "error");
    return false;
  }
}

function evaluationAutoNotice(data = {}) {
  if (data.status === "failed") return data.error || "自动完成评估失败。";
  if (data.status === "canceled") return "自动完成评估已停止。";
  if (data.status === "completed_with_errors") return `自动完成结束：成功 ${data.completed || 0}，失败 ${data.failed || 0}。`;
  return `自动完成结束：提交 ${data.completed || 0} 门。`;
}

async function startEvaluationAuto() {
  if (!nodes.evaluationAutoButton) return;
  nodes.evaluationAutoButton.disabled = true;
  nodes.evaluationAutoButton.textContent = "检查中";
  try {
    await refreshEvaluations({ silent: true });
    const records = Array.isArray(state.evaluations?.records) ? state.evaluations.records : [];
    const pendingCount = state.evaluations?.pendingCount ?? records.filter((record) => !record.completed).length;
    if (!pendingCount) {
      setNotice("当前没有待评课程。", "ok");
      await refreshEvaluationAutoStatus({ silent: true });
      return;
    }
    const confirmed = await confirmDialog({
      title: "自动完成待评课程",
      message: `将按满分和“好”自动提交 ${pendingCount} 门待评课程，逐门等待学校要求时间；关闭网页也会继续。确认开始吗？`,
      confirmText: "开始自动完成",
      tone: "warning"
    });
    if (!confirmed) return;
    state.evaluationAuto = await api("/api/academic/evaluations/auto/start", {
      method: "POST",
      body: { subjectiveText: "好" }
    });
    renderEvaluationAuto();
    startEvaluationAutoPolling();
    setNotice("自动完成评估已启动，后台会继续处理待评课程。", "ok");
  } catch (error) {
    setNotice(error.message || "自动完成评估启动失败。", "error");
    await refreshEvaluationAutoStatus({ silent: true });
  } finally {
    renderEvaluationAuto();
  }
}

async function stopEvaluationAuto() {
  const confirmed = await confirmDialog({
    title: "停止自动完成",
    message: "将停止后续课程，已提交的不会撤回。确认停止吗？",
    confirmText: "停止",
    tone: "danger"
  });
  if (!confirmed) return;
  try {
    state.evaluationAuto = await api("/api/academic/evaluations/auto/stop", { method: "POST" });
    renderEvaluationAuto();
    if (evaluationAutoIsActive(state.evaluationAuto)) startEvaluationAutoPolling();
    setNotice("已请求停止自动完成评估。", "");
  } catch (error) {
    setNotice(error.message || "停止自动完成评估失败。", "error");
  }
}

function evaluationAutoStatusLabel(status) {
  const labels = {
    idle: "未启动",
    queued: "排队中",
    running: "运行中",
    canceling: "正在停止",
    canceled: "已停止",
    completed: "已完成",
    completed_with_errors: "已完成，有失败",
    failed: "失败"
  };
  return labels[status] || "未知";
}

function evaluationAutoEntryStatusLabel(status) {
  const labels = {
    queued: "等待",
    opening: "加载",
    waiting: "等待",
    submitting: "提交",
    submitted: "成功",
    skipped: "跳过",
    failed: "失败",
    canceled: "停止"
  };
  return labels[status] || status || "--";
}

function evaluationAutoProgress(data = {}) {
  const total = Number(data.total || 0);
  const done = Number(data.completed || 0) + Number(data.failed || 0) + Number(data.skipped || 0);
  return { total, done, percent: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
}

function renderEvaluationAuto() {
  if (!nodes.evaluationAutoPanel) return;
  const data = state.evaluationAuto || { status: "idle", entries: [] };
  const active = evaluationAutoIsActive(data);
  const terminal = evaluationAutoIsTerminal(data);
  const hasPanel = active || terminal || (Array.isArray(data.entries) && data.entries.length > 0);
  nodes.evaluationAutoPanel.hidden = !hasPanel;

  if (nodes.evaluationAutoButton) {
    nodes.evaluationAutoButton.disabled = active;
    nodes.evaluationAutoButton.textContent = active ? "自动完成中" : "自动完成待评";
  }
  if (nodes.evaluationAutoStopButton) {
    nodes.evaluationAutoStopButton.hidden = !active;
    nodes.evaluationAutoStopButton.disabled = data.status === "canceling";
  }
  if (!hasPanel) return;

  const progress = evaluationAutoProgress(data);
  const waitSeconds = Math.max(0, Number(data.waitRemainingSeconds || 0));
  const currentText = data.current?.course
    ? `正在处理 ${data.currentIndex || 0}/${data.total || 0}：${data.current.course}${waitSeconds ? `，等待 ${waitSeconds} 秒` : ""}`
    : evaluationAutoStatusLabel(data.status);
  nodes.evaluationAutoTitle.textContent = evaluationAutoStatusLabel(data.status);
  nodes.evaluationAutoText.textContent = data.error || currentText;
  nodes.evaluationAutoProgressBar.style.width = `${progress.percent}%`;
  nodes.evaluationAutoProgressText.textContent = `进度 ${progress.done}/${progress.total}，成功 ${data.completed || 0} 门，跳过 ${data.skipped || 0} 门，失败 ${data.failed || 0} 门`;
  nodes.evaluationAutoList.innerHTML = (data.entries || []).length
    ? data.entries.map((entry) => `
      <article class="evaluation-auto-item ${escapeHtml(entry.status || "")}">
        <div>
          <strong>${escapeHtml(entry.course || "未命名课程")}</strong>
          <span>${escapeHtml([entry.teacher, entry.message].filter(Boolean).join(" · ") || "--")}</span>
        </div>
        <em class="evaluation-auto-badge">${escapeHtml(evaluationAutoEntryStatusLabel(entry.status))}</em>
      </article>
    `).join("")
    : "";
}

function renderEvaluations() {
  if (!nodes.evaluationList) return;
  const data = state.evaluations;
  if (!data) {
    nodes.evaluationTotalText.textContent = "--";
    nodes.evaluationPendingText.textContent = "--";
    nodes.evaluationCompletedText.textContent = "--";
    nodes.evaluationListMeta.textContent = "等待同步";
    nodes.evaluationSyncText.textContent = "--";
    nodes.evaluationList.innerHTML = empty("登录学校账号后同步教学评估清单");
    return;
  }
  if (data.error) {
    nodes.evaluationTotalText.textContent = "--";
    nodes.evaluationPendingText.textContent = "--";
    nodes.evaluationCompletedText.textContent = "--";
    nodes.evaluationListMeta.textContent = "同步失败";
    nodes.evaluationSyncText.textContent = "需要处理";
    nodes.evaluationList.innerHTML = empty(data.error);
    return;
  }
  const records = Array.isArray(data.records) ? data.records : [];
  nodes.evaluationTotalText.textContent = String(data.totalCount ?? records.length);
  nodes.evaluationPendingText.textContent = String(data.pendingCount ?? records.filter((item) => !item.completed).length);
  nodes.evaluationCompletedText.textContent = String(data.completedCount ?? records.filter((item) => item.completed).length);
  nodes.evaluationListMeta.textContent = data.pendingCount
    ? `${data.pendingCount} 门待评，请逐门检查后提交`
    : (records.length ? "本轮课程均已完成评估" : "当前没有教学评估任务");
  nodes.evaluationSyncText.textContent = data.generatedAt ? `更新于 ${formatSessionDate(data.generatedAt)}` : "已同步";
  if (!records.length) {
    nodes.evaluationList.innerHTML = empty("当前没有教学评估任务");
    return;
  }
  nodes.evaluationList.innerHTML = records.map((record) => `
    <article class="evaluation-course ${record.completed ? "completed" : "pending"}">
      <div class="evaluation-course-status" aria-hidden="true">${record.completed ? "✓" : "待"}</div>
      <div class="evaluation-course-main">
        <div class="evaluation-course-title">
          <strong>${escapeHtml(record.course || "未命名课程")}</strong>
          <span class="evaluation-status-badge ${record.completed ? "done" : "todo"}">${record.completed ? "已完成" : "待评估"}</span>
        </div>
        <span>${escapeHtml(record.teacher || "教师未标注")} · ${escapeHtml(record.questionnaire || "教学评估问卷")}</span>
        <small>课程号 ${escapeHtml(record.courseCode || "--")} · 课序号 ${escapeHtml(record.courseSequence || "--")}</small>
      </div>
      <div class="evaluation-course-actions">
        ${record.completed
          ? '<button type="button" class="ghost" disabled>已经提交</button>'
          : `<button type="button" data-evaluation-open="${escapeHtml(record.id)}">开始填写</button>`}
      </div>
    </article>
  `).join("");
}

async function openEvaluation(ktid) {
  const course = state.evaluations?.records?.find((item) => item.id === ktid);
  if (!course || course.completed) return;
  closeEvaluationEditor();
  state.evaluationCourse = course;
  nodes.evaluationEditor.hidden = false;
  nodes.evaluationEditorTitle.textContent = course.course || "教学评估";
  nodes.evaluationEditorMeta.textContent = `${course.teacher || "教师"} · 正在加载问卷`;
  nodes.evaluationQuestions.innerHTML = empty("正在从教务系统加载问卷...");
  nodes.evaluationSubmitButton.disabled = true;
  nodes.evaluationEditor.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    state.evaluationDraft = await api(`/api/academic/evaluations/${encodeURIComponent(ktid)}`);
    renderEvaluationDraft();
  } catch (error) {
    state.evaluationDraft = null;
    nodes.evaluationQuestions.innerHTML = empty(error.message || "问卷加载失败");
    nodes.evaluationEditorMeta.textContent = "无法加载问卷";
    setNotice(error.message || "暂时无法加载教学评估问卷。", "error");
  }
}

function evaluationQuestionControl(question, index) {
  const fieldName = escapeHtml(question.id);
  if (question.type === "score") {
    return `<input class="evaluation-score-input" name="${fieldName}" type="number" min="1" max="${Number(question.max) || 10}" step="1" value="${Number(question.max) || 10}" required aria-label="第 ${index + 1} 题分数">`;
  }
  if (question.type === "subjective") {
    return `<textarea name="${fieldName}" rows="3" maxlength="1000" ${question.required ? "required" : ""}>好</textarea>`;
  }
  if (question.type === "radio" || question.type === "checkbox") {
    return `<div class="evaluation-options">${(question.options || []).map((option, optionIndex) => `
      <label>
        <input type="${question.type}" name="${fieldName}" value="${escapeHtml(option.value)}" ${question.required && optionIndex === 0 && question.type === "radio" ? "checked" : ""}>
        <span>${escapeHtml(option.label || option.value)}</span>
      </label>
    `).join("")}</div>`;
  }
  return `<input name="${fieldName}" type="text" maxlength="1000" ${question.required ? "required" : ""}>`;
}

function renderEvaluationDraft() {
  const draft = state.evaluationDraft;
  const course = state.evaluationCourse;
  if (!draft) return;
  nodes.evaluationEditorTitle.textContent = course?.course || draft.questionnaire || "教学评估";
  nodes.evaluationEditorMeta.textContent = `${course?.teacher || "教师"} · ${draft.questionnaire || "教学评估问卷"}`;
  nodes.evaluationQuestions.innerHTML = draft.questions.map((question, index) => `
    <label class="evaluation-question ${question.type}">
      <span class="evaluation-question-number">${String(index + 1).padStart(2, "0")}</span>
      <span class="evaluation-question-body">
        <strong>${escapeHtml(question.prompt || `第 ${index + 1} 题`)}</strong>
        <small>${question.type === "score" ? `整数评分，满分 ${question.max || 10} 分` : (question.required ? "必填" : "选填")}</small>
        ${evaluationQuestionControl(question, index)}
      </span>
    </label>
  `).join("");
  startEvaluationCountdown();
}

function startEvaluationCountdown() {
  clearInterval(evaluationCountdownTimer);
  const update = () => {
    const draft = state.evaluationDraft;
    if (!draft) return;
    const remaining = Math.max(0, Math.ceil((new Date(draft.availableAt).getTime() - Date.now()) / 1000));
    nodes.evaluationSubmitButton.disabled = remaining > 0;
    nodes.evaluationReadyTitle.textContent = remaining > 0 ? `还需等待 ${remaining} 秒` : "可以确认提交";
    nodes.evaluationReadyText.textContent = remaining > 0
      ? "这是教务系统原有的问卷阅读等待时间"
      : "请再次检查分数和主观评价";
    if (!remaining) clearInterval(evaluationCountdownTimer);
  };
  update();
  evaluationCountdownTimer = setInterval(update, 500);
}

function fillEvaluationMaximums() {
  if (!state.evaluationDraft) return;
  nodes.evaluationQuestions.querySelectorAll("input.evaluation-score-input").forEach((input) => {
    input.value = input.max || "10";
  });
  setNotice("本门问卷的分数题已全部恢复为满分。", "ok");
}

function collectEvaluationAnswers() {
  const draft = state.evaluationDraft;
  const answers = {};
  for (const question of draft.questions) {
    const controls = Array.from(nodes.evaluationForm.elements).filter((element) => element.name === question.id);
    if (question.type === "checkbox") {
      answers[question.id] = controls.filter((input) => input.checked).map((input) => input.value);
    } else if (question.type === "radio") {
      answers[question.id] = controls.find((input) => input.checked)?.value || "";
    } else {
      answers[question.id] = controls[0]?.value ?? "";
    }
  }
  return answers;
}

async function submitEvaluation() {
  const draft = state.evaluationDraft;
  const course = state.evaluationCourse;
  if (!draft || !course) return;
  if (!nodes.evaluationForm.reportValidity()) return;
  const answers = collectEvaluationAnswers();
  const scores = draft.questions.filter((question) => question.type === "score").map((question) => Number(answers[question.id]));
  const fullScoreCount = scores.filter((score, index) => score === Number(draft.questions.filter((question) => question.type === "score")[index]?.max || 10)).length;
  const confirmed = await confirmDialog({
    title: `提交《${course.course || "本门课程"}》教学评估`,
    message: `被评教师：${course.teacher || "--"}。本次共有 ${scores.length} 道分数题，其中 ${fullScoreCount} 道为满分。提交后通常不能修改，确认提交吗？`,
    confirmText: "确认提交",
    tone: "warning"
  });
  if (!confirmed) return;

  nodes.evaluationSubmitButton.disabled = true;
  nodes.evaluationSubmitButton.textContent = "提交中";
  try {
    const result = await api(`/api/academic/evaluations/${encodeURIComponent(course.id)}/submit`, {
      method: "POST",
      body: { draftId: draft.draftId, answers }
    });
    setNotice(result.message || "教学评估已提交成功。", "ok");
    closeEvaluationEditor();
    await refreshEvaluations({ silent: true });
  } catch (error) {
    if (error.status === 429 && error.details?.availableAt) {
      draft.availableAt = error.details.availableAt;
      startEvaluationCountdown();
    }
    setNotice(error.message || "教学评估提交失败。", "error");
  } finally {
    nodes.evaluationSubmitButton.textContent = "确认并提交本门评估";
    if (state.evaluationDraft) startEvaluationCountdown();
  }
}

function closeEvaluationEditor() {
  clearInterval(evaluationCountdownTimer);
  evaluationCountdownTimer = null;
  state.evaluationDraft = null;
  state.evaluationCourse = null;
  if (nodes.evaluationEditor) nodes.evaluationEditor.hidden = true;
  if (nodes.evaluationQuestions) nodes.evaluationQuestions.innerHTML = "";
}

function campusQueryString() {
  const params = new URLSearchParams();
  params.set("mode", state.campusMode);
  if (state.campusMode === "month") params.set("time", state.campusMonth);
  return params.toString();
}

function freeRoomQueryString() {
  const params = new URLSearchParams();
  params.set("dayplus", state.freeDayplus);
  params.set("building", state.freeBuilding);
  params.set("sections", state.freeSections.join(","));
  return params.toString();
}

function updateCampusControls() {
  nodes.campusMonthInput.disabled = state.campusMode !== "month";
  nodes.campusMonthInput.hidden = state.campusMode !== "month";
  syncEnhancedControls(nodes.campusModeSelect, nodes.campusMonthInput);
}

function initEnhancedControls() {
  document.querySelectorAll("select").forEach(enhanceSelectControl);
  document.querySelectorAll('input[type="month"]').forEach(enhanceMonthControl);

  if (enhancedControlsReady) return;
  enhancedControlsReady = true;

  document.addEventListener("click", (event) => {
    for (const control of enhancedControls.values()) {
      if (!control.wrapper.contains(event.target) && !control.menu.contains(event.target)) {
        setEnhancedControlOpen(control, false);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeEnhancedControls();
  });
  document.addEventListener("scroll", repositionOpenEnhancedControls, true);
  window.addEventListener("resize", repositionOpenEnhancedControls);
}

function enhanceSelectControl(select) {
  if (!select || enhancedControls.has(select)) return;

  const wrapper = document.createElement("div");
  wrapper.className = "enhanced-control control-select";
  select.parentNode.insertBefore(wrapper, select);
  wrapper.appendChild(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "control-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", select.getAttribute("aria-label") || "选择");

  const valueLabel = document.createElement("span");
  valueLabel.className = "control-value";
  const chevron = document.createElement("span");
  chevron.className = "control-chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.append(valueLabel, chevron);

  const menu = document.createElement("div");
  menu.className = "control-menu";
  menu.hidden = true;
  menu.setAttribute("role", "listbox");
  if (select.id) menu.id = `${select.id}Menu`;
  if (menu.id) trigger.setAttribute("aria-controls", menu.id);
  wrapper.appendChild(trigger);
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => event.stopPropagation());

  select.classList.add("native-control-hidden");
  select.setAttribute("aria-hidden", "true");
  select.tabIndex = -1;

  const control = { type: "select", source: select, wrapper, trigger, valueLabel, menu };
  enhancedControls.set(select, control);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (select.disabled) return;
    setEnhancedControlOpen(control, !wrapper.classList.contains("is-open"));
  });

  select.addEventListener("change", () => syncEnhancedControl(select));
  const observer = new MutationObserver(() => {
    renderSelectControl(select);
    syncEnhancedControl(select);
  });
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "label", "selected", "value"]
  });
  control.observer = observer;

  renderSelectControl(select);
  syncEnhancedControl(select);
}

function renderSelectControl(select) {
  const control = enhancedControls.get(select);
  if (!control) return;

  control.menu.innerHTML = "";
  [...select.options].forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "control-option";
    optionButton.setAttribute("role", "option");
    optionButton.dataset.value = option.value;
    optionButton.disabled = option.disabled;
    optionButton.setAttribute("aria-selected", option.selected ? "true" : "false");
    optionButton.textContent = option.textContent.trim();
    if (option.selected) optionButton.classList.add("is-selected");

    optionButton.addEventListener("click", (event) => {
      event.stopPropagation();
      if (option.disabled) return;
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      setEnhancedControlOpen(control, false);
    });

    control.menu.appendChild(optionButton);
  });
}

function enhanceMonthControl(input) {
  if (!input || enhancedControls.has(input)) return;

  const wrapper = document.createElement("div");
  wrapper.className = "enhanced-control control-month";
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "control-trigger month-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", input.getAttribute("aria-label") || "选择月份");

  const valueLabel = document.createElement("span");
  valueLabel.className = "control-value";
  const calendarIcon = document.createElement("span");
  calendarIcon.className = "control-calendar-icon";
  calendarIcon.setAttribute("aria-hidden", "true");
  trigger.append(valueLabel, calendarIcon);

  const menu = document.createElement("div");
  menu.className = "control-menu month-menu";
  menu.hidden = true;
  menu.setAttribute("role", "dialog");
  menu.innerHTML = `
    <div class="month-menu-head">
      <button type="button" class="month-nav" data-month-nav="-1" aria-label="上一年"></button>
      <strong class="month-year"></strong>
      <button type="button" class="month-nav next" data-month-nav="1" aria-label="下一年"></button>
    </div>
    <div class="month-grid"></div>
    <div class="month-actions">
      <button type="button" class="month-action ghost" data-month-close>关闭</button>
      <button type="button" class="month-action" data-month-today>本月</button>
    </div>
  `;
  wrapper.appendChild(trigger);
  document.body.appendChild(menu);
  menu.addEventListener("click", (event) => event.stopPropagation());

  input.classList.add("native-control-hidden");
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;

  const selected = parseMonthValue(input.value) || parseMonthValue(currentMonth());
  const control = {
    type: "month",
    source: input,
    wrapper,
    trigger,
    valueLabel,
    menu,
    yearLabel: menu.querySelector(".month-year"),
    grid: menu.querySelector(".month-grid"),
    viewYear: selected.year
  };
  enhancedControls.set(input, control);

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (input.disabled) return;
    const current = parseMonthValue(input.value) || parseMonthValue(currentMonth());
    control.viewYear = current.year;
    renderMonthControl(input);
    setEnhancedControlOpen(control, !wrapper.classList.contains("is-open"));
  });

  menu.querySelectorAll("[data-month-nav]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      control.viewYear += Number(button.dataset.monthNav);
      renderMonthControl(input);
    });
  });

  menu.querySelector("[data-month-today]").addEventListener("click", (event) => {
    event.stopPropagation();
    setMonthControlValue(input, currentMonth());
    setEnhancedControlOpen(control, false);
  });

  menu.querySelector("[data-month-close]").addEventListener("click", (event) => {
    event.stopPropagation();
    setEnhancedControlOpen(control, false);
  });

  input.addEventListener("change", () => syncEnhancedControl(input));
  const observer = new MutationObserver(() => syncEnhancedControl(input));
  observer.observe(input, {
    attributes: true,
    attributeFilter: ["disabled", "hidden", "value"]
  });
  control.observer = observer;

  renderMonthControl(input);
  syncEnhancedControl(input);
}

function renderMonthControl(input) {
  const control = enhancedControls.get(input);
  if (!control) return;

  const selected = parseMonthValue(input.value);
  const current = parseMonthValue(currentMonth());
  control.yearLabel.textContent = `${control.viewYear} 年`;
  control.grid.innerHTML = "";

  for (let month = 1; month <= 12; month += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "month-option";
    button.textContent = `${month}月`;
    if (selected && selected.year === control.viewYear && selected.month === month) {
      button.classList.add("is-selected");
      button.setAttribute("aria-current", "date");
    }
    if (current && current.year === control.viewYear && current.month === month) {
      button.classList.add("is-current");
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setMonthControlValue(input, `${control.viewYear}-${String(month).padStart(2, "0")}`);
      setEnhancedControlOpen(control, false);
    });
    control.grid.appendChild(button);
  }
}

function setMonthControlValue(input, value) {
  if (input.value === value) {
    syncEnhancedControl(input);
    return;
  }
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setEnhancedControlOpen(control, open) {
  if (!control) return;
  if (open) closeEnhancedControls(control);

  control.wrapper.classList.toggle("is-open", open);
  control.menu.classList.toggle("is-open", open);
  control.trigger.setAttribute("aria-expanded", open ? "true" : "false");
  control.menu.hidden = !open;

  if (open) {
    positionEnhancedControlMenu(control);
    requestAnimationFrame(() => positionEnhancedControlMenu(control));
  }
}

function positionEnhancedControlMenu(control) {
  if (!control || !control.wrapper.classList.contains("is-open") || control.wrapper.hidden) return;

  const margin = 12;
  const gap = 8;
  const triggerRect = control.trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const maxWidth = Math.max(180, viewportWidth - margin * 2);
  const desiredWidth = control.type === "month"
    ? Math.min(322, maxWidth)
    : measureSelectMenuWidth(control, triggerRect.width, Math.min(220, maxWidth));

  control.menu.style.width = `${Math.round(desiredWidth)}px`;
  control.menu.style.minWidth = `${Math.ceil(triggerRect.width)}px`;
  control.menu.style.maxWidth = `${Math.min(control.type === "month" ? 322 : 220, maxWidth)}px`;
  control.menu.style.left = `${Math.max(margin, Math.min(triggerRect.left, viewportWidth - margin - triggerRect.width))}px`;
  control.menu.style.top = `${Math.round(triggerRect.bottom + gap)}px`;
  control.menu.style.maxHeight = "";

  const naturalRect = control.menu.getBoundingClientRect();
  const openAbove = naturalRect.bottom > viewportHeight - margin && triggerRect.top > viewportHeight - triggerRect.bottom;
  const available = openAbove
    ? Math.max(160, triggerRect.top - gap - margin)
    : Math.max(160, viewportHeight - triggerRect.bottom - gap - margin);

  const menuWidth = Math.min(naturalRect.width || triggerRect.width, maxWidth);
  const left = Math.max(margin, Math.min(triggerRect.left, viewportWidth - margin - menuWidth));
  const top = openAbove
    ? Math.max(margin, triggerRect.top - gap - Math.min(naturalRect.height || available, available))
    : Math.min(triggerRect.bottom + gap, viewportHeight - margin - Math.min(naturalRect.height || available, available));

  control.menu.style.left = `${Math.round(left)}px`;
  control.menu.style.top = `${Math.round(top)}px`;
  control.menu.style.maxHeight = `${Math.round(Math.min(control.type === "month" ? 340 : 360, available))}px`;
}

function measureSelectMenuWidth(control, triggerWidth, maxWidth) {
  const labels = [...control.menu.querySelectorAll(".control-option")]
    .map((option) => option.textContent.trim())
    .filter(Boolean);
  if (!labels.length) return Math.min(maxWidth, Math.max(triggerWidth, 120));

  const triggerStyle = getComputedStyle(control.trigger);
  const measurer = document.createElement("span");
  measurer.style.position = "fixed";
  measurer.style.left = "-9999px";
  measurer.style.top = "0";
  measurer.style.visibility = "hidden";
  measurer.style.whiteSpace = "nowrap";
  measurer.style.fontFamily = triggerStyle.fontFamily;
  measurer.style.fontSize = triggerStyle.fontSize;
  measurer.style.fontWeight = "750";
  document.body.appendChild(measurer);

  let labelWidth = 0;
  for (const label of labels) {
    measurer.textContent = label;
    labelWidth = Math.max(labelWidth, measurer.getBoundingClientRect().width);
  }
  measurer.remove();

  return Math.min(maxWidth, Math.max(triggerWidth, Math.ceil(labelWidth) + 42));
}

function repositionOpenEnhancedControls() {
  for (const control of enhancedControls.values()) {
    if (control.wrapper.classList.contains("is-open")) positionEnhancedControlMenu(control);
  }
}

function closeEnhancedControls(except = null) {
  for (const control of enhancedControls.values()) {
    if (control !== except) setEnhancedControlOpen(control, false);
  }
}

function syncEnhancedControls(...sources) {
  const targets = sources.length ? sources : [...enhancedControls.keys()];
  targets.forEach(syncEnhancedControl);
}

function syncEnhancedControl(source) {
  const control = enhancedControls.get(source);
  if (!control) return;

  control.wrapper.hidden = source.hidden;
  control.wrapper.classList.toggle("is-disabled", source.disabled);
  control.trigger.disabled = source.disabled;
  if (source.hidden || source.disabled) setEnhancedControlOpen(control, false);

  if (control.type === "select") {
    const selected = source.selectedOptions?.[0] || source.options?.[0];
    control.valueLabel.textContent = selected ? selected.textContent.trim() : "请选择";
    control.menu.querySelectorAll(".control-option").forEach((optionButton) => {
      const isSelected = optionButton.dataset.value === source.value;
      optionButton.classList.toggle("is-selected", isSelected);
      optionButton.setAttribute("aria-selected", isSelected ? "true" : "false");
    });
    return;
  }

  control.valueLabel.textContent = formatMonthControlLabel(source.value);
  renderMonthControl(source);
}

function parseMonthValue(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatMonthControlLabel(value) {
  const month = parseMonthValue(value);
  if (!month) return "选择月份";
  return `${month.year}年 ${String(month.month).padStart(2, "0")}月`;
}

async function api(path, options = {}) {
  const method = options.method || "GET";
  const controller = new AbortController();
  const timeoutMs = Number(options.timeoutMs || 90_000);
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) controller.abort();
    else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  const init = {
    cache: "no-store",
    method,
    credentials: "same-origin",
    headers: { ...(options.headers || {}) },
    signal: controller.signal
  };
  const storedAppSessionToken = readStoredAppSessionToken();
  if (storedAppSessionToken && !options.skipStoredAppSession) {
    init.headers["x-hgu-app-session"] = storedAppSessionToken;
  }
  if (!options.skipCsrf && state.appAuth?.csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    init.headers["x-csrf-token"] = state.appAuth.csrfToken;
  }
  if (options.body) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(options.body);
  }
  let response;
  try {
    response = await fetch(p.appUrl(path), init);
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("请求等待时间过长，请稍后重试。");
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.details = payload.details;
    error.status = response.status;
    if (p.handleSessionError(response.status, payload.code)) throw error;
    if (shouldHandleAppAccessError(path, options, error)) {
      handleAppAccessExpired(error);
    }
    throw error;
  }
  if (payload.ok !== true) {
    const error = new Error("服务响应格式异常，请刷新后重试。");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}

function sessionTone(status) {
  if (status === "active") return "ok";
  if (status === "refreshing") return "warn";
  if (status === "expired" || status === "error") return "bad";
  return "idle";
}

function formatSessionDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sessionText(session = {}) {
  if (session.status === "expired") return "需要重新登录";
  if (session.status === "error") return "刷新失败";
  if (session.status === "missing") return "待连接";
  const actualExpiry = formatSessionDate(session.expiresAt);
  const assumedExpiry = formatSessionDate(session.assumedExpiresAt);
  if (session.status === "refreshing") return assumedExpiry ? `刷新中，预计 ${assumedExpiry}` : "正在刷新";
  if (actualExpiry) return `有效至 ${actualExpiry}`;
  if (assumedExpiry) return `预计至 ${assumedExpiry}`;
  return session.connected ? "已连接" : "待连接";
}

function authSessionEntries(auth = {}) {
  const sessions = auth.sessions || {};
  const fallbackStatus = (connected) => connected ? "active" : "missing";
  const campusConnected = Boolean(auth.campus?.hasEasytongToken || auth.campus?.hasUwcToken || auth.campus?.hasAppdmToken);
  return [
    {
      key: "cas",
      label: "CAS 有效期",
      data: sessions.cas || { connected: auth.hasCasCookie, status: fallbackStatus(auth.hasCasCookie) }
    },
    {
      key: "energy",
      label: "能耗",
      data: sessions.energy || {
        connected: auth.hasNrgCookie || auth.hasEnvCookie,
        status: fallbackStatus(auth.hasNrgCookie || auth.hasEnvCookie),
        assumedExpiresAt: auth.assumedExpiresAt
      }
    },
    {
      key: "campus",
      label: "一卡通",
      data: sessions.campus || {
        connected: campusConnected,
        status: fallbackStatus(campusConnected),
        assumedExpiresAt: auth.campus?.assumedExpiresAt,
        lastError: auth.campus?.lastError || auth.campus?.appdmLastError
      }
    },
    {
      key: "academic",
      label: "教务",
      data: sessions.academic || {
        connected: Boolean(auth.academic?.hasAcademicCookie),
        status: fallbackStatus(auth.academic?.hasAcademicCookie),
        assumedExpiresAt: auth.academic?.assumedExpiresAt,
        lastError: auth.academic?.lastError
      }
    }
  ];
}

function authSessionChip(entry) {
  const session = entry.data || {};
  const title = session.lastError || session.appdmLastError || "";
  return `
    <span class="auth-session-chip ${sessionTone(session.status)}" title="${escapeHtml(title)}">
      <strong>${escapeHtml(entry.label)}</strong>
      <em>${escapeHtml(sessionText(session))}</em>
    </span>
  `;
}

function schoolAuthProblem(auth = {}) {
  const casStatus = auth.sessions?.cas?.status;
  const portalStatus = auth.sessions?.portal?.status;
  const portalNeedsLogin = portalStatus === "expired" || portalStatus === "error";
  const hasSchoolAccount = Boolean(auth.schoolAccount);
  const expired = auth.needsLogin
    || casStatus === "expired"
    || casStatus === "error"
    || portalNeedsLogin;
  if (!auth.hasCookie) {
    return {
      type: "missing",
      title: "请先登录学校账号",
      message: "当前系统账号还没有绑定学号/工号。请在连接学校账号区域登录统一身份认证后继续使用。"
    };
  }
  if (auth.source !== "env" && !hasSchoolAccount) {
    return {
      type: "unverified",
      title: "需要重新登录确认学号",
      message: "这里有一份旧的学校会话，但没有记录登录学号/工号。请重新登录一次学校账号，系统会保存正确的学号。"
    };
  }
  if (expired) {
    return {
      type: "expired",
      title: "学校登录已过期",
      message: auth.loginRequiredMessage || auth.sessions?.portal?.lastError || "本系统保存的学校会话已失效，请重新登录学校账号后继续使用。"
    };
  }
  return null;
}

function renderSchoolAuthNotice(problem) {
  const current = nodes.status?.querySelector(".notice");
  if (!problem) {
    if (current?.classList.contains("school-auth-required")) nodes.status.innerHTML = "";
    return;
  }
  if (problem.type === "error" && current && !current.classList.contains("school-auth-required")) return;
  nodes.status.innerHTML = `
    <div class="notice school-auth-required ${escapeHtml(problem.type)}">
      <span class="school-auth-dot" aria-hidden="true"></span>
      <span class="school-auth-copy">
        <strong>${escapeHtml(problem.title)}</strong>
        <span>${escapeHtml(problem.message)}</span>
      </span>
    </div>
  `;
}

function renderAuth(error) {
  const auth = state.auth || {};
  const authProblem = schoolAuthProblem(auth);
  const casStatus = auth.sessions?.cas?.status;
  const portalStatus = auth.sessions?.portal?.status;
  const portalNeedsLogin = portalStatus === "expired" || portalStatus === "error";
  const shouldShowLogin = !auth.hasCookie
    || Boolean(authProblem)
    || auth.needsLogin
    || casStatus === "expired"
    || casStatus === "error"
    || portalNeedsLogin;
  nodes.authPanel.dataset.connected = auth.hasCookie ? (shouldShowLogin ? "relogin" : "true") : "false";
  nodes.loginForm.hidden = !shouldShowLogin;
  nodes.loginButton.textContent = auth.hasCookie && shouldShowLogin ? "重新登录并保存会话" : "登录并保存会话";
  nodes.logoutButton.hidden = !auth.hasCookie || auth.source === "env";

  if (error) {
    nodes.authStatusText.textContent = "会话状态检查失败";
    renderSchoolAuthNotice({
      type: "error",
      title: "学校会话检查失败",
      message: "暂时无法确认学校账号状态，请稍后刷新或重新登录学校账号。"
    });
    renderOverview();
    return;
  }
  renderSchoolAuthNotice(authProblem);
  if (!auth.hasCookie) {
    nodes.authStatusText.innerHTML = `
      <span class="auth-login-hint calm">还没有绑定学号/工号。登录统一身份认证后，系统会保存学校账号并同步课表、一卡通、能耗等数据。</span>
    `;
    renderOverview();
    return;
  }

  const source = auth.source === "env" ? "环境变量" : "已保存会话";
  const name = auth.schoolAccount ? `学号/工号 ${auth.schoolAccount}` : "学号未确认";
  const loginMessage = authProblem?.message || (auth.needsLogin
    ? (auth.loginRequiredMessage || "统一身份认证会话已过期，请在本页面重新登录学校账号。")
    : (portalNeedsLogin ? (auth.sessions?.portal?.lastError || "用户中心会话未连接，请在本系统重新登录学校账号后同步身份卡。") : ""));
  const loginHint = loginMessage
    ? `<span class="auth-login-hint">${escapeHtml(loginMessage)} 请在本系统重新登录，学校网页里的登录状态不会自动同步到这里。</span>`
    : "";
  nodes.authStatusText.innerHTML = `
    <span class="auth-status-lede ${authProblem ? "needs-login" : ""}">${escapeHtml(authProblem ? "需要处理" : source)}，${escapeHtml(name)}</span>
    ${loginHint}
    <span class="auth-session-grid">${authSessionEntries(auth).map(authSessionChip).join("")}</span>
  `;
  renderOverview();
}

function overviewGpaValue(gpa, label) {
  const rows = Array.isArray(gpa?.rows) ? gpa.rows : [];
  const row = rows.find((item) => item.type === label);
  return row?.value || "--";
}

function renderOverview() {
  const timetable = state.timetable || {};
  const gpa = state.academicGpa || {};
  const freeRooms = state.freeRooms || {};
  const campus = state.campus || {};
  const summary = state.summary || {};
  const courses = Array.isArray(timetable.courses) ? timetable.courses : [];
  const freeStats = freeRooms.stats || {};
  const campusCard = campus.card || {};
  const wallets = Array.isArray(campusCard.wallet?.list) ? campusCard.wallet.list : [];
  const cardDeals = flattenCardDeals(campusCard.bill?.list);
  const water = campus.water || {};
  const waterCodeData = water.waterCode?.data || {};
  const waterRows = Array.isArray(water.waterBill?.data) ? water.waterBill.data : [];
  const waterTotal = waterRows.reduce((sum, row) => sum + Number(row.monDeal || 0), 0);
  const accommodation = campus.accommodation || {};
  const accommodationProfile = accommodation.profile || {};
  const roomies = Array.isArray(accommodation.roomies) ? accommodation.roomies : [];
  const courseCount = timetable.stats?.courses;
  const sessionCount = timetable.stats?.arrangedSessions ?? courses.length;
  const freeRoomCount = freeStats.rooms;
  const freeSeatCount = freeStats.seats;
  const cardBalance = campusCard.totalBalance;
  const waterCode = waterCodeData.ranCode;
  const dormitoryInfo = accommodationProfile.dormitoryInfo;
  const compactDormitoryInfo = compactDormitory(dormitoryInfo);
  const identityProfile = state.identity?.profile || {};
  const wallet = summary.wallet || {};
  const account = wallet.account || {};
  const energyView = wallet.view || summary.meters?.view || {};
  const meters = Array.isArray(summary.meters?.meters) ? summary.meters.meters : [];
  const onlineMeterCount = meters.filter((meter) => String(meter.live?.status) === "1").length;
  const billGroups = normalizeBill(summary.bill);
  const energyBalance = account.remainingSum;
  const monthKwh = firstMatchingValue(billGroups, ["本月总用电量", "免费配额已用电量"], "").replace("千瓦时", "").trim();
  const overFee = firstMatchingValue(billGroups, ["超额用电电费", "本月空调电费"], "").replace("元", "").trim();
  const auth = state.auth || {};
  const authProblem = schoolAuthProblem(auth);
  const authReady = Boolean(auth.hasCookie && !authProblem);
  const authEntries = authSessionEntries(auth);
  const usableServices = authEntries.filter((entry) => {
    const status = entry.data?.status;
    return entry.data?.connected && status !== "expired" && status !== "error";
  }).length;

  const syncTime = state.lastSyncedAt ? formatSyncTime(state.lastSyncedAt) : "";
  const syncParts = syncTime ? syncTime.split(" ") : [];
  const syncDay = syncParts[0] || "";
  const syncClock = syncParts[1] || syncTime;
  const compactAuthName = compactDormitory(auth.schoolAccount || "");
  const compactEnergyRoom = compactDormitory(account.roomName || energyView.roomName || energyView.ownerName || "");

  nodes.overviewStudyText.textContent = courseCount
    ? `${courseCount} 门课程`
    : "--";
  nodes.overviewStudyMeta.textContent = [
    timetable.currentCalendarText,
    freeRoomCount ? `空教室 ${freeRoomCount} 间` : ""
  ].filter(Boolean).join(" · ") || "课表与空教室";
  nodes.overviewCourseDetail.textContent = courseCount || sessionCount
    ? `${sessionCount || "--"} 节安排`
    : "--";
  nodes.overviewRoomDetail.textContent = freeRoomCount
    ? `${freeRoomCount} 间${freeSeatCount ? ` · ${freeSeatCount} 座` : ""}`
    : "--";
  nodes.overviewTermDetail.textContent = timetable.termText || timetable.currentCalendarText || "--";

  const primaryGpa = gpa.main?.value || overviewGpaValue(gpa, "GPA");
  nodes.overviewGpaText.textContent = primaryGpa && primaryGpa !== "--" ? primaryGpa : "--";
  nodes.overviewGpaMeta.textContent = gpa.error
    ? gpa.error
    : (Array.isArray(gpa.rows) && gpa.rows.length
      ? `${gpa.stats?.available ?? gpa.rows.filter((row) => row.value).length}/${gpa.stats?.total ?? gpa.rows.length} 项已同步`
      : "教务系统 GPA");
  nodes.overviewCoreGpaDetail.textContent = overviewGpaValue(gpa, "核心课GPA");
  nodes.overviewRequiredGpaDetail.textContent = overviewGpaValue(gpa, "必修课GPA");
  nodes.overviewDegreeGpaDetail.textContent = overviewGpaValue(gpa, "学位课GPA");

  nodes.overviewCampusText.textContent = cardBalance !== undefined && cardBalance !== null
    ? money(cardBalance)
    : "--";
  nodes.overviewCampusMeta.textContent = dormitoryInfo && dormitoryInfo !== "--"
    ? `住宿 ${compactDormitoryInfo || dormitoryInfo}`
    : (waterCode ? `用水码 ${waterCode}` : "一卡通、用水与住宿");

  if ((!dormitoryInfo || dormitoryInfo === "--") && !waterCode && (identityProfile.orgName || identityProfile.categoryName)) {
    nodes.overviewCampusMeta.textContent = identityProfile.orgName || identityProfile.categoryName;
  }
  nodes.overviewDormDetail.textContent = dormitoryInfo && dormitoryInfo !== "--"
    ? `${compactDormitoryInfo || dormitoryInfo}${roomies.length ? ` · ${roomies.length} 人` : ""}`
    : "--";
  nodes.overviewWaterDetail.textContent = waterCode
    ? `${waterCode}${waterRows.length ? ` · ${numberText(waterTotal)} 吨` : ""}`
    : (water.waterCode?.error || "--");
  nodes.overviewCardDetail.textContent = wallets.length || cardDeals.length
    ? `${wallets.length || "--"} 个钱包 · ${cardDeals.length || 0} 条记录`
    : "--";

  nodes.overviewEnergyText.textContent = energyBalance !== undefined && energyBalance !== null
    ? money(energyBalance)
    : "--";
  nodes.overviewEnergyMeta.textContent = monthKwh ? `${state.month} 用电 ${monthKwh}` : `${state.month} 能耗`;
  nodes.overviewEnergyRoomDetail.textContent = compactEnergyRoom || account.roomName || energyView.roomName || energyView.ownerName || "--";
  nodes.overviewMeterDetail.textContent = meters.length
    ? `${onlineMeterCount}/${meters.length} 在线`
    : "--";
  nodes.overviewMonthDetail.textContent = [
    monthKwh ? `${monthKwh} 千瓦时` : "",
    overFee ? `${overFee} 元超额` : ""
  ].filter(Boolean).join(" · ") || "--";

  nodes.overviewSyncText.textContent = state.lastSyncedAt && authReady ? syncClock : (authReady ? "已连接" : "--");
  nodes.overviewSyncMeta.textContent = state.lastSyncedAt && authReady ? `${syncDay} 已同步` : (authProblem?.title || "等待登录");
  nodes.overviewAuthDetail.textContent = authReady
    ? (compactAuthName || auth.schoolAccount || "学号/工号")
    : (authProblem?.type === "expired" ? "登录已过期" : "未连接");
  nodes.overviewServiceDetail.textContent = authReady
    ? `${usableServices}/${authEntries.length} 项可用`
    : "--";
  nodes.overviewSyncDetail.textContent = state.lastSyncedAt && authReady ? syncTime : "--";
}

function markSynced() {
  state.lastSyncedAt = new Date().toISOString();
}

function renderLoading() {
  nodes.refreshButton.disabled = true;
  nodes.refreshButton.textContent = "同步中";
  nodes.status.innerHTML = "";
}

function renderError(error) {
  const hint = error.status === 401
    ? "请在上方连接学校账号。若已登录，可能是学校会话过期，请重新登录。"
    : "学校接口暂时没有返回可用数据，请稍后重试。";
  setNotice(`${escapeHtml(error.message)}<br>${escapeHtml(hint)}`, "error", true);
}

function renderEnergy() {
  const summary = state.summary || {};
  const wallet = summary.wallet || {};
  const view = wallet.view || summary.meters?.view || {};
  const account = wallet.account || {};
  const billGroups = normalizeBill(summary.bill);
  const meters = Array.isArray(summary.meters?.meters) ? summary.meters.meters : [];
  const packages = Array.isArray(wallet.packages) ? wallet.packages : [];

  nodes.accountText.textContent = account.account || view.account || "--";
  nodes.ownerText.textContent = account.ownerName || view.ownerName || "--";
  nodes.stateText.textContent = account.inuse === false ? "已销户" : "正常";

  nodes.balanceText.textContent = money(account.remainingSum);
  nodes.balanceRemark.textContent = balanceRemark(account.remarkFlag);

  nodes.billMonthText.textContent = summary.time || state.month;
  nodes.monthKwhText.textContent = firstMatchingValue(billGroups, ["本月总用电量", "免费配额已用电量"], "--").replace("千瓦时", "").trim();
  nodes.overFeeText.textContent = firstMatchingValue(billGroups, ["超额用电电费", "本月空调电费"], "--").replace("元", "").trim();

  const onlineCount = meters.filter((meter) => String(meter.live?.status) === "1").length;
  nodes.meterOnlineText.textContent = meters.length ? String(onlineCount) : "--";
  nodes.meterTotalText.textContent = meters.length ? `共 ${meters.length} 块` : "--";

  renderBills(billGroups);
  renderMeters(meters, summary.meters?.catCode || []);
  renderPackages(packages);
  renderOverview();
}

function cancelIdentityCodeRefresh() {
  window.clearTimeout(identityCodeRefreshTimer);
  identityCodeRefreshTimer = null;
}

function scheduleIdentityCodeRefresh(code = {}) {
  cancelIdentityCodeRefresh();
  if (document.hidden) return;
  if (!code.expiresAt || code.error) return;
  const expiresAt = Date.parse(code.expiresAt);
  if (Number.isNaN(expiresAt)) return;
  const delay = Math.max(1000, expiresAt - Date.now() - 1500);
  identityCodeRefreshTimer = window.setTimeout(() => {
    if (!canUseApp() || !state.identity) return;
    refreshIdentityCode({ silent: true });
  }, Math.min(delay, 5 * 60 * 1000));
}

function identityFactRows(profile = {}) {
  return [
    ["所在院系", profile.orgName],
    ["身份类别", profile.categoryName],
    ["当前状态", profile.statusName],
    ["入学年份", profile.enterGrade],
    ["访问校区", profile.campus],
    ["联系方式", profile.mobile]
  ].filter(([, value]) => value);
}

function renderIdentityCard() {
  const identity = state.identity;
  const profile = identity?.profile || {};
  const code = identity?.code || {};
  const isBarcode = state.identityCodeMode === "barcode";

  nodes.identityQrButton.classList.toggle("active", !isBarcode);
  nodes.identityBarcodeButton.classList.toggle("active", isBarcode);
  nodes.identityCodeModeTitle.textContent = isBarcode ? "条形码" : "二维码";

  if (!identity) {
    clearIdentity();
    return;
  }

  if (identity.error) {
    nodes.identityNameText.textContent = "--";
    nodes.identityCodeText.textContent = "同步失败";
    nodes.identityStatusText.textContent = identity.status === 401 ? "需要重新登录学校账号" : "用户中心不可用";
    nodes.identityFacts.innerHTML = empty(identity.error);
    nodes.identityAvatar.hidden = true;
    nodes.identityCodeImage.hidden = true;
    nodes.identityCodeImage.removeAttribute("src");
    nodes.identityCodeEmpty.hidden = false;
    nodes.identityCodeEmpty.textContent = identity.status === 401 ? "请重新登录学校账号后同步" : identity.error;
    nodes.identityCodeMeta.textContent = "动态码不会保存到磁盘";
    cancelIdentityCodeRefresh();
    return;
  }

  nodes.identityNameText.textContent = profile.name || "--";
  nodes.identityCodeText.textContent = profile.code ? `账号 ${profile.code}` : "账号 --";
  nodes.identityStatusText.textContent = identity.fetchedAt ? `同步于 ${formatSyncTime(identity.fetchedAt)}` : "用户中心已连接";

  if (profile.photoUrl) {
    nodes.identityAvatar.hidden = false;
    nodes.identityAvatar.src = profile.photoUrl;
  } else {
    nodes.identityAvatar.hidden = true;
    nodes.identityAvatar.removeAttribute("src");
  }

  const facts = identityFactRows(profile);
  nodes.identityFacts.innerHTML = facts.length ? facts.map(([label, value]) => `
    <div class="${label === "联系方式" ? "identity-fact-wide" : ""}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("") : empty("学校用户中心暂未返回更多身份信息");

  const image = isBarcode ? code.barcodeImage : code.qrImage;
  if (code.error || !image) {
    nodes.identityCodeImage.hidden = true;
    nodes.identityCodeImage.removeAttribute("src");
    nodes.identityCodeEmpty.hidden = false;
    nodes.identityCodeEmpty.textContent = code.error || "暂未获取个人身份码";
    nodes.identityCodeMeta.textContent = code.error ? "可尝试刷新个人码" : "动态码不会保存到磁盘";
    cancelIdentityCodeRefresh();
    return;
  }

  nodes.identityCodeImage.hidden = false;
  nodes.identityCodeImage.src = image;
  nodes.identityCodeImage.alt = isBarcode ? "个人身份条形码" : "个人身份二维码";
  nodes.identityCodeEmpty.hidden = true;
  const expiresAt = code.expiresAt ? new Date(code.expiresAt) : null;
  const expiresText = expiresAt && !Number.isNaN(expiresAt.getTime())
    ? `有效至 ${expiresAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "短时动态码";
  nodes.identityCodeMeta.textContent = `${expiresText}，动态码不会保存到磁盘`;
  scheduleIdentityCodeRefresh(code);
}

function clearIdentityFace() {
  nodes.identityFacePhoto.hidden = true;
  nodes.identityFacePhoto.removeAttribute("src");
  nodes.identityFaceEmpty.hidden = false;
  nodes.identityFaceEmpty.textContent = "点击同步人脸状态后显示";
  nodes.identityFaceStatusText.textContent = "--";
  nodes.identityFaceStatusText.dataset.tone = "idle";
  nodes.identityFaceModeText.textContent = "学校默认模式";
  nodes.identityFaceSyncText.textContent = "--";
  nodes.identityFaceNotice.textContent = "本系统只读取学校返回的状态和照片预览，不会保存人脸照片；采集、上传和协议确认请在学校官方页面完成。";
}

function renderIdentityFace() {
  const face = state.face;
  if (!face) {
    clearIdentityFace();
    return;
  }

  if (face.error) {
    nodes.identityFacePhoto.hidden = true;
    nodes.identityFacePhoto.removeAttribute("src");
    nodes.identityFaceEmpty.hidden = false;
    nodes.identityFaceEmpty.textContent = face.status === 401
      ? "请重新登录学校账号后再同步"
      : face.error;
    nodes.identityFaceStatusText.textContent = face.status === 401 ? "需要重新登录" : "同步失败";
    nodes.identityFaceStatusText.dataset.tone = "bad";
    nodes.identityFaceModeText.textContent = "--";
    nodes.identityFaceSyncText.textContent = "--";
    nodes.identityFaceNotice.textContent = face.error;
    return;
  }

  nodes.identityFaceStatusText.textContent = face.statusText || (face.collected ? "已采集" : "未采集");
  nodes.identityFaceStatusText.dataset.tone = face.collected ? "ok" : "warn";
  nodes.identityFaceModeText.textContent = face.config?.modeText || "学校默认模式";
  nodes.identityFaceSyncText.textContent = face.fetchedAt ? formatSyncTime(face.fetchedAt) : "--";
  nodes.identityFaceNotice.textContent = `${face.message || "人脸信息已从学校用户中心读取。"} 照片预览只保留在当前页面，不会写入磁盘。`;

  if (face.photoUrl) {
    nodes.identityFacePhoto.hidden = false;
    nodes.identityFacePhoto.src = face.photoUrl;
    nodes.identityFaceEmpty.hidden = true;
  } else {
    nodes.identityFacePhoto.hidden = true;
    nodes.identityFacePhoto.removeAttribute("src");
    nodes.identityFaceEmpty.hidden = false;
    nodes.identityFaceEmpty.textContent = face.collected ? "学校未返回照片预览" : "暂无人脸照片";
  }
}

function renderCampus() {
  const campus = state.campus || {};
  nodes.campusSyncText.textContent = campus.billLabel || campus.time || campusLabel();
  renderIdentityCard();
  renderIdentityFace();
  renderCampusCard(campus.card || {});
  renderCampusWater(campus.water || {});
  renderCampusAccommodation(campus.accommodation || {});
  renderOverview();
}

function renderCampusCard(card) {
  if (card.error) {
    nodes.cardBalanceText.textContent = "--";
    nodes.cardBalanceRemark.textContent = card.error;
    nodes.cardWalletCountText.textContent = "--";
    nodes.cardBillList.dataset.scrollable = "false";
    nodes.cardBillList.innerHTML = empty(card.error);
    return;
  }

  const wallets = Array.isArray(card.wallet?.list) ? card.wallet.list : [];
  nodes.cardBalanceText.textContent = money(card.totalBalance);
  nodes.cardBalanceRemark.textContent = card.account?.accName || "已同步";
  nodes.cardWalletCountText.textContent = wallets.length ? String(wallets.length) : "--";

  const deals = flattenCardDeals(card.bill?.list);
  nodes.cardBillMonthText.textContent = deals.length
    ? `${card.billQuery?.label || campusLabel()} · ${deals.length} 条`
    : (card.billQuery?.label || campusLabel());
  nodes.cardBillList.innerHTML = deals.length ? deals.map((item) => `
    <article class="bill-card">
      <div class="bill-row">
        <span>${escapeHtml(item.title)}</span>
        <strong>${escapeHtml(money(item.amount))}</strong>
      </div>
      <div class="bill-row">
        <span>${escapeHtml(item.time || "--")}</span>
        <strong>${escapeHtml(item.wallet || item.place || "--")}</strong>
      </div>
    </article>
  `).join("") : empty("暂无一卡通账单");
  nodes.cardBillList.dataset.scrollable = deals.length > 5 ? "true" : "false";
  nodes.cardBillList.scrollTop = 0;
}

function renderCampusWater(water) {
  if (water.error) {
    nodes.waterCodeText.textContent = "--";
    nodes.waterCodeRemark.textContent = water.error;
    nodes.waterCodeRefreshButton.disabled = true;
    nodes.waterAmountText.textContent = "--";
    nodes.waterBillList.dataset.scrollable = "false";
    nodes.waterBillList.innerHTML = empty(water.error);
    return;
  }

  nodes.waterCodeRefreshButton.disabled = false;
  const codeData = water.waterCode?.data || {};
  nodes.waterCodeText.textContent = codeData.ranCode || "--";
  nodes.waterCodeRemark.textContent = codeData.ranCode
    ? `可用 ${formatValue(codeData.ranGetTimes ?? codeData.ranValidTimes)} 次`
    : (water.waterCode?.error || "未获取");

  const waterRows = Array.isArray(water.waterBill?.data) ? water.waterBill.data : [];
  const total = waterRows.reduce((sum, row) => sum + Number(row.monDeal || 0), 0);
  nodes.waterAmountText.textContent = waterRows.length ? numberText(total) : "--";
  nodes.waterBillMonthText.textContent = waterRows.length
    ? `${water.billQuery?.label || (state.campusMode === "month" ? state.campusMonth : currentMonth())} · ${waterRows.length} 条`
    : (water.billQuery?.label || (state.campusMode === "month" ? state.campusMonth : currentMonth()));
  nodes.waterBillList.innerHTML = waterRows.length ? waterRows.map((item) => `
    <article class="bill-card">
      <div class="bill-row">
        <span>${escapeHtml(item.deviceName || item.payTypeName || "生活用水")}</span>
        <strong>${escapeHtml(money(item.monDeal))}</strong>
      </div>
      <div class="bill-row">
        <span>${escapeHtml(item.startTime || "--")}</span>
        <strong>${escapeHtml(item.waterCount ? `${item.waterCount} L` : item.address || "--")}</strong>
      </div>
    </article>
  `).join("") : empty(water.waterBill?.error || "暂无生活用水账单");
  nodes.waterBillList.dataset.scrollable = waterRows.length > 5 ? "true" : "false";
  nodes.waterBillList.scrollTop = 0;
}

function renderCampusAccommodation(accommodation) {
  if (accommodation.error) {
    setSyncStatus(nodes.accommodationSyncText, "未同步");
    nodes.accommodationPlaceText.textContent = "--";
    nodes.accommodationClassText.textContent = accommodation.error;
    nodes.accommodationStudentText.textContent = "--";
    nodes.accommodationNameText.textContent = "--";
    nodes.accommodationStatusText.textContent = "--";
    nodes.accommodationDateText.textContent = "--";
    nodes.accommodationFeeText.textContent = "--";
    nodes.accommodationDeviceText.textContent = "--";
    nodes.roommateCountText.textContent = "--";
    nodes.roommateList.innerHTML = empty(accommodation.error);
    return;
  }

  const profile = accommodation.profile || {};
  const roomies = Array.isArray(accommodation.roomies) ? accommodation.roomies : [];
  const device = accommodation.device || {};
  const accommodationSyncLabel = accommodation.capturedAt ? `已同步 ${formatSyncTime(accommodation.capturedAt)}` : "--";
  setSyncStatus(nodes.accommodationSyncText, accommodationSyncLabel, Boolean(accommodation.capturedAt));
  nodes.accommodationPlaceText.textContent = profile.dormitoryInfo || "--";
  nodes.accommodationClassText.textContent = profile.collegeInfo || "--";
  nodes.accommodationStudentText.textContent = profile.studentNo || accommodation.account?.username || "--";
  nodes.accommodationNameText.textContent = profile.name || accommodation.account?.realName || "--";
  nodes.accommodationStatusText.textContent = profile.accommodationStatus || "--";
  nodes.accommodationDateText.textContent = profile.accommodationDate || "--";
  nodes.accommodationFeeText.textContent = profile.fees && profile.fees !== "--" ? `${profile.fees} 元` : "--";
  nodes.accommodationDeviceText.textContent = device.number || device.deviceNo || (accommodation.deviceError ? "--" : "暂无绑定");
  nodes.roommateCountText.textContent = roomies.length ? `${roomies.length} 人` : "--";
  nodes.roommateList.innerHTML = roomies.length ? roomies.map((item) => `
    <article class="roommate-card">
      <strong>${escapeHtml(item.personname || item.name || "同寝成员")}</strong>
      <span>${escapeHtml(item.bedName || item.bedCode || "--")}</span>
      <small>${escapeHtml(item.department || item.personsn || "")}</small>
    </article>
  `).join("") : empty(accommodation.roomiesError || "暂无宿友信息");
}

function renderTimetable() {
  const timetable = state.timetable || {};
  const courses = Array.isArray(timetable.courses) ? timetable.courses : [];
  const filteredCourses = filterTimetableCourses(courses);
  const stats = timetable.stats || {};
  const sourceLabel = timetable.sourceLabel || (state.timetableSource === "selection" ? "选课结果" : "本学期课表");

  renderTimetableFilters(timetable, courses);
  nodes.timetableHeadingText.textContent = sourceLabel;
  nodes.timetableSourceSelect.value = timetable.sourceKey || state.timetableSource;
  syncEnhancedControls(nodes.timetableSourceSelect, nodes.timetableWeekSelect, nodes.timetableDaySelect);
  const timetableSyncLabel = timetable.live === false
    ? `缓存 ${formatSyncTime(timetable.generatedAt)}`
    : (timetable.generatedAt ? `已同步 ${formatSyncTime(timetable.generatedAt)}` : "--");
  setSyncStatus(nodes.timetableSyncText, timetableSyncLabel, Boolean(timetable.generatedAt && timetable.live !== false));
  nodes.courseCountText.textContent = stats.courses ?? "--";
  nodes.sessionCountText.textContent = (stats.arrangedSessions ?? courses.length) || "--";
  nodes.locationCountText.textContent = stats.locations ?? "--";
  const currentWeek = currentWeekFromText(timetable.currentCalendarText || timetable.termText);
  nodes.academicCalendarText.textContent = currentWeek ? `第${currentWeek}周` : (timetable.currentCalendarText || "--");
  nodes.timetableTermText.textContent = timetable.live === false && timetable.staleReason
    ? `${timetable.termText || sourceLabel} · 实时同步失败`
    : (timetable.termText || sourceLabel);
  nodes.courseListText.textContent = filteredCourses.length ? `${filteredCourses.length} 条安排` : "--";
  nodes.timetableSummary.innerHTML = timetableSummaryHtml(timetable, filteredCourses, courses);
  nodes.timetableGrid.innerHTML = filteredCourses.length ? timetableGridHtml(timetable, filteredCourses) : empty("当前筛选下暂无课程安排");
  requestAnimationFrame(scrollTimetableToActiveDay);
  nodes.courseList.innerHTML = filteredCourses.length ? courseListHtml(filteredCourses) : empty("当前筛选下暂无课程清单");
  renderOverview();
}

function renderFreeRooms() {
  const data = state.freeRooms || {};
  const buildings = Array.isArray(data.buildings) ? data.buildings : [];
  const stats = data.stats || {};
  const label = [
    data.dayLabel,
    data.date,
    data.weekday,
    data.building?.name
  ].filter(Boolean).join(" · ");

  nodes.freeRoomSyncText.textContent = data.generatedAt
    ? `${label || "新校区"} · ${formatSyncTime(data.generatedAt)}`
    : (label || "--");
  nodes.freeRoomBuildingCountText.textContent = stats.buildings ?? buildings.length ?? "--";
  nodes.freeRoomCountText.textContent = stats.rooms ?? buildings.reduce((sum, building) => sum + (building.roomCount || 0), 0) ?? "--";
  nodes.freeSeatCountText.textContent = stats.seats ?? buildings.reduce((sum, building) => sum + (building.seats || 0), 0) ?? "--";
  nodes.freeSectionText.textContent = freeSectionRangeText(data.sections || state.freeSections, data.sectionTimes);
  nodes.freeRoomList.innerHTML = buildings.length ? freeRoomListHtml(buildings) : empty("当前条件下暂无空闲教室");
  renderOverview();
}

function freeRoomListHtml(buildings) {
  return buildings.map((building) => {
    const rooms = Array.isArray(building.rooms) ? building.rooms : [];
    return `
      <article class="free-building-card">
        <div class="free-building-head">
          <div>
            <strong>${escapeHtml(building.name || building.number || "教学楼")}</strong>
            <span>${escapeHtml(building.number ? `编号 ${building.number}` : "新校区")}</span>
          </div>
          <div>
            <strong>${escapeHtml(building.roomCount ?? rooms.length)}</strong>
            <span>${escapeHtml(building.seats ? `${building.seats} 座` : "座位数待同步")}</span>
          </div>
        </div>
        <div class="free-room-chip-list">
          ${rooms.map((room) => `
            <span class="free-room-chip">
              <strong>${escapeHtml(room.room || "--")}</strong>
              <em>${escapeHtml([room.floor, room.seats ? `${room.seats}座` : ""].filter(Boolean).join(" · ") || "可用")}</em>
            </span>
          `).join("")}
        </div>
      </article>
    `;
  }).join("");
}

function timetableGridHtml(timetable, displayCourses = null) {
  const days = Array.isArray(timetable.days) && timetable.days.length
    ? timetable.days
    : ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"].map((name, index) => ({ day: index + 1, name }));
  const courses = Array.isArray(displayCourses) ? displayCourses : (timetable.courses || []);
  const todayDay = dayNumberFromDate(new Date());
  const currentWeek = currentWeekFromText(timetable.currentCalendarText || timetable.termText);
  const visibleDays = state.timetableDay === "all"
    ? days
    : days.filter((day) => Number(day.day) === Number(state.timetableDay));
  const grouped = new Map(days.map((day) => [Number(day.day), []]));
  for (const course of courses) {
    const day = Number(course.day);
    if (grouped.has(day)) grouped.get(day).push(course);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => courseStartMinutes(a) - courseStartMinutes(b) || courseEndSection(a) - courseEndSection(b) || a.courseName.localeCompare(b.courseName, "zh-CN"));
  }
  const isSmartWeekVisible = state.timetableWeek === "all" || Number(state.timetableWeek) === currentWeek;
  const todayCourses = isSmartWeekVisible
    ? activeCoursesForCurrentWeek(grouped.get(todayDay) || [], currentWeek)
    : [];
  const currentCourse = todayCourses.find((course) => courseTemporalState(course) === "current");
  const nextCourse = currentCourse ? null : todayCourses.find((course) => courseTemporalState(course) === "next");

  return `
    <nav class="timetable-day-nav" aria-label="按星期浏览课表">
      ${visibleDays.map((day) => {
        const dayNo = Number(day.day);
        const list = grouped.get(dayNo) || [];
        const isToday = todayDay === dayNo;
        return `
          <button type="button" class="${isToday ? "today active" : ""}" data-scroll-day="${dayNo}" aria-label="查看${escapeHtml(shortDayName(day.name, dayNo))}课程" ${isToday ? `aria-current="date"` : ""}>
            <span>${escapeHtml(shortDayName(day.name, dayNo))}</span>
            <strong>${escapeHtml(weekdayDateLabel(dayNo))}</strong>
            <em>${list.length}</em>
          </button>
        `;
      }).join("")}
    </nav>
    <div class="semester-board day-count-${Math.max(1, Math.min(7, visibleDays.length || 1))}">
      ${visibleDays.map((day) => {
        const dayNo = Number(day.day);
        const list = grouped.get(dayNo) || [];
        const selected = state.timetableDay !== "all" && Number(state.timetableDay) === dayNo;
        const isToday = todayDay === dayNo;
        return `
          <section class="day-column ${isToday ? "today" : ""} ${selected ? "selected" : ""}" data-day="${dayNo}">
            <div class="day-column-head">
              <div>
                <strong>${escapeHtml(shortDayName(day.name, dayNo))}</strong>
                <span>${isToday ? `今天 · ${weekdayDateLabel(dayNo)}` : weekdayDateLabel(dayNo)}</span>
              </div>
              <em>${list.length ? `${list.length} 节` : "空"}</em>
            </div>
            <div class="day-course-list">
              ${list.length ? list.map((course) => semesterCourseCardHtml(course, {
                isCurrent: course === currentCourse,
                isNext: course === nextCourse
              })).join("") : empty("这一天没有课程")}
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function scrollTimetableToActiveDay() {
  if (!nodes.timetableGrid || state.timetableDay !== "all") return;
  const today = dayNumberFromDate(new Date());
  const column = nodes.timetableGrid.querySelector(`.day-column[data-day="${today}"]`);
  if (!column) return;
  const wrapRect = nodes.timetableGrid.getBoundingClientRect();
  const columnRect = column.getBoundingClientRect();
  const targetLeft = nodes.timetableGrid.scrollLeft + columnRect.left - wrapRect.left - 8;
  nodes.timetableGrid.scrollTo({ left: Math.max(0, targetLeft), behavior: "auto" });
}

function semesterCourseCardHtml(course, options = {}) {
  const [startTime, endTime] = splitTimeRange(course.timeRange);
  const location = course.location?.display || "--";
  const teacher = course.teacher || "教师待同步";
  const smartClass = options.isCurrent ? "current-course" : (options.isNext ? "next-course" : "");
  return `
    <article class="semester-course tone-${course.tone} ${smartClass}" tabindex="0">
      <div class="course-time-rail">
        <strong>${escapeHtml(startTime || "--")}</strong>
        <span>${escapeHtml(endTime || course.sectionText || "--")}</span>
      </div>
      <div class="semester-course-body">
      <div class="semester-course-main">
        <strong>${escapeHtml(course.courseName)}</strong>
        ${options.isCurrent ? `<em class="next-badge current">进行中</em>` : (options.isNext ? `<em class="next-badge">下一节</em>` : "")}
      </div>
      <div class="course-meta-line">
        <span class="course-location">${escapeHtml(location)}</span>
        <span class="course-teacher">${escapeHtml(teacher)}</span>
      </div>
      <div class="course-facts">
        <span>${escapeHtml(course.weekText || "--")}</span>
        <span>${escapeHtml(course.sectionText || "--")}</span>
      </div>
      <details class="course-more">
        <summary>查看详情</summary>
        <dl>
          <div><dt>课程属性</dt><dd>${escapeHtml([course.courseProperty, course.category].filter(Boolean).join(" / ") || "--")}</dd></div>
          <div><dt>考核方式</dt><dd>${escapeHtml(course.examType || "--")}</dd></div>
          <div><dt>学分</dt><dd>${escapeHtml(course.credits || "--")}</dd></div>
          <div><dt>选课状态</dt><dd>${escapeHtml(course.status || "--")}</dd></div>
        </dl>
      </details>
      </div>
    </article>
  `;
}

function timetableSummaryHtml(timetable, filteredCourses, allCourses) {
  const todayDay = dayNumberFromDate(new Date());
  const sourceLabel = timetable.sourceLabel || (state.timetableSource === "selection" ? "选课结果" : "本学期课表");
  const currentWeek = currentWeekFromText(timetable.currentCalendarText || timetable.termText);
  const todayCourses = activeCoursesForCurrentWeek(allCourses
    .filter((course) => Number(course.day) === todayDay)
    .sort((a, b) => courseStartMinutes(a) - courseStartMinutes(b)), currentWeek);
  const currentCourse = todayCourses.find((course) => courseTemporalState(course) === "current");
  const nextCourse = todayCourses.find((course) => courseTemporalState(course) === "next");
  const focusCourse = currentCourse || nextCourse;
  const focusState = currentCourse ? "current" : (nextCourse ? "next" : "clear");
  const focusLabel = currentCourse ? "正在上课" : (nextCourse ? "下一节课" : (todayCourses.length ? "今日课程已完成" : "今天没有课"));
  const focusTitle = focusCourse?.courseName || (todayCourses.length ? "今天的课程已全部结束" : "给自己安排一段自由时间");
  const focusMeta = focusCourse
    ? [focusCourse.timeRange, focusCourse.location?.display, focusCourse.teacher].filter(Boolean).join(" · ")
    : (todayCourses.length ? "辛苦了，记得整理今天的学习内容" : "没有课程安排，也要保持好状态");
  const focusHint = smartCourseHint(focusCourse, focusState);
  const locationCount = new Set(filteredCourses.map((course) => course.location?.display).filter(Boolean)).size;
  const activeCourseNames = new Set(filteredCourses.map((course) => course.courseName));
  return `
    <div class="timetable-focus-card status-${focusState}">
      <div class="focus-status"><i></i>${escapeHtml(focusLabel)}</div>
      <strong>${escapeHtml(focusTitle)}</strong>
      <p>${escapeHtml(focusMeta)}</p>
      <small>${escapeHtml(focusHint)}</small>
    </div>
    <div class="timetable-summary-card">
      <span>今日节奏</span>
      <strong>${escapeHtml(todayCourses.length ? `${todayCourses.length} 条` : "暂无")}</strong>
      <small>${escapeHtml(todayCourses.length ? `${todayCourses[0].timeRange || "--"} 开始` : "轻松的一天")}</small>
    </div>
    <div class="timetable-summary-card">
      <span>当前视图</span>
      <strong>${escapeHtml(activeCourseNames.size || "--")}</strong>
      <small>${escapeHtml(`${filteredCourses.length} 条安排 · ${sourceLabel}`)}</small>
    </div>
    <div class="timetable-summary-card">
      <span>上课地点</span>
      <strong>${escapeHtml(locationCount || "--")}</strong>
      <small>${escapeHtml(allCourses.length ? "支持搜索快速定位" : "等待同步")}</small>
    </div>
  `;
}

function renderTimetableFilters(timetable, courses) {
  const maxWeek = maxWeekFromCourses(courses);
  const currentWeek = currentWeekFromText(timetable.currentCalendarText);
  nodes.timetableWeekSelect.innerHTML = [
    `<option value="all">全部学期</option>`,
    ...Array.from({ length: maxWeek }, (_, index) => {
      const week = index + 1;
      const label = currentWeek === week ? `第${week}周 · 当前周` : `第${week}周`;
      return `<option value="${week}">${label}</option>`;
    })
  ].join("");
  if (state.timetableWeek !== "all" && Number(state.timetableWeek) > maxWeek) state.timetableWeek = "all";
  nodes.timetableWeekSelect.value = state.timetableWeek;
  nodes.timetableDaySelect.value = state.timetableDay;
  if (nodes.courseSearchInput.value !== state.courseSearch) nodes.courseSearchInput.value = state.courseSearch;
  syncEnhancedControls(nodes.timetableWeekSelect, nodes.timetableDaySelect);
}

function filterTimetableCourses(courses) {
  return courses.filter((course) => {
    if (state.timetableWeek !== "all" && !courseActiveInWeek(course, Number(state.timetableWeek))) return false;
    if (state.timetableDay !== "all" && Number(course.day) !== Number(state.timetableDay)) return false;
    return courseMatchesSearch(course, state.courseSearch);
  });
}

function courseMatchesSearch(course, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    course.courseName,
    course.teacher,
    course.weekText,
    course.sectionText,
    course.timeRange,
    course.location?.display,
    course.courseProperty,
    course.category
  ].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(needle);
}

function courseActiveInWeek(course, week) {
  const text = String(course.weekText || "");
  if (!Number.isFinite(week) || week < 1) return true;
  const weeks = courseWeekSet(text);
  if (!weeks.size) return true;
  if (!weeks.has(week)) return false;
  if (/单/.test(text) && week % 2 === 0) return false;
  if (/双/.test(text) && week % 2 === 1) return false;
  return true;
}

function courseWeekSet(text) {
  const weeks = new Set();
  const source = String(text || "");
  const ranges = [...source.matchAll(/(\d+)\s*(?:-|~|—|至|到)\s*(\d+)/g)];
  for (const match of ranges) {
    const start = Number(match[1]);
    const end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    for (let week = Math.min(start, end); week <= Math.max(start, end); week += 1) weeks.add(week);
  }
  let singles = source;
  for (const match of ranges) singles = singles.replace(match[0], "");
  for (const match of singles.matchAll(/(\d+)\s*周/g)) {
    const week = Number(match[1]);
    if (Number.isFinite(week)) weeks.add(week);
  }
  return weeks;
}

function maxWeekFromCourses(courses) {
  let max = 20;
  for (const course of courses) {
    for (const week of courseWeekSet(course.weekText)) max = Math.max(max, week);
  }
  return Math.min(Math.max(max, 1), 30);
}

function currentWeekFromText(text) {
  const match = String(text || "").match(/第\s*(\d+)\s*周/);
  return match ? Number(match[1]) : null;
}

function courseStartMinutes(course) {
  const range = String(course.timeRange || "");
  const match = range.match(/(\d{1,2}):(\d{2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const section = defaultSectionTimes().find((item) => Number(item.section) === Number(course.startSection));
  return minutesFromTime(section?.start || "23:59");
}

function courseEndMinutes(course) {
  const [, endTime] = splitTimeRange(course.timeRange);
  if (endTime) return minutesFromTime(endTime);
  const section = defaultSectionTimes().find((item) => Number(item.section) === courseEndSection(course));
  return minutesFromTime(section?.end || section?.start || "23:59");
}

function courseTemporalState(course) {
  const now = currentMinutes();
  const start = courseStartMinutes(course);
  const end = courseEndMinutes(course);
  if (now >= start && now <= end) return "current";
  return now < start ? "next" : "past";
}

function activeCoursesForCurrentWeek(courses, currentWeek) {
  if (!currentWeek) return courses;
  return courses.filter((course) => courseActiveInWeek(course, currentWeek));
}

function smartCourseHint(course, status) {
  if (!course) return "课表已为你整理完毕";
  if (status === "current") {
    const remain = Math.max(0, courseEndMinutes(course) - currentMinutes());
    return remain ? `距离下课约 ${remain} 分钟` : "课程即将结束";
  }
  const wait = Math.max(0, courseStartMinutes(course) - currentMinutes());
  if (wait < 60) return `还有 ${wait} 分钟开始`;
  const hours = Math.floor(wait / 60);
  const minutes = wait % 60;
  return `还有 ${hours} 小时${minutes ? ` ${minutes} 分钟` : ""}开始`;
}

function courseEndSection(course) {
  return Number(course.endSection) || Number(course.startSection) || 1;
}

function currentMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function dayNumberFromDate(date) {
  return ((date.getDay() + 6) % 7) + 1;
}

function weekdayDateLabel(dayNo) {
  const date = new Date();
  const currentDay = dayNumberFromDate(date);
  date.setDate(date.getDate() + Number(dayNo) - currentDay);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function shortDayName(name, dayNo) {
  const fallback = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][Number(dayNo) - 1] || "周";
  const text = String(name || "").trim();
  return text ? text.replace("星期", "周").replace("礼拜", "周") : fallback;
}

function splitTimeRange(value) {
  const text = String(value || "");
  const match = text.match(/(\d{1,2}:\d{2})\s*(?:-|~|–|—|至)\s*(\d{1,2}:\d{2})/);
  if (match) return [match[1], match[2]];
  const single = text.match(/(\d{1,2}:\d{2})/);
  return single ? [single[1], ""] : ["", ""];
}

function courseListHtml(courses) {
  const groups = new Map();
  for (const course of courses) {
    const key = `${course.courseCode}|${course.sectionNo}|${course.courseName}`;
    if (!groups.has(key)) groups.set(key, { ...course, items: [] });
    groups.get(key).items.push(course);
  }

  return Array.from(groups.values()).map((group, index) => {
    const sessions = group.items
      .slice()
      .sort((a, b) => Number(a.day) - Number(b.day) || courseStartMinutes(a) - courseStartMinutes(b) || courseEndSection(a) - courseEndSection(b));
    const sessionCount = sessions.length;
    const primary = sessions[0] || group;
    const teacher = group.teacher || "教师待同步";
    const courseType = [group.courseProperty, group.category].filter(Boolean).join(" / ") || "课程";
    const facts = [
      group.credits ? `${group.credits} 学分` : "",
      group.examType,
      group.status
    ].filter(Boolean);

    return `
      <article class="course-list-card tone-${group.tone || ((index % 7) + 1)}">
        <div class="course-list-accent" aria-hidden="true">
          <span>${escapeHtml(shortDayName(primary.dayName, primary.day) || "课")}</span>
          <strong>${escapeHtml(primary.startSection ? `${primary.startSection}` : "--")}</strong>
        </div>
        <div class="course-list-content">
          <div class="course-list-title">
            <div>
              <span>${escapeHtml(courseType)}</span>
              <strong>${escapeHtml(group.courseName || "课程名称待同步")}</strong>
            </div>
            <em>${escapeHtml(sessionCount > 1 ? `${sessionCount} 次` : "1 次")}</em>
          </div>
          <div class="course-list-meta">
            <span>${escapeHtml(teacher)}</span>
            ${facts.map((fact) => `<span>${escapeHtml(fact)}</span>`).join("")}
          </div>
          <div class="course-session-list">
            ${sessions.map((item) => `
              <div>
                <strong>${escapeHtml(shortDayName(item.dayName, item.day) || item.dayName || "--")}</strong>
                <span>${escapeHtml([item.weekText, item.sectionText, item.timeRange].filter(Boolean).join(" · "))}</span>
                <em>${escapeHtml(item.location?.display || "--")}</em>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderTimetableError(error) {
  nodes.timetableHeadingText.textContent = state.timetableSource === "selection" ? "选课结果" : "本学期课表";
  nodes.timetableSourceSelect.value = state.timetableSource;
  syncEnhancedControl(nodes.timetableSourceSelect);
  setSyncStatus(nodes.timetableSyncText, "未同步");
  nodes.courseCountText.textContent = "--";
  nodes.sessionCountText.textContent = "--";
  nodes.locationCountText.textContent = "--";
  nodes.academicCalendarText.textContent = "--";
  nodes.timetableTermText.textContent = "--";
  nodes.courseListText.textContent = "--";
  nodes.timetableSummary.innerHTML = "";
  nodes.timetableGrid.innerHTML = empty(error.message);
  nodes.courseList.innerHTML = empty(error.status === 401 ? "请重新登录学校账号后再同步课表" : "课表暂时不可用");
  renderOverview();
}

function renderFreeRoomError(error) {
  nodes.freeRoomSyncText.textContent = "未同步";
  nodes.freeRoomBuildingCountText.textContent = "--";
  nodes.freeRoomCountText.textContent = "--";
  nodes.freeSeatCountText.textContent = "--";
  nodes.freeSectionText.textContent = freeSectionRangeText(state.freeSections);
  nodes.freeRoomList.innerHTML = empty(error.status === 401 ? "请重新登录学校账号后再查询空教室" : error.message);
  renderOverview();
}

function renderCampusError(error) {
  nodes.campusSyncText.textContent = "未同步";
  nodes.cardBalanceText.textContent = "--";
  nodes.cardBalanceRemark.textContent = error.message;
  nodes.cardWalletCountText.textContent = "--";
  nodes.waterCodeText.textContent = "--";
  nodes.waterCodeRemark.textContent = error.message;
  nodes.waterCodeRefreshButton.disabled = true;
  nodes.waterAmountText.textContent = "--";
  setSyncStatus(nodes.accommodationSyncText, "未同步");
  nodes.accommodationPlaceText.textContent = "--";
  nodes.accommodationClassText.textContent = error.message;
  nodes.accommodationStudentText.textContent = "--";
  nodes.accommodationNameText.textContent = "--";
  nodes.accommodationStatusText.textContent = "--";
  nodes.accommodationDateText.textContent = "--";
  nodes.accommodationFeeText.textContent = "--";
  nodes.accommodationDeviceText.textContent = "--";
  nodes.roommateCountText.textContent = "--";
  nodes.roommateList.innerHTML = empty(error.message);
  nodes.cardBillList.dataset.scrollable = "false";
  nodes.waterBillList.dataset.scrollable = "false";
  nodes.cardBillList.innerHTML = empty(error.message);
  nodes.waterBillList.innerHTML = empty(error.message);
  renderOverview();
}

function clearDashboard() {
  nodes.accountText.textContent = "--";
  nodes.ownerText.textContent = "--";
  nodes.stateText.textContent = "只读查询";
  nodes.balanceText.textContent = "--";
  nodes.balanceRemark.textContent = "等待同步";
  nodes.monthKwhText.textContent = "--";
  nodes.overFeeText.textContent = "--";
  nodes.meterOnlineText.textContent = "--";
  nodes.meterTotalText.textContent = "--";
  nodes.billMonthText.textContent = "--";
  nodes.meterCategoryText.textContent = "--";
  nodes.packageCountText.textContent = "--";
  nodes.billList.innerHTML = "";
  nodes.meterList.innerHTML = "";
  nodes.packageList.innerHTML = "";
  renderOverview();
}

function clearCampus() {
  nodes.campusSyncText.textContent = "--";
  nodes.cardBalanceText.textContent = "--";
  nodes.cardBalanceRemark.textContent = "等待同步";
  nodes.cardWalletCountText.textContent = "--";
  nodes.waterCodeText.textContent = "--";
  nodes.waterCodeRemark.textContent = "只读查询";
  nodes.waterCodeRefreshButton.disabled = false;
  nodes.waterAmountText.textContent = "--";
  setSyncStatus(nodes.accommodationSyncText, "--");
  nodes.accommodationPlaceText.textContent = "--";
  nodes.accommodationClassText.textContent = "等待同步";
  nodes.accommodationStudentText.textContent = "--";
  nodes.accommodationNameText.textContent = "--";
  nodes.accommodationStatusText.textContent = "--";
  nodes.accommodationDateText.textContent = "--";
  nodes.accommodationFeeText.textContent = "--";
  nodes.accommodationDeviceText.textContent = "--";
  nodes.roommateCountText.textContent = "--";
  nodes.roommateList.innerHTML = "";
  nodes.cardBillMonthText.textContent = "--";
  nodes.waterBillMonthText.textContent = "--";
  nodes.cardBillList.dataset.scrollable = "false";
  nodes.waterBillList.dataset.scrollable = "false";
  nodes.cardBillList.innerHTML = "";
  nodes.waterBillList.innerHTML = "";
  renderOverview();
}

function clearIdentity() {
  cancelIdentityCodeRefresh();
  nodes.identityNameText.textContent = "--";
  nodes.identityCodeText.textContent = "等待同步";
  nodes.identityStatusText.textContent = "用户中心";
  nodes.identityFacts.innerHTML = "";
  nodes.identityAvatar.hidden = true;
  nodes.identityAvatar.removeAttribute("src");
  nodes.identityQrButton.classList.toggle("active", state.identityCodeMode !== "barcode");
  nodes.identityBarcodeButton.classList.toggle("active", state.identityCodeMode === "barcode");
  nodes.identityCodeModeTitle.textContent = state.identityCodeMode === "barcode" ? "条形码" : "二维码";
  nodes.identityCodeImage.hidden = true;
  nodes.identityCodeImage.removeAttribute("src");
  nodes.identityCodeEmpty.hidden = false;
  nodes.identityCodeEmpty.textContent = "等待同步个人身份码";
  nodes.identityCodeMeta.textContent = "动态码不会保存到磁盘";
  nodes.identityCodeRefreshButton.disabled = false;
}

function clearTimetable() {
  nodes.timetableHeadingText.textContent = "本学期课表";
  nodes.timetableSourceSelect.value = state.timetableSource;
  syncEnhancedControl(nodes.timetableSourceSelect);
  setSyncStatus(nodes.timetableSyncText, "--");
  nodes.courseCountText.textContent = "--";
  nodes.sessionCountText.textContent = "--";
  nodes.locationCountText.textContent = "--";
  nodes.academicCalendarText.textContent = "--";
  nodes.timetableTermText.textContent = "--";
  nodes.courseListText.textContent = "--";
  nodes.timetableSummary.innerHTML = "";
  nodes.timetableGrid.innerHTML = "";
  nodes.courseList.innerHTML = "";
  renderOverview();
}

function clearFreeRooms() {
  nodes.freeRoomSyncText.textContent = "--";
  nodes.freeRoomBuildingCountText.textContent = "--";
  nodes.freeRoomCountText.textContent = "--";
  nodes.freeSeatCountText.textContent = "--";
  nodes.freeSectionText.textContent = "--";
  nodes.freeRoomList.innerHTML = "";
  renderOverview();
}

function campusLabel() {
  return state.campusMode === "month" ? state.campusMonth : "最近记录";
}

function renderBills(groups) {
  if (!groups.length) {
    nodes.billList.innerHTML = empty("当前月份暂无账单");
    return;
  }

  nodes.billList.innerHTML = groups.map((group) => `
    <article class="bill-card">
      ${group.map((row) => `
        <div class="bill-row">
          <span>${escapeHtml(row.key)}</span>
          <strong>${escapeHtml(formatValue(row.value))}</strong>
        </div>
      `).join("")}
    </article>
  `).join("");
}

function renderMeters(meters, categories) {
  nodes.meterCategoryText.textContent = categories.length ? categories.join(" / ") : "--";
  if (!meters.length) {
    nodes.meterList.innerHTML = empty("暂无仪表");
    return;
  }

  nodes.meterList.innerHTML = meters.map((meter) => {
    const live = meter.live || {};
    const online = String(live.status) === "1";
    const value = live.value && live.value !== "N/A" ? `${live.value}${unitFor(meter.catCode)}` : "--";
    const meterName = meter.remark || meter.meterCode || "仪表";
    const meterType = meter.catCode || "--";
    const meterCode = meter.meterCode || "--";
    return `
      <article class="meter-card">
        <div class="meter-shell-top">
          <span class="meter-name">${escapeHtml(meterName)}</span>
          <span class="badge ${online ? "online" : "offline"}">${online ? "在线" : "离线"}</span>
        </div>
        <div class="meter-face">
          <div class="meter-display">
            <span>当前读数</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
          <div class="meter-dial" aria-hidden="true">
            <i></i>
          </div>
        </div>
        <div class="meter-specs">
          <div class="meter-row">
            <span>类型</span>
            <strong>${escapeHtml(meterType)}</strong>
          </div>
          <div class="meter-row">
            <span>编号</span>
            <strong>${escapeHtml(meterCode)}</strong>
          </div>
        </div>
        <div class="meter-terminals" aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </div>
      </article>
    `;
  }).join("");
}

function renderPackages(packages) {
  nodes.packageCountText.textContent = packages.length ? `${packages.length} 条` : "--";
  if (!packages.length) {
    nodes.packageList.innerHTML = empty("暂无套餐备注");
    return;
  }

  nodes.packageList.innerHTML = packages.map((item) => `
    <div class="package-card">${escapeHtml(item.packageInfo || JSON.stringify(item))}</div>
  `).join("");
}

function normalizeBill(data) {
  if (!Array.isArray(data)) return [];
  return data
    .map((group) => Array.isArray(group) ? group : [group])
    .map((group) => group
      .filter((row) => row && typeof row === "object")
      .map((row) => ({
        key: String(row.key ?? row.name ?? row.title ?? ""),
        value: row.value ?? row.amount ?? row.totalAmt ?? ""
      }))
      .filter((row) => row.key || row.value !== "")
    )
    .filter((group) => group.length);
}

function flattenCardDeals(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  for (const group of list) {
    const details = Array.isArray(group?.dealDetail) ? group.dealDetail : Array.isArray(group?.list) ? group.list : [group];
    for (const item of details) {
      if (!item || typeof item !== "object") continue;
      rows.push({
        title: item.businessName || item.merchantName || item.feeName || item.feeNumStr || item.transName || item.dealName || item.epName || "一卡通交易",
        amount: item.monDeal ?? item.totalMoney ?? item.money ?? item.amount,
        time: formatCardDealTime(item, group),
        wallet: item.feeNumStr || item.ewalletName || item.walletName || item.alias,
        place: item.merchantName || item.devName || item.address
      });
    }
  }
  return rows;
}

function renderFreeSectionPicker() {
  const selected = new Set(state.freeSections.map(Number));
  nodes.freeSectionPicker.innerHTML = defaultSectionTimes().map((item) => {
    const checked = selected.has(Number(item.section));
    return `
      <label class="section-chip ${checked ? "active" : ""}">
        <input type="checkbox" value="${item.section}" ${checked ? "checked" : ""}>
        <span>第${item.section}节</span>
        <small>${escapeHtml(item.start)}-${escapeHtml(item.end)}</small>
      </label>
    `;
  }).join("");
  nodes.freeSectionText.textContent = freeSectionRangeText(state.freeSections);
}

function setNotice(text, type, isHtml = false) {
  clearNotice();
  nodes.status.innerHTML = `<div class="notice ${type || ""}">${isHtml ? text : escapeHtml(text)}</div>`;
  if (type !== "error") {
    noticeClearTimer = window.setTimeout(clearNotice, 4500);
  }
}

function clearNotice() {
  if (noticeClearTimer) {
    clearTimeout(noticeClearTimer);
    noticeClearTimer = null;
  }
  nodes.status.innerHTML = "";
}

function setSyncStatus(node, text, isSynced = false) {
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("is-synced", Boolean(isSynced));
}

function handleRouting() {
  const hash = window.location.hash || "#overview";
  const sections = ["#overview", "#study", "#rooms", "#evaluation", "#campus", "#energy", "#admin"];

  if (!sections.includes(hash)) return;
  if (hash === "#admin" && !isAdminUser()) {
    window.location.hash = "#overview";
    return;
  }
  document.body.dataset.route = hash.slice(1);
  
  sections.forEach((id) => {
    document.querySelector(id)?.classList.toggle("active-tab", id === hash);
  });

  document.querySelector("#authPanel")?.classList.toggle("active-tab", hash === "#overview");

  document.querySelectorAll(".quick-nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === hash);
  });
  if (nodes.adminNavLink) {
    nodes.adminNavLink.classList.toggle("active", hash === "#admin");
  }

  if (hash === "#admin") {
    loadAdminData();
  }
  if (hash === "#rooms" && canUseApp() && !state.freeRooms) {
    refreshFreeRooms({ silent: true });
  }
  if (hash === "#evaluation" && canUseApp() && !state.evaluations) {
    refreshEvaluations({ silent: true });
  }
  if (hash === "#evaluation" && canUseApp()) {
    refreshEvaluationAutoStatus({ silent: true });
  }

  const mainContent = document.querySelector(".main-content");
  const resetRouteScroll = () => {
    if (mainContent) {
      mainContent.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };
  resetRouteScroll();
  requestAnimationFrame(resetRouteScroll);
  window.setTimeout(resetRouteScroll, 80);
}

window.addEventListener("hashchange", () => {
  clearNotice();
  handleRouting();
});
window.addEventListener("DOMContentLoaded", () => {
  if (!window.location.hash) {
    window.location.hash = "#overview";
  }
  handleRouting();
});
if (document.readyState === "complete" || document.readyState === "interactive") {
  if (!window.location.hash) {
    window.location.hash = "#overview";
  }
  handleRouting();
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark-theme");
  localStorage.setItem("hgu-theme", isDark ? "dark" : "light");
  updateThemeToggle(isDark);
}

function initTheme() {
  const saved = localStorage.getItem("hgu-theme") || "light";
  if (saved === "dark") {
    document.body.classList.add("dark-theme");
    updateThemeToggle(true);
  } else {
    document.body.classList.remove("dark-theme");
    updateThemeToggle(false);
  }
}

function updateThemeToggle(isDark) {
  const label = isDark ? "切换到白天模式" : "切换到黑夜模式";
  nodes.themeToggle.textContent = "";
  nodes.themeToggle.dataset.themeMode = isDark ? "dark" : "light";
  nodes.themeToggle.setAttribute("aria-label", label);
  nodes.themeToggle.title = label;
}
