const { themeOf, UNCATEGORIZED, withAlpha } = require('../utils/palette.js')

Component({
  data: {
    // 0 新建 / 1 笔记 / 2 我的。新建放最左是刻意的：新用户第一次进来落到的就是
    // 那三个色块，"往哪儿存"这件事不用先找入口。
    selected: 0,
    lang: 'zh',
    list: [],
    dark: false,
    fontCls: '',
    // 胶囊底色和它的投影：由 JS 递进来（组件读不到 page 上的 CSS 变量）。
    // 六枚普通壁纸下这两个值就是原来写死的 #23252c / rgba(35,37,44,.28)，一字没变；
    // 淡雅那两枚的墨色是暖褐 / 冷绿，胶囊再留冷墨就成了满屏同色系里唯一跳色相的一块。
    inkStyle: '',
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
      // 组件读不到 page 上的 CSS 变量，深色与否只能由 JS 判出来挂类名；
      // 判定结果一律取 palette 里那份，不在这里另记一遍壁纸名单。
      // 界面字体也是同一个道理：app.wxss 里那些 .font-* 类进不了这个组件，
      // 只能把类名递进来，字体栈在本组件 wxss 里再写一遍（见那边的注释）。
      const app = getApp()
      const theme = themeOf(wallpaper)
      // 胶囊用的就是"这套主题里那块墨色"：色阶两枚取自己 ramp 的未分类色，
      // 其余六枚取全局那块墨黑——所以六枚下算出来的值和改动前逐字节相同。
      const ink = theme.ramp ? theme.ramp.uncategorized.bg : UNCATEGORIZED.bg
      this.setData({
        dark: theme.dark,
        fontCls: app.uiFontClass ? app.uiFontClass() : '',
        inkStyle: `--tab-ink:${ink};--tab-shadow:${withAlpha(ink, 0.28)}`,
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
