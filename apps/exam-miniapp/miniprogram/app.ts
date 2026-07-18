import { api } from './services/api';

App<IAppOption>({
  globalData: {},
  onLaunch() {
    try {
      const storedLogs = wx.getStorageSync('logs')
      const logs = Array.isArray(storedLogs) ? storedLogs : []
      wx.setStorageSync('logs', [Date.now(), ...logs].slice(0, 50))
    } catch {
      // Startup should not fail when the local storage quota is exhausted.
    }
    api.flushPendingProgress().catch((error) => console.error('Flush progress failed', error))
  },
  onShow() {
    api.flushPendingProgress().catch((error) => console.error('Flush progress failed', error))
  },
})
