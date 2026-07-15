(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizeRelays(device) {
    if (Array.isArray(device.relays)) {
      return device.relays;
    }

    device.relays = device.relays
      ? Object.entries(device.relays).map(([id, group]) => {
          const isString = typeof group === 'string';
          const source = group && typeof group === 'object' ? group : {};

          return {
            id,
            name: `${id} 继电器`,
            statusTopic: isString ? `home/${device.id}/relay/${id}/state` : (source.status || source.statusTopic || ''),
            controlTopic: isString ? `home/${device.id}/relay/${id}/control` : (source.control || source.controlTopic || '')
          };
        })
      : [];

    return device.relays;
  }

  function createRelayId(relays) {
    let counter = 1;
    let id = 'relay1';

    while (relays.some((relay) => relay.id === id)) {
      counter += 1;
      id = `relay${counter}`;
    }

    return id;
  }

  function createDeviceTopics(deviceId) {
    return {
      temp: '',
      hum: '',
      online: `home/${deviceId}/status`
    };
  }

  function renderRelayConfig(relay, relayIndex) {
    return `
      <div class="relay-config-item" data-idx="${relayIndex}">
        <div class="relay-input-col">
          <span class="relay-input-label">标识 ID</span>
          <input type="text" class="relay-id-input" value="${escapeHtml(relay.id)}" placeholder="例如: relay1" />
        </div>
        <div class="relay-input-col">
          <span class="relay-input-label">状态反馈主题 (订阅)</span>
          <input type="text" class="relay-status-input" value="${escapeHtml(relay.statusTopic)}" placeholder="例如: home/relay/status" />
        </div>
        <div class="relay-input-col">
          <span class="relay-input-label">命令控制主题 (发布)</span>
          <input type="text" class="relay-control-input" value="${escapeHtml(relay.controlTopic)}" placeholder="例如: home/relay/control" />
        </div>
        <button class="delete-relay-btn relay-trash-btn" data-idx="${relayIndex}" type="button" title="移除继电器">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;
  }

  function renderDeviceConfigCard(device, deviceIndex) {
    const topics = device.topics || {};
    const relays = normalizeRelays(device);
    const relaysHtml = relays.length === 0
      ? '<div class="empty-relay-prompt">目前未绑定任何继电器控制组件。</div>'
      : relays.map(renderRelayConfig).join('');

    return `
      <div class="visual-device-card" data-idx="${deviceIndex}">
        <div class="device-card-header">
          <div class="device-info-meta">
            <span class="device-badge-dot"></span>
            <div>
              <h4>${escapeHtml(device.name)}</h4>
              <code class="device-id-code">ID: ${escapeHtml(device.id)}</code>
            </div>
          </div>
          <button class="device-delete-btn delete-device-btn" data-idx="${deviceIndex}" type="button" title="删除此设备">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span>删除设备</span>
          </button>
        </div>

        <div class="device-card-body">
          <div class="device-config-section">
            <div class="section-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path><path d="M2 12h20"></path></svg>
              <span>环境传感器主题配置</span>
            </div>
            <div class="device-fields-grid">
              <label class="field-item">
                <span>温度订阅主题 (Topic)</span>
                <input type="text" class="device-temp-topic" data-idx="${deviceIndex}" value="${escapeHtml(topics.temp || '')}" placeholder="例如: home/sensor/temp" />
              </label>
              <label class="field-item">
                <span>湿度订阅主题 (Topic)</span>
                <input type="text" class="device-hum-topic" data-idx="${deviceIndex}" value="${escapeHtml(topics.hum || '')}" placeholder="例如: home/sensor/hum" />
              </label>
            </div>
          </div>

          <div class="device-config-section">
            <div class="section-header-row">
              <div class="section-badge">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                <span>继电器控制部件映射</span>
              </div>
              <button class="add-relay-btn button button-secondary mini-action-btn" data-idx="${deviceIndex}" type="button">+ 添加部件</button>
            </div>

            <div class="relay-config-list" data-idx="${deviceIndex}">
              ${relaysHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function createDeviceConfigView(options = {}) {
    const {
      listContainer,
      addButton,
      modal,
      closeButton,
      form,
      idInput,
      nameInput,
      getDevices = () => [],
      setDevices = () => {},
      confirmRemoveDevice = () => Promise.resolve(true),
      showToast = () => {},
      markUnsaved = () => {}
    } = options;

    function ensureDevices() {
      const devices = getDevices();
      if (Array.isArray(devices)) {
        return devices;
      }

      const nextDevices = [];
      setDevices(nextDevices);
      return nextDevices;
    }

    function markDirty() {
      markUnsaved();
    }

    function render() {
      if (!listContainer) return;

      const devices = ensureDevices();
      if (devices.length === 0) {
        listContainer.innerHTML = '<p class="muted" style="text-align:center; padding: 20px 0;">当前未映射任何物联网设备，请点击“新增设备”开始添加。</p>';
        return;
      }

      listContainer.innerHTML = devices.map(renderDeviceConfigCard).join('');
      bindCardEvents();
    }

    function bindCardEvents() {
      const devices = ensureDevices();
      const cards = listContainer.querySelectorAll('.visual-device-card');

      cards.forEach((card) => {
        const deviceIndex = Number.parseInt(card.dataset.idx, 10);
        const device = devices[deviceIndex];
        if (!device) return;

        bindDeviceEvents(card, device, deviceIndex, devices);
        bindRelayEvents(card, device);
      });
    }

    function bindDeviceEvents(card, device, deviceIndex, devices) {
      const deleteButton = card.querySelector('.delete-device-btn');
      const tempInput = card.querySelector('.device-temp-topic');
      const humInput = card.querySelector('.device-hum-topic');
      const addRelayButton = card.querySelector('.add-relay-btn');

      if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
          const ok = await confirmRemoveDevice(device);
          if (!ok) return;

          devices.splice(deviceIndex, 1);
          render();
          markDirty();
        });
      }

      if (tempInput) {
        tempInput.addEventListener('change', (event) => {
          device.topics = device.topics || createDeviceTopics(device.id);
          device.topics.temp = event.target.value.trim();
          markDirty();
        });
      }

      if (humInput) {
        humInput.addEventListener('change', (event) => {
          device.topics = device.topics || createDeviceTopics(device.id);
          device.topics.hum = event.target.value.trim();
          markDirty();
        });
      }

      if (addRelayButton) {
        addRelayButton.addEventListener('click', () => {
          const relays = normalizeRelays(device);
          const relayId = createRelayId(relays);
          relays.push({
            id: relayId,
            name: `${relayId} 继电器`,
            statusTopic: `home/${device.id}/relay/${relayId}/state`,
            controlTopic: `home/${device.id}/relay/${relayId}/control`
          });
          render();
          markDirty();
        });
      }
    }

    function bindRelayEvents(card, device) {
      const relays = normalizeRelays(device);
      const relayItems = card.querySelectorAll('.relay-config-item');

      relayItems.forEach((item) => {
        const relayIndex = Number.parseInt(item.dataset.idx, 10);
        const relay = relays[relayIndex];
        if (!relay) return;

        const idInput = item.querySelector('.relay-id-input');
        const statusInput = item.querySelector('.relay-status-input');
        const controlInput = item.querySelector('.relay-control-input');
        const deleteButton = item.querySelector('.delete-relay-btn');

        if (idInput) {
          idInput.addEventListener('change', (event) => {
            const nextRelayId = event.target.value.trim();
            if (!nextRelayId || nextRelayId === relay.id) {
              event.target.value = relay.id;
              return;
            }

            const duplicate = relays.some((itemRelay, index) => index !== relayIndex && itemRelay.id === nextRelayId);
            if (duplicate) {
              showToast('标识冲突', '该设备中已存在同名继电器标识！', 'error');
              event.target.value = relay.id;
              return;
            }

            relay.id = nextRelayId;
            relay.name = `${nextRelayId} 继电器`;
            render();
            markDirty();
          });
        }

        if (statusInput) {
          statusInput.addEventListener('change', (event) => {
            relay.statusTopic = event.target.value.trim();
            markDirty();
          });
        }

        if (controlInput) {
          controlInput.addEventListener('change', (event) => {
            relay.controlTopic = event.target.value.trim();
            markDirty();
          });
        }

        if (deleteButton) {
          deleteButton.addEventListener('click', () => {
            relays.splice(relayIndex, 1);
            render();
            markDirty();
          });
        }
      });
    }

    function openAddModal() {
      if (idInput) {
        idInput.value = '';
      }
      if (nameInput) {
        nameInput.value = '';
      }
      if (modal) {
        modal.classList.remove('hidden');
      }
    }

    function closeAddModal() {
      if (modal) {
        modal.classList.add('hidden');
      }
    }

    function handleAddDeviceSubmit(event) {
      event.preventDefault();

      const deviceId = idInput ? idInput.value.trim() : '';
      const deviceName = nameInput ? nameInput.value.trim() : '';
      if (!deviceId || !deviceName) return;

      const devices = ensureDevices();
      if (devices.some((device) => device.id === deviceId)) {
        showToast('添加设备失败', '已存在同名设备 ID！', 'error');
        return;
      }

      devices.push({
        id: deviceId,
        name: deviceName,
        topics: createDeviceTopics(deviceId),
        relays: {}
      });

      closeAddModal();
      render();
      markDirty();
      showToast('设备创建成功', '请继续为该设备配置温湿度或继电器控键。', 'success');
    }

    if (addButton) {
      addButton.addEventListener('click', openAddModal);
    }

    if (closeButton) {
      closeButton.addEventListener('click', closeAddModal);
    }

    if (form) {
      form.addEventListener('submit', handleAddDeviceSubmit);
    }

    global.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeAddModal();
      }
    });

    return {
      closeAddModal,
      openAddModal,
      render
    };
  }

  global.MqttApiDeviceConfig = {
    createDeviceConfigView
  };
})(window);
