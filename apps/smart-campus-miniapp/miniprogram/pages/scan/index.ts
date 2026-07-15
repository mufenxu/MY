import * as logger from '../../utils/logger'
import request from '../../utils/request'

Page({
  _cameraInitTimer: null as number | null,
  _isAlive: false,
  data: {
    flashState: 'off', // 'on' or 'off'
    isScanning: false,
    showCamera: false
  },

  _setDataSafe(patch: Record<string, any>) {
    if (!this._isAlive) return
    this.setData(patch)
  },

  onLoad() {
    this._isAlive = true
    logger.debug('Scan page loaded', undefined, 'ScanPage')
  },

  onShow() {
    this._isAlive = true
    this._setDataSafe({ isScanning: false })
    if (this._cameraInitTimer) {
      clearTimeout(this._cameraInitTimer)
      this._cameraInitTimer = null
    }
    // 利用延迟初始化原生组件和动画，避免挤占页面进入动画的资源导致卡顿现象
    this._cameraInitTimer = setTimeout(() => {
      this._cameraInitTimer = null
      this._setDataSafe({ showCamera: true })
    }, 450)
  },

  onHide() {
    if (this._cameraInitTimer) {
      clearTimeout(this._cameraInitTimer)
      this._cameraInitTimer = null
    }
    this.setData({ isScanning: false })
    this._isAlive = false
    // 隐藏时销毁相机释放内存
    this.setData({ showCamera: false })
  },

  onUnload() {
    if (this._cameraInitTimer) {
      clearTimeout(this._cameraInitTimer)
      this._cameraInitTimer = null
    }
    this._isAlive = false
  },

  goBack() {
    wx.navigateBack({ delta: 1 })
  },

  toggleFlash() {
    this.setData({
      flashState: this.data.flashState === 'off' ? 'on' : 'off'
    })
  },

  onCameraError(e: any) {
    logger.error('Camera error', e, 'ScanPage')
    wx.showModal({
      title: '摄像头异常',
      content: '无法访问摄像头，请检查您的权限设置。',
      showCancel: false,
      success: () => {
        this.goBack()
      }
    })
  },

  async onScanCode(e: any) {
    if (this.data.isScanning) return;
    this._setDataSafe({ isScanning: true });
    
    // Turn off flash successfully and prevent multiple trigger
    const qrTokenRaw = e.detail.result;
    logger.debug('Camera scanned code', qrTokenRaw, 'ScanPage');
    await this.processQrCode(qrTokenRaw);
  },

  async openAlbum() {
    try {
      if (this.data.isScanning) return;
      
      const res = await wx.scanCode({
        onlyFromCamera: false,
        scanType: ['qrCode']
      });
      this._setDataSafe({ isScanning: true });
      await this.processQrCode(res.result);
    } catch (err: any) {
      if (err.errMsg && err.errMsg.indexOf('cancel') > -1) {
        this._setDataSafe({ isScanning: false });
        return;
      }
      logger.error('Album scan error', err, 'ScanPage');
      wx.showToast({ title: '没有发现二维码', icon: 'none' });
      this._setDataSafe({ isScanning: false });
    }
  },

  async processQrCode(rawResult: string) {
    wx.showLoading({ title: '正在识别...' });
    
    let qrToken = rawResult;
    if (qrToken.includes('t=')) {
      try {
        qrToken = qrToken.split('t=')[1].split('&')[0];
      } catch (e) {
        // Fallback if parsing fails
      }
    }
    
    try {
      const scanRes = await request<any>('/mp/auth/scan', 'POST', { qrToken });
      wx.hideLoading();
      
      if (scanRes && scanRes.success) {
        const appName = scanRes.appName || '未知应用';
        const url = `/pages/auth/scan-confirm/scan-confirm?t=${qrToken}&n=${encodeURIComponent(appName)}`;
        wx.redirectTo({
          url,
          fail: (err) => {
            logger.error('Redirect to confirm failed', err, 'ScanPage')
            this._setDataSafe({ isScanning: false })
          }
        });
      } else {
        logger.warn('Scan failed backend response', scanRes, 'ScanPage');
        wx.showModal({
          title: '识别失败',
          content: scanRes?.message || '无法识别该二维码或已过期',
          showCancel: false,
          success: () => {
            this._setDataSafe({ isScanning: false });
          }
        });
      }
    } catch (err: any) {
      wx.hideLoading();
      logger.error('Process QR error', err, 'ScanPage');
      wx.showToast({ title: '网络处理出错', icon: 'none' });
      this._setDataSafe({ isScanning: false });
    }
  }
})
