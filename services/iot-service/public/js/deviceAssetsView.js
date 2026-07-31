(function attachDeviceAssetsView(global) {
  'use strict';

  const ASSET_STATUS_LABELS = {
    inventory: '待投用',
    active: '运行中',
    maintenance: '维护中',
    retired: '已退役'
  };
  const MAINTENANCE_TYPE_LABELS = {
    inspection: '巡检',
    repair: '维修',
    firmware: '固件升级',
    calibration: '校准',
    other: '其他'
  };
  const TICKET_PRIORITY_LABELS = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '紧急'
  };
  const TICKET_STATUS_LABELS = {
    open: '待处理',
    in_progress: '处理中',
    resolved: '已解决',
    closed: '已关闭'
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTimestamp(value) {
    if (!value) return '--';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
  }

  function toDateInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 10);
  }

  function toDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }

  function readForm(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function setFormDisabled(form, disabled) {
    if (!form) return;
    Array.from(form.elements).forEach((element) => {
      element.disabled = disabled;
    });
  }

  function createDeviceAssetsView(options) {
    const {
      pane,
      subtabButton,
      deviceSelector,
      refreshButton,
      loadState,
      profileForm,
      profileMeta,
      profileDeleteButton,
      maintenanceForm,
      maintenanceSubmitButton,
      maintenanceCancelButton,
      maintenanceCount,
      maintenanceBody,
      ticketForm,
      ticketSubmitButton,
      ticketCancelButton,
      ticketOpenCount,
      ticketBody,
      requestJson,
      showToast,
      confirmDanger,
      addEvent
    } = options;

    const state = {
      asset: null,
      devices: [],
      loadedDeviceId: '',
      maintenance: [],
      refreshVersion: 0,
      tickets: []
    };

    function selectedDeviceId() {
      return String(deviceSelector?.value || '');
    }

    function selectedDeviceName() {
      const deviceId = selectedDeviceId();
      const device = state.devices.find((item) => String(item.id) === deviceId);
      return device?.name || deviceId;
    }

    function endpoint(path = '') {
      return `/api/devices/${encodeURIComponent(selectedDeviceId())}${path}`;
    }

    function setLoadState(message, loading = false) {
      if (loadState) loadState.textContent = message;
      if (refreshButton) refreshButton.disabled = loading || !selectedDeviceId();
    }

    function renderProfile() {
      const asset = state.asset;
      profileForm.elements.location.value = asset?.location || '';
      profileForm.elements.owner.value = asset?.owner || '';
      profileForm.elements.firmwareVersion.value = asset?.firmwareVersion || '';
      profileForm.elements.status.value = asset?.status || 'active';
      profileForm.elements.installedAt.value = toDateInput(asset?.installedAt);
      profileForm.elements.warrantyExpiresAt.value = toDateInput(asset?.warrantyExpiresAt);
      profileForm.elements.purpose.value = asset?.purpose || '';
      profileMeta.textContent = asset
        ? `${selectedDeviceName()} · ${ASSET_STATUS_LABELS[asset.status] || asset.status} · 更新于 ${formatTimestamp(asset.updatedAt)}`
        : `${selectedDeviceName()} · 尚未建档`;
      profileDeleteButton.disabled = !asset;
    }

    function renderMaintenance() {
      maintenanceCount.textContent = String(state.maintenance.length);
      if (state.maintenance.length === 0) {
        maintenanceBody.innerHTML = '<tr><td colspan="6" class="muted">暂无维护记录</td></tr>';
        return;
      }

      maintenanceBody.innerHTML = state.maintenance.map((record) => `
        <tr>
          <td>${escapeHtml(formatTimestamp(record.performedAt))}</td>
          <td title="${escapeHtml(record.description)}">${escapeHtml(record.title)}</td>
          <td>${escapeHtml(MAINTENANCE_TYPE_LABELS[record.type] || record.type)}</td>
          <td>${escapeHtml(record.performedBy || '--')}</td>
          <td>${escapeHtml(formatTimestamp(record.nextDueAt))}</td>
          <td>
            <div class="asset-table-actions">
              <button class="button button-secondary" type="button" data-maintenance-action="edit" data-record-id="${escapeHtml(record.id)}">编辑</button>
              <button class="button button-secondary" type="button" data-maintenance-action="delete" data-record-id="${escapeHtml(record.id)}">删除</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    function renderTickets() {
      const openCount = state.tickets.filter((ticket) => ['open', 'in_progress'].includes(ticket.status)).length;
      ticketOpenCount.textContent = String(openCount);
      if (state.tickets.length === 0) {
        ticketBody.innerHTML = '<tr><td colspan="7" class="muted">暂无故障工单</td></tr>';
        return;
      }

      ticketBody.innerHTML = state.tickets.map((ticket) => `
        <tr>
          <td>${escapeHtml(formatTimestamp(ticket.occurredAt))}</td>
          <td title="${escapeHtml(ticket.description)}">${escapeHtml(ticket.title)}</td>
          <td>${escapeHtml(TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority)}</td>
          <td>
            <select class="asset-inline-select" data-ticket-status data-ticket-id="${escapeHtml(ticket.id)}" aria-label="${escapeHtml(ticket.title)}状态">
              ${Object.entries(TICKET_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${ticket.status === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </td>
          <td>${escapeHtml(ticket.assignee || '--')}</td>
          <td>${escapeHtml(formatTimestamp(ticket.updatedAt))}</td>
          <td>
            <div class="asset-table-actions">
              <button class="button button-secondary" type="button" data-ticket-action="edit" data-ticket-id="${escapeHtml(ticket.id)}">编辑</button>
              <button class="button button-secondary" type="button" data-ticket-action="delete" data-ticket-id="${escapeHtml(ticket.id)}">删除</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    function resetMaintenanceForm() {
      maintenanceForm.reset();
      maintenanceForm.elements.id.value = '';
      maintenanceForm.elements.type.value = 'inspection';
      maintenanceForm.elements.performedAt.value = toDateTimeInput(Date.now());
      maintenanceSubmitButton.textContent = '新增维护记录';
      maintenanceCancelButton.classList.add('hidden');
    }

    function resetTicketForm() {
      ticketForm.reset();
      ticketForm.elements.id.value = '';
      ticketForm.elements.priority.value = 'medium';
      ticketForm.elements.status.value = 'open';
      ticketForm.elements.occurredAt.value = toDateTimeInput(Date.now());
      ticketSubmitButton.textContent = '新建故障工单';
      ticketCancelButton.classList.add('hidden');
    }

    function renderEmptySelection() {
      state.asset = null;
      state.maintenance = [];
      state.tickets = [];
      state.loadedDeviceId = '';
      setFormDisabled(profileForm, true);
      setFormDisabled(maintenanceForm, true);
      setFormDisabled(ticketForm, true);
      profileMeta.textContent = '尚未选择设备';
      maintenanceCount.textContent = '0';
      ticketOpenCount.textContent = '0';
      maintenanceBody.innerHTML = '<tr><td colspan="6" class="muted">请选择设备</td></tr>';
      ticketBody.innerHTML = '<tr><td colspan="7" class="muted">请选择设备</td></tr>';
      profileDeleteButton.disabled = true;
      setLoadState(state.devices.length > 0 ? '请选择设备' : '暂无可管理设备');
    }

    async function refresh() {
      const deviceId = selectedDeviceId();
      if (!deviceId) {
        renderEmptySelection();
        return;
      }

      const refreshVersion = ++state.refreshVersion;
      setLoadState('正在同步...', true);
      try {
        const [asset, maintenance, tickets] = await Promise.all([
          requestJson(endpoint('/asset')),
          requestJson(endpoint('/maintenance?limit=100')),
          requestJson(endpoint('/tickets?limit=100'))
        ]);
        if (refreshVersion !== state.refreshVersion || deviceId !== selectedDeviceId()) return;
        state.asset = asset;
        state.maintenance = Array.isArray(maintenance) ? maintenance : [];
        state.tickets = Array.isArray(tickets) ? tickets : [];
        state.loadedDeviceId = deviceId;
        setFormDisabled(profileForm, false);
        setFormDisabled(maintenanceForm, false);
        setFormDisabled(ticketForm, false);
        renderProfile();
        renderMaintenance();
        renderTickets();
        resetMaintenanceForm();
        resetTicketForm();
        setLoadState(`已同步 ${formatTimestamp(Date.now())}`);
      } catch (error) {
        if (refreshVersion !== state.refreshVersion) return;
        setLoadState('同步失败');
        showToast('资产数据同步失败', error.message, 'error');
      }
    }

    function setDevices(devices) {
      state.devices = Array.isArray(devices) ? devices : [];
      const previous = selectedDeviceId();
      deviceSelector.innerHTML = [
        '<option value="">选择设备...</option>',
        ...state.devices.map((device) => `<option value="${escapeHtml(device.id)}">${escapeHtml(device.name || device.id)} · ${escapeHtml(device.id)}</option>`)
      ].join('');
      const next = state.devices.some((device) => String(device.id) === previous)
        ? previous
        : String(state.devices[0]?.id || '');
      deviceSelector.value = next;
      if (!next) renderEmptySelection();
      else {
        setFormDisabled(profileForm, false);
        setFormDisabled(maintenanceForm, false);
        setFormDisabled(ticketForm, false);
        setLoadState('等待同步');
        if (pane && !pane.classList.contains('hidden')) refresh();
      }
    }

    async function saveProfile(event) {
      event.preventDefault();
      if (!selectedDeviceId()) return;
      const submitButton = profileForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      try {
        const data = readForm(profileForm);
        state.asset = await requestJson(endpoint('/asset'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        renderProfile();
        addEvent?.(`设备资产资料已更新: ${selectedDeviceId()}`);
        showToast('资产资料已保存', selectedDeviceName(), 'success');
      } catch (error) {
        showToast('资产资料保存失败', error.message, 'error');
      } finally {
        submitButton.disabled = false;
      }
    }

    async function deleteProfile() {
      if (!state.asset || !selectedDeviceId()) return;
      const confirmed = await confirmDanger('清空资产资料', `确定清空 ${selectedDeviceName()} 的资产资料吗？维护记录和故障工单会保留。`);
      if (!confirmed) return;
      profileDeleteButton.disabled = true;
      try {
        await requestJson(endpoint('/asset'), { method: 'DELETE' });
        state.asset = null;
        renderProfile();
        addEvent?.(`设备资产资料已清空: ${selectedDeviceId()}`);
        showToast('资产资料已清空', selectedDeviceName(), 'success');
      } catch (error) {
        showToast('清空资产资料失败', error.message, 'error');
        profileDeleteButton.disabled = false;
      }
    }

    async function saveMaintenance(event) {
      event.preventDefault();
      const data = readForm(maintenanceForm);
      const recordId = data.id;
      delete data.id;
      maintenanceSubmitButton.disabled = true;
      try {
        await requestJson(endpoint(recordId ? `/maintenance/${encodeURIComponent(recordId)}` : '/maintenance'), {
          method: recordId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        showToast(recordId ? '维护记录已更新' : '维护记录已新增', selectedDeviceName(), 'success');
        addEvent?.(`维护记录${recordId ? '已更新' : '已新增'}: ${selectedDeviceId()}`);
        await refresh();
      } catch (error) {
        showToast('维护记录保存失败', error.message, 'error');
      } finally {
        maintenanceSubmitButton.disabled = false;
      }
    }

    function editMaintenance(recordId) {
      const record = state.maintenance.find((item) => item.id === recordId);
      if (!record) return;
      maintenanceForm.elements.id.value = record.id;
      maintenanceForm.elements.title.value = record.title;
      maintenanceForm.elements.type.value = record.type;
      maintenanceForm.elements.performedBy.value = record.performedBy || '';
      maintenanceForm.elements.performedAt.value = toDateTimeInput(record.performedAt);
      maintenanceForm.elements.nextDueAt.value = toDateTimeInput(record.nextDueAt);
      maintenanceForm.elements.description.value = record.description || '';
      maintenanceSubmitButton.textContent = '保存维护记录';
      maintenanceCancelButton.classList.remove('hidden');
      maintenanceForm.elements.title.focus();
    }

    async function deleteMaintenance(recordId) {
      const record = state.maintenance.find((item) => item.id === recordId);
      if (!record) return;
      if (!await confirmDanger('删除维护记录', `确定删除“${record.title}”吗？`)) return;
      try {
        await requestJson(endpoint(`/maintenance/${encodeURIComponent(recordId)}`), { method: 'DELETE' });
        showToast('维护记录已删除', record.title, 'success');
        await refresh();
      } catch (error) {
        showToast('维护记录删除失败', error.message, 'error');
      }
    }

    async function saveTicket(event) {
      event.preventDefault();
      const data = readForm(ticketForm);
      const ticketId = data.id;
      delete data.id;
      ticketSubmitButton.disabled = true;
      try {
        await requestJson(endpoint(ticketId ? `/tickets/${encodeURIComponent(ticketId)}` : '/tickets'), {
          method: ticketId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        showToast(ticketId ? '故障工单已更新' : '故障工单已创建', selectedDeviceName(), 'success');
        addEvent?.(`故障工单${ticketId ? '已更新' : '已创建'}: ${selectedDeviceId()}`);
        await refresh();
      } catch (error) {
        showToast('故障工单保存失败', error.message, 'error');
      } finally {
        ticketSubmitButton.disabled = false;
      }
    }

    function editTicket(ticketId) {
      const ticket = state.tickets.find((item) => item.id === ticketId);
      if (!ticket) return;
      ticketForm.elements.id.value = ticket.id;
      ticketForm.elements.title.value = ticket.title;
      ticketForm.elements.priority.value = ticket.priority;
      ticketForm.elements.status.value = ticket.status;
      ticketForm.elements.assignee.value = ticket.assignee || '';
      ticketForm.elements.occurredAt.value = toDateTimeInput(ticket.occurredAt);
      ticketForm.elements.description.value = ticket.description;
      ticketSubmitButton.textContent = '保存故障工单';
      ticketCancelButton.classList.remove('hidden');
      ticketForm.elements.title.focus();
    }

    async function deleteTicket(ticketId) {
      const ticket = state.tickets.find((item) => item.id === ticketId);
      if (!ticket) return;
      if (!await confirmDanger('删除故障工单', `确定删除“${ticket.title}”吗？`)) return;
      try {
        await requestJson(endpoint(`/tickets/${encodeURIComponent(ticketId)}`), { method: 'DELETE' });
        showToast('故障工单已删除', ticket.title, 'success');
        await refresh();
      } catch (error) {
        showToast('故障工单删除失败', error.message, 'error');
      }
    }

    async function updateTicketStatus(select) {
      const ticketId = select.dataset.ticketId;
      const ticket = state.tickets.find((item) => item.id === ticketId);
      if (!ticket || ticket.status === select.value) return;
      select.disabled = true;
      try {
        const updated = await requestJson(endpoint(`/tickets/${encodeURIComponent(ticketId)}/status`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: select.value })
        });
        state.tickets = state.tickets.map((item) => item.id === ticketId ? updated : item);
        renderTickets();
        addEvent?.(`故障工单状态已更新: ${ticketId} -> ${updated.status}`);
        showToast('工单状态已更新', TICKET_STATUS_LABELS[updated.status], 'success');
      } catch (error) {
        select.value = ticket.status;
        select.disabled = false;
        showToast('工单状态更新失败', error.message, 'error');
      }
    }

    function init() {
      resetMaintenanceForm();
      resetTicketForm();
      renderEmptySelection();
      deviceSelector.addEventListener('change', refresh);
      refreshButton.addEventListener('click', refresh);
      subtabButton?.addEventListener('click', () => {
        if (selectedDeviceId() && state.loadedDeviceId !== selectedDeviceId()) refresh();
      });
      profileForm.addEventListener('submit', saveProfile);
      profileDeleteButton.addEventListener('click', deleteProfile);
      maintenanceForm.addEventListener('submit', saveMaintenance);
      maintenanceCancelButton.addEventListener('click', resetMaintenanceForm);
      ticketForm.addEventListener('submit', saveTicket);
      ticketCancelButton.addEventListener('click', resetTicketForm);
      maintenanceBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-maintenance-action]');
        if (!button) return;
        if (button.dataset.maintenanceAction === 'edit') editMaintenance(button.dataset.recordId);
        if (button.dataset.maintenanceAction === 'delete') deleteMaintenance(button.dataset.recordId);
      });
      ticketBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ticket-action]');
        if (!button) return;
        if (button.dataset.ticketAction === 'edit') editTicket(button.dataset.ticketId);
        if (button.dataset.ticketAction === 'delete') deleteTicket(button.dataset.ticketId);
      });
      ticketBody.addEventListener('change', (event) => {
        const select = event.target.closest('[data-ticket-status]');
        if (select) updateTicketStatus(select);
      });
    }

    return {
      init,
      refresh,
      setDevices
    };
  }

  global.MqttApiDeviceAssets = {
    createDeviceAssetsView
  };
})(window);
