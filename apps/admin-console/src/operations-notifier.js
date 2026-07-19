function severityLabel(severity) {
  return { critical: '严重', warning: '警告', info: '提示' }[severity] || '提示';
}

function incidentMessage(incident, transition, publicOrigin) {
  const resolved = transition === 'resolved';
  const status = resolved ? '<font color="info">已恢复</font>' : '<font color="warning">需要处理</font>';
  const lines = [
    `### 统一管理后台告警 ${status}`,
    `> **事件**：${incident.title}`,
    `> **级别**：${severityLabel(incident.severity)}`,
    `> **状态**：${resolved ? '服务已恢复' : incident.description}`,
    `> **时间**：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  ];
  if (publicOrigin) lines.push(`[打开事件中心](${new URL('/', publicOrigin).toString()})`);
  return lines.join('\n');
}

function releaseMessage(event, publicOrigin) {
  const record = event.build || event.deployment || {};
  const success = event.status === 'succeeded';
  const rolledBack = event.status === 'rolled_back';
  const status = success
    ? '<font color="info">成功</font>'
    : rolledBack ? '<font color="warning">已自动回滚</font>' : '<font color="warning">失败</font>';
  const kind = event.kind === 'build' ? '镜像构建' : event.kind === 'rollback' ? '生产回滚' : '生产部署';
  const targets = record.targets || record.components || [];
  const lines = [
    `### 统一平台${kind} ${status}`,
    `> **环境**：${record.environment || 'production'}`,
    `> **组件**：${targets.join('、') || '--'}`,
    `> **版本**：${String(record.revision || record.buildId || '').slice(0, 12) || '--'}`,
    `> **操作人**：${record.requestedBy || 'system'}`,
    `> **时间**：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
  ];
  if (record.error) lines.push(`> **原因**：${String(record.error).slice(0, 180)}`);
  if (publicOrigin) lines.push(`[打开发布中心](${new URL('/', publicOrigin).toString()})`);
  return lines.join('\n');
}

export function createOperationsNotifier({
  serviceUrl,
  apiKey,
  publicOrigin = '',
  enabled = true,
  fetchImpl = fetch,
  timeoutMs = 8000,
} = {}) {
  const configured = Boolean(enabled && serviceUrl && apiKey);

  async function sendMarkdown(content, duplicateCheckInterval = 1800) {
    if (!configured) return { delivered: false, reason: 'not_configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL('/notify', serviceUrl), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({
          msg_type: 'markdown',
          data: { content },
          enable_duplicate_check: 1,
          duplicate_check_interval: duplicateCheckInterval,
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { delivered: true };
    } catch (error) {
      return {
        delivered: false,
        reason: error?.name === 'AbortError' ? 'timeout' : 'request_failed',
        error: String(error?.message || error).slice(0, 200),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured,
    async check() {
      if (!configured) return { configured: false, healthy: null };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(new URL('/healthz', serviceUrl), { signal: controller.signal });
        return { configured: true, healthy: response.ok, status: response.status };
      } catch (error) {
        return { configured: true, healthy: false, error: error?.name === 'AbortError' ? 'timeout' : 'unreachable' };
      } finally {
        clearTimeout(timer);
      }
    },
    async sendIncident(incident, transition) {
      return sendMarkdown(incidentMessage(incident, transition, publicOrigin));
    },
    async sendRelease(event) {
      return sendMarkdown(releaseMessage(event, publicOrigin), 300);
    },
  };
}
