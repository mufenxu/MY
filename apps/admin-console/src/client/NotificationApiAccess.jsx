import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Edit3,
  Gauge,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Save,
  ScrollText,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import { ConfirmDialog, SegmentedTabs, SelectControl } from './UiControls.jsx';

const SCOPE_DETAILS = {
  'notifications:send': ['立即发送', '允许调用同步发送接口。'],
  'notifications:enqueue': ['任务编排', '允许创建即时或定时通知任务。'],
  'notifications:status:read': ['结果查询', '允许查询本应用产生的发送结果。'],
  'notifications:broadcast': ['批量与全员', '允许部门、标签、多用户和 @all 目标。'],
};

const EMPTY_ACCESS = {
  overview: { activeClients: 0, activeKeys: 0, totalRequests: 0, successRate: null, p95DurationMs: null },
  clients: [],
  requests: { items: [], page: 1, pageSize: 20, total: 0 },
  supportedScopes: Object.keys(SCOPE_DETAILS),
  apiBasePath: '/api/notify',
  openApiPath: '/api/notify/openapi.json',
  legacyKeyConfigured: false,
};

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
}

function clientState(client) {
  if (client.status === 'revoked') return { label: '已吊销', className: 'revoked' };
  if (client.expiresAt && new Date(client.expiresAt) <= new Date()) return { label: '已过期', className: 'expired' };
  return { label: '使用中', className: 'active' };
}

function blankForm() {
  return {
    id: '',
    name: '',
    description: '',
    scopes: ['notifications:send', 'notifications:status:read'],
    rateLimitPerMinute: 60,
    expiresAt: '',
  };
}

function SecretDialog({ secret, onClose, onCopy }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!secret) return undefined;
    const previousFocus = document.activeElement;
    const appShell = document.querySelector('.app-shell');
    const shellWasInert = appShell?.hasAttribute('inert');
    appShell?.setAttribute('inert', '');
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (!shellWasInert) appShell?.removeAttribute('inert');
      previousFocus?.focus?.();
    };
  }, [secret]);

  if (!secret) return null;

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled)') || []);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="notify-secret-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <header>
          <span><KeyRound size={22} /></span>
          <button className="icon-button" type="button" aria-label="关闭密钥弹窗" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="notify-secret-copy">
          <span>仅显示一次</span>
          <h2 id={titleId}>保存 {secret.client?.name || 'API 应用'} 的密钥</h2>
          <p>关闭后无法再次查看完整密钥。服务端仅保存不可逆摘要。</p>
          <div className="notify-secret-value"><code>{secret.token}</code><button className="icon-button" type="button" title="复制 API 密钥" aria-label="复制 API 密钥" onClick={() => onCopy(secret.token)}><Clipboard size={17} /></button></div>
        </div>
        <footer><button ref={closeRef} className="primary-button" type="button" onClick={onClose}><Check size={17} />我已妥善保存</button></footer>
      </section>
    </div>,
    document.body,
  );
}

export default function NotificationApiAccess({ session, onError, onMessage }) {
  const [mode, setMode] = useState('clients');
  const [access, setAccess] = useState(EMPTY_ACCESS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [secret, setSecret] = useState(null);
  const [pending, setPending] = useState(null);
  const [requestFilters, setRequestFilters] = useState({ clientId: '', outcome: '' });
  const [requestPage, setRequestPage] = useState(1);
  const canManage = session.user?.role === 'super_admin';

  const loadAccess = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    onError('');
    try {
      const result = await requestJson('/api/notifications/api-access');
      setAccess({ ...EMPTY_ACCESS, ...result, overview: { ...EMPTY_ACCESS.overview, ...result.overview } });
    } catch (error) {
      onError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [onError]);

  useEffect(() => { loadAccess(); }, [loadAccess]);

  const loadRequests = useCallback(async () => {
    if (mode !== 'logs') return;
    setRefreshing(true);
    onError('');
    try {
      const query = new URLSearchParams({ page: String(requestPage), pageSize: '20' });
      if (requestFilters.clientId) query.set('clientId', requestFilters.clientId);
      if (requestFilters.outcome) query.set('outcome', requestFilters.outcome);
      const requests = await requestJson(`/api/notifications/api-requests?${query}`);
      setAccess((current) => ({ ...current, requests }));
    } catch (error) {
      onError(error.message);
    } finally {
      setRefreshing(false);
    }
  }, [mode, onError, requestFilters, requestPage]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const apiBaseUrl = useMemo(() => `${window.location.origin}${access.apiBasePath}`, [access.apiBasePath]);
  const curlExample = useMemo(() => [
    `curl --request POST '${apiBaseUrl}' \\`,
    "  --header 'Content-Type: application/json' \\",
    "  --header 'X-API-KEY: YOUR_API_KEY' \\",
    "  --data '{\"msg_type\":\"text\",\"touser\":\"zhangsan\",\"data\":{\"content\":\"系统通知：任务已完成\"}}'",
  ].join('\n'), [apiBaseUrl]);

  async function copyText(value, label = '内容') {
    try {
      await navigator.clipboard.writeText(value);
      onMessage(`${label}已复制`);
    } catch {
      onError('复制失败，请手动选择内容。');
    }
  }

  function toggleScope(scope) {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((item) => item !== scope)
        : [...current.scopes, scope],
    }));
  }

  function editClient(client) {
    setForm({
      id: client.id,
      name: client.name,
      description: client.description || '',
      scopes: [...client.scopes],
      rateLimitPerMinute: client.rateLimitPerMinute,
      expiresAt: client.expiresAt ? String(client.expiresAt).slice(0, 10) : '',
    });
    window.requestAnimationFrame(() => document.querySelector('.notify-api-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function saveClient(event) {
    event.preventDefault();
    setSubmitting(true);
    onError('');
    onMessage('');
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        scopes: form.scopes,
        rateLimitPerMinute: Number(form.rateLimitPerMinute),
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59+08:00`).toISOString() : null,
      };
      const result = await requestJson(form.id
        ? `/api/notifications/api-clients/${encodeURIComponent(form.id)}`
        : '/api/notifications/api-clients', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      if (result.token) setSecret(result);
      onMessage(form.id ? 'API 应用已更新' : 'API 应用已创建');
      setForm(blankForm());
      await loadAccess({ quiet: true });
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmLifecycle() {
    if (!pending) return;
    setSubmitting(true);
    onError('');
    onMessage('');
    try {
      const result = await requestJson(`/api/notifications/api-clients/${encodeURIComponent(pending.client.id)}/${pending.type}`, {
        method: 'POST',
        body: JSON.stringify(pending.type === 'rotate' ? { overlapMinutes: 1440 } : {}),
      });
      if (result.token) setSecret(result);
      onMessage(pending.type === 'rotate' ? '新密钥已生成，旧密钥将在 24 小时后失效' : 'API 应用及其全部密钥已吊销');
      setPending(null);
      await loadAccess({ quiet: true });
    } catch (error) {
      setPending(null);
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="ops-loading"><LoaderCircle className="spin" size={20} />正在读取 API 接入配置</div>;

  const overview = access.overview;
  const totalRequestPages = Math.max(1, Math.ceil((access.requests.total || 0) / (access.requests.pageSize || 20)));
  return (
    <div className="notify-api-view">
      <div className="notify-api-heading">
        <div><span>服务接入</span><h2>通知 API</h2><p>按应用隔离权限、密钥与调用记录。</p></div>
        <button className="icon-button" type="button" title="刷新 API 数据" aria-label="刷新 API 数据" disabled={refreshing} onClick={() => loadAccess({ quiet: true })}><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>
      </div>

      <div className="ops-kpis notify-api-kpis">
        <article><ShieldCheck size={21} /><div><span>有效应用</span><strong>{overview.activeClients || 0}</strong><small>{overview.activeKeys || 0} 个有效密钥</small></div></article>
        <article><ScrollText size={21} /><div><span>24 小时调用</span><strong>{overview.totalRequests || 0}</strong><small>完整调用审计</small></div></article>
        <article><CheckCircle2 size={21} /><div><span>成功率</span><strong>{overview.successRate == null ? '--' : `${overview.successRate}%`}</strong><small>最近 24 小时</small></div></article>
        <article><Gauge size={21} /><div><span>P95 耗时</span><strong>{overview.p95DurationMs == null ? '--' : overview.p95DurationMs}</strong><small>{overview.p95DurationMs == null ? '暂无数据' : '毫秒'}</small></div></article>
      </div>

      <SegmentedTabs
        className="notify-api-subnav"
        ariaLabel="API 接入视图"
        idPrefix="notify-api-tab"
        panelId="notify-api-panel"
        items={[
          { id: 'clients', label: <><KeyRound size={16} />应用与密钥</> },
          { id: 'docs', label: <><BookOpen size={16} />调用说明</> },
          { id: 'logs', label: <><ScrollText size={16} />调用日志</> },
        ]}
        value={mode}
        onChange={setMode}
      />

      <div id="notify-api-panel" role="tabpanel" aria-labelledby={`notify-api-tab-${mode}`}>

      {mode === 'clients' && (
        <div className="notify-api-client-layout">
          <section className="ops-panel notify-api-clients-panel">
            <header><div><span>访问主体</span><h3>{access.clients.length} 个 API 应用</h3></div><KeyRound size={20} /></header>
            {access.legacyKeyConfigured && <div className="notify-api-legacy"><ShieldCheck size={17} /><div><strong>兼容密钥仍在生效</strong><span>旧的全局密钥可继续使用，建议逐步迁移到独立应用密钥。</span></div></div>}
            <div className="notify-api-client-list">
              {access.clients.length ? access.clients.map((client) => {
                const state = clientState(client);
                const activeKey = client.keys?.find((key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()));
                return (
                  <div className="notify-api-client-row" key={client.id}>
                    <div className="notify-api-client-main"><span className={`notify-api-client-state ${state.className}`}>{state.label}</span><strong>{client.name}</strong><small>{client.description || '无备注'}</small></div>
                    <div className="notify-api-client-meta"><span>{client.rateLimitPerMinute} 次 / 分钟</span><span>{activeKey?.tokenPrefix || '无有效密钥'}</span><span>最近使用 {formatDateTime(activeKey?.lastUsedAt)}</span></div>
                    <div className="notify-api-scopes">{client.scopes.map((scope) => <span key={scope}>{SCOPE_DETAILS[scope]?.[0] || scope}</span>)}</div>
                    <div className="notify-api-client-actions">
                      <button className="icon-button" type="button" title="编辑 API 应用" aria-label={`编辑 ${client.name}`} disabled={!canManage || state.className !== 'active'} onClick={() => editClient(client)}><Edit3 size={16} /></button>
                      <button className="icon-button" type="button" title="轮换密钥" aria-label={`轮换 ${client.name} 的密钥`} disabled={!canManage || state.className !== 'active'} onClick={() => setPending({ type: 'rotate', client })}><RefreshCw size={16} /></button>
                      <button className="icon-button danger" type="button" title="吊销应用" aria-label={`吊销 ${client.name}`} disabled={!canManage || state.className !== 'active'} onClick={() => setPending({ type: 'revoke', client })}><Ban size={16} /></button>
                    </div>
                  </div>
                );
              }) : <div className="ops-empty">尚未创建独立 API 应用</div>}
            </div>
          </section>

          <section className="ops-panel notify-api-form-panel">
            <header><div><span>{form.id ? '调整权限' : '新增接入方'}</span><h3>{form.id ? `编辑 ${form.name}` : '创建 API 应用'}</h3></div><Code2 size={20} /></header>
            <form onSubmit={saveClient}>
              <label><span>应用名称</span><input value={form.name} maxLength={100} required disabled={!canManage} placeholder="例如 校园服务" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label><span>用途说明</span><textarea value={form.description} maxLength={300} rows={3} disabled={!canManage} placeholder="记录系统归属和使用场景" onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
              <div className="notify-api-form-grid"><label><span>每分钟上限</span><input type="number" min="1" max="120" value={form.rateLimitPerMinute} disabled={!canManage} onChange={(event) => setForm({ ...form, rateLimitPerMinute: event.target.value })} /></label><label><span>应用到期日</span><input type="date" value={form.expiresAt} disabled={!canManage} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label></div>
              <fieldset disabled={!canManage}><legend>权限范围</legend><div className="notify-api-scope-options">{access.supportedScopes.map((scope) => <label key={scope} className={scope === 'notifications:broadcast' ? 'sensitive' : ''}><input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span><strong>{SCOPE_DETAILS[scope]?.[0] || scope}</strong><small>{SCOPE_DETAILS[scope]?.[1] || scope}</small></span></label>)}</div></fieldset>
              {!canManage && <p className="notify-api-role-note">仅超级管理员可以创建或修改 API 应用。</p>}
              <div className="notify-api-form-actions">{form.id && <button className="secondary-action" type="button" disabled={submitting} onClick={() => setForm(blankForm())}><X size={16} />取消编辑</button>}<button className="primary-button" type="submit" disabled={!canManage || submitting || form.name.trim().length < 2 || !form.scopes.length}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{form.id ? '保存应用' : '创建并生成密钥'}</button></div>
            </form>
          </section>
        </div>
      )}

      {mode === 'docs' && (
        <div className="notify-api-doc-grid">
          <section className="ops-panel notify-api-code-panel">
            <header><div><span>快速开始</span><h3>发送一条微信兼容文本</h3></div><Code2 size={20} /></header>
            <div className="notify-api-base"><span>接口地址</span><code>{apiBaseUrl}</code><button className="icon-button" type="button" title="复制接口地址" aria-label="复制接口地址" onClick={() => copyText(apiBaseUrl, '接口地址')}><Clipboard size={16} /></button></div>
            <pre className="notify-api-code"><code>{curlExample}</code></pre>
            <button className="secondary-action notify-api-copy-code" type="button" onClick={() => copyText(curlExample, '调用示例')}><Clipboard size={16} />复制示例</button>
          </section>
          <section className="ops-panel notify-api-endpoints-panel">
            <header><div><span>接口目录</span><h3>可用端点</h3></div><BookOpen size={20} /></header>
            <div className="notify-api-endpoint-list">
              <div><span className="method post">POST</span><code>/api/notify</code><strong>立即发送</strong><small>notifications:send</small></div>
              <div><span className="method post">POST</span><code>/api/notify/enqueue</code><strong>创建通知任务</strong><small>notifications:enqueue</small></div>
              <div><span className="method get">GET</span><code>/api/notify/deliveries/:id</code><strong>查询发送结果</strong><small>notifications:status:read</small></div>
              <div><span className="method get">GET</span><code>/api/notify/openapi.json</code><strong>OpenAPI 定义</strong><small>无需鉴权</small></div>
            </div>
            <a className="secondary-action notify-openapi-link" href={access.openApiPath} target="_blank" rel="noreferrer"><Code2 size={16} />打开 OpenAPI JSON</a>
          </section>
          <section className="ops-panel notify-api-rules-panel">
            <header><div><span>消息兼容</span><h3>微信端显示规则</h3></div><ShieldCheck size={20} /></header>
            <div className="notify-api-compat-list"><div><CheckCircle2 size={18} /><span><strong>text</strong><small>企业微信与微信插件会话均可正常显示，推荐用于系统通知。</small></span></div><div><XCircle size={18} /><span><strong>markdown / textcard / news</strong><small>微信侧可能提示“不支持此消息类型”，仅在企业微信内使用。</small></span></div><div><ShieldCheck size={18} /><span><strong>发送目标</strong><small>默认必须指定单个用户；部门、标签、多用户和 @all 需要额外批量权限。</small></span></div></div>
          </section>
          <section className="ops-panel notify-api-errors-panel">
            <header><div><span>返回约定</span><h3>常见状态码</h3></div><ScrollText size={20} /></header>
            <div className="notify-api-error-list"><div><code>400</code><span>参数或接收目标无效</span></div><div><code>401</code><span>API 密钥无效或已过期</span></div><div><code>403</code><span>权限范围不足</span></div><div><code>429</code><span>超过应用调用频率</span></div><div><code>502</code><span>企业微信发送失败</span></div></div>
          </section>
        </div>
      )}

      {mode === 'logs' && (
        <section className="ops-panel notify-api-logs-panel">
          <header className="notify-records-header"><div><span>访问审计</span><h3>{access.requests.total || 0} 条调用</h3></div><div className="notify-filters"><SelectControl ariaLabel="按 API 应用筛选" value={requestFilters.clientId} onChange={(value) => { setRequestPage(1); setRequestFilters((current) => ({ ...current, clientId: value })); }} options={[{ value: '', label: '全部应用' }, ...access.clients.map((client) => ({ value: client.id, label: client.name }))]} /><SelectControl ariaLabel="按调用结果筛选" value={requestFilters.outcome} onChange={(value) => { setRequestPage(1); setRequestFilters((current) => ({ ...current, outcome: value })); }} options={[{ value: '', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'failure', label: '失败' }]} /></div></header>
          <div className="notify-api-log-table">
            <div className="notify-api-log-head"><span>时间</span><span>应用</span><span>接口</span><span>结果</span><span>发送目标</span><span>耗时</span></div>
            {access.requests.items?.length ? access.requests.items.map((row) => <div className="notify-api-log-row" key={row.id}><span>{formatDateTime(row.startedAt)}</span><strong>{row.clientName || '--'}</strong><code>{row.method} {row.endpoint}</code><span className={`notify-api-http ${row.outcome}`}>{row.httpStatus}{row.errorCode ? ` · ${row.errorCode}` : ''}</span><span>{row.targetType ? `${row.targetType} ${row.targetValue || ''}` : '--'}</span><span>{Number.isFinite(row.durationMs) ? `${row.durationMs} ms` : '--'}</span></div>) : <div className="ops-empty">当前筛选条件下没有 API 调用记录</div>}
          </div>
          <footer className="notify-pagination"><span>第 {access.requests.page || requestPage} / {totalRequestPages} 页</span><div><button type="button" disabled={requestPage <= 1} onClick={() => setRequestPage((page) => Math.max(1, page - 1))}>上一页</button><button type="button" disabled={requestPage >= totalRequestPages} onClick={() => setRequestPage((page) => Math.min(totalRequestPages, page + 1))}>下一页</button></div></footer>
        </section>
      )}
      </div>

      <SecretDialog secret={secret} onClose={() => setSecret(null)} onCopy={(token) => copyText(token, 'API 密钥')} />
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.type === 'revoke' ? '吊销 API 应用' : '轮换 API 密钥'}
        description={pending?.type === 'revoke' ? '该应用的全部密钥会立即失效，此操作不可恢复。' : '将生成一个新密钥，当前密钥保留 24 小时用于平滑迁移。'}
        detail={pending?.client?.name}
        confirmLabel={pending?.type === 'revoke' ? '确认吊销' : '生成新密钥'}
        tone={pending?.type === 'revoke' ? 'danger' : 'primary'}
        busy={submitting}
        onCancel={() => !submitting && setPending(null)}
        onConfirm={confirmLifecycle}
      />
    </div>
  );
}
