const TODO_STORAGE_PREFIX = 'todo_list_v2'
const TODO_OUTBOX_PREFIX = 'todo_outbox_v2'
const LEGACY_STORAGE_KEY = 'todo_list_v1'
const LEGACY_OUTBOX_KEY = 'todo_outbox_v1'
const LEGACY_MIGRATION_OWNER_KEY = 'todo_storage_migration_owner_v2'
const app = getApp()
const constants = require('../../utils/constants')
const storage = require('../../utils/storage')
const request = require('../../utils/request').default
const { ensureAuthorized } = require('../../utils/auth')
const PRIORITY_OPTIONS = [
  { label: '低优先级', value: 'low' },
  { label: '普通', value: 'normal' },
  { label: '高优先级', value: 'high' },
]
const RECURRENCE_OPTIONS = [
  { label: '不重复', value: 'none' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
  { label: '每月', value: 'monthly' },
]
const PRIORITY_VALUES = new Set(PRIORITY_OPTIONS.map((item) => item.value))
const RECURRENCE_VALUES = new Set(RECURRENCE_OPTIONS.map((item) => item.value))

function currentTodoStorageScope() {
  try {
    const user = wx.getStorageSync('user') || {}
    const rawId = user._id || user.userId || user.id || user.openid || ''
    const normalized = String(rawId).trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 160)
    return normalized || 'anonymous'
  } catch (_) {
    return 'anonymous'
  }
}

function todoStorageKeys(scope = currentTodoStorageScope()) {
  return {
    scope,
    tasks: `${TODO_STORAGE_PREFIX}:${scope}`,
    outbox: `${TODO_OUTBOX_PREFIX}:${scope}`,
  }
}

function migrateLegacyTodoStorage(keys) {
  if (keys.scope === 'anonymous') return
  try {
    const migrationOwner = String(wx.getStorageSync(LEGACY_MIGRATION_OWNER_KEY) || '')
    const legacyTasks = wx.getStorageSync(LEGACY_STORAGE_KEY)
    const legacyOutbox = wx.getStorageSync(LEGACY_OUTBOX_KEY)

    if (!migrationOwner) {
      if (!wx.getStorageSync(keys.tasks) && Array.isArray(legacyTasks)) {
        wx.setStorageSync(keys.tasks, legacyTasks)
      }
      if (!wx.getStorageSync(keys.outbox) && legacyOutbox && Array.isArray(legacyOutbox.operations)) {
        wx.setStorageSync(keys.outbox, legacyOutbox)
      }
      wx.setStorageSync(LEGACY_MIGRATION_OWNER_KEY, keys.scope)
    }

    // Legacy keys have no owner metadata. Remove them after the one-time migration
    // so a later account can never inherit another user's local data or mutations.
    wx.removeStorageSync(LEGACY_STORAGE_KEY)
    wx.removeStorageSync(LEGACY_OUTBOX_KEY)
  } catch (err) {
    console.warn('Migrating legacy todo storage failed', err)
  }
}

function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return []
  const now = Date.now()
  const result = []
  for (let index = 0; index < raw.length; index++) {
    const item = raw[index] || {}
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!title) continue
    const completed = Boolean(item.completed)
    let id = ''
    if (item.id !== undefined && item.id !== null) {
      id = String(item.id)
    }
    if (!id) {
      id = `${now}-${index}-${Math.random().toString(16).slice(2, 8)}`
    }
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : now + index
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : createdAt
    const dueAt = normalizeOptionalLocalTimestamp(item.dueAt)
    const reminderAt = normalizeOptionalLocalTimestamp(item.reminderAt)
    const priority = PRIORITY_VALUES.has(item.priority) ? item.priority : 'normal'
    const recurrence = RECURRENCE_VALUES.has(item.recurrence) ? item.recurrence : 'none'
    const rawCourse = item.courseRef || {}
    const courseRef = typeof rawCourse === 'string'
      ? { id: '', name: rawCourse.trim().slice(0, 100) }
      : {
          id: String(rawCourse.id || '').trim().slice(0, 128),
          name: String(rawCourse.name || '').trim().slice(0, 100),
        }
    result.push({
      id,
      title,
      completed,
      dueAt,
      priority,
      recurrence,
      courseRef,
      reminderAt,
      reminderStatus: completed
        ? 'dismissed'
        : (['pending', 'sent', 'dismissed'].includes(item.reminderStatus) ? item.reminderStatus : 'pending'),
      remindedAt: normalizeOptionalLocalTimestamp(item.remindedAt),
      createdAt,
      updatedAt,
    })
  }
  return result.sort((a, b) => a.createdAt - b.createdAt)
}

function normalizeOptionalLocalTimestamp(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function sanitizeTasksForStorage(tasks) {
  const list = []
  for (let i = 0; i < tasks.length; i++) {
    const item = tasks[i]
    if (!item) continue
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    if (!title) continue
    const normalized = {
      id: String(item.id || `${Date.now()}-${i}`),
      title,
      completed: Boolean(item.completed),
      dueAt: normalizeOptionalLocalTimestamp(item.dueAt),
      priority: PRIORITY_VALUES.has(item.priority) ? item.priority : 'normal',
      recurrence: RECURRENCE_VALUES.has(item.recurrence) ? item.recurrence : 'none',
      courseRef: {
        id: String(item.courseRef && item.courseRef.id || '').trim().slice(0, 128),
        name: String(item.courseRef && item.courseRef.name || '').trim().slice(0, 100),
      },
      reminderAt: normalizeOptionalLocalTimestamp(item.reminderAt),
      reminderStatus: item.completed
        ? 'dismissed'
        : (['pending', 'sent', 'dismissed'].includes(item.reminderStatus) ? item.reminderStatus : 'pending'),
      remindedAt: normalizeOptionalLocalTimestamp(item.remindedAt),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }
    list.push(normalized)
  }
  return list
}

function buildTodoOperations(previousTasks, nextTasks) {
  const previous = new Map(sanitizeTasksForStorage(previousTasks).map((task) => [task.id, task]))
  const next = new Map(sanitizeTasksForStorage(nextTasks).map((task) => [task.id, task]))
  const operations = []

  previous.forEach((_task, id) => {
    if (!next.has(id)) operations.push({ type: 'delete', id })
  })
  next.forEach((task, id) => {
    const oldTask = previous.get(id)
    if (!oldTask || JSON.stringify(oldTask) !== JSON.stringify(task)) {
      operations.push({ type: 'upsert', task })
    }
  })
  return operations
}

function compactOperations(operations) {
  const latestById = new Map()
  for (const operation of operations || []) {
    const id = operation && operation.type === 'upsert'
      ? String(operation.task && operation.task.id || '')
      : String(operation && operation.id || '')
    if (!id) continue
    if (operation.type === 'delete') {
      latestById.set(id, { type: 'delete', id })
    } else if (operation.type === 'upsert') {
      const task = sanitizeTasksForStorage([operation.task])[0]
      if (task) latestById.set(id, { type: 'upsert', task })
    }
  }
  return Array.from(latestById.values())
}

function operationId(operation) {
  return operation && operation.type === 'upsert'
    ? String(operation.task && operation.task.id || '')
    : String(operation && operation.id || '')
}

function removeAcknowledgedOperations(pending, acknowledged) {
  const acknowledgedById = new Map()
  for (const operation of acknowledged || []) {
    const id = operationId(operation)
    if (id) acknowledgedById.set(id, JSON.stringify(operation))
  }
  return compactOperations(pending).filter((operation) => {
    const id = operationId(operation)
    return !acknowledgedById.has(id)
      || acknowledgedById.get(id) !== JSON.stringify(operation)
  })
}

function applyTodoOperations(tasks, operations) {
  const taskMap = new Map(sanitizeTasksForStorage(tasks).map((task) => [task.id, task]))
  for (const operation of operations || []) {
    if (operation.type === 'delete') taskMap.delete(String(operation.id))
    if (operation.type === 'upsert' && operation.task) {
      const task = sanitizeTasksForStorage([operation.task])[0]
      if (task) taskMap.set(task.id, task)
    }
  }
  return Array.from(taskMap.values()).sort((a, b) => a.createdAt - b.createdAt)
}

function formatTimestamp(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return ''
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${hh}:${mm}`
}

function dateTimeParts(timestamp) {
  if (!timestamp) return { date: '', time: '' }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return { date: '', time: '' }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}` }
}

function timestampFromParts(date, time, defaultTime) {
  if (!date) return null
  const value = new Date(`${date}T${time || defaultTime}:00`).getTime()
  return Number.isFinite(value) ? value : null
}

function nextRecurringTimestamp(timestamp, recurrence) {
  if (!timestamp || recurrence === 'none') return null
  const date = new Date(timestamp)
  if (recurrence === 'daily') date.setDate(date.getDate() + 1)
  if (recurrence === 'weekly') date.setDate(date.getDate() + 7)
  if (recurrence === 'monthly') date.setMonth(date.getMonth() + 1)
  return date.getTime()
}

const pageOptions = {
  _cloudRevision: 0,
  _pendingOperations: [],
  _storageKeys: null,
  _storageScope: '',
  _scopeGeneration: 0,
  _syncInFlight: false,
  _syncInFlightGeneration: -1,
  _outboxLoaded: false,
  _syncRetryTimer: null,
  _syncRetryDelay: 5000,
  data: {
    inputValue: '',
    tasks: [],
    filteredTasks: [],
    filter: 'all',
    completedCount: 0,
    activeCount: 0,
    dueCount: 0,
    canSubmit: false,
    isLoading: true,
    syncing: false,
    syncError: '',
    showEditor: false,
    editorValue: '',
    editorCanSubmit: false,
    editingTaskId: '',
    editorDueDate: '',
    editorDueTime: '23:59',
    editorReminderDate: '',
    editorReminderTime: '09:00',
    editorCourseName: '',
    editorPriorityIndex: 1,
    editorRecurrenceIndex: 0,
    priorityOptions: PRIORITY_OPTIONS,
    recurrenceOptions: RECURRENCE_OPTIONS,
  },

  async onLoad() {
    // onShow 会处理初始化
  },

  async onShow() {
    await this.initialize(false)
  },

  onHide() {
    if (this._syncRetryTimer) {
      clearTimeout(this._syncRetryTimer)
      this._syncRetryTimer = null
    }
  },

  onUnload() {
    if (this._syncRetryTimer) clearTimeout(this._syncRetryTimer)
  },

  async onPullDownRefresh() {
    await this.initialize(true)
    wx.stopPullDownRefresh()
  },

  async initialize(showLoading = true) {
    if (showLoading) {
      this.setData({ isLoading: true })
    }

    // 确保已登录
    try {
      await ensureAuthorized()
    } catch (e) {
      console.error('Todo initialize auth failed', e)
      // 即使登录失败，也尝试加载本地数据
    }

    this.prepareStorageScope()
    const context = this.captureStorageContext()
    this.loadOutbox(context)
    const localTasks = this.loadLocalTasks(context)
    this.updateState(localTasks, this.data.filter)
    const cloudSnapshot = await this.fetchCloudTasks(context)
    if (!this.isStorageContextCurrent(context)) return
    if (cloudSnapshot) {
      this._cloudRevision = cloudSnapshot.revision
      const mergedTasks = applyTodoOperations(cloudSnapshot.tasks, this._pendingOperations)
      this.updateState(mergedTasks, this.data.filter)
      this.saveLocalTasks(mergedTasks, context)
      if (this._pendingOperations.length > 0) this.drainSyncQueue()
    }
    this.setData({ isLoading: false })
  },

  prepareStorageScope() {
    const keys = todoStorageKeys()
    if (this._storageScope === keys.scope) return
    if (this._syncRetryTimer) {
      clearTimeout(this._syncRetryTimer)
      this._syncRetryTimer = null
    }
    this._scopeGeneration += 1
    this._storageScope = keys.scope
    this._storageKeys = keys
    this._cloudRevision = 0
    this._pendingOperations = []
    this._outboxLoaded = false
    this._syncRetryDelay = 5000
    migrateLegacyTodoStorage(keys)
  },

  captureStorageContext() {
    return {
      scope: this._storageScope,
      generation: this._scopeGeneration,
      keys: this._storageKeys,
    }
  },

  isStorageContextCurrent(context) {
    return Boolean(context)
      && context.scope === this._storageScope
      && context.generation === this._scopeGeneration
      && context.keys === this._storageKeys
  },

  loadLocalTasks(context = this.captureStorageContext()) {
    try {
      if (!this.isStorageContextCurrent(context)) return []
      const stored = wx.getStorageSync(context.keys.tasks)
      return normalizeTasks(stored)
    } catch (err) {
      console.warn('读取本地待办失败', err)
      return []
    }
  },

  saveLocalTasks(tasks, context = this.captureStorageContext()) {
    try {
      if (!this.isStorageContextCurrent(context)) return
      wx.setStorageSync(context.keys.tasks, sanitizeTasksForStorage(tasks))
    } catch (err) {
      console.warn('保存本地待办失败', err)
    }
  },

  loadOutbox(context = this.captureStorageContext()) {
    if (this._outboxLoaded) return
    if (!this.isStorageContextCurrent(context)) return
    this._outboxLoaded = true
    try {
      const stored = wx.getStorageSync(context.keys.outbox)
      this._pendingOperations = compactOperations(stored && stored.operations)
    } catch (err) {
      console.warn('读取待办同步队列失败', err)
      this._pendingOperations = []
    }
  },

  saveOutbox(context = this.captureStorageContext()) {
    if (!this.isStorageContextCurrent(context)) return
    this._pendingOperations = compactOperations(this._pendingOperations)
    try {
      if (this._pendingOperations.length > 0) {
        wx.setStorageSync(context.keys.outbox, { operations: this._pendingOperations })
      } else {
        wx.removeStorageSync(context.keys.outbox)
      }
    } catch (err) {
      console.warn('保存待办同步队列失败', err)
    }
  },

  async fetchCloudTasks(context = this.captureStorageContext()) {
    try {
      const res = await request('/todos')
      if (!this.isStorageContextCurrent(context)) return null
      if (res.success && Array.isArray(res.data)) {
        return {
          tasks: normalizeTasks(res.data),
          revision: Number.isSafeInteger(res.revision) ? res.revision : 0,
        }
      }
      return null
    } catch (err) {
      if (!this.isStorageContextCurrent(context)) return null
      console.warn('云端待办读取失败', err)
      this.setData({ syncError: '云端同步失败' })
      return null
    }
  },

  enqueueOperations(operations) {
    if (!operations.length) return
    this._pendingOperations = compactOperations([...this._pendingOperations, ...operations])
    this.saveOutbox()
    this.drainSyncQueue()
  },

  scheduleSyncRetry(context = this.captureStorageContext()) {
    if (!this.isStorageContextCurrent(context)) return
    if (this._syncRetryTimer || this._pendingOperations.length === 0) return
    const delay = this._syncRetryDelay
    this._syncRetryDelay = Math.min(this._syncRetryDelay * 2, 60000)
    this._syncRetryTimer = setTimeout(() => {
      this._syncRetryTimer = null
      if (this.isStorageContextCurrent(context)) this.drainSyncQueue()
    }, delay)
  },

  async drainSyncQueue() {
    const context = this.captureStorageContext()
    if (!context.keys || this._pendingOperations.length === 0) return
    if (this._syncInFlight && this._syncInFlightGeneration === context.generation) return
    this._syncInFlight = true
    this._syncInFlightGeneration = context.generation
    this.setData({ syncing: true })
    let conflicts = 0

    try {
      while (this.isStorageContextCurrent(context) && this._pendingOperations.length > 0) {
        // Keep the in-flight batch durable until the server acknowledges it.
        const batch = this._pendingOperations.slice(0, 100)
        try {
          const res = await request('/todos/mutations', 'POST', {
            revision: this._cloudRevision,
            operations: batch,
            ownerName: storage.getNickName() || '',
          })
          if (!this.isStorageContextCurrent(context)) return
          if (!res || !res.success) throw res || new Error('Sync failed')
          this._cloudRevision = Number.isSafeInteger(res.revision)
            ? res.revision
            : this._cloudRevision + 1
          this._pendingOperations = removeAcknowledgedOperations(this._pendingOperations, batch)
          this.saveOutbox(context)
          conflicts = 0
          this._syncRetryDelay = 5000
          if (this._pendingOperations.length === 0 && Array.isArray(res.data)) {
            const tasks = normalizeTasks(res.data)
            this.saveLocalTasks(tasks, context)
            this.updateState(tasks, this.data.filter)
          }
          this.setData({ syncError: '' })
        } catch (err) {
          if (!this.isStorageContextCurrent(context)) return
          if (err && err.code === 'TODO_REVISION_CONFLICT' && err.data) {
            conflicts += 1
            this._cloudRevision = Number.isSafeInteger(err.data.revision) ? err.data.revision : 0
            const remoteTasks = normalizeTasks(err.data.tasks)
            const mergedTasks = applyTodoOperations(
              remoteTasks,
              this._pendingOperations
            )
            this.saveLocalTasks(mergedTasks, context)
            this.updateState(mergedTasks, this.data.filter)
            this.saveOutbox(context)
            if (conflicts < 3) continue
          }
          console.warn('云端待办保存失败', err)
          this.setData({ syncError: '云端同步失败，稍后自动重试' })
          this.scheduleSyncRetry(context)
          break
        }
      }
    } finally {
      if (this._syncInFlightGeneration === context.generation) {
        this._syncInFlight = false
        this._syncInFlightGeneration = -1
        if (this.isStorageContextCurrent(context)) this.setData({ syncing: false })
      }
    }
  },

  onInputChange(e) {
    const value = (e && e.detail && e.detail.value ? e.detail.value : '').toString()
    this.setData({ inputValue: value, canSubmit: value.trim().length > 0 })
  },

  async onAddTask() {
    const text = this.data.inputValue.trim()
    this.openEditor('', text)
    this.setData({ inputValue: '', canSubmit: false })
  },

  onToggleTask(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id ? e.currentTarget.dataset.id : '').toString()
    if (!id) return
    const nextTasks = []
    this.data.tasks.forEach((item) => {
      if (!item || !item.id) return item
      if (String(item.id) === id) {
        const completed = !item.completed
        nextTasks.push(Object.assign({}, item, {
          completed,
          reminderStatus: completed ? 'dismissed' : 'pending',
          remindedAt: completed ? item.remindedAt : null,
          updatedAt: Date.now(),
        }))
        if (completed && item.recurrence !== 'none' && item.dueAt) {
          const nextDueAt = nextRecurringTimestamp(item.dueAt, item.recurrence)
          const nextReminderAt = item.reminderAt
            ? nextRecurringTimestamp(item.reminderAt, item.recurrence)
            : null
          nextTasks.push(Object.assign({}, item, {
            id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
            completed: false,
            dueAt: nextDueAt,
            reminderAt: nextReminderAt,
            reminderStatus: 'pending',
            remindedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }))
        }
        return
      }
      nextTasks.push(item)
    })
    this.persist(nextTasks)
  },

  onDeleteTask(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id ? e.currentTarget.dataset.id : '').toString()
    if (!id) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，是否继续？',
      cancelText: '取消',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res && res.confirm) {
          const tasks = this.data.tasks.filter((item) => String(item.id) !== id)
          this.persist(tasks)
        }
      },
    })
  },

  onEditTask(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id ? e.currentTarget.dataset.id : '').toString()
    if (!id) return
    const target = this.data.tasks.find((item) => String(item.id) === id)
    if (!target) return
    this.openEditor(id, target.title, target)
  },

  openEditor(id, text = '', task = {}) {
    const due = dateTimeParts(task.dueAt)
    const reminder = dateTimeParts(task.reminderAt)
    const priorityIndex = Math.max(0, PRIORITY_OPTIONS.findIndex((item) => item.value === task.priority))
    const recurrenceIndex = Math.max(0, RECURRENCE_OPTIONS.findIndex((item) => item.value === task.recurrence))
    this.setData({
      showEditor: true,
      editorValue: text,
      editorCanSubmit: !!text.trim(),
      editingTaskId: id || '',
      editorDueDate: due.date,
      editorDueTime: due.time || '23:59',
      editorReminderDate: reminder.date,
      editorReminderTime: reminder.time || '09:00',
      editorCourseName: task.courseRef && task.courseRef.name || '',
      editorPriorityIndex: priorityIndex,
      editorRecurrenceIndex: recurrenceIndex,
    })
  },

  onCloseEditor() {
    this.setData({
      showEditor: false,
      editorValue: '',
      editorCanSubmit: false,
      editingTaskId: '',
      editorDueDate: '',
      editorDueTime: '23:59',
      editorReminderDate: '',
      editorReminderTime: '09:00',
      editorCourseName: '',
      editorPriorityIndex: 1,
      editorRecurrenceIndex: 0,
    })
  },

  onEditorInput(e) {
    const value = (e && e.detail && e.detail.value ? e.detail.value : '').toString()
    this.setData({
      editorValue: value,
      editorCanSubmit: value.trim().length > 0,
    })
  },

  onEditorFieldInput(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ [field]: String(e.detail.value || '') })
  },

  onEditorPickerChange(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ [field]: Number(e.detail.value) })
  },

  onEditorDateChange(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ [field]: e.detail.value })
  },

  clearEditorDate(e) {
    const field = e.currentTarget.dataset.field
    if (!field) return
    this.setData({ [field]: '' })
  },

  onSubmitEditor() {
    const text = this.data.editorValue.trim()
    if (!text) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' })
      return
    }
    const editingId = this.data.editingTaskId
    const dueAt = timestampFromParts(this.data.editorDueDate, this.data.editorDueTime, '23:59')
    const reminderAt = timestampFromParts(this.data.editorReminderDate, this.data.editorReminderTime, '09:00')
    if (dueAt && reminderAt && reminderAt > dueAt) {
      wx.showToast({ title: '提醒时间不能晚于截止时间', icon: 'none' })
      return
    }
    const priority = PRIORITY_OPTIONS[this.data.editorPriorityIndex]?.value || 'normal'
    const recurrence = RECURRENCE_OPTIONS[this.data.editorRecurrenceIndex]?.value || 'none'
    const courseRef = { id: '', name: this.data.editorCourseName.trim().slice(0, 100) }
    let tasks = []
    if (editingId) {
      tasks = this.data.tasks.map((item) => {
        if (String(item.id) === editingId) {
          const reminderChanged = item.dueAt !== dueAt || item.reminderAt !== reminderAt
          return Object.assign({}, item, {
            title: text,
            dueAt,
            reminderAt,
            priority,
            recurrence,
            courseRef,
            reminderStatus: reminderChanged && !item.completed ? 'pending' : item.reminderStatus,
            remindedAt: reminderChanged ? null : item.remindedAt,
            updatedAt: Date.now(),
          })
        }
        return item
      })
    } else {
      const newTask = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        title: text,
        completed: false,
        dueAt,
        priority,
        recurrence,
        courseRef,
        reminderAt,
        reminderStatus: 'pending',
        remindedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      tasks = [...this.data.tasks, newTask]
    }
    this.persist(tasks)
    this.onCloseEditor()
  },

  onFilterChange(e) {
    const filter = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.filter ? e.currentTarget.dataset.filter : '').toString()
    if (!filter || filter === this.data.filter) return
    this.updateState(this.data.tasks, filter)
  },

  onClearCompleted() {
    const tasks = this.data.tasks.filter((item) => !item.completed)
    this.persist(tasks)
  },

  persist(tasks) {
    if (currentTodoStorageScope() !== this._storageScope) {
      this.initialize(true)
      return
    }
    const operations = buildTodoOperations(this.data.tasks, tasks)
    const sanitized = sanitizeTasksForStorage(tasks)
    this.saveLocalTasks(sanitized)
    this.updateState(sanitized, this.data.filter)
    this.enqueueOperations(operations)
  },

  updateState(tasks, filter) {
    const nowTs = Date.now()
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)
    const priorityRank = { high: 0, normal: 1, low: 2 }
    const enriched = tasks.map((item) => {
      const text = formatTimestamp(item.createdAt)
      const dueText = item.dueAt ? formatTimestamp(item.dueAt) : ''
      const reminderText = item.reminderAt ? formatTimestamp(item.reminderAt) : ''
      return Object.assign({}, item, {
        _createdText: text,
        _dueText: dueText,
        _reminderText: reminderText,
        _priorityText: PRIORITY_OPTIONS.find((option) => option.value === item.priority)?.label || '普通',
        _recurrenceText: RECURRENCE_OPTIONS.find((option) => option.value === item.recurrence)?.label || '',
        _overdue: !item.completed && item.dueAt && item.dueAt < nowTs,
      })
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1
      const priorityDiff = (priorityRank[a.priority] || 1) - (priorityRank[b.priority] || 1)
      if (priorityDiff) return priorityDiff
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt
      if (a.dueAt) return -1
      if (b.dueAt) return 1
      return a.createdAt - b.createdAt
    })
    const completedCount = tasks.filter((item) => item.completed).length
    const activeCount = tasks.length - completedCount
    const dueCount = tasks.filter((item) => !item.completed && item.dueAt && item.dueAt <= todayEnd.getTime()).length
    let filteredTasks = enriched
    if (filter === 'active') {
      filteredTasks = enriched.filter((item) => !item.completed)
    } else if (filter === 'completed') {
      filteredTasks = enriched.filter((item) => item.completed)
    } else if (filter === 'due') {
      filteredTasks = enriched.filter((item) => !item.completed && item.dueAt && item.dueAt <= todayEnd.getTime())
    }

    // 计算进度百分比
    const total = tasks.length
    const progressPercent = total > 0 ? Math.round((completedCount / total) * 100) : 0

    // 获取今日日期
    const now = new Date()
    const todayDate = `${now.getMonth() + 1}月${now.getDate()}日`

    this.setData({
      tasks: enriched,
      filter,
      filteredTasks,
      completedCount,
      activeCount,
      dueCount,
      progressPercent,
      todayDate
    })
  },
}

Page(pageOptions)
