import { TIME, ROUTES } from '../../utils/constants'
import { CT8_ENDPOINTS } from '../../utils/config'
import * as logger from '../../utils/logger'
import * as pageHelper from '../../utils/page-helper'
import request from '../../utils/request'

interface ServerDetail {
  host?: string
  user?: string
  port?: number
  ipify_ip?: string
  out_ip?: string
  proxy?: string
  expiry_text?: string
  expiry_unix?: number
  success?: boolean
  login_time?: string
}

interface RunItem {
  run_id?: string
  status?: 'success' | 'failed' | 'partial' | 'running' | string
  total_accounts?: number
  success_count?: number
  failed_count?: number
  start_time?: string
  end_time?: string
  create_time?: string
  duration?: string
  details?: ServerDetail[]
  auto_resolved?: boolean
  callback_status?: string
  callback_missing?: boolean
}

type SecretMode = 'append' | 'replace'

// const app = getApp()

Page({
  _refreshTimer: null as number | null,
  _runningTimer: null as number | null,
  _runningStartTime: 0,
  _lastKnownRunId: '',

  data: {
    // Tab 状态
    activeTab: 'status', // 'status' | 'secrets'

    // 运行状态数据
    latestRun: null as RunItem | null,
    runHistory: [] as RunItem[],
    loading: false,
    autoRefresh: false,
    triggering: false,

    // 任务执行中状态
    taskRunning: false,
    runningElapsed: '',

    // 服务器详情弹窗
    showServerModal: false,
    serverModalTitle: '',
    filteredServers: [] as ServerDetail[],

    // Secrets 管理数据
    secretName: 'USERS_LIST',
    mode: 'append' as SecretMode,
    inputValue: '',
    currentValue: '',
    lastUpdateTime: '',
    secretItems: [] as string[],
    deletingItem: false,
  },

  onLoad(query: Record<string, string>) {
    if (query.secret) {
      this.setData({ secretName: query.secret })
    }
    if (query.tab) {
      this.setData({ activeTab: query.tab })
    }

    // 初始加载
    this.loadStatus()
    this.loadCachedValue()

    // 恢复任务执行中状态
    this._restoreRunningState()
  },

  onShow() {
    if (this.data.activeTab === 'status') {
      this.loadStatus()
    }
    if (this.data.taskRunning && this._runningStartTime) {
      this._startRunningTimer(this._runningStartTime)
      this.startAutoRefresh()
    }
  },

  onHide() {
    // 页面隐藏时停止轮询和运行时钟，避免后台持续 setData
    this.stopAutoRefresh()
    this._stopRunningTimer()
  },

  onUnload() {
    this.stopAutoRefresh()
    this._stopRunningTimer()
  },

  onPullDownRefresh() {
    if (this.data.activeTab === 'status') {
      this.loadStatus()
    } else {
      this.loadCachedValue()
      wx.stopPullDownRefresh()
    }
  },

  // --- Tab 切换 ---
  switchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.activeTab) return

    this.setData({ activeTab: tab })

    if (tab === 'status') {
      this.loadStatus()
    } else {
      this.loadCachedValue()
    }
  },

  // --- 计算运行时长 ---
  _calcDuration(startTime: any, endTime: any): string {
    if (!startTime) return ''
    const start = new Date(startTime).getTime()
    const end = endTime ? new Date(endTime).getTime() : 0
    if (!start || isNaN(start)) return ''
    if (!end || isNaN(end)) return '进行中'

    const diffMs = end - start
    if (diffMs < 0) return ''
    if (diffMs < 1000) return '< 1秒'

    const totalSec = Math.floor(diffMs / 1000)
    const hours = Math.floor(totalSec / 3600)
    const minutes = Math.floor((totalSec % 3600) / 60)
    const seconds = totalSec % 60

    if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`
    if (minutes > 0) return `${minutes}分${seconds}秒`
    return `${seconds}秒`
  },

  // --- 运行状态逻辑 ---
  async loadStatus() {
    if (this.data.loading) return
    this.setData({ loading: true })
    try {
      const body: any = await request(`${CT8_ENDPOINTS.status}?limit=5`, 'GET', {}, false, { timeout: TIME.REQUEST_TIMEOUT })
      if (body && body.success && body.data) {
        const latest = body.data.latest
        const runs = body.data.runs || []
        const latestStartMs = latest?.start_time ? this._normalizeStartTime(latest.start_time) : 0

        // 格式化时间 + 计算时长
        if (latest) {
          latest.callback_missing = latest.callback_status === 'missing' || latest.callback_status === 'empty'
          latest.duration = this._calcDuration(latest.start_time, latest.end_time)
          latest.start_time = pageHelper.formatTimestamp(latest.start_time)
          latest.end_time = pageHelper.formatTimestamp(latest.end_time)
          // 处理details中的过期时间
          if (latest.details && Array.isArray(latest.details)) {
            latest.details.forEach((d: any) => {
              if (d.expiry_unix && (!d.expiry_text || d.expiry_text === 'N/A')) {
                const ts = Number(d.expiry_unix)
                if (!Number.isNaN(ts)) {
                  const date = new Date(ts * 1000)
                  d.expiry_text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                }
              }
            })
          }
        }
        runs.forEach((r: any) => {
          r.callback_missing = r.callback_status === 'missing' || r.callback_status === 'empty'
          r.duration = this._calcDuration(r.start_time, r.end_time)
          r.create_time = pageHelper.formatTimestamp(r.create_time)
        })

        const latestRunId = latest?.run_id ? String(latest.run_id) : ''
        const activeTask = body.data.activeTask
        const isCloudRunning = activeTask && activeTask.status === 'running'
        const shouldFinishByLatest =
          this.data.taskRunning &&
          !isCloudRunning &&
          !!latest &&
          latest.status !== 'running' &&
          !!latest.end_time &&
          (
            // 触发后出现了新的 run_id，可认为任务已收敛
            (!!this._lastKnownRunId && !!latestRunId && latestRunId !== this._lastKnownRunId) ||
            // 首次触发场景（之前没有 run_id）回退到时间判断
            (!!this._runningStartTime && latestStartMs > 0 && latestStartMs >= this._runningStartTime - 5000)
          )
        let finishedByLatest = false
        if (shouldFinishByLatest) {
          this._finishRunning('任务已完成')
          finishedByLatest = true
        }

        // 云端状态同步与计时器校准
        if (isCloudRunning) {
          const activeStartTime = this._normalizeStartTime(activeTask.start_time)
          // 如果云端在运行，本地同步开启计时器（如果没开的话）
          if (!this.data.taskRunning) {
            this._lastKnownRunId = latest?.run_id || ''
            this.setData({ taskRunning: true })
            this._startRunningTimer(activeStartTime)
          } else if (Math.abs(this._runningStartTime - activeStartTime) > 2000) {
            // 如果本地计时器偏差超过2秒，以云端为准校准
            this._startRunningTimer(activeStartTime)
          }

          // 页面从后台返回后如果任务还在运行，恢复自动轮询
          if (!this._refreshTimer) {
            this.startAutoRefresh()
          }
        } else if (this.data.taskRunning && !finishedByLatest) {
          // 如果云端已空闲但本地还在倒计时，说明任务已结束
          this._finishRunning('任务已完成')
        }

        this.setData({
          latestRun: latest || null,
          runHistory: runs,
        })
      }
    } catch (err) {
      // 静默失败，不频繁打扰用户
      logger.error('加载状态失败', err, 'CT8Management')
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
    }
  },

  startAutoRefresh() {
    if (this._refreshTimer) return

    this.setData({ autoRefresh: true })
    this.loadStatus()
    this._refreshTimer = setInterval(() => {
      if (this.data.autoRefresh) this.loadStatus()
    }, TIME.AUTO_REFRESH_INTERVAL) as unknown as number
  },

  stopAutoRefresh() {
    this.setData({ autoRefresh: false })
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer)
      this._refreshTimer = null
    }
  },

  async onTriggerGH() {
    if (this.data.taskRunning) {
      logger.showError('已有任务正在执行中，请稍候')
      return
    }

    if (this.data.triggering) {
      logger.showError('正在触发中，请稍候...')
      return
    }

    const lastTriggerTime = wx.getStorageSync('lastCT8TriggerTime') || 0
    const now = Date.now()
    if (now - lastTriggerTime < 60000) {
      const remainingSec = Math.ceil((60000 - (now - lastTriggerTime)) / 1000)
      logger.showError(`请等待 ${remainingSec} 秒后再触发`)
      return
    }

    this.setData({ triggering: true })
    wx.showLoading({ title: '触发中...', mask: true })

    try {
      await request(CT8_ENDPOINTS.trigger, 'POST', {}, false, { timeout: TIME.REQUEST_TIMEOUT })
      logger.showSuccess('已触发任务')
      wx.setStorageSync('lastCT8TriggerTime', now)
      // 记录当前最新 run_id，用于检测新任务
      const currentRunId = this.data.latestRun ? (this.data.latestRun as any).run_id || '' : ''
      this._lastKnownRunId = currentRunId
      this.setData({ taskRunning: true })
      this._startRunningTimer(now)
      this.startAutoRefresh()
    } catch (err: any) {
      logger.showError(err?.message || err?.error || '触发失败')
    } finally {
      wx.hideLoading()
      this.setData({ triggering: false })
    }
  },

  // --- 运行中状态管理 ---
  _restoreRunningState() {
    // 改为通过 loadStatus 自动从云端恢复状态
    this.loadStatus()
  },

  _finishRunning(msg?: string, icon?: 'success' | 'none') {
    this._stopRunningTimer()
    this._runningStartTime = 0
    this._lastKnownRunId = ''
    this.setData({ taskRunning: false, runningElapsed: '' })
    this.stopAutoRefresh()
    if (msg) {
      wx.showToast({ title: msg, icon: icon || 'success', duration: 2000 })
    }
    // 最终刷新一次状态，确保显示最新数据
    this.loadStatus()
  },

  _normalizeStartTime(value?: number | string): number {
    if (value === undefined || value === null) return Date.now()

    if (typeof value === 'number') {
      return value < 1e12 ? value * 1000 : value
    }

    const numeric = Number(value)
    if (!Number.isNaN(numeric)) {
      return numeric < 1e12 ? numeric * 1000 : numeric
    }

    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? Date.now() : parsed
  },

  _startRunningTimer(triggerTime?: number | string) {
    this._stopRunningTimer()
    const startTime = this._normalizeStartTime(triggerTime)
    // 立即计算当前已违去的时间
    const calcText = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const minutes = Math.floor(elapsed / 60)
      const seconds = elapsed % 60
      return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
    }
    this._runningStartTime = startTime
    this.setData({ runningElapsed: calcText() })
    this._runningTimer = setInterval(() => {
      this.setData({ runningElapsed: calcText() })
    }, 1000) as unknown as number
  },

  _stopRunningTimer() {
    if (this._runningTimer) {
      clearInterval(this._runningTimer)
      this._runningTimer = null
    }
  },

  async viewDetails(e: WechatMiniprogram.TouchEvent) {
    const runId = (e.currentTarget.dataset as any).runid
    if (!runId) return
    wx.showLoading({ title: '加载中...' })
    try {
      const body: any = await request(`${CT8_ENDPOINTS.status}?run_id=${runId}`, 'GET', {}, false, { timeout: TIME.REQUEST_TIMEOUT })
      if (body && body.success && body.data) {
        wx.navigateTo({
          url: `${ROUTES.CT8_DETAIL}?data=${encodeURIComponent(JSON.stringify(body.data))}`,
        })
      }
    } catch (err) {
      logger.showError('加载失败')
    } finally {
      wx.hideLoading()
    }
  },

  // --- 服务器详情弹窗 ---
  showFilteredServers(e: WechatMiniprogram.TouchEvent) {
    const type = (e.currentTarget.dataset as any).type as string // 'success' | 'failed'
    const source = (e.currentTarget.dataset as any).source as string // 'latest' | run_id

    if (source === 'latest') {
      const run = this.data.latestRun as any
      if (!run || !run.details || !Array.isArray(run.details)) {
        // 如果本地没有details，从服务器获取
        this._fetchAndShowDetails(run?.run_id, type)
        return
      }
      this._showServerModal(run.details, type)
    } else {
      // 历史记录需要从服务端获取
      this._fetchAndShowDetails(source, type)
    }
  },

  async _fetchAndShowDetails(runId: string, type: string) {
    if (!runId) {
      logger.showError('无法获取详情')
      return
    }
    wx.showLoading({ title: '加载中...' })
    try {
      const body: any = await request(`${CT8_ENDPOINTS.status}?run_id=${runId}`, 'GET', {}, false, { timeout: TIME.REQUEST_TIMEOUT })
      if (body && body.success && body.data && body.data.details) {
        // 格式化过期时间
        body.data.details.forEach((d: any) => {
          if (d.expiry_unix && (!d.expiry_text || d.expiry_text === 'N/A')) {
            const ts = Number(d.expiry_unix)
            if (!Number.isNaN(ts)) {
              const date = new Date(ts * 1000)
              d.expiry_text = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
            }
          }
        })
        this._showServerModal(body.data.details, type)
      } else {
        logger.showError('暂无详情数据')
      }
    } catch (err) {
      logger.showError('加载详情失败')
    } finally {
      wx.hideLoading()
    }
  },

  _showServerModal(details: ServerDetail[], type: string) {
    const filtered = type === 'failed'
      ? details.filter((d: any) => !d.success)
      : details.filter((d: any) => d.success)

    const count = filtered.length
    const title = type === 'failed' ? `失败服务器 (${count})` : `成功服务器 (${count})`

    this.setData({
      showServerModal: true,
      serverModalTitle: title,
      filteredServers: filtered,
    })
  },

  hideServerModal() {
    this.setData({
      showServerModal: false,
      filteredServers: [],
    })
  },

  noop() {
    // 占位事件：用于 catchtouchmove 阻止弹窗打开时页面背景滚动
  },

  // --- Secrets 管理逻辑 ---
  async loadCachedValue() {
    const secret = this.data.secretName
    // 不显示 loading，避免切换 tab 时闪烁
    try {
      const body: any = await request(CT8_ENDPOINTS.secretCache, 'POST', { action: 'get', secret_name: secret }, false, { timeout: 15000 })
      if (body && body.ok && body.data) {
        const ts = body.data.updated_at
          ? pageHelper.formatTimestamp(body.data.updated_at)
          : ''
        this.setData({ currentValue: body.data.value, lastUpdateTime: ts })
        this._parseSecretItems()
      }
    } catch (err) {
      logger.error('从服务器加载失败', err, 'CT8Management')
    }
  },

  async saveCachedValue(value: string) {
    const secret = this.data.secretName
    let updatedBy = 'miniapp_user'
    try {
      const nick = wx.getStorageSync('nickName')
      if (nick) updatedBy = nick
      // Or use ID if preferred
      // const user = wx.getStorageSync('user')
      // if (user && user.openid) updatedBy = user.openid
    } catch (_) { }

    try {
      const body: any = await request(CT8_ENDPOINTS.secretCache, 'POST', { action: 'set', secret_name: secret, secret_value: value, updated_by: updatedBy }, false, { timeout: 15000 })
      if (body && body.ok) logger.info(`已保存 ${secret} 到服务器: ${body.action}`, null, 'CT8Management')
      else logger.warn('保存缓存失败', body, 'CT8Management')
    } catch (err) {
      logger.error('保存缓存失败', err, 'CT8Management')
    }
  },

  onModeChange(e: WechatMiniprogram.TouchEvent) {
    const v = ((e.currentTarget.dataset as any).value || (e.detail as any).value) as SecretMode
    this.setData({ mode: v })
  },

  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputValue: e.detail.value })
  },

  onCurrentValueChange(e: WechatMiniprogram.Input) {
    this.setData({ currentValue: e.detail.value })
    this._parseSecretItems()
  },

  _parseSecretItems() {
    const val = this.data.currentValue || ''
    const items = val.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
    this.setData({ secretItems: items })
  },

  onDeleteSecretItem(e: WechatMiniprogram.TouchEvent) {
    const index = (e.currentTarget.dataset as any).index as number
    const item = this.data.secretItems[index]
    if (!item || this.data.deletingItem) return

    wx.showModal({
      title: '确认删除',
      content: `确定要删除「${item}」吗？\n\n删除后将自动同步到 GitHub Secret`,
      confirmColor: '#ff3b30',
      confirmText: '删除',
      success: (m) => {
        if (m.confirm) {
          const newItems = [...this.data.secretItems]
          newItems.splice(index, 1)
          const newValue = newItems.join(',')
          this.setData({ deletingItem: true })

          // 先更新 GitHub Secret
          const secret = this.data.secretName
          wx.showLoading({ title: '删除中...', mask: true })
          request(CT8_ENDPOINTS.updateSecret, 'POST', { action: 'update', secret_name: secret, value: newValue }, false, { timeout: 30000 })
            .then((body: any) => {
              if (body && body.ok) {
                this.saveCachedValue(newValue)
                this.setData({ currentValue: newValue, secretItems: newItems })
                wx.showToast({ icon: 'success', title: `已删除 ${item}` })
              } else {
                wx.showToast({ icon: 'error', title: body?.message || '删除失败' })
              }
            })
            .catch((err: any) => {
              wx.showToast({ icon: 'error', title: err?.message || err?.error || '网络错误' })
            })
            .finally(() => {
              wx.hideLoading()
              this.setData({ deletingItem: false })
            })
        }
      },
    })
  },

  onSubmit() {
    const { mode, inputValue, currentValue, secretName } = this.data
    if (!inputValue) {
      wx.showToast({ icon: 'none', title: '请输入内容' })
      return
    }
    if (mode === 'append' && !currentValue) {
      wx.showToast({ icon: 'none', title: '追加模式需要输入当前值' })
      return
    }

    let next = inputValue
    // 强制使用逗号分隔
    const separator = ','

    if (mode === 'append') {
      next = `${currentValue}${separator}${inputValue}`
    }

    wx.showModal({
      title: '确认更新',
      content: mode === 'replace'
        ? `确定要替换 ${secretName} 的值吗？\n\n新值长度: ${next.length} 字符`
        : `确定要追加到 ${secretName} 吗？\n\n追加内容: ${inputValue}\n最终长度: ${next.length} 字符`,
      success: (m) => {
        if (m.confirm) this.updateSecret(next)
      },
    })
  },

  async updateSecret(value: string) {
    const secret = this.data.secretName
    wx.showLoading({ title: '更新中...' })
    try {
      const body: any = await request(CT8_ENDPOINTS.updateSecret, 'POST', { action: 'update', secret_name: secret, value }, false, { timeout: 30000 })
      if (body && body.ok) {
        this.saveCachedValue(value)
        wx.showToast({ icon: 'success', title: '更新成功', duration: 2000 })
        this.setData({ inputValue: '', currentValue: value })
        this.loadCachedValue() // 立即重新加载以获取最新更新时间
        this._parseSecretItems()
      } else {
        wx.showToast({ icon: 'error', title: body?.message || '更新失败', duration: 3000 })
      }
    } catch (err: any) {
      logger.error('更新失败', err, 'CT8Management')
      wx.showToast({ icon: 'error', title: err?.message || err?.error || '网络错误', duration: 3000 })
    } finally {
      wx.hideLoading()
    }
  },
})
