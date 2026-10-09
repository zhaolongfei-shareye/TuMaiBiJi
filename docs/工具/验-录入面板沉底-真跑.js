// 创建入口那张暗面板"贴底 + 两档等高 + 内容不越界"的真跑自证：在模拟器里量渲染后的几何，不看 CSS 声明。
// 静态尺子（验-录入面板沉底.js / 验-统一录入条.js）能证明"规则写了 500、算式加起来够"，
// 证不了 fixed 之后它真落在底栏上方、行高把标签行顶高了两三 rpx、英文那档多折一行——
// 这三件事恰好是这一批的全部风险，所以全部量视图层算出来的值。
// 前置：跑尺子.sh 9431 验-录入面板沉底-真跑   （改过 WXSS 必须先 quit 再 cli auto）
//
// 10-08 创建入口改版：原来这把钉的是"四屏共用一个 700 的窗口 + 那排按钮沉底 + 报错行在面板内"。
// 现在窗口两档（500/580）、沉底的那一块从按钮行变成滑动条、报错行搬到面板**外面**。
// 判据跟着换成新方案的不变量，不是把代码改回去迁就旧尺子。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const lang = require('./尺子语言钉.js')
const OUT = path.resolve(__dirname, '../design/10-08创建入口暗面板/实测')
const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

// 期望值全部从源码现读，探针里不抄第二份表
const wxss = fs.readFileSync(P('pages/create/create.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const barWxss = fs.readFileSync(P('custom-tab-bar/index.wxss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const appWxss = fs.readFileSync(P('app.wxss'), 'utf8')
const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}
// 只看"这一条声明自己的值"，再从值里取第一个长度：整块里抓第一个 var() 会抓到 background 那枚
// 调色令牌（--cp-card 这类根本不在 app.wxss 里，它由页面的 inline style 发下来），于是 exec 回 null、
// 尺子在 require 阶段就崩（10-08 真跑第一次就这么死的，一条判据都没吐）。
const len = (css, prop) => {
  const m = new RegExp(`(?:^|[;\\n])\\s*${prop}:\\s*([^;\\n]*)`).exec(css)
  if (!m) return NaN
  const tok = /(-?[\d.]+)rpx|var\(--([a-z0-9-]+)\)/.exec(m[1])
  if (!tok) return NaN
  if (tok[1]) return Number(tok[1])
  const t = new RegExp(`--${tok[2]}:\\s*(\\d+(?:\\.\\d+)?)rpx`).exec(appWxss)
  return t ? Number(t[1]) : NaN
}
const panelCss = seg('.panel')
const PANEL_H = len(panelCss, 'height')
const PANEL_OPEN_H = len(seg('.panel-open'), 'height')
const PANEL_PAD_BOTTOM = Number(/padding:\s*[\d.]+rpx\s*[\d.]+rpx\s*([\d.]+)rpx/.exec(panelCss)[1])
const CARD_PAD = len(seg('.card'), 'padding')
const CARD_EDGE = len(seg('.card'), 'border')
const DOCK_BOTTOM = len(seg('.container.entry-dock .entry-wrap'), 'bottom')
const INSET = Number(/--sp-3:\s*(\d+)rpx/.exec(appWxss)[1])
const BAR_H = len(seg('.bar'), 'height')
const SWAP_H = len(seg('.home-swap'), 'height')
const SWAP_GAP = len(seg('.home-swap'), 'margin-top')
const TAB_TOP = Number(/bottom:\s*(\d+)rpx/.exec(barWxss)[1]) + Number(/\.tab-bar\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(barWxss)[1])
// 期望值读不出来就先大声红一条，别让它带着 NaN 往下跑二十几判据
const READ = { PANEL_H, PANEL_OPEN_H, PANEL_PAD_BOTTOM, CARD_PAD, CARD_EDGE, DOCK_BOTTOM, INSET, BAR_H, SWAP_H, SWAP_GAP, TAB_TOP }
if (Object.keys(READ).some((k) => !Number.isFinite(READ[k]))) {
  console.log('✗ 从源码读不出期望值：', JSON.stringify(READ))
  process.exit(1)
}
console.log('　从源码读到：', JSON.stringify(READ))
// 报错行用真串：从这一屏真会说的那几句里挑最长的，不自己造一句话
const ERR_KEYS = ['taskTimeout', 'pickFailed', 'permCamera', 'permAlbum', 'linkRule', 'noImagePicked', 'needBody', 'taskFailed', 'extractFailed', 'maxShots']
const longestErr = (lang2) => ERR_KEYS.map((k) => i18n.t(k, lang2)).reduce((a, b) => (b.length > a.length ? b : a), '')

const bad = []
const ck = (name, cond, got) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!cond) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })

// 每一格的路径必须互不相同：`wx:key="*this"` 拿路径当键，撞了键 wx:for 那一串整个不渲染
//（10-08 真跑量到的：四张同一个路径 ⇒ 屏上是空态，量出来的面板高是空态那一档，判据会假绿）。
const SHOT = (i) => `http://usr/probe-${i}.png`
const STATES = [
  ['photo', 0, false, '照片·空三枚圈'],
  ['photo', 4, false, '照片·4 张（一行）'],
  ['photo', 9, false, '照片·9 张（两行·满）'],
  ['url', 0, false, '链接·一个框'],
  ['write', 0, false, '文字·收起一行'],
  ['write', 0, true, '文字·展开两行'],
]

;(async () => {
  const langBefore = []
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { console.log('连不上自动化端口，先跑 cli auto'); process.exit(1) }
  // 冷启动那一档要重试：`cli auto` 之后只等 45 秒，模拟器这时可能还没把首页渲染出来。
  // 原来一把 reLaunch 就往下走，`.panel` 读到 null，第一条判据直接 TypeError 把整把带崩。
  let page
  for (let i = 0; i < 6; i++) {
    try {
      page = await mp.reLaunch('/pages/create/create')
      await sleep(2500)
      if (await page.$('.bar')) break
      page = null
    } catch (e) { page = null }
    await sleep(3000)
  }
  if (!page) { console.log('✗ 进不去 /pages/create/create（模拟器没渲染出来），重跑一次'); process.exit(1) }
  langBefore.push(await lang.read(mp))
  await lang.pin(mp, 'zh')

  const win = await mp.systemInfo()
  const rpx = (v) => (v * win.windowWidth) / 750
  const near = (a, b, tol) => Math.abs(a - b) <= (tol === undefined ? 2 : tol)
  const geo = (sels) => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.select(s).boundingClientRect() })
    q.exec((r) => resolve(list.map((s, i) => (r[i] ? {
      top: r[i].top, bottom: r[i].bottom, h: r[i].height, w: r[i].width, left: r[i].left, right: r[i].right,
    } : null))))
  }), sels)
  // ⚠️ 两个坑叠在这里：① 逗号写法（`'.card > view, .card > textarea'`）回空数组；② **子选择器 `>` 这台工具也不认**
  //（10-08 实测两种写法都是 0 块），于是 `Math.max(...[])` = −Infinity，"没被顶出卡外"那条会**假绿**。
  // 只能按类名一枚一枚 selectAll，并且把"一块都没摸到"本身当成红。这份名单由静态尺子
  // （验-统一录入条.js「卡里那几块 direct child 就是名单那五枚」）钉住：卡里多一块而名单没跟上会红。
  const CARD_KIDS = ['.crow', '.strip', '.field', '.wr-sw', '.sld']
  const kids = () => mp.evaluate((list) => new Promise((resolve) => {
    const q = wx.createSelectorQuery()
    list.forEach((s) => { q.selectAll(s).boundingClientRect() })
    q.exec((r) => resolve([].concat(...(r || []).map((x) => x || []))
      .map((x) => ({ top: x.top, bottom: x.bottom }))))
  }), CARD_KIDS)

  // ---------- ① 收起态：那条纸白胶囊还在原位 ----------
  let [bar, wrap, tips] = await geo(['.bar', '.entry-wrap', '.tips'])
  ck('收起态只有一条，且它顶 == 整组顶（Tips 那盒子被负 margin 抵干净，没把条顶走）',
    !!bar && !!wrap && !!tips && near(bar.top, wrap.top, 1),
    bar && wrap && `条顶 ${bar.top.toFixed(1)}／组顶 ${wrap.top.toFixed(1)}`)
  ck(`条高 ${BAR_H}rpx`, !!bar && near(bar.h, rpx(BAR_H), 1.5), bar && `${(bar.h * 750 / win.windowWidth).toFixed(1)}rpx`)
  // 条底离底栏顶那一段：10-09 之前它是「调亮度｜换背景」那一行自己占的（110 + 22），
  // 那一行搬到日期下面之后这段是空档，但**站长拍过的条底位就是这一档**，数不许跟着搬家漂。
  // 这条判据抓的是同一类账三次：`.entry-wrap` 靠 `margin-top:62vh` 那条流内 margin 落点，
  // 它上面多一行就把 Tips + 横条 + 面板整组顶下去（09-30 那行日期、10-01 那行 Tips、
  // 10-09 这一行搬家，每次都靠这条真跑才看出来）。
  ck(`条底离底栏顶留 ${SWAP_H}+${SWAP_GAP}rpx 那一段（拍过的 618 那一档，不随那一行搬家漂）`,
    !!bar && near(bar.bottom, win.windowHeight - rpx(TAB_TOP + SWAP_H + SWAP_GAP), 14),
    bar && `条底 ${bar.bottom.toFixed(0)}｜应在 ${(win.windowHeight - rpx(TAB_TOP + SWAP_H + SWAP_GAP)).toFixed(0)} 上下`)

  // ---------- ② 六个态 × 两门语言：两档等高、内容不越界、条沉到同一处 ----------
  const rows = []
  for (const L of ['zh', 'en']) {
    for (const [active, shots, open, label] of STATES) {
      // 走 automator 的 page.setData + callMethod，不用 mp.evaluate 里那句 setData：
      // 后者设数组时服务层 data 到位、渲染层却不跟（10-08 实测：evaluate 设 1 张，屏上仍是空态，
      // 于是量到的是"上一帧"的面板高——这种红不报出来，会把整节判据变成假绿）。
      await page.setData({
        lang: L,
        t: i18n.texts(L),
        active,
        sldIcon: { photo: 'images', url: 'link', write: 'pen' }[active],
        previewImages: Array.from({ length: shots }, (_, i) => SHOT(i)),
        urlInput: active === 'url' ? 'https://mp.weixin.qq.com/s/abcdef' : '',
        urlHint: active === 'url' ? 'ok' : 'idle',
        writeBody: active === 'write' ? '第一段\n第二段' : '',
        bodyFocus: !!open,
        errLine: '',
      })
      await page.callMethod('_sync')
      // 等到屏上真的画出这一排格（照片档）再量：不等就是拿上一帧的高度证下一帧的判据
      const wantTh = active === 'photo' && shots ? shots + 1 : null
      for (let i = 0; i < 12 && wantTh; i++) {
        if ((await page.$$('.th')).length === wantTh) break
        await sleep(200)
      }
      await sleep(320)
      const tag = `${L} ${label}`
      const [panel, card, out, g] = await geo(['.panel', '.card', '.out', '.entry-wrap'])
      // 「展开」有两条触发路：文字档看焦点、照片档看"这一行放不放下了"（5 格是行宽）
      const expanded = open || (active === 'photo' && shots + 1 > 5)
      const wantH = expanded ? PANEL_OPEN_H : PANEL_H
      if (!panel || !card || !out || !g) {
        ck(`${tag}：面板、卡、框外那行、整组都读得到`, false,
          `panel=${!!panel} card=${!!card} out=${!!out} wrap=${!!g}`)
        continue
      }
      rows.push({ 态: `${L} ${label}`, 面板: (panel.h * 750 / win.windowWidth).toFixed(1) })
      ck(`${tag}：面板高 ${wantH}rpx`, near(panel.h, rpx(wantH), 3),
        `${(panel.h * 750 / win.windowWidth).toFixed(1)}rpx`)
      ck(`${tag}：整组贴底（组底 = 视口高 − ${DOCK_BOTTOM}rpx）`,
        near(g.bottom, win.windowHeight - rpx(DOCK_BOTTOM), 2),
        `组底离屏底 ${(750 * (win.windowHeight - g.bottom) / win.windowWidth).toFixed(1)}rpx`)
      ck(`${tag}：左右内缩等于 --sp-3（${INSET}rpx），fixed 没吃父级 padding`,
        near(panel.left, rpx(INSET), 2) && near(panel.w, win.windowWidth - 2 * rpx(INSET), 3),
        `左 ${(panel.left * 750 / win.windowWidth).toFixed(1)}rpx 宽 ${(panel.w * 750 / win.windowWidth).toFixed(1)}rpx`)
      // 框外那一行不许压进面板：它顶多是"浮在形象图上的一行字"
      ck(`${tag}：那行小字在面板外，两枚不相撞、也不越出面板左右`,
        out.bottom <= panel.top + 1 && out.left >= panel.left - 1 && out.right <= panel.right + 1,
        `字底 ${out.bottom.toFixed(0)}｜面板顶 ${panel.top.toFixed(0)}`)
      // 卡里最后一块的下沿必须正好落在"卡内下沿"那一线上：
      // 高出线＝被裁（看不见也点不到），差太多＝没沉到底（每一态按钮位置会跳）
      const kk = await kids()
      const lastBottom = kk.length ? Math.max(...kk.map((x) => x.bottom)) : NaN
      const innerBottom = card.bottom - rpx(CARD_PAD + CARD_EDGE)
      ck(`${tag}：最后一块没被顶出卡外（离面板内下沿 ≤ 3rpx）`,
        kk.length > 0 && Number.isFinite(lastBottom) && lastBottom <= innerBottom + rpx(3),
        `超 ${Number.isFinite(lastBottom) ? ((lastBottom - innerBottom) * 750 / win.windowWidth).toFixed(1) : '量不到'}rpx／卡里 ${kk.length} 块`)
      ck(`${tag}：那一块沉到了同一处（底边距卡内下沿 < 3rpx，各态一条线）`,
        kk.length > 0 && innerBottom - lastBottom <= rpx(3),
        kk.length ? `${((innerBottom - lastBottom) * 750 / win.windowWidth).toFixed(1)}rpx` : '卡里一块都没摸到')
      // 「不挡人头」这一条分两档钉：
      // ① 收起那一档门槛 55% 屏，容 2px（实测 414.0px／线在 414.15px，差 0.15px 是四舍五入，不是布局坏了）；
      // ② 展开那一档只多一行（500→580），顶到 49.5% 屏。两种展开分开看：
      //    文字档是**焦点**撑开的，真机上键盘一定已经顶起来、屏下半截本来就没了；
      //    照片 6 张以上是**格数**撑开的，没有键盘垫着，那一档确实盖到鼻尖以下——
      //    这是"上限 9 张"与"展开只多一行"两条一起逼出来的，不是可以偷偷改的数，报告里单列给他看。
      //    ⚠️ 门槛 49% 是我自己分的，他只拍过"不许挡人头"那句、针对的是默认那一屏。
      const gate = expanded ? 0.49 : 0.55
      ck(`${tag}：面板顶在视口 ${(panel.top / win.windowHeight * 100).toFixed(1)}%（门槛 ${Math.round(gate * 100)}%，${expanded ? '展开态·多一行' : '不挡那张脸'}）`,
        panel.top >= win.windowHeight * gate - 2, `${(panel.top / win.windowHeight).toFixed(3)} 屏`)
      // 「整个不渲染」＝那一行不占位：`.home-swap` 靠 CSS `display:none` 撤，节点仍在树里
      //（`page.$$('.home-swap')` 照样回 1、`boundingClientRect` 回的是**高 0 的那一份**，不是 null），
      // 所以判"没画"要按高度判，别按摸没摸到判。
      const swap = (await geo(['.home-swap']))[0]
      ck(`${tag}：展开时换背景那一行整个不占位（它一在就会跟面板抢那一段）`,
        !swap || swap.h < 1, swap ? `高 ${swap.h.toFixed(0)}px` : '量不到')
    }
    if (L === 'zh') {
      await mp.screenshot({ path: `${OUT}/沉底-zh-六态末.png` })
    } else {
      await mp.screenshot({ path: `${OUT}/沉底-en-六态末.png` })
    }
  }
  console.table(rows)

  // ---------- ③ 最长那句报错：画在框外，且不许把面板顶高 ----------
  for (const L of ['zh', 'en']) {
    const err = longestErr(L)
    await page.setData({
      lang: L, t: i18n.texts(L), active: 'write', previewImages: [], writeBody: '',
      bodyFocus: false, errLine: err, errPerm: true,
    })
    await page.callMethod('_sync')
    await sleep(520)
    const [panel, errRect, out] = await geo(['.panel', '.out-err', '.out'])
    ck(`${L} 最长报错「${err.slice(0, 14)}…」画在框外`,
      !!errRect && !!panel && errRect.bottom <= panel.top + 1,
      errRect && panel && `报错底 ${errRect.bottom.toFixed(0)}｜面板顶 ${panel.top.toFixed(0)}`)
    ck(`${L} 带报错时面板仍是 ${PANEL_H}rpx（没被顶高、也没把框外那行吞进来）`,
      !!panel && near(panel.h, rpx(PANEL_H), 3), panel && `${(panel.h * 750 / win.windowWidth).toFixed(1)}rpx`)
    ck(`${L} 那一句是一行读完（折了就会顶到标题那一行）`,
      !!errRect && near(errRect.h, rpx(20 * 1.4), 8), errRect && `行高 ${(errRect.h * 750 / win.windowWidth).toFixed(1)}rpx`)
    ck(`${L} 报错行与框外小字行各占一行、不叠字`,
      !!errRect && !!out && errRect.top >= out.bottom - 1, out && errRect && `${out.bottom.toFixed(0)} → ${errRect.top.toFixed(0)}`)
  }
  await mp.screenshot({ path: `${OUT}/沉底-最长报错.png` })

  // ---------- ④ 忙态不许把这一枚进度打断 ----------
  await page.setData({ active: 'url', errLine: '', urlInput: 'https://mp.weixin.qq.com/s/abcdef', busy: 'url', fillPct: 42, done: false })
  await page.callMethod('_sync')
  await sleep(500)
  await (await page.$('.title-row')).tap()
  await sleep(600)
  let d = await page.data()
  ck('忙的时候点空白不收面板（进度不能藏起来）', d.active === 'url' && d.busy === 'url', `${d.active}/${d.busy}`)
  const sldFill = (await geo(['.sld-fill']))[0]
  const sldBox = (await geo(['.sld']))[0]
  ck('填充那一格真的按 fillPct 画出宽度（42% ≈ 轨道内宽的 42%）',
    !!sldFill && !!sldBox && near(sldFill.w, (sldBox.w - 2 * rpx(len(seg('.sld'), 'border'))) * 0.42, rpx(12)),
    sldFill && sldBox && `填充 ${(sldFill.w * 750 / win.windowWidth).toFixed(0)}rpx／轨道 ${(sldBox.w * 750 / win.windowWidth).toFixed(0)}rpx`)
  ck('进度那一格仍然盖不到那圈白边（左沿 == 边框内侧）',
    !!sldFill && near(sldFill.left, sldBox.left + rpx(len(seg('.sld'), 'border')), 2),
    sldFill && `填充左 ${sldFill.left.toFixed(1)}｜轨道左 ${sldBox.left.toFixed(1)}`)
  await mp.screenshot({ path: `${OUT}/沉底-忙态进度42.png` })
  await mp.evaluate(() => { getCurrentPages().slice(-1)[0].setData({ busy: '', fillPct: 0 }) })

  await lang.pin(mp, langBefore[0])
  await mp.close()
  console.log(bad.length ? `\n失败 ${bad.length} 条：\n  ✗ ` + bad.join('\n  ✗ ')
    : `\n真跑全过　两档 ${PANEL_H}/${PANEL_OPEN_H}rpx、贴底 ${DOCK_BOTTOM}rpx、内缩 ${INSET}rpx`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
