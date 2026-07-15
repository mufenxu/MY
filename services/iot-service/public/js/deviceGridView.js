(function (global) {
  'use strict';

  const CONTROL_FEEDBACK_TIMEOUT_MS = 5000;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function noop() {}

  function getDeviceId(device) {
    return String(device.id || '');
  }

  function getDeviceName(device) {
    return device.name || getDeviceId(device) || '未命名设备';
  }

  function getRelayIds(device) {
    return device.relays ? Object.keys(device.relays) : [];
  }

  function isSensorDevice(device) {
    return device.temp !== undefined || device.hum !== undefined;
  }

  function formatMetric(value, unit) {
    return value == null ? '--' : `${value} ${unit}`;
  }

  function getDeviceSignature(device) {
    const relayIds = getRelayIds(device).join('|');
    return `${getDeviceId(device)}::${isSensorDevice(device) ? 'sensor' : 'plain'}::${relayIds}`;
  }

  function findCardByDeviceId(container, deviceId) {
    return Array.from(container.querySelectorAll('.device-card')).find((card) => card.dataset.id === String(deviceId));
  }

  function findRelayToggle(card, relayId) {
    return Array.from(card.querySelectorAll('.relay-toggle')).find((toggle) => toggle.dataset.relayId === String(relayId));
  }

  function renderEmptyState() {
    return `
      <div class="empty-state-wrapper">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
          <line x1="8" y1="21" x2="16" y2="21"></line>
          <line x1="12" y1="17" x2="12" y2="21"></line>
        </svg>
        <h3>尚无物联网设备</h3>
        <p>系统目前未映射任何硬件设备，无法订阅传感器数据或控制继电器。</p>
        <button class="button button-primary empty-state-action-btn" type="button">前往系统配置添加设备</button>
      </div>
    `;
  }

  function renderRelayControl(device, relayId) {
    const deviceId = getDeviceId(device);
    const isOffline = device.onlineStatus !== 'online';
    const status = device.relays[relayId];

    return `
      <div class="relay-control-row">
        <div class="relay-info">
          <span>继电器: ${escapeHtml(relayId)}</span>
          <small class="relay-status-text">当前状态: ${escapeHtml(status || '--')}</small>
        </div>
        <label class="switch">
          <input type="checkbox" class="relay-toggle" data-device-id="${escapeHtml(deviceId)}" data-relay-id="${escapeHtml(relayId)}" ${status === 'ON' ? 'checked' : ''} ${isOffline ? 'disabled' : ''} />
          <span class="slider"></span>
        </label>
      </div>
    `;
  }

  function renderDeviceCard(device) {
    const deviceId = getDeviceId(device);
    const relayIds = getRelayIds(device);
    const hasRelays = relayIds.length > 0;
    const isOffline = device.onlineStatus !== 'online';

    return `
      <article class="panel device-card ${isOffline ? 'offline' : ''}" data-id="${escapeHtml(deviceId)}" data-signature="${escapeHtml(getDeviceSignature(device))}">
        <div class="device-card-header">
          <div class="device-title">
            <h3>${escapeHtml(getDeviceName(device))}</h3>
            <span>ID: ${escapeHtml(deviceId)}</span>
          </div>
          <span class="device-status-dot ${device.onlineStatus === 'online' ? 'online' : 'offline'}">
            ${device.onlineStatus === 'online' ? '在线' : '离线'}
          </span>
        </div>

        ${isSensorDevice(device) ? `
          <div class="device-metrics">
            <div class="device-metric-item">
              <label>温度</label>
              <strong class="temp-val">${formatMetric(device.temp, '°C')}</strong>
            </div>
            <div class="device-metric-item">
              <label>湿度</label>
              <strong class="hum-val">${formatMetric(device.hum, '%RH')}</strong>
            </div>
          </div>
          <button class="button button-secondary device-card-btn history-btn" type="button">查看历史趋势</button>
        ` : ''}

        ${hasRelays ? `
          <div class="relay-list">
            ${relayIds.map((relayId) => renderRelayControl(device, relayId)).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  function structureMatches(container, deviceList) {
    const cards = Array.from(container.querySelectorAll('.device-card'));

    if (cards.length !== deviceList.length) {
      return false;
    }

    return deviceList.every((device) => {
      const card = findCardByDeviceId(container, getDeviceId(device));
      return card && card.dataset.signature === getDeviceSignature(device);
    });
  }

  function createDeviceGridView(options = {}) {
    const {
      container,
      showToast = noop,
      updateMetricValue = (element, value) => {
        if (element) element.textContent = value;
      },
      requestJson,
      addEvent = noop,
      getControlTimeouts = () => ({}),
      getLatestDevice = () => ({}),
      historyRequestTimeoutMs = 30000,
      historyModal,
      modalDeviceId,
      modalDeviceName,
      historyChartBox,
      setLastHistoryData = noop,
      renderHistoryChart = noop,
      goToConfig = noop
    } = options;

    function render(devices) {
      if (!container) return;

      const deviceList = Object.values(devices || {});

      if (deviceList.length === 0) {
        container.innerHTML = renderEmptyState();
        const configButton = container.querySelector('.empty-state-action-btn');
        if (configButton) {
          configButton.addEventListener('click', goToConfig);
        }
        return;
      }

      if (!structureMatches(container, deviceList)) {
        container.innerHTML = deviceList.map(renderDeviceCard).join('');
        bindEvents();
        return;
      }

      updateDevices(deviceList);
    }

    function updateDevices(deviceList) {
      deviceList.forEach((device) => {
        const card = findCardByDeviceId(container, getDeviceId(device));
        if (!card) return;

        const isOffline = device.onlineStatus !== 'online';
        card.classList.toggle('offline', isOffline);
        updateOnlineStatus(card, device);
        updateMetrics(card, device);
        updateRelays(card, device, isOffline);
      });
    }

    function updateOnlineStatus(card, device) {
      const dot = card.querySelector('.device-status-dot');
      if (!dot) return;

      const wasOnline = dot.classList.contains('online');
      const isNowOnline = device.onlineStatus === 'online';

      if (wasOnline === isNowOnline) {
        return;
      }

      dot.className = `device-status-dot ${isNowOnline ? 'online' : 'offline'}`;
      dot.textContent = isNowOnline ? '在线' : '离线';
      showToast(getDeviceName(device), isNowOnline ? '设备已上线连接。' : '设备连接已断开！', isNowOnline ? 'success' : 'error');
    }

    function updateMetrics(card, device) {
      updateMetricValue(card.querySelector('.temp-val'), formatMetric(device.temp, '°C'));
      updateMetricValue(card.querySelector('.hum-val'), formatMetric(device.hum, '%RH'));
    }

    function updateRelays(card, device, isOffline) {
      if (!device.relays) return;

      Object.entries(device.relays).forEach(([relayId, status]) => {
        const key = `${getDeviceId(device)}:${relayId}`;
        const toggle = findRelayToggle(card, relayId);
        const row = toggle ? toggle.closest('.relay-control-row') : null;
        const statusText = row ? row.querySelector('.relay-status-text') : null;

        if (statusText) {
          statusText.textContent = `当前状态: ${status || '--'}`;
        }

        if (!toggle) {
          return;
        }

        toggle.disabled = isOffline;

        const controlTimeouts = getControlTimeouts();
        if (controlTimeouts[key]) {
          const expectedStatus = toggle.checked ? 'ON' : 'OFF';
          if (status === expectedStatus) {
            clearTimeout(controlTimeouts[key]);
            delete controlTimeouts[key];
            showToast(getDeviceName(device), `${relayId} 控制指令响应完成！`, 'success');
          }
          return;
        }

        const previousChecked = toggle.checked;
        const nextChecked = status === 'ON';
        toggle.checked = nextChecked;
        if (toggle.nextElementSibling) {
          toggle.nextElementSibling.className = 'slider';
        }

        if (previousChecked !== nextChecked && status !== null) {
          showToast(getDeviceName(device), `${relayId} 物理状态同步为 ${status}`, 'info');
        }
      });
    }

    function bindEvents() {
      container.querySelectorAll('.relay-toggle').forEach((toggle) => {
        toggle.addEventListener('change', (event) => {
          handleRelayChange(event, toggle);
        });
      });

      container.querySelectorAll('.history-btn').forEach((button) => {
        button.addEventListener('click', () => {
          handleHistoryClick(button);
        });
      });
    }

    async function handleRelayChange(event, toggle) {
      const deviceId = toggle.dataset.deviceId;
      const relayId = toggle.dataset.relayId;
      const isChecked = toggle.checked;
      const targetStatus = isChecked ? 'ON' : 'OFF';
      const key = `${deviceId}:${relayId}`;
      const card = toggle.closest('.device-card');

      if (card && card.classList.contains('offline')) {
        event.preventDefault();
        toggle.checked = !isChecked;
        showToast('控制失败', '设备当前处于离线状态，无法发送控制指令。', 'error');
        return;
      }

      const controlTimeouts = getControlTimeouts();
      clearTimeout(controlTimeouts[key]);

      try {
        await requestJson(`/api/devices/${deviceId}/relays/${relayId}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: targetStatus })
        });
        addEvent(`下发指令: ${deviceId}.${relayId} -> ${targetStatus}`);

        controlTimeouts[key] = setTimeout(() => {
          const latestDevice = getLatestDevice(deviceId) || {};
          const currentRealStatus = latestDevice.relays ? latestDevice.relays[relayId] : undefined;

          if (currentRealStatus !== targetStatus) {
            showToast(latestDevice.name || deviceId, `${relayId} 未收到硬件响应，状态已回退。`, 'warning');
            toggle.checked = currentRealStatus === 'ON';
          }

          delete controlTimeouts[key];
        }, CONTROL_FEEDBACK_TIMEOUT_MS);
      } catch (error) {
        showToast('指令下发失败', error.message, 'error');
        toggle.checked = !isChecked;
      }
    }

    async function handleHistoryClick(button) {
      const card = button.closest('.device-card');
      if (!card || !requestJson) return;

      const deviceId = card.dataset.id;
      const title = card.querySelector('.device-title h3');
      const deviceName = title ? title.textContent : deviceId;

      if (modalDeviceId) {
        modalDeviceId.textContent = `ID: ${deviceId}`;
      }
      if (modalDeviceName) {
        modalDeviceName.textContent = `${deviceName} - 历史趋势`;
      }
      if (historyChartBox) {
        historyChartBox.innerHTML = '<p class="muted" style="text-align:center; padding-top:100px;">正在提取 SQLite 传感器采样...</p>';
      }
      if (historyModal) {
        historyModal.classList.remove('hidden');
      }

      try {
        const data = await requestJson(`/api/devices/${deviceId}/history`, {
          timeoutMs: historyRequestTimeoutMs
        });
        setLastHistoryData(data);
        renderHistoryChart(data);
      } catch (error) {
        if (historyChartBox) {
          historyChartBox.innerHTML = `<p class="toast error" style="margin:20px; width:auto; transform:none; opacity:1; pointer-events:auto;">提取历史数据失败: ${escapeHtml(error.message)}</p>`;
        }
      }
    }

    return { render };
  }

  global.MqttApiDeviceGrid = {
    createDeviceGridView
  };
})(window);
