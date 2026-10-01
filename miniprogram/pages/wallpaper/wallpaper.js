const api = require('../../utils/api.js')
const { t, texts } = require('../../utils/i18n.js')
const { THEMES, toneColor, themeOf, themeLabel } = require('../../utils/palette.js')

// 这一页原来在壁纸下面还有一排「界面字体」，站长 09-26 撤掉了：iOS 和安卓真机都证伪——
// 微信的 webview 不认这些系统字体名，点了不会换字（模拟器能换是假证据，它读的是 macOS 字体表）。
// 开关和字体栈本身留着（app.js 的 uiFont/setUIFont、app.wxss 与 tab 栏组件里的三个 .font-* 类），
// 哪天真要走 wx.loadFontFace 挂自己的字体文件，把这一排加回来就行。

// 描边取不到中性值的那四枚（lineEdge 是 transparent），按深浅给一条最淡的边。
function edgeOf(theme) {
  if (theme.lineEdge !== 'transparent') return theme.lineEdge
  return theme.dark ? 'rgba(255,255,255,0.18)' : 'rgba(35,37,44,0.12)'
}

// 那一套主题下的"墨"。预览那一屏和条子里的勾/描边都要用它，只此一处算——
// 原来两处各写了一遍三元表达式，改一处就会让预览和条子对不上。
function inkOf(theme) {
  if (theme.dark) return '#f2f4fb'
  return theme.ramp ? theme.ramp.inks[0] : '#23252c'
}

/**
 * 手机模拟预览要画的那一屏。
 * 这些颜色一律是从"被预览的那套主题"算出来的字面值，不吃当前主题的 CSS 变量——
 * 吃了就永远只能画出已经生效的那一套，预览也就没意义了。
 * 四行笔记左侧的方块是关键：带色阶的那两枚走自己那一支色相的深浅档，
 * 其余六枚走分类彩色，这正是"整套色阶"唯一一眼看得出的差别，所以必须画进预览，
 * 不再靠原来那个角标去解释。
 */
function mockOf(key) {
  const theme = themeOf(key)
  const ink = inkOf(theme)
  const bar = theme.dark ? 'rgba(255,255,255,0.20)' : 'rgba(35,37,44,0.13)'
  return {
    frame: ink,
    page: theme.page,
    ink,
    card: theme.line,
    edge: edgeOf(theme),
    bar,
    rows: [1, 2, 3, 4].map((n) => toneColor(n, theme.key)),
    // 预览画的是笔记列表那一屏，所以 tab 高亮左起第二格（左一是新建）
    tabs: [0, 1, 2, 3].map((n) => (n === 1 ? toneColor(0, theme.key) : bar)),
  }
}

Page({
  data: {
    wallpapers: [],
    currentWallpaper: 'default',
    currentLabel: '',
    previewKey: 'default',
    previewing: false,
    mock: mockOf('default'),
    intoView: '',
    applying: false,
    themeClass: '',
    lang: 'zh',
    t: texts('zh'),
  },

  async onShow() {
    const app = getApp()
    // 先等登录落定再读壁纸：不带 local 的那六枚是从服务端 userInfo.wallpaper 来的，
    // 冷启动抢先进这页会读到 'default'，于是这一页显示米白、别的页已经是深海。
    // （和首页、新建页同一套做法。）
    await app.getLoginPromise().catch(() => {})
    const lang = (app.globalData.userInfo && app.globalData.userInfo.language) || 'zh'
    const current = app.getWallpaper()
    this.setData({
      lang,
      t: texts(lang),
      currentWallpaper: current,
      currentLabel: themeLabel(current, lang),
      // 这一页自己也要走 applyTheme：只拿类名的话，导航条底色停在上一页那套主题，
      // 换完壁纸"导航条必须和页面底同值"这条约束在本页是破的（选完才补上，进页那一瞬不对）。
      themeClass: app.applyTheme(current),
      // 先清成空串再在下一拍给目标 id：值没变的话 scroll-into-view 不会重新滚
      // （从别处切回这一页时，条子该停在"在用那一枚"，不是停在用户上次滑走的位置）。
      intoView: '',
      ...this.previewState(current, current),
      // 深色那两枚（夜紫 / 深海）不再出现在条子里，09-30 屏蔽，理由见 app.js 里
      // getWallpaper 那段注释。先按原下标算色块、再滤，顺序不能反：那一格里的两枚小色块
      // 吃的是 THEMES 里的下标（toneColor(i)），先滤掉会让象牙/天青从第 7、8 档跳到第 5、6 档，
      // 那是另一件事，不该被这次屏蔽顺手改掉。
      wallpapers: THEMES
        .map((theme, i) => ({ theme, i }))
        .filter(({ theme }) => !theme.dark)
        .map(({ theme, i }) => ({
          key: theme.key,
          label: themeLabel(theme.key, lang),
          active: theme.key === current,
          stack: [toneColor(i, theme.key), toneColor(i + 1, theme.key)],
          // 主题在 CSS 里是类名，但每一格画的是"另一套主题"，拿不到当前主题的变量，
          // 底、描边、勾的颜色都得由 JS 带进行内。--wp-opp 是勾里的字，要和勾本身反色。
          itemStyle:
            `background:${theme.page};--wp-label:${inkOf(theme)};` +
            `--wp-opp:${theme.page};--wp-edge:${edgeOf(theme)}`,
        })),
    })
    // 条子进来先滚到"在用的那一枚"：不带色阶那六枚排在前面，在用的若是最后两枚，
    // 不滚过去就看不见，会以为没存上。scroll-into-view 要等节点建好，同一批 setData 里给不生效。
    wx.nextTick(() => this.setData({ intoView: `wp-${current}` }))
    app.setNavTitle('wallpaper', lang)
  },

  // 预览态：点色块只改这里，页面本身的主题不动。
  // 哪一枚在"试看"由 WXML 现算（previewing && item.key === previewKey），
  // 不在数据里另存一份，免得两处状态对不上。
  previewState(key, current) {
    const cur = current === undefined ? this.data.currentWallpaper : current
    return { previewKey: key, previewing: key !== cur, mock: mockOf(key) }
  },

  onPreview(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.previewKey) return
    this.setData({ ...this.previewState(key), intoView: `wp-${key}` })
  },

  // 点上面那部手机才算"就它了"。
  onApply() {
    const { previewKey, currentWallpaper, applying, lang } = this.data
    // 遮罩要等 setData 落到视图层才挡手，同一帧里连点两下就会发两次 PUT
    if (applying) return
    if (previewKey === currentWallpaper) {
      wx.showToast({ title: t('sameWallpaper', lang), icon: 'none' })
      return
    }
    this.applyWallpaper(previewKey)
  },

  async applyWallpaper(key) {
    const { lang } = this.data
    const app = getApp()

    // 带色阶那两枚只存在本机：后端 PUT /api/user/wallpaper 有一张 WALLPAPER_PRESETS 白名单，
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
      // setWallpaper 里已经顺手把 globalData.userInfo.wallpaper 写上了，这里不再重复一遍
      app.setWallpaper(key)
      // 导航条和 tab 栏由 applyTheme 统一负责，这里不再自己拼颜色
      app.applyTheme(key)
      this.setData({ applying: false })
      this.onShow()
      wx.showToast({ title: t('applied', lang), icon: 'success' })
    } catch (err) {
      this.setData({ applying: false })
      // 失败也要按真实状态重刷一遍：401 那条路会被 api.js 清掉 userInfo 并重登，
      // 重登回来服务端那套可能已经不是刚才点的那枚了，不刷就是界面和生效的两套。
      this.onShow()
      wx.showToast({ title: t('setFailed', lang), icon: 'none' })
    }
  },
})
