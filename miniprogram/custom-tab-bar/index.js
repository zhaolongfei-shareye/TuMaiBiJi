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
      const dark = wallpaper === 'gradient-purple' || wallpaper === 'gradient-ocean'
      this.setData({ dark })
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
