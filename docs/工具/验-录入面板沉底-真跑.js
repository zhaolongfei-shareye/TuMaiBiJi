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
// 2.2 B 方案：整组只有那一行（Tips 从组外那一行搬进右列 `.blk-tips`，组外那行 `.tips` 撤了），
// 所以整组高＝左块那一段。三个数还是从样式表现读，不抄在这里。
const GROUP_H = len(seg('.blk-person'), 'height')
const SWAP_H = len(seg('.home-swap'), 'height')
const TAB_TOP = Number(/bottom:\s*(\d+)rpx/.exec(barWxss)[1]) + Number(/\.tab-bar\s*\{[\s\S]*?height:\s*(\d+)rpx/.exec(barWxss)[1])
// 收起态那一组与底栏顶之间最少留多少——不抄数，从组顶那条 `min()` 的夹值反推：
// 夹值 = 整组 GROUP_H ＋ 底栏 TAB_TOP ＋ 最少留白，所以留白就是夹值减掉那两个。
// （10-11 那版这个夹值是 546＝Tips74＋缝12＋块308＋底栏128＋24；B 方案整组抬成 410 一行 ⇒ 562。
//   原来这里还写死过 132，那是纸白胶囊时代的空档，载体换了那个数就没主了。）
const BLK_CLAMP = Number(/calc\(100vh - (\d+)rpx\)/.exec(seg('.home-blk'))[1])
const MIN_GAP = BLK_CLAMP - GROUP_H - TAB_TOP
// 期望值读不出来就先大声红一条，别让它带着 NaN 往下跑二十几判据
const READ = { PANEL_H, PANEL_OPEN_H, PANEL_PAD_BOTTOM, CARD_PAD, CARD_EDGE, DOCK_BOTTOM, INSET, GROUP_H, SWAP_H, BLK_CLAMP, MIN_GAP, TAB_TOP }
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
      if (await page.$('.home-blk')) break
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
      .map((x) => ({ top: x.top, bottom: x.bottom, h: x.height }))))
  }), CARD_KIDS)

  // ---------- ① 收起态：2.2 那一组还在原位（组外那行 Tips 搬进了右列） ----------
  let [blk, person, tipsIn] = await geo(['.home-blk', '.blk-person', '.blk-tips'])
  ck('收起态那一组只一枚，且组顶 == 左块顶（组没内边距，第一档贴着顶）',
    !!blk && !!person && near(blk.top, person.top, 1),
    blk && person && `组顶 ${blk.top.toFixed(1)}／块顶 ${person.top.toFixed(1)}`)
  ck(`整组高 ${GROUP_H}rpx（就是左块那一条；Tips 已在右列里，不再占组外一段）`,
    !!blk && near(blk.h, rpx(GROUP_H), 4), blk && `${(blk.h * 750 / win.windowWidth).toFixed(1)}rpx`)
  ck('Tips 真在组里（右列那一格），不在组外那一行', !!tipsIn && !!blk && tipsIn.top >= blk.top - 1
    && tipsIn.bottom <= blk.bottom + 1, tipsIn && `Tips ${tipsIn.top.toFixed(0)}~${tipsIn.bottom.toFixed(0)}／组 ${blk.top.toFixed(0)}~${blk.bottom.toFixed(0)}`)
  // 这条抓的是全局同名那一刀：app.wxss 里 `.blk` 是笔记列表的分类色方块（176 见方 + overflow:hidden），
  // 10-10 落码第一版组名就叫 `.blk`，整组被裁成 176、右两枚宽 0——**静态判据一条都没红**，只有这里量得出来。
  ck(`左块屏上真是 308×${GROUP_H}（被全局同名那条裁走的话这里先红；308 见方是 B 方案之前那一版）`,
    !!person && near(person.w, rpx(308), 3) && near(person.h, rpx(GROUP_H), 3),
    person && `${(person.w * 750 / win.windowWidth).toFixed(0)}×${(person.h * 750 / win.windowWidth).toFixed(0)}rpx`)
  // 组底与底栏顶：`min(66.3%, 100vh−562rpx)` 里那个 562 = 整组 + 底栏 + 最少留白，
  // 夹住的那一头正好留 MIN_GAP；没夹住（高屏按 66.3%）只会留得更多，所以判"不越过"而不是"等于"。
  ck(`组底不越过底栏顶，且至少留 ${MIN_GAP}rpx（夹值那一头的下界就是它）`,
    !!blk && blk.bottom <= win.windowHeight - rpx(TAB_TOP + MIN_GAP) + 3,
    blk && `组底 ${blk.bottom.toFixed(0)}｜底栏顶 ${ (win.windowHeight - rpx(TAB_TOP)).toFixed(0)}`)

  // 站长 10-11 12:2x 要「调亮度／换背景」这一行**两屏都有**，所以先在这里把收起态那一屏的顶边记下来，
  // 下面六个展开态各自回来对一次账——只判"画没画"不够，两屏各画一处就是他 11:2x 抓过的那种跳。
  const [swap0] = await geo(['.home-swap'])
  ck(`收起态这一行画着，高 ${SWAP_H}rpx（盒子 88 是给指头的热区，不是字高）`,
    !!swap0 && near(swap0.h, rpx(SWAP_H), 2), swap0 && `${(swap0.h * 750 / win.windowWidth).toFixed(1)}rpx`)

  // ---------- ② 六个态 × 两门语言：两档等高、内容不越界、条沉到同一处 ----------
  const rows = []
  for (const L of ['zh', 'en']) {
    // 基准必须**同一门语言现取**：标题行那一句中英不一样高，拿 zh 的顶边去比 en 的六个态会整批假红
    //（10-11 12:3x 第一趟就红在这儿：zh 63.5、en 59.0，差的 4.5rpx 是标题那一行，不是这一行跳了）。
    await page.setData({ lang: L, t: i18n.texts(L), active: '', sldIcon: 'images',
      previewImages: [], urlInput: '', urlHint: 'idle', writeBody: '', bodyFocus: false, errLine: '' })
    await page.callMethod('_sync')
    await sleep(320)
    const [swapBase] = await geo(['.home-swap'])
    const swapTop = swapBase && swapBase.top
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
        `超 ${Number.isFinite(lastBottom) ? ((lastBottom - innerBottom) * 750 / win.windowWidth).toFixed(1) : '量不到'}rpx／卡里 ${kk.length} 块`
        // 每一块的高一起打出来：静态那把算的是"式子对不对"，这一行给的是"屏上到底多高"，
        // 两者差在哪一块，看这一串就知道（10-10 深夜展开那两档溢出 7~13rpx 就是这么定位的）。
        + `／各块高 ${kk.map((x) => ((x.h || 0) * 750 / win.windowWidth).toFixed(1)).join(' ')}`)
      // 10-08 深夜他拍的是「照片那一排 `flex-start`→**center**」，所以照片·空这一档那一排
      // 不贴卡底、而是在卡内上下留白相等。原来这一条把"各态一条线"写成了"底边距卡内下沿
      // <3rpx"——那是 09-28 沉底那一版的**实现方式**，不是他要的不变量；换成 center 之后
      // 红的是尺子自己（10-10 真跑：只有这一档红，其余五态仍贴底）。两档分开钉。
      const centered = active === 'photo' && shots === 0
      if (centered) {
        const innerTop = card.top + rpx(CARD_PAD + CARD_EDGE)
        const last = kk.length ? kk.reduce((a, b) => (b.bottom > a.bottom ? b : a)) : null
        const up = last ? ((last.top - innerTop) * 750 / win.windowWidth) : NaN
        const dn = last ? ((innerBottom - last.bottom) * 750 / win.windowWidth) : NaN
        ck(`${tag}：那一排在卡内居中（10-08 拍的 center＝上下留白相等，不再要求贴底）`,
          Number.isFinite(up) && Math.abs(up - dn) <= 3, `上 ${up.toFixed(1)}rpx 下 ${dn.toFixed(1)}rpx`)
      } else {
        ck(`${tag}：那一块沉到了同一处（底边距卡内下沿 < 3rpx，各态一条线）`,
          kk.length > 0 && innerBottom - lastBottom <= rpx(3),
          kk.length ? `${((innerBottom - lastBottom) * 750 / win.windowWidth).toFixed(1)}rpx` : '卡里一块都没摸到')
      }
      // 「不挡人头」这一条分两档钉：
      // ① 收起那一档门槛 55% 屏，容 2px（实测 414.0px／线在 414.15px，差 0.15px 是四舍五入，不是布局坏了）；
      //    （10-10 压进红框那两档按 rpx 算是顶 66.3%／61.0%，比这两道门槛低一截。门槛不跟着
      //     往上抬：它守的是"别再长回去挡脸"，不是"就该停在这么低"。实测值由这条自己打出来。）
      // ② 展开那一档只多一行（410→490），顶到 61.0% 屏。两种展开分开看：
      //    文字档是**焦点**撑开的，真机上键盘一定已经顶起来、屏下半截本来就没了；
      //    照片 6 张以上是**格数**撑开的，没有键盘垫着，那一档确实盖到鼻尖以下——
      //    这是"上限 9 张"与"展开只多一行"两条一起逼出来的，不是可以偷偷改的数，报告里单列给他看。
      //    ⚠️ 门槛 49% 是我自己分的，他只拍过"不许挡人头"那句、针对的是默认那一屏。
      const gate = expanded ? 0.49 : 0.55
      ck(`${tag}：面板顶在视口 ${(panel.top / win.windowHeight * 100).toFixed(1)}%（门槛 ${Math.round(gate * 100)}%，${expanded ? '展开态·多一行' : '不挡那张脸'}）`,
        panel.top >= win.windowHeight * gate - 2, `${(panel.top / win.windowHeight).toFixed(3)} 屏`)
      // 10-11 12:2x 他那句「调亮度，换背景，再第二屏也需要，第二屏就是带拍摄面板那个」曾经把这一行
      // 钉成"两屏都画、顶边同一个数"。**10-15 02:5x 他追了一句「第二屏不支持三个设置，要隐藏」** ⇒
      // 那条作废，现在钉的是反面：展开态这一行**不画、也不占位**。
      // 判"没画"仍按高度判——`display:none` 时节点还在树里、`boundingClientRect` 回的是高 0 那一份，
      // 不是 null（10-11 就为这个红过一次）；节点真不在树里也算"没画"，只是要把读到的说清楚。
      const swap = (await geo(['.home-swap']))[0]
      ck(`${tag}：这一行展开态**不画**（他 10-15「第二屏不支持三个设置，要隐藏」），也不占位`,
        !swap || swap.h <= 0.5,
        swap ? `高 ${(swap.h * 750 / win.windowWidth).toFixed(1)}rpx｜顶 ${swap.top.toFixed(1)}` : '节点不在树里（也算没画）')
    }
    if (L === 'zh') {
      await mp.screenshot({ path: `${OUT}/沉底-zh-六态末.png` })
    } else {
      await mp.screenshot({ path: `${OUT}/沉底-en-六态末.png` })
    }
  }
  console.table(rows)

  /* ---------- ③ 最长那句报错：画在输入框上面那枚气泡里，且不许把面板顶高 ----------
     10-10 深夜这一位搬了家：原来它挂在框外那一行（那一句会把整组顶高一格，站长原话
     「报错消息不要在这里出现，换到输入框上面，用带阴影长条形气泡框弹出，几秒后消失」）。
     所以判据跟着换两头：① 框外那一行不再有任何报错节点；② 面板还是同一档高（浮层不占流内高度）。 */
  for (const L of ['zh', 'en']) {
    const err = longestErr(L)
    await page.setData({
      lang: L, t: i18n.texts(L), active: 'write', previewImages: [], writeBody: '',
      bodyFocus: false, errLine: err, errPerm: true, hintLine: '',
    })
    await page.callMethod('_sync')
    await sleep(520)
    const [panel, bub, fld, out] = await geo(['.panel', '.hint-bubble', '.field', '.out'])
    const bubEl = await page.$('.hint-bubble')
    const bubTx = bubEl ? await bubEl.text() : ''
    const bubCls = bubEl ? ((await bubEl.attribute('class')) || '') : ''
    ck(`${L} 最长报错「${err.slice(0, 14)}…」画在面板里那一枚气泡上（屏上读得到同一句）`,
      !!bub && !!panel && bub.top >= panel.top && String(bubTx).trim() === err,
      bub && `气泡 ${Math.round(bub.top)}~${Math.round(bub.bottom)}／面板顶 ${Math.round(panel.top)}｜屏上「${bubTx}」`)
    ck(`${L} 框外那一行不再有报错节点（旧的那一行整条撤了，留着就是两处报错两个位置）`,
      (await page.$$('.out-err')).length === 0 && !!out, `${(await page.$$('.out-err')).length} 枚`)
    ck(`${L} 气泡在输入框正上方，且底边不越过框的中线（字竖直居中，那一行露得出来）`,
      !!bub && !!fld && bub.bottom <= fld.top + fld.h / 2,
      bub && fld && `气泡底 ${Math.round(bub.bottom)}｜框 ${Math.round(fld.top)}~${Math.round(fld.bottom)}`)
    ck(`${L} 带报错时面板仍是 ${PANEL_H}rpx（浮层不占流内高度，顶高＝搬家没搬成）`,
      !!panel && near(panel.h, rpx(PANEL_H), 3), panel && `${(panel.h * 750 / win.windowWidth).toFixed(1)}rpx`)
    // 行数从高度倒推：单行那一档是 min-height 52，每多一行加一行字高（fs-meta 24×1.4≈33.6）。
    const fsMeta = parseFloat((/--fs-meta:\s*([\d.]+)rpx/.exec(appWxss) || [, '24'])[1])
    const lineH = rpx(fsMeta * 1.4)
    const lines = !!bub ? Math.max(1, Math.round((bub.h - rpx(12)) / lineH)) : 0
    ck(`${L} 那一句最多两行读完（三行就是气泡快顶到卡底了）`,
      !!bub && lines <= 2, `${lines} 行／气泡高 ${(bub.h * 750 / win.windowWidth).toFixed(1)}rpx`)
    ck(`${L} 权限那一类整枚可点：气泡挂着"可点"那一档（::after 那个 › 也算在文字里）`,
      /hint-bubble-act/.test(bubCls), bubCls)
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
