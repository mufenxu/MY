(function (global) {
  'use strict';

  function noop() {}

  function getButtonParts(button, iconSelector) {
    return {
      spin: button ? button.querySelector(iconSelector) : null,
      label: button ? button.querySelector('span') : null
    };
  }

  function setBusy(parts, busy, busyText, idleText) {
    if (parts.spin) {
      parts.spin.classList.toggle('hidden', !busy);
    }
    if (parts.label) {
      parts.label.textContent = busy ? busyText : idleText;
    }
  }

  function createSystemActions(options = {}) {
    const {
      testMqttButton,
      mqttUrlInput,
      mqttUsernameInput,
      mqttPasswordInput,
      retentionDaysInput,
      dbVacuumButton,
      clearEventsButton,
      requestJson,
      beginAction = () => true,
      endAction = noop,
      maintenanceTimeoutMs = 60000,
      showToast = noop,
      clearEvents = noop
    } = options;

    async function testMqttConnection() {
      if (!testMqttButton || !requestJson) return;

      const url = mqttUrlInput ? mqttUrlInput.value.trim() : '';
      if (!url) {
        showToast('配置校验', '试连失败，MQTT Broker 地址不可留空。', 'error');
        return;
      }

      if (!beginAction('mqtt-test', testMqttButton)) {
        return;
      }

      const parts = getButtonParts(testMqttButton, '.test-spin-icon');
      setBusy(parts, true, '测试连接中...', '测试 Broker 连接');

      try {
        const response = await requestJson('/api/config/test-mqtt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            username: mqttUsernameInput ? mqttUsernameInput.value : '',
            password: mqttPasswordInput ? mqttPasswordInput.value : ''
          })
        });
        showToast('连接可达', response.message, 'success');
      } catch (error) {
        showToast('连接不通', error.message, 'error');
      } finally {
        setBusy(parts, false, '测试连接中...', '测试 Broker 连接');
        endAction('mqtt-test', testMqttButton);
      }
    }

    async function cleanDatabase() {
      if (!dbVacuumButton || !requestJson) return;

      const retentionDays = Number.parseInt(retentionDaysInput ? retentionDaysInput.value || '0' : '0', 10);
      if (Number.isNaN(retentionDays) || retentionDays < 0) {
        showToast('参数范围', '保留时长参数不合规，须为非负整数天。', 'error');
        return;
      }

      if (!beginAction('db-clean-data', dbVacuumButton)) {
        return;
      }

      const parts = getButtonParts(dbVacuumButton, '.vacuum-spin-icon');
      setBusy(parts, true, '整理中...', '立即清理并整理数据库');

      try {
        const response = await requestJson('/api/config/clean-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retentionDays }),
          timeoutMs: maintenanceTimeoutMs
        });
        showToast('数据库维护成功', `${response.message} 共扫除 ${response.deletedCount} 条历史冗余数据。`, 'success');
      } catch (error) {
        showToast('维护失败', error.message, 'error');
      } finally {
        setBusy(parts, false, '整理中...', '立即清理并整理数据库');
        endAction('db-clean-data', dbVacuumButton);
      }
    }

    function bind() {
      if (testMqttButton) {
        testMqttButton.addEventListener('click', testMqttConnection);
      }

      if (dbVacuumButton) {
        dbVacuumButton.addEventListener('click', cleanDatabase);
      }

      if (clearEventsButton) {
        clearEventsButton.addEventListener('click', () => {
          clearEvents();
          showToast('清空日志成功', '审计事件已被本地清空。', 'info');
        });
      }
    }

    bind();

    return {
      cleanDatabase,
      testMqttConnection
    };
  }

  global.MqttApiSystemActions = {
    createSystemActions
  };
})(window);
