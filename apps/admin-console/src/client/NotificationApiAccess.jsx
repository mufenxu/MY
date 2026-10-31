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
  'notifications:app:send': ['App', '允许向 MY Android 用户收件箱发送通知。'],
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
  if (client.status === 'revoked') return { label: '已吊销', className: 'revoked', tone: 'neutral' };
  if (client.expiresAt && new Date(client.expiresAt) <= new Date()) return { label: '已过期', className: 'expired', tone: 'warn' };
  return { label: '使用中', className: 'active', tone: 'ok' };
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
      <section ref={dialogRef} className="secret-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
        <header className="panel-head">
          <div className="panel-title"><span className="stat-icon tone-warn"><KeyRound size={15} /></span>API 密钥</div>
          <button className="icon-action" type="button" aria-label="关闭密钥弹窗" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="panel-body">
          <span className="secret-dialog-eyebrow">仅显示一次</span>
          <h2 id={titleId} className="secret-dialog-title">保存 {secret.client?.name || 'API 应用'} 的密钥</h2>
          <p className="secret-dialog-copy">关闭后无法再次查看完整密钥。服务端仅保存不可逆摘要。</p>
          <div className="secret-value">
            <code>{secret.token}</code>
            <button className="icon-action" type="button" title="复制 API 密钥" aria-label="复制 API 密钥" onClick={() => onCopy(secret.token)}><Clipboard size={15} /></button>
          </div>
          <button ref={closeRef} className="btn btn-primary btn-block" type="button" onClick={onClose}><Check size={15} />我已妥善保存</button>
        </div>
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
    window.requestAnimationFrame(() => document.querySelector('.api-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  if (loading) return <div className="loading-inline"><LoaderCircle className="spin" size={17} />正在读取 API 接入配置</div>;

  const overview = access.overview;
  const totalRequestPages = Math.max(1, Math.ceil((access.requests.total || 0) / (access.requests.pageSize || 20)));
  return (
    <div className="view-stack">
      <div className="toolbar">
        <span className="toolbar-label"><ShieldCheck size={14} aria-hidden="true" />通知 API</span>
        <span className="toolbar-hint">按应用隔离权限、密钥与调用记录</span>
        <div className="toolbar-end">
          <button className="btn btn-secondary btn-sm" type="button" title="刷新 API 数据" aria-label="刷新 API 数据" disabled={refreshing} onClick={() => loadAccess({ quiet: true })}>
            <RefreshCw className={refreshing ? 'spin' : ''} size={15} />刷新
          </button>
        </div>
      </div>

      <div className="stat-strip">
        <article className="stat-card">
          <span className="stat-icon tone-info"><ShieldCheck size={17} /></span>
          <div><span className="stat-label">有效应用</span><strong className="stat-figure">{overview.activeClients || 0}</strong><small className="stat-foot">{overview.activeKeys || 0} 个有效密钥</small></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-violet"><ScrollText size={17} /></span>
          <div><span className="stat-label">24 小时调用</span><strong className="stat-figure">{overview.totalRequests || 0}</strong><small className="stat-foot">完整调用审计</small></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-ok"><CheckCircle2 size={17} /></span>
          <div><span className="stat-label">成功率</span><strong className="stat-figure">{overview.successRate == null ? '--' : `${overview.successRate}%`}</strong><small className="stat-foot">最近 24 小时</small></div>
        </article>
        <article className="stat-card">
          <span className="stat-icon tone-warn"><Gauge size={17} /></span>
          <div><span className="stat-label">P95 耗时</span><strong className="stat-figure">{overview.p95DurationMs == null ? '--' : overview.p95DurationMs}</strong><small className="stat-foot">{overview.p95DurationMs == null ? '暂无数据' : '毫秒'}</small></div>
        </article>
      </div>

      <SegmentedTabs
        className="segmented notify-context-tabs"
        ariaLabel="API 接入视图"
        idPrefix="notify-api-tab"
        panelId="notify-api-panel"
        items={[
          { id: 'clients', label: <><KeyRound size={15} />应用与密钥</> },
          { id: 'docs', label: <><BookOpen size={15} />调用说明</> },
          { id: 'logs', label: <><ScrollText size={15} />调用日志</> },
        ]}
        value={mode}
        onChange={setMode}
      />

      <div id="notify-api-panel" role="tabpanel" aria-labelledby={`notify-api-tab-${mode}`}>

      {mode === 'clients' && (
        <div className="split">
          <section className="panel panel-flush">
            <div className="panel-head">
              <div className="panel-title"><KeyRound size={15} aria-hidden="true" />API 应用</div>
              <span className="panel-meta">{access.clients.length} 个访问主体</span>
            </div>
            {access.legacyKeyConfigured && (
              <div className="panel-note">
                <ShieldCheck size={14} aria-hidden="true" />
                <span><strong>兼容密钥仍在生效</strong> · 旧的全局密钥可继续使用，建议逐步迁移到独立应用密钥。</span>
              </div>
            )}
            <div className="data-list">
              <div className="data-head col-api" aria-hidden="true">
                <span>状态</span><span>应用</span><span>限流与密钥</span><span>权限</span><span className="cell-actions">操作</span>
              </div>
              {access.clients.length ? access.clients.map((client) => {
                const state = clientState(client);
                const activeKey = client.keys?.find((key) => !key.revokedAt && (!key.expiresAt || new Date(key.expiresAt) > new Date()));
                return (
                  <div className="data-row col-api" key={client.id}>
                    <span className={`tag tone-${state.tone}`}>{state.label}</span>
                    <span className="cell-stack">
                      <strong>{client.name}</strong>
                      <small>{client.description || '无备注'}</small>
                    </span>
                    <span className="cell-stack">
                      <small>{client.rateLimitPerMinute} 次 / 分钟 · {activeKey?.tokenPrefix || '无有效密钥'}</small>
                      <small>最近使用 {formatDateTime(activeKey?.lastUsedAt)}</small>
                    </span>
                    <span className="cell-scopes">
                      {client.scopes.map((scope) => <span className="code-chip" key={scope}>{SCOPE_DETAILS[scope]?.[0] || scope}</span>)}
                    </span>
                    <span className="row-actions">
                      <button className="icon-action" type="button" title="编辑 API 应用" aria-label={`编辑 ${client.name}`} disabled={!canManage || state.className !== 'active'} onClick={() => editClient(client)}><Edit3 size={15} /></button>
                      <button className="icon-action" type="button" title="轮换密钥" aria-label={`轮换 ${client.name} 的密钥`} disabled={!canManage || state.className !== 'active'} onClick={() => setPending({ type: 'rotate', client })}><RefreshCw size={15} /></button>
                      <button className="icon-action danger" type="button" title="吊销应用" aria-label={`吊销 ${client.name}`} disabled={!canManage || state.className !== 'active'} onClick={() => setPending({ type: 'revoke', client })}><Ban size={15} /></button>
                    </span>
                  </div>
                );
              }) : <div className="data-list-empty"><span>尚未创建独立 API 应用</span></div>}
            </div>
          </section>

          <section className="panel api-form-panel">
            <div className="panel-head">
              <div className="panel-title"><Code2 size={15} aria-hidden="true" />{form.id ? `编辑 ${form.name}` : '创建 API 应用'}</div>
              <span className="panel-meta">{form.id ? '调整权限' : '新增接入方'}</span>
            </div>
            <div className="panel-body">
              <form className="form-stack" onSubmit={saveClient}>
                <label className="config-field"><span>应用名称</span><input value={form.name} maxLength={100} required disabled={!canManage} placeholder="例如 校园服务" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label className="config-field"><span>用途说明</span><textarea value={form.description} maxLength={300} rows={2} disabled={!canManage} placeholder="记录系统归属和使用场景" onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <div className="form-row-2">
                  <label className="config-field"><span>每分钟上限</span><input type="number" min="1" max="120" value={form.rateLimitPerMinute} disabled={!canManage} onChange={(event) => setForm({ ...form, rateLimitPerMinute: event.target.value })} /></label>
                  <label className="config-field"><span>应用到期日</span><input type="date" value={form.expiresAt} disabled={!canManage} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
                </div>
                <fieldset className="scope-fieldset" disabled={!canManage}>
                  <legend>权限范围</legend>
                  <div className="scope-grid">
                    {access.supportedScopes.map((scope) => (
                      <label className={`scope-option ${scope === 'notifications:broadcast' ? 'is-sensitive' : ''}`} key={scope}>
                        <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                        <span className="cell-stack"><strong>{SCOPE_DETAILS[scope]?.[0] || scope}</strong><small>{SCOPE_DETAILS[scope]?.[1] || scope}</small></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {!canManage && <p className="field-hint">仅超级管理员可以创建或修改 API 应用。</p>}
                <div className="inline-actions is-end">
                  {form.id && <button className="btn btn-secondary" type="button" disabled={submitting} onClick={() => setForm(blankForm())}><X size={15} />取消编辑</button>}
                  <button className="btn btn-primary" type="submit" disabled={!canManage || submitting || form.name.trim().length < 2 || !form.scopes.length}>
                    {submitting ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}
                    {form.id ? '保存应用' : '创建并生成密钥'}
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      )}

      {mode === 'docs' && (
        <div className="grid-2">
          <section className="panel">
            <div className="panel-head">
              <div className="panel-title"><Code2 size={15} aria-hidden="true" />发送一条微信兼容文本</div>
              <span className="panel-meta">快速开始</span>
            </div>
            <div className="panel-body">
              <div className="code-row">
                <span>接口地址</span>
                <code>{apiBaseUrl}</code>
                <button className="icon-action" type="button" title="复制接口地址" aria-label="复制接口地址" onClick={() => copyText(apiBaseUrl, '接口地址')}><Clipboard size={15} /></button>
              </div>
              <pre className="code-block api-code">{curlExample}</pre>
              <button className="btn btn-secondary btn-block" type="button" onClick={() => copyText(curlExample, '调用示例')}><Clipboard size={15} />复制示例</button>
            </div>
          </section>

          <section className="panel panel-flush">
            <div className="panel-head">
              <div className="panel-title"><BookOpen size={15} aria-hidden="true" />可用端点</div>
              <span className="panel-meta">接口目录</span>
            </div>
            <div className="data-list">
              <div className="data-row col-endpoint"><span className="code-chip">POST</span><code>/api/notify</code><span className="cell-stack"><strong>立即发送</strong><small>notifications:send</small></span></div>
              <div className="data-row col-endpoint"><span className="code-chip">POST</span><code>/api/notify/enqueue</code><span className="cell-stack"><strong>创建通知任务</strong><small>notifications:enqueue</small></span></div>
              <div className="data-row col-endpoint"><span className="code-chip">GET</span><code>/api/notify/deliveries/:id</code><span className="cell-stack"><strong>查询发送结果</strong><small>notifications:status:read</small></span></div>
              <div className="data-row col-endpoint"><span className="code-chip">GET</span><code>/api/notify/openapi.json</code><span className="cell-stack"><strong>OpenAPI 定义</strong><small>无需鉴权</small></span></div>
            </div>
            <div className="table-foot">
              <a className="btn btn-secondary btn-sm" href={access.openApiPath} target="_blank" rel="noreferrer"><Code2 size={15} />打开 OpenAPI JSON</a>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div className="panel-title"><ShieldCheck size={15} aria-hidden="true" />微信端显示规则</div>
              <span className="panel-meta">消息兼容</span>
            </div>
            <div className="panel-body">
              <div className="compat-list">
                <div className="compat-row is-ok"><CheckCircle2 size={15} /><span className="cell-stack"><strong>text</strong><small>企业微信与微信插件会话均可正常显示，推荐用于系统通知。</small></span></div>
                <div className="compat-row is-warn"><XCircle size={15} /><span className="cell-stack"><strong>markdown / textcard / news</strong><small>微信侧可能提示“不支持此消息类型”，仅在企业微信内使用。</small></span></div>
                <div className="compat-row"><ShieldCheck size={15} /><span className="cell-stack"><strong>发送目标</strong><small>默认必须指定单个用户；部门、标签、多用户和 @all 需要额外批量权限。</small></span></div>
              </div>
            </div>
          </section>

          <section className="panel panel-flush">
            <div className="panel-head">
              <div className="panel-title"><ScrollText size={15} aria-hidden="true" />常见状态码</div>
              <span className="panel-meta">返回约定</span>
            </div>
            <div className="data-list">
              {[['400', '参数或接收目标无效'], ['401', 'API 密钥无效或已过期'], ['403', '权限范围不足'], ['429', '超过应用调用频率'], ['502', '企业微信发送失败']].map(([code, text]) => (
                <div className="data-row col-error" key={code}><span className="code-chip">{code}</span><span>{text}</span></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {mode === 'logs' && (
        <section className="panel panel-flush">
          <div className="panel-head">
            <div className="panel-title"><ScrollText size={15} aria-hidden="true" />调用日志<span className="panel-meta">{access.requests.total || 0} 条</span></div>
            <div className="notify-filters">
              <SelectControl ariaLabel="按 API 应用筛选" value={requestFilters.clientId} onChange={(value) => { setRequestPage(1); setRequestFilters((current) => ({ ...current, clientId: value })); }} options={[{ value: '', label: '全部应用' }, ...access.clients.map((client) => ({ value: client.id, label: client.name }))]} />
              <SelectControl ariaLabel="按调用结果筛选" value={requestFilters.outcome} onChange={(value) => { setRequestPage(1); setRequestFilters((current) => ({ ...current, outcome: value })); }} options={[{ value: '', label: '全部结果' }, { value: 'success', label: '成功' }, { value: 'failure', label: '失败' }]} />
            </div>
          </div>
          <div className="data-list">
            <div className="data-head col-api-log" aria-hidden="true"><span>时间</span><span>应用</span><span>接口</span><span>结果</span><span>发送目标</span><span className="cell-num">耗时</span></div>
            {access.requests.items?.length ? access.requests.items.map((row) => (
              <div className="data-row col-api-log" key={row.id}>
                <span className="panel-meta">{formatDateTime(row.startedAt)}</span>
                <span className="cell-truncate">{row.clientName || '--'}</span>
                <code className="cell-mono cell-truncate">{row.method} {row.endpoint}</code>
                <span className={`tag tone-${row.outcome === 'success' ? 'ok' : 'danger'}`}>{row.httpStatus}{row.errorCode ? ` · ${row.errorCode}` : ''}</span>
                <span className="cell-truncate">{row.targetType ? `${row.targetType} ${row.targetValue || ''}` : '--'}</span>
                <span className="cell-num">{Number.isFinite(row.durationMs) ? `${row.durationMs} ms` : '--'}</span>
              </div>
            )) : <div className="data-list-empty"><span>当前筛选条件下没有 API 调用记录</span></div>}
          </div>
          <footer className="table-foot">
            <span className="panel-meta">第 {access.requests.page || requestPage} / {totalRequestPages} 页</span>
            <div className="inline-actions">
              <button className="btn btn-secondary btn-sm" type="button" disabled={requestPage <= 1} onClick={() => setRequestPage((page) => Math.max(1, page - 1))}>上一页</button>
              <button className="btn btn-secondary btn-sm" type="button" disabled={requestPage >= totalRequestPages} onClick={() => setRequestPage((page) => Math.min(totalRequestPages, page + 1))}>下一页</button>
            </div>
          </footer>
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
