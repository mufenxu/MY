Page({
  data: {
    height: '',
    weight: '',
    canCalc: false,
    bmi: '',
    category: '',
    advice: '',
    hasResult: false,
    lt: '<',
    resultClass: '',
  },

  onHeightInput(e: WechatMiniprogram.Input) {
    const v = (e && e.detail && e.detail.value) || ''
    const s = String(v).replace(/[^0-9.]/g, '')
    const h = Number(s)
    const w = Number(this.data.weight)
    this.setData({ height: s, canCalc: h > 0 && w > 0 })
  },

  onWeightInput(e: WechatMiniprogram.Input) {
    const v = (e && e.detail && e.detail.value) || ''
    const s = String(v).replace(/[^0-9.]/g, '')
    const w = Number(s)
    const h = Number(this.data.height)
    this.setData({ weight: s, canCalc: h > 0 && w > 0 })
  },

  onCalc() {
    const h = Number(this.data.height)
    const w = Number(this.data.weight)
    if (h > 0 && w > 0) {
      const m = h / 100
      const bmi = w / (m * m)
      const rounded = Math.round(bmi * 10) / 10
      let cat = ''
      let adv = ''
      let klass = ''
      if (rounded < 18.5) { cat = '偏瘦'; adv = '多补充营养，适量力量训练。'; klass = 'result--thin' }
      else if (rounded < 24) { cat = '正常'; adv = '保持均衡饮食与规律运动。'; klass = 'result--normal' }
      else if (rounded < 28) { cat = '超重'; adv = '控制饮食热量，增加有氧运动。'; klass = 'result--over' }
      else if (rounded < 32) { cat = '肥胖'; adv = '建议循序渐进减脂，必要时咨询医生或营养师。'; klass = 'result--obese1' }
      else if (rounded < 36) { cat = '肥胖'; adv = '建议循序渐进减脂，必要时咨询医生或营养师。'; klass = 'result--obese2' }
      else { cat = '肥胖'; adv = '建议循序渐进减脂，必要时咨询医生或营养师。'; klass = 'result--obese3' }
      this.setData({ bmi: rounded.toFixed(1), category: cat, advice: adv, hasResult: true, resultClass: klass })
    }
  },

  onBack() {
    try {
      const pages = getCurrentPages && getCurrentPages()
      if (pages && pages.length > 1) {
        wx.navigateBack({ delta: 1 })
        return
      }
    } catch (_) {}
    const url = '/pages/index/index'
    if (wx.reLaunch) wx.reLaunch({ url })
    else if (wx.switchTab) wx.switchTab({ url })
    else wx.navigateTo({ url })
  },
})
