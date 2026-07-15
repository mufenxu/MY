(function (global) {
  'use strict';

  const SCOPE_LABELS = {
    'devices:read': '设备快照',
    'history:read': '历史数据',
    'relays:write': '继电器控制'
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function noop() {}

  function formatScopes(scopes) {
    return (scopes || []).map((scope) => SCOPE_LABELS[scope] || scope).join(' / ') || '未分配';
  }

  function createApiKeysView(options = {}) {
    const {
      tableBody,
      createForm,
      createButton,
      nameInput,
      scopeInputs = [],
      createdPanel,
      createdMeta,
      createdValue,
      copyCreatedButton,
      docPlaceholderSelector = '.doc-key-placeholder',
      canUsePrivateApi = () => false,
      requestJson,
      beginAction = () => true,
      endAction = noop,
      confirmDanger = () => Promise.resolve(false),
      showToast = noop,
      copyText = noop,
      formatTimestamp = (value) => String(value)
    } = options;

    let latestCreatedKey = null;

    function collectScopes() {
      return scopeInputs
        .filter((input) => input && input.checked)
        .map((input) => input.dataset.apiScope)
        .filter(Boolean);
    }

    function renderCreatedKey(key) {
      latestCreatedKey = key || null;

      if (!createdPanel || !createdValue || !createdMeta) {
        updateDocToken(key);
        return;
      }

      if (!key || !key.token) {
        createdPanel.classList.add('hidden');
        createdValue.textContent = 'sk_mqttapi_your_token';
        createdMeta.textContent = '完整 token 只展示这一次，请立即复制到安全位置。';
      } else {
        createdPanel.classList.remove('hidden');
        createdValue.textContent = key.token;
        createdMeta.textContent =
          `${key.name} 已创建，权限范围：${formatScopes(key.scopes)}。完整 token 后续不会再次显示。`;
      }

      updateDocToken(key);
    }

    function updateDocToken(key) {
      const docToken = key && key.token ? key.token : 'sk_mqttapi_your_token';
      document.querySelectorAll(docPlaceholderSelector).forEach((element) => {
        element.textContent = docToken;
        if (key && key.token) {
          element.style.color = 'var(--primary)';
          element.style.fontWeight = '700';
        } else {
          element.style.color = '';
          element.style.fontWeight = '';
        }
      });
    }

    async function refresh() {
      if (!canUsePrivateApi() || !requestJson) return;

      try {
        const keys = await requestJson('/api/keys');
        renderTable(keys);
      } catch (error) {
        showToast('获取 API 密钥失败', error.message, 'error');
      }
    }

    function renderTable(keys) {
      if (!tableBody) return;

      if (!keys || keys.length === 0) {
        tableBody.innerHTML = `
          <tr class="table-empty-row">
            <td colspan="8" style="padding: 32px 0;">
              <div class="empty-state-wrapper" style="border: none; background: transparent; padding: 20px 0; margin: 0 auto; max-width: 400px;">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h3>尚无 API 授权密钥</h3>
                <p>暂未分配任何外部客户端访问凭证，无法通过 Bearer 令牌调用 API 端点。</p>
                <button class="button button-primary empty-state-action-btn focus-new-key-btn" type="button">为客户端分配新密钥</button>
              </div>
            </td>
          </tr>
        `;

        const focusButton = tableBody.querySelector('.focus-new-key-btn');
        if (focusButton && nameInput) {
          focusButton.addEventListener('click', () => nameInput.focus());
        }
        return;
      }

      tableBody.innerHTML = keys.map((key) => `
        <tr>
          <td data-label="密钥备注" style="font-weight:600; text-align: left; padding: 12px 14px;">${escapeHtml(key.name)}</td>
          <td data-label="Key ID" style="font-family:monospace; text-align: left; padding: 12px 14px;">${escapeHtml(key.keyId || '-')}</td>
          <td data-label="Token 预览" style="font-family:monospace; color:var(--primary); font-weight:700; text-align: left; padding: 12px 14px;">${escapeHtml(key.tokenPreview || '-')}</td>
          <td data-label="权限范围" style="text-align: left; padding: 12px 14px; font-size: 0.82rem;">${escapeHtml(formatScopes(key.scopes))}</td>
          <td data-label="调用频次" style="text-align: left; padding: 12px 14px; font-weight: 600; color: var(--text-main);">${key.request_count || 0} 次</td>
          <td data-label="最后活跃时间" style="text-align: left; padding: 12px 14px; font-size: 0.82rem;">${key.last_used_at ? formatTimestamp(key.last_used_at) : '<span class="muted">从未活跃</span>'}</td>
          <td data-label="创建时间" style="text-align: left; padding: 12px 14px;">${formatTimestamp(key.created_at)}</td>
          <td data-label="操作" class="table-actions-cell" style="text-align: right; padding: 12px 14px;">
            <button class="btn-danger-text revoke-key-btn" data-id="${escapeHtml(key.keyId || '')}" type="button">吊销</button>
          </td>
        </tr>
      `).join('');

      tableBody.querySelectorAll('.revoke-key-btn').forEach((button) => {
        button.addEventListener('click', () => revokeKey(button));
      });
    }

    async function revokeKey(button) {
      const keyId = button.dataset.id;
      const lockKey = `api-key-revoke:${keyId}`;

      if (!beginAction(lockKey, button)) {
        return;
      }

      try {
        const ok = await confirmDanger(
          '警告：吊销密钥',
          `确定要吊销密钥 ${keyId} 吗？一旦吊销，以该密钥授权的外部客户端将立刻失去全部 API 访问权。`
        );
        if (!ok) return;

        await requestJson(`/api/keys/${keyId}`, { method: 'DELETE' });
        if (latestCreatedKey && latestCreatedKey.keyId === keyId) {
          renderCreatedKey(null);
        }
        showToast('密钥吊销成功', '', 'success');
        await refresh();
      } catch (error) {
        showToast('吊销失败', error.message, 'error');
      } finally {
        endAction(lockKey, button);
      }
    }

    async function handleCreate(event) {
      event.preventDefault();

      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) return;
      if (!beginAction('api-key-create', createButton)) {
        return;
      }

      try {
        const result = await requestJson('/api/keys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            scopes: collectScopes()
          })
        });

        nameInput.value = '';
        renderCreatedKey(result.key);
        showToast('生成 API 密钥成功', '完整 token 仅展示一次，请立即复制。', 'success');
        await refresh();
      } catch (error) {
        showToast('生成密钥失败', error.message, 'error');
      } finally {
        endAction('api-key-create', createButton);
      }
    }

    if (createForm) {
      createForm.addEventListener('submit', handleCreate);
    }

    if (copyCreatedButton && createdValue) {
      copyCreatedButton.addEventListener('click', () => {
        copyText(createdValue.textContent.trim(), '完整 Token 已复制。');
      });
    }

    return {
      collectScopes,
      formatScopes,
      refresh,
      renderCreatedKey,
      renderTable
    };
  }

  global.MqttApiKeysView = {
    createApiKeysView
  };
})(window);
