const { EMQX_API, ESP01S_RELAY_API, TEMP_HUMIDITY_API } = require('../../utils/config')
const logger = require('../../utils/logger')
const request = require('../../utils/request').default

const ensureWeappRuntime = () => {
  if (typeof wx === 'undefined') {
    return
  }

  const ctx =
    typeof globalThis !== 'undefined'
      ? globalThis
      : typeof global !== 'undefined'
        ? global
        : typeof window !== 'undefined'
          ? window
          : {}

  if (!ctx.process) {
    ctx.process = {}
  }
  ctx.process.title = 'browser'

  if (typeof ctx.__webpack_require__ !== 'function') {
    ctx.__webpack_require__ = function noop() { }
  }
}

ensureWeappRuntime()

const ensureWeappWebSocket = () => {
  if (typeof wx === 'undefined') {
    return
  }

  const getGlobalContexts = () => {
    const targets = new Set()
    const push = (val) => {
      if (val) {
        targets.add(val)
      }
    }
    push(typeof globalThis !== 'undefined' ? globalThis : null)
    push(typeof global !== 'undefined' ? global : null)
    push(typeof window !== 'undefined' ? window : null)
    push(typeof self !== 'undefined' ? self : null)
    try {
      push(Function('return this')())
    } catch (error) {
      // ignore
    }
    return Array.from(targets)
  }

  const READY_STATE = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }

  class WxWebSocket {
    constructor(url, protocols) {
      this.url = url
      this.protocols = protocols
      this.readyState = READY_STATE.CONNECTING
      this.binaryType = 'arraybuffer'
      this.listeners = {}
      this.socketTask = wx.connectSocket({
        url,
        protocols,
        tcpNoDelay: true,
      })
      this.bindEvents()
    }

    bindEvents() {
      this.socketTask.onOpen((event) => {
        this.readyState = READY_STATE.OPEN
        this.emit('open', event)
      })
      this.socketTask.onMessage((event) => {
        this.emit('message', event)
      })
      this.socketTask.onClose((event) => {
        this.readyState = READY_STATE.CLOSED
        this.emit('close', event)
      })
      this.socketTask.onError((event) => {
        this.emit('error', event)
      })
    }

    emit(type, payload) {
      const handler = this[`on${type}`]
      if (typeof handler === 'function') {
        handler(payload)
      }
      const list = this.listeners[type]
      if (Array.isArray(list)) {
        list.forEach((cb) => {
          try {
            cb(payload)
          } catch (error) {
            logger.error('WebSocket listener error', error, 'SmartControl')
          }
        })
      }
    }

    addEventListener(type, callback) {
      if (!this.listeners[type]) {
        this.listeners[type] = []
      }
      this.listeners[type].push(callback)
    }

    removeEventListener(type, callback) {
      if (!this.listeners[type]) {
        return
      }
      this.listeners[type] = this.listeners[type].filter((cb) => cb !== callback)
    }

    send(data) {
      if (this.readyState !== READY_STATE.OPEN) {
        logger.warn('WebSocket not open, skip send', null, 'SmartControl')
        return
      }
      this.socketTask.send({
        data,
        fail: (error) => this.emit('error', error),
      })
    }

    close(code, reason) {
      if (this.readyState === READY_STATE.CLOSED) {
        return
      }
      this.readyState = READY_STATE.CLOSING
      this.socketTask.close({
        code,
        reason,
        complete: () => this.emit('close', { code, reason }),
      })
    }
  }

  WxWebSocket.CONNECTING = READY_STATE.CONNECTING
  WxWebSocket.OPEN = READY_STATE.OPEN
  WxWebSocket.CLOSING = READY_STATE.CLOSING
  WxWebSocket.CLOSED = READY_STATE.CLOSED

  getGlobalContexts().forEach((ctx) => {
    ctx.WebSocket = WxWebSocket
  })
}

ensureWeappWebSocket()

Page({
  _pollingTimer: null,
  _updateDisplayTimer: null,
  _isFetchingLatest: false,
  _isAlive: false,
  data: {
    relayOn: false,
    switching: false,
    statusText: '等待指令',
    relayStatusDisplay: '未知状态',
    // 温湿度数据
    temperature: '--',
    humidity: '--',
    sensorConnected: false,
    sensorStatus: '未连接',
    lastUpdated: '',
    sensorError: '',
    lastSyncTime: null, // 最后一次成功同步的时间戳
    // 轮询 timer 使用页面实例字段，不放入 data，避免无意义 setData 和渲染
    // 设备状态信息
    mqttConnected: false,
    subscribed: false,
    deviceOnline: false,
    lastMsgTimestamp: null,
    // ESP01S 继电器 2 状态
    relay2On: false,
    switching2: false,
    statusText2: '等待指令',
    relayStatusDisplay2: '未知状态',
    esp01sOnline: false, // ESP01S 设备在线状态
  },

  onLoad() {
    this._isAlive = true
    this.initSensorData()
    this.startUpdateDisplay()
  },

  onUnload() {
    this._isAlive = false
    this.cleanup()
  },

  onHide() {
    this._isAlive = false
    // 页面隐藏时完全停止轮询与更新时间，避免后台耗电
    this.cleanup()
  },

  onShow() {
    this._isAlive = true
    // 页面显示时恢复数据获取与时间展示
    this.startPolling()
    this.startUpdateDisplay()
  },

  _setDataIfChanged(patch) {
    if (!this._isAlive || !patch || typeof patch !== 'object') return
    const changed = {}
    let hasChanged = false
    Object.keys(patch).forEach((key) => {
      if (!Object.is(this.data[key], patch[key])) {
        changed[key] = patch[key]
        hasChanged = true
      }
    })
    if (hasChanged) {
      this.setData(changed)
    }
  },

  onSwitchTap() {
    if (this.data.switching) return
    const nextState = !this.data.relayOn
    this.publishRelayCommand(nextState)
  },

  onSwitchChange(e) {
    const nextState = e.detail.value
    this.publishRelayCommand(nextState)
  },

  onSwitchTap2() {
    if (this.data.switching2) return
    const nextState = !this.data.relay2On
    this.publishRelay2Command(nextState)
  },

  publishRelayCommand(nextState) {
    if (!EMQX_API.publishUrl) {
      wx.showToast({ title: '未配置控制地址', icon: 'none' })
      return
    }

    const prevState = this.data.relayOn
    this.setData({
      relayOn: nextState,
      switching: true,
      statusText: nextState ? '正在开启…' : '正在关闭…',
    })

    request(EMQX_API.publishUrl, 'POST', {
        target: EMQX_API.target,
        status: nextState ? 'on' : 'off',
      })
      .then((res) => {
        if (res && res.success === false) {
          this.handleRelayError(prevState)
          return
        }
        this.setData({
          statusText: nextState ? '继电器已开启' : '继电器已关闭',
          relayStatusDisplay: nextState ? '已开启' : '已关闭',
        })
        wx.showToast({
          title: nextState ? '已开启' : '已关闭',
          icon: 'success',
        })
      })
      .catch(() => {
        this.handleRelayError(prevState)
      })
      .finally(() => {
        this.setData({ switching: false })
      })
  },

  publishRelay2Command(nextState) {
    if (!ESP01S_RELAY_API.publishUrl) {
      wx.showToast({ title: '未配置控制地址', icon: 'none' })
      return
    }

    const prevState = this.data.relay2On
    this.setData({
      relay2On: nextState,
      switching2: true,
      statusText2: nextState ? '正在开启…' : '正在关闭…',
    })

    request(ESP01S_RELAY_API.publishUrl, 'POST', {
        target: ESP01S_RELAY_API.target,
        status: nextState ? 'on' : 'off',
      })
      .then((res) => {
        if (res && res.success === false) {
          this.handleRelay2Error(prevState)
          return
        }
        this.setData({
          statusText2: nextState ? '继电器已开启' : '继电器已关闭',
          relayStatusDisplay2: nextState ? '已开启' : '已关闭',
        })
        wx.showToast({
          title: nextState ? '已开启' : '已关闭',
          icon: 'success',
        })
      })
      .catch(() => {
        this.handleRelay2Error(prevState)
      })
      .finally(() => {
        this.setData({ switching2: false })
      })
  },

  handleRelayError(prevState) {
    this.setData({
      relayOn: prevState,
      statusText: '控制失败，请稍后重试',
      relayStatusDisplay: prevState ? '已开启' : '已关闭',
    })
    wx.showToast({ title: '控制失败', icon: 'none' })
  },

  handleRelay2Error(prevState) {
    this.setData({
      relay2On: prevState,
      statusText2: '控制失败，请稍后重试',
      relayStatusDisplay2: prevState ? '已开启' : '已关闭',
    })
    wx.showToast({ title: '控制失败', icon: 'none' })
  },

  // ========== 温湿度数据相关方法 ==========

  initSensorData() {
    // 启动 HTTP 轮询获取温湿度数据
    this.startPolling()
  },

  // HTTP 拉取最新数据和状态
  fetchLatestData() {
    if (this._isFetchingLatest) return
    this._isFetchingLatest = true
    request('/iot/info', 'GET')
      .then((res) => {
        if (!this._isAlive) return
        const data = res && res.success && res.data ? res.data : res
        if (data && (data.temp !== undefined || data.hum !== undefined)) {
          this.updateSensorData(data)
        } else if (data) {
          this.updateDeviceStatus(data)
          this.handleSensorError(data.diagnosticMessage || '暂无数据，请稍后再试')
        } else {
          this.handleSensorError('数据格式错误')
        }
      })
      .catch((err) => {
        if (!this._isAlive) return
        logger.error('获取温湿度数据失败', err, 'SmartControl')
        this.handleSensorError('网络错误，请检查连接')
      })
      .finally(() => {
        this._isFetchingLatest = false
      })
  },

  // 更新传感器数据
  updateSensorData(data) {
    const { temp, hum, timestamp, mqttConnected, subscribed, lastMsgTimestamp, deviceOnline, relayStatus } = data
    // 记录当前同步时间
    const now = Date.now()
    const updateTime = this.formatUpdateTime(timestamp || now)

    // 根据设备状态和 MQTT 连接状态确定显示状态
    let statusText = '未连接'
    if (mqttConnected === false || subscribed === false) {
      statusText = '系统连接异常'
    } else if (deviceOnline === false) {
      statusText = '设备离线'
    } else {
      statusText = '已连接'
    }

    const patch = {
      temperature: temp !== undefined ? Number(temp).toFixed(1) : '--',
      humidity: hum !== undefined ? Number(hum).toFixed(0) : '--',
      sensorConnected: deviceOnline === true && mqttConnected === true && subscribed === true,
      sensorStatus: statusText,
      lastUpdated: updateTime,
      lastSyncTime: timestamp || now,
      sensorError: '',
      // 设备状态信息
      mqttConnected: mqttConnected === true,
      subscribed: subscribed === true,
      deviceOnline: deviceOnline === true,
      lastMsgTimestamp: lastMsgTimestamp || timestamp || null,
    }

    Object.assign(patch, this.buildRelayStatusPatch(relayStatus))
    Object.assign(patch, this.buildRelay2StatusPatch(data.relay2Status))
    Object.assign(patch, this.buildEsp01sOnlinePatch(data.esp01sOnline))

    this._setDataIfChanged(patch)
  },

  // 更新设备状态（当没有数据但有状态信息时）
  updateDeviceStatus(data) {
    const { mqttConnected, subscribed, lastMsgTimestamp, deviceOnline, relayStatus } = data

    let statusText = '未连接'
    if (mqttConnected === false || subscribed === false) {
      statusText = '系统连接异常'
    } else if (deviceOnline === false) {
      statusText = '设备离线'
    } else {
      statusText = '已连接'
    }

    const patch = {
      sensorConnected: deviceOnline === true && mqttConnected === true && subscribed === true,
      sensorStatus: statusText,
      mqttConnected: mqttConnected === true,
      subscribed: subscribed === true,
      deviceOnline: deviceOnline === true,
      lastMsgTimestamp: lastMsgTimestamp || null,
    }

    Object.assign(patch, this.buildRelayStatusPatch(relayStatus))
    Object.assign(patch, this.buildRelay2StatusPatch(data.relay2Status))
    Object.assign(patch, this.buildEsp01sOnlinePatch(data.esp01sOnline))

    this._setDataIfChanged(patch)
  },

  // 构建继电器状态更新 patch（不直接 setData，供批量合并）
  buildRelayStatusPatch(relayStatus) {
    if (!relayStatus) {
      return this.data.relayStatusDisplay ? {} : { relayStatusDisplay: '未知状态' }
    }
    const isOn = relayStatus === 'ON'
    const relayStatusDisplay = isOn ? '已开启' : '已关闭'
    const dataToSet = {
      relayOn: isOn,
      relayStatusDisplay,
    }
    if (!this.data.switching) {
      dataToSet.statusText = `继电器${relayStatusDisplay}`
    }
    return dataToSet
  },

  // 构建继电器 2 状态更新 patch（不直接 setData，供批量合并）
  buildRelay2StatusPatch(relayStatus) {
    if (!relayStatus) {
      return this.data.relayStatusDisplay2 ? {} : { relayStatusDisplay2: '未知状态' }
    }
    const isOn = relayStatus === 'ON'
    const relayStatusDisplay = isOn ? '已开启' : '已关闭'
    const dataToSet = {
      relay2On: isOn,
      relayStatusDisplay2: relayStatusDisplay,
    }
    if (!this.data.switching2) {
      dataToSet.statusText2 = `继电器${relayStatusDisplay}`
    }
    return dataToSet
  },

  // 构建 ESP01S 设备在线状态 patch（不直接 setData，供批量合并）
  buildEsp01sOnlinePatch(onlineStatus) {
    // onlineStatus 应该是 'online' 或 'offline' 字符串
    const isOnline = onlineStatus === 'online' || onlineStatus === true
    return { esp01sOnline: isOnline }
  },

  // 格式化更新时间
  formatUpdateTime(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000) // 秒数差

    if (diff < 60) {
      return `${diff}秒前`
    } else if (diff < 3600) {
      return `${Math.floor(diff / 60)}分钟前`
    } else if (diff < 86400) {
      return `${Math.floor(diff / 3600)}小时前`
    } else {
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    }
  },

  // 处理传感器错误
  handleSensorError(message) {
    // 如果已经有状态信息，不要覆盖状态
    if (!this.data.mqttConnected && !this.data.deviceOnline) {
      this._setDataIfChanged({
        sensorError: message,
        sensorConnected: false,
        sensorStatus: '连接失败',
        temperature: '--',
        humidity: '--',
      })
    } else {
      // 保留状态信息，只更新错误提示
      this.setData({
        sensorError: message,
      })
    }
  },

  // 开始 HTTP 轮询
  startPolling() {
    if (this._pollingTimer) {
      return // 已经在轮询中
    }

    // 立即获取一次
    this.fetchLatestData()

    // 设置定时器
    this._pollingTimer = setInterval(() => {
      this.fetchLatestData()
    }, TEMP_HUMIDITY_API.pollingInterval)

    logger.info(`开始 HTTP 轮询，间隔: ${TEMP_HUMIDITY_API.pollingInterval} ms`, null, 'SmartControl')
  },

  // 停止 HTTP 轮询
  stopPolling() {
    if (this._pollingTimer) {
      clearInterval(this._pollingTimer)
      this._pollingTimer = null
      logger.info('已停止 HTTP 轮询', null, 'SmartControl')
    }
  },

  // 开始实时更新显示时间
  startUpdateDisplay() {
    if (this._updateDisplayTimer) return

    // 降低 setData 频率，页面仍保持清晰的相对时间感知
    this._updateDisplayTimer = setInterval(() => {
      if (this.data.lastSyncTime) {
        const updateTime = this.formatUpdateTime(this.data.lastSyncTime)
        if (updateTime !== this.data.lastUpdated) {
          this._setDataIfChanged({ lastUpdated: updateTime })
        }
      }
    }, 5000)
  },

  // 停止更新显示时间
  stopUpdateDisplay() {
    if (this._updateDisplayTimer) {
      clearInterval(this._updateDisplayTimer)
      this._updateDisplayTimer = null
    }
  },

  // 清理资源
  cleanup() {
    this.stopPolling()
    this.stopUpdateDisplay()
  },
})
