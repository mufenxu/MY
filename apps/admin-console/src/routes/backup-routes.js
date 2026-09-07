import { BackupOperationError } from "../backups.js";

export function registerBackupRoutes(app, {
  backups,
  config,
  confirmSensitiveAuthentication,
  operations,
  recordAudit,
  requireBackupDownloadAccess,
  requireConsoleRequest,
  requireRole,
  safeDownloadName,
  sendBackupError,
  verifyReauthentication,
}) {
  app.get('/api/backups/status', async (req, res, next) => {
    try {
      res.json(await backups.getStatus());
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/backups/schedule', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const enabled = req.body?.enabled;
      const time = String(req.body?.time || '');
      if (typeof enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
        return res.status(400).json({ error: '自动备份计划格式无效。', code: 'INVALID_BACKUP_SCHEDULE' });
      }
      const settings = await operations.updateSettings({ backupSchedule: { enabled, time } }, req.consoleUser.username);
      return res.json({ schedule: settings.backupSchedule });
    } catch (error) {
      next(error);
      return undefined;
    }
  });

  app.get('/api/backups/quality', async (req, res, next) => {
    try {
      res.json(await operations.getBackupQuality({ force: req.query.refresh === '1' }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/backups/offsite/config', requireRole('operator'), async (req, res, next) => {
    try {
      res.json({ config: await backups.getOffsiteConfig() });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.put('/api/backups/offsite/config', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'backup.offsite_config')) return;
      const input = {
        enabled: req.body?.enabled,
        provider: req.body?.provider,
        accountId: req.body?.accountId,
        endpoint: req.body?.endpoint,
        region: req.body?.region,
        bucket: req.body?.bucket,
        prefix: req.body?.prefix,
        forcePathStyle: req.body?.forcePathStyle,
        accessKeyId: req.body?.accessKeyId,
        secretAccessKey: req.body?.secretAccessKey,
        localRetentionDays: req.body?.localRetentionDays,
        remoteRetentionDays: req.body?.remoteRetentionDays,
      };
      const updated = await backups.configureOffsite(input);
      await recordAudit(req, {
        action: 'backup.offsite_configured',
        targetType: 'backup_storage',
        targetId: updated.provider || 's3',
        details: {
          enabled: Boolean(updated.enabled),
          provider: updated.provider || '',
          bucket: updated.bucket || '',
          localRetentionDays: updated.localRetentionDays || null,
          remoteRetentionDays: updated.remoteRetentionDays || null,
        },
      });
      res.json({ config: updated });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/offsite/test', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      if (!await confirmSensitiveAuthentication(req, res, 'backup.offsite_test')) return;
      const checked = await backups.testOffsiteConnection();
      await recordAudit(req, {
        action: 'backup.offsite_tested',
        targetType: 'backup_storage',
        targetId: checked.provider || 's3',
        details: { healthy: checked.healthy === true },
      });
      res.json({ config: checked });
    } catch (error) {
      await recordAudit(req, {
        action: 'backup.offsite_tested',
        outcome: 'failure',
        targetType: 'backup_storage',
        details: { error: String(error.message || error).slice(0, 200) },
      });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.get('/api/backups/offsite', requireRole('operator'), async (req, res, next) => {
    try {
      res.json({ backups: await backups.listOffsiteBackups() });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/offsite/import', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const key = String(req.body?.key || '');
      const result = await backups.importOffsiteBackup({ key });
      await recordAudit(req, {
        action: 'backup.offsite_imported',
        targetType: 'backup',
        targetId: result.backup?.name || '',
        details: { key },
      });
      res.status(201).json(result);
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/:backupName/sync', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const sync = await backups.syncOffsiteBackup({ backupName: req.params.backupName });
      await recordAudit(req, {
        action: 'backup.offsite_synced',
        targetType: 'backup',
        targetId: req.params.backupName,
        details: { key: sync.key || '' },
      });
      res.json({ sync });
    } catch (error) {
      await recordAudit(req, {
        action: 'backup.offsite_synced',
        outcome: 'failure',
        targetType: 'backup',
        targetId: req.params.backupName,
        details: { error: String(error.message || error).slice(0, 200) },
      });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/run', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const job = await backups.startBackup({ requestedBy: req.consoleUser?.username || 'admin' });
      await recordAudit(req, { action: 'backup.started', targetType: 'backup_job', targetId: job.id, details: { type: job.type } });
      res.status(202).json({ job });
    } catch (error) {
      await recordAudit(req, { action: 'backup.started', outcome: 'failure', targetType: 'backup', details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.get('/api/backups/jobs/:id', async (req, res, next) => {
    try {
      const job = await backups.getJob(req.params.id);
      await operations.observeBackupJob(job);
      res.json({ job });
    } catch (error) {
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.all('/api/backups/:backupName/download', requireConsoleRequest, requireBackupDownloadAccess, async (req, res, next) => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).set('Allow', 'POST').json({ error: '备份下载仅支持安全 POST 请求。', code: 'METHOD_NOT_ALLOWED' });
      }
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, {
          action: 'backup.download',
          outcome: 'failure',
          targetType: 'backup',
          targetId: req.params.backupName,
          details: { reason: 'reauthentication_failed' },
        });
        return res.status(403).json({ error: '管理员二次验证失败。', code: 'REAUTHENTICATION_FAILED' });
      }
      const download = await backups.downloadBackup({ backupName: req.params.backupName });
      await recordAudit(req, { action: 'backup.downloaded', targetType: 'backup', targetId: req.params.backupName });
      res.setHeader('Content-Type', download.contentType || 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName(download.filename)}"`);
      download.stream.once('error', next);
      download.stream.pipe(res);
    } catch (error) {
      await recordAudit(req, {
        action: 'backup.download',
        outcome: 'failure',
        targetType: 'backup',
        targetId: req.params.backupName,
        details: { reason: 'download_failed', error: String(error.message || error).slice(0, 200) },
      });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.delete('/api/backups/:backupName', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const result = await backups.deleteBackup({ backupName: req.params.backupName });
      await recordAudit(req, { action: 'backup.deleted', targetType: 'backup', targetId: req.params.backupName });
      res.json(result);
    } catch (error) {
      await recordAudit(req, { action: 'backup.deleted', outcome: 'failure', targetType: 'backup', targetId: req.params.backupName, details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/upload', requireConsoleRequest, requireRole('operator'), async (req, res, next) => {
    try {
      const filename = String(req.query.filename || req.get('X-Backup-Filename') || '');
      const contentLength = Number.parseInt(req.get('content-length') || '', 10);
      if (Number.isFinite(contentLength) && contentLength > config.backupUploadMaxBytes) {
        throw new BackupOperationError(413, 'BACKUP_UPLOAD_TOO_LARGE', 'The backup archive exceeds the configured upload limit.');
      }
      const result = await backups.uploadBackup({
        filename,
        stream: req,
        contentType: req.get('content-type') || 'application/gzip',
      });
      await recordAudit(req, { action: 'backup.uploaded', targetType: 'backup', targetId: filename });
      res.status(201).json(result);
    } catch (error) {
      await recordAudit(req, { action: 'backup.uploaded', outcome: 'failure', targetType: 'backup', details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
    }
  });

  app.post('/api/backups/restore', requireConsoleRequest, requireRole('super_admin'), async (req, res, next) => {
    try {
      const backupName = String(req.body?.backupName || '');
      const confirmText = String(req.body?.confirmText || '');
      if (!backupName) {
        return res.status(400).json({ error: '请选择要恢复的备份。', code: 'BACKUP_REQUIRED' });
      }
      if (confirmText !== config.restoreConfirmText) {
        return res.status(400).json({ error: '确认短语不正确。', code: 'RESTORE_CONFIRMATION_REQUIRED' });
      }
      if (!await verifyReauthentication(req)) {
        await recordAudit(req, { action: 'backup.restore', outcome: 'failure', targetType: 'backup', targetId: backupName, details: { reason: 'reauthentication_failed' } });
        return res.status(403).json({ error: '管理员二次验证失败，恢复已拒绝。', code: 'RESTORE_PASSWORD_INVALID' });
      }

      const job = await backups.startRestore({
        backupName,
        requestedBy: req.consoleUser?.username || 'admin',
      });
      await recordAudit(req, { action: 'backup.restore', targetType: 'backup_job', targetId: job.id, details: { backupName } });
      return res.status(202).json({ job });
    } catch (error) {
      await recordAudit(req, { action: 'backup.restore', outcome: 'failure', targetType: 'backup', targetId: String(req.body?.backupName || ''), details: { error: String(error.message || error).slice(0, 200) } });
      try {
        sendBackupError(res, error);
      } catch (unexpectedError) {
        next(unexpectedError);
      }
      return undefined;
    }
  });

}
