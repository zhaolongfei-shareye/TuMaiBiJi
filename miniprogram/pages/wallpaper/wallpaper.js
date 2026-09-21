const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { THEMES, toneColor } = require('../../utils/palette.js')

Page({
  data: {
    wallpapers: [],
    currentWallpaper: 'default',
    applying: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onShow() {
    const app = getApp()
    const lang = (app.globalData.userInfo && app.globalData.userInfo.language) || 'zh'
    const current = (app.globalData.userInfo && app.globalData.userInfo.wallpaper) || 'default'
    this.setData({
      lang,
      t: texts(lang),
      currentWallpaper: current,
      themeClass: app.getThemeClass(current),
      wallpapers: THEMES.map((theme, i) => ({
        key: theme.key,
        label: theme.label,
        active: theme.key === current,
        // 主题在 CSS 里是类名，但缩略图要同时画出六套各自的底色和字色，只能把值带到行内。
        // --wp-opp 是给勾选圆点里的字用的：圆点本身取 --wp-label，正好和它形成对比。
        itemStyle: `background: ${theme.page}; --wp-label: ${theme.dark ? '#f2f4fb' : '#23252c'}; --wp-opp: ${theme.page}`,
        line: theme.line,
        lineEdge: theme.lineEdge,
        stack: [toneColor(i), toneColor(i + 1)],
      })),
    })
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
      // 导航条和 tab 栏由 applyTheme 统一负责，这里不再自己拼颜色
      app.applyTheme(key)
      this.setData({
        wallpapers: this.data.wallpapers.map((w) => ({ ...w, active: w.key === key })),
        currentWallpaper: key,
        themeClass: app.getThemeClass(key),
        applying: false,
      })
      wx.showToast({ title: t('applied', lang), icon: 'success' })
    } catch (err) {
      this.setData({ applying: false })
      wx.showToast({ title: t('setFailed', lang), icon: 'none' })
    }
  },
})
