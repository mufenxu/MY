import { api } from './services/api';
import { reportMiniappExperience } from './utils/experience';

App<IAppOption>({
  globalData: {},
  onLaunch() {
    reportMiniappExperience({ event: 'page_load', outcome: 'ok', route: 'app' })
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
  onError(error) {
    reportMiniappExperience({ event: 'unhandled_error', error })
  },
  onUnhandledRejection(event) {
    reportMiniappExperience({ event: 'unhandled_rejection', error: event.reason })
  },
})
