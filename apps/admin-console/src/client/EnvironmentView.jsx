import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  EyeOff,
  FileKey2,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCw,
  Search,
  ServerCog,
  ShieldCheck,
  X,
} from 'lucide-react';
import { requestJson } from './api.js';
import { SelectControl } from './UiControls.jsx';
import {
  environmentConclusion,
  environmentStatusMeta,
  filterEnvironmentVariables,
} from './environment-presentation.js';

const RUNTIME_META = {
  loaded: { label: '运行服务已加载', tone: 'healthy' },
  restart_required: { label: '等待服务重启', tone: 'attention' },
  not_observed: { label: '未发现运行实例', tone: 'muted' },
  not_applicable: { label: '无需加载', tone: 'muted' },
};

const VERIFICATION_META = {
  passed: { label: '关联服务正常', tone: 'healthy' },
  failed: { label: '关联服务异常', tone: 'failed' },
  unknown: { label: '尚未验证', tone: 'muted' },
  not_applicable: { label: '无需验证', tone: 'muted' },
};

function formatDateTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

function EnvironmentDetail({ variable, onClose }) {
  if (!variable) return null;
  const status = environmentStatusMeta(variable.status);
  const runtime = RUNTIME_META[variable.runtimeStatus] || RUNTIME_META.not_observed;
  const verification = VERIFICATION_META[variable.verificationStatus] || VERIFICATION_META.unknown;
  return (
    <div className="environment-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="environment-detail" role="dialog" aria-modal="true" aria-labelledby="environment-detail-title">
        <header>
          <div><span>{variable.sensitive ? <KeyRound size={18} /> : <FileKey2 size={18} />}</span><div><strong id="environment-detail-title">{variable.key}</strong><small>{variable.groupLabel}</small></div></div>
          <button type="button" className="icon-action" onClick={onClose} aria-label="关闭变量详情"><X size={18} /></button>
        </header>
        <div className="environment-detail-body">
          <section>
            <h3>用途</h3>
            <p>{variable.description}</p>
          </section>
          <section className="environment-detail-statuses">
            <span className={`environment-pill ${status.tone}`}>{status.label}</span>
            <span className={`environment-pill ${runtime.tone}`}>{runtime.label}</span>
            <span className={`environment-pill ${verification.tone}`}>{verification.label}</span>
          </section>
          <dl>
            <div><dt>是否必填</dt><dd>{variable.required ? '当前功能必须配置' : '可选或当前未启用'}</dd></div>
            <div><dt>敏感级别</dt><dd>{variable.sensitive ? '敏感值，不向客户端返回' : '非敏感配置'}</dd></div>
            <div><dt>当前值</dt><dd>{variable.sensitive ? '已脱敏，仅显示配置状态' : variable.displayValue || '未配置'}</dd></div>
            <div><dt>关联服务</dt><dd>{variable.services?.join('、') || '当前 Compose 未引用'}</dd></div>
            <div><dt>生效方式</dt><dd>{variable.restartRequired ? '修改后需要重启关联服务' : '不适用'}</dd></div>
          </dl>
          <section className={`environment-guidance ${status.tone}`}>
            <strong>诊断结论</strong>
            <p>{variable.detail}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

export default function EnvironmentView() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setReport(await requestJson(`/api/environment${refresh ? '?refresh=1' : ''}`, { timeoutMs: 20000 }));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const variables = useMemo(() => filterEnvironmentVariables(report?.variables, { query, group, status }), [group, query, report?.variables, status]);
  const summary = report?.summary || {};
  const attentionCount = Number(summary.missing || 0) + Number(summary.invalid || 0) + Number(summary.verificationFailed || 0);

  if (loading && !report) return <div className="ops-loading"><LoaderCircle className="spin" size={18} />正在检查环境变量...</div>;

  return (
    <section className="platform-control-view environment-view">
      {error && <div className="ops-feedback error" role="alert"><AlertTriangle size={17} /><span>{error}</span></div>}
      <header className={`environment-summary ${summary.state || 'unavailable'}`}>
        <div className="environment-summary-main">
          <span>{summary.state === 'healthy' ? <ShieldCheck size={23} /> : summary.state === 'unavailable' ? <CircleOff size={23} /> : <AlertTriangle size={23} />}</span>
          <div><strong>{environmentConclusion({ ...summary, available: report?.available })}</strong><small>检查于 {formatDateTime(report?.checkedAt)} · 配置更新于 {formatDateTime(report?.envUpdatedAt)}</small></div>
        </div>
        <button className="secondary-action compact" type="button" disabled={refreshing} onClick={() => load(true)}><RefreshCw className={refreshing ? 'spin' : ''} size={16} />重新检查</button>
      </header>

      <div className="environment-kpis" aria-label="环境变量统计">
        <article><FileKey2 size={18} /><span>变量总数<strong>{summary.total || 0}</strong></span></article>
        <article><CheckCircle2 size={18} /><span>配置有效<strong>{summary.healthy || 0}</strong></span></article>
        <article className={attentionCount ? 'attention' : ''}><AlertTriangle size={18} /><span>需要处理<strong>{attentionCount}</strong></span></article>
        <article className={summary.restartRequired ? 'attention' : ''}><RotateCw size={18} /><span>等待重启<strong>{summary.restartRequired || 0}</strong></span></article>
        <article><CircleOff size={18} /><span>未启用/使用<strong>{Number(summary.inactive || 0) + Number(summary.unused || 0)}</strong></span></article>
      </div>

      <div className="environment-toolbar">
        <label className="environment-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索变量名、用途或服务" aria-label="搜索环境变量" /></label>
        <SelectControl value={group} ariaLabel="按服务分组筛选" onChange={setGroup} options={[{ value: 'all', label: '全部分组' }, ...(report?.groups || []).map((item) => ({ value: item.id, label: `${item.label} (${item.total})` }))]} />
        <SelectControl value={status} ariaLabel="按配置状态筛选" onChange={setStatus} options={[
          { value: 'all', label: '全部状态' }, { value: 'attention', label: '需要处理' }, { value: 'valid', label: '配置有效' },
          { value: 'restart_required', label: '等待重启' }, { value: 'inactive', label: '当前未启用' }, { value: 'unused', label: '当前未使用' },
        ]} />
        <span>{variables.length} 项结果</span>
      </div>

      {!report?.available ? (
        <div className="environment-unavailable"><ServerCog size={24} /><div><strong>无法读取部署环境</strong><p>{report?.issue || '请确认部署执行器已启用并可访问。'}</p></div></div>
      ) : variables.length === 0 ? (
        <div className="ops-empty">当前筛选条件下没有环境变量。</div>
      ) : (
        <div className="environment-table" role="table" aria-label="环境变量诊断结果">
          <div className="environment-table-head" role="row"><span>变量与用途</span><span>关联服务</span><span>配置状态</span><span>运行状态</span><span aria-label="详情" /></div>
          {variables.map((variable) => {
            const configMeta = environmentStatusMeta(variable.status);
            const runtimeMeta = RUNTIME_META[variable.runtimeStatus] || RUNTIME_META.not_observed;
            return (
              <button type="button" className="environment-row" role="row" key={variable.key} onClick={() => setSelected(variable)}>
                <span className="environment-variable"><span>{variable.sensitive ? <EyeOff size={16} /> : <FileKey2 size={16} />}</span><span><strong>{variable.key}</strong><small>{variable.description}</small></span></span>
                <span className="environment-services">{variable.services?.length ? variable.services.map((service) => <code key={service}>{service}</code>) : <small>未引用</small>}</span>
                <span><i className={`environment-pill ${configMeta.tone}`}>{configMeta.label}</i></span>
                <span><i className={`environment-pill ${runtimeMeta.tone}`}>{runtimeMeta.label}</i></span>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
      )}
      <footer className="environment-security-note"><EyeOff size={16} /><span>密码、Token、私钥、连接串和加密密钥不会发送到浏览器；页面只显示脱敏状态。</span></footer>
      <EnvironmentDetail variable={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
