import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  FileText,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ServerCog,
  ShieldCheck,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import NotificationApiAccess from './NotificationApiAccess.jsx';
import { ConfirmDialog, SelectControl } from './UiControls.jsx';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'success', label: '发送成功' },
  { value: 'failed', label: '发送失败' },
  { value: 'pending', label: '发送中' },
];
const CALLER_OPTIONS = [
  { value: '', label: '全部调用方' },
  { value: 'admin-console', label: '统一控制台' },
  { value: 'platform-api', label: '平台网关' },
  { value: 'core-api', label: '核心服务' },
  { value: 'external-api', label: '外部 API' },
];
const TYPE_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'text', label: '文本（兼容微信）' },
  { value: 'markdown', label: 'Markdown（仅企业微信）' },
  { value: 'textcard', label: '文本卡片' },
  { value: 'news', label: '图文' },
];

function roleAtLeast(role, required) {
  return ({ viewer: 1, operator: 2, super_admin: 3 }[role] || 0) >= ({ viewer: 1, operator: 2, super_admin: 3 }[required] || 0);
}

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('zh-CN', { hour12: false });
}

function callerLabel(value) {
  return {
    'admin-console': '统一控制台',
    'platform-api': '平台网关',
    'core-api': '核心服务',
    'external-api': '外部 API',
  }[value] || value || '--';
}

function typeLabel(value) {
  return { text: '文本（兼容微信）', markdown: 'Markdown（仅企业微信）', textcard: '文本卡片', news: '图文' }[value] || value || '--';
}

function targetLabel(delivery) {
  const prefix = { user: '用户', party: '部门', tag: '标签', all: '全员' }[delivery.targetType] || '目标';
  return delivery.targetType === 'all' ? prefix : `${prefix} ${delivery.targetValue || '--'}`;
}

function DeliveryState({ value }) {
  const meta = {
    success: { label: '成功', icon: CheckCircle2 },
    failed: { label: '失败', icon: XCircle },
    pending: { label: '发送中', icon: Clock3 },
  }[value] || { label: value || '--', icon: CircleAlert };
  const Icon = meta.icon;
  return <span className={`notify-state notify-state-${value || 'unknown'}`}><Icon size={14} />{meta.label}</span>;
}

function Feedback({ error, message }) {
  if (!error && !message) return null;
  return <div className={`ops-feedback ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}<span>{error || message}</span></div>;
}

function ConfigurationState({ ready, label, detail }) {
  return (
    <div className={`notify-config-row ${ready ? 'ready' : 'missing'}`}>
      <span>{ready ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}</span>
      <div><strong>{label}</strong><small>{detail}</small></div>
    </div>
  );
}

export default function NotificationServiceView({ session }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [deliveries, setDeliveries] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [filters, setFilters] = useState({ status: '', caller: '', msgType: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ msgType: 'text', touser: '', content: '' });
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [templateForm, setTemplateForm] = useState({ key: '', name: '', description: '', msgType: 'text', content: '', enabled: true });
  const [jobForm, setJobForm] = useState({ templateKey: '', touser: '', scheduledAt: '', dedupeKey: '', variables: '{}' });
  const [preferenceForm, setPreferenceForm] = useState({ targetId: '', enabled: true, quietStart: '22:00', quietEnd: '07:00' });
  const [pendingAction, setPendingAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const canOperate = roleAtLeast(session.user?.role, 'operator');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      const [overviewResult, deliveryResult, templateResult, jobResult] = await Promise.all([
        requestJson('/api/notifications/overview'),
        requestJson(`/api/notifications/deliveries?${query}`),
        requestJson('/api/notifications/templates'),
        requestJson('/api/notifications/jobs?page=1&pageSize=20'),
      ]);
      setOverview(overviewResult);
      setDeliveries(deliveryResult);
      setTemplates(templateResult.items || []);
      setJobs(jobResult);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(deliveries.total / deliveries.pageSize));
  const history = overview?.history || {};
  const recent = deliveries.items.slice(0, 5);
  const contentLimit = form.msgType === 'markdown' ? 4096 : 2048;
  const canSubmitTest = Boolean(canOperate && form.touser.trim() && form.touser.trim() !== '@all' && !form.touser.includes('|') && form.content.trim());
  const preview = useMemo(() => form.content.trim() || '消息预览', [form.content]);

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function confirmAction() {
    const action = pendingAction;
    if (!action) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (action.type === 'test') {
        await requestJson('/api/notifications/test', { method: 'POST', body: JSON.stringify(form) });
        setMessage('测试通知已发送');
        setForm((current) => ({ ...current, content: '' }));
      } else if (action.type === 'retry') {
        await requestJson(`/api/notifications/deliveries/${encodeURIComponent(action.delivery.id)}/retry`, { method: 'POST' });
        setMessage('失败通知已重新发送');
      } else if (action.type === 'cancel-job') {
        await requestJson(`/api/notifications/jobs/${encodeURIComponent(action.job.id)}/cancel`, { method: 'POST' });
        setMessage('计划任务已取消');
      } else if (action.type === 'delete-template') {
        await requestJson(`/api/notifications/templates/${encodeURIComponent(action.template.key)}`, { method: 'DELETE' });
        setMessage('通知模板已删除');
      }
      setPendingAction(null);
      if (action.type === 'test' || action.type === 'retry') setTab('records');
      if (action.type === 'cancel-job') setTab('jobs');
      if (action.type === 'delete-template') setTab('templates');
      await load({ quiet: true });
    } catch (requestError) {
      setPendingAction(null);
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTemplate() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      await requestJson(`/api/notifications/templates/${encodeURIComponent(templateForm.key.trim())}`, {
        method: 'PUT', body: JSON.stringify(templateForm),
      });
      setMessage('通知模板已保存');
      setTemplateForm({ key: '', name: '', description: '', msgType: 'text', content: '', enabled: true });
      await load({ quiet: true });
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  async function scheduleJob() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      const variables = JSON.parse(jobForm.variables || '{}');
      await requestJson('/api/notifications/jobs', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: jobForm.templateKey,
          target: { touser: jobForm.touser.trim() },
          variables,
          ...(jobForm.scheduledAt ? { scheduledAt: new Date(jobForm.scheduledAt).toISOString() } : {}),
          ...(jobForm.dedupeKey.trim() ? { dedupeKey: jobForm.dedupeKey.trim() } : {}),
        }),
      });
      setMessage('通知任务已创建');
      setJobForm({ ...jobForm, touser: '', scheduledAt: '', dedupeKey: '', variables: '{}' });
      await load({ quiet: true });
    } catch (requestError) { setError(requestError instanceof SyntaxError ? '模板变量必须是有效 JSON。' : requestError.message); }
    finally { setSubmitting(false); }
  }

  async function loadPreference() {
    if (!preferenceForm.targetId.trim()) return;
    setError('');
    try {
      const result = await requestJson(`/api/notifications/preferences/${encodeURIComponent(preferenceForm.targetId.trim())}`);
      const preference = result.preference || {};
      setPreferenceForm((current) => ({ ...current, enabled: preference.enabled ?? true, quietStart: preference.quietHours?.start || '22:00', quietEnd: preference.quietHours?.end || '07:00' }));
      setMessage(preference.targetId ? '已读取接收偏好' : '该用户尚未设置偏好');
    } catch (requestError) { setError(requestError.message); }
  }

  async function savePreference() {
    setSubmitting(true); setError(''); setMessage('');
    try {
      await requestJson(`/api/notifications/preferences/${encodeURIComponent(preferenceForm.targetId.trim())}`, {
        method: 'PUT', body: JSON.stringify({ enabled: preferenceForm.enabled, quietHours: { start: preferenceForm.quietStart, end: preferenceForm.quietEnd }, timezoneOffsetMinutes: 480 }),
      });
      setMessage('接收偏好已保存');
    } catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }

  if (loading && !overview) {
    return <section className="page-view notify-page"><div className="ops-loading"><LoaderCircle className="spin" size={20} />正在读取通知服务</div></section>;
  }

  return (
    <section className="page-view notify-page" aria-label="企业微信通知通道">
      <div className="notify-toolbar">
        <div className="ops-segmented" role="tablist" aria-label="通知服务视图">
          {[
            ['overview', '概览'],
            ['records', '发送'],
            ['jobs', '编排'],
            ['preferences', '接收偏好'],
            ['api', 'API 接入'],
          ].map(([id, label]) => {
            const active = id === 'records' ? ['records', 'test'].includes(tab) : id === 'jobs' ? ['jobs', 'templates'].includes(tab) : tab === id;
            return <button key={id} className={active ? 'active' : ''} type="button" role="tab" aria-selected={active} onClick={() => setTab(id)}>{label}</button>;
          })}
        </div>
        {tab !== 'api' && <button className="icon-button notify-refresh" type="button" title="刷新通知数据" aria-label="刷新通知数据" disabled={refreshing} onClick={() => load({ quiet: true })}><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>}
      </div>
      {['records', 'test'].includes(tab) && <div className="notify-context-tabs" role="tablist" aria-label="发送视图"><button className={tab === 'records' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'records'} onClick={() => setTab('records')}>发送记录</button><button className={tab === 'test' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'test'} onClick={() => setTab('test')}>发送测试</button></div>}
      {['jobs', 'templates'].includes(tab) && <div className="notify-context-tabs" role="tablist" aria-label="编排视图"><button className={tab === 'jobs' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'jobs'} onClick={() => setTab('jobs')}>计划任务</button><button className={tab === 'templates' ? 'active' : ''} type="button" role="tab" aria-selected={tab === 'templates'} onClick={() => setTab('templates')}>消息模板</button></div>}
      <Feedback error={error} message={message} />

      {tab === 'overview' && (
        <>
          <div className="ops-kpis notify-kpis">
            <article><Activity size={21} /><div><span>24 小时成功率</span><strong>{history.successRate == null ? '--' : `${history.successRate}%`}</strong><small>{history.total || 0} 次发送</small></div></article>
            <article><CheckCircle2 size={21} /><div><span>发送成功</span><strong>{history.success || 0}</strong><small>最近 24 小时</small></div></article>
            <article><CircleAlert size={21} /><div><span>发送失败</span><strong>{history.failed || 0}</strong><small>{history.pending || 0} 次处理中</small></div></article>
            <article><Clock3 size={21} /><div><span>P95 耗时</span><strong>{history.p95DurationMs == null ? '--' : history.p95DurationMs}</strong><small>{history.p95DurationMs == null ? '暂无数据' : '毫秒'}</small></div></article>
          </div>
          <div className="notify-overview-grid">
            <section className="ops-panel notify-config-panel">
              <header><div><span>连接状态</span><h3>通道与存储</h3></div><ServerCog size={20} /></header>
              <div className="notify-config-list">
                <ConfigurationState ready={overview?.configured} label="通知服务" detail={overview?.configured ? '管理连接已建立' : '尚未配置管理连接'} />
                <ConfigurationState ready={overview?.storageHealthy} label="发送台账" detail={overview?.storageHealthy ? `保留 ${overview.retentionDays} 天` : '存储连接异常'} />
                <ConfigurationState ready={overview?.wecom?.corpIdConfigured && overview?.wecom?.secretConfigured} label="企业微信应用" detail={overview?.wecom?.agentId ? `AgentId ${overview.wecom.agentId}` : '应用凭据未配置'} />
                <ConfigurationState ready={true} label="敏感数据" detail="服务端托管" />
              </div>
            </section>
            <section className="ops-panel notify-recent-panel">
              <header><div><span>最近活动</span><h3>最新发送</h3></div><BellRing size={20} /></header>
              <div className="notify-recent-list">
                {recent.length ? recent.map((delivery) => (
                  <button type="button" key={delivery.id} onClick={() => setTab('records')}>
                    <DeliveryState value={delivery.status} />
                    <span><strong>{targetLabel(delivery)}</strong><small>{callerLabel(delivery.caller)} · {formatDateTime(delivery.startedAt)}</small></span>
                  </button>
                )) : <div className="ops-empty compact">暂无发送记录</div>}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === 'records' && (
        <section className="ops-panel notify-records-panel">
          <header className="notify-records-header">
            <div><span>发送台账</span><h3>{deliveries.total} 条记录</h3></div>
            <div className="notify-filters">
              <SelectControl ariaLabel="按发送状态筛选" value={filters.status} onChange={(value) => updateFilter('status', value)} options={STATUS_OPTIONS} />
              <SelectControl ariaLabel="按调用方筛选" value={filters.caller} onChange={(value) => updateFilter('caller', value)} options={CALLER_OPTIONS} />
              <SelectControl ariaLabel="按消息类型筛选" value={filters.msgType} onChange={(value) => updateFilter('msgType', value)} options={TYPE_OPTIONS} />
            </div>
          </header>
          <div className="notify-table">
            <div className="notify-table-head"><span>时间</span><span>结果</span><span>调用方</span><span>类型</span><span>发送目标</span><span>耗时</span><span /></div>
            <div className="notify-table-body">
              {deliveries.items.length ? deliveries.items.map((delivery) => (
                <div className="notify-table-row" key={delivery.id}>
                  <span className="notify-time">{formatDateTime(delivery.startedAt)}</span>
                  <DeliveryState value={delivery.status} />
                  <span>{callerLabel(delivery.caller)}</span>
                  <span>{typeLabel(delivery.msgType)}</span>
                  <span className="notify-target"><strong>{targetLabel(delivery)}</strong>{delivery.errorMessage && <small title={delivery.errorMessage}>{delivery.wecomCode ? `企业微信 ${delivery.wecomCode}` : delivery.errorCode}</small>}</span>
                  <span>{Number.isFinite(delivery.durationMs) ? `${delivery.durationMs} ms` : '--'}</span>
                  <button className="icon-button notify-retry" type="button" title={delivery.retryable && delivery.status === 'failed' ? '重试此通知' : '此记录不可重试'} aria-label="重试此通知" disabled={!canOperate || !delivery.retryable || delivery.status !== 'failed'} onClick={() => setPendingAction({ type: 'retry', delivery })}><RotateCcw size={16} /></button>
                </div>
              )) : <div className="ops-empty">当前筛选条件下没有发送记录</div>}
            </div>
          </div>
          <footer className="notify-pagination"><span>第 {deliveries.page} / {totalPages} 页</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>下一页</button></div></footer>
        </section>
      )}

      {tab === 'test' && (
        <div className="notify-test-layout">
          <section className="ops-panel notify-test-form">
            <header><div><span>单用户验证</span><h3>发送测试通知</h3></div><ShieldCheck size={20} /></header>
            <label><span>消息类型</span><SelectControl ariaLabel="测试消息类型" value={form.msgType} onChange={(value) => setForm({ ...form, msgType: value, content: form.content.slice(0, value === 'markdown' ? 4096 : 2048) })} options={TYPE_OPTIONS.filter((option) => ['text', 'markdown'].includes(option.value))} /></label>
            <label><span>企业微信用户 ID</span><div className="notify-input-wrap"><UserRound size={17} /><input value={form.touser} maxLength={64} autoComplete="off" placeholder="例如 zhangsan" onChange={(event) => setForm({ ...form, touser: event.target.value })} /></div></label>
            <label><span>消息内容</span><textarea value={form.content} maxLength={contentLimit} rows={9} placeholder="输入测试消息" onChange={(event) => setForm({ ...form, content: event.target.value })} /><small>{form.content.length} / {contentLimit}</small></label>
            <button className="primary-button notify-send-button" type="button" disabled={!canSubmitTest} onClick={() => setPendingAction({ type: 'test' })}><Send size={17} />发送测试</button>
          </section>
          <section className="ops-panel notify-preview-panel">
            <header><div><span>企业微信</span><h3>消息预览</h3></div><Send size={20} /></header>
            <div className="notify-message-preview"><span>{form.msgType === 'markdown' ? 'Markdown（仅企业微信）' : '文本消息（兼容微信）'}</span><pre>{preview}</pre><small>发送给 {form.touser.trim() || '未选择用户'}</small></div>
          </section>
        </div>
      )}

      {tab === 'jobs' && (
        <div className="notify-orchestration-layout">
          <section className="ops-panel notify-test-form">
            <header><div><span>编排</span><h3>安排通知</h3></div><CalendarClock size={20} /></header>
            <label><span>消息模板</span><SelectControl ariaLabel="消息模板" value={jobForm.templateKey} onChange={(value) => setJobForm({ ...jobForm, templateKey: value })} options={[{ value: '', label: '选择模板' }, ...templates.filter((item) => item.enabled).map((item) => ({ value: item.key, label: item.name }))]} /></label>
            <label><span>企业微信用户 ID</span><input value={jobForm.touser} maxLength={64} onChange={(event) => setJobForm({ ...jobForm, touser: event.target.value })} /></label>
            <label><span>计划时间</span><input type="datetime-local" value={jobForm.scheduledAt} onChange={(event) => setJobForm({ ...jobForm, scheduledAt: event.target.value })} /></label>
            <label><span>去重键</span><input value={jobForm.dedupeKey} maxLength={160} onChange={(event) => setJobForm({ ...jobForm, dedupeKey: event.target.value })} /></label>
            <label><span>模板变量 JSON</span><textarea rows={5} value={jobForm.variables} onChange={(event) => setJobForm({ ...jobForm, variables: event.target.value })} /></label>
            <button className="primary-button" type="button" disabled={!canOperate || !jobForm.templateKey || !jobForm.touser.trim() || submitting} onClick={scheduleJob}><CalendarClock size={17} />创建任务</button>
          </section>
          <section className="ops-panel notify-jobs-panel">
            <header><div><span>任务队列</span><h3>{jobs.total || 0} 个任务</h3></div><Activity size={20} /></header>
            <div className="notify-template-list">{jobs.items?.length ? jobs.items.map((job) => <div key={job.id} className="notify-template-row"><div><strong>{job.templateKey || typeLabel(job.msgType)}</strong><small>{targetLabel(job)} · {formatDateTime(job.scheduledAt)}</small></div><span className={`notify-state notify-state-${job.status}`}>{job.status}</span><button className="icon-button" type="button" title="取消任务" disabled={!canOperate || !['scheduled', 'retrying'].includes(job.status)} onClick={() => setPendingAction({ type: 'cancel-job', job })}><X size={16} /></button></div>) : <div className="ops-empty">暂无计划任务</div>}</div>
          </section>
        </div>
      )}

      {tab === 'templates' && (
        <div className="notify-orchestration-layout">
          <section className="ops-panel notify-test-form">
            <header><div><span>模板</span><h3>编辑消息模板</h3></div><FileText size={20} /></header>
            <label><span>模板标识</span><input value={templateForm.key} maxLength={80} disabled={Boolean(templates.some((item) => item.key === templateForm.key))} onChange={(event) => setTemplateForm({ ...templateForm, key: event.target.value })} /></label>
            <label><span>显示名称</span><input value={templateForm.name} maxLength={100} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /></label>
            <label><span>消息类型</span><SelectControl ariaLabel="模板消息类型" value={templateForm.msgType} onChange={(value) => setTemplateForm({ ...templateForm, msgType: value })} options={TYPE_OPTIONS.filter((item) => ['text', 'markdown'].includes(item.value))} /></label>
            <label><span>内容</span><textarea rows={8} value={templateForm.content} maxLength={4096} onChange={(event) => setTemplateForm({ ...templateForm, content: event.target.value })} /></label>
            <label className="notify-inline-check"><input type="checkbox" checked={templateForm.enabled} onChange={(event) => setTemplateForm({ ...templateForm, enabled: event.target.checked })} /><span>启用模板</span></label>
            <button className="primary-button" type="button" disabled={session.user?.role !== 'super_admin' || !templateForm.key.trim() || !templateForm.name.trim() || !templateForm.content.trim() || submitting} onClick={saveTemplate}><Save size={17} />保存模板</button>
          </section>
          <section className="ops-panel notify-jobs-panel">
            <header><div><span>模板库</span><h3>{templates.length} 个模板</h3></div><FileText size={20} /></header>
            <div className="notify-template-list">{templates.length ? templates.map((template) => <div key={template.key} className="notify-template-row"><button type="button" onClick={() => setTemplateForm({ ...template })}><strong>{template.name}</strong><small>{template.key} · {typeLabel(template.msgType)}</small></button><span>{template.enabled ? '启用' : '停用'}</span><button className="icon-button" type="button" title="删除模板" disabled={session.user?.role !== 'super_admin'} onClick={() => setPendingAction({ type: 'delete-template', template })}><X size={16} /></button></div>) : <div className="ops-empty">暂无模板</div>}</div>
          </section>
        </div>
      )}

      {tab === 'preferences' && (
        <section className="ops-panel notify-preference-panel">
          <header><div><span>用户策略</span><h3>接收偏好与免打扰</h3></div><UserRound size={20} /></header>
          <div className="notify-preference-form"><label><span>企业微信用户 ID</span><input value={preferenceForm.targetId} maxLength={64} onChange={(event) => setPreferenceForm({ ...preferenceForm, targetId: event.target.value })} /></label><button className="secondary-action" type="button" disabled={!canOperate || !preferenceForm.targetId.trim()} onClick={loadPreference}>读取</button><label className="notify-inline-check"><input type="checkbox" checked={preferenceForm.enabled} onChange={(event) => setPreferenceForm({ ...preferenceForm, enabled: event.target.checked })} /><span>允许接收</span></label><label><span>免打扰开始</span><input type="time" value={preferenceForm.quietStart} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietStart: event.target.value })} /></label><label><span>免打扰结束</span><input type="time" value={preferenceForm.quietEnd} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietEnd: event.target.value })} /></label><button className="primary-button" type="button" disabled={!canOperate || !preferenceForm.targetId.trim() || submitting} onClick={savePreference}><Save size={17} />保存偏好</button></div>
        </section>
      )}

      {tab === 'api' && <NotificationApiAccess session={session} onError={setError} onMessage={setMessage} />}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.type === 'retry' ? '重试失败通知' : pendingAction?.type === 'cancel-job' ? '取消计划任务' : pendingAction?.type === 'delete-template' ? '删除通知模板' : '发送测试通知'}
        description={pendingAction?.type === 'retry' ? '将使用原始加密载荷重新发送。' : pendingAction?.type === 'cancel-job' ? '取消后该任务不会再自动发送。' : pendingAction?.type === 'delete-template' ? '删除后不能再用此模板创建任务。' : '确认向指定企业微信用户发送此消息。'}
        detail={pendingAction?.type === 'retry' ? targetLabel(pendingAction.delivery) : pendingAction?.type === 'cancel-job' ? pendingAction.job?.id : pendingAction?.type === 'delete-template' ? pendingAction.template?.name : `${form.touser.trim()} · ${typeLabel(form.msgType)}`}
        confirmLabel={pendingAction?.type === 'retry' ? '确认重试' : pendingAction?.type === 'cancel-job' ? '确认取消' : pendingAction?.type === 'delete-template' ? '确认删除' : '确认发送'}
        tone="primary"
        busy={submitting}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </section>
  );
}
