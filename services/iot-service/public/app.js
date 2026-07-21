const state = {
  refreshTimer: null,
  refreshInFlight: false,
  defaults: null,
  currentConfig: null,
  lastInfo: null,
  lastAuxRefreshAt: 0,
  socket: null,
  socketRetryTimer: null,
  wsRetryCount: 0, // WebSocket 指数退避重试计数器
  previousMessageCount: 0,
  events: [],
  authEnabled: false,
  authenticated: false,
  platformSso: false,
  autoRefresh: true,
  refreshInterval: 5000,
  pendingControls: {}, // 记录处于控制加载状态的继电器： 'deviceId:relayId' -> timestamp
  controlTimeouts: {}, // 记录处于乐观控制超时守护状态的继电器
  currentTab: 'devices',
  theme: 'dark',
  localDevices: [],
  lastHistoryData: null,
  configSecretState: null,
  actionLocks: new Set()
};

const AUX_REFRESH_MIN_INTERVAL = 30000;
const apiClient = window.MqttApiClient.createApiClient({
  onUnauthorized: (error) => {
    if (
      window.MqttApiClient.APP_BASE_PATH
      && error?.code === 'PLATFORM_SESSION_REQUIRED'
    ) {
      window.MqttApiClient.redirectToPlatformLogin();
      return;
    }
    state.authenticated = false;
    updateAuthUi();
  }
});
const requestJson = apiClient.requestJson;
const HISTORY_REQUEST_TIMEOUT_MS = window.MqttApiClient.HISTORY_REQUEST_TIMEOUT_MS;
const MAINTENANCE_REQUEST_TIMEOUT_MS = window.MqttApiClient.MAINTENANCE_REQUEST_TIMEOUT_MS;

const elements = {
  mobileMenuToggle: document.getElementById('mobile-menu-toggle'),
  sidebarOverlay: document.getElementById('sidebar-overlay'),
  sidebar: document.querySelector('.sidebar'),
  authOverlay: document.getElementById('auth-overlay'),
  authCard: document.querySelector('.auth-card'),
  toggleLoginPassword: document.getElementById('toggle-login-password'),
  loginForm: document.getElementById('login-form'),
  loginUsername: document.getElementById('login-username'),
  loginPassword: document.getElementById('login-password'),
  loginButton: document.getElementById('login-button'),
  loginMessage: document.getElementById('login-message'),
  platformConsoleLink: document.getElementById('platform-console-link'),
  logoutButton: document.getElementById('logout-button'),
  serviceBadge: document.getElementById('service-badge'),
  wsBadge: document.getElementById('ws-badge'),
  saveState: document.getElementById('save-state'),
  reconnectButton: document.getElementById('reconnect-button'),
  resetButton: document.getElementById('reset-button'),
  saveButton: document.getElementById('save-button'),
  exportConfigButton: document.getElementById('export-config-button'),
  copyInfoButton: document.getElementById('copy-info-button'),
  copyTopicsButton: document.getElementById('copy-topics-button'),
  autoRefreshToggle: document.getElementById('auto-refresh-toggle'),
  configForm: document.getElementById('config-form'),
  mqttConnected: document.getElementById('mqtt-connected'),
  mqttSubscribed: document.getElementById('mqtt-subscribed'),
  deviceOnline: document.getElementById('device-online'),
  connectionState: document.getElementById('connection-state'),
  activeBroker: document.getElementById('active-broker'),
  lastMessageTime: document.getElementById('last-message-time'),
  lastMessageTopic: document.getElementById('last-message-topic'),
  lastError: document.getElementById('last-error'),
  avgTemp: document.getElementById('avg-temp'),
  avgHum: document.getElementById('avg-hum'),
  messagesReceived: document.getElementById('messages-received'),
  connectionUptime: document.getElementById('connection-uptime'),
  topicTableBody: document.getElementById('topic-table-body'),
  infoJson: document.getElementById('info-json'),
  eventFeed: document.getElementById('event-feed'),
  configPath: document.getElementById('config-path'),
  dataDirectory: document.getElementById('data-directory'),
  apiPort: document.getElementById('api-port'),
  refreshInterval: document.getElementById('refresh-interval'),
  mqttUrl: document.getElementById('mqtt-url'),
  mqttClientId: document.getElementById('mqtt-client-id'),
  mqttUsername: document.getElementById('mqtt-username'),
  mqttPassword: document.getElementById('mqtt-password'),
  mqttPasswordStatus: document.getElementById('mqtt-password-status'),
  mqttPasswordClear: document.getElementById('mqtt-password-clear'),
  mqttQos: document.getElementById('mqtt-qos'),
  mqttClean: document.getElementById('mqtt-clean'),
  mqttReconnectPeriod: document.getElementById('mqtt-reconnect-period'),
  mqttConnectTimeout: document.getElementById('mqtt-connect-timeout'),
  
  // 可视化向导配置
  visualDevicesList: document.getElementById('visual-devices-list'),
  addDeviceBtn: document.getElementById('add-device-btn'),
  addDeviceModal: document.getElementById('add-device-modal'),
  addDeviceClose: document.getElementById('add-device-close'),
  addDeviceForm: document.getElementById('add-device-form'),
  addDeviceId: document.getElementById('add-device-id'),
  addDeviceName: document.getElementById('add-device-name'),
  
  // API Key 列表
  apiKeysTableBody: document.getElementById('api-keys-table-body'),
  createKeyForm: document.getElementById('create-key-form'),
  createKeyButton: document.querySelector('#create-key-form button[type="submit"]'),
  newKeyName: document.getElementById('new-key-name'),
  apiScopeDevicesRead: document.getElementById('api-scope-devices-read'),
  apiScopeHistoryRead: document.getElementById('api-scope-history-read'),
  apiScopeRelaysWrite: document.getElementById('api-scope-relays-write'),
  createdKeyPanel: document.getElementById('created-key-panel'),
  createdKeyMeta: document.getElementById('created-key-meta'),
  createdKeyValue: document.getElementById('created-key-value'),
  copyCreatedKeyButton: document.getElementById('copy-created-key-button'),
  deviceOnlineThreshold: document.getElementById('device-online-threshold'),
  dashboardRefreshInterval: document.getElementById('dashboard-refresh-interval'),
  authEnabled: document.getElementById('auth-enabled'),
  authUsername: document.getElementById('auth-username'),
  authPassword: document.getElementById('auth-password'),
  authPasswordStatus: document.getElementById('auth-password-status'),
  authPasswordClear: document.getElementById('auth-password-clear'),
  authSessionSecret: document.getElementById('auth-session-secret'),
  authSessionSecretStatus: document.getElementById('auth-session-secret-status'),
  authSessionSecretClear: document.getElementById('auth-session-secret-clear'),
  authSessionTtl: document.getElementById('auth-session-ttl'),
  
  // 模态弹窗及 Toast 容器
  toastContainer: document.getElementById('toast-container'),
  historyModal: document.getElementById('history-modal'),
  modalClose: document.getElementById('modal-close'),
  modalDeviceId: document.getElementById('modal-device-id'),
  modalDeviceName: document.getElementById('modal-device-name'),
  historyChartBox: document.getElementById('history-chart-box'),
  devicesContainer: document.getElementById('devices-container'),
  refreshButton: document.getElementById('refresh-button'),
  
  // 细分后的新板块 Tab (共 6 个)
  navItems: document.querySelectorAll('.nav-item'),
  themeToggle: document.getElementById('theme-toggle'),
  currentPaneEyebrow: document.getElementById('current-pane-eyebrow'),
  currentPaneTitle: document.getElementById('current-pane-title'),
  currentPaneDesc: document.getElementById('current-pane-desc'),
  pagePanes: {
    devices: document.getElementById('page-devices'),
    automation: document.getElementById('page-automation'),
    history: document.getElementById('page-history'),
    events: document.getElementById('page-events'),
    keys: document.getElementById('page-keys'),
    config: document.getElementById('page-config')
  },

  // 细分面板特有组件
  historyDeviceSelector: document.getElementById('history-device-selector'),
  historyMainChartBox: document.getElementById('history-main-chart-box'),
  historyTableBody: document.getElementById('history-table-body'),
  clearEventsBtn: document.getElementById('clear-events-btn'),
  eventFeedMain: document.getElementById('event-feed-main'),

  // 配置页二级子Tab组件与密码眼睛
  configSubnavItems: document.querySelectorAll('.subnav-item'),
  subtabPanes: {
    connection: document.getElementById('subtab-pane-connection'),
    devices: document.getElementById('subtab-pane-devices'),
    security: document.getElementById('subtab-pane-security')
  },
  toggleMqttPassword: document.getElementById('toggle-mqtt-password'),
  toggleAuthPassword: document.getElementById('toggle-auth-password'),
  toggleSessionSecret: document.getElementById('toggle-session-secret'),
  
  // 新增升级功能 DOM 映射
  historyRangeSelector: document.getElementById('history-range-selector'),
  historyExportBtn: document.getElementById('history-export-btn'),
  apiDiscoveryTopic: document.getElementById('api-discovery-topic'),
  dashboardDataRetentionDays: document.getElementById('dashboard-data-retention-days'),
  dbVacuumBtn: document.getElementById('db-vacuum-btn'),
  apiWebhookEnabled: document.getElementById('api-webhook-enabled'),
  apiWebhookUrl: document.getElementById('api-webhook-url'),
  testMqttBtn: document.getElementById('test-mqtt-btn'),
  saveSecurityButton: document.getElementById('save-security-btn'),
  discoveryTableBody: document.getElementById('discovery-table-body'),
  discoveryCountBadge: document.getElementById('discovery-count-badge'),
  
  // 自定义通用对话框 DOM 映射
  customDialogModal: document.getElementById('custom-dialog-modal'),
  dialogIconArea: document.getElementById('dialog-icon-area'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogMessage: document.getElementById('dialog-message'),
  dialogInputWrapper: document.getElementById('dialog-input-wrapper'),
  dialogInputElement: document.getElementById('dialog-input-element'),
  dialogCancelBtn: document.getElementById('dialog-cancel-btn'),
  dialogConfirmBtn: document.getElementById('dialog-confirm-btn')
};

const toastManager = window.MqttApiUi.createToastManager({
  container: elements.toastContainer
});
const dialogManager = window.MqttApiUi.createDialogManager({
  modal: elements.customDialogModal,
  iconArea: elements.dialogIconArea,
  titleEl: elements.dialogTitle,
  messageEl: elements.dialogMessage,
  inputWrapper: elements.dialogInputWrapper,
  inputEl: elements.dialogInputElement,
  cancelBtn: elements.dialogCancelBtn,
  confirmBtn: elements.dialogConfirmBtn
});
const actionLockManager = window.MqttApiUi.createActionLockManager({
  locks: state.actionLocks,
  isPrivateLocked: () => state.authEnabled && !state.authenticated,
  loginButton: () => elements.loginButton
});
const showToast = toastManager.showToast;
const showCustomConfirm = dialogManager.confirm;
const showCustomPrompt = dialogManager.prompt;
const beginAction = actionLockManager.begin;
const endAction = actionLockManager.end;
const isActionLocked = actionLockManager.isLocked;
const formEnhancements = window.MqttApiFormEnhancements.createFormEnhancements();
const historyView = window.MqttApiHistoryView.createHistoryView({
  modalChartBox: elements.historyChartBox,
  mainChartBox: elements.historyMainChartBox,
  tableBody: elements.historyTableBody,
  deviceSelector: elements.historyDeviceSelector,
  rangeSelector: elements.historyRangeSelector,
  exportButton: elements.historyExportBtn,
  requestJson,
  requestTimeoutMs: HISTORY_REQUEST_TIMEOUT_MS,
  getTheme: () => state.theme,
  getLastHistoryData: () => state.lastHistoryData,
  setLastHistoryData: (data) => {
    state.lastHistoryData = data;
  },
  setupCustomSelect,
  showToast
});
const apiKeysView = window.MqttApiKeysView.createApiKeysView({
  tableBody: elements.apiKeysTableBody,
  createForm: elements.createKeyForm,
  createButton: elements.createKeyButton,
  nameInput: elements.newKeyName,
  scopeInputs: [
    elements.apiScopeDevicesRead,
    elements.apiScopeHistoryRead,
    elements.apiScopeRelaysWrite
  ],
  createdPanel: elements.createdKeyPanel,
  createdMeta: elements.createdKeyMeta,
  createdValue: elements.createdKeyValue,
  copyCreatedButton: elements.copyCreatedKeyButton,
  canUsePrivateApi,
  requestJson,
  beginAction,
  endAction,
  confirmDanger: (title, message) => showCustomConfirm(title, message, true),
  showToast,
  copyText,
  formatTimestamp
});
window.MqttApiSystemActions.createSystemActions({
  testMqttButton: elements.testMqttBtn,
  mqttUrlInput: elements.mqttUrl,
  mqttUsernameInput: elements.mqttUsername,
  mqttPasswordInput: elements.mqttPassword,
  retentionDaysInput: elements.dashboardDataRetentionDays,
  dbVacuumButton: elements.dbVacuumBtn,
  clearEventsButton: elements.clearEventsBtn,
  requestJson,
  beginAction,
  endAction,
  maintenanceTimeoutMs: MAINTENANCE_REQUEST_TIMEOUT_MS,
  showToast,
  clearEvents: () => {
    state.events = [];
    renderEvents();
  }
});
const developerGuide = window.MqttApiDeveloperGuide.createDeveloperGuide({
  showToast
});
const layoutController = window.MqttApiLayout.createLayoutController({
  sidebar: elements.sidebar,
  sidebarOverlay: elements.sidebarOverlay,
  mobileMenuToggle: elements.mobileMenuToggle,
  mainContent: document.querySelector('.main-content')
});
const deviceGridView = window.MqttApiDeviceGrid.createDeviceGridView({
  container: elements.devicesContainer,
  showToast,
  updateMetricValue,
  requestJson,
  addEvent,
  getControlTimeouts: () => state.controlTimeouts,
  getLatestDevice: (deviceId) => state.lastInfo?.devices?.[deviceId] || {},
  historyRequestTimeoutMs: HISTORY_REQUEST_TIMEOUT_MS,
  historyModal: elements.historyModal,
  modalDeviceId: elements.modalDeviceId,
  modalDeviceName: elements.modalDeviceName,
  historyChartBox: elements.historyChartBox,
  setLastHistoryData: (data) => {
    state.lastHistoryData = data;
  },
  renderHistoryChart: renderSvgHistoryChart,
  goToConfig: () => switchTab('config')
});
const deviceConfigView = window.MqttApiDeviceConfig.createDeviceConfigView({
  listContainer: elements.visualDevicesList,
  addButton: elements.addDeviceBtn,
  modal: elements.addDeviceModal,
  closeButton: elements.addDeviceClose,
  form: elements.addDeviceForm,
  idInput: elements.addDeviceId,
  nameInput: elements.addDeviceName,
  getDevices: () => state.localDevices,
  setDevices: (devices) => {
    state.localDevices = devices;
  },
  confirmRemoveDevice: (device) =>
    showCustomConfirm('警告：移除设备', `确定要移除设备 [${device.name}] 吗？保存后，原设备的所有实时面板将不再渲染。`, true),
  showToast,
  markUnsaved: () => setBadge(elements.saveState, '未保存', 'badge badge-warning')
});
const automationView = window.MqttApiAutomation.createAutomationView({
  requestJson,
  getDevices: () => state.localDevices,
  showToast,
  confirmDanger: (title, message) => showCustomConfirm(title, message, true),
  formatTimestamp
});

// 细分页面头部文案元数据
const paneMeta = {
  devices: { eyebrow: 'Device Center', title: '设备中心', desc: '实时监控传感器快照与继电器，并在此统一进行多设备映射配置和活跃主题嗅探自动注册。' },
  automation: { eyebrow: 'Rules & Scenes', title: '自动化', desc: '组合常用设备场景，并根据温湿度、在线状态或继电器状态自动执行控制动作。' },
  history: { eyebrow: 'Data & Analysis', title: '数据分析', desc: '调取并过滤 MongoDB 中长期存储的传感器采样时序数据，支持多端对比折线图及 CSV 数据导出。' },
  keys: { eyebrow: 'Security Center', title: '安全准入', desc: '统一保护系统安全边界。支持在此管理外部应用 API Token 授权密钥，并管理后台管理员登录凭证。' },
  events: { eyebrow: 'Audit Logs', title: '日志审计', desc: '捕获并监视实时业务操作流、系统连接日志和网络底层命令收发轨迹。' },
  config: { eyebrow: 'System Maintenance', title: '系统运维', desc: '就地测试与管理 MQTT Broker / Webhook 通信，查看硬件系统诊断，并管理底层垃圾清理维护。' }
};

// 1. 板块子页面的秒级切换逻辑 (Tab Swapping)
function switchTab(tabId) {
  if (!paneMeta[tabId]) return;
  state.currentTab = tabId;
  localStorage.setItem('mqttapi_current_tab', tabId);

  // 激活对应导航
  elements.navItems.forEach(item => {
    const isActive = item.dataset.page === tabId;
    item.classList.toggle('active', isActive);
  });

  // 隐藏与显示对应面板
  Object.entries(elements.pagePanes).forEach(([id, pane]) => {
    if (pane) {
      pane.classList.toggle('hidden', id !== tabId);
    }
  });

  // 修改顶头文本
  const meta = paneMeta[tabId];
  elements.currentPaneEyebrow.textContent = meta.eyebrow;
  elements.currentPaneTitle.textContent = meta.title;
  elements.currentPaneDesc.textContent = meta.desc;

  // 切到时序历史页面时，自动刷新一次
  if (tabId === 'history') {
    loadMainHistoryChart();
  }

  if (tabId === 'automation' && canUsePrivateApi()) {
    automationView.refresh().catch((error) => showToast('自动化刷新失败', error.message, 'error'));
  }

  if (tabId === 'keys' && canUsePrivateApi()) {
    refreshApiKeys().catch((error) => showToast('API 密钥刷新异常', error.message, 'error'));
  }
}

// 2. 双主题模式无缝渲染 (Theme Swapping)
function switchTheme(theme) {
  state.theme = theme;
  localStorage.setItem('mqttapi_theme', theme);

  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    elements.themeToggle.checked = true;
  } else {
    document.documentElement.removeAttribute('data-theme');
    elements.themeToggle.checked = false;
  }
}

function setMobileSidebarOpen(isOpen) {
  layoutController.setMobileSidebarOpen(isOpen);
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '暂无';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

function formatDuration(start) {
  if (!start) {
    return '等待连接';
  }

  const seconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${rest}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${rest}s`;
  }

  return `${rest}s`;
}

function addEvent(message) {
  state.events.unshift({
    time: Date.now(),
    message
  });
  state.events = state.events.slice(0, 50); // 最多保留50条日志
  renderEvents();
}

function renderEvents() {
  const items = state.events;

  // 诊断页：只渲染最近的 8 条
  if (elements.eventFeed) {
    if (items.length === 0) {
      elements.eventFeed.innerHTML = '<li>等待实时事件</li>';
    } else {
      elements.eventFeed.innerHTML = items
        .slice(0, 8)
        .map((event) => `<li><time>${formatTimestamp(event.time)}</time><span>${escapeHtml(event.message)}</span></li>`)
        .join('');
    }
  }

  // 专属日志页：渲染最近的 30 条
  if (elements.eventFeedMain) {
    if (items.length === 0) {
      elements.eventFeedMain.innerHTML = `
        <div class="empty-state-wrapper">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <h3>暂无审计日志</h3>
          <p>物联网 Broker 消息的推送、继电器控制的下发以及鉴权登录审计日志都将记录在此。</p>
        </div>
      `;
    } else {
      elements.eventFeedMain.innerHTML = items
        .slice(0, 30)
        .map((event) => `<li><time>${formatTimestamp(event.time)}</time><span>${escapeHtml(event.message)}</span></li>`)
        .join('');
    }
  }
}

function setBadge(element, text, variant) {
  element.textContent = text;
  element.className = `badge ${variant}`;
}

function isRealtimeConnected() {
  return state.socket && state.socket.readyState === WebSocket.OPEN;
}

function canUsePrivateApi() {
  return !state.authEnabled || state.authenticated;
}

function canUseRealtime() {
  return canUsePrivateApi();
}

function disconnectRealtime(updateBadge = true) {
  clearTimeout(state.socketRetryTimer);

  if (state.socket) {
    const socket = state.socket;
    state.socket = null;

    if ([WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) {
      socket.close();
    }
  }

  if (updateBadge) {
    setBadge(elements.wsBadge, '登录后可用', 'badge badge-muted');
  }
}

function updateAuthUi() {
  const locked = state.authEnabled && !state.authenticated;

  document.body.classList.toggle('unauthenticated', locked);
  elements.authOverlay.classList.toggle('hidden', !locked);
  elements.authOverlay.setAttribute('aria-hidden', String(!locked));
  elements.platformConsoleLink.classList.toggle('hidden', !state.platformSso || !state.authenticated);
  elements.logoutButton.classList.toggle('hidden', !state.authEnabled || !state.authenticated);
  elements.logoutButton.disabled = locked || isActionLocked('auth-logout');
  elements.configForm.classList.toggle('locked', locked);
  elements.reconnectButton.disabled = locked || isActionLocked('mqtt-reconnect');
  elements.resetButton.disabled = locked || isActionLocked('config-reset');
  elements.saveButton.disabled = locked || isActionLocked('config-save');
  if (elements.saveSecurityButton) {
    elements.saveSecurityButton.disabled = locked || isActionLocked('config-save');
  }
  if (elements.createKeyButton) {
    elements.createKeyButton.disabled = locked || isActionLocked('api-key-create');
  }
  elements.exportConfigButton.disabled = locked;
  elements.refreshButton.disabled = locked;
  elements.copyInfoButton.disabled = locked;
  elements.copyTopicsButton.disabled = locked;

  if (locked) {
    disconnectRealtime();
    window.setTimeout(() => {
      elements.loginUsername?.focus();
    }, 0);
  } else if (!state.socket || state.socket.readyState === WebSocket.CLOSED) {
    connectRealtime();
  }
}

// 数字变化微发光与脉动动画
function updateMetricValue(element, newValue) {
  if (!element) return;
  const oldValue = element.textContent;
  if (oldValue !== newValue) {
    element.textContent = newValue;
    element.classList.remove('pulse-active');
    void element.offsetWidth; // 强迫回流重新触发动画
    element.classList.add('pulse-active');
    element.addEventListener('animationend', function handler() {
      element.classList.remove('pulse-active');
      element.removeEventListener('animationend', handler);
    });
  }
}

function renderDevicesGrid(devices) {
  deviceGridView.render(devices);
}

function renderSvgHistoryChart(data) {
  historyView.renderModalChart(data);
}

function renderMainSvgHistoryChart(data) {
  historyView.renderMainChart(data);
}

function renderHistoryTable(data) {
  historyView.renderTable(data);
}

function updateHistoryDeviceSelector(devices) {
  historyView.updateDeviceSelector(devices);
}

function loadMainHistoryChart() {
  return historyView.loadMainChart();
}

// 渲染全局汇总与卡片
function renderInfo(info) {
  state.lastInfo = info;
  const previousMessageCount = state.previousMessageCount;
  state.previousMessageCount = info.messagesReceived || 0;

  elements.mqttConnected.textContent = info.mqttConnected ? '已连接' : '未连接';
  elements.mqttSubscribed.textContent = info.subscribed ? '已订阅' : '未订阅';
  elements.activeBroker.textContent = info.activeBroker || '-';
  elements.lastMessageTime.textContent = formatTimestamp(info.lastMsgTimestamp);
  elements.lastMessageTopic.textContent = info.lastMessageTopic || '-';
  elements.lastError.textContent = info.lastError || '无';
  elements.connectionUptime.textContent = formatDuration(info.connectedAt);
  elements.infoJson.textContent = JSON.stringify(info, null, 2);
  
  updateMetricValue(elements.messagesReceived, String(info.messagesReceived || 0));

  const deviceList = Object.values(info.devices || {});
  const onlineDevices = deviceList.filter(d => d.onlineStatus === 'online');
  const validTemps = onlineDevices.map(d => d.temp).filter(v => v !== null);
  const validHums = onlineDevices.map(d => d.hum).filter(v => v !== null);

  updateMetricValue(elements.deviceOnline, `${onlineDevices.length} / ${deviceList.length}`);
  
  if (validTemps.length > 0) {
    const avgT = validTemps.reduce((a, b) => a + b, 0) / validTemps.length;
    updateMetricValue(elements.avgTemp, `${avgT.toFixed(1)} °C`);
  } else {
    updateMetricValue(elements.avgTemp, '--');
  }

  if (validHums.length > 0) {
    const avgH = validHums.reduce((a, b) => a + b, 0) / validHums.length;
    updateMetricValue(elements.avgHum, `${avgH.toFixed(1)} %RH`);
  } else {
    updateMetricValue(elements.avgHum, '--');
  }

  if ((info.messagesReceived || 0) > previousMessageCount) {
    addEvent(`接收主题 ${info.lastMessageTopic || 'MQTT'} 消息`);
  }

  if (info.mqttConnected && info.subscribed) {
    setBadge(elements.serviceBadge, '运行正常', 'badge badge-success');
    setBadge(elements.connectionState, info.connectionState || 'connected', 'badge badge-success');
  } else if (info.connectionState === 'error') {
    setBadge(elements.serviceBadge, '需检查', 'badge badge-danger');
    setBadge(elements.connectionState, 'error', 'badge badge-danger');
  } else {
    setBadge(elements.serviceBadge, '连接中', 'badge badge-warning');
    setBadge(elements.connectionState, info.connectionState || 'pending', 'badge badge-warning');
  }

  renderDevicesGrid(info.devices);
  renderTopicTable(info);
  updateHistoryDeviceSelector(info.devices);
}

function renderTopicTable(info) {
  const topics = info.subscribedTopics || [];
  const stats = info.topicStats || {};

  if (topics.length === 0) {
    elements.topicTableBody.innerHTML = '<tr class="table-empty-row"><td colspan="4">暂无订阅主题</td></tr>';
    return;
  }

  elements.topicTableBody.innerHTML = topics
    .map((topic) => {
      const item = stats[topic] || {};
      const payload = item.lastPayload == null ? '-' : String(item.lastPayload);

      return `
        <tr>
          <td data-label="Topic">${escapeHtml(topic)}</td>
          <td data-label="消息数">${item.count || 0}</td>
          <td data-label="最近时间">${formatTimestamp(item.lastMessageAt)}</td>
          <td data-label="载荷">${escapeHtml(payload)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderMeta(meta) {
  elements.configPath.textContent = meta.configPath || '-';
  elements.dataDirectory.textContent = meta.dataDirectory || '-';
  elements.apiPort.textContent = meta.apiPort || '-';
  elements.refreshInterval.textContent = `${meta.dashboard.refreshInterval} ms`;
}

function renderLockedMeta() {
  elements.configPath.textContent = '登录后可见';
  elements.dataDirectory.textContent = '登录后可见';
  elements.apiPort.textContent = '-';
  elements.refreshInterval.textContent = `${state.refreshInterval} ms`;
}

function renderSecretField(input, statusElement, clearToggle, options) {
  const configured = Boolean(options.configured);
  input.value = '';
  input.placeholder = configured ? options.preservePlaceholder : options.emptyPlaceholder;
  statusElement.textContent = configured ? options.configuredText : options.emptyText;
  if (configured) {
    statusElement.classList.remove('empty');
    statusElement.classList.add('configured');
  } else {
    statusElement.classList.remove('configured');
    statusElement.classList.add('empty');
  }
  clearToggle.checked = false;
}

function renderConfig(config, secretState = {}) {
  state.currentConfig = config;
  state.configSecretState = secretState;
  elements.mqttUrl.value = config.mqtt.url;
  elements.mqttClientId.value = config.mqtt.clientId;
  elements.mqttUsername.value = config.mqtt.username;
  renderSecretField(elements.mqttPassword, elements.mqttPasswordStatus, elements.mqttPasswordClear, {
    configured: secretState.mqttPasswordConfigured,
    preservePlaceholder: '留空表示保持当前密码',
    emptyPlaceholder: '未配置密码，可留空',
    configuredText: '已配置，留空沿用',
    emptyText: '当前未设置'
  });
  elements.mqttQos.value = String(config.mqtt.qos);
  elements.mqttClean.value = String(config.mqtt.clean);
  elements.mqttReconnectPeriod.value = config.mqtt.reconnectPeriod;
  elements.mqttConnectTimeout.value = config.mqtt.connectTimeout;
  
  // 接入可视化向导数据流
  state.localDevices = JSON.parse(JSON.stringify(config.devices || []));
  automationView.syncDevices();
  renderVisualDevicesList();

  elements.deviceOnlineThreshold.value = config.api.deviceOnlineThreshold;
  elements.apiDiscoveryTopic.value = config.api.discoveryTopic ?? '';
  elements.apiWebhookEnabled.value = String(config.api.webhookEnabled ?? false);
  elements.apiWebhookUrl.value = config.api.webhookUrl ?? '';
  elements.dashboardRefreshInterval.value = config.dashboard.refreshInterval;
  elements.dashboardDataRetentionDays.value = config.dashboard.dataRetentionDays ?? 0;
  elements.authEnabled.value = String(config.auth.enabled);
  elements.authUsername.value = config.auth.username;
  renderSecretField(elements.authPassword, elements.authPasswordStatus, elements.authPasswordClear, {
    configured: secretState.authPasswordConfigured,
    preservePlaceholder: '留空表示保持当前登录密码',
    emptyPlaceholder: '未配置密码，启用鉴权前请填写',
    configuredText: '已配置，留空沿用',
    emptyText: '当前未设置'
  });
  renderSecretField(elements.authSessionSecret, elements.authSessionSecretStatus, elements.authSessionSecretClear, {
    configured: secretState.authSessionSecretConfigured,
    preservePlaceholder: '留空表示保持当前 Session Secret',
    emptyPlaceholder: '未配置 Secret，启用鉴权前请填写',
    configuredText: '已配置，留空沿用',
    emptyText: '当前未设置'
  });
  elements.authSessionTtl.value = config.auth.sessionTtlHours;

  state.refreshInterval = config.dashboard.refreshInterval;
  setBadge(elements.saveState, '已同步', 'badge badge-success');
  scheduleRefresh();
  initCustomSelects();
}

function getSecretDirective(value, clearToggle) {
  if (clearToggle.checked) {
    return 'clear';
  }

  return value ? 'replace' : 'preserve';
}

function collectConfig() {
  const devices = state.localDevices || [];

  return {
    mqtt: {
      url: elements.mqttUrl.value.trim(),
      clientId: elements.mqttClientId.value.trim(),
      username: elements.mqttUsername.value,
      password: elements.mqttPassword.value,
      qos: Number.parseInt(elements.mqttQos.value, 10),
      clean: elements.mqttClean.value === 'true',
      reconnectPeriod: Number.parseInt(elements.mqttReconnectPeriod.value, 10),
      connectTimeout: Number.parseInt(elements.mqttConnectTimeout.value, 10)
    },
    devices,
    api: {
      deviceOnlineThreshold: Number.parseInt(elements.deviceOnlineThreshold.value, 10),
      webhookUrl: elements.apiWebhookUrl.value.trim(),
      webhookEnabled: elements.apiWebhookEnabled.value === 'true',
      discoveryTopic: elements.apiDiscoveryTopic.value.trim()
    },
    auth: {
      enabled: elements.authEnabled.value === 'true',
      username: elements.authUsername.value.trim(),
      password: elements.authPassword.value,
      sessionSecret: elements.authSessionSecret.value.trim(),
      sessionTtlHours: Number.parseInt(elements.authSessionTtl.value, 10)
    },
    secretDirectives: {
      mqttPassword: getSecretDirective(elements.mqttPassword.value, elements.mqttPasswordClear),
      authPassword: getSecretDirective(elements.authPassword.value, elements.authPasswordClear),
      authSessionSecret: getSecretDirective(elements.authSessionSecret.value.trim(), elements.authSessionSecretClear)
    },
    dashboard: {
      refreshInterval: Number.parseInt(elements.dashboardRefreshInterval.value, 10),
      dataRetentionDays: Number.parseInt(elements.dashboardDataRetentionDays.value, 10)
    }
  };
}

function bindSecretFieldToggle(input, clearToggle) {
  formEnhancements.bindSecretFieldToggle(input, clearToggle);
}

function scheduleRefresh() {
  clearInterval(state.refreshTimer);

  if (!state.autoRefresh || document.hidden) {
    return;
  }

  state.refreshTimer = setInterval(() => {
    refreshStatus({ background: true }).catch((error) => showToast('自动刷新异常', error.message, 'error'));
  }, state.refreshInterval);
}

async function refreshStatus(options = {}) {
  if (!canUsePrivateApi()) {
    renderLockedMeta();
    return;
  }

  if (state.refreshInFlight) {
    return;
  }

  state.refreshInFlight = true;
  elements.refreshButton.disabled = true;

  try {
    const realtimeReady = isRealtimeConnected();
    const shouldFetchInfo = options.forceInfo || !options.background || !realtimeReady;
    const now = Date.now();
    const shouldFetchAux = !options.background || now - state.lastAuxRefreshAt >= AUX_REFRESH_MIN_INTERVAL;

    if (shouldFetchInfo) {
      const info = await requestJson('/api/info');
      renderInfo(info);
    }

    if (shouldFetchAux) {
      const meta = await requestJson('/api/meta');
      renderMeta(meta);

      const discovered = await requestJson('/api/discovery/topics').catch(() => []);
      renderDiscoveredTopics(discovered);
      state.lastAuxRefreshAt = now;
    }

    if (state.currentTab === 'keys' && shouldFetchAux) {
      await refreshApiKeys();
    }
    if (state.currentTab === 'automation' && shouldFetchAux) {
      await automationView.refresh();
    }
  } finally {
    state.refreshInFlight = false;
    elements.refreshButton.disabled = state.authEnabled && !state.authenticated;
  }
}

// 渲染活跃主题嗅探自动发现列表
function renderDiscoveredTopics(list) {
  const container = elements.discoveryTableBody;
  const countBadge = elements.discoveryCountBadge;
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${list.length} 个新主题`;
    countBadge.className = `badge ${list.length > 0 ? 'badge-primary' : 'badge-muted'}`;
  }

  if (!list || list.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="5" class="muted" style="text-align: center; padding: 24px;">暂无嗅探到新主题（请确保配置中开启了自动发现主题通配符）</td>
      </tr>
    `;
    return;
  }

  container.innerHTML = list.map(item => {
    const timeStr = new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(item.lastMessageAt);

    return `
      <tr>
        <td data-label="发现的 Topic 主题"><code style="background:rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.15); padding:3px 8px; border-radius:6px; font-family:monospace; font-size:0.82rem; color:var(--primary-color); font-weight:600;">${escapeHtml(item.topic)}</code></td>
        <td data-label="捕获消息数" style="font-weight:600; color:var(--text-main);">${item.count} 次</td>
        <td data-label="最近时间" style="font-size:0.8rem; color:var(--text-muted);">${timeStr}</td>
        <td data-label="最近上报载荷"><code style="background:rgba(255,255,255,0.03); padding:3px 8px; border: 1px solid rgba(255,255,255,0.05); border-radius:6px; font-family:monospace; font-size:0.78rem; color:var(--text-muted); display:inline-block; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.lastPayload)}">${escapeHtml(item.lastPayload)}</code></td>
        <td data-label="快捷操作">
          <button class="button button-primary empty-state-action-btn one-click-map-btn" data-topic="${escapeHtml(item.topic)}" type="button">一键映射</button>
        </td>
      </tr>
    `;
  }).join('');

  // 绑定一键映射交互事件
  container.querySelectorAll('.one-click-map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const topic = btn.getAttribute('data-topic');
      oneClickMapTopic(topic);
    });
  });
}

// 一键智能设备映射创建 (异步美化重构)
async function oneClickMapTopic(topic) {
  const lower = topic.toLowerCase();
  let type = 'temp';
  if (lower.includes('hum')) type = 'hum';
  else if (lower.includes('online') || lower.includes('status')) type = 'online';

  const parts = topic.split('/');
  const defaultId = parts.find(p => p && p !== 'home' && p !== 'temp' && p !== 'hum' && p !== 'status' && p !== 'online' && p !== 'relay') || 'new_device';
  
  const deviceName = await showCustomPrompt('智能一键设备映射', `嗅探到未绑定活跃主题: ${topic}\n我们将自动为您在“多设备映射”向导中建档该设备，请输入新设备名称：`, `自动发现 ${defaultId}`);
  if (!deviceName || !deviceName.trim()) return;

  const id = `${defaultId}_${Math.random().toString(16).slice(2, 6)}`;
  
  const topicsObj = { online: '', temp: '', hum: '' };
  topicsObj[type] = topic;

  // 智能写入临时向导设备数据数组
  if (!state.localDevices) {
    state.localDevices = [];
  }
  state.localDevices.push({
    id,
    name: deviceName,
    topics: topicsObj,
    relays: []
  });

  renderVisualDevicesList();
  setBadge(elements.saveState, '未保存', 'badge badge-warning');
  
  // 自动切换焦点到配置和设备卡片
  // 自动切换焦点到设备中心和设备配置子Tab
  const devicesTabBtn = Array.from(elements.navItems).find(item => item.getAttribute('data-page') === 'devices');
  if (devicesTabBtn) {
    devicesTabBtn.click();
    setTimeout(() => {
      const provisioningBtn = document.querySelector('.custom-subnav-item[data-subtab="provisioning"]');
      if (provisioningBtn) provisioningBtn.click();
    }, 50);
  }

  showToast('智能映射导入成功', `已自动为您建立设备【${deviceName}】并配置好相关主题。请点击底部的“保存配置”提交保存！`, 'success');
}

function connectRealtime() {
  if (!canUseRealtime()) {
    setBadge(elements.wsBadge, '登录后可用', 'badge badge-muted');
    return;
  }

  if (state.socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(state.socket.readyState)) {
    return;
  }

  clearTimeout(state.socketRetryTimer);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}${window.MqttApiClient.APP_BASE_PATH}/ws`);
  state.socket = socket;
  setBadge(elements.wsBadge, '连接实时通道', 'badge badge-warning');

  socket.addEventListener('open', () => {
    state.wsRetryCount = 0; // 重置指数退避重试计数器
    setBadge(elements.wsBadge, '实时在线', 'badge badge-success');
    addEvent('实时通道已连接');
    showToast('实时通道就绪', '已成功挂载 WS 消息推送引擎。', 'success');
  });

  socket.addEventListener('message', (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload && payload.data) {
        renderInfo(payload.data);
      }
      if (payload?.type === 'automation' && state.currentTab === 'automation') {
        automationView.refresh().catch((error) => showToast('执行记录刷新失败', error.message, 'error'));
      }
    } catch (error) {
      addEvent('实时消息解析失败');
    }
  });

  socket.addEventListener('close', () => {
    if (state.socket === socket) {
      state.socket = null;
    }

    if (!canUseRealtime()) {
      setBadge(elements.wsBadge, '登录后可用', 'badge badge-muted');
      return;
    }

    // 指数退避及重试限制
    if (state.wsRetryCount >= 20) {
      setBadge(elements.wsBadge, '连接受限', 'badge badge-danger');
      showToast('实时通道离线', '网络异常导致重试次数过多，已停止自动重连，请尝试刷新页面。', 'error');
      return;
    }

    setBadge(elements.wsBadge, '实时离线', 'badge badge-warning');
    const delay = Math.min(30000, 3000 * Math.pow(2, state.wsRetryCount));
    state.wsRetryCount++;
    state.socketRetryTimer = setTimeout(connectRealtime, delay);
  });

  socket.addEventListener('error', () => {
    setBadge(elements.wsBadge, '实时异常', 'badge badge-danger');
    socket.close();
  });
}

async function loadAuthStatus() {
  const auth = await requestJson('/api/auth/status');
  state.authEnabled = auth.enabled;
  state.authenticated = auth.authenticated;
  state.platformSso = Boolean(auth.platformSso);

  if (state.authEnabled) {
    elements.loginUsername.value = auth.username || 'admin';
  }

  updateAuthUi();
  initCustomSelects();
}

async function loadConfig() {
  const [config, defaults] = await Promise.all([
    requestJson('/api/config'),
    requestJson('/api/config/defaults')
  ]);

  state.defaults = defaults.config;
  renderConfig(config.config, config.secretState);
}

function showLoginMessage(message, type = 'error') {
  const el = elements.loginMessage;
  if (!el) return;
  el.textContent = message;
  el.className = `flash-message ${type}`;
  el.classList.remove('hidden');
}

function hideLoginMessage() {
  const el = elements.loginMessage;
  if (!el) return;
  el.textContent = '';
  el.className = 'flash-message hidden';
}

function setLoginButtonContent(label) {
  elements.loginButton.innerHTML = `
    <span class="auth-button-content">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14"></path>
        <path d="M13 6l6 6-6 6"></path>
      </svg>
      <span>${label}</span>
    </span>
  `;
}

function setLoginButtonLoading(isLoading) {
  elements.loginButton.classList.toggle('loading', isLoading);
  elements.loginButton.setAttribute('aria-busy', String(isLoading));
  setLoginButtonContent(isLoading ? '正在安全验证...' : '安全登录');
}

function bindPasswordToggle() {
  const eyeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  const eyeOffIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

  const list = [
    { btn: elements.toggleLoginPassword, input: elements.loginPassword },
    { btn: elements.toggleMqttPassword, input: elements.mqttPassword },
    { btn: elements.toggleAuthPassword, input: elements.authPassword },
    { btn: elements.toggleSessionSecret, input: elements.authSessionSecret }
  ];

  list.forEach(({ btn, input }) => {
    if (!btn || !input) return;

    btn.innerHTML = eyeOffIcon;
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', '显示密码');
    btn.addEventListener('click', () => {
      const isPassword = input.getAttribute('type') === 'password';
      input.setAttribute('type', isPassword ? 'text' : 'password');
      btn.innerHTML = isPassword ? eyeIcon : eyeOffIcon;
      btn.setAttribute('aria-pressed', String(isPassword));
      btn.setAttribute('aria-label', isPassword ? '隐藏密码' : '显示密码');
    });
  });
}

async function handleLogin(event) {
  event.preventDefault();
  if (!beginAction('auth-login', elements.loginButton)) {
    return;
  }

  hideLoginMessage();
  
  // 清除旧的动效和样式
  elements.authCard.classList.remove('shake');
  elements.loginPassword.classList.remove('invalid');
  
  setLoginButtonLoading(true);

  try {
    const result = await requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: elements.loginUsername.value.trim(),
        password: elements.loginPassword.value
      })
    });

    elements.loginPassword.value = '';
    state.authEnabled = Boolean(result.enabled);
    state.authenticated = true;
    updateAuthUi();
    showToast('登录成功', '欢迎回来！管理控制面板已完全解锁。', 'success');
    await Promise.all([refreshStatus(), loadConfig(), refreshApiKeys()]);
    initDeveloperGuideDoc();
  } catch (error) {
    showLoginMessage(error.message, 'error');
    
    // 触发大厂经典的抖动防错动画与输入框高亮
    elements.authCard.classList.remove('shake');
    void elements.authCard.offsetWidth; // 触发强行重绘
    elements.authCard.classList.add('shake');
    elements.loginPassword.classList.add('invalid');
    
    // 输入时自动清除红色边框提示
    elements.loginPassword.addEventListener('input', () => {
      elements.loginPassword.classList.remove('invalid');
    }, { once: true });
  } finally {
    setLoginButtonLoading(false);
    endAction('auth-login', elements.loginButton);
  }
}

async function handleLogout() {
  if (!beginAction('auth-logout', elements.logoutButton)) {
    return;
  }

  try {
    if (state.platformSso) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-Platform-Request': 'console' }
      }).catch(() => {});
      window.location.replace('/');
      return;
    }
    await requestJson('/api/auth/logout', { method: 'POST' });
    showToast('会话已清除', '已安全登出控制后台。', 'info');
  } finally {
    state.authenticated = false;
    state.platformSso = false;
    updateAuthUi();
    renderCreatedApiKey(null);
    renderLockedMeta();
    endAction('auth-logout', elements.logoutButton);
  }
}

async function handleSave(event) {
  event.preventDefault();
  const saveButtons = [elements.saveButton, elements.saveSecurityButton];
  if (!beginAction('config-save', saveButtons)) {
    return;
  }

  setBadge(elements.saveState, '保存中', 'badge badge-warning');

  try {
    const payload = collectConfig();
    const result = await requestJson('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    renderConfig(result.config, result.secretState);
    await loadAuthStatus();
    await refreshStatus();
    addEvent('运行配置已保存');
    showToast('配置保存成功', result.message, 'success');
  } catch (error) {
    showToast('保存异常', error.message, 'error');
    setBadge(elements.saveState, '保存失败', 'badge badge-danger');
  } finally {
    endAction('config-save', saveButtons);
  }
}

async function handleReset() {
  if (!beginAction('config-reset', elements.resetButton)) {
    return;
  }

  try {
    const ok = await showCustomConfirm('警告：恢复出厂设置', '您确定要恢复系统默认配置吗？该操作将擦除当前的全部物理设备映射、Webhook 告警、时序设置及安全认证凭据！', true);
    if (!ok) return;

    const result = await requestJson('/api/config/reset', { method: 'POST' });
    renderConfig(result.config, result.secretState);
    await loadAuthStatus();
    await refreshStatus();
    addEvent('已恢复默认配置');
    showToast('恢复出厂设置', result.message, 'success');
  } catch (error) {
    showToast('恢复配置失败', error.message, 'error');
  } finally {
    endAction('config-reset', elements.resetButton);
  }
}

async function handleReconnect() {
  if (!beginAction('mqtt-reconnect', elements.reconnectButton)) {
    return;
  }

  try {
    const result = await requestJson('/api/reconnect', { method: 'POST' });
    await refreshStatus();
    addEvent('手动重连 MQTT Broker');
    showToast('MQTT 重连指令已送达', result.message, 'success');
  } catch (error) {
    showToast('重连执行失败', error.message, 'error');
  } finally {
    endAction('mqtt-reconnect', elements.reconnectButton);
  }
}

async function copyText(text, successMessage) {
  if (!text) {
    showToast('复制失败', '暂无可复制的内容。', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('剪贴板操作', successMessage, 'success');
  } catch (error) {
    showToast('复制失败', '浏览器未开放剪贴板写入权限。', 'error');
  }
}

function exportConfig() {
  if (!state.currentConfig) {
    showToast('导出失败', '运行配置未就绪。', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(state.currentConfig, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mqttapi-config.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('文件导出成功', '已导出脱敏配置，敏感字段不会回显到浏览器。', 'success');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function initCustomSelects() {
  formEnhancements.initCustomSelects();
}

function setupCustomSelect(select) {
  formEnhancements.setupCustomSelect(select);
}

function renderCreatedApiKey(key) {
  apiKeysView.renderCreatedKey(key);
}

async function refreshApiKeys() {
  return apiKeysView.refresh();
}

function renderVisualDevicesList() {
  deviceConfigView.render();
}

function initDeveloperGuideDoc() {
  developerGuide.init();
}

function initCustomFormValidations() {
  formEnhancements.initCustomFormValidations();
}

async function boot() {
  try {
    bindPasswordToggle();
    // 1. 初始化 Tab 路由状态与双主题模式 (从 localStorage 读取持久化状态)
    const savedTheme = localStorage.getItem('mqttapi_theme') || 'light';
    switchTheme(savedTheme);

    const savedTab = localStorage.getItem('mqttapi_current_tab') || 'devices';
    switchTab(savedTab);

    // 2. 优先确认鉴权状态，再决定是否连接实时通道与拉取受保护 API
    await loadAuthStatus();

    if (canUsePrivateApi()) {
      await refreshStatus();
      await Promise.all([loadConfig(), refreshApiKeys(), automationView.refresh()]);
      initDeveloperGuideDoc(); // 初始化开发者 API 文档交互
    } else {
      renderCreatedApiKey(null);
      renderLockedMeta();
      scheduleRefresh();
    }
    initCustomSelects();
    initCustomFormValidations(); // 注入表单中文交互提示
  } catch (error) {
    showToast('初始化启动异常', error.message, 'error');
    scheduleRefresh();
  }
}

// 绑定导航页切换事件
elements.navItems.forEach(item => {
  item.addEventListener('click', () => {
    const pageId = item.dataset.page;
    switchTab(pageId);
    
    // 移动端体验：切换页面后自动收起左侧抽屉菜单与遮罩
    if (elements.sidebar && elements.sidebar.classList.contains('active')) {
      setMobileSidebarOpen(false);
    }
  });

  item.addEventListener('keydown', (e) => {
    if (['Enter', ' '].includes(e.key)) {
      e.preventDefault();
      item.click();
    }
  });
});

// 绑定安全准入独立的保存按钮点击事件
if (elements.saveSecurityButton) {
  elements.saveSecurityButton.addEventListener('click', (e) => {
    handleSave(e);
  });
}

// 绑定白天/黑夜主题切换
elements.themeToggle.addEventListener('change', (e) => {
  const isLight = e.target.checked;
  switchTheme(isLight ? 'light' : 'dark');
  showToast(
    isLight ? '白天模式已激活' : '黑夜模式已激活',
    isLight ? '已为您呈现亮洁清雅的白乳胶磨砂材质配色。' : '已恢复科技暗黑磨砂发光质感。',
    'info'
  );
  
  // 重新渲染当前可能打开的历史折线图（如果有的话），保证色彩同步
  if (!elements.historyModal.classList.contains('hidden') && state.lastHistoryData) {
    renderSvgHistoryChart(state.lastHistoryData);
  }
  if (state.lastHistoryData && state.currentTab === 'history') {
    renderMainSvgHistoryChart(state.lastHistoryData);
    renderHistoryTable(state.lastHistoryData);
  }
});



// 模态框关闭事件
elements.modalClose.addEventListener('click', () => {
  elements.historyModal.classList.add('hidden');
  state.lastHistoryData = null;
});

elements.historyModal.addEventListener('click', (e) => {
  if (e.target === elements.historyModal) {
    elements.historyModal.classList.add('hidden');
    state.lastHistoryData = null;
  }
});

// 全局键盘监听：Escape 退出 & Tab 焦点围栏 (Focus Trap)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!elements.historyModal.classList.contains('hidden')) {
      elements.historyModal.classList.add('hidden');
      state.lastHistoryData = null;
    }
    const deviceModal = elements.addDeviceModal;
    if (deviceModal && !deviceModal.classList.contains('hidden')) {
      deviceModal.classList.add('hidden');
    }
  }

  if (e.key === 'Tab') {
    const activeModal = [elements.historyModal, elements.addDeviceModal].find(
      modal => modal && !modal.classList.contains('hidden')
    );
    if (activeModal) {
      const focusables = activeModal.querySelectorAll('button, [tabindex="0"], input, select, textarea');
      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }
});

elements.configForm.addEventListener('submit', handleSave);
elements.loginForm.addEventListener('submit', handleLogin);
elements.logoutButton.addEventListener('click', handleLogout);
elements.reconnectButton.addEventListener('click', handleReconnect);
elements.resetButton.addEventListener('click', handleReset);
elements.exportConfigButton.addEventListener('click', exportConfig);
elements.refreshButton.addEventListener('click', () => {
  refreshStatus().catch((error) => showToast('手动刷新异常', error.message, 'error'));
});
elements.copyInfoButton.addEventListener('click', () => {
  copyText(JSON.stringify(state.lastInfo || {}, null, 2), '实时快照已复制。');
});
elements.copyTopicsButton.addEventListener('click', () => {
  const topics = state.lastInfo && state.lastInfo.subscribedTopics ? state.lastInfo.subscribedTopics.join('\n') : '';
  copyText(topics, '主题列表已复制。');
});
elements.autoRefreshToggle.addEventListener('change', () => {
  state.autoRefresh = elements.autoRefreshToggle.checked;
  scheduleRefresh();
});
document.addEventListener('visibilitychange', () => {
  scheduleRefresh();
  if (!document.hidden && state.autoRefresh) {
    refreshStatus().catch((error) => showToast('状态同步异常', error.message, 'error'));
  }
});

bindSecretFieldToggle(elements.mqttPassword, elements.mqttPasswordClear);
bindSecretFieldToggle(elements.authPassword, elements.authPasswordClear);
bindSecretFieldToggle(elements.authSessionSecret, elements.authSessionSecretClear);

layoutController.init();
boot();
