import * as logger from '../../../utils/logger'
import request from '../../../utils/request'
import { ROUTES } from '../../../utils/constants'

Page({
  _isAlive: false,
  _refreshingTradeNoMap: {} as Record<string, boolean>,
  _retryingTradeNoMap: {} as Record<string, boolean>,
  _autoRefreshSession: 0,
  data: {
    orders: [] as any[],
    loading: true,
    page: 1,
    limit: 15,
    hasMore: true,
    loadingMore: false,
    keyword: '',
    searchKeyword: '', // 输入框实际值
    searchField: '' // 精确搜索字段，空表示全字段搜索
  },
  lastAutoRefreshTime: 0 as number, // 记录上次全量刷新的时间戳

  onShow() {
    this._isAlive = true
    this._autoRefreshSession += 1
    this.setData({ page: 1, hasMore: true, orders: [] })
    this.fetchOrders(true) // 标记为进入页面/初始化
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true, orders: [] })
    this.fetchOrders(true).then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.setData({ page: this.data.page + 1 })
      this.fetchOrders(false)
    }
  },

  onHide() {
    this._isAlive = false
    this._autoRefreshSession += 1
    this._refreshingTradeNoMap = {}
    this._retryingTradeNoMap = {}
  },

  onUnload() {
    this._isAlive = false
    this._autoRefreshSession += 1
    this._refreshingTradeNoMap = {}
    this._retryingTradeNoMap = {}
  },

  async fetchOrders(isInitialOrPull: boolean = false) {
    const { page, limit, orders, keyword } = this.data

    if (page === 1) this.setData({ loading: true })
    else this.setData({ loadingMore: true })

    try {
      const searchField = this.data.searchField
      const params: any = { page, limit, keyword }
      if (searchField) params.searchField = searchField
      const res = await request<any>('/course-order/my-orders', 'GET', params)
      if (!this._isAlive) return

      if (res && res.code === 200) {
        const list = res.data.list.map((item: any) => {
          const d = new Date(item.createTime)
          item.createdAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          item.isRefreshing = false
          item.progressPercent = this._parseProgress(item.progress)
          return item
        })

        const hasMore = list.length >= limit
        if (page === 1) {
          this.setData({
            orders: list,
            hasMore
          })
        } else {
          const patch: any = { hasMore }
          const start = orders.length
          list.forEach((item: any, idx: number) => {
            patch[`orders[${start + idx}]`] = item
          })
          this.setData(patch)
        }

        // 自动刷新逻辑增强：
        // 1. 行为源自进入页面或下拉刷新
        // 2. 当前没有正在搜索（keyword为空）
        // 3. 必须是第一页
        // 4. 距离上次自动刷新超过 5 分钟 (300,000ms)
        const now = Date.now()
        const fiveMinutes = 5 * 60 * 1000
        
        if (isInitialOrPull && !keyword && page === 1 && (now - this.lastAutoRefreshTime > fiveMinutes)) {
          const ongoingOrders = list.filter((o: any) => o.status !== 'Completed')
          if (ongoingOrders.length > 0) {
            this.lastAutoRefreshTime = now // 更新冷却时间
            this._autoRefreshConcurrent(ongoingOrders.map((o: any) => o.tradeNo))
          }
        }

      } else {
        wx.showToast({ title: res?.message || '获取失败', icon: 'none' })
      }
    } catch (err: any) {
      logger.error('Fetch My Orders Error', err, 'CourseOrders')
      wx.showToast({ title: '网络失败', icon: 'error' })
    } finally {
      if (this._isAlive) {
        this.setData({ loading: false, loadingMore: false })
      }
    }
  },

  /** 自动刷新进行中订单，限制并发防止上游服务器过载 */
  async _autoRefreshConcurrent(ids: string[]) {
    const MAX_CONCURRENT = 2  // 降低并发，防止上游返回500
    const MAX_AUTO_REFRESH = 6 // 最多自动刷新前6个订单
    const BATCH_DELAY = 1000   // 批次间延迟1秒

    const session = this._autoRefreshSession
    const limitedIds = ids.slice(0, MAX_AUTO_REFRESH)
    for (let i = 0; i < limitedIds.length; i += MAX_CONCURRENT) {
      if (!this._isAlive || session !== this._autoRefreshSession) break
      const batch = limitedIds.slice(i, i + MAX_CONCURRENT)
      await Promise.all(
        batch.map(id =>
          this.onRefreshProgress({ currentTarget: { dataset: { id } } }, true).catch(() => {})
        )
      )
      // 批次间延迟，避免请求风暴
      if (i + MAX_CONCURRENT < limitedIds.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
      }
    }
  },

  async onRefreshProgress(e: any, isAuto: boolean = false) {
    const tradeNo = typeof e === 'string' ? e : e.currentTarget.dataset.id
    if (!tradeNo) return
    if (this._refreshingTradeNoMap[tradeNo]) return

    const { orders } = this.data
    const targetIdx = orders.findIndex((o: any) => o.tradeNo === tradeNo)
    if (targetIdx < 0) return

    // 设置在请求中
    this._refreshingTradeNoMap[tradeNo] = true
    this.setData({ [`orders[${targetIdx}].isRefreshing`]: true })

    try {
      const res = await request<any>('/course-order/refresh', 'POST', { tradeNo })
      if (!this._isAlive) return
      
      if (res && res.code === 200) {
        if (!isAuto && this._isAlive) {
          wx.showToast({ title: '已同步最新状态', icon: 'success' })
        }
        // 更新本地数据行
        const updated = res.data
        
        // 格式化时间
        const d = new Date(updated.createTime)
        const latestIdx = this.data.orders.findIndex((o: any) => o.tradeNo === tradeNo)
        if (latestIdx < 0) return
        const createdAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

        this.setData({
          [`orders[${latestIdx}].status`]: updated.status,
          [`orders[${latestIdx}].statusText`]: updated.statusText,
          [`orders[${latestIdx}].progress`]: updated.progress,
          [`orders[${latestIdx}].progressPercent`]: this._parseProgress(updated.progress),
          [`orders[${latestIdx}].remarks`]: updated.remarks,
          [`orders[${latestIdx}].courseName`]: updated.courseName,
          [`orders[${latestIdx}].school`]: updated.school,
          [`orders[${latestIdx}].platformName`]: updated.platformName,
          [`orders[${latestIdx}].account`]: updated.account || this.data.orders[latestIdx].account,
          [`orders[${latestIdx}].createdAt`]: createdAt,
        })
      } else {
        if (!isAuto) {
          wx.showToast({ title: res?.message || '刷新失败', icon: 'none' })
        }
      }
    } catch (err: any) {
      logger.error('Refresh Order Progress Error', err, 'CourseOrders')
      if (!isAuto && this._isAlive) {
        wx.showToast({ title: '请求失败', icon: 'error' })
      }
    } finally {
      delete this._refreshingTradeNoMap[tradeNo]
      if (this._isAlive) {
        const latestIdx = this.data.orders.findIndex((o: any) => o.tradeNo === tradeNo)
        if (latestIdx >= 0) {
          this.setData({ [`orders[${latestIdx}].isRefreshing`]: false })
        }
      }
    }
  },

  onGoToQuery() {
    wx.redirectTo({ url: ROUTES.COURSE_QUERY })
  },

  onSearchInput(e: any) {
    this.setData({ searchKeyword: e.detail.value })
  },

  onSearch() {
    this.setData({ 
      keyword: this.data.searchKeyword,
      searchField: '', // 手动搜索走全字段模糊匹配
      page: 1, 
      hasMore: true, 
      orders: [] 
    })
    this.fetchOrders(false) // 搜索时不自动全量刷新
  },

  onClearSearch() {
    this.setData({ 
      searchKeyword: '',
      keyword: '',
      searchField: '',
      page: 1, 
      hasMore: true, 
      orders: [] 
    })
    this.fetchOrders(false) // 清除搜索时也不自动全量刷新
  },

  async onRetryOrder(e: any) {
    const tradeNo = e.currentTarget.dataset.id
    if (!tradeNo) return
    if (this._retryingTradeNoMap[tradeNo]) return

    const { orders } = this.data
    const targetIdx = orders.findIndex((o: any) => o.tradeNo === tradeNo)
    if (targetIdx < 0) return
    const order = orders[targetIdx]

    wx.showModal({
      title: '补刷确认',
      content: `确定要为该订单进行补刷吗？\n\n课程：${order.courseName || '未知'}\n账号：${order.account || '-'}`,
      confirmColor: '#2563EB',
      success: async (res) => {
        if (res.confirm) {
          this.setData({ [`orders[${targetIdx}].isRetrying`]: true })
          try {
            const res = await request<any>('/course-order/retry', 'POST', { tradeNo })
            if (res && res.code === 200) {
              wx.showToast({ title: '补刷提交成功', icon: 'success' })
              // 更新本地状态
              this.setData({
                [`orders[${targetIdx}].status`]: res.data.status,
                [`orders[${targetIdx}].statusText`]: res.data.statusText,
                [`orders[${targetIdx}].remarks`]: res.data.remarks
              })
            } else {
              wx.showToast({ title: res?.message || '补刷失败', icon: 'none' })
            }
          } catch (err: any) {
            logger.error('Retry Order Error', err, 'CourseOrders')
            wx.showToast({ title: '网络异常', icon: 'error' })
          } finally {
            this.setData({ [`orders[${targetIdx}].isRetrying`]: false })
          }
        }
      }
    })
  },

  onQuickSearch(e: any) {
    const field = e.currentTarget.dataset.field || ''; // 可选：指定搜索字段
    const index = Number(e.currentTarget.dataset.index)
    const keyword = field === 'account' && Number.isInteger(index)
      ? this.data.orders[index]?.account
      : e.currentTarget.dataset.keyword;
    if (field === 'account' && !keyword) {
      return
    }
    if (keyword) {
      this.setData({ 
        searchKeyword: keyword,
        keyword: keyword,
        searchField: field, // 精确字段搜索
        page: 1, 
        hasMore: true, 
        orders: [] 
      });
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
      this.fetchOrders();
    }
  },

  /** 从进度文本中解析百分比数值 */
  _parseProgress(progress: string): number {
    if (!progress) return 0
    // 匹配 "85%" 格式
    const pctMatch = progress.match(/(\d+(?:\.\d+)?)\s*%/)
    if (pctMatch) return Math.min(parseFloat(pctMatch[1]), 100)
    // 匹配 "85/100" 格式
    const fracMatch = progress.match(/(\d+)\s*\/\s*(\d+)/)
    if (fracMatch) {
      const num = parseInt(fracMatch[1])
      const den = parseInt(fracMatch[2])
      return den > 0 ? Math.min(Math.round((num / den) * 100), 100) : 0
    }
    // 匹配纯数字
    const numMatch = progress.match(/(\d+(?:\.\d+)?)/)
    if (numMatch) return Math.min(parseFloat(numMatch[1]), 100)
    return 0
  }
})
