import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  CircleOff,
  Clock3,
  Database,
  LoaderCircle,
  Play,
  RefreshCw,
  Timer,
  Workflow,
} from 'lucide-react';
import { requestJson } from './api.js';
import { isPlainInternalNavigation } from './navigation.js';

const CT8_API_BASE = '/apps/core/api/ct8';
const STATE_META = {
  healthy: { label: '运行正常', className: 'healthy', icon: CheckCircle2 },
  degraded: { label: '响应异常', className: 'degraded', icon: CircleAlert },
  offline: { label: '暂不可用', className: 'offline', icon: CircleOff },
  unmonitored: { label: '未接入监测', className: 'unmonitored', icon: Clock3 },
};

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

function ServiceStatus({ state }) {
  const meta = STATE_META[state] || STATE_META.unmonitored;
  const Icon = meta.icon;
  return <span className={`service-status ${meta.className}`}><Icon size={14} />{meta.label}</span>;
}

export default function AutomationView({ services, loading, refreshing, onRefresh, onLaunch, session }) {
  const automation = services.find((service) => service.category === 'automation');
  const meta = STATE_META[automation?.state] || STATE_META.unmonitored;
  const canOperate = ['operator', 'super_admin'].includes(session?.user?.role);
  const [ct8Data, setCt8Data] = useState({ stats: null, status: null, runs: [] });
  const [ct8Loading, setCt8Loading] = useState(true);
  const [ct8Refreshing, setCt8Refreshing] = useState(false);
  const [ct8Error, setCt8Error] = useState('');
  const [ct8Message, setCt8Message] = useState('');
  const [triggering, setTriggering] = useState(false);

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
    if (!loading && automation) loadCt8();
  }, [automation, loadCt8, loading]);

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
    await Promise.all([onRefresh?.(), loadCt8({ quiet: true })]);
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

  return (
    <section className="page-view automation-view" aria-label="自动化中心">
      <div className="page-actions automation-actions">
        <button className="secondary-action" type="button" onClick={handleRefresh} disabled={refreshing || ct8Refreshing}>
          {refreshing || ct8Refreshing ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          {refreshing || ct8Refreshing ? '正在同步' : '刷新状态'}
        </button>
        <button className="primary-button" type="button" onClick={handleTrigger} disabled={triggerDisabled} title={!canOperate ? '需要操作员权限' : undefined}>
          {triggering || taskRunning ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}
          {taskRunning ? '任务运行中' : '触发任务'}
        </button>
      </div>

      {loading ? (
        <div className="view-loading large"><LoaderCircle className="spin" size={22} /> 正在加载自动化服务</div>
      ) : automation ? (
        <>
          <article className={`automation-hero automation-state-${meta.className}`}>
            <div className="automation-hero-main">
              <div className="automation-hero-icon"><Workflow size={29} /></div>
              <div className="automation-hero-copy"><span>自动化服务</span><h3>{automation.name}</h3><p>{automation.description}</p></div>
            </div>
            <div className="automation-hero-tools">
              <ServiceStatus state={serviceState} />
              {automation.adminUrl && (
                <a href={automation.adminUrl} target={automation.adminUrl.startsWith('/') ? undefined : '_blank'} rel={automation.adminUrl.startsWith('/') ? undefined : 'noreferrer'} onClick={handleOpen}>
                  进入后台 <ArrowUpRight size={16} />
                </a>
              )}
            </div>
            <div className="automation-hero-metrics">
              <div className="automation-hero-metric"><span className="automation-metric-icon blue"><Timer size={17} /></span><div className="automation-metric-copy"><span>今日运行</span><strong>{formatCount(stats.todayRuns)}</strong></div></div>
              <div className="automation-hero-metric"><span className="automation-metric-icon purple"><Activity size={17} /></span><div className="automation-metric-copy"><span>最近结果</span><strong>{latestStatus.label}</strong></div></div>
              <div className="automation-hero-metric"><span className="automation-metric-icon cyan"><Clock3 size={17} /></span><div className="automation-metric-copy"><span>最近运行</span><strong>{formatDateTime(latestRunTime)}</strong></div></div>
            </div>
          </article>

          {(ct8Error || ct8Message) && (
            <div className={`automation-feedback ${ct8Error ? 'error' : 'success'}`} role={ct8Error ? 'alert' : 'status'}>
              {ct8Error ? <CircleAlert size={17} /> : <CheckCircle2 size={17} />}<span>{ct8Error || ct8Message}</span>
            </div>
          )}

          <div className="automation-kpis">
            <article><span className="kpi-icon blue"><Timer size={20} /></span><div><span>今日运行</span><strong>{formatCount(stats.todayRuns)}</strong><small>GitHub Actions 调度</small></div></article>
            <article><span className="kpi-icon green"><CheckCircle2 size={20} /></span><div><span>成功节点</span><strong>{formatCount(successHosts)}</strong><small>最近一次结果</small></div></article>
            <article><span className="kpi-icon orange"><CircleAlert size={20} /></span><div><span>失败节点</span><strong>{formatCount(failedHosts)}</strong><small>最近一次结果</small></div></article>
            <article><span className="kpi-icon purple"><Activity size={20} /></span><div><span>总节点</span><strong>{formatCount(totalHosts)}</strong><small>最近一次覆盖</small></div></article>
          </div>

          <div className="automation-layout">
            <section className="view-card ct8-runs-panel">
              <header><div><span className="view-eyebrow">历史</span><h3>运行历史</h3></div><Timer size={21} /></header>
              {ct8Loading ? <div className="ct8-inline-loading"><LoaderCircle className="spin" size={18} /> 正在加载运行记录</div> : ct8Data.runs.length > 0 ? (
                <div className="ct8-runs-list">{ct8Data.runs.map((run) => {
                  const runStatus = getRunStatus(run.status, run.workflow_conclusion);
                  return <div className="ct8-run-row" key={run.run_id || run.id || getRunTime(run)}><div><strong>{run.workflow || 'ssh-login.yml'}</strong><span>{formatRunId(run.run_id || run.id)} · {formatDateTime(getRunTime(run))}</span></div><span className={`ct8-run-status ${runStatus.className}`}>{runStatus.label}</span><span>{formatCount(run.success_count ?? run.stats?.success)}</span><span>{formatCount(run.failed_count ?? run.stats?.failed)}</span></div>;
                })}</div>
              ) : <div className="ct8-inline-empty">暂无运行记录</div>}
            </section>

            <div className="automation-side-stack">
              <section className="view-card ct8-status-panel">
                <header><div><span className="view-eyebrow">任务</span><h3>当前任务</h3></div>{taskRunning ? <LoaderCircle className="spin" size={21} /> : <Play size={21} />}</header>
                <div className="ct8-status-grid"><div><span>任务状态</span><strong className={`ct8-run-status ${activeStatus.className}`}>{activeStatus.label}</strong></div><div><span>Workflow</span><strong>{latestWorkflow}</strong></div><div><span>最近 Run ID</span><strong>{formatRunId(latestRun?.run_id || activeTask?.run_id)}</strong></div><div><span>检查时间</span><strong>{formatCheckedAt(automation.checkedAt)}</strong></div></div>
                {activeTask?.html_url && <a className="ct8-external-link" href={activeTask.html_url} target="_blank" rel="noreferrer">打开 GitHub 运行记录 <ArrowUpRight size={15} /></a>}
              </section>
              <section className="view-card observability-panel">
                <header><div><span className="view-eyebrow">观测</span><h3>接入链路</h3></div><Database size={21} /></header>
                <ol><li className="done"><span><CheckCircle2 size={17} /></span><div><strong>服务注册</strong><small>已接入统一服务控制台</small></div></li><li className="done"><span><CheckCircle2 size={17} /></span><div><strong>Core API</strong><small>通过平台内部身份访问 CT8 接口</small></div></li><li className={ct8Ready ? 'done' : 'pending'}><span>{ct8Ready ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}</span><div><strong>运行观测</strong><small>{ct8Ready ? '统计与历史已接入' : '等待读取运行数据'}</small></div></li><li className={automation.state === 'unmonitored' ? 'pending' : 'done'}><span>{automation.state === 'unmonitored' ? <Clock3 size={17} /> : <CheckCircle2 size={17} />}</span><div><strong>健康探针</strong><small>{automation.state === 'unmonitored' ? 'GitHub Actions 无独立健康端点' : meta.label}</small></div></li></ol>
              </section>
            </div>
          </div>
        </>
      ) : <div className="view-empty">暂无自动化服务</div>}
    </section>
  );
}
