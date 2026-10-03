// v19 笔记这一屏的真跑自证：在模拟器里真读几何、真截图、真点，最后走一遍真出图。
// 跑法：docs/工具/跑尺子.sh 9431 验-列表v19-真跑
// 前置：微信开发者工具已开、自动化端口 9431（跑尺子.sh 会先重启一次再跑）。
//
// 这一把管的是静态尺子管不到的三类事：
// ① 渲染之后的真实几何（两枚 tab 那条横线到不到卡边、日期那一列真 88、白垫真 474 高、
//    搜索条压到 60 之后字还放得下）；
// ② 点下去之后屏上真是切完的样子（两枚 tab、卡片那格左右两枚箭头、行→详情窗）；
// ③ 「生成过卡片」这条判据有没有真数据撑着——台账空着的时候，"只画生成过的那几篇"
//    就是 0===0 的空过。所以最后一段真点一次「生成笔记卡片」并保存，看它出不出现，
//    量完连文件一起删干净（10-03 那把 ⑨ 立的规矩：要特定数据才露得出来的那一格，
//    就自己把数据造出来再删干净，不许交空过）。
//
// ⚠ 四条 automator 的坑（v18 那把踩过的，这里仍然成立）：
//  · e.style() 只认 kebab-case（'font-size' 回值，'fontSize' 回 null，读到 null 会一路假红）；
//  · size()/offset() 回的是变换之后的外接框；
//  · 1rpx 在这台视口是 0.52px，"落在几 rpx 格子上"这类量一律放 ±2~3，真正的对位关系仍按 ±1；
//  · 界面语言是登录时从服务端带回的那一份，上一把真跑过登录的尺子会把测试号的 en 带进来，
//    所以开跑前钉成中文、收尾还回去（10-03 凌晨被这么红过三条）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')
const OUT = path.resolve(__dirname, '../design/10-03两tab与卡片网格/实测')
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const ZH = i18n.texts('zh')
const IDX_JS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })
// 摘要那一列的容量从源码现读：判据与代码同源，改了代码这条跟着动
const SUM_LINES = Number(/const SUM_LINES = (\d+)/.exec(IDX_JS)[1])
const SUM_CHARS = Number(/const SUM_CHARS = (\d+)/.exec(IDX_JS)[1])

// 本机台账：读、清（连文件一起），开跑与收尾各用一次
const CLEAR = () => {
  wx.removeStorageSync('cardLog')
  try {
    const fm = wx.getFileSystemManager()
    const dir = `${wx.env.USER_DATA_PATH}/cards`
    const files = fm.readdirSync(dir)
    files.forEach((f) => { try { fm.unlinkSync(`${dir}/${f}`) } catch (e) {} })
    return files.length
  } catch (e) { return 0 }
}
const COUNT = () => Object.keys(wx.getStorageSync('cardLog') || {}).length
// 第二张是"同一篇的第二套模板"，按篇数摸不到它，所以再数一遍总张数
const COUNT_ALL = () => {
  const m = wx.getStorageSync('cardLog') || {}
  return Object.keys(m).reduce((a, k) => a + ((m[k] || []).length), 0)
}

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 小程序那一侧的 console 能收上来（automator 的 on('console') 会先 App.enableLog）。
  // 台账为什么没记上，光看断言猜不出来——cardLog 里那三处 console.error 才是真相。
  // 但这一台工具上 on('console') 一条都没收到过（试过，日志是空的），所以另走一条：
  // 在应用里把 console.error 转调一份挂到 getApp().__probe，收尾用 evaluate 读出来。
  // 这是尺子自己的探针，跑完还原，不改产品代码。
  const logs = []
  mp.on('console', (m) => {
    const t = Array.isArray(m.text)
      ? m.text.map((x) => (x && x.value !== undefined ? x.value : String(x))).join(' ')
      : String(m.text == null ? '' : m.text)
    if (t.trim()) logs.push(`${m.type || 'log'} ${t.trim()}`)
  })
  await mp.evaluate(() => {
    const a = getApp()
    a.__probe = []
    a.__errOld = console.error
    console.error = function () {
      const args = Array.prototype.slice.call(arguments)
      try {
        a.__probe.push(args.map((x) => {
          if (typeof x === 'string') return x
          try { return JSON.stringify(x) } catch (e) { return String(x) }
        }).join(' '))
      } catch (e) {}
      try { a.__errOld.apply(console, args) } catch (e) {}
    }
  })
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  await mp.evaluate(() => { wx.removeStorageSync('bgDim') })
  await mp.evaluate(CLEAR)
  const page = await mp.reLaunch('/pages/index/index')
  await sleep(4500)

  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  const rpx = (px) => px / R
  const near = (px, target, tol) => Math.abs(rpx(px) - target) <= (tol === undefined ? 1 : tol)
  const $ = (sel) => page.$(sel)
  const $$ = (sel) => page.$$(sel)
  const rect = async (sel) => {
    const e = await page.$(sel)
    if (!e) return null
    const s = await e.size(), o = await e.offset()
    return { w: s.width, h: s.height, left: o.left, top: o.top, right: o.left + s.width, bottom: o.top + s.height }
  }
  const txt = async (sel) => {
    const e = await page.$(sel)
    return e ? String(await e.text() || '') : null
  }
  const css = async (sel, prop) => {
    const e = await page.$(sel)
    return e ? await e.style(prop) : null
  }
  const fs2rpx = async (sel) => parseFloat(String(await css(sel, 'font-size'))) / R
  const rgbOfHex = (h) => {
    const x = h.replace('#', '')
    return `rgb(${parseInt(x.slice(0, 2), 16)}, ${parseInt(x.slice(2, 4), 16)}, ${parseInt(x.slice(4, 6), 16)})`
  }
  const data = async (k) => (await page.data())[k]
  const tabAt = async (i) => (await $$('.vtab'))[i]
  const d0 = await page.data()
  const chipFs = await css('.chip', 'font-size')

  // ---------- ① 第一眼 ----------
  ck('这一把量的是中文那一面（下面钉的全是中文串，语言没钉住就会凭空红一片）',
    (await txt('.h1')) === '我的笔记', await txt('.h1'))
  ck('默认落在第一枚 tab「笔记列表」（他原话"默认第一个tab"，这一档不落本机）',
    d0.view === 'list', `view=${d0.view}`)
  ck('头部深浅仍停在中间那一档（罩子实读 0.5）',
    d0.dimV === 1 && (await css('.head-scrim', 'opacity')) === '0.5', await css('.head-scrim', 'opacity'))
  ck('右上角只剩「笔记」一列', d0.stats.length === 1 && d0.stats[0].l === ZH.statNotes, JSON.stringify(d0.stats))
  const ALL = d0.notes.length
  ck('这一屏有得可看，且列表那一屏一条不落（rows 条数 = 笔记条数）',
    ALL > 0 && (await $$('.xrow')).length === ALL, `${ALL} 篇 / ${d0.rows.length} 行`)
  ck('两批屏同源：卡片那一格每格都指得回原行（同一份序、同一份筛选）',
    d0.cells.every((c) => c.i >= 0 && c.i < ALL && d0.notes[c.i].id === c.id), `${d0.cells.length} 格`)

  // ---------- ② 图上那一行只剩搜索一枚 ----------
  const tools = await rect('.tools')
  ck('头部那一行左右各内缩 24、整行 88 高',
    near(tools.left, 24, 2) && near(tools.w, 702, 2) && near(tools.h, 88, 2),
    `left=${rpx(tools.left).toFixed(1)} w=${rpx(tools.w).toFixed(1)} h=${rpx(tools.h).toFixed(1)}`)
  const ics = await $$('.acts .ic')
  ck('右边只剩搜索一枚（纸片墙 / 一行那两枚连同中间那道竖线一起撤了）',
    ics.length === 1 && (await $$('.acts .vr')).length === 0 && (await ics[0].attribute('data-mode')) == null,
    `${ics.length} 枚`)
  ck('Tips 那一行有句子（没摊开搜索时才是它）',
    d0.tips.length >= 2 && d0.tips.includes(await txt('.tp-tx')), await txt('.tp-tx'))

  // ---------- ③ 区内顶上那两枚 tab ----------
  const vt = await rect('.vtabs')
  const tabs = await $$('.vtab')
  ck('两枚 tab 都在，文字就是「笔记列表 / 笔记卡片」（第二枚读现网 navShare，不是新串）',
    tabs.length === 2 && (await txt('.vtab')) === ZH.tabList && String(await tabs[1].text()) === ZH.navShare,
    `${await txt('.vtab')} / ${await tabs[1].text()}`)
  ck('那条通栏横线走到整块圆角卡的边（不外扩就会被 .sheet 那 24 收成 702）',
    near(vt.w, 750, 2) && near(vt.left, 0, 2), `w=${rpx(vt.w).toFixed(1)} left=${rpx(vt.left).toFixed(1)}`)
  const catsR = await rect('.cats'), listR = await rect('.list')
  ck('两枚 tab 与分类都在滚动区之外（不跟着列表滚）',
    catsR && listR && catsR.top >= vt.bottom && listR.top >= catsR.bottom,
    `tab底=${rpx(vt.bottom).toFixed(0)} 分类顶=${catsR && rpx(catsR.top).toFixed(0)} 分类底=${catsR && rpx(catsR.bottom).toFixed(0)} 区顶=${listR && rpx(listR.top).toFixed(0)}`)
  // 未选那一枚不能拿 '.vtab:not(.on)' 去够：automator 的选择器不支持 :not()，
  // 它会回**选中那一枚**的样式，于是这条永远绿（v18 那把自己撞的）。按下标取。
  const onIdx = (await data('view')) === 'list' ? 0 : 1
  const colAt = async (i) => String(await (await tabAt(i)).style('color'))
  ck('已选那枚 90% 黑 + 字重 700，未选那枚同一字号只 42% 黑（选中只靠颜色与字重，不靠壳）',
    (await colAt(onIdx)) === 'rgba(35, 37, 44, 0.9)'
    && (await colAt(1 - onIdx)) === 'rgba(35, 37, 44, 0.42)'
    && String(await (await tabAt(onIdx)).style('font-weight')) === '700',
    `已选=${await colAt(onIdx)} 未选=${await colAt(1 - onIdx)}`)
  ck('tab 字号与下面分类同一档（都是 --fs-meta 24，"小字"就是这一档）',
    (await css('.vtab', 'font-size')) === chipFs, `${await css('.vtab', 'font-size')} vs ${chipFs}`)
  ck('两枚那一行整高 70（效果图那个数），短杠压在通栏横线那一行上',
    near((await rect('.vtabs')).h, 70, 3), `${rpx((await rect('.vtabs')).h).toFixed(1)}rpx`)

  // ---------- ④ 列表那一行（X 那种排） ----------
  const rows = d0.rows
  const dateCol = await rect('.xd'), dot = await rect('.xd-dot')
  ck('左边那一列宽 88、只有日期与一枚圆点，整组竖向居中于这一条',
    near(dateCol.w, 88, 2) && near(dot.w, 14, 2) && !!(await $('.xd-d'))
    && Math.abs((dateCol.top + dateCol.bottom) / 2 - ((await rect('.xrow')).top + (await rect('.xrow')).bottom) / 2) <= 3,
    `列=${rpx(dateCol.w).toFixed(1)} 点=${rpx(dot.w).toFixed(1)}`)
  ck('日期那一档是 MM/DD 且吃全局那支数字字体（WtsjMind / 100）',
    /^\d\d\/\d\d$/.test(String(await txt('.xd-d')))
    && /WtsjMind/.test(String(await css('.xd-d', 'font-family'))), await txt('.xd-d'))
  ck('时间轴那根竖线与月份档整个没了',
    (await $$('.rail')).length === 0 && (await $$('.rm')).length === 0
    && (await $$('.rail-line')).length === 0, '')
  // white-space 这一支 automator 读不回来（回 null），拿它判"没生效"是假红——
  // 改成量高度：标题实测就是一行（字号 28 × 行高 1.35 ≈ 38rpx），两行会是 75 上下。
  // 折没折行这件事，几何比属性诚实。（text-overflow 能读到，留着一起钉。）
  const xT3 = [await css('.x-t', 'color'), await css('.x-t', 'white-space'), await css('.x-t', 'text-overflow')]
  const xTH = rpx((await rect('.x-t')).h)
  ck('标题 90% 黑、放不下就省略号、实测就是一行高（white-space 读不回，用几何判）',
    xT3[0] === 'rgba(35, 37, 44, 0.9)' && xT3[2] === 'ellipsis'
    && Math.abs(xTH - 38) <= 6,
    `色=${xT3[0]} 省略=${xT3[2]} 行高实测=${xTH.toFixed(1)}rpx`)
  ck('摘要是 70% 黑、字号与 Tips 同一档、最多三行',
    (await css('.x-s', 'color')) === 'rgba(35, 37, 44, 0.7)'
    && (await css('.x-s', 'font-size')) === (await css('.tp-tx', 'font-size'))
    && (await css('.x-s', '-webkit-line-clamp')) === '3',
    `摘要=${await css('.x-s', 'font-size')} Tips=${await css('.tp-tx', 'font-size')}`)
  ck('「显示更多」渲染出来就是 palette 那支蓝（不是页面里另抄的一份）',
    (await css('.x-more', 'color')) === rgbOfHex(p.TONES[1].bg),
    `${await css('.x-more', 'color')} vs ${rgbOfHex(p.TONES[1].bg)}`)
  const cap = SUM_LINES * SUM_CHARS
  ck('「显示更多」只画在真放不下三行那几条上（判据与代码同源：> 三行×每行字数）',
    rows.every((r) => r.more === (r.summary.replace(/\s/g, '').length > cap))
    && (await $$('.x-more')).length === rows.filter((r) => r.more).length,
    `阈值 ${cap} 字，屏上 ${(await $$('.x-more')).length} 枚`)
  ck('标题后面什么都不挂：「已分享」那一小块整屏不出现（公开状态只在详情窗里说）',
    (await $$('.shared-tag')).length === 0, '')
  ck('两条之间不画横线（行高由内容决定）',
    !/solid|dashed/.test(String(await css('.xrow', 'border-bottom'))), await css('.xrow', 'border-bottom'))
  const whoRows = rows.filter((r) => r.who).length
  ck('屏上昵称那一截的条数 = 数据里转存来的条数（0 也是真值，不空过）',
    (await $$('.x-who')).length === whoRows, `数据 ${whoRows} 条 / 屏上 ${(await $$('.x-who')).length} 截`)
  await mp.screenshot({ path: path.join(OUT, 'v19-1-列表默认.png') })

  // ---------- ⑤ 搜索摊开：压到 60 ----------
  await ics[0].tap()
  await sleep(1200)
  const srch = await rect('.srch')
  ck('搜索条压到 60 高（分类那一枚 chip 实测算高 59，压到同一档）',
    srch && near(srch.h, 60, 2), srch ? `${rpx(srch.h).toFixed(1)}rpx` : '没摊开')
  ck('摊开时 Tips 整条不渲染（现网那条规则没动）',
    (await $('.tp')) === null && (await $$('.srch')).length === 1, '')
  ck('右侧「搜索笔记」与分类同字号同字重（原来那档 31/800 比正文还大一级）',
    (await css('.srch-go', 'font-size')) === chipFs && (await css('.srch-go', 'font-weight')) === '600',
    `${await css('.srch-go', 'font-size')} vs chip ${chipFs}`)
  ck('输入里的字没动（仍 --fs-body 28：这轮只压条子和那两个字）',
    Math.abs((await fs2rpx('.srch-input')) - 28) <= 2, `${(await fs2rpx('.srch-input')).toFixed(1)}rpx`)
  await mp.screenshot({ path: path.join(OUT, 'v19-2-搜索摊开60.png') })
  await page.callMethod('onBlankTap')
  await sleep(800)

  // ---------- ⑥ 第二枚：笔记卡片那一格（台账刚被清空 → 该是空态） ----------
  await (await tabAt(1)).tap()
  await sleep(1000)
  ck('切到第二枚之后 data.view 跟着变，且这一屏不重新拉数据',
    (await data('view')) === 'cards' && (await data('notes')).length === ALL, '')
  ck('台账空着时那一格画的是空态那一句，不是白板',
    (await $$('.gc')).length === 0 && (await txt('.empty')) === ZH.noCards, await txt('.empty'))

  // ---------- ⑦ 详情窗：动作条三枚、墨色对齐列表 ----------
  await (await tabAt(0)).tap()
  await sleep(700)
  await (await $$('.xrow'))[0].tap()
  await sleep(2500)
  const btns = await $$('.ds-ibtn')
  const labels = await Promise.all(btns.map(async (e) => String(await e.text())))
  ck('详情窗动作条三枚：编辑 / 删除 / 生成笔记卡片（「置顶」那一枚整个撤了）',
    labels.length === 3 && !labels.some((x) => /置顶/.test(x)), labels.join(' | '))
  // size() 回的是 { width, height }，没有 .w 这个键（写了就是 NaN，v18 那把红过一次）
  const bw = await Promise.all(btns.map(async (e) => Math.round(rpx((await e.size()).width))))
  const bh = await Promise.all(btns.map(async (e) => Math.round(rpx((await e.size()).height))))
  // 原来这条钉的是"三枚等宽"——那是我对 flex:1 的推定，现网从 09-30 起就是 1 / 1 / 1.4：
  // 「生成笔记卡片」六个字压在一枚里，等宽会顶到边。真跑量出来 182/182/255，
  // 是设计值不是 bug，所以改口钉"等高不折行 + 宽的那枚就是文案长的那枚"。
  ck('三枚等高（谁都没折行把这一排顶高低不齐），「生成笔记卡片」那枚按 1/1/1.4 宽一档',
    Math.max(...bh) - Math.min(...bh) <= 1 && bw[2] > bw[0] && Math.abs(bw[0] - bw[1]) <= 1
    && Math.abs(bw[2] / bw[0] - 1.4) <= 0.08, bw.join('/') + ' 高' + bh.join('/'))
  ck('窗里的标题与要点前景 = 列表那档 90% 黑，正文段落 = 摘要那档 70% 黑',
    (await css('.ds-h2', 'color')) === 'rgba(35, 37, 44, 0.9)'
    && (await css('.ds-para', 'color')) === 'rgba(35, 37, 44, 0.7)'
    && (await css('.ds-pt-x', 'color')) === 'rgba(35, 37, 44, 0.9)',
    `标题=${await css('.ds-h2', 'color')} 正文=${await css('.ds-para', 'color')}`)
  await mp.screenshot({ path: path.join(OUT, 'v19-3-详情窗三枚.png') })

  // ---------- ⑧ 台账只记"我留下这张"那一步 ----------
  // 10-03 真机报的两条是同一个根因：账记在"画布落出一张成品图"那一刻，而打开弹窗、每滑一次
  // 模板、每开关一次码都会重画一次，一篇能记出五张；格子里画的又是最早那一张，看着就是
  // "小图跟大图完全不匹对"。现在记账挪到"保存并分享成功"那一步。
  // 那个面板在开发者工具里一定 fail，所以这一节把微信那一环换成"直接回 success"的替身——
  // 剩下每一环（success 回调 → _keepPoster → cardLog → arrange → 屏上那一格）走的还是产品代码。
  const waitRendered = async (tag) => {
    for (let i = 0; i < 20; i++) {
      const dd = await page.data()
      if (!dd.templateOpen) return `${tag}:渲染失败，弹窗自己关了`
      if (!dd.posterBusy && dd.posterImagePath) return `${tag}:已出图`
      await sleep(1000)
    }
    return `${tag}:等 20 秒没渲完`
  }
  const countAll = () => mp.evaluate(COUNT_ALL)
  const waitKept = async (want) => {
    for (let k = 0; k < 12; k++) {
      if ((await countAll()) >= want) return true
      await sleep(800)
    }
    return false
  }
  const stubShare = () => mp.evaluate(() => {
    if (!wx.__shareReal) wx.__shareReal = wx.showShareImageMenu
    // 真接口在 success 之后一定还有一趟 complete，而"拉起面板时整屏盖黑"那一层就是在
    // complete 里撤的。替身少调这一环，后面几张截图会被那层黑全盖掉（10-03 这一把先废了两张图
    // 才发现）——替身要像被替的那个东西，不然判据绿、证据黑。
    wx.showShareImageMenu = (o) => { o.success && o.success({}); o.complete && o.complete({}) }
    return 'ok'
  })
  // 台账空着有两处可能：画布那张 jpg 没取出来，或者用户文件目录根本写不进去。
  // 光看断言只能看到"0 张"，所以把小程序侧那两半一起打出来。
  const dumpWhyEmpty = async () => {
    const probe = await mp.evaluate(() => new Promise((res) => {
      const fm = wx.getFileSystemManager()
      const dir = `${wx.env.USER_DATA_PATH}/cards`
      try { fm.mkdirSync(dir, true) } catch (e) { /* 已存在会抛 */ }
      fm.writeFile({
        filePath: `${dir}/probe.txt`, data: 'probe', encoding: 'utf8',
        success: () => {
          let n = -1
          try { n = fm.readdirSync(dir).length } catch (e) { n = -2 }
          try { fm.unlinkSync(`${dir}/probe.txt`) } catch (e) {}
          res(`写得进（目录内 ${n} 项）`)
        },
        fail: (e) => res(`写不进：${e.errMsg}`),
      })
    }))
    console.log(`  · 台账为什么空——文件系统那一半：${probe}；USER_DATA_PATH=${await mp.evaluate(() => wx.env.USER_DATA_PATH)}`)
    const probeErr = await mp.evaluate(() => (getApp().__probe || []).slice(-8))
    console.log('  · 应用侧 console.error（末 8 条）：' + (probeErr.length ? '\n    ' + probeErr.join('\n    ') : '（一条都没有）'))
  }
  const closeFloats = async () => {
    if (await page.$('.tpl-sheet')) await page.callMethod('_closeTemplate')
    if (await page.$('.float-sheet')) await page.callMethod('onCloseDetail')
    await sleep(600)
  }
  const madeBtn = !!(await $('.ds-ibtn.primary'))
  ck('非私密笔记那一扇窗里有「生成笔记卡片」（下面两问全指着它）', madeBtn, madeBtn ? '有' : '没有')
  await (await $('.ds-ibtn.primary')).tap()
  await sleep(1500)
  ck('浮得出模板弹窗', !!(await $('.tpl-sheet')), '')
  const r1 = await waitRendered('第一张')
  ck('第一张图渲出来了（下面几问全指着这一句）', r1.endsWith('已出图'), r1)
  const afterRender = await countAll()
  ck('光把图画出来不记账：开一次弹窗、渲一张成品，台账一格都不许多（10-03 那五张就是这么来的）',
    afterRender === 0, `出图后台账已有 ${afterRender} 张`)
  await stubShare()
  await (await $('.tpl-btn.primary')).tap()
  const kept1 = await waitKept(1)
  ck('点了「保存并分享」、面板回 success 之后，台账才多出这一格',
    kept1, kept1 ? '已记 1 格' : `面板成功后台账仍是 ${await countAll()} 张（${r1}）`)
  const made1 = kept1
  if (!kept1) await dumpWhyEmpty()
  ck('面板走完那两条口，整屏那层黑撤掉了（还挂着就是 complete 那一环没人跑）',
    !(await page.data()).shareDim, `shareDim=${(await page.data()).shareDim}`)
  await closeFloats()
  await (await tabAt(1)).tap()
  await sleep(1200)
  const cells = await $$('.gc')
  // 这一条不跟着 made1 让步：出图失败时它一起红，红两条比"0 === 0 空过一条"诚实。
  ck('出完图切到第二枚，那一格真的出现了（判据不是"台账里有"，是屏上画出来了）',
    cells.length === 1, `${cells.length} 格（${r1}）`)
  if (cells.length) {
    const pad = await rect('.pad'), img = await rect('.pad-img'), gc = await rect('.gc')
    ck('白垫 340×474、图贴着各留 14 落在正中（比它扁的那几套上下各一道白）',
      near(pad.w, 340, 3) && near(pad.h, 474, 3) && near(img.w, 312, 3) && near(img.h, 446, 3)
      && Math.abs((img.top + img.bottom) / 2 - (pad.top + pad.bottom) / 2) <= 3,
      `垫=${rpx(pad.w).toFixed(0)}×${rpx(pad.h).toFixed(0)} 图=${rpx(img.w).toFixed(0)}×${rpx(img.h).toFixed(0)}`)
    ck('两列等宽：一格 340，两列那一区铺满 702（左右各内缩 24，和列表同一条线）',
      near(gc.w, 340, 3) && near((await rect('.grid2')).w, 702, 3),
      `格=${rpx(gc.w).toFixed(0)} 区=${rpx((await rect('.grid2')).w).toFixed(0)}`)
    ck('只有一张时不画第二行那枚页码（他原话"如果同一个笔记生成多个卡片"）',
      (await $$('.g-pg')).length === 0, '')
    ck('那一格下面第一行是标题：与分类同字号、90% 黑、一行截断',
      (await css('.g-cap', 'font-size')) === chipFs && (await css('.g-cap', 'color')) === 'rgba(35, 37, 44, 0.9)',
      await css('.g-cap', 'font-size'))
    ck('卡片那一格也留着分类那一行（切过去不会看到别的分类）',
      !!(await $('.cats')) && !!(await $('.chip')), '')
    await mp.screenshot({ path: path.join(OUT, 'v19-4-卡片一格.png') })

    // 再走一次：开弹窗、滑到另一套模板、开关一次码——这三下都只是"看图"，一张都不该记；
    // 然后真点一次「保存并分享」，才要求台账变两张。
    const waitIdle = async () => {
      for (let i = 0; i < 20; i++) {
        const d = await page.data()
        if (!d.posterBusy) return true
        await sleep(1000)
      }
      return false
    }
    await (await tabAt(0)).tap()
    await sleep(700)
    await (await $$('.xrow'))[0].tap()
    await sleep(2200)
    await (await $('.ds-ibtn.primary')).tap()
    await sleep(1500)
    const r1b = await waitRendered('第二套开弹窗')
    ck('第二套：开弹窗先等上一张渲完（两套 _renderPoster 同时在同一枚 canvas 上跑会互相盖）',
      r1b.endsWith('已出图'), r1b)
    await page.callMethod('onPosterTouchStart', { touches: [{ clientX: 300 }] })
    await page.callMethod('onPosterTouchEnd', { changedTouches: [{ clientX: 40 }] })
    const r2 = await waitRendered('滑到第二套')
    ck('滑到另一套模板（只是看图）不记账：台账仍是 1 张',
      r2.endsWith('已出图') && (await countAll()) === 1, `台账 ${await countAll()} 张（${r2}）`)
    await page.callMethod('onToggleQr')
    await sleep(1500)
    await waitIdle()
    ck('开关一次码（也只是看图）同样不记账：台账仍是 1 张', (await countAll()) === 1,
      `台账 ${await countAll()} 张`)
    await stubShare()
    await (await $('.tpl-btn.primary')).tap()
    const kept2 = await waitKept(2)
    ck('第二套真"保存并分享"之后，台账才两张', kept2,
      kept2 ? '已记 2 格' : `面板成功后仍是 ${await countAll()} 张`)
    if (!kept2) await dumpWhyEmpty()
    const made2 = kept2
    await closeFloats()
    await (await tabAt(1)).tap()
    await sleep(1200)
    const c0 = (await data('cells'))[0] || {}
    ck('同一篇留到第二套模板之后台账里是两张', made2 && (c0.cards || []).length === 2,
      `${(c0.cards || []).length} 张`)
    // 这一条钉的就是他报的"小图完全不匹对"：格子画的是 cards[cur]，cur 从 0 起，
    // 所以台账必须倒着排，第一格才是他最后留下的那一张。
    const srcNow = String((await $('.pad-img')) ? await (await $('.pad-img')).attribute('src') : '')
    ck('格子里那张小图＝最近留下的那一张（台账按 at 倒序，不是拿最早那张当封面）',
      (c0.cards || []).length === 2 && (c0.cards[0].at || 0) >= (c0.cards[1].at || 0)
      && srcNow.indexOf(String((c0.cards[0].p || '').split('/').pop())) >= 0,
      `cards[0].at=${(c0.cards[0] || {}).at}、cards[1].at=${(c0.cards[1] || {}).at}、屏上画的是 ${(srcNow.split('/').pop() || '空')}`)
    ck('第二行出现 ‹ 1/2 ›，数字吃全局那支 WtsjMind',
      !!(await $('.g-pg')) && /^\d\/\d$/.test(String(await txt('.g-n')))
      && /WtsjMind/.test(String(await css('.g-n', 'font-family'))), await txt('.g-n'))
    // 左右两枚箭头在标记上没有 .l/.r（那两枚是里面的 .chev），按下标取：
    // 第 0 枚 data-step=-1、第 1 枚 +1，顺序与 wxml 里那两行一致。
    const stepAt = async (i) => (await $$('.g-step'))[i]
    const before = await (await $('.pad-img')).attribute('src')
    await (await stepAt(1)).tap()
    await sleep(900)
    const after = await (await $('.pad-img')).attribute('src')
    ck('点右箭头换到另一张（读的是 image 的 src，不是自己算的下标）',
      !!before && !!after && before !== after, `${String(before).slice(-12)} → ${String(after).slice(-12)}`)
    await (await stepAt(0)).tap()
    await sleep(900)
    ck('点左箭头换得回来', (await (await $('.pad-img')).attribute('src')) === before, await txt('.g-n'))
    await (await stepAt(0)).tap()
    await sleep(700)
    ck('已经在第一张时再点左箭头停在 1/2（走到头点不动、不循环）',
      (await txt('.g-n')) === '1/2', await txt('.g-n'))
    await mp.screenshot({ path: path.join(OUT, 'v19-5-卡片两枚带页码.png') })
  }

  // ---------- ⑨ 收尾：把这一把自己造的那格连文件一起删干净 ----------
  // 台账没记上时，光看断言只能看到"0 张"，看不到为什么——把小程序侧那几条错误一起打出来。
  const errs = logs.filter((l) => /error|失败|卡片|canvas|file/i.test(l)).slice(-14)
  if (errs.length) console.log('— 小程序侧 console（相关 末 ' + errs.length + ' 条）:\n' + errs.map((e) => '  · ' + e).join('\n'))
  const left = await mp.evaluate(CLEAR)
  ck('这一把造的卡片文件已删干净（不留孤儿位图给下一把）',
    (await mp.evaluate(COUNT)) === 0, `删掉 ${left} 张`)
  // 收尾把探针与那个面板替身都摘掉：这台工具是长驻的，留着会一路影响后面几把尺子。
  await mp.evaluate(() => {
    if (wx.__shareReal) { wx.showShareImageMenu = wx.__shareReal; wx.__shareReal = null }
    const a = getApp()
    if (a.__errOld) console.error = a.__errOld
    a.__probe = []
  })
  try { await lang.pin(mp, langBefore) } catch (e) { /* 连接可能已经断了 */ }
  console.log(bad.length ? `\n✗ ${bad.length} 条红：${bad.join(' / ')}` : '\n全部通过，红 0 条')
  await mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('尺子挂了', e); process.exit(2) })
