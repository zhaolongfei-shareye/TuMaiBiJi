const { chromeOf } = require('../utils/palette.js')

Component({
  data: {
    // 0 新建 / 1 笔记 / 2 我的。新建放最左是刻意的：新用户第一次进来落到的就是
    // 那三个色块，"往哪儿存"这件事不用先找入口。
    selected: 0,
    lang: 'zh',
    list: [],
    fontCls: '',
    // 胶囊那一块面连同字色、发丝边、投影：由 JS 递进来（组件读不到 page 上的 CSS 变量），
    // 值全部来自 palette.chromeOf——和首页那条搜索条是同一个函数，所以这两块面永远同色。
    // 以前这里是"墨黑常量 + 深色壁纸换一块写死的 #1a1c22"，八枚壁纸只有两种胶囊。
    chromeStyle: '',
  },

  attached() {
    this.updateLabels()
    const app = getApp()
    if (app.globalData.userInfo) {
      this.applyTheme(app.getWallpaper())
    }
  },

  methods: {
    applyTheme(wallpaper) {
      // 组件读不到 page 上的 CSS 变量，颜色只能由 JS 算好递进来；
      // 判定结果一律取 palette 里那份，不在这里另记一遍壁纸名单。
      // 界面字体也是同一个道理：app.wxss 里那些 .font-* 类进不了这个组件，
      // 只能把类名递进来，字体栈在本组件 wxss 里再写一遍（见那边的注释）。
      const app = getApp()
      this.setData({
        fontCls: app.uiFontClass ? app.uiFontClass() : '',
        chromeStyle: chromeOf(wallpaper).style,
      })
    },

    updateLabels() {
      const { t } = require('../utils/i18n.js')
      const lang = getApp().globalData.userInfo?.language || 'zh'
      this.setData({
        lang,
        list: [
          {
            pagePath: '/pages/create/create',
            text: t('tabCreate', lang),
            icon: 'create',
          },
          {
            pagePath: '/pages/index/index',
            text: t('tabNotes', lang),
            icon: 'notes',
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
