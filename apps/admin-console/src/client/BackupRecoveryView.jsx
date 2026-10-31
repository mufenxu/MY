import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  CloudCog,
  Database,
  Download,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from './api.js';
import { ConfirmDialog } from './UiControls.jsx';
import { EmptyState } from './Pearl.jsx';
import { hasRole, formatDateTime, formatBytes } from './shared.jsx';

const JOB_STATUS_LABEL = {
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  queued: '排队中',
};

export function BackupRecoveryView({ session, BackupQualityStrip, BackupOffsitePanel }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [deletingBackup, setDeletingBackup] = useState('');
  const [downloadingBackup, setDownloadingBackup] = useState('');
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [syncingBackup, setSyncingBackup] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreTotp, setRestoreTotp] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const uploadInputRef = useRef(null);

  const loadBackupStatus = useCallback(async (force = false, options = {}) => {
    const preserveMissingRunningJob = options.preserveMissingRunningJob !== false;
    force ? setRefreshing(true) : setLoading(true);
    setActionError('');
    try {
      const nextStatus = await requestJson('/api/backups/status');
      setStatusData(nextStatus);
      const statusJobs = Array.isArray(nextStatus.jobs) ? nextStatus.jobs : [];
      const running = statusJobs.find((job) => job.status === 'running') || null;
      setActiveJob((current) => {
        const currentMatch = current?.id ? statusJobs.find((job) => job.id === current.id) : null;
        if (currentMatch) return currentMatch;
        if (current?.status === 'running') {
          return running || (preserveMissingRunningJob ? current : null);
        }
        return running || statusJobs[0] || current;
      });
    } catch (error) {
      setActionError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBackupStatus();
  }, [loadBackupStatus]);

  const backups = statusData?.backups || [];
  const capabilities = statusData?.capabilities || {};
  const jobs = statusData?.jobs || [];
  const runningJob = activeJob?.status === 'running'
    ? activeJob
    : jobs.find((job) => job.status === 'running') || null;
  const latestJob = activeJob || jobs[0] || null;
  const latestBackup = backups.find((backup) => backup.restorable) || backups[0] || null;
  const restoreConfirmText = capabilities.restoreConfirmText || 'RESTORE ALL DATA';

  useEffect(() => {
    if (backups.length === 0) {
      setSelectedBackup(null);
      return;
    }
    setSelectedBackup((current) => {
      if (current && backups.some((backup) => backup.name === current.name)) return current;
      return backups.find((backup) => backup.restorable) || backups[0];
    });
  }, [backups]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const result = await requestJson(`/api/backups/jobs/${encodeURIComponent(activeJob.id)}`);
        if (!result.job || result.job.id !== activeJob.id) return;
        setActiveJob(result.job);
        if (result.job.status !== 'running') {
          if (result.job.status === 'succeeded' && result.job.result?.offsite?.status === 'failed') {
            setActionMessage('');
            setActionError(`本地备份已完成，但远端同步失败：${result.job.result.offsite.error || '未知错误'}`);
          } else if (result.job.status === 'succeeded') {
            setActionError('');
            setActionMessage('任务已完成');
          } else if (result.job.status === 'failed') {
            setActionMessage('');
            setActionError(result.job.error || '任务执行失败');
          } else {
            setActionError('');
            setActionMessage('任务状态待确认，已刷新清单');
          }
          loadBackupStatus(true);
        }
      } catch (error) {
        if (error.status === 404 || error.code === 'BACKUP_JOB_NOT_FOUND') {
          setActiveJob((current) => (current?.id === activeJob.id ? null : current));
          setActionError('');
          setActionMessage('任务状态已刷新，请查看备份清单');
          await loadBackupStatus(true, { preserveMissingRunningJob: false });
          return;
        }
        setActionError(error.message);
      }
    }, 2200);
    return () => window.clearInterval(timer);
  }, [activeJob, loadBackupStatus]);

  async function handleStartBackup() {
    setActionError('');
    setActionMessage('');
    try {
      const result = await requestJson('/api/backups/run', { method: 'POST' });
      setActiveJob(result.job);
      setActionMessage('备份任务已提交');
      await loadBackupStatus(true);
      return { job: result.job };
    } catch (error) {
      setActionError(error.message);
      return { error: error.message };
    }
  }

  async function handleSyncBackup(backup) {
    if (!backup?.restorable) return;
    setSyncingBackup(backup.name);
    setActionError('');
    setActionMessage('');
    try {
      await requestJson(`/api/backups/${encodeURIComponent(backup.name)}/sync`, {
        method: 'POST',
        body: '{}',
        timeoutMs: 10 * 60 * 1000,
      });
      setActionMessage('备份已同步到外部存储。');
      await loadBackupStatus(true);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSyncingBackup('');
    }
  }

  function handleBackupRowKeyDown(event, backup) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedBackup(backup);
  }

  async function handleDownloadBackup(backup) {
    setActionError('');
    setActionMessage('');
    if (!backup?.restorable) {
      setActionError('这个备份包不可下载');
      return;
    }
    if (!canManageBackups) {
      setActionError('仅超级管理员可以下载备份归档。');
      return;
    }
    if (!session.authDisabled && !restorePassword) {
      setActionError('请先输入当前管理员密码。');
      return;
    }
    if (!session.authDisabled && session.user?.totpEnabled && restoreTotp.length !== 6) {
      setActionError('请先输入六位动态验证码。');
      return;
    }

    setDownloadingBackup(backup.name);
    try {
      const response = await fetch(`/api/backups/${encodeURIComponent(backup.name)}/download`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Platform-Request': 'console',
        },
        body: JSON.stringify({ password: restorePassword, totp: restoreTotp }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `备份下载失败（HTTP ${response.status}）。`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${backup.name}.tar.gz`;
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
      setRestorePassword('');
      setRestoreTotp('');
      setActionMessage('备份下载已开始。');
    } catch (error) {
      setActionError(error.message);
    } finally {
      setDownloadingBackup('');
    }
  }

  function handleDeleteBackup(backup) {
    setActionError('');
    setActionMessage('');
    if (!backup?.name) return;
    setConfirmation({ type: 'delete', backup });
  }

  async function handleUploadBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setActionError('');
    setActionMessage('');
    setUploadingBackup(true);
    try {
      const result = await requestJson(`/api/backups/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/gzip',
        },
      });
      if (result.backup) setSelectedBackup(result.backup);
      setActionMessage('备份包已上传');
      await loadBackupStatus(true);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setUploadingBackup(false);
    }
  }

  async function handleStartRestore() {
    setActionError('');
    setActionMessage('');
    if (!selectedBackup?.name) {
      setActionError('请选择要恢复的备份');
      return;
    }
    if (!session.authDisabled && !restorePassword) {
      setActionError('请输入管理员密码');
      return;
    }
    if (!session.authDisabled && session.user?.totpEnabled && restoreTotp.length !== 6) {
      setActionError('请输入六位动态验证码');
      return;
    }
    if (confirmText !== restoreConfirmText) {
      setActionError('确认短语不正确');
      return;
    }
    setConfirmation({ type: 'restore', backup: selectedBackup });
  }

  async function handleConfirmBackupAction() {
    if (!confirmation?.backup?.name) return;
    const pending = confirmation;
    setConfirmationBusy(true);
    setActionError('');
    setActionMessage('');
    try {
      if (pending.type === 'delete') {
        setDeletingBackup(pending.backup.name);
        await requestJson(`/api/backups/${encodeURIComponent(pending.backup.name)}`, { method: 'DELETE' });
        if (selectedBackup?.name === pending.backup.name) setSelectedBackup(null);
        setActionMessage('备份已删除');
        await loadBackupStatus(true);
      } else {
        const result = await requestJson('/api/backups/restore', {
          method: 'POST',
          body: JSON.stringify({
            backupName: pending.backup.name,
            password: restorePassword,
            totp: restoreTotp,
            confirmText,
          }),
        });
        setActiveJob(result.job);
        setRestorePassword('');
        setRestoreTotp('');
        setConfirmText('');
        setActionMessage('恢复任务已提交');
        await loadBackupStatus(true);
      }
    } catch (error) {
      setActionError(error.message);
    } finally {
      setDeletingBackup('');
      setConfirmationBusy(false);
      setConfirmation(null);
    }
  }

  const canOperateBackups = hasRole(session.user?.role, 'operator');
  const canManageBackups = hasRole(session.user?.role, 'super_admin');
  const canUseRestore = Boolean(canManageBackups && capabilities.canRestore && selectedBackup?.restorable && !runningJob);
  const executorHealthy = capabilities.canBackup && capabilities.canRestore;
  const credentialsSatisfied = session.authDisabled
    || (restorePassword && (!session.user?.totpEnabled || restoreTotp.length === 6));

  return (
    <section className="page-view" aria-label="数据灾备">
      <div className="view-stack">
        <div className="toolbar">
          <span className="toolbar-label"><Database size={14} aria-hidden="true" />备份目录</span>
          <span className="toolbar-hint">{capabilities.backupRoot || '备份目录未配置'}</span>
          <div className="toolbar-end">
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => loadBackupStatus(true)} disabled={refreshing}>
              {refreshing ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}
              {refreshing ? '正在刷新' : '刷新清单'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={handleStartBackup}
              disabled={!canOperateBackups || !capabilities.canBackup || Boolean(runningJob)}
            >
              {runningJob?.type === 'backup' ? <LoaderCircle className="spin" size={15} /> : <Play size={15} />}
              {runningJob?.type === 'backup' ? '正在备份' : '立即备份'}
            </button>
          </div>
        </div>

        <BackupQualityStrip />

        <div className="stat-strip">
          <article className="stat-card">
            <span className="stat-icon tone-info"><Database size={17} /></span>
            <div>
              <span className="stat-label">可用备份</span>
              <strong className="stat-figure">{backups.filter((backup) => backup.restorable).length}</strong>
              <small className="stat-foot">共 {backups.length} 个归档</small>
            </div>
          </article>
          <article className="stat-card">
            <span className={`stat-icon tone-${executorHealthy ? 'ok' : 'warn'}`}><CheckCircle2 size={17} /></span>
            <div>
              <span className="stat-label">执行器</span>
              <strong className="stat-figure">{executorHealthy ? '就绪' : '受限'}</strong>
              <small className="stat-foot">{capabilities.issues?.join('，') || '可执行备份与恢复'}</small>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon tone-violet"><Clock3 size={17} /></span>
            <div>
              <span className="stat-label">最近备份</span>
              <strong className="stat-figure stat-figure-sm">{formatDateTime(latestBackup?.createdAt)}</strong>
              <small className="stat-foot">{latestBackup?.name || '暂无归档'}</small>
            </div>
          </article>
          <article className="stat-card">
            <span className="stat-icon tone-ok"><ShieldCheck size={17} /></span>
            <div>
              <span className="stat-label">高危操作保护</span>
              <strong className="stat-figure">{session.authDisabled ? '确认短语' : session.user?.totpEnabled ? '双重验证' : '密码验证'}</strong>
              <small className="stat-foot">下载与恢复均需二次验证</small>
            </div>
          </article>
        </div>

        {(actionError || actionMessage) && (
          <div className={`alert ${actionError ? 'is-error' : 'is-ok'}`} role="status">
            {actionError ? <CircleAlert size={15} /> : <CheckCircle2 size={15} />}
            <span>{actionError || actionMessage}</span>
          </div>
        )}

        <div className="split split-wide">
          <div className="split-main">
            <section className="panel panel-flush" aria-label="备份清单">
              <div className="panel-head">
                <div className="panel-title"><Database size={15} aria-hidden="true" />备份清单</div>
                <span className="panel-meta">{backups.length} 个归档 · 选中一行作为恢复目标</span>
              </div>
              <div className="data-list">
                <div className="data-head col-backup" aria-hidden="true">
                  <span>备份</span><span>时间</span><span>大小</span><span>状态</span><span className="cell-actions">操作</span>
                </div>
                {loading ? (
                  <div className="loading-inline"><LoaderCircle className="spin" size={16} /> 正在加载备份清单</div>
                ) : backups.length === 0 ? (
                  <div className="data-list-empty"><span>暂无备份归档</span></div>
                ) : backups.map((backup) => (
                  <div
                    key={backup.name}
                    className={`data-row col-backup is-selectable ${selectedBackup?.name === backup.name ? 'is-selected' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedBackup(backup)}
                    onKeyDown={(event) => handleBackupRowKeyDown(event, backup)}
                  >
                    <span className="cell-stack">
                      <strong>{backup.name}</strong>
                      <small>{backup.includes?.join(' / ') || '清单不可读'}</small>
                    </span>
                    <span className="panel-meta">{formatDateTime(backup.createdAt)}</span>
                    <span className="cell-num">{formatBytes(backup.sizeBytes)}</span>
                    <span className={`tag tone-${backup.restorable ? 'ok' : 'danger'}`}>{backup.restorable ? '可恢复' : '不可用'}</span>
                    <span className="row-actions">
                      <button
                        className="icon-action"
                        type="button"
                        aria-label={`同步备份 ${backup.name}`}
                        title="同步到外部存储"
                        disabled={!canOperateBackups || !statusData?.offsite?.enabled || !backup.restorable || Boolean(runningJob) || syncingBackup === backup.name}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSyncBackup(backup);
                        }}
                      >
                        {syncingBackup === backup.name ? <LoaderCircle className="spin" size={15} /> : <CloudCog size={15} />}
                      </button>
                      <button
                        className="icon-action"
                        type="button"
                        aria-label={`下载备份 ${backup.name}`}
                        title="下载备份"
                        disabled={!canManageBackups || !backup.restorable || downloadingBackup === backup.name}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDownloadBackup(backup);
                        }}
                      >
                        {downloadingBackup === backup.name ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}
                      </button>
                      <button
                        className="icon-action danger"
                        type="button"
                        aria-label={`删除备份 ${backup.name}`}
                        title="删除备份"
                        disabled={!canManageBackups || Boolean(runningJob) || deletingBackup === backup.name}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteBackup(backup);
                        }}
                      >
                        {deletingBackup === backup.name ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {latestJob && (
              <section className="panel" aria-label="最近任务">
                <div className="panel-head">
                  <div className="panel-title">
                    {latestJob.status === 'running' ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />}
                    最近任务
                  </div>
                  <span className={`tag tone-${latestJob.status === 'failed' ? 'danger' : latestJob.status === 'running' ? 'info' : 'ok'}`}>
                    {latestJob.type === 'backup' ? '备份' : '恢复'} · {JOB_STATUS_LABEL[latestJob.status] || latestJob.status}
                  </span>
                </div>
                <div className="panel-body">
                  <div className="kv-grid">
                    <div className="kv"><div className="kv-label">发起人</div><div className="kv-value">{latestJob.requestedBy || 'admin'}</div></div>
                    <div className="kv"><div className="kv-label">退出码</div><div className="kv-value cell-mono">{latestJob.exitCode ?? '--'}</div></div>
                    <div className="kv"><div className="kv-label">开始时间</div><div className="kv-value">{formatDateTime(latestJob.startedAt)}</div></div>
                    <div className="kv"><div className="kv-label">结束时间</div><div className="kv-value">{formatDateTime(latestJob.finishedAt)}</div></div>
                  </div>
                  {(latestJob.error || latestJob.stdout || latestJob.stderr) && (
                    <pre className="code-block backup-job-log">{[
                      latestJob.error,
                      !latestJob.error && latestJob.stderr && `stderr:\n${latestJob.stderr}`,
                      !latestJob.error && latestJob.stdout && `stdout:\n${latestJob.stdout}`,
                    ].filter(Boolean).join('\n\n')}</pre>
                  )}
                </div>
              </section>
            )}
          </div>

          <aside className="split-side">
            <section className="panel" aria-label="高危恢复">
              <div className="panel-head">
                <div className="panel-title"><ShieldCheck size={15} aria-hidden="true" />高危恢复</div>
                <span className="tag tone-danger">需二次验证</span>
              </div>
              <div className="panel-body">
                <div className="restore-target">
                  <span className="restore-target-label">目标备份</span>
                  <strong>{selectedBackup?.name || '未选择'}</strong>
                  <small>{selectedBackup ? formatDateTime(selectedBackup.createdAt) : '请从备份清单选择'}</small>
                </div>
                <p className="restore-warning">恢复提交后会先创建当前状态备份，再执行覆写。</p>
                <input
                  ref={uploadInputRef}
                  className="visually-hidden"
                  type="file"
                  accept=".tar.gz,.tgz,application/gzip,application/x-gzip"
                  onChange={handleUploadBackup}
                />
                <button
                  className="btn btn-secondary btn-block"
                  type="button"
                  disabled={!canOperateBackups || Boolean(runningJob) || uploadingBackup}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  {uploadingBackup ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}
                  {uploadingBackup ? '正在上传' : '上传备份包'}
                </button>
                <div className="restore-form">
                  {!session.authDisabled && (
                    <label className="config-field">
                      <span>管理员密码（下载 / 恢复）</span>
                      <input
                        type="password"
                        autoComplete="current-password"
                        value={restorePassword}
                        onChange={(event) => setRestorePassword(event.target.value)}
                        placeholder="当前平台登录密码"
                      />
                    </label>
                  )}
                  {!session.authDisabled && session.user?.totpEnabled && (
                    <label className="config-field">
                      <span>动态验证码（下载 / 恢复）</span>
                      <input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={restoreTotp}
                        onChange={(event) => setRestoreTotp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="六位验证码"
                      />
                    </label>
                  )}
                  <label className="config-field">
                    <span>确认短语<small>{restoreConfirmText}</small></span>
                    <input
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      placeholder={restoreConfirmText}
                    />
                  </label>
                </div>
                <button
                  className="btn btn-danger btn-block restore-submit"
                  type="button"
                  disabled={!canUseRestore || confirmText !== restoreConfirmText || !credentialsSatisfied}
                  onClick={handleStartRestore}
                >
                  {runningJob?.type === 'restore' ? <LoaderCircle className="spin" size={15} /> : <ShieldCheck size={15} />}
                  {runningJob?.type === 'restore' ? '正在恢复' : '执行恢复'}
                </button>
              </div>
            </section>
          </aside>
        </div>

        <BackupOffsitePanel
          session={session}
          localBackups={backups}
          backupJob={activeJob}
          canExecuteBackup={Boolean(capabilities.canBackup && !runningJob)}
          onExecuteBackup={handleStartBackup}
          onImported={(backup) => {
            if (backup) setSelectedBackup(backup);
            loadBackupStatus(true);
          }}
        />
      </div>

      <ConfirmDialog
        open={Boolean(confirmation)}
        tone="danger"
        title={confirmation?.type === 'restore' ? '确认恢复数据库' : '确认删除备份'}
        description={confirmation?.type === 'restore'
          ? '恢复操作会先备份当前状态，再使用所选归档覆写现有数据库。执行期间请勿关闭服务。'
          : '删除后该备份归档将无法找回，请确认它不再用于恢复或审计。'}
        detail={confirmation?.backup?.name}
        confirmLabel={confirmation?.type === 'restore' ? '确认恢复' : '删除备份'}
        busy={confirmationBusy}
        onCancel={() => setConfirmation(null)}
        onConfirm={handleConfirmBackupAction}
      />
    </section>
  );
}
