import * as logger from '../../utils/logger'
import request from '../../utils/request'
import { getSessionSnapshot } from '../../utils/session'
import { maskEmail, maskPassword, maskSensitiveText } from '../../utils/sensitive'

type RegistrarOption = { name: string; siteUrl?: string; advanceNoticeDays?: number; renewPeriod?: string; config?: any }

interface ServerItem { name?: string; ip?: string; region?: string; registrar?: string; siteUrl?: string; username?: string; password?: string; email?: string; advanceNoticeDays?: number; renewPeriod?: string; config?: any; registeredAt?: string; expiresAt?: string; __display?: Record<string, string> }
interface DomainItem { host?: string; pointsTo?: string; note?: string; registrar?: string; siteUrl?: string; username?: string; password?: string; email?: string; advanceNoticeDays?: number; renewPeriod?: string; registeredAt?: string; expiresAt?: string; __display?: Record<string, string> }

interface GroupItem<T> { data: T; index: number; display: Record<string, string> }
interface Group<T> { group: string; items: Array<GroupItem<T>>; collapsed: boolean }

// 说明性：数据结构见 data 定义
const RESOURCE_CACHE_KEY = 'resource_config_cache'
const RESOURCE_CACHE_VERSION = 2
const RESOURCE_CACHE_TTL = 600000
const RESOURCE_SENSITIVE_KEYS = new Set([
  'account',
  'apiKey',
  'authorization',
  'email',
  'key',
  'password',
  'pass',
  'secret',
  'secretKey',
  'token',
  'username',
])

Page({
  data: {
    servers: [],
    domains: [],
    loading: false,
    saving: false,
    docId: '',
    showModal: false,
    modalType: 'server',
    modalTitle: '新增服务器',
    modalIndex: -1,
    modalData: {},
    activeTab: 'servers',
    serverGroups: [],
    domainGroups: [],
    serverCollapsed: {},
    domainCollapsed: {},
    registrarOptions: [],
    lastLoadedAt: 0,
    cachePreview: false,
  },

  onLoad() {
    const cache = this.readResourceCache()
    if (cache && Date.now() - cache.timestamp < RESOURCE_CACHE_TTL) {
      const servers = cache.servers
      const domains = cache.domains
      this.setData({
        servers,
        domains,
        serverGroups: this.buildGroups(servers, this.data.serverCollapsed),
        domainGroups: this.buildGroups(domains, this.data.domainCollapsed),
        registrarOptions: this.rebuildRegistrarOptions(servers, domains),
        cachePreview: true,
      } as any)
    }
    this.initOwnerAndLoad()
  },

  readResourceCache(): { servers: ServerItem[]; domains: DomainItem[]; timestamp: number } | null {
    try {
      const cache: any = wx.getStorageSync(RESOURCE_CACHE_KEY)
      if (!cache || !Array.isArray(cache.servers) || !Array.isArray(cache.domains)) return null

      const safeCache = this.buildSafeResourceCache(cache.servers, cache.domains, Number(cache.timestamp || 0))
      this.persistSafeResourceCache(safeCache)
      return safeCache
    } catch (err) {
      logger.warn('读取资源缓存失败', err, 'Resources')
      return null
    }
  },

  writeResourceCache(servers: ServerItem[], domains: DomainItem[], timestamp: number = Date.now()) {
    try {
      this.persistSafeResourceCache(this.buildSafeResourceCache(servers, domains, timestamp))
    } catch (err) {
      logger.warn('写入资源缓存失败', err, 'Resources')
    }
  },

  persistSafeResourceCache(cache: { servers: ServerItem[]; domains: DomainItem[]; timestamp: number }) {
    wx.setStorageSync(RESOURCE_CACHE_KEY, {
      version: RESOURCE_CACHE_VERSION,
      servers: cache.servers,
      domains: cache.domains,
      timestamp: cache.timestamp,
    })
  },

  buildSafeResourceCache(servers: ServerItem[], domains: DomainItem[], timestamp: number) {
    return {
      servers: (servers || []).map((item) => this.minimizeResourceItem(item)),
      domains: (domains || []).map((item) => this.minimizeResourceItem(item)),
      timestamp,
    }
  },

  minimizeResourceItem(item: any): any {
    if (!item || typeof item !== 'object') return item

    const display = {
      ...(item.__display || {}),
      ...(item.username ? { username: maskSensitiveText(item.username, { head: 2, tail: 2, mask: '****' }) } : {}),
      ...(item.password ? { password: maskPassword(item.password) } : {}),
      ...(item.email ? { email: maskEmail(item.email) } : {}),
    }
    const next: any = {}

    Object.keys(item).forEach((key) => {
      if (key === '__display' || RESOURCE_SENSITIVE_KEYS.has(key)) return
      next[key] = this.minimizeNestedValue(item[key])
    })

    if (Object.keys(display).length > 0) {
      next.__display = display
    }

    return next
  },

  minimizeNestedValue(value: any): any {
    if (Array.isArray(value)) {
      return value.map((item) => this.minimizeNestedValue(item))
    }
    if (!value || typeof value !== 'object') {
      return value
    }

    const next: any = {}
    Object.keys(value).forEach((key) => {
      if (RESOURCE_SENSITIVE_KEYS.has(key)) return
      next[key] = this.minimizeNestedValue(value[key])
    })
    return next
  },

  async loadFromCloud(force?: boolean) {
    const now = Date.now()
    const last = this.data.lastLoadedAt || 0
    if (!force && now - last < 180000) {
      logger.info('[Resources] 使用缓存数据，跳过网络请求')
      return
    }
    this.setData({ loading: true })
    try {
      const ret = await request('/resources')
      const result = ret && ret.result
      if (result) {
        const servers = result.servers || []
        const domains = result.domains || []
        this.setData({
          servers,
          domains,
          docId: result._id,
          serverGroups: this.buildGroups(servers, this.data.serverCollapsed),
          domainGroups: this.buildGroups(domains, this.data.domainCollapsed),
          registrarOptions: this.rebuildRegistrarOptions(servers, domains),
          lastLoadedAt: now,
          cachePreview: false,
        } as any)
        this.writeResourceCache(servers, domains, now)
      } else {
        this.setData({
          servers: [], domains: [], serverGroups: [], domainGroups: [], serverCollapsed: {}, domainCollapsed: {}, registrarOptions: [], lastLoadedAt: now,
          cachePreview: false,
        } as any)
      }
    } catch (err) {
      logger.error('加载失败', err, 'Resources')
      wx.showToast({ icon: 'none', title: '加载失败' })
      const cache = this.readResourceCache()
      if (cache) {
        const servers = cache.servers
        const domains = cache.domains
        this.setData({
          servers,
          domains,
          serverGroups: this.buildGroups(servers, this.data.serverCollapsed),
          domainGroups: this.buildGroups(domains, this.data.domainCollapsed),
          registrarOptions: this.rebuildRegistrarOptions(servers, domains),
          cachePreview: true,
        } as any)
        wx.showToast({ icon: 'none', title: '已加载缓存数据' })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  onPullDownRefresh() {
    this.loadFromCloud(true).finally(() => wx.stopPullDownRefresh())
  },

  onInputChange(e: WechatMiniprogram.Input) {
    const ds = (e.currentTarget.dataset as any)
    const value = e.detail.value
    const list = (this.data as any)[ds.group].slice()
    list[ds.index] = { ...list[ds.index], [ds.field]: value }
    this.setData({ [ds.group]: list } as any)
  },

  onAddServer() { this.onOpenAddServer() },
  onAddDomain() { this.onOpenAddDomain() },

  onRemoveRow(e: WechatMiniprogram.TouchEvent) {
    if (!this.ensureFreshResourceData()) return
    const ds = (e.currentTarget.dataset as any)
    wx.showModal({
      title: '确认删除',
      content: `是否删除该${ds.group === 'servers' ? '服务器' : '域名'}？`,
      success: async (m) => {
        if (!m.confirm) return
        const list = (this.data as any)[ds.group].slice()
        list.splice(ds.index, 1)
        if (ds.group === 'servers') {
          this.setData({ servers: list, serverGroups: this.buildGroups(list, this.data.serverCollapsed), registrarOptions: this.rebuildRegistrarOptions(list, this.data.domains) } as any)
        } else {
          this.setData({ domains: list, domainGroups: this.buildGroups(list, this.data.domainCollapsed), registrarOptions: this.rebuildRegistrarOptions(this.data.servers, list) } as any)
        }
        try { await this.commitToCloud(this.data.servers, this.data.domains); wx.showToast({ icon: 'success', title: '已删除' }) }
        catch (err: any) { const needLogin = err && (err.needLogin || err.message === 'NEED_LOGIN'); wx.showToast({ icon: 'none', title: needLogin ? '请先登录' : '删除失败' }) }
      },
    })
  },

  onMarkRenewed(e: WechatMiniprogram.TouchEvent) {
    if (!this.ensureFreshResourceData()) return
    const ds = (e.currentTarget.dataset as any)
    const group = ds.group as 'servers' | 'domains'
    const idx = ds.index as number
    const list = (this.data as any)[group].slice()
    const item = { ...(list[idx] || {}) }
    const now = new Date()

    const parsePeriod = (base: Date, str?: string) => {
      if (!str) return null
      const s = String(str).trim().toLowerCase()
      const m = s.match(/\d+(?:\.\d+)?/)
      if (!m) return null
      const num = parseFloat(m[0])
      let addMonths = 0
      let addDays = 0
      if (s.includes('年') || s.includes('year') || s.includes('y')) addMonths = Math.round(12 * num)
      else if (s.includes('月') || s.includes('mon') || s === 'm') addMonths = Math.round(num)
      else if (s.includes('周') || s.includes('week') || s.includes('w')) addDays = Math.round(7 * num)
      else if (s.includes('天') || s.includes('日') || s.includes('day') || s.includes('d')) addDays = Math.round(num)
      else addMonths = Math.round(num)
      const y = base.getFullYear(); const mon = base.getMonth(); const d = base.getDate()
      const tmp = new Date(y, mon + addMonths, d)
      return new Date(tmp.getTime() + addDays * 24 * 60 * 60 * 1000)
    }

    const next = parsePeriod(now, item.renewPeriod)
    if (!next) { wx.showToast({ icon: 'none', title: '请先填写有效的续期周期' }); return }
    const y = next.getFullYear(); const m = String(next.getMonth() + 1).padStart(2, '0'); const d = String(next.getDate()).padStart(2, '0')
    item.expiresAt = `${y}-${m}-${d}`
    if (!item.registeredAt) {
      const y0 = now.getFullYear(); const m0 = String(now.getMonth() + 1).padStart(2, '0'); const d0 = String(now.getDate()).padStart(2, '0')
      item.registeredAt = `${y0}-${m0}-${d0}`
    }

    list[idx] = item
    if (group === 'servers') {
      this.setData({ servers: list, serverGroups: this.buildGroups(list, this.data.serverCollapsed), registrarOptions: this.rebuildRegistrarOptions(list, this.data.domains) } as any)
    } else {
      this.setData({ domains: list, domainGroups: this.buildGroups(list, this.data.domainCollapsed), registrarOptions: this.rebuildRegistrarOptions(this.data.servers, list) } as any)
    }

    this.commitToCloud(this.data.servers, this.data.domains)
      .then(() => wx.showToast({ icon: 'success', title: '到期时间已更新' }))
      .catch((err: any) => { const needLogin = err && (err.needLogin || err.message === 'NEED_LOGIN'); wx.showToast({ icon: 'none', title: needLogin ? '请先登录' : '更新失败' }) })
  },

  async ensureAuthorized() {
    if (getSessionSnapshot().loggedIn) return
    wx.showToast({ icon: 'none', title: '请先登录后再保存' })
    wx.navigateTo({ url: '/pages/login/index' })
    const err: any = new Error('NEED_LOGIN')
    err.needLogin = true
    throw err
  },

  ensureFreshResourceData(): boolean {
    if (!this.data.cachePreview) return true
    wx.showToast({ icon: 'none', title: '缓存预览中，请刷新后再编辑' })
    this.loadFromCloud(true)
    return false
  },

  async initOwnerAndLoad() {
    await this.loadFromCloud()
  },

  async commitToCloud(servers: ServerItem[], domains: DomainItem[]) {
    await this.ensureAuthorized()

    const doc = { servers, domains, updatedAt: Date.now() }
    const ret = await request('/resources', 'POST', doc)

    if (!ret.success) {
      throw new Error(ret.error || 'Save failed')
    }
  },

  buildGroups<T extends { registrar?: string }>(list: T[], collapsed: Record<string, boolean>): Array<Group<T>> {
    const map = new Map<string, Array<GroupItem<T>>>()
    list.forEach((it, idx) => {
      const reg = (it && (it.registrar || '')).trim()
      const key = reg || '未填写注册商'
      const arr = map.get(key) || []
      arr.push({ data: it, index: idx, display: this.buildDisplayValues(it) })
      map.set(key, arr)
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, items]) => ({ group: name, items, collapsed: !!(collapsed && collapsed[name]) }))
  },

  rebuildRegistrarOptions(servers: ServerItem[], domains: DomainItem[]): RegistrarOption[] {
    const map = new Map<string, RegistrarOption>()
      ; (servers || []).forEach((s) => {
        if (!s) return
        const n = (s.registrar || '').trim()
        if (!n) return
        const ex = map.get(n)
        if (ex) {
          if (!ex.siteUrl && s.siteUrl) ex.siteUrl = s.siteUrl
          if (!ex.advanceNoticeDays && s.advanceNoticeDays) ex.advanceNoticeDays = s.advanceNoticeDays
          if (!ex.renewPeriod && s.renewPeriod) ex.renewPeriod = s.renewPeriod
          if (!ex.config && s.config) ex.config = s.config
        } else map.set(n, { name: n, siteUrl: s.siteUrl, advanceNoticeDays: s.advanceNoticeDays, renewPeriod: s.renewPeriod, config: s.config })
      })
      ; (domains || []).forEach((d) => {
        if (!d) return
        const n = (d.registrar || '').trim()
        if (!n) return
        const ex = map.get(n)
        if (ex) {
          if (!ex.siteUrl && d.siteUrl) ex.siteUrl = d.siteUrl
          if (!ex.advanceNoticeDays && d.advanceNoticeDays) ex.advanceNoticeDays = d.advanceNoticeDays
          if (!ex.renewPeriod && d.renewPeriod) ex.renewPeriod = d.renewPeriod
        } else map.set(n, { name: n, siteUrl: d.siteUrl, advanceNoticeDays: d.advanceNoticeDays, renewPeriod: d.renewPeriod })
      })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  },

  buildDisplayValues(item: any): Record<string, string> {
    const cachedDisplay = (item && item.__display) || {}
    return {
      username: item && item.username ? maskSensitiveText(item.username, { head: 2, tail: 2, mask: '****' }) : (cachedDisplay.username || ''),
      password: item && item.password ? String(item.password) : (cachedDisplay.password || ''),
      email: item && item.email ? String(item.email) : (cachedDisplay.email || ''),
    }
  },

  onPickRegistrarChange(e: WechatMiniprogram.PickerChange) {
    const i = Number(e.detail.value)
    const opt = (this.data.registrarOptions as any)[i] as RegistrarOption
    if (!opt) return
    const n = (this.data.modalData || {}) as any
    const merged: any = { ...n, registrar: opt.name }
    if (opt.siteUrl && !n.siteUrl) merged.siteUrl = opt.siteUrl
    if (opt.advanceNoticeDays && !n.advanceNoticeDays) merged.advanceNoticeDays = opt.advanceNoticeDays
    if (opt.renewPeriod && !n.renewPeriod) merged.renewPeriod = opt.renewPeriod
    if ((opt as any).config && !n.config) merged.config = (opt as any).config
    this.setData({ modalData: merged })
  },

  onToggleGroup(e: WechatMiniprogram.TouchEvent) {
    const ds = (e.currentTarget.dataset as any)
    const list = ds.list as 'servers' | 'domains'
    const group = ds.group as string
    if (list === 'servers') {
      const m: any = { ...(this.data.serverCollapsed || {}) }
      m[group] = !m[group]
      this.setData({ serverCollapsed: m, serverGroups: this.buildGroups(this.data.servers, m) } as any)
    } else {
      const m: any = { ...(this.data.domainCollapsed || {}) }
      m[group] = !m[group]
      this.setData({ domainCollapsed: m, domainGroups: this.buildGroups(this.data.domains, m) } as any)
    }
  },

  onOpenAddServer() {
    if (!this.ensureFreshResourceData()) return
    this.setData({ showModal: true, modalTitle: '新增服务器', modalType: 'server', modalIndex: -1, modalData: { name: '', ip: '', region: '' } })
  },
  onOpenCreateMenu() {
    if (!this.ensureFreshResourceData()) return
    wx.showActionSheet({ itemList: ['新增服务器', '新增域名'], success: (r) => { if (r.tapIndex === 0) this.onOpenAddServer(); if (r.tapIndex === 1) this.onOpenAddDomain() } })
  },
  onSwitchTab(e: WechatMiniprogram.TouchEvent) { this.setData({ activeTab: (e.currentTarget.dataset as any).tab }) },
  onOpenAddDomain() { if (!this.ensureFreshResourceData()) return; this.setData({ showModal: true, modalTitle: '新增域名', modalType: 'domain', modalIndex: -1, modalData: { host: '', pointsTo: '', note: '' } }) },
  onEditServer(e: WechatMiniprogram.TouchEvent) { if (!this.ensureFreshResourceData()) return; const i = (e.currentTarget.dataset as any).index; const base = (((this.data.servers as any)[i]) || {}); this.setData({ showModal: true, modalTitle: '编辑服务器', modalType: 'server', modalIndex: i, modalData: { ...base } as any }) },
  onEditDomain(e: WechatMiniprogram.TouchEvent) { if (!this.ensureFreshResourceData()) return; const i = (e.currentTarget.dataset as any).index; const base = (((this.data.domains as any)[i]) || {}); this.setData({ showModal: true, modalTitle: '编辑域名', modalType: 'domain', modalIndex: i, modalData: { ...base } as any }) },
  onModalInput(e: WechatMiniprogram.Input) { const f = (e.currentTarget.dataset as any).field; const v = e.detail.value; this.setData({ modalData: { ...(this.data.modalData || {}), [f]: v } as any }) },
  onModalDateChange(e: WechatMiniprogram.PickerChange) { const f = (e.currentTarget.dataset as any).field; const v = e.detail.value; this.setData({ modalData: { ...(this.data.modalData || {}), [f]: v } as any }) },
  onModalCancel() { this.setData({ showModal: false }) },
  noop() {},

  async onModalSave() {
    if (!this.ensureFreshResourceData()) return
    const { modalType, modalIndex, modalData } = this.data
    if (modalType === 'server') {
      const list: any[] = (this.data.servers.slice() as any[])
      if (modalIndex > -1) list[modalIndex] = modalData
      else list.push(modalData)
      this.setData({ servers: list, serverGroups: this.buildGroups(list, this.data.serverCollapsed), registrarOptions: this.rebuildRegistrarOptions(list, this.data.domains) } as any)
    } else {
      const list: any[] = (this.data.domains.slice() as any[])
      if (modalIndex > -1) list[modalIndex] = modalData
      else list.push(modalData)
      this.setData({ domains: list, domainGroups: this.buildGroups(list, this.data.domainCollapsed), registrarOptions: this.rebuildRegistrarOptions(this.data.servers, list) } as any)
    }
    this.setData({ showModal: false })
    try { await this.commitToCloud(this.data.servers, this.data.domains); wx.showToast({ icon: 'success', title: '已保存' }) }
    catch (err: any) { const needLogin = err && (err.needLogin || err.message === 'NEED_LOGIN'); wx.showToast({ icon: 'none', title: needLogin ? '请先登录' : '保存失败' }) }
  },

  async onSave() {
    if (!this.ensureFreshResourceData()) return
    this.setData({ saving: true })
    try { await this.commitToCloud(this.data.servers, this.data.domains) }
    catch (err) { logger.error('保存失败', err, 'Resources'); const needLogin = (err as any) && ((err as any).needLogin || (err as any).message === 'NEED_LOGIN'); wx.showToast({ icon: 'none', title: needLogin ? '请先登录' : '保存失败' }); return }
    finally { this.setData({ saving: false }) }
    wx.showToast({ icon: 'success', title: '已保存' })
  },
})
