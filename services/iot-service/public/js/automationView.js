(function attachAutomationView(global) {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function createAutomationView(options) {
    const {
      requestJson,
      getDevices,
      showToast,
      confirmDanger,
      formatTimestamp
    } = options;
    const elements = {
      refresh: document.getElementById('automation-refresh'),
      scenes: document.getElementById('automation-scenes'),
      rules: document.getElementById('automation-rules'),
      runs: document.getElementById('automation-runs'),
      sceneForm: document.getElementById('scene-form'),
      ruleForm: document.getElementById('rule-form')
    };
    const drafts = { scene: [], rule: [] };
    let refreshPromise = null;

    function devices() {
      return (getDevices() || []).filter((device) => Array.isArray(device.relays) && device.relays.length > 0);
    }

    function deviceOptions(selected = '') {
      const list = devices();
      if (!list.length) return '<option value="">暂无继电器设备</option>';
      return list.map((device) => `
        <option value="${escapeHtml(device.id)}" ${device.id === selected ? 'selected' : ''}>${escapeHtml(device.name || device.id)}</option>
      `).join('');
    }

    function relayOptions(deviceId, selected = '') {
      const device = devices().find((item) => item.id === deviceId) || devices()[0];
      if (!device) return '<option value="">暂无继电器</option>';
      return (device.relays || []).map((relay) => `
        <option value="${escapeHtml(relay.id)}" ${relay.id === selected ? 'selected' : ''}>${escapeHtml(relay.name || relay.id)}</option>
      `).join('');
    }

    function deviceName(deviceId) {
      const device = devices().find((item) => item.id === deviceId);
      return device?.name || deviceId;
    }

    function relayName(deviceId, relayId) {
      const device = devices().find((item) => item.id === deviceId);
      return device?.relays?.find((relay) => relay.id === relayId)?.name || relayId;
    }

    function populateDeviceSelect(select) {
      if (!select) return;
      const current = select.value;
      select.innerHTML = deviceOptions(current);
      if (!select.value && devices()[0]) select.value = devices()[0].id;
    }

    function syncRelaySelect(deviceSelect, relaySelect) {
      if (!deviceSelect || !relaySelect) return;
      relaySelect.innerHTML = relayOptions(deviceSelect.value, relaySelect.value);
    }

    function renderDrafts(kind) {
      const container = document.querySelector(`[data-action-list="${kind}"]`);
      if (!container) return;
      if (!drafts[kind].length) {
        container.innerHTML = '<span class="muted">尚未添加动作</span>';
        return;
      }
      container.innerHTML = drafts[kind].map((action, index) => `
        <span class="automation-action-chip">
          ${escapeHtml(deviceName(action.deviceId))} · ${escapeHtml(relayName(action.deviceId, action.relayId))} · ${action.status === 'ON' ? '开启' : '关闭'}
          <button type="button" data-remove-action="${index}" title="移除动作" aria-label="移除动作">×</button>
        </span>
      `).join('');
      container.querySelectorAll('[data-remove-action]').forEach((button) => {
        button.addEventListener('click', () => {
          drafts[kind].splice(Number(button.dataset.removeAction), 1);
          renderDrafts(kind);
        });
      });
    }

    function setupActionEditor(kind) {
      const editor = document.querySelector(`[data-action-editor="${kind}"]`);
      if (!editor) return;
      const deviceSelect = editor.querySelector('[data-field="deviceId"]');
      const relaySelect = editor.querySelector('[data-field="relayId"]');
      const statusSelect = editor.querySelector('[data-field="status"]');
      const addButton = editor.querySelector('.automation-add-action');
      populateDeviceSelect(deviceSelect);
      syncRelaySelect(deviceSelect, relaySelect);
      deviceSelect.addEventListener('change', () => syncRelaySelect(deviceSelect, relaySelect));
      addButton.addEventListener('click', () => {
        if (!deviceSelect.value || !relaySelect.value) {
          showToast('无法添加动作', '请先配置至少一个带继电器的设备。', 'error');
          return;
        }
        if (drafts[kind].length >= 16) {
          showToast('动作数量已达上限', '每个自动化最多包含 16 个动作。', 'error');
          return;
        }
        drafts[kind].push({
          deviceId: deviceSelect.value,
          relayId: relaySelect.value,
          status: statusSelect.value
        });
        renderDrafts(kind);
      });
    }

    function conditionText(condition) {
      const metric = {
        temperature: '温度', humidity: '湿度', online: '在线状态', relay: '继电器状态'
      }[condition.metric] || condition.metric;
      const operator = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠' }[condition.operator];
      const relay = condition.relayId ? ` · ${relayName(condition.deviceId, condition.relayId)}` : '';
      return `${deviceName(condition.deviceId)} · ${metric}${relay} ${operator} ${condition.value}`;
    }

    function actionSummary(actions) {
      return (actions || []).map((action) =>
        `${deviceName(action.deviceId)} / ${relayName(action.deviceId, action.relayId)} ${action.status === 'ON' ? '开启' : '关闭'}`
      ).join('；');
    }

    function renderScenes(scenes) {
      if (!scenes.length) {
        elements.scenes.innerHTML = '<p class="automation-empty">还没有场景。可先在上方组合一个常用操作。</p>';
        return;
      }
      elements.scenes.innerHTML = scenes.map((scene) => `
        <article class="automation-card">
          <div>
            <div class="automation-card-head"><h4 title="${escapeHtml(scene.name)}">${escapeHtml(scene.name)}</h4><span class="automation-status">${scene.actions.length} 个动作</span></div>
            <div class="automation-card-meta"><span>${escapeHtml(actionSummary(scene.actions))}</span></div>
          </div>
          <div class="automation-card-actions">
            <button class="button button-secondary" type="button" data-delete-scene="${escapeHtml(scene.id)}">删除</button>
            <button class="button button-primary" type="button" data-run-scene="${escapeHtml(scene.id)}">运行</button>
          </div>
        </article>
      `).join('');
      elements.scenes.querySelectorAll('[data-run-scene]').forEach((button) => {
        button.addEventListener('click', () => runScene(button.dataset.runScene, button));
      });
      elements.scenes.querySelectorAll('[data-delete-scene]').forEach((button) => {
        button.addEventListener('click', () => deleteScene(button.dataset.deleteScene));
      });
    }

    function renderRules(rules) {
      if (!rules.length) {
        elements.rules.innerHTML = '<p class="automation-empty">还没有触发规则。可从温度、湿度、在线或继电器状态开始。</p>';
        return;
      }
      elements.rules.innerHTML = rules.map((rule) => `
        <article class="automation-card">
          <div>
            <div class="automation-card-head">
              <h4 title="${escapeHtml(rule.name)}">${escapeHtml(rule.name)}</h4>
              <label class="toggle-control" title="${rule.enabled ? '停用规则' : '启用规则'}">
                <input type="checkbox" data-toggle-rule="${escapeHtml(rule.id)}" ${rule.enabled ? 'checked' : ''} />
                <span class="toggle-track"></span>
              </label>
            </div>
            <div class="automation-card-meta"><span>${escapeHtml(conditionText(rule.condition))}</span><span>冷却 ${rule.cooldown_seconds} 秒</span></div>
            <div class="automation-card-meta"><span>${escapeHtml(actionSummary(rule.actions))}</span></div>
          </div>
          <div class="automation-card-actions">
            <span class="automation-status ${rule.enabled ? '' : 'off'}">${rule.enabled ? '运行中' : '已停用'}</span>
            <button class="button button-secondary" type="button" data-delete-rule="${escapeHtml(rule.id)}">删除</button>
          </div>
        </article>
      `).join('');
      elements.rules.querySelectorAll('[data-toggle-rule]').forEach((toggle) => {
        toggle.addEventListener('change', () => toggleRule(toggle.dataset.toggleRule, toggle.checked, toggle));
      });
      elements.rules.querySelectorAll('[data-delete-rule]').forEach((button) => {
        button.addEventListener('click', () => deleteRule(button.dataset.deleteRule));
      });
    }

    function runState(run) {
      if (run.state === 'commands_queued') return ['命令已排队', ''];
      if (run.state === 'partially_queued') return ['部分排队', 'partial'];
      return ['执行失败', 'failed'];
    }

    function renderRuns(runs) {
      if (!runs.length) {
        elements.runs.innerHTML = '<tr><td colspan="5" class="muted">暂无执行记录。</td></tr>';
        return;
      }
      elements.runs.innerHTML = runs.map((run) => {
        const [label, className] = runState(run);
        return `
          <tr>
            <td data-label="时间">${escapeHtml(formatTimestamp(run.created_at))}</td>
            <td data-label="来源">${run.source_type === 'rule' ? '规则' : '场景'} · ${escapeHtml(run.source_name)}</td>
            <td data-label="发起人">${escapeHtml(run.actor || 'system')}</td>
            <td data-label="结果"><span class="automation-status ${className}">${label}</span></td>
            <td data-label="设备确认">${run.device_confirmed ? '已确认' : '未确认'}</td>
          </tr>
        `;
      }).join('');
    }

    async function refresh() {
      if (refreshPromise) return refreshPromise;
      elements.refresh.disabled = true;
      refreshPromise = Promise.all([
        requestJson('/api/automations/scenes'),
        requestJson('/api/automations/rules'),
        requestJson('/api/automations/runs?limit=50')
      ]).then(([scenes, rules, runs]) => {
        renderScenes(scenes);
        renderRules(rules);
        renderRuns(runs);
      }).finally(() => {
        refreshPromise = null;
        elements.refresh.disabled = false;
      });
      return refreshPromise;
    }

    async function runScene(id, button) {
      button.disabled = true;
      try {
        const run = await requestJson(`/api/automations/scenes/${encodeURIComponent(id)}/run`, { method: 'POST' });
        const [label] = runState(run);
        showToast('场景指令已提交', `${label}，设备确认状态可在执行记录中查看。`, run.state === 'failed' ? 'error' : 'success');
        await refresh();
      } catch (error) {
        showToast('场景运行失败', error.message, 'error');
      } finally {
        button.disabled = false;
      }
    }

    async function deleteScene(id) {
      if (!await confirmDanger('删除场景', '删除后无法恢复，但既有执行记录会保留。')) return;
      try {
        await requestJson(`/api/automations/scenes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('场景已删除', '既有执行记录未受影响。', 'success');
        await refresh();
      } catch (error) { showToast('删除场景失败', error.message, 'error'); }
    }

    async function deleteRule(id) {
      if (!await confirmDanger('删除规则', '删除后该条件将不再自动执行。')) return;
      try {
        await requestJson(`/api/automations/rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showToast('规则已删除', '自动触发已停止。', 'success');
        await refresh();
      } catch (error) { showToast('删除规则失败', error.message, 'error'); }
    }

    async function toggleRule(id, enabled, toggle) {
      toggle.disabled = true;
      try {
        await requestJson(`/api/automations/rules/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        showToast(enabled ? '规则已启用' : '规则已停用', enabled ? '后续状态变化将按条件触发。' : '规则保留，但不会继续触发。', 'success');
        await refresh();
      } catch (error) {
        toggle.checked = !enabled;
        showToast('规则状态更新失败', error.message, 'error');
      } finally { toggle.disabled = false; }
    }

    function syncConditionControls() {
      const form = elements.ruleForm;
      const metric = form.elements.metric.value;
      const isState = metric === 'online' || metric === 'relay';
      const relayField = form.querySelector('.automation-condition-relay');
      const valueInput = form.elements.value;
      const stateValue = form.elements.stateValue;
      relayField.classList.toggle('hidden', metric !== 'relay');
      valueInput.classList.toggle('hidden', isState);
      stateValue.classList.toggle('hidden', !isState);
      if (isState) {
        const online = metric === 'online';
        stateValue.innerHTML = online
          ? '<option value="ONLINE">在线</option><option value="OFFLINE">离线</option>'
          : '<option value="ON">开启</option><option value="OFF">关闭</option>';
        Array.from(form.elements.operator.options).forEach((option) => {
          option.disabled = !['eq', 'neq'].includes(option.value);
        });
        if (!['eq', 'neq'].includes(form.elements.operator.value)) form.elements.operator.value = 'eq';
      } else {
        Array.from(form.elements.operator.options).forEach((option) => { option.disabled = false; });
      }
    }

    async function submitScene(event) {
      event.preventDefault();
      if (!drafts.scene.length) {
        showToast('场景还不能创建', '请至少添加一个继电器动作。', 'error');
        return;
      }
      const button = elements.sceneForm.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await requestJson('/api/automations/scenes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: elements.sceneForm.elements.name.value, actions: drafts.scene })
        });
        elements.sceneForm.reset();
        drafts.scene = [];
        renderDrafts('scene');
        showToast('场景已创建', '现在可以一键运行该场景。', 'success');
        await refresh();
      } catch (error) { showToast('创建场景失败', error.message, 'error'); }
      finally { button.disabled = false; }
    }

    async function submitRule(event) {
      event.preventDefault();
      if (!drafts.rule.length) {
        showToast('规则还不能创建', '请至少添加一个继电器动作。', 'error');
        return;
      }
      const form = elements.ruleForm;
      const metric = form.elements.metric.value;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        await requestJson('/api/automations/rules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.elements.name.value,
            cooldownSeconds: Number(form.elements.cooldownSeconds.value),
            condition: {
              deviceId: form.elements.conditionDeviceId.value,
              metric,
              operator: form.elements.operator.value,
              value: ['online', 'relay'].includes(metric) ? form.elements.stateValue.value : Number(form.elements.value.value),
              ...(metric === 'relay' ? { relayId: form.elements.conditionRelayId.value } : {})
            },
            actions: drafts.rule
          })
        });
        form.reset();
        drafts.rule = [];
        renderDrafts('rule');
        syncConditionControls();
        showToast('规则已创建', '规则将在条件下一次由不满足变为满足时执行。', 'success');
        await refresh();
      } catch (error) { showToast('创建规则失败', error.message, 'error'); }
      finally { button.disabled = false; }
    }

    function syncDevices() {
      document.querySelectorAll('[data-action-editor] [data-field="deviceId"]').forEach((select) => {
        populateDeviceSelect(select);
        syncRelaySelect(select, select.closest('[data-action-editor]').querySelector('[data-field="relayId"]'));
      });
      populateDeviceSelect(elements.ruleForm.elements.conditionDeviceId);
      syncRelaySelect(elements.ruleForm.elements.conditionDeviceId, elements.ruleForm.elements.conditionRelayId);
    }

    setupActionEditor('scene');
    setupActionEditor('rule');
    elements.ruleForm.elements.conditionDeviceId.addEventListener('change', () => {
      syncRelaySelect(elements.ruleForm.elements.conditionDeviceId, elements.ruleForm.elements.conditionRelayId);
    });
    elements.ruleForm.elements.metric.addEventListener('change', syncConditionControls);
    elements.sceneForm.addEventListener('submit', submitScene);
    elements.ruleForm.addEventListener('submit', submitRule);
    elements.refresh.addEventListener('click', () => refresh().catch((error) => showToast('自动化刷新失败', error.message, 'error')));
    syncDevices();
    syncConditionControls();

    return { refresh, syncDevices };
  }

  global.MqttApiAutomation = { createAutomationView };
})(window);
