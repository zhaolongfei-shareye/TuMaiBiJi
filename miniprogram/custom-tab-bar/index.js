const { moodChromeOf } = require('../utils/palette.js')

Component({
  data: {
    // 0 新建 / 1 笔记 / 2 我的。新建放最左是刻意的：新用户第一次进来落到的就是
    // 那三个色块，"往哪儿存"这件事不用先找入口。
    selected: 0,
    lang: 'zh',
    list: [],
    // 胶囊那一块面连同字色、发丝边、投影、选中那枚圆底：由 JS 递进来（组件读不到 page 上的
    // CSS 变量），值全部来自 palette.chromeOf——和首页那条搜索条是同一个函数，
    // 所以这两块面永远同色。以前这里是"墨黑常量 + 深色壁纸换一块写死的 #1a1c22"，
    // 四枚壁纸只有两种胶囊。
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
      // 10-14 起这一层跟着「心情」走（站长：「下方的 tab 也与上面的同步」）。
      // ⚠ 传进来的那个参数是**壁纸**，不是心情：拿它去查心情会查不到、静默落回墨那一档，
      //    所以心情从 `app.glassMood()` 现读。壁纸这参数留着不改签名——三个 tab 页各自在
      //    onShow 里递它，动签名要连着改三处，不值。
      this.setData({ chromeStyle: moodChromeOf(getApp().glassMood().key).style })
    },

    updateLabels() {
      const { t } = require('../utils/i18n.js')
      const lang = getApp().globalData.userInfo?.language || 'zh'
      this.setData({
        lang,
        // text 不再上屏（三个标签 10-01 撤了），但它是 aria-label 和读屏的那一份，
        // 所以照旧跟着语言走，别处不读它。
        list: [
          {
            pagePath: '/pages/create/create',
            text: t('tabCreate', lang),
            icon: 'plus',
          },
          {
            pagePath: '/pages/index/index',
            text: t('tabNotes', lang),
            icon: 'rows3',
          },
          {
            pagePath: '/pages/me/me',
            text: t('tabMe', lang),
            icon: 'user',
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
