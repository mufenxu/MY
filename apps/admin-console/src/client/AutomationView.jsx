import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Cpu,
  Database,
  LoaderCircle,
  Play,
  RefreshCw,
  Timer,
  Workflow,
} from 'lucide-react';
import { requestJson } from './api.js';
import { isPlainInternalNavigation } from './navigation.js';
import { EmptyState, StatusTag } from './Pearl.jsx';

const CT8_API_BASE = '/apps/core/api/ct8';
const AUTOMATION_ENDPOINTS = Object.freeze({
  resources: '/apps/core/api/resources/reminder-status',
  campus: '/api/campus/academic/integrations',
  iot: '/apps/iot/api/automations/status',
  scheduledNotifications: '/api/notifications/jobs?status=scheduled&page=1&pageSize=1',
  retryingNotifications: '/api/notifications/jobs?status=retrying&page=1&pageSize=1',
});
const STATE_META = {
  healthy: { label: '运行正常', className: 'healthy' },
  degraded: { label: '响应异常', className: 'degraded' },
  offline: { label: '暂不可用', className: 'offline' },
  unmonitored: { label: '未接入监测', className: 'unmonitored' },
  idle: { label: '未启用', className: 'unmonitored' },
};
const CAPABILITY_TONE = { blue: 'info', cyan: 'info', purple: 'violet', green: 'ok' };

function formatCheckedAt(value) {
  if (!value) return '尚未检查';
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return '暂无';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

function formatCount(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '--';
}

function getRunTime(run) {
  return run?.start_time || run?.started_at || run?.create_time || run?.createdAt || null;
}

function formatRunId(value) {
  if (!value) return '--';
  const normalized = String(value);
  return normalized.length > 10 ? `#${normalized.slice(-10)}` : `#${normalized}`;
}

function getRunStatus(status, conclusion) {
  const normalized = String(status || conclusion || 'unknown').toLowerCase();
  if (['running', 'queued', 'in_progress'].includes(normalized)) return { label: '运行中', className: 'running' };
  if (['success', 'completed'].includes(normalized)) return { label: '成功', className: 'success' };
  if (normalized === 'partial') return { label: '部分成功', className: 'partial' };
  if (['failed', 'failure', 'cancelled', 'timed_out'].includes(normalized)) return { label: '失败', className: 'failed' };
  if (normalized === 'idle') return { label: '空闲', className: 'idle' };
  return { label: '暂无', className: 'unknown' };
}

const RUN_TONE = {
  running: 'info',
  success: 'ok',
  partial: 'warn',
  failed: 'danger',
  idle: 'neutral',
  unknown: 'neutral',
};

function RunTag({ status, conclusion }) {
  const meta = getRunStatus(status, conclusion);
  return <span className={`tag tone-${RUN_TONE[meta.className] || 'neutral'}`}>{meta.label}</span>;
}

function settledValue(result, key) {
  if (result?.status !== 'fulfilled') return null;
  const value = result.value;
  return key ? value?.[key] || null : value?.data || value;
}

function AutomationCapability({ item }) {
  const Icon = item.icon;
  return (
    <a className="data-row col-capability" href={item.href}>
      <span className={`stat-icon tone-${CAPABILITY_TONE[item.tone] || 'info'}`} aria-hidden="true"><Icon size={15} /></span>
      <span className="cell-stack"><strong>{item.name}</strong><small>{item.detail}</small></span>
      <StatusTag state={item.state} />
      <ArrowUpRight className="capability-open" size={15} aria-hidden="true" />
    </a>
  );
}

export default function AutomationView({ services, loading, refreshing, onRefresh, onLaunch, session }) {
  const automation = services.find((service) => service.category === 'automation');
  const automationId = automation?.id || '';
  const canOperate = ['operator', 'super_admin'].includes(session?.user?.role);
  const [ct8Data, setCt8Data] = useState({ stats: null, status: null, runs: [] });
  const [ct8Loading, setCt8Loading] = useState(true);
  const [ct8Refreshing, setCt8Refreshing] = useState(false);
  const [ct8Error, setCt8Error] = useState('');
  const [ct8Message, setCt8Message] = useState('');
  const [triggering, setTriggering] = useState(false);
  const [capabilities, setCapabilities] = useState({ loading: true, items: [] });

  const loadCapabilities = useCallback(async () => {
    setCapabilities((current) => ({ ...current, loading: true }));
    const [resources, campus, iot, scheduled, retrying] = await Promise.allSettled([
      requestJson(AUTOMATION_ENDPOINTS.resources),
      requestJson(AUTOMATION_ENDPOINTS.campus),
      requestJson(AUTOMATION_ENDPOINTS.iot),
      requestJson(AUTOMATION_ENDPOINTS.scheduledNotifications),
      requestJson(AUTOMATION_ENDPOINTS.retryingNotifications),
    ]);
    const resourceStatus = settledValue(resources, 'result');
    const campusStatus = settledValue(campus);
    const iotStatus = settledValue(iot);
    const scheduledCount = settledValue(scheduled)?.total;
    const retryingCount = settledValue(retrying)?.total;
    const notificationAvailable = scheduled.status === 'fulfilled' && retrying.status === 'fulfilled';
    const enabledChannels = resourceStatus
      ? Object.values(resourceStatus.channels || {}).filter(Boolean).length
      : 0;
    const campusEnabled = Boolean(campusStatus?.calendar?.enabled || campusStatus?.reminder?.enabled);
    const pendingNotifications = Number(scheduledCount || 0) + Number(retryingCount || 0);
    setCapabilities({
      loading: false,
      items: [
        {
          id: 'resources', name: '资源到期提醒', icon: Database, tone: 'blue', href: '/apps/core/settings',
          state: resources.status !== 'fulfilled' ? 'offline' : resourceStatus?.enabled ? 'healthy' : 'idle',
          detail: resourceStatus
            ? `${resourceStatus.dueCount || 0} 项进入提醒期 · ${enabledChannels} 个通知渠道`
            : '状态读取失败',
        },
        {
          id: 'campus', name: '校园日历与课前提醒', icon: CalendarClock, tone: 'cyan', href: '/apps/campus/#study',
          state: campus.status !== 'fulfilled' ? 'offline' : campusEnabled ? 'healthy' : 'idle',
          detail: campusStatus
            ? `${campusStatus.calendar?.enabled ? '日历已订阅' : '日历未订阅'} · ${campusStatus.reminder?.enabled ? `提前 ${campusStatus.reminder.leadMinutes || 15} 分钟` : '课前提醒未启用'}`
            : '状态读取失败',
        },
        {
          id: 'iot', name: 'IoT 场景与规则', icon: Cpu, tone: 'purple', href: '/apps/iot/?page=automation',
          state: iot.status !== 'fulfilled' ? 'offline' : iotStatus?.started ? (iotStatus.lastError ? 'degraded' : 'healthy') : 'idle',
          detail: iotStatus
            ? `${iotStatus.cachedRuleCount || 0} 条已加载规则${iotStatus.evaluationInFlight ? ' · 正在计算' : ''}`
            : '状态读取失败',
        },
        {
          id: 'notification', name: '通知调度', icon: BellRing, tone: 'green', href: '/?view=notification',
          state: notificationAvailable ? (Number(retryingCount || 0) > 0 ? 'degraded' : 'healthy') : 'offline',
          detail: notificationAvailable ? `${pendingNotifications} 个待处理任务 · ${retryingCount || 0} 个重试中` : '状态读取失败',
        },
      ],
    });
  }, []);

  const loadCt8 = useCallback(async ({ quiet = false } = {}) => {
    quiet ? setCt8Refreshing(true) : setCt8Loading(true);
    setCt8Error('');
    try {
      const [stats, status] = await Promise.all([
        requestJson(`${CT8_API_BASE}/stats`),
        requestJson(`${CT8_API_BASE}/status?limit=6`),
      ]);
      if (!stats?.stats || !status?.data) throw new Error('CT8 接口未返回完整数据');
      setCt8Data({
        stats: stats.stats,
        status: status.data,
        runs: Array.isArray(status.data.runs) ? status.data.runs.slice(0, 6) : [],
      });
    } catch (error) {
      setCt8Error(error.message || 'CT8 数据加载失败');
    } finally {
      setCt8Loading(false);
      setCt8Refreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && automationId) {
      loadCt8();
      loadCapabilities();
    }
  }, [automationId, loadCapabilities, loadCt8, loading]);

  const activeTask = ct8Data.status?.activeTask || null;
  const latestRun = ct8Data.status?.latest || ct8Data.runs[0] || null;
  const latestStatus = getRunStatus(latestRun?.status, latestRun?.workflow_conclusion);
  const activeStatus = getRunStatus(activeTask?.status || 'idle', activeTask?.workflow_conclusion);
  const taskRunning = activeStatus.className === 'running' || latestStatus.className === 'running';
  const ct8Ready = Boolean(ct8Data.stats || ct8Data.status || ct8Data.runs.length);
  const serviceState = ct8Ready ? 'healthy' : automation?.state;

  useEffect(() => {
    if (!taskRunning) return undefined;
    const interval = window.setInterval(() => loadCt8({ quiet: true }), 15000);
    return () => window.clearInterval(interval);
  }, [loadCt8, taskRunning]);

  function handleOpen(event) {
    if (!automation?.adminUrl || !isPlainInternalNavigation(event, automation.adminUrl)) return;
    event.preventDefault();
    onLaunch(automation);
  }

  async function handleRefresh() {
    setCt8Message('');
    await Promise.all([onRefresh?.(), loadCt8({ quiet: true }), loadCapabilities()]);
  }

  async function handleTrigger() {
    setTriggering(true);
    setCt8Message('');
    setCt8Error('');
    try {
      await requestJson(`${CT8_API_BASE}/trigger`, {
        method: 'POST',
        body: JSON.stringify({ inputs: {} }),
      });
      setCt8Message('任务已提交到 GitHub Actions，正在等待运行结果回调。');
      await loadCt8({ quiet: true });
    } catch (error) {
      setCt8Error(error.message || '触发 CT8 任务失败');
    } finally {
      setTriggering(false);
    }
  }

  const stats = ct8Data.stats || {};
  const totalHosts = stats.totalHosts ?? latestRun?.total_accounts ?? latestRun?.stats?.total;
  const successHosts = stats.successHosts ?? latestRun?.success_count ?? latestRun?.stats?.success;
  const failedHosts = stats.failedHosts ?? latestRun?.failed_count ?? latestRun?.stats?.failed;
  const latestRunTime = stats.lastRunTime || getRunTime(latestRun);
  const latestWorkflow = latestRun?.workflow || activeTask?.workflow || 'ssh-login.yml';
  const triggerDisabled = !canOperate || triggering || taskRunning || ct8Loading;
  const automationRefreshing = refreshing || ct8Refreshing || capabilities.loading;

  return (
    <section className="page-view" aria-label="自动化中心">
      <div className="view-stack">
        <div className="toolbar">
          <span className="toolbar-label">
            <Workflow size={14} aria-hidden="true" />
            自动化服务
          </span>
          {automation && <StatusTag state={serviceState} />}
          <span className="toolbar-hint">
            {automation ? `${automation.name} · 检查于 ${formatCheckedAt(automation.checkedAt)}` : '尚未注册自动化服务'}
          </span>
          <div className="toolbar-end">
            {automation?.adminUrl && (
              <a
                className="btn btn-ghost btn-sm"
                href={automation.adminUrl}
                target={automation.adminUrl.startsWith('/') ? undefined : '_blank'}
                rel={automation.adminUrl.startsWith('/') ? undefined : 'noreferrer'}
                onClick={handleOpen}
              >
                进入后台
                <ArrowUpRight size={14} />
              </a>
            )}
            <button className="btn btn-secondary btn-sm" type="button" onClick={handleRefresh} disabled={automationRefreshing}>
              {automationRefreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
              {automationRefreshing ? '正在同步' : '刷新状态'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={handleTrigger}
              disabled={triggerDisabled}
              title={!canOperate ? '需要操作员权限' : undefined}
            >
              {triggering || taskRunning ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}
              {taskRunning ? '任务运行中' : '触发任务'}
            </button>
          </div>
        </div>

        {(ct8Error || ct8Message) && (
          <div className={`alert ${ct8Error ? 'is-error' : 'is-ok'}`} role={ct8Error ? 'alert' : 'status'}>
            {ct8Error ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
            <span>{ct8Error || ct8Message}</span>
          </div>
        )}

        {loading ? (
          <div className="loading-inline"><LoaderCircle className="spin" size={17} /> 正在加载自动化服务</div>
        ) : !automation ? (
          <EmptyState title="暂无自动化服务" detail="在服务注册表里登记自动化服务后会出现在这里" />
        ) : (
          <>
            <div className="stat-strip">
              <article className="stat-card">
                <span className="stat-icon tone-info"><Timer size={17} /></span>
                <div>
                  <span className="stat-label">今日运行</span>
                  <strong className="stat-figure">{formatCount(stats.todayRuns)}</strong>
                  <small className="stat-foot">GitHub Actions 调度</small>
                </div>
              </article>
              <article className="stat-card">
                <span className={`stat-icon tone-${RUN_TONE[latestStatus.className] === 'ok' ? 'ok' : latestStatus.className === 'failed' ? 'warn' : 'violet'}`}><Activity size={17} /></span>
                <div>
                  <span className="stat-label">最近结果</span>
                  <strong className="stat-figure">{latestStatus.label}</strong>
                  <small className="stat-foot">{latestWorkflow}</small>
                </div>
              </article>
              <article className="stat-card">
                <span className="stat-icon tone-ok"><CheckCircle2 size={17} /></span>
                <div>
                  <span className="stat-label">成功节点</span>
                  <strong className="stat-figure">{formatCount(successHosts)}</strong>
                  <small className="stat-foot">共 {formatCount(totalHosts)} 个节点</small>
                </div>
              </article>
              <article className="stat-card">
                <span className="stat-icon tone-warn"><CircleAlert size={17} /></span>
                <div>
                  <span className="stat-label">失败节点</span>
                  <strong className="stat-figure">{formatCount(failedHosts)}</strong>
                  <small className="stat-foot">最近一次结果</small>
                </div>
              </article>
            </div>

            <div className="split">
              <div className="split-main">
                <section className="panel panel-flush" aria-label="运行历史">
                  <div className="panel-head">
                    <div className="panel-title"><Timer size={15} aria-hidden="true" />运行历史</div>
                    <span className="panel-meta">
                      {ct8Data.runs.length ? `最近 ${ct8Data.runs.length} 次 · ${latestWorkflow}` : '暂无记录'}
                    </span>
                  </div>
                  <div className="data-list">
                    <div className="data-head col-run" aria-hidden="true">
                      <span>工作流</span><span>状态</span><span className="cell-num">成功</span><span className="cell-num">失败</span><span>时间</span>
                    </div>
                    {ct8Loading ? (
                      <div className="loading-inline"><LoaderCircle className="spin" size={16} /> 正在加载运行记录</div>
                    ) : ct8Data.runs.length === 0 ? (
                      <div className="data-list-empty"><span>暂无运行记录</span></div>
                    ) : ct8Data.runs.map((run) => (
                      <div className="data-row col-run" key={run.run_id || run.id || getRunTime(run)}>
                        <span className="cell-stack">
                          <strong>{run.workflow || 'ssh-login.yml'}</strong>
                          <small>{formatRunId(run.run_id || run.id)}</small>
                        </span>
                        <RunTag status={run.status} conclusion={run.workflow_conclusion} />
                        <span className="cell-num">{formatCount(run.success_count ?? run.stats?.success)}</span>
                        <span className="cell-num">{formatCount(run.failed_count ?? run.stats?.failed)}</span>
                        <span className="panel-meta">{formatDateTime(getRunTime(run))}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel panel-flush" aria-label="跨服务自动化">
                  <div className="panel-head">
                    <div className="panel-title"><Workflow size={15} aria-hidden="true" />跨服务自动化</div>
                    <span className="panel-meta">统一视图 · {capabilities.items.length} 项能力</span>
                  </div>
                  <div className="data-list">
                    {capabilities.loading && capabilities.items.length === 0 ? (
                      <div className="loading-inline"><LoaderCircle className="spin" size={16} /> 正在汇总自动化状态</div>
                    ) : capabilities.items.length === 0 ? (
                      <div className="data-list-empty"><span>暂无自动化能力</span></div>
                    ) : capabilities.items.map((item) => <AutomationCapability key={item.id} item={item} />)}
                  </div>
                </section>
              </div>

              <aside className="split-side">
                <section className="panel" aria-label="当前任务">
                  <div className="panel-head">
                    <div className="panel-title">{taskRunning ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}当前任务</div>
                    <span className="panel-meta">{activeStatus.label}</span>
                  </div>
                  <div className="panel-body">
                    <div className="kv-grid">
                      <div className="kv"><div className="kv-label">任务状态</div><div className="kv-value">{activeStatus.label}</div></div>
                      <div className="kv"><div className="kv-label">最近 Run</div><div className="kv-value cell-mono">{formatRunId(latestRun?.run_id || activeTask?.run_id)}</div></div>
                      <div className="kv"><div className="kv-label">Workflow</div><div className="kv-value cell-mono">{latestWorkflow}</div></div>
                      <div className="kv"><div className="kv-label">最近运行</div><div className="kv-value">{formatDateTime(latestRunTime)}</div></div>
                    </div>
                    {activeTask?.html_url && (
                      <a className="panel-link" href={activeTask.html_url} target="_blank" rel="noreferrer">
                        打开 GitHub 运行记录 <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                </section>

                <section className="panel" aria-label="接入链路">
                  <div className="panel-head">
                    <div className="panel-title"><Clock3 size={15} aria-hidden="true" />接入链路</div>
                  </div>
                  <div className="panel-body">
                    <div className="timeline">
                      <div className="timeline-row"><span><strong>服务注册</strong><small>已接入统一服务控制台</small></span></div>
                      <div className="timeline-row"><span><strong>Core API</strong><small>通过平台内部身份访问 CT8 接口</small></span></div>
                      <div className="timeline-row"><span><strong>运行观测</strong><small>{ct8Ready ? '统计与历史已接入' : '等待读取运行数据'}</small></span></div>
                      <div className="timeline-row"><span><strong>健康探针</strong><small>{automation.state === 'unmonitored' ? 'GitHub Actions 无独立健康端点' : STATE_META[automation.state]?.label || '已接入'}</small></span></div>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
