import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppWindow,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  CircleOff,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { requestJson } from './api.js';
import { ConfirmDialog, SelectControl } from './UiControls.jsx';

const EMPTY_FORM = Object.freeze({
  kind: 'oidc',
  name: '',
  description: '',
  launchUrl: '',
  healthUrl: '',
  redirectUris: '',
  requiredRole: 'viewer',
  openMode: 'webview',
  enabled: true,
  autoLoginEnabled: false,
  autoLoginLoginUrl: '',
  autoLoginUsername: '',
  autoLoginPassword: '',
  autoLoginHomeUrl: '',
  autoLoginAllowInsecure: false,
});

const ROLE_OPTIONS = [
  { value: 'viewer', label: '所有已登录账号' },
  { value: 'operator', label: '操作员及以上' },
  { value: 'super_admin', label: '仅超级管理员' },
];

const OPEN_MODE_OPTIONS = [
  { value: 'webview', label: 'App 内打开' },
  { value: 'browser', label: '系统浏览器打开' },
];

const KIND_OPTIONS = [
  { value: 'oidc', label: '统一身份认证', description: '项目服务端通过 OIDC 使用 MY 登录' },
  { value: 'direct', label: '直接打开网址', description: '只填网址，无需账号密码与自动登录' },
];

const HEALTH_META = {
  healthy: { label: '在线', tone: 'ok', icon: CheckCircle2 },
  degraded: { label: '响应异常', tone: 'warn', icon: CircleAlert },
  offline: { label: '离线', tone: 'danger', icon: CircleOff },
  unmonitored: { label: '未监测', tone: 'neutral', icon: ShieldCheck },
};

function formFromApplication(application) {
  if (!application) return { ...EMPTY_FORM };
  return {
    kind: application.kind === 'direct' ? 'direct' : 'oidc',
    name: application.name || '',
    description: application.description || '',
    launchUrl: application.launchUrl || '',
    healthUrl: application.healthUrl || '',
    redirectUris: (application.redirectUris || []).join('\n'),
    requiredRole: application.requiredRole || 'viewer',
    openMode: application.openMode || 'webview',
    enabled: application.enabled !== false,
    autoLoginEnabled: Boolean(application.autoLogin),
    autoLoginLoginUrl: application.autoLogin?.loginUrl || '',
    autoLoginUsername: application.autoLogin?.username || '',
    autoLoginPassword: '',
    autoLoginHomeUrl: application.autoLogin?.homeUrl || '',
    autoLoginAllowInsecure: application.autoLogin?.allowInsecure === true,
  };
}

function roleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function ApplicationEditor({ application, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => formFromApplication(application));
  const direct = form.kind === 'direct';

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      ...form,
      kind: direct ? 'direct' : 'oidc',
      redirectUris: direct ? [] : form.redirectUris.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
      healthUrl: form.healthUrl.trim() || null,
      autoLogin: !direct && form.autoLoginEnabled ? {
        loginUrl: form.autoLoginLoginUrl.trim(),
        username: form.autoLoginUsername.trim(),
        password: form.autoLoginPassword,
        homeUrl: form.autoLoginHomeUrl.trim() || null,
        allowInsecure: form.autoLoginAllowInsecure === true,
      } : null,
    });
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="modal external-app-dialog" role="dialog" aria-modal="true" aria-label={application ? '编辑外部应用' : '接入外部应用'}>
        <header className="modal-head">
          <div>
            <div className="modal-title">{application ? '编辑外部应用' : '接入外部应用'}</div>
            <p className="modal-sub">{direct ? '填写网址即可在 App 内直接打开，不需要平台账号密码' : '配置项目自己的 OIDC 启动和回调地址'}</p>
          </div>
          <div className="external-app-dialog-actions">
            <a href="/docs/external-auth" target="_blank" rel="noreferrer"><BookOpen size={15} aria-hidden="true" />查看接入文档</a>
            <button className="icon-action" type="button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button>
          </div>
        </header>
        <form className="external-app-form" onSubmit={submit}>
          <div className="modal-body external-app-form-scroll">
            <div className="external-app-form-grid">
              <div className="external-app-kind-field external-app-span" role="radiogroup" aria-label="接入方式">
                <span>接入方式</span>
                <div className="external-app-kind-options">
                  {KIND_OPTIONS.map((option) => {
                    const active = form.kind === option.value;
                    return (
                      <button type="button" role="radio" aria-checked={active} className={active ? 'active' : ''} key={option.value} onClick={() => update('kind', option.value)}>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="external-app-field"><span>应用名称<em className="req">*</em></span><input required maxLength={100} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
              <label className="external-app-field"><span>{direct ? '访问网址' : '启动地址'}<em className="req">*</em></span><input required type="url" placeholder={direct ? 'https://example.com' : (form.autoLoginEnabled ? 'http://example.com/index/index.php（登录后首页）' : 'https://app.example.com/auth/my/start')} value={form.launchUrl} onChange={(event) => update('launchUrl', event.target.value)} /></label>
              <label className="external-app-field external-app-span"><span>应用说明</span><textarea maxLength={500} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
              {!direct && (
                <>
                  <label className="external-app-field external-app-span"><span>回调地址{form.autoLoginEnabled ? null : <em className="req">*</em>}</span><textarea required={!form.autoLoginEnabled} placeholder={form.autoLoginEnabled ? '自动登录站点不需要回调地址' : '每行一个精确地址'} value={form.redirectUris} onChange={(event) => update('redirectUris', event.target.value)} /></label>
                  <label className="external-app-field external-app-toggle external-app-span"><span><strong>第三方自动登录</strong><small>启用后 App 会用下方账号密码自动登录该站点，无需手动输入</small></span><input type="checkbox" checked={form.autoLoginEnabled} onChange={(event) => update('autoLoginEnabled', event.target.checked)} /></label>
                  {form.autoLoginEnabled && (
                    <>
                      <label className="external-app-field"><span>登录页地址<em className="req">*</em></span><input required type="url" placeholder="http://example.com/index/login.php" value={form.autoLoginLoginUrl} onChange={(event) => update('autoLoginLoginUrl', event.target.value)} /></label>
                      <label className="external-app-field"><span>账号<em className="req">*</em></span><input required maxLength={100} autoComplete="off" value={form.autoLoginUsername} onChange={(event) => update('autoLoginUsername', event.target.value)} /></label>
                      <label className="external-app-field"><span>密码<em className="req">*</em></span><input required={!application?.autoLogin?.hasPassword} type="password" autoComplete="new-password" placeholder={application?.autoLogin?.hasPassword ? '已保存，留空则不修改' : (application ? '未保存，请填写' : '请输入该站点登录密码')} value={form.autoLoginPassword} onChange={(event) => update('autoLoginPassword', event.target.value)} /></label>
                      <label className="external-app-field"><span>登录后首页（可选）</span><input type="url" placeholder="http://example.com/index/index.php" value={form.autoLoginHomeUrl} onChange={(event) => update('autoLoginHomeUrl', event.target.value)} /></label>
                      <label className="external-app-field external-app-toggle external-app-span"><span><strong>允许 HTTP 明文登录</strong><small>仅当该站点无法启用 HTTPS 时开启，否则明文传输账号密码</small></span><input type="checkbox" checked={form.autoLoginAllowInsecure} onChange={(event) => update('autoLoginAllowInsecure', event.target.checked)} /></label>
                    </>
                  )}
                </>
              )}
              <label className="external-app-field external-app-span"><span>健康检查地址</span><input type="url" placeholder={direct ? '可选，配置后手机端会显示在线状态' : 'https://app.example.com/healthz'} value={form.healthUrl} onChange={(event) => update('healthUrl', event.target.value)} /></label>
              <label className="external-app-field"><span>最低访问角色</span><SelectControl value={form.requiredRole} options={ROLE_OPTIONS} onChange={(value) => update('requiredRole', value)} ariaLabel="最低访问角色" /></label>
              <label className="external-app-field"><span>Android 打开方式</span><SelectControl value={form.openMode} options={OPEN_MODE_OPTIONS} onChange={(value) => update('openMode', value)} ariaLabel="Android 打开方式" /></label>
              <label className="external-app-field external-app-toggle external-app-span"><span><strong>允许访问</strong><small>{direct ? '停用后手机端将不再展示该入口' : '停用后拒绝新的登录和 Token 兑换'}</small></span><input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} /></label>
            </div>
          </div>
          <footer className="modal-foot">
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={onClose}>取消</button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={16} aria-hidden="true" />}{application ? '保存修改' : '创建接入'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function SecretDialog({ result, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  async function copySecret() {
    await navigator.clipboard.writeText(result.clientSecret);
    setCopied(true);
  }
  return (
    <div className="dialog-backdrop">
      <section className="modal external-secret-dialog" role="dialog" aria-modal="true" aria-label="外部应用客户端密钥">
        <header className="modal-head">
          <div>
            <div className="modal-title">保存客户端密钥</div>
            <p className="modal-sub">密钥只显示这一次。请立即配置到外部项目的服务端环境变量中。</p>
          </div>
          <span className="external-secret-glyph"><KeyRound size={18} aria-hidden="true" /></span>
        </header>
        <div className="modal-body">
          <div className="external-secret-copy">
            <code>{result.clientSecret}</code>
            <button className="icon-action" type="button" onClick={copySecret} aria-label="复制客户端密钥"><Copy size={16} aria-hidden="true" /></button>
          </div>
          <dl className="external-secret-meta">
            <div><dt>Client ID</dt><dd>{result.application.clientId}</dd></div>
            <div><dt>应用</dt><dd>{result.application.name}</dd></div>
          </dl>
        </div>
        <footer className="modal-foot">
          <button className="btn btn-primary btn-sm" type="button" onClick={onClose}>{copied ? '已复制并关闭' : '我已保存'}</button>
        </footer>
      </section>
    </div>
  );
}

export default function ExternalApplicationsView({ session }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(undefined);
  const [secretResult, setSecretResult] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const superAdmin = session?.user?.role === 'super_admin';

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const result = await requestJson('/api/external-apps');
      setApplications(result.applications || []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const healthyCount = useMemo(
    () => applications.filter((application) => application.health?.state === 'healthy').length,
    [applications],
  );

  async function saveApplication(form) {
    const editing = editor || null;
    setBusyId(editing?.id || 'create');
    setError('');
    try {
      const result = await requestJson(editing ? `/api/external-apps/${encodeURIComponent(editing.id)}` : '/api/external-apps', {
        method: editing ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      setEditor(undefined);
      if (result.clientSecret) setSecretResult(result);
      await load(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function launchApplication(application) {
    setBusyId(application.id);
    setError('');
    try {
      const result = await requestJson(`/api/external-apps/${encodeURIComponent(application.id)}/launch`, {
        method: 'POST',
        body: '{}',
      });
      window.open(result.loginUrl, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function rotateSecret(application) {
    setBusyId(application.id);
    setError('');
    try {
      const result = await requestJson(`/api/external-apps/${encodeURIComponent(application.id)}/rotate-secret`, {
        method: 'POST',
        body: '{}',
      });
      setSecretResult(result);
      await load(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  async function deleteApplication() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await requestJson(`/api/external-apps/${encodeURIComponent(deleteTarget.id)}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await load(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="page-view external-applications-view" aria-label="外部应用接入">
      <div className="view-stack">
        <div className="external-app-toolbar">
          <span className="external-app-summary">
            <strong>{applications.length}</strong> 个应用
            {healthyCount > 0 && <span className="tag tone-ok"><span className="tag-dot" />{healthyCount} 在线</span>}
          </span>
          <div className="external-app-toolbar-actions">
            <a className="btn btn-secondary btn-sm" href="/docs/external-auth" target="_blank" rel="noreferrer"><BookOpen size={15} aria-hidden="true" />接入文档</a>
            <button className="btn btn-secondary btn-sm" type="button" disabled={refreshing} onClick={() => load(true)}><RefreshCw className={refreshing ? 'spin' : ''} size={15} aria-hidden="true" />刷新应用状态</button>
            {superAdmin && <button className="btn btn-primary btn-sm" type="button" onClick={() => setEditor(null)}><Plus size={15} aria-hidden="true" />接入应用</button>}
          </div>
        </div>

        {error && <div className="error-banner" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{error}</span></div>}

        {loading ? (
          <div className="view-loading large"><LoaderCircle className="spin" size={20} aria-hidden="true" /><span>正在加载外部应用</span></div>
        ) : applications.length === 0 ? (
          <div className="view-empty"><AppWindow size={26} aria-hidden="true" /><strong>尚未接入外部应用</strong><span>创建第一个外部应用后会显示在这里</span></div>
        ) : (
          <div className="external-app-grid">
            {applications.map((application) => {
              const health = HEALTH_META[application.health?.state] || HEALTH_META.unmonitored;
              const HealthIcon = health.icon;
              return (
                <article className="panel external-app-card" key={application.id}>
                  <header className="external-app-head">
                    <span className="external-app-icon" aria-hidden="true"><AppWindow size={19} /></span>
                    <div className="external-app-copy">
                      <h3>{application.name}</h3>
                      <p>{application.description || '暂无说明'}</p>
                    </div>
                    <span className={`tag tone-${health.tone}`}><HealthIcon size={12} aria-hidden="true" />{health.label}</span>
                  </header>
                  <dl className="external-app-meta">
                    <div><dt>接入方式</dt><dd>{application.kind === 'direct' ? '直接打开网址' : '统一身份认证'}</dd></div>
                    <div><dt>访问范围</dt><dd>{roleLabel(application.requiredRole)}</dd></div>
                    {application.autoLogin && <div><dt>登录方式</dt><dd>{application.autoLogin.allowInsecure ? '自动登录（HTTP 明文）' : '自动登录'}</dd></div>}
                    <div><dt>响应时间</dt><dd className="cell-mono">{application.health?.latencyMs == null ? '--' : `${application.health.latencyMs} ms`}</dd></div>
                    <div><dt>打开方式</dt><dd>{application.openMode === 'browser' ? '系统浏览器' : 'App 内网页'}</dd></div>
                    {superAdmin && application.kind !== 'direct' && <div className="external-app-wide"><dt>Client ID</dt><dd className="cell-mono" title={application.clientId}>{application.clientId}</dd></div>}
                  </dl>
                  <footer className="external-app-foot">
                    <button className="btn btn-secondary btn-sm" type="button" disabled={!application.canAccess || busyId === application.id} onClick={() => launchApplication(application)}>
                      {busyId === application.id ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}打开应用
                    </button>
                    {superAdmin && (
                      <div className="row-actions">
                        <button className="icon-action" type="button" title="编辑应用" aria-label={`编辑应用：${application.name}`} onClick={() => setEditor(application)}><Pencil size={15} aria-hidden="true" /></button>
                        {application.kind !== 'direct' && <button className="icon-action" type="button" title="轮换客户端密钥" aria-label={`轮换客户端密钥：${application.name}`} onClick={() => rotateSecret(application)}><KeyRound size={15} aria-hidden="true" /></button>}
                        <button className="icon-action danger" type="button" title="删除应用" aria-label={`删除应用：${application.name}`} onClick={() => setDeleteTarget(application)}><Trash2 size={15} aria-hidden="true" /></button>
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {editor !== undefined && <ApplicationEditor application={editor} busy={Boolean(busyId)} onClose={() => setEditor(undefined)} onSave={saveApplication} />}
      <SecretDialog result={secretResult} onClose={() => setSecretResult(null)} />
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除外部应用" description="删除后该项目将无法继续使用 MY 登录。" detail={deleteTarget?.name} confirmLabel="删除应用" busy={busyId === deleteTarget?.id} onCancel={() => setDeleteTarget(null)} onConfirm={deleteApplication} />
    </section>
  );
}
