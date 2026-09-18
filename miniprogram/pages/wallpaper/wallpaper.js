const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')

const WALLPAPER_MAP = {
  'default': { label: '默认', bg: '#f5f5f5', cardBg: 'rgba(255,255,255,0.85)' },
  'gradient-blue': { label: '海蓝', bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', cardBg: 'rgba(255,255,255,0.75)' },
  'gradient-green': { label: '青柠', bg: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', cardBg: 'rgba(255,255,255,0.75)' },
  'gradient-sunset': { label: '日落', bg: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', cardBg: 'rgba(255,255,255,0.75)' },
  'gradient-purple': { label: '星空', bg: 'linear-gradient(135deg, #0c0c1d 0%, #1a1a3e 50%, #2d1b69 100%)', cardBg: 'rgba(255,255,255,0.15)' },
  'gradient-ocean': { label: '深海', bg: 'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', cardBg: 'rgba(255,255,255,0.2)' },
}

Page({
  data: {
    wallpapers: [],
    currentWallpaper: 'default',
    applying: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onLoad() {
    const app = getApp()
    const lang = (app.globalData.userInfo && app.globalData.userInfo.language) || 'zh'
    const current = (app.globalData.userInfo && app.globalData.userInfo.wallpaper) || 'default'
    const list = Object.keys(WALLPAPER_MAP).map(key => ({
      key,
      label: WALLPAPER_MAP[key].label,
      bg: WALLPAPER_MAP[key].bg,
      active: key === current,
    }))
    this.setData({ wallpapers: list, currentWallpaper: current, lang, t: texts(lang), themeClass: app.getThemeClass(current) })
  },

  async onSelect(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.currentWallpaper) return

    const { lang } = this.data
    this.setData({ applying: true })
    try {
      await api.updateWallpaper(key)
      const app = getApp()
      if (app.globalData.userInfo) {
        app.globalData.userInfo.wallpaper = key
      }
      this.applyWallpaper(key)
      const list = this.data.wallpapers.map(w => ({ ...w, active: w.key === key }))
      this.setData({ wallpapers: list, currentWallpaper: key, applying: false, themeClass: app.getThemeClass(key) })
      wx.showToast({ title: t('applied', lang), icon: 'success' })
    } catch (err) {
      this.setData({ applying: false })
      wx.showToast({ title: t('setFailed', lang), icon: 'none' })
    }
  },

  applyWallpaper(key) {
    const config = WALLPAPER_MAP[key]
    if (!config) return
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    if (page) {
      const bgColor = config.bg.startsWith('linear') ? '#f5f5f5' : config.bg
      wx.setNavigationBarColor({
        frontColor: key === 'gradient-purple' || key === 'gradient-ocean' ? '#ffffff' : '#000000',
        backgroundColor: bgColor,
      })
    }
  },
})
