import { maskAccount } from '../../utils/sensitive'

interface DetailItem {
  account?: string
  email?: string
  username?: string
  user?: string
  login?: string
  expiry_text?: string
  expiry?: string
  expires_at?: string
  expiry_unix?: number | string
  status?: string
  state?: string
  result?: string
  displayAccount?: string
  displayStatus?: string
  out_ip?: string
  ipify_ip?: string
  proxy?: string
  host?: string
  port?: number
}

function formatExpiryText(item: DetailItem): string {
  let text = item.expiry_text || item.expiry || item.expires_at || ''
  if ((!text || text === 'N/A') && item.expiry_unix !== undefined && item.expiry_unix !== null && item.expiry_unix !== '') {
    const ts = Number(item.expiry_unix)
    if (!Number.isNaN(ts)) {
      const d = new Date(ts * 1000)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const ss = String(d.getSeconds()).padStart(2, '0')
      text = `${y}-${m}-${day} ${hh}:${mm}:${ss}`
    }
  }
  return text
}

Page({
  data: {
    runData: null,
    details: [],
  },

  onLoad(query: Record<string, string>) {
    if (query.data) {
      try {
        const parsed = JSON.parse(decodeURIComponent(query.data))
        const statusMap: Record<string, string> = { success: '成功', failed: '失败', partial: '部分成功', running: '进行中', error: '失败' }
        const details: DetailItem[] = (parsed && parsed.details ? parsed.details : []).map((it: DetailItem) => {
          const item: DetailItem = { ...(it as any || {}) }
          item.expiry_text = formatExpiryText(item)
          const acc = (item.account || item.email || item.username || (item as any).user || (item as any).login || '') as string
          const rawStatus = (item.status || (item as any).state || (item as any).result || '') as string
          const dispStatus = statusMap[String(rawStatus).toLowerCase()] || (rawStatus ? String(rawStatus) : '')
          item.displayAccount = maskAccount(acc)
          item.displayStatus = dispStatus
          return item
        })
        this.setData({ runData: parsed, details: details as any })
      } catch (err) {
        console.error('解析数据失败:', err)
        wx.showToast({ icon: 'none', title: '数据加载失败' })
        setTimeout(() => wx.navigateBack(), 1500)
      }
    }
  },

  goBack() {
    wx.navigateBack()
  },

  copyInfo(e: WechatMiniprogram.TouchEvent) {
    const text = (e.currentTarget.dataset as any).text
    if (!text) return
    wx.setClipboardData({
      data: String(text),
      success: () => wx.showToast({ icon: 'success', title: '已复制' }),
    })
  },
})
