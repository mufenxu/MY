import { useCallback, useEffect, useState } from 'react';
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
import './ExternalApplicationsView.css';

const EMPTY_FORM = Object.freeze({
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

const HEALTH_META = {
  healthy: { label: '在线', icon: CheckCircle2 },
  degraded: { label: '响应异常', icon: CircleAlert },
  offline: { label: '离线', icon: CircleOff },
  unmonitored: { label: '未监测', icon: ShieldCheck },
};

function formFromApplication(application) {
  if (!application) return { ...EMPTY_FORM };
  return {
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
  };
}

function roleLabel(role) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function ApplicationEditor({ application, busy, onClose, onSave }) {
  const [form, setForm] = useState(() => formFromApplication(application));

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit(event) {
    event.preventDefault();
    onSave({
      ...form,
      redirectUris: form.redirectUris.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean),
      healthUrl: form.healthUrl.trim() || null,
      autoLogin: form.autoLoginEnabled ? {
        loginUrl: form.autoLoginLoginUrl.trim(),
        username: form.autoLoginUsername.trim(),
        password: form.autoLoginPassword,
        homeUrl: form.autoLoginHomeUrl.trim() || null,
      } : null,
    });
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <section className="external-app-dialog" role="dialog" aria-modal="true" aria-label={application ? '编辑外部应用' : '接入外部应用'}>
        <header>
          <div><span><AppWindow size={20} /></span><div><h2>{application ? '编辑外部应用' : '接入外部应用'}</h2><p>配置项目自己的 OIDC 启动和回调地址</p></div></div>
          <div className="external-app-dialog-actions"><a href="/docs/external-auth" target="_blank" rel="noreferrer"><BookOpen size={16} />查看接入文档</a><button type="button" aria-label="关闭弹窗" disabled={busy} onClick={onClose}><X size={19} /></button></div>
        </header>
        <form onSubmit={submit}>
          <div className="external-app-form-grid">
            <label><span>应用名称</span><input required maxLength={100} value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
            <label><span>启动地址</span><input required type="url" placeholder={form.autoLoginEnabled ? 'http://example.com/index/index.php（登录后首页）' : 'https://app.example.com/auth/my/start'} value={form.launchUrl} onChange={(event) => update('launchUrl', event.target.value)} /></label>
            <label className="wide"><span>应用说明</span><textarea maxLength={500} value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
            <label className="wide"><span>回调地址</span><textarea required={!form.autoLoginEnabled} placeholder={form.autoLoginEnabled ? '自动登录站点不需要回调地址' : '每行一个精确地址'} value={form.redirectUris} onChange={(event) => update('redirectUris', event.target.value)} /></label>
            <label className="wide external-app-toggle"><span><strong>第三方自动登录</strong><small>启用后 App 会用下方账号密码自动登录该站点，无需手动输入</small></span><input type="checkbox" checked={form.autoLoginEnabled} onChange={(event) => update('autoLoginEnabled', event.target.checked)} /></label>
            {form.autoLoginEnabled && (
              <>
                <label><span>登录页地址</span><input required type="url" placeholder="http://example.com/index/login.php" value={form.autoLoginLoginUrl} onChange={(event) => update('autoLoginLoginUrl', event.target.value)} /></label>
                <label><span>账号</span><input required maxLength={100} autoComplete="off" value={form.autoLoginUsername} onChange={(event) => update('autoLoginUsername', event.target.value)} /></label>
                <label><span>密码</span><input required={!application} type="password" autoComplete="new-password" placeholder={application ? '已保存，留空则不修改' : '请输入该站点登录密码'} value={form.autoLoginPassword} onChange={(event) => update('autoLoginPassword', event.target.value)} /></label>
                <label className="wide"><span>登录后首页（可选）</span><input type="url" placeholder="http://example.com/index/index.php" value={form.autoLoginHomeUrl} onChange={(event) => update('autoLoginHomeUrl', event.target.value)} /></label>
              </>
            )}
            <label><span>健康检查地址</span><input type="url" placeholder="https://app.example.com/healthz" value={form.healthUrl} onChange={(event) => update('healthUrl', event.target.value)} /></label>
            <label><span>最低访问角色</span><SelectControl value={form.requiredRole} options={ROLE_OPTIONS} onChange={(value) => update('requiredRole', value)} ariaLabel="最低访问角色" /></label>
            <label><span>Android 打开方式</span><SelectControl value={form.openMode} options={OPEN_MODE_OPTIONS} onChange={(value) => update('openMode', value)} ariaLabel="Android 打开方式" /></label>
            <label className="external-app-toggle"><span><strong>允许访问</strong><small>停用后拒绝新的登录和 Token 兑换</small></span><input type="checkbox" checked={form.enabled} onChange={(event) => update('enabled', event.target.checked)} /></label>
          </div>
          <footer>
            <button className="dialog-button secondary" type="button" disabled={busy} onClick={onClose}>取消</button>
            <button className="dialog-button primary" type="submit" disabled={busy}>{busy && <LoaderCircle className="spin" size={17} />}{application ? '保存修改' : '创建接入'}</button>
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
      <section className="external-secret-dialog" role="dialog" aria-modal="true" aria-label="外部应用客户端密钥">
        <span className="external-secret-icon"><KeyRound size={22} /></span>
        <h2>保存客户端密钥</h2>
        <p>密钥只显示这一次。请立即配置到外部项目的服务端环境变量中。</p>
        <div><code>{result.clientSecret}</code><button type="button" onClick={copySecret} aria-label="复制客户端密钥"><Copy size={17} /></button></div>
        <dl><div><dt>Client ID</dt><dd>{result.application.clientId}</dd></div><div><dt>应用</dt><dd>{result.application.name}</dd></div></dl>
        <button className="dialog-button primary" type="button" onClick={onClose}>{copied ? '已复制并关闭' : '我已保存'}</button>
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
    <section className="external-applications-view" aria-label="外部应用接入">
      <header className="external-applications-header">
        <div><span>身份联邦</span><h2>外部应用</h2><p>独立部署，统一身份，一键进入</p></div>
        <div>
          <a className="secondary-action external-doc-link" href="/docs/external-auth" target="_blank" rel="noreferrer"><BookOpen size={17} />接入文档</a>
          <button className="secondary-action" type="button" disabled={refreshing} onClick={() => load(true)}><RefreshCw className={refreshing ? 'spin' : ''} size={17} />刷新状态</button>
          {superAdmin && <button className="primary-button" type="button" onClick={() => setEditor(null)}><Plus size={17} />接入应用</button>}
        </div>
      </header>

      {error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{error}</span></div>}
      {loading ? <div className="view-loading large"><LoaderCircle className="spin" size={22} /><span>正在加载外部应用</span></div> : (
        <div className="external-app-grid">
          {applications.map((application) => {
            const health = HEALTH_META[application.health?.state] || HEALTH_META.unmonitored;
            const HealthIcon = health.icon;
            return (
              <article className={`external-app-card state-${application.health?.state || 'unmonitored'}`} key={application.id}>
                <header><span className="external-app-icon"><AppWindow size={21} /></span><div><h3>{application.name}</h3><p>{application.description || '暂无说明'}</p></div><span className="external-health"><HealthIcon size={15} />{health.label}</span></header>
                <dl>
                  <div><dt>访问范围</dt><dd>{roleLabel(application.requiredRole)}</dd></div>
                  {application.autoLogin && <div><dt>登录方式</dt><dd>自动登录</dd></div>}
                  <div><dt>响应时间</dt><dd>{application.health?.latencyMs == null ? '--' : `${application.health.latencyMs} ms`}</dd></div>
                  <div><dt>打开方式</dt><dd>{application.openMode === 'browser' ? '系统浏览器' : 'App 内网页'}</dd></div>
                  {superAdmin && <div><dt>Client ID</dt><dd title={application.clientId}>{application.clientId}</dd></div>}
                </dl>
                <footer>
                  <button className="external-open-button" type="button" disabled={!application.canAccess || busyId === application.id} onClick={() => launchApplication(application)}>{busyId === application.id ? <LoaderCircle className="spin" size={17} /> : <ExternalLink size={17} />}打开应用</button>
                  {superAdmin && <div className="external-admin-actions"><button type="button" title="编辑应用" onClick={() => setEditor(application)}><Pencil size={16} /></button><button type="button" title="轮换客户端密钥" onClick={() => rotateSecret(application)}><KeyRound size={16} /></button><button type="button" title="删除应用" onClick={() => setDeleteTarget(application)}><Trash2 size={16} /></button></div>}
                </footer>
              </article>
            );
          })}
          {!applications.length && <div className="external-app-empty"><AppWindow size={28} /><strong>尚未接入外部应用</strong><span>创建第一个 OIDC 客户端后会显示在这里</span></div>}
        </div>
      )}

      {editor !== undefined && <ApplicationEditor application={editor} busy={Boolean(busyId)} onClose={() => setEditor(undefined)} onSave={saveApplication} />}
      <SecretDialog result={secretResult} onClose={() => setSecretResult(null)} />
      <ConfirmDialog open={Boolean(deleteTarget)} title="删除外部应用" description="删除后该项目将无法继续使用 MY 登录。" detail={deleteTarget?.name} confirmLabel="删除应用" busy={busyId === deleteTarget?.id} onCancel={() => setDeleteTarget(null)} onConfirm={deleteApplication} />
    </section>
  );
}
