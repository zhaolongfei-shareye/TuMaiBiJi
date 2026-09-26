const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { THEMES, toneColor, themeOf } = require('../../utils/palette.js')

// 界面字体四档。cls 是挂在 .container 上的类名，具体字体栈在 app.wxss；
// 空串＝不挂＝沿用默认那条苹方链。这一档只存在本机（见 app.js 里 UI_FONT_KEY 那段）。
const FONTS = [
  { key: 'default', cls: '', labelKey: 'fontDefault' },
  { key: 'song', cls: 'font-song', labelKey: 'fontSong' },
  { key: 'fang', cls: 'font-fang', labelKey: 'fontFang' },
  { key: 'kai', cls: 'font-kai', labelKey: 'fontKai' },
]

Page({
  data: {
    wallpapers: [],
    fonts: [],
    uiFont: 'default',
    currentWallpaper: 'default',
    applying: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  onShow() {
    const app = getApp()
    const lang = (app.globalData.userInfo && app.globalData.userInfo.language) || 'zh'
    const current = app.getWallpaper()
    const uiFont = app.uiFont()
    this.setData({
      lang,
      t: texts(lang),
      currentWallpaper: current,
      uiFont,
      // 这一页自己也要走 applyTheme：只拿类名的话，导航条底色停在上一页那套主题，
      // 换完壁纸"导航条必须和页面底同值"这条约束在本页是破的（选完才补上，进页那一瞬不对）。
      themeClass: app.applyTheme(current),
      wallpapers: THEMES.map((theme, i) => ({
        key: theme.key,
        label: theme.label,
        active: theme.key === current,
        tinted: !!theme.ramp,
        // 主题在 CSS 里是类名，但缩略图要同时画出每一套各自的底色和字色，只能把值带到行内。
        // --wp-opp 是给勾选圆点里的字用的：圆点本身取 --wp-label，正好和它形成对比。
        itemStyle: `background: ${theme.page}; --wp-label: ${theme.dark ? '#f2f4fb' : (theme.ramp ? theme.ramp.inks[0] : '#23252c')}; --wp-opp: ${theme.page}`,
        line: theme.line,
        lineEdge: theme.lineEdge,
        // 缩略图里那两个小色块画的是"这一格那套主题"下的方块色，不是当前主题下的，
        // 所以主题 key 必须传给 toneColor：淡雅两枚按自己在 THEMES 里的下标取档
        // （米白一色是第 7 格 → steps[1] 和 steps[2]，雨过青是第 8 格 → steps[2] 和 steps[3]），
        // 其余六枚仍取分类色板那五支彩色。
        stack: [toneColor(i, theme.key), toneColor(i + 1, theme.key)],
      })),
      fonts: FONTS.map((f) => ({
        key: f.key,
        cls: f.cls,
        label: t(f.labelKey, lang),
        demo: t('fontDemo', lang),
        active: f.key === uiFont,
      })),
    })
    app.setNavTitle('wallpaper', lang)
  },

  async onSelect(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.currentWallpaper) return

    const { lang } = this.data
    const app = getApp()

    // 淡雅那两枚只存在本机：后端 PUT /api/user/wallpaper 有一张 WALLPAPER_PRESETS 白名单，
    // 那是现网代码，加 key 就要动后端并部署，所以这一类不写库、不跨设备。
    // 表现上的差别：换设备或删掉小程序重装，会回到服务端记着的那一枚。
    if (themeOf(key).local) {
      app.setWallpaper(key)
      app.applyTheme(key)
      this.onShow()
      wx.showToast({ title: t('applied', lang), icon: 'success' })
      return
    }

    this.setData({ applying: true })
    try {
      await api.updateWallpaper(key)
      app.setWallpaper(key)
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

  // 换字体只影响这一台设备。当前这一页立刻重挂类名，其余页面在各自 onShow 里
  // 走 applyTheme 时跟上——不做跨页强制刷新，为这个再写一套事件总线不值当。
  onFont(e) {
    const key = e.currentTarget.dataset.key
    const app = getApp()
    if (key === this.data.uiFont) return
    app.setUIFont(key)
    app.applyTheme(this.data.currentWallpaper)
    this.setData({
      uiFont: app.uiFont(),
      themeClass: app.getThemeClass(this.data.currentWallpaper),
      fonts: this.data.fonts.map((f) => ({ ...f, active: f.key === app.uiFont() })),
    })
  },
})
