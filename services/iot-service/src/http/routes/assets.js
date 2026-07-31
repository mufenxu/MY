const crypto = require('crypto');

const ASSET_STATUSES = new Set(['inventory', 'active', 'maintenance', 'retired']);
const MAINTENANCE_TYPES = new Set(['inspection', 'repair', 'firmware', 'calibration', 'other']);
const TICKET_PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const MAX_LIST_LIMIT = 200;
const MAX_TIMESTAMP = Date.UTC(2100, 0, 1);

function createRouteError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.expose = true;
  return error;
}

function readValue(input, camelKey, snakeKey = camelKey) {
  if (Object.prototype.hasOwnProperty.call(input, camelKey)) return input[camelKey];
  return input[snakeKey];
}

function normalizeText(value, fieldName, maxLength, { required = false } = {}) {
  if (value == null) value = '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw createRouteError(400, 'INVALID_INPUT', `${fieldName} 必须是文本。`);
  }

  const normalized = String(value).trim();
  if (required && !normalized) {
    throw createRouteError(400, 'INVALID_INPUT', `${fieldName}不能为空。`);
  }
  if (normalized.length > maxLength) {
    throw createRouteError(400, 'INVALID_INPUT', `${fieldName}不能超过 ${maxLength} 个字符。`);
  }
  return normalized;
}

function normalizeEnum(value, allowed, fieldName, fallback) {
  const normalized = normalizeText(value == null ? fallback : value, fieldName, 40);
  if (!allowed.has(normalized)) {
    throw createRouteError(400, 'INVALID_INPUT', `${fieldName}取值无效。`);
  }
  return normalized;
}

function normalizeTimestamp(value, fieldName, fallback = null) {
  if (value == null || value === '') return fallback;
  const timestamp = typeof value === 'number' || /^\d+$/.test(String(value).trim())
    ? Number(value)
    : Date.parse(String(value));
  if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > MAX_TIMESTAMP) {
    throw createRouteError(400, 'INVALID_INPUT', `${fieldName}不是有效时间。`);
  }
  return Math.trunc(timestamp);
}

function normalizeDeviceId(value) {
  const deviceId = normalizeText(value, '设备 ID', 128, { required: true });
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(deviceId)) {
    throw createRouteError(400, 'INVALID_DEVICE_ID', '设备 ID 格式无效。');
  }
  return deviceId;
}

function normalizeRecordId(value, label) {
  const id = normalizeText(value, label, 128, { required: true });
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) {
    throw createRouteError(400, 'INVALID_RECORD_ID', `${label}格式无效。`);
  }
  return id;
}

function normalizeLimit(value, fallback = 50) {
  const parsed = Number.parseInt(value == null ? String(fallback) : String(value), 10);
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Number.isFinite(parsed) ? parsed : fallback));
}

function normalizeAsset(input = {}) {
  return {
    location: normalizeText(readValue(input, 'location'), '位置', 120),
    purpose: normalizeText(readValue(input, 'purpose'), '用途', 500),
    owner: normalizeText(readValue(input, 'owner'), '负责人', 80),
    firmware_version: normalizeText(readValue(input, 'firmwareVersion', 'firmware_version'), '固件版本', 80),
    installed_at: normalizeTimestamp(readValue(input, 'installedAt', 'installed_at'), '安装日期'),
    warranty_expires_at: normalizeTimestamp(
      readValue(input, 'warrantyExpiresAt', 'warranty_expires_at'),
      '保修到期日'
    ),
    status: normalizeEnum(readValue(input, 'status'), ASSET_STATUSES, '资产状态', 'active')
  };
}

function normalizeMaintenance(input = {}, existing = null) {
  const source = existing ? { ...existing, ...input } : input;
  return {
    title: normalizeText(readValue(source, 'title'), '维护主题', 120, { required: true }),
    type: normalizeEnum(readValue(source, 'type'), MAINTENANCE_TYPES, '维护类型', 'inspection'),
    description: normalizeText(readValue(source, 'description'), '维护说明', 2000),
    performed_by: normalizeText(readValue(source, 'performedBy', 'performed_by'), '执行人', 80),
    performed_at: normalizeTimestamp(
      readValue(source, 'performedAt', 'performed_at'),
      '执行时间',
      Date.now()
    ),
    next_due_at: normalizeTimestamp(readValue(source, 'nextDueAt', 'next_due_at'), '下次维护时间')
  };
}

function normalizeTicket(input = {}, existing = null) {
  const source = existing ? { ...existing, ...input } : input;
  return {
    title: normalizeText(readValue(source, 'title'), '工单主题', 120, { required: true }),
    description: normalizeText(readValue(source, 'description'), '故障描述', 4000, { required: true }),
    status: normalizeEnum(readValue(source, 'status'), TICKET_STATUSES, '工单状态', 'open'),
    priority: normalizeEnum(readValue(source, 'priority'), TICKET_PRIORITIES, '工单优先级', 'medium'),
    assignee: normalizeText(readValue(source, 'assignee'), '处理人', 80),
    occurred_at: normalizeTimestamp(
      readValue(source, 'occurredAt', 'occurred_at'),
      '故障时间',
      Date.now()
    )
  };
}

function serializeAsset(asset) {
  if (!asset) return null;
  return {
    deviceId: asset.device_id,
    location: asset.location || '',
    purpose: asset.purpose || '',
    owner: asset.owner || '',
    firmwareVersion: asset.firmware_version || '',
    installedAt: asset.installed_at || null,
    warrantyExpiresAt: asset.warranty_expires_at || null,
    status: asset.status || 'active',
    createdAt: asset.created_at || null,
    updatedAt: asset.updated_at || null
  };
}

function serializeMaintenance(record) {
  return {
    id: record.id,
    deviceId: record.device_id,
    title: record.title,
    type: record.type,
    description: record.description || '',
    performedBy: record.performed_by || '',
    performedAt: record.performed_at,
    nextDueAt: record.next_due_at || null,
    createdBy: record.created_by || '',
    updatedBy: record.updated_by || '',
    createdAt: record.created_at,
    updatedAt: record.updated_at
  };
}

function serializeTicket(ticket) {
  return {
    id: ticket.id,
    deviceId: ticket.device_id,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    assignee: ticket.assignee || '',
    occurredAt: ticket.occurred_at,
    resolvedAt: ticket.resolved_at || null,
    createdBy: ticket.created_by || '',
    updatedBy: ticket.updated_by || '',
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at
  };
}

async function ensureDevice(db, deviceId) {
  const device = await db.getDevice(deviceId);
  if (!device) {
    throw createRouteError(404, 'DEVICE_NOT_FOUND', '设备不存在或尚未同步到资产中心。');
  }
  return device;
}

function registerAssetRoutes(app, { db, requireAssetRead, requireAssetWrite }) {
  app.get('/api/assets', requireAssetRead, async (req, res, next) => {
    try {
      const assets = await db.listDeviceAssets();
      res.json(assets.map(serializeAsset));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/devices/:deviceId/asset', requireAssetRead, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      res.json(serializeAsset(await db.getDeviceAsset(deviceId)));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/devices/:deviceId/asset', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const asset = await db.saveDeviceAsset(deviceId, normalizeAsset(req.body || {}));
      res.json(serializeAsset(asset));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/devices/:deviceId/asset', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const deleted = await db.deleteDeviceAsset(deviceId);
      if (!deleted) throw createRouteError(404, 'ASSET_NOT_FOUND', '该设备尚未建立资产资料。');
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/devices/:deviceId/maintenance', requireAssetRead, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const records = await db.listMaintenanceRecords(deviceId, normalizeLimit(req.query.limit));
      res.json(records.map(serializeMaintenance));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/devices/:deviceId/maintenance', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const now = Date.now();
      const actor = normalizeText(req.auth?.username || 'web_ui', '操作人', 120);
      const record = await db.createMaintenanceRecord({
        id: `maint_${crypto.randomUUID()}`,
        device_id: deviceId,
        ...normalizeMaintenance(req.body || {}),
        created_by: actor,
        updated_by: actor,
        created_at: now,
        updated_at: now
      });
      res.status(201).json(serializeMaintenance(record));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/devices/:deviceId/maintenance/:recordId', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const recordId = normalizeRecordId(req.params.recordId, '维护记录 ID');
      await ensureDevice(db, deviceId);
      const existing = await db.getMaintenanceRecord(deviceId, recordId);
      if (!existing) throw createRouteError(404, 'MAINTENANCE_NOT_FOUND', '维护记录不存在。');
      const record = await db.updateMaintenanceRecord(deviceId, recordId, {
        ...normalizeMaintenance(req.body || {}, existing),
        updated_by: normalizeText(req.auth?.username || 'web_ui', '操作人', 120),
        updated_at: Date.now()
      });
      res.json(serializeMaintenance(record));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/devices/:deviceId/maintenance/:recordId', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const recordId = normalizeRecordId(req.params.recordId, '维护记录 ID');
      await ensureDevice(db, deviceId);
      if (!await db.deleteMaintenanceRecord(deviceId, recordId)) {
        throw createRouteError(404, 'MAINTENANCE_NOT_FOUND', '维护记录不存在。');
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/devices/:deviceId/tickets', requireAssetRead, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const status = req.query.status == null || req.query.status === ''
        ? null
        : normalizeEnum(req.query.status, TICKET_STATUSES, '工单状态');
      const tickets = await db.listFaultTickets(deviceId, {
        limit: normalizeLimit(req.query.limit),
        status
      });
      res.json(tickets.map(serializeTicket));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/devices/:deviceId/tickets', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      await ensureDevice(db, deviceId);
      const now = Date.now();
      const actor = normalizeText(req.auth?.username || 'web_ui', '操作人', 120);
      const normalized = normalizeTicket(req.body || {});
      const ticket = await db.createFaultTicket({
        id: `ticket_${crypto.randomUUID()}`,
        device_id: deviceId,
        ...normalized,
        resolved_at: ['resolved', 'closed'].includes(normalized.status) ? now : null,
        created_by: actor,
        updated_by: actor,
        created_at: now,
        updated_at: now
      });
      res.status(201).json(serializeTicket(ticket));
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/devices/:deviceId/tickets/:ticketId', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const ticketId = normalizeRecordId(req.params.ticketId, '故障工单 ID');
      await ensureDevice(db, deviceId);
      const existing = await db.getFaultTicket(deviceId, ticketId);
      if (!existing) throw createRouteError(404, 'TICKET_NOT_FOUND', '故障工单不存在。');
      const normalized = normalizeTicket(req.body || {}, existing);
      const resolvedAt = ['resolved', 'closed'].includes(normalized.status)
        ? existing.resolved_at || Date.now()
        : null;
      const ticket = await db.updateFaultTicket(deviceId, ticketId, {
        ...normalized,
        resolved_at: resolvedAt,
        updated_by: normalizeText(req.auth?.username || 'web_ui', '操作人', 120),
        updated_at: Date.now()
      });
      res.json(serializeTicket(ticket));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/devices/:deviceId/tickets/:ticketId/status', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const ticketId = normalizeRecordId(req.params.ticketId, '故障工单 ID');
      await ensureDevice(db, deviceId);
      const existing = await db.getFaultTicket(deviceId, ticketId);
      if (!existing) throw createRouteError(404, 'TICKET_NOT_FOUND', '故障工单不存在。');
      const status = normalizeEnum(readValue(req.body || {}, 'status'), TICKET_STATUSES, '工单状态');
      const updates = {
        status,
        resolved_at: ['resolved', 'closed'].includes(status) ? existing.resolved_at || Date.now() : null,
        updated_by: normalizeText(req.auth?.username || 'web_ui', '操作人', 120),
        updated_at: Date.now()
      };
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'assignee')) {
        updates.assignee = normalizeText(req.body.assignee, '处理人', 80);
      }
      res.json(serializeTicket(await db.updateFaultTicket(deviceId, ticketId, updates)));
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/devices/:deviceId/tickets/:ticketId', requireAssetWrite, async (req, res, next) => {
    try {
      const deviceId = normalizeDeviceId(req.params.deviceId);
      const ticketId = normalizeRecordId(req.params.ticketId, '故障工单 ID');
      await ensureDevice(db, deviceId);
      if (!await db.deleteFaultTicket(deviceId, ticketId)) {
        throw createRouteError(404, 'TICKET_NOT_FOUND', '故障工单不存在。');
      }
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  ASSET_STATUSES,
  MAINTENANCE_TYPES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  normalizeAsset,
  normalizeDeviceId,
  normalizeLimit,
  normalizeMaintenance,
  normalizeTicket,
  registerAssetRoutes
};
