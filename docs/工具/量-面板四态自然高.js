// 量一件事：新建页那张暗面板在**每个状态**下的实际高度与"卡里最后一块的下沿"，
// 用来定那两个常量（收起 500 / 展开 580）。
// 为什么留着这个而不是只看静态那把尺子：500 那个数是盒子模型算出来的
// （上内边距 + 标签行 + 卡上边距 + 卡边框 + 卡内边距 + 内容 + 下内边距），
// 而算式里"标签行那一档"吃的是行高，中英文、字体回落都会变一两rpx——
// 加内容、换字号、改列数的时候先跑这一把看表格，再决定动不动那两个数。
// 跑法：docs/工具/跑尺子.sh 9431 量-面板四态自然高   （或 NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/量-面板四态自然高.js）
//
// 10-08 创建入口改版：原来这把读的是 .entry-body / .acts / .modes 三块，
// 现在面板肚子里是 .card，最后一块从"那排按钮"变成"那枚滑动条"（照片空态没有条，最后一块是三枚圈）。
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

const SHOT = '/assets/share-card.jpg'
// 六态：照片空 / 照片四张（还是一行）/ 照片六张（两行）/ 照片满九张 / 链接 / 文字收起 / 文字展开
const STATES = [
  ['photo', '照片·空', 0, false],
  ['photo', '照片·4 张', 4, false],
  ['photo', '照片·6 张', 6, false],
  ['photo', '照片·9 张（满）', 9, false],
  ['url', '链接', 0, false],
  ['write', '文字·收起', 0, false],
  ['write', '文字·展开', 0, true],
]

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const win = await mp.systemInfo()
  const toRpx = (px) => (px * 750) / win.windowWidth
  const page = await mp.reLaunch('/pages/create/create')
  await sleep(2500)

  const rows = []
  for (const lang of ['zh', 'en']) {
    for (const [active, label, shots, open] of STATES) {
      // 状态直接递到 data 上，再去调 _sync 把派生那三位（ready / 满 / 展开）算对——
      // 手动拼那三位就会量到"界面停在上一档的样子"，那正是这一把要抓的错。
      await mp.evaluate((p) => {
        const pg = getCurrentPages().slice(-1)[0]
        pg.setData(p.data)
        Object.keys(p.call).forEach((fn) => pg[fn](p.call[fn]))
      }, {
        data: {
          lang,
          t: i18n.texts(lang),
          active,
          sldIcon: { photo: 'images', url: 'link', write: 'pen' }[active],
          previewImages: Array.from({ length: shots }, () => SHOT),
          urlInput: active === 'url' ? 'https://mp.weixin.qq.com/s/abcdef' : '',
          urlHint: active === 'url' ? 'ok' : 'idle',
          writeBody: active === 'write' ? '第一段\n第二段' : '',
          bodyFocus: !!open,
          errLine: '',
        },
        call: { _sync: null },
      })
      await sleep(500)
      const geo = await mp.evaluate(() => new Promise((resolve) => {
        const q = wx.createSelectorQuery()
        q.select('.panel').boundingClientRect()
        q.select('.card').boundingClientRect()
        q.select('.out').boundingClientRect()
        q.selectViewport().scrollOffset()
        q.exec((r) => resolve(r))
      }))
      const [panel, card] = geo
      // 卡里最后一块 = 卡内那一层各块里下沿最大的那一个（文字展开态是那条，照片空态是那排圈）。
      // ⚠️ 只能一枚一枚按类名 selectAll：这台工具的 selectorQuery 不认子选择器 `>`、也不认逗号表
      //（10-08 实测两种写法都回 0 块，于是整列 NaN、"余量最小"那句印成 NaN 却仍然退出 0）。
      const kids = await mp.evaluate((list) => new Promise((resolve) => {
        const q = wx.createSelectorQuery()
        list.forEach((s) => { q.selectAll(s).boundingClientRect() })
        q.exec((r) => resolve([].concat(...(r || []).map((x) => x || []))))
      }), ['.crow', '.strip', '.field', '.wr-sw', '.sld'])
      const last = kids.length ? Math.max(...kids.map((x) => x.bottom)) : NaN
      rows.push({
        lang,
        态: label,
        面板: panel ? toRpx(panel.height).toFixed(1) : '没读到',
        卡内高: card ? toRpx(card.height).toFixed(1) : '没读到',
        最后一块底距面板底: panel && Number.isFinite(last) ? toRpx(panel.bottom - last).toFixed(1) : '量不到',
        溢出: panel && last > panel.bottom ? '是' : '',
      })
    }
  }
  console.table(rows)
  const over = rows.filter((r) => r.溢出)
  const heights = rows.map((r) => Number(r.面板)).filter(Number.isFinite)
  const margins = rows.map((r) => Number(r.最后一块底距面板底)).filter(Number.isFinite)
  console.log(`面板两档读数：${[...new Set(heights.map((h) => h.toFixed(0)))].join(' / ')}rpx`
    + `　余量最小 ${margins.length ? `${Math.min(...margins).toFixed(1)}rpx` : '量不到（一行的最后一块都没摸到）'}／${margins.length}/${rows.length} 个态量到了`)
  if (over.length) console.log(`✗ 有 ${over.length} 个态被顶出面板：${over.map((r) => `${r.lang}/${r.态}`).join('、')}`)
  if (margins.length !== rows.length) console.log(`✗ 有 ${rows.length - margins.length} 个态量不到"最后一块"（名单漏了一枚，见 kids 那段注释）`)
  await mp.disconnect()
  process.exit(over.length || margins.length !== rows.length ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(1) })
