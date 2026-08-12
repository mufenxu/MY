import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  Inbox,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ServerCog,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
import NotificationApiAccess from './NotificationApiAccess.jsx';
import { ConfirmDialog, SegmentedTabs, SelectControl } from './UiControls.jsx';

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
const TEST_CHANNEL_OPTIONS = [
  { value: 'wecom', label: '企业微信' },
  { value: 'app', label: 'Android App' },
];
const APP_PRIORITY_OPTIONS = [
  { value: 'normal', label: '普通' },
  { value: 'high', label: '重要' },
  { value: 'critical', label: '紧急' },
  { value: 'low', label: '低优先级' },
];
const EMPTY_APP_OVERVIEW = {
  userId: '',
  total: 0,
  unread: 0,
  devices: { total: 0, pollOnly: 0, pushReady: 0, lastSeenAt: null },
  registeredUsers: [],
  items: [],
};

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

function priorityLabel(value) {
  return { low: '低优先级', normal: '普通', high: '重要', critical: '紧急' }[value] || value || '--';
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

function AppReadState({ readAt }) {
  const value = readAt ? 'success' : 'pending';
  const meta = readAt
    ? { label: '已读', icon: CheckCircle2 }
    : { label: '未读', icon: CircleAlert };
  const Icon = meta.icon;
  return <span className={`notify-state notify-state-${value}`}><Icon size={14} />{meta.label}</span>;
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
  const [form, setForm] = useState({
    channel: 'wecom',
    msgType: 'text',
    touser: '',
    appUserId: '',
    appTitle: 'Android App 通知测试',
    appPriority: 'high',
    content: '',
  });
  const [appFilter, setAppFilter] = useState('');
  const [appOverviewUser, setAppOverviewUser] = useState('');
  const [appOverview, setAppOverview] = useState(EMPTY_APP_OVERVIEW);
  const [templates, setTemplates] = useState([]);
  const [jobs, setJobs] = useState({ items: [], page: 1, pageSize: 20, total: 0 });
  const [templateForm, setTemplateForm] = useState({ key: '', name: '', description: '', msgType: 'text', content: '', enabled: true });
  const [jobForm, setJobForm] = useState({ templateKey: '', touser: '', scheduledAt: '', dedupeKey: '', variables: '{}' });
  const [preferenceForm, setPreferenceForm] = useState({ targetId: '', enabled: true, quietStart: '22:00', quietEnd: '07:00' });
  const [pendingAction, setPendingAction] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const canOperate = roleAtLeast(session.user?.role, 'operator');

  const load = useCallback(async ({ quiet = false, appUser = appOverviewUser } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '20' });
      const appQuery = new URLSearchParams({ limit: '12' });
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      if (appUser) appQuery.set('userId', appUser);
      const [overviewResult, deliveryResult, templateResult, jobResult, appResult] = await Promise.all([
        requestJson('/api/notifications/overview'),
        requestJson(`/api/notifications/deliveries?${query}`),
        requestJson('/api/notifications/templates'),
        requestJson('/api/notifications/jobs?page=1&pageSize=20'),
        requestJson(`/api/notifications/app/overview?${appQuery}`),
      ]);
      setOverview(overviewResult);
      setDeliveries(deliveryResult);
      setTemplates(templateResult.items || []);
      setJobs(jobResult);
      setAppOverview(appResult || EMPTY_APP_OVERVIEW);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [appOverviewUser, filters, page]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(deliveries.total / deliveries.pageSize));
  const history = overview?.history || {};
  const recent = deliveries.items.slice(0, 5);
  const isAppTest = form.channel === 'app';
  const contentLimit = isAppTest ? 500 : form.msgType === 'markdown' ? 4096 : 2048;
  const canSubmitTest = isAppTest
    ? Boolean(canOperate && appOverview.registeredUsers?.some((user) => user.userId === form.appUserId.trim()) && form.appTitle.trim() && form.content.trim())
    : Boolean(canOperate && form.touser.trim() && form.touser.trim() !== '@all' && !form.touser.includes('|') && form.content.trim());
  const preview = useMemo(() => form.content.trim() || '消息预览', [form.content]);
  const appDevices = appOverview?.devices || EMPTY_APP_OVERVIEW.devices;
  const appItems = appOverview?.items || [];
  const registeredAppUsers = appOverview.registeredUsers || [];
  const appUserOptions = useMemo(() => [
    { value: '', label: registeredAppUsers.length ? '选择已注册用户' : '暂无已注册用户', disabled: true },
    ...registeredAppUsers.map((user) => ({
      value: user.userId,
      label: `${user.userId} · ${user.pushReady > 0 ? '原生推送' : '收件箱轮询'}`,
    })),
  ], [registeredAppUsers]);
  const appFilterOptions = useMemo(() => [
    { value: '', label: '全部平台用户' },
    ...appUserOptions.slice(1),
  ], [appUserOptions]);
  const defaultAppUserId = appOverviewUser || registeredAppUsers[0]?.userId || '';
  const appScopeLabel = appOverviewUser ? `用户 ${appOverviewUser}` : '全部平台用户';

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function applyAppFilter() {
    const normalized = appFilter.trim();
    if (normalized === appOverviewUser) {
      load({ quiet: true, appUser: normalized });
      return;
    }
    setAppOverviewUser(normalized);
  }

  async function confirmAction() {
    const action = pendingAction;
    if (!action) return;
    const actionIsAppTest = action.type === 'test' && form.channel === 'app';
    setSubmitting(true);
    setError('');
    setMessage('');
    let nextAppUser = null;
    try {
      if (action.type === 'test') {
        if (actionIsAppTest) {
          const userId = form.appUserId.trim();
          nextAppUser = userId;
          await requestJson('/api/notifications/app/test', {
            method: 'POST',
            body: JSON.stringify({
              userId,
              title: form.appTitle.trim(),
              summary: form.content.trim(),
              priority: form.appPriority,
            }),
          });
          const appQuery = new URLSearchParams({ userId, limit: '12' });
          setAppFilter(userId);
          setAppOverviewUser(userId);
          setAppOverview(await requestJson(`/api/notifications/app/overview?${appQuery}`));
          setMessage('Android App 测试通知已写入收件箱');
        } else {
          await requestJson('/api/notifications/test', {
            method: 'POST',
            body: JSON.stringify({ msgType: form.msgType, touser: form.touser.trim(), content: form.content.trim() }),
          });
          setMessage('企业微信测试通知已发送');
        }
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
      if (action.type === 'test') setTab(actionIsAppTest ? 'app' : 'records');
      if (action.type === 'retry') setTab('records');
      if (action.type === 'cancel-job') setTab('jobs');
      if (action.type === 'delete-template') setTab('templates');
      await load({ quiet: true, ...(nextAppUser === null ? {} : { appUser: nextAppUser }) });
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

  const primaryTab = ['records', 'test'].includes(tab)
    ? 'records'
    : ['jobs', 'templates'].includes(tab) ? 'jobs' : tab;
  const panelLabelledBy = ['records', 'test'].includes(tab)
    ? `notify-primary-tab-records notify-send-tab-${tab}`
    : ['jobs', 'templates'].includes(tab)
      ? `notify-primary-tab-jobs notify-orchestration-tab-${tab}`
      : `notify-primary-tab-${primaryTab}`;
  const confirmTitle = pendingAction?.type === 'retry' ? '重试失败通知'
    : pendingAction?.type === 'cancel-job' ? '取消计划任务'
      : pendingAction?.type === 'delete-template' ? '删除通知模板'
        : '发送测试通知';
  const confirmDescription = pendingAction?.type === 'retry' ? '将使用原始加密载荷重新发送。'
    : pendingAction?.type === 'cancel-job' ? '取消后该任务不会再自动发送。'
      : pendingAction?.type === 'delete-template' ? '删除后不能再用此模板创建任务。'
        : form.channel === 'app' ? '确认向指定 Android App 平台用户写入测试通知。' : '确认向指定企业微信用户发送此消息。';
  const confirmDetail = pendingAction?.type === 'retry' ? targetLabel(pendingAction.delivery)
    : pendingAction?.type === 'cancel-job' ? pendingAction.job?.id
      : pendingAction?.type === 'delete-template' ? pendingAction.template?.name
        : form.channel === 'app'
          ? `${form.appUserId.trim()} · ${priorityLabel(form.appPriority)}`
          : `${form.touser.trim()} · ${typeLabel(form.msgType)}`;

  return (
    <section className="page-view notify-page" aria-label="统一通知服务控制中心">
      <div className="notify-toolbar">
        <SegmentedTabs
          ariaLabel="通知服务视图"
          idPrefix="notify-primary-tab"
          panelId="notify-view-panel"
          items={[
            { id: 'overview', label: '概览' },
            { id: 'records', label: '发送' },
            { id: 'app', label: 'App 通知' },
            { id: 'jobs', label: '编排' },
            { id: 'preferences', label: '接收偏好' },
            { id: 'api', label: 'API 接入' },
          ]}
          value={primaryTab}
          onChange={setTab}
        />
        {tab !== 'api' && <button className="icon-button notify-refresh" type="button" title="刷新通知数据" aria-label="刷新通知数据" disabled={refreshing} onClick={() => load({ quiet: true })}><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>}
      </div>
      {['records', 'test'].includes(tab) && <SegmentedTabs className="notify-context-tabs" ariaLabel="发送视图" idPrefix="notify-send-tab" panelId="notify-view-panel" items={[{ id: 'records', label: '发送记录' }, { id: 'test', label: '发送测试' }]} value={tab} onChange={setTab} />}
      {['jobs', 'templates'].includes(tab) && <SegmentedTabs className="notify-context-tabs" ariaLabel="编排视图" idPrefix="notify-orchestration-tab" panelId="notify-view-panel" items={[{ id: 'jobs', label: '计划任务' }, { id: 'templates', label: '消息模板' }]} value={tab} onChange={setTab} />}
      <Feedback error={error} message={message} />

      <div className="notify-view-panel" id="notify-view-panel" role="tabpanel" aria-labelledby={panelLabelledBy}>

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
                <ConfigurationState ready={true} label="Android App 收件箱" detail={`${appOverview.total || 0} 条通知 · ${appOverview.unread || 0} 条未读`} />
                <ConfigurationState ready={appDevices.total > 0} label="App 设备注册" detail={`${appDevices.total || 0} 台设备 · ${appDevices.pushReady || 0} 台可推送 · ${appDevices.pollOnly || 0} 台轮询`} />
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
          <div className="notify-channel-grid">
            <button className="notify-channel-card" type="button" onClick={() => setTab('records')}>
              <span><Send size={18} /></span>
              <div><strong>企业微信通知</strong><small>{overview?.wecom?.agentId ? `AgentId ${overview.wecom.agentId}` : '应用凭据未配置'} · 查看发送台账</small></div>
            </button>
            <button className="notify-channel-card" type="button" onClick={() => setTab('app')}>
              <span><Smartphone size={18} /></span>
              <div><strong>Android App 通知</strong><small>{appDevices.total || 0} 台设备 · {appOverview.unread || 0} 条未读 · 打开收件箱</small></div>
            </button>
            <button className="notify-channel-card" type="button" onClick={() => setTab('preferences')}>
              <span><UserRound size={18} /></span>
              <div><strong>接收偏好</strong><small>平台用户免打扰与接收开关统一维护</small></div>
            </button>
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

      {tab === 'app' && (
        <div className="notify-app-layout">
          <section className="ops-panel notify-app-panel">
            <header className="notify-records-header">
              <div><span>Android App</span><h3>{appScopeLabel}收件箱</h3></div>
              <div className="notify-app-filter">
                <SelectControl ariaLabel="App 通知查看用户" value={appFilter} options={appFilterOptions} onChange={setAppFilter} />
                <button className="secondary-action compact" type="button" disabled={refreshing} onClick={applyAppFilter}>读取</button>
              </div>
            </header>
            <div className="ops-kpis notify-app-kpis">
              <article><Inbox size={21} /><div><span>收件箱通知</span><strong>{appOverview.total || 0}</strong><small>{appScopeLabel}</small></div></article>
              <article><BellRing size={21} /><div><span>未读通知</span><strong>{appOverview.unread || 0}</strong><small>App 内提醒</small></div></article>
              <article><Smartphone size={21} /><div><span>注册设备</span><strong>{appDevices.total || 0}</strong><small>{appDevices.pushReady || 0} 台可推送</small></div></article>
              <article><Clock3 size={21} /><div><span>最近在线</span><strong>{formatDateTime(appDevices.lastSeenAt).split(' ')[0]}</strong><small>{formatDateTime(appDevices.lastSeenAt)}</small></div></article>
            </div>
            <div className="notify-app-list">
              {appItems.length ? appItems.map((item) => (
                <article className="notify-app-row" key={`${item.recipientId || 'app'}-${item.id}`}>
                  <AppReadState readAt={item.readAt} />
                  <div className="notify-app-row-main">
                    <strong>{item.title || item.category || item.id}</strong>
                    <small>{item.summary || item.category || '无摘要'}</small>
                  </div>
                  <div className="notify-app-meta">
                    <span>{item.recipientId || appOverview.userId || '--'}</span>
                    <span>{priorityLabel(item.priority)} · {item.category || '--'} · {formatDateTime(item.createdAt)}</span>
                  </div>
                </article>
              )) : <div className="ops-empty">当前范围没有 App 通知</div>}
            </div>
          </section>
          <section className="ops-panel notify-app-side">
            <header><div><span>设备能力</span><h3>App 通道状态</h3></div><Smartphone size={20} /></header>
            <div className="notify-config-list">
              <ConfigurationState ready={appDevices.total > 0} label="设备注册" detail={`${appDevices.total || 0} 台有效设备`} />
              <ConfigurationState ready={appDevices.pushReady > 0} label="原生推送" detail={`${appDevices.pushReady || 0} 台设备具备推送令牌`} />
              <ConfigurationState ready={appDevices.pollOnly > 0} label="轮询兜底" detail={`${appDevices.pollOnly || 0} 台设备使用 App 内收件箱轮询`} />
            </div>
            <button className="primary-button notify-send-button" type="button" disabled={!defaultAppUserId} onClick={() => { setForm((current) => ({ ...current, channel: 'app', appUserId: defaultAppUserId })); setTab('test'); }}><Send size={17} />发送 App 测试</button>
          </section>
        </div>
      )}

      {tab === 'test' && (
        <div className="notify-test-layout">
          <section className="ops-panel notify-test-form">
            <header><div><span>单用户验证</span><h3>发送测试通知</h3></div><ShieldCheck size={20} /></header>
            <label><span>通知渠道</span><SelectControl ariaLabel="测试通知渠道" value={form.channel} onChange={(value) => setForm({ ...form, channel: value, content: form.content.slice(0, value === 'app' ? 500 : form.msgType === 'markdown' ? 4096 : 2048) })} options={TEST_CHANNEL_OPTIONS} /></label>
            {!isAppTest && <label><span>消息类型</span><SelectControl ariaLabel="测试消息类型" value={form.msgType} onChange={(value) => setForm({ ...form, msgType: value, content: form.content.slice(0, value === 'markdown' ? 4096 : 2048) })} options={TYPE_OPTIONS.filter((option) => ['text', 'markdown'].includes(option.value))} /></label>}
            {isAppTest
              ? (
                <>
                  <label><span>接收用户</span><SelectControl ariaLabel="App 通知接收用户" value={form.appUserId} options={appUserOptions} onChange={(value) => setForm({ ...form, appUserId: value })} /></label>
                  <label><span>通知标题</span><input value={form.appTitle} maxLength={120} onChange={(event) => setForm({ ...form, appTitle: event.target.value })} /></label>
                  <label><span>优先级</span><SelectControl ariaLabel="App 通知优先级" value={form.appPriority} onChange={(value) => setForm({ ...form, appPriority: value })} options={APP_PRIORITY_OPTIONS} /></label>
                </>
              )
              : <label><span>企业微信用户 ID</span><div className="notify-input-wrap"><UserRound size={17} /><input value={form.touser} maxLength={64} autoComplete="off" placeholder="例如 zhangsan" onChange={(event) => setForm({ ...form, touser: event.target.value })} /></div></label>}
            <label><span>消息内容</span><textarea value={form.content} maxLength={contentLimit} rows={9} placeholder="输入测试消息" onChange={(event) => setForm({ ...form, content: event.target.value })} /><small>{form.content.length} / {contentLimit}</small></label>
            <button className="primary-button notify-send-button" type="button" disabled={!canSubmitTest} onClick={() => setPendingAction({ type: 'test' })}><Send size={17} />发送测试</button>
          </section>
          <section className="ops-panel notify-preview-panel">
            <header><div><span>{isAppTest ? 'Android App' : '企业微信'}</span><h3>消息预览</h3></div>{isAppTest ? <Smartphone size={20} /> : <Send size={20} />}</header>
            <div className="notify-message-preview">
              <span>{isAppTest ? `${priorityLabel(form.appPriority)} · App 收件箱卡片` : form.msgType === 'markdown' ? 'Markdown（仅企业微信）' : '文本消息（兼容微信）'}</span>
              {isAppTest && <strong>{form.appTitle.trim() || 'Android App 通知测试'}</strong>}
              <pre>{preview}</pre>
              <small>发送给 {isAppTest ? form.appUserId.trim() || '未选择平台用户' : form.touser.trim() || '未选择用户'}</small>
            </div>
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
          <div className="notify-preference-form"><label><span>平台用户 ID</span><input value={preferenceForm.targetId} maxLength={64} onChange={(event) => setPreferenceForm({ ...preferenceForm, targetId: event.target.value })} /></label><button className="secondary-action" type="button" disabled={!canOperate || !preferenceForm.targetId.trim()} onClick={loadPreference}>读取</button><label className="notify-inline-check"><input type="checkbox" checked={preferenceForm.enabled} onChange={(event) => setPreferenceForm({ ...preferenceForm, enabled: event.target.checked })} /><span>允许接收</span></label><label><span>免打扰开始</span><input type="time" value={preferenceForm.quietStart} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietStart: event.target.value })} /></label><label><span>免打扰结束</span><input type="time" value={preferenceForm.quietEnd} onChange={(event) => setPreferenceForm({ ...preferenceForm, quietEnd: event.target.value })} /></label><button className="primary-button" type="button" disabled={!canOperate || !preferenceForm.targetId.trim() || submitting} onClick={savePreference}><Save size={17} />保存偏好</button></div>
        </section>
      )}

      {tab === 'api' && <NotificationApiAccess session={session} onError={setError} onMessage={setMessage} />}

      </div>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={confirmTitle}
        description={confirmDescription}
        detail={confirmDetail}
        confirmLabel={pendingAction?.type === 'retry' ? '确认重试' : pendingAction?.type === 'cancel-job' ? '确认取消' : pendingAction?.type === 'delete-template' ? '确认删除' : '确认发送'}
        tone="primary"
        busy={submitting}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </section>
  );
}
