import { api } from './services/api';

App<IAppOption>({
  globalData: {},
  onLaunch() {
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
    api.flushPendingProgress().catch((error) => console.error('Flush progress failed', error))
  },
  onShow() {
    api.flushPendingProgress().catch((error) => console.error('Flush progress failed', error))
  },
})
