import * as logger from '../../../utils/logger'
import request from '../../../utils/request'
import { ROUTES } from '../../../utils/constants'

const ORDER_IDEMPOTENCY_STORAGE_KEY = 'course_order_idempotency_v1'

function hashSubmissionPayload(value: unknown): string {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function getSubmissionKey(payload: Record<string, unknown>): string {
  const fingerprint = hashSubmissionPayload(payload)
  const now = Date.now()
  try {
    const stored = wx.getStorageSync(ORDER_IDEMPOTENCY_STORAGE_KEY)
    if (stored && stored.fingerprint === fingerprint && now - Number(stored.createdAt) < 86400000) {
      return String(stored.key)
    }
  } catch (error) {
    logger.warn('Read order idempotency key failed', error, 'CourseQuery')
  }

  const key = `course-${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  try {
    wx.setStorageSync(ORDER_IDEMPOTENCY_STORAGE_KEY, { fingerprint, key, createdAt: now })
  } catch (error) {
    logger.warn('Persist order idempotency key failed', error, 'CourseQuery')
  }
  return key
}

function clearSubmissionKey(key: string): void {
  try {
    const stored = wx.getStorageSync(ORDER_IDEMPOTENCY_STORAGE_KEY)
    if (stored && stored.key === key) wx.removeStorageSync(ORDER_IDEMPOTENCY_STORAGE_KEY)
  } catch (error) {
    logger.warn('Clear order idempotency key failed', error, 'CourseQuery')
  }
}

Page({
  data: {
    platforms: [] as any[],
    platformIndex: null as number | null,
    showPlatformPopup: false,
    showConfirmPopup: false,
    scrollH: 0,
    school: '',
    user: '',
    pass: '',

    querying: false,
    submitting: false,
    queried: false,

    courseList: [] as any[],
    selectedIndices: [] as number[],
  },

  onLoad() {
    logger.debug('Course Query Page Loaded', undefined, 'CourseQuery')
    this.fetchPlatforms()
  },

  async fetchPlatforms() {
    try {
      const res = await request<any>('/course-category/active', 'GET')
      if (res && res.code === 200) {
        // 服务端返回的 data 包含 categories 和 stats
        this.setData({
          platforms: res.data?.categories || []
        })
      }
    } catch(err) {
      logger.error('Fetch Platforms Error', err, 'CourseQuery')
    }
  },

  openPlatformPopup() {
    // 动态计算 scroll-view 可用高度 = 屏幕高度 * 60% - header 高度(约50px)
    const windowInfo = (wx as any).getWindowInfo ? (wx as any).getWindowInfo() : wx.getSystemInfoSync()
    const scrollH = Math.floor(windowInfo.windowHeight * 0.6 - 50)
    this.setData({ showPlatformPopup: true, scrollH })
  },

  closePlatformPopup() {
    this.setData({ showPlatformPopup: false })
  },

  onSelectPlatform(e: any) {
    const index = e.currentTarget.dataset.index
    this.setData({
      platformIndex: index,
      showPlatformPopup: false
    })
  },

  preventTouchMove() {
    // 防止滚动穿透
  },

  onPlatformChange(e: any) {
    this.setData({
      platformIndex: e.detail.value
    })
  },

  async onQuery() {
    if (this.data.querying) return

    const { platformIndex, platforms, school, user, pass } = this.data

    if (platformIndex === null) {
      wx.showToast({ title: '请选择平台类型', icon: 'none' })
      return
    }
    if (!user || !pass) {
      wx.showToast({ title: '账号和密码必填', icon: 'none' })
      return
    }

    const selectedCategory = platforms[platformIndex]

    this.setData({ querying: true, queried: false, courseList: [], selectedIndices: [] })

    try {
      const res = await request<any>('/course-order/query', 'POST', {
        categoryId: selectedCategory._id,
        school,
        user,
        pass
      });

      if (res && res.code === 200) {
        // 后端已经归一化为数组了
        let list = res.data || []
        
        // 把数据加个 checked
        list = list.map((item: any) => ({ ...item, checked: false }))

        this.setData({
          queried: true,
          courseList: list
        })
        wx.showToast({ title: '查询成功', icon: 'success' })
      } else {
        wx.showModal({
          title: '查询失败',
          content: res?.message || '未知异常',
          showCancel: false
        })
      }
    } catch (err: any) {
      logger.error('Course Query Error', err, 'CourseQuery')
      wx.showModal({
        title: '网络请求失败',
        content: err.message || '请检查网络或稍后再试',
        showCancel: false
      })
    } finally {
      this.setData({ querying: false })
    }
  },

  onCourseCheck(e: any) {
    const values = e.detail.value.map(Number)
    const list = this.data.courseList

    // 更新 checked 状态
    list.forEach((item, index) => {
      item.checked = values.includes(index)
    })

    this.setData({
      courseList: list,
      selectedIndices: values
    })
  },

  onSelectAll() {
    const list = this.data.courseList
    const allChecked = this.data.selectedIndices.length === list.length && list.length > 0
    
    const newList = list.map(item => ({ ...item, checked: !allChecked }))
    const newIndices = !allChecked ? list.map((_, i) => i) : []

    this.setData({
      courseList: newList,
      selectedIndices: newIndices
    })
  },

  async onSubmitOrder() {
    const { courseList, selectedIndices } = this.data

    const selectedCourses = selectedIndices.map(i => courseList[i])

    if (selectedCourses.length === 0) {
      wx.showToast({ title: '请先勾选课程', icon: 'none'})
      return
    }

    this.setData({
      showConfirmPopup: true
    })
  },

  closeConfirmPopup() {
    this.setData({
      showConfirmPopup: false
    })
  },

  async onConfirmSubmit() {
    if (this.data.submitting) return

    const { platformIndex, platforms, school, user, pass, courseList, selectedIndices } = this.data
    const selectedCategory = platforms[platformIndex as number]
    const selectedCourses = selectedIndices.map(i => courseList[i])

    this.setData({
      showConfirmPopup: false
    })
    this.doSubmit(selectedCategory._id, school, user, pass, selectedCourses)
  },

  async doSubmit(categoryId: string, school: string, user: string, pass: string, courseList: any[]) {
    if (this.data.submitting) return

    this.setData({ submitting: true })

    try {
      const submissionPayload = {
        school,
        user,
        pass,
        categoryId,
        courseList,
        duration: 30 // 默认值
      }
      const idempotencyKey = getSubmissionKey(submissionPayload)
      const res = await request<any>('/course-order/submit', 'POST', {
        ...submissionPayload,
        idempotencyKey,
      }, false, { timeout: 10000 })

      if (res && (res.code === 202 || res.code === 200)) {
        clearSubmissionKey(idempotencyKey)
        wx.showModal({
          title: '订单已入队',
          content: res.message || '订单已加入系统列队。',
          showCancel: false,
          success: () => {
            wx.redirectTo({ url: ROUTES.COURSE_ORDERS })
          }
        })
      } else {
        wx.showModal({
          title: '提交失败',
          content: res?.message || '未知异常',
          showCancel: false
        })
      }
    } catch (err: any) {
      logger.error('Submit Course Order Error', err, 'CourseQuery')
      wx.showModal({
        title: '提交结果待确认',
        content: '网络中断时订单仍可能已经入队。请先查看订单列表；再次提交相同内容时系统会使用同一幂等键去重。',
        confirmText: '查看订单',
        cancelText: '留在此页',
        success: (result) => {
          if (result.confirm) wx.redirectTo({ url: ROUTES.COURSE_ORDERS })
        },
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  onGoToOrders() {
    wx.navigateTo({ url: ROUTES.COURSE_ORDERS })
  }
})
