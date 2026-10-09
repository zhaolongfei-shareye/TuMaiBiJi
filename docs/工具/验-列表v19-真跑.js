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
const APP_CSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/app.wxss'), 'utf8')
// 字号档从令牌现读，不抄第二份数（改 app.wxss 那一行，这条判据跟着动）
const META_RPX = Number(/--fs-meta:\s*(\d+)rpx/.exec(APP_CSS)[1])

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
  // automator 的 screenshot 会滞后：连拍六张时前面那两张落盘的是后面那一帧
  // （10-03 实测：v19-1「列表默认」拍出来是一张开着的详情窗，判据却全绿）。
  // 所以每拍一张就等它真的被重写一次再往下走，宁可慢，不交假证据。
  const shot = async (name) => {
    const f = path.join(OUT, name)
    const t0 = Date.now()
    await mp.screenshot({ path: f })
    for (let i = 0; i < 30; i++) {
      await sleep(300)
      try { if (fs.statSync(f).mtimeMs >= t0) break } catch (e) {}
    }
    await sleep(400)
  }
  const tabAt = async (i) => (await $$('.vtab'))[i]
  const d0 = await page.data()
  // v30 起分类那一行不再吃 `.chip`（胶囊撤了、改成 `.ix-cat` 文字＋短杠），
  // 原来拿 `.chip` 的字号当"同一档"那把尺子的，读回来是 null，两条判据一起空红。
  const catFs = await css('.ix-cat', 'font-size')
  // 那一行两档字的期望值从 createSkin() 现读，不在尺子里抄第二份纸白：
  // 它和新建页那两档是同一支出处（规格 §3 第四、五行）。
  const skinCs = {}
  p.createSkin().split(';').forEach((kv) => {
    const i = kv.indexOf(':')
    if (i > 0) skinCs[kv.slice(0, i).trim().replace(/^--/, '')] = kv.slice(i + 1).trim()
  })
  // 期望值有两种写法都会出现：createSkin() 发的是 hex（#23252C）或 rgba(...)，
  // 屏上读回来一定是 rgb()/rgba()。所以先把两边统一成三元（+可选 alpha）再比。
  const colNums = (s) => {
    const t = String(s).trim()
    if (t[0] === '#') {
      const m = /#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(t)
      return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : []
    }
    return (t.match(/-?\d+(\.\d+)?/g) || []).map(Number)
  }
  const rgbaNums = colNums
  const sameRgba = (a, b) => {
    const x = colNums(a), y = colNums(b)
    return x.length >= 3 && y.length >= 3 && x.slice(0, 3).every((v, i) => Math.abs(v - y[i]) <= 1)
      && Math.abs((x[3] === undefined ? 1 : x[3]) - (y[3] === undefined ? 1 : y[3])) < 0.02
  }

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
  ck('左边那句轮播 Tips 整条撤净（节点、data 两样都不在，站长 10-04）',
    (await $('.tp')) === null && (await $$('.tp-dot')).length === 0
    && d0.tips === undefined && d0.tipIdx === undefined,
    `节点=${(await $$('.tp,.tp-dot,.tp-tx')).length} 个、data.tips=${JSON.stringify(d0.tips)}`)
  const icR = await rect('.acts .ic')
  ck('Tips 撤了之后搜索那枚仍贴着行的右内缩（改成 flex-end 就是为守住这一条）',
    icR && near(icR.right, 726, 3), `右沿=${icR && rpx(icR.right).toFixed(1)}rpx（行右内缩 726）`)

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
  ck('已选那枚满纸白 + 字重 700，未选那枚同字号只 62% 纸白，且那一行的面就是新建页那块深面（v30）',
    sameRgba(await colAt(onIdx), skinCs['cp-ink'])
    && sameRgba(await colAt(1 - onIdx), skinCs['cp-ink-62'])
    && String(await (await tabAt(onIdx)).style('font-weight')) === '700'
    && sameRgba(await css('.vtabs', 'background-color'), '#23252C'),
    `已选=${await colAt(onIdx)} 未选=${await colAt(1 - onIdx)} 面=${await css('.vtabs', 'background-color')}`)
  ck('tab 字号与下面分类同一档（都是 --fs-meta 24，"小字"就是这一档）',
    !!catFs && (await css('.vtab', 'font-size')) === catFs, `${await css('.vtab', 'font-size')} vs ${catFs}`)
  /* 整高这条原来钉 70，理由是"效果图那个数"，而那时那一行是透明的、底下压着一条 2rpx 通栏横线。
     v30 撤了那条线、换成一块深面，规格 §3 **没有给新的行高**——所以这里不能凭空挑一个数钉成"规格说的"。
     钉的是"量出来是多少就是多少 ±1"，并注明它是 padding 22/14 + 字号 24 落出来的结果：
     它挡的是"哪天内缩或字号被改动把这一行撑高/压扁"，不替站长定一个新数。 */
  ck('两枚那一行整高＝重锚当日实测那一档 ±1（66.3rpx＝padding 22/14 叠 24 字，规格没给新数）',
    near((await rect('.vtabs')).h, 66.3, 1), `${rpx((await rect('.vtabs')).h).toFixed(1)}rpx`)

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
  ck('摘要是 70% 黑、字号吃令牌那一档（原来跟的是 Tips，那条 10-04 撤了）、最多三行',
    (await css('.x-s', 'color')) === 'rgba(35, 37, 44, 0.7)'
    && Math.abs((await fs2rpx('.x-s')) - META_RPX) <= 1
    && (await css('.x-s', '-webkit-line-clamp')) === '3',
    `摘要=${(await fs2rpx('.x-s')).toFixed(1)}rpx 令牌 --fs-meta=${META_RPX}rpx`)
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
  await shot('v19-1-列表默认.png')

  // ---------- ⑤ 搜索摊开：压到 60 ----------
  await ics[0].tap()
  await sleep(1200)
  const srch = await rect('.srch')
  ck('搜索条压到 60 高（分类那一枚 chip 实测算高 59，压到同一档）',
    srch && near(srch.h, 60, 2), srch ? `${rpx(srch.h).toFixed(1)}rpx` : '没摊开')
  ck('摊开时输入框摊满整行（右边那 23rpx 是空 .acts 的 margin-left，撤 Tips 之前也一样占着）',
    (await $$('.tp')).length === 0 && (await $$('.srch')).length === 1
    && srch && near(srch.left, 24, 3) && near(srch.right, 702, 4),
    `左=${srch && rpx(srch.left).toFixed(1)} 右=${srch && rpx(srch.right).toFixed(1)} 宽=${srch && rpx(srch.w).toFixed(1)}rpx`)
  ck('右侧「搜索笔记」与分类同字号同字重（原来那档 31/800 比正文还大一级）',
    (await css('.srch-go', 'font-size')) === catFs && (await css('.srch-go', 'font-weight')) === '600',
    `${await css('.srch-go', 'font-size')} vs chip ${catFs}`)
  ck('输入里的字没动（仍 --fs-body 28：这轮只压条子和那两个字）',
    Math.abs((await fs2rpx('.srch-input')) - 28) <= 2, `${(await fs2rpx('.srch-input')).toFixed(1)}rpx`)
  await shot('v19-2-搜索摊开60.png')

  // ---------- ⑤b 点空白＝退出搜索（站长 10-03 报的 BUG）----------
  // 原来那条规则是"缩回不清词"，结果条子一收、下面还挂着上一次的结果，看着像没退出来。
  // 这一把钉三样一起发生：条子收、词清、列表回到未搜的那一批。少一样就是那个 BUG 还在。
  const firstTitle = ((await data('notes'))[0] || {}).title || ''
  const kw = firstTitle.slice(0, 4)
  await page.callMethod('onSearchInput', { detail: { value: kw } })
  await page.callMethod('onSearchConfirm')
  await sleep(3000)
  const hit = (await data('notes')).length
  ck('先真搜一次把状态摆出来：结果确实比全量少（不然是空过）',
    !!kw && hit >= 1 && hit < ALL, `"${kw}" → ${hit} 条 / 全量 ${ALL}`)
  ck('搜完这一刻：条子还开着、词还在',
    (await page.data()).searchOpen === true && (await page.data()).searchKeyword === kw, '')
  await page.callMethod('onBlankTap')
  await sleep(3000)
  const dBlank = await page.data()
  ck('点空白之后三样一起：条子收 + 关键字清 + 列表回到全量那一批',
    dBlank.searchOpen === false && dBlank.searchKeyword === '' && dBlank.notes.length === ALL,
    `open=${dBlank.searchOpen} kw="${dBlank.searchKeyword}" notes=${dBlank.notes.length} vs ${ALL}`)
  await shot('v19-2b-点空白退出搜索.png')

  // 反向钉：点中某条笔记只把条子让开，不许顺手清词——
  // 搜完点开一篇、关掉窗口结果就没了，那是另一条坑（09-30 那条"让开看结果"仍然成立）。
  await page.callMethod('onOpenSearch')
  await sleep(600)
  await page.callMethod('onSearchInput', { detail: { value: kw } })
  await page.callMethod('onSearchConfirm')
  await sleep(3000)
  await (await page.$('.xrow')).tap()
  await sleep(2500)
  const dRow = await page.data()
  ck('点一行：详情窗开着、条子让开、词仍留着（✕ 才是清词的口）',
    dRow.detailOpen === true && dRow.searchOpen === false && dRow.searchKeyword === kw,
    `detail=${dRow.detailOpen} open=${dRow.searchOpen} kw="${dRow.searchKeyword}"`)
  await page.callMethod('onCloseDetail')
  await sleep(800)
  const IDX_WXML = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxml'), 'utf8')
  ck('那两枚分类与整行都改成 catchtap：它们不该被当成"点了空白"',
    /catchtap="onRowTap"/.test(IDX_WXML) && /catchtap="selectCategory"/.test(IDX_WXML)
    && !/bindtap="onRowTap"|bindtap="selectCategory"/.test(IDX_WXML), '')
  await page.callMethod('clearSearch')
  await sleep(3000)

  // ---------- ⑥ 第二枚：笔记卡片那一格（台账刚被清空 → 该是空态） ----------
  await (await tabAt(1)).tap()
  await sleep(1000)
  ck('切到第二枚之后 data.view 跟着变，且这一屏不重新拉数据',
    (await data('view')) === 'cards' && (await data('notes')).length === ALL, '')
  ck('台账空着时那一格画的是空态那一句，不是白板',
    (await $$('.gc')).length === 0 && (await txt('.empty')) === ZH.noCards, await txt('.empty'))

  // ---------- ⑦ 详情窗：动作条两枚、墨色对齐列表 ----------
  await (await tabAt(0)).tap()
  await sleep(700)
  await (await $$('.xrow'))[0].tap()
  await sleep(2500)
  const btns = await $$('.ds-ibtn')
  const labels = await Promise.all(btns.map(async (e) => String(await e.text())))
  // v22（站长 10-03 第四轮）：底排从三枚减到两枚——「生成笔记卡片」整枚撤掉，
  // 出卡片的入口挪进右上那一格（.ds-entry）。v19 撤「置顶」那条仍然成立。
  ck('详情窗动作条两枚：编辑 / 删除（「置顶」「生成笔记卡片」两枚都撤了）',
    labels.length === 2 && !labels.some((x) => /置顶|卡片/.test(x)), labels.join(' | '))
  ck('右上那一格在，它是出卡片的唯一入口', !!(await $('.ds-entry')), '')
  // size() 回的是 { width, height }，没有 .w 这个键（写了就是 NaN，v18 那把红过一次）
  const bw = await Promise.all(btns.map(async (e) => Math.round(rpx((await e.size()).width))))
  const bh = await Promise.all(btns.map(async (e) => Math.round(rpx((await e.size()).height))))
  // 原来这两条钉的是"三枚 1/1/1.4 宽一档"——那个 1.4 是给「生成笔记卡片」六个字留的，
  // 那枚撤了之后 .ds-irow 就是两枚 flex:1 等宽，钉"等宽 + 等高不折行"。
  ck('两枚等宽等高（谁都没折行把这一排顶高低不齐）',
    Math.max(...bh) - Math.min(...bh) <= 1 && Math.abs(bw[0] - bw[1]) <= 1, bw.join('/') + ' 高' + bh.join('/'))
  ck('窗里的标题与要点前景 = 列表那档 90% 黑，正文段落 = 摘要那档 70% 黑',
    (await css('.ds-h2', 'color')) === 'rgba(35, 37, 44, 0.9)'
    && (await css('.ds-para', 'color')) === 'rgba(35, 37, 44, 0.7)'
    && (await css('.ds-pt-x', 'color')) === 'rgba(35, 37, 44, 0.9)',
    `标题=${await css('.ds-h2', 'color')} 正文=${await css('.ds-para', 'color')}`)
  await shot('v19-3-详情窗三枚.png')

  // ---------- ⑧ 台账只记"我留下这张"那一步 ----------
  // 10-03 真机报的两条是同一个根因：账记在"画布落出一张成品图"那一刻，而打开弹窗、每滑一次
  // 模板、每开关一次码都会重画一次，一篇能记出五张；格子里画的又是最早那一张，看着就是
  // "小图跟大图完全不匹对"。现在记账挪到"分享成功"那一步（那枚按钮 10-03 起只叫「分享」）。
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
  const madeBtn = !!(await $('.ds-entry'))
  ck('非私密笔记那一扇窗里有右上那一格（下面两问全指着它）', madeBtn, madeBtn ? '有' : '没有')
  await (await $('.ds-entry')).tap()
  await sleep(1500)
  ck('浮得出模板弹窗', !!(await $('.tpl-sheet')), '')
  const r1 = await waitRendered('第一张')
  ck('第一张图渲出来了（下面几问全指着这一句）', r1.endsWith('已出图'), r1)
  const afterRender = await countAll()
  ck('光把图画出来不记账：开一次弹窗、渲一张成品，台账一格都不许多（10-03 那五张就是这么来的）',
    afterRender === 0, `出图后台账已有 ${afterRender} 张`)
  await stubShare()
  await (await $('.tpl-main')).tap()
  const kept1 = await waitKept(1)
  ck('点了「分享」、面板回 success 之后，台账才多出这一格',
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
    ck('格子里不再画第二行那枚页码（一篇一张，‹ i/n › 整块撤了）',
      (await $$('.g-pg')).length === 0, '')
    ck('那一格下面第一行是标题：与分类同字号、90% 黑、一行截断',
      (await css('.g-cap', 'font-size')) === catFs && (await css('.g-cap', 'color')) === 'rgba(35, 37, 44, 0.9)',
      await css('.g-cap', 'font-size'))
    ck('卡片那一格也留着分类那一行（切过去不会看到别的分类）',
      !!(await $('.cats')) && !!(await $('.ix-cat')), '')
    await shot('v19-4-卡片一格.png')

    // 站长 10-03 23:40 做减法：一篇同一时间只有一张，要改存量必须先删掉这一张。
    // 所以这一节钉的东西整个换了一批：原来那三问（第二张记不记上、‹ 1/2 › 换得回来吗、
    // 两张各自是哪套模板）全都不存在了，换成——
    // ① 已生成态底排只有「查看笔记｜删除」（10-04 之前左端那枚是「取消」），通栏那枚和「编辑个人名片」都不在这一态；
    // ② 这一态左右滑不动模板（不会"顺手把那张换掉"）；
    // ③ 点删除：本机那一格与位图一起清掉，那一枚回到空态；
    // ④ 未生成态滑模板／开关码依旧一张都不记，真按通栏才记，且记完台账只有一张。
    // copyIn 里"旧的那张连文件一起撤"那一支，UI 走到已生成态就进不来了（只剩删除），
    // 它是防存量与本机被手改的兜底，钉在验-列表D2 那条静态判据里，这里不硬造现场。
    const waitIdle = async () => {
      for (let i = 0; i < 20; i++) {
        const d = await page.data()
        if (!d.posterBusy) return true
        await sleep(1000)
      }
      return false
    }
    const filesLeft = () => mp.evaluate(() => {
      try { return wx.getFileSystemManager().readdirSync(`${wx.env.USER_DATA_PATH}/cards`).length } catch (e) { return -1 }
    })
    const dockBtns = async () => {
      const els = await $$('.tpl-btn')
      return (await Promise.all(els.map(async (e) => String(await e.text() || '').trim()))).join('|')
    }

    /* ---------- ⑧b 一篇一张：已生成态只能删、不能改 ---------- */
    /* 站长 10-04：卡片那一格的小图现在**直接**开大图（原来先浮详情窗、再点窗里右上那一格，
       他的原话是「不需要再看原文」）。所以这一节少一次跳转：旧判据「点卡片那一格进详情窗」作废，
       换成钉"没浮详情窗、直接到大图"。 */
    await (await $('.pad')).tap()
    await sleep(2200)
    const opened = await page.data()
    ck('点小图直接拉起大图，不再先浮详情窗',
      opened.templateOpen === true && opened.detailOpen === false,
      `templateOpen=${opened.templateOpen} / detailOpen=${opened.detailOpen}`)
    ck('大图带的就是这一格那一篇（不是列表第一篇、也不是上一篇留在 posterNote 里的那个）',
      !!opened.posterNote && String(opened.posterNote.id) === String((opened.cells[0] || {}).id)
      && opened.detailCardIdx === undefined,
      `${opened.posterNote && opened.posterNote.id} vs 第一格 ${(opened.cells[0] || {}).id}`)
    ck('‹ i/n › 那一行两枚彻底没有（列表那一格与详情窗那一大格都没有页码行了）',
      (await $$('.g-pg')).length === 0 && (await $$('.ds-pg')).length === 0, '')
    const rGen = await waitRendered('已生成态开大图')
    ck('台账里已有这一张 → 弹窗一开就落在已生成态（这一态是从台账读出来的，不是点出来的）',
      rGen.endsWith('已出图') && (await data('posterHasCard')) === true, rGen)
    const dockGen = await dockBtns()
    ck('已生成态那两枚是「查看笔记｜删除」+ 一句说明；「编辑个人名片」与那排圆点都不在这一态',
      dockGen === '查看笔记|删除' && !(await $('.tpl-dots')) && !(await $('.pill-lab'))
      && (await txt('.tpl-main-hint')) === '删除后可继续生成笔记卡片，已分享的依旧有效', dockGen)
    /* 站长 10-04 补的那枚通栏（没有它，一张卡发完就锁死了）。量三样：文案、它在两枚**上面**、
       以及它的底色是不是就等于底部导航"选中那一格"下面那块圆底。
       文字宽/高一起量：折行会让高度翻倍，那在这一屏是坏活。 */
    const shareTx = await $('.tpl-main text')
    const shareBox = await rect('.tpl-main')
    const shareTxBox = shareTx ? await (async () => {
      const s = await shareTx.size(), o = await shareTx.offset()
      return { w: s.width, h: s.height, top: o.top }
    })() : null
    ck('已生成态上面那枚通栏是「分享卡片：微信好友 / 朋友圈 / 公众号」，且排在查看笔记｜删除前面',
      !!shareTx && (await shareTx.text()) === ZH.cardShare
      && !!shareBox && shareBox.top < (await rect('.tpl-actions')).top,
      `${shareTx ? await shareTx.text() : '（没有这枚）'}`)
    /* 底色不再自己挑：全站实心按钮都改吃 chromeOf(壁纸).sel，和底栏那一格同一个来源。
       底栏是组件、automator 够不到它的节点，所以这里拿渲染之后的按钮底色去对 palette 现算的值；
       八套主题的镜像值另有静态尺子逐枚钉（验-色板零回归），这一条守"当前这套真跑出来对不对"。
       拿"同一个 class 跟自己比"是假绿（这条我自己先犯过一次），所以两侧来源必须不同。 */
    const lum = (c) => {
      const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(String(c || ''))
      if (!m) return -1
      return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255
    }
    /* 两侧格式不同：渲染回来的是 rgb(...)，palette 给的是 #rrggbb。
       上一版这里只认 rgb，拿 '#875033' 去解析回空串，两条判据当场假红。 */
    const hexOf = (c) => {
      const s = String(c || '').trim()
      const h = /^#?([0-9a-fA-F]{6})$/.exec(s)
      if (h) return h[1].toLowerCase()
      const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s)
      return m ? [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('').toLowerCase() : ''
    }
    const bgCss = await css('.tpl-main', 'background-color')
    const inkCss = await css('.tpl-main', 'color')
    const bgLum = lum(bgCss)
    const fgLum = lum(inkCss)
    const clsNow = String(await data('themeClass') || '')
    const wk = (p.THEMES.find((x) => clsNow.indexOf(x.cls) >= 0) || p.THEMES[0]).key
    const chrome = p.chromeOf(wk)
    const cr = p.crOf(`#${hexOf(bgCss)}`, `#${hexOf(inkCss)}`)
    ck(`那枚通栏的底色＝底栏选中那一格的圆底色（壁纸 ${wk}：同一个 chromeOf.sel，且底比字暗）`,
      hexOf(bgCss) === hexOf(chrome.sel) && bgLum >= 0 && bgLum < fgLum,
      `按钮 #${hexOf(bgCss)} vs 底栏 #${hexOf(chrome.sel)}　底亮 ${bgLum.toFixed(3)} 字亮 ${fgLum.toFixed(3)}`)
    ck('字吃底栏那一格同一支纸白，压上去的实测对比摆出来（两枚淡雅与深海在 4.3 上下，底栏今天也是这一对）',
      hexOf(inkCss) === hexOf(chrome.ink) && cr >= 4.2, `字 #${hexOf(inkCss)} 对比 ${cr.toFixed(2)}:1`)
    ck('那行字一行走完（宽不越通栏内沿、高没翻倍＝没折行）',
      !!shareTxBox && !!shareBox && shareTxBox.w <= rpx(shareBox.w) - 8 && rpx(shareTxBox.h) <= 44,
      `字 ${shareTxBox && Math.round(rpx(shareTxBox.w))}×${shareTxBox && Math.round(rpx(shareTxBox.h))}rpx 条子 ${shareBox && Math.round(rpx(shareBox.w))}rpx`)
    const tplGen = await data('posterTpl')
    await page.callMethod('onPosterTouchStart', { touches: [{ clientX: 300 }] })
    await page.callMethod('onPosterTouchEnd', { changedTouches: [{ clientX: 40 }] })
    await sleep(900)
    ck('已生成态左右滑不动模板（要换只能先删这一张，滑一下不该把它换掉）',
      (await data('posterTpl')) === tplGen && (await countAll()) === 1,
      `模板=${await data('posterTpl')}（原 ${tplGen}）、台账 ${await countAll()} 张`)

    /* 点那枚通栏真发一次（那个面板在开发者工具里一定 fail，前面已换成"直接回 success"的替身）。
       这一枚和「生成分享图」那枚的分工就一句话：**再发一次不该多出账**。
       判据盯三样：台账张数不变、那一条的路径与 at 一字没动（动了就是重记＋排序被顶）、弹窗不收。 */
    const nidGen = (await data('posterNote') || {}).id
    const led0 = await mp.evaluate((id) => ((wx.getStorageSync('cardLog') || {})[String(id)] || []).slice(), nidGen)
    await (await $('.tpl-main')).tap()
    await sleep(1800)
    const led1 = await mp.evaluate((id) => ((wx.getStorageSync('cardLog') || {})[String(id)] || []).slice(), nidGen)
    const dShare = await page.data()
    ck('点「分享卡片」把面板拉起来再走完那两条口：台账一张没多、那一条的路径与时间戳一字没动、弹窗还开着',
      led1.length === 1 && led0.length === 1 && led1[0].p === led0[0].p && led1[0].at === led0[0].at
      && dShare.templateOpen === true && dShare.shareDim === false,
      `${led0.length}→${led1.length} 条、p ${led1[0] && led0[0] ? (led1[0].p === led0[0].p ? '没变' : '变了') : '(台账有空格，比不了)'}、at ${led1[0] && led0[0] ? (led1[0].at === led0[0].at ? '没变' : '被顶新了') : '(同上)'}、open=${dShare.templateOpen} dim=${dShare.shareDim}`)
    await shot('v19-5b-已生成态分享卡片.png')
    const delBtn = (await $$('.tpl-btn'))[1]
    /* 10-05 站长拍甲：这枚「删除」现在先弹一道确认框，所以这一段拆成两拍——
         A 只录不调：证明"点下去没当场删"（台账、位图、弹窗三样都还在）；
         B 把录下来的 success 喂一次 confirm:true：证明"确定才真删"。
       为什么用替身：开发者工具里那层系统弹窗不是页面节点，automator 点不到它的「确定」。
       代价要说清——被替掉的只有"弹窗真会在屏上出现"这一条，那一条由探-小字不折行那趟的
       渲染读数（弹窗挡着时 .pill-lab 读成 null）与他真机扫屏担保。 */
    await mp.evaluate(() => {
      wx.__origShowModal = wx.showModal
      wx.__modalSeen = []
      wx.showModal = (o) => {
        wx.__modalSeen.push({ title: o.title, content: o.content, confirmText: o.confirmText })
        wx.__modalOpts = o
      }
    })
    await delBtn.tap()
    await sleep(1200)
    const m = await mp.evaluate(() => ({
      seen: wx.__modalSeen || [],
      stillOpen: !!(getCurrentPages()[0].data || {}).templateOpen,
    }))
    ck('点「删除」先弹确认框，而且此刻什么都没删（台账、位图、弹窗三样都还在）',
      m.seen.length === 1 && m.stillOpen && (await countAll()) === 1 && (await filesLeft()) === 1,
      `弹窗 ${m.seen.length} 次、张数=${await countAll()}、剩 ${await filesLeft()} 个文件、open=${m.stillOpen}`)
    ck('确认框那两句吃的是字典里的 confirmDelete 与 cardDropHint（不抄死）',
      !!m.seen[0] && m.seen[0].title === ZH.confirmDelete && m.seen[0].content === ZH.cardDropHint
      && m.seen[0].confirmText === undefined,
      m.seen[0] ? `${m.seen[0].title} / ${m.seen[0].content}` : '一次弹窗都没打')
    await mp.evaluate(() => {
      const o = wx.__modalOpts
      wx.showModal = wx.__origShowModal
      if (o && o.success) o.success({ confirm: true, cancel: false })
    })
    await sleep(1500)
    const afterDel = await page.data()
    ck('确认框点「确定」：台账那一格与本机位图一起清掉，弹窗自己收（服务端那张活码一行都不碰）',
      afterDel.templateOpen === false && (await countAll()) === 0 && (await filesLeft()) === 0,
      `张数=${await countAll()}、目录里剩 ${await filesLeft()} 个文件`)
    await (await tabAt(1)).tap()
    await sleep(1200)
    ck('删完之后卡片那一枚回到"这篇还没生成过卡片"（格没了、空态那句话在）',
      (await $$('.gc')).length === 0 && !!(await $('.empty')), `${(await $$('.gc')).length} 格`)
    await shot('v19-5-删掉后空态.png')

    /* 删干净了才谈"重新生成"。这一回特意换一套模板并把码关掉：下面第 ⑩ 问咬的就是
       他报的那句"小图跟大图完全不匹对"——挑一张跟默认不一样的，旧写法才会当场露馅。 */
    const defTpl = await mp.evaluate(() => (wx.getStorageSync('poster_profile') || {}).template || '')
    await (await tabAt(0)).tap()
    await sleep(700)
    await (await $$('.xrow'))[0].tap()
    await sleep(2200)
    await (await $('.ds-entry')).tap()
    await sleep(1500)
    const rNew = await waitRendered('删除后重开大图')
    ck('删完重开弹窗，底排回到未生成态（取消｜编辑个人名片 + 通栏「生成分享图」+ 药丸小字 + 圆点）',
      rNew.endsWith('已出图') && (await data('posterHasCard')) === false
      && !!(await $('.tpl-main')) && !!(await $('.pill-lab')) && !!(await $('.tpl-dots'))
      && !(await $('.tpl-btn.danger')), `${await dockBtns()} / 小字=${await txt('.pill-lab')}`)
    // 串从字典现读，不在这抄一份：10-05 站长要「开启二维码」后面补一句"纯分享图片，而非笔记原文"，
    // 抄死的旧串当场就成假红了（折行不放任由 `探-小字不折行.js` 量盒子钉）。
    ck('未生成态那行小字默认是字典里 `qrOn` 那一句（开关默认开着）',
      (await data('noQr')) === false && (await txt('.pill-lab')) === ZH.qrOn, await txt('.pill-lab'))
    const tplA = await data('posterTpl')
    await page.callMethod('onPosterTouchStart', { touches: [{ clientX: 300 }] })
    await page.callMethod('onPosterTouchEnd', { changedTouches: [{ clientX: 40 }] })
    const rSlide = await waitRendered('未生成态滑到另一套')
    ck('未生成态左右滑照旧换模板，但一张都不记',
      rSlide.endsWith('已出图') && (await data('posterTpl')) !== tplA && (await countAll()) === 0,
      `${tplA} → ${await data('posterTpl')}、台账 ${await countAll()} 张（${rSlide}）`)
    await page.callMethod('onToggleQr')
    await sleep(1200)
    await waitIdle()
    // 上面那条注释说的"串从字典现读"这里也得守：`d8c5076`（10-05，站长要两态各带一句说明）
    // 把 qrOff 从「关闭二维码」改成「关闭二维码｜只发这张图，扫不出原文」，
    // 这里还钉着老那半截，于是红的不是药丸、是判据（master 上同样红着，10-06 全量真跑抓到）。
    ck('药丸那一下只切开关、不越级触发分享；小字跟着换成字典里 `qrOff` 那一句',
      (await countAll()) === 0 && (await data('noQr')) === true && (await txt('.pill-lab')) === ZH.qrOff,
      `台账 ${await countAll()} 张、小字=${await txt('.pill-lab')}`)
    const wantTpl = await data('posterTpl')
    await stubShare()
    await (await $('.tpl-main')).tap()
    const keptNew = await waitKept(1)
    ck('按通栏那枚「生成分享图」、面板回 success 之后才记账，且这篇只有一张',
      keptNew && (await countAll()) === 1, keptNew ? `台账 ${await countAll()} 张` : '一张都没记上')
    if (!keptNew) await dumpWhyEmpty()
    const pickedOdd = !!wantTpl && wantTpl !== defTpl
    ck('这一张挑的是「不是默认模板、而且关过码」的那一套（不挑开，第 ⑩ 问就咬不住旧写法）',
      pickedOdd && (await data('noQr')) === true, `默认=${defTpl}、这一张=${wantTpl}`)
    await closeFloats()
    await (await tabAt(1)).tap()
    await sleep(1200)
    const cNew = (await data('cells'))[0] || {}
    const srcNew = String((await $('.pad-img')) ? await (await $('.pad-img')).attribute('src') : '')
    ck('屏上那枚小图画的就是台账里唯一那一条（不是最早那张、也不是被删掉的那张）',
      (cNew.cards || []).length === 1 && srcNew.indexOf(String((cNew.cards[0] || {}).p || '').split('/').pop()) >= 0,
      `${(cNew.cards || []).length} 张、屏上=${(srcNew.split('/').pop() || '空')}`)
    /* 第 ⑩ 问：点小图 → 大图必须跟着这一张走。站长 10-03 真机原话「无论点什么小图，
       都是同一个大图」的根因是开窗那段读的是「我的→卡片模板」那套默认，
       跟台账无关；一篇一张之后这个根因还在，所以这条判据得留着，只是不再谈"第几张"。
       10-04 起小图那一下**直接**开大图（原来中间还隔一层详情窗，要多点一次右上那一格）。 */
    await (await $('.pad')).tap()
    await sleep(2200)
    const rPair = await waitRendered('从小图点开大图')
    const dPair = await page.data()
    ck('点小图开出来的大图：模板与二维码开关都照台账那一张摆（旧写法在这里会开出默认那套）',
      rPair.endsWith('已出图') && dPair.posterTpl === wantTpl && dPair.noQr === true
      && dPair.posterHasCard === true && dPair.detailOpen === false,
      `大图模板=${dPair.posterTpl}（该 ${wantTpl}）、noQr=${dPair.noQr}（该 true）、详情窗=${dPair.detailOpen}、${rPair}`)
    await shot('v19-6-一篇一张已生成态.png')

    /* ---------- ⑩b 那枚「查看笔记」（站长 10-04：原来这一枚是「取消」） ---------- */
    // 真点一次，落点用 pageStack 读（Page 对象没有 path()，见这条尺子的历史注释）。
    const wantId = (await page.data('posterNote') || {}).id
    await (await $('.tpl-btn.ghost')).tap()
    await sleep(2500)
    const stack = (await mp.pageStack()) || []
    const top = stack[stack.length - 1] || {}
    const topPath = String(top.path || top.route || '')
    ck('点「查看笔记」落到独立详情页那一层（页栈顶上多出一层 detail）',
      topPath === 'pages/detail/detail', `${topPath} / 栈深 ${stack.length}`)
    const dp = await mp.currentPage()
    const did = dp ? await dp.data('noteId') : null
    ck('详情页开的是大图里那一篇（noteId 与 posterNote.id 同一个）',
      String(did) === String(wantId), `${did} vs ${wantId}`)
    // 收窗那两条口一条都没撤：从详情页回来之后这层弹窗应该是收着的（不是还盖在列表上）。
    await mp.navigateBack()
    await sleep(2000)
    const back = await page.data()
    ck('从详情页回来：大图已经收掉，且没有顺手把详情窗浮出来（回的是卡片那一屏）',
      back.templateOpen === false && back.detailOpen === false,
      `templateOpen=${back.templateOpen} / detailOpen=${back.detailOpen}`)
    await closeFloats()
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
