import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BellRing,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Send,
  ServerCog,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { requestJson } from './api.js';
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
  { value: 'text', label: '文本' },
  { value: 'markdown', label: 'Markdown' },
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
  return { text: '文本', markdown: 'Markdown', textcard: '文本卡片', news: '图文' }[value] || value || '--';
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
      const [overviewResult, deliveryResult] = await Promise.all([
        requestJson('/api/notifications/overview'),
        requestJson(`/api/notifications/deliveries?${query}`),
      ]);
      setOverview(overviewResult);
      setDeliveries(deliveryResult);
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
      } else {
        await requestJson(`/api/notifications/deliveries/${encodeURIComponent(action.delivery.id)}/retry`, { method: 'POST' });
        setMessage('失败通知已重新发送');
      }
      setPendingAction(null);
      setTab('records');
      await load({ quiet: true });
    } catch (requestError) {
      setPendingAction(null);
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
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
            ['records', '发送记录'],
            ['test', '发送测试'],
          ].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        <button className="icon-button notify-refresh" type="button" title="刷新通知数据" aria-label="刷新通知数据" disabled={refreshing} onClick={() => load({ quiet: true })}><RefreshCw className={refreshing ? 'spin' : ''} size={18} /></button>
      </div>
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
            <div className="notify-message-preview"><span>{form.msgType === 'markdown' ? 'Markdown' : '文本消息'}</span><pre>{preview}</pre><small>发送给 {form.touser.trim() || '未选择用户'}</small></div>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.type === 'retry' ? '重试失败通知' : '发送测试通知'}
        description={pendingAction?.type === 'retry' ? '将使用原始加密载荷重新发送。' : '确认向指定企业微信用户发送此消息。'}
        detail={pendingAction?.type === 'retry' ? targetLabel(pendingAction.delivery) : `${form.touser.trim()} · ${typeLabel(form.msgType)}`}
        confirmLabel={pendingAction?.type === 'retry' ? '确认重试' : '确认发送'}
        tone="primary"
        busy={submitting}
        onCancel={() => !submitting && setPendingAction(null)}
        onConfirm={confirmAction}
      />
    </section>
  );
}
