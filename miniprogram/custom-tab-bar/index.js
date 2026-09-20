const { themeOf } = require('../utils/palette.js')

Component({
  data: {
    selected: 0,
    lang: 'zh',
    list: [],
    dark: false,
  },

  attached() {
    this.updateLabels()
    const app = getApp()
    if (app.globalData.userInfo) {
      this.applyTheme(app.globalData.userInfo.wallpaper || 'default')
    }
  },

  methods: {
    applyTheme(wallpaper) {
      // 组件读不到 page 上的 CSS 变量，深色与否只能由 JS 判出来挂类名；
      // 判定结果一律取 palette 里那份，不在这里另记一遍壁纸名单
      this.setData({ dark: themeOf(wallpaper).dark })
    },

    updateLabels() {
      const { t } = require('../utils/i18n.js')
      const lang = getApp().globalData.userInfo?.language || 'zh'
      this.setData({
        lang,
        list: [
          {
            pagePath: '/pages/index/index',
            text: t('tabNotes', lang),
            icon: 'notes',
          },
          {
            pagePath: '/pages/create/create',
            text: t('tabCreate', lang),
            icon: 'create',
          },
          {
            pagePath: '/pages/me/me',
            text: t('tabMe', lang),
            icon: 'me',
          },
        ],
      })
    },

    switchTab(e) {
      const index = e.currentTarget.dataset.index
      const item = this.data.list[index]
      if (this.data.selected !== index) {
        wx.switchTab({ url: item.pagePath })
      }
    },
  },
})
