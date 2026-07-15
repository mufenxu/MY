const STORAGE_KEY = 'todo_list_v1'
const app = getApp()
const constants = require('../../utils/constants')
const storage = require('../../utils/storage')
const request = require('../../utils/request').default
const { ensureAuthorized } = require('../../utils/auth')

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
    result.push({ id, title, completed, createdAt, updatedAt })
  }
  return result.sort((a, b) => a.createdAt - b.createdAt)
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
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    }
    list.push(normalized)
  }
  return list
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

const pageOptions = {
  data: {
    inputValue: '',
    tasks: [],
    filteredTasks: [],
    filter: 'all',
    completedCount: 0,
    activeCount: 0,
    canSubmit: false,
    isLoading: true,
    syncing: false,
    syncError: '',
    showEditor: false,
    editorValue: '',
    editorCanSubmit: false,
    editingTaskId: '',
  },

  async onLoad() {
    // onShow 会处理初始化
  },

  async onShow() {
    await this.initialize(false)
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

    const localTasks = this.loadLocalTasks()
    this.updateState(localTasks, this.data.filter)
    const cloudTasks = await this.fetchCloudTasks()
    if (cloudTasks) {
      this.updateState(cloudTasks, this.data.filter)
      this.saveLocalTasks(cloudTasks)
    }
    this.setData({ isLoading: false })
  },

  loadLocalTasks() {
    try {
      const stored = wx.getStorageSync(STORAGE_KEY)
      return normalizeTasks(stored)
    } catch (err) {
      console.warn('读取本地待办失败', err)
      return []
    }
  },

  saveLocalTasks(tasks) {
    try {
      wx.setStorageSync(STORAGE_KEY, sanitizeTasksForStorage(tasks))
    } catch (err) {
      console.warn('保存本地待办失败', err)
    }
  },

  async fetchCloudTasks() {
    try {
      const res = await request('/todos')
      if (res.success && res.data) {
        return normalizeTasks(res.data)
      }
      return null
    } catch (err) {
      console.warn('云端待办读取失败', err)
      this.setData({ syncError: '云端同步失败' })
      return null
    }
  },

  async syncToCloud(tasks) {
    const payloadTasks = sanitizeTasksForStorage(tasks)
    const doc = {
      tasks: payloadTasks,
      ownerName: storage.getNickName() || '',
      pendingCount: payloadTasks.filter((item) => !item.completed).length,
    }

    this.setData({ syncing: true })
    try {
      const res = await request('/todos', 'POST', doc)
      if (res.success) {
        this.setData({ syncError: '' })
      } else {
        throw new Error(res.error || 'Sync failed')
      }
    } catch (err) {
      console.warn('云端待办保存失败', err)
      this.setData({ syncError: '云端同步失败' })
    } finally {
      this.setData({ syncing: false })
    }
  },

  onInputChange(e) {
    const value = (e && e.detail && e.detail.value ? e.detail.value : '').toString()
    this.setData({ inputValue: value, canSubmit: value.trim().length > 0 })
  },

  async onAddTask() {
    const text = this.data.inputValue.trim()
    if (!text) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' })
      this.setData({ inputValue: '', canSubmit: false })
      return
    }
    const newTask = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
      title: text,
      completed: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const tasks = [...this.data.tasks, newTask]
    this.persist(tasks)
    this.setData({ inputValue: '', canSubmit: false })
  },

  onToggleTask(e) {
    const id = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id ? e.currentTarget.dataset.id : '').toString()
    if (!id) return
    const tasks = this.data.tasks.map((item) => {
      if (!item || !item.id) return item
      if (String(item.id) === id) {
        return Object.assign({}, item, { completed: !item.completed, updatedAt: Date.now() })
      }
      return item
    })
    this.persist(tasks)
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
    this.openEditor(id, target.title)
  },

  openEditor(id, text = '') {
    this.setData({
      showEditor: true,
      editorValue: text,
      editorCanSubmit: !!text.trim(),
      editingTaskId: id || '',
    })
  },

  onCloseEditor() {
    this.setData({
      showEditor: false,
      editorValue: '',
      editorCanSubmit: false,
      editingTaskId: '',
    })
  },

  onEditorInput(e) {
    const value = (e && e.detail && e.detail.value ? e.detail.value : '').toString()
    this.setData({
      editorValue: value,
      editorCanSubmit: value.trim().length > 0,
    })
  },

  onSubmitEditor() {
    const text = this.data.editorValue.trim()
    if (!text) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' })
      return
    }
    const editingId = this.data.editingTaskId
    let tasks = []
    if (editingId) {
      tasks = this.data.tasks.map((item) => {
        if (String(item.id) === editingId) {
          return Object.assign({}, item, { title: text, updatedAt: Date.now() })
        }
        return item
      })
    } else {
      const newTask = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
        title: text,
        completed: false,
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
    const sanitized = sanitizeTasksForStorage(tasks)
    this.saveLocalTasks(sanitized)
    this.updateState(sanitized, this.data.filter)
    this.syncToCloud(sanitized)
  },

  updateState(tasks, filter) {
    const enriched = tasks.map((item) => {
      const text = formatTimestamp(item.createdAt)
      return Object.assign({}, item, { _createdText: text })
    })
    const completedCount = tasks.filter((item) => item.completed).length
    const activeCount = tasks.length - completedCount
    let filteredTasks = enriched
    if (filter === 'active') {
      filteredTasks = enriched.filter((item) => !item.completed)
    } else if (filter === 'completed') {
      filteredTasks = enriched.filter((item) => item.completed)
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
      progressPercent,
      todayDate
    })
  },
}

Page(pageOptions)

