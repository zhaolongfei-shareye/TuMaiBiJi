// 笔记列表 D2 这一批的真跑自证：在模拟器里真读计算样式、真截图、真采像素。
// 静态尺子只能证明"CSS 有规则、WXML 有绑定"，证不了这两个加起来在渲染后真是同一个色——
// 统一录入条那两条缺陷就是这么漏掉的（.bar.open 有规则没绑定、占位符吃 opacity），
// 所以这一把全部量视图层算出来的值，不量 data。
// 底栏是组件，automator 的 page.$ 从页面树够不到（实测 .tab-bar / .tab-item 全是 null），
// 那一面改成从截图采像素，采法在 采-底栏像素.py。
//
// 09-30 这一把跟着改了两处口径：① 外观设置里「用人像 / 不用」那一节整块撤了，
// 这一屏永远铺图，所以搜索条那块面固定是纸白、不再吃 chromeOf——派生色现在只管底栏那枚胶囊；
// ② 行内结构是 v4/v5 那一版（收起行只有点＋标题＋日期，分类名和 meta 行展开才出现），
// 原来钉"收起行的 .cat 宽度"和"整行 meta 同色"的两条得挪到展开那一行去量。
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-列表D2-真跑.js
const automator = require('miniprogram-automator')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-D2优化/实测')
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const APP_WXSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/app.wxss'), 'utf8')
const BAR_WXSS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/custom-tab-bar/index.wxss'), 'utf8')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
// 计算样式回来的是 rgb(...)，派生色是 #HHHHHH，两边都归一到三元数组再比。
const rgbOf = (s) => (String(s).match(/-?\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
const hexArr = (h) => {
  const m = /#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h)
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : []
}
const near = (a, b, tol) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= (tol === undefined ? 1 : tol))
const css = (s) => String(s).replace(/\s+/g, '')
// 纸白从源码现读，探针里不抄第二份表
const PAPER = /const PAPER = '(#[0-9A-Fa-f]{6})'/.exec(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/palette.js'), 'utf8'))[1]
// 图上那一面搜索条的字色同理：从 index.wxss 现读那一条 --chrome-ink，别在探针里写第二份
const INK = hexArr(/--chrome-ink:\s*(#[0-9A-Fa-f]{6})/i.exec(
  fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxss'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ''))[1])
const secondaryOf = (w) => {
  const m = new RegExp(`\\.${p.themeOf(w).cls}\\s*\\{([\\s\\S]*?)\\}`).exec(APP_WXSS)
  // 十六进制和 rgba 两种写法都要认：淡雅那两枚的 --text-secondary 是
  // `rgba(27, 42, 33, 0.66)`，原来这里只匹配 #rrggbb，拿到天青就 null[1] 崩掉。
  return (/--text-secondary:\s*(#[0-9A-Fa-f]{6}|rgba?\([^)]*\))/.exec(m[1]) || [])[1] || ''
}
// 同一个读法管所有令牌：横条那一层毛玻璃的 --bg-card-glass 也从各主题块里现读，
// 探针不抄第二份表（改了主题忘了改判据，就是上一把 .sc-card 那条假绿的路子）。
const tokenOf = (w, name) => {
  const m = new RegExp(`\\.${p.themeOf(w).cls}\\s*\\{([\\s\\S]*?)\\}`).exec(APP_WXSS)
  return (new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6}|rgba?\\([^)]*\\))`).exec(m[1]) || [])[1] || ''
}
// 计算样式回的是 rgb()/rgba()，源码里可能是 #hex 也可能是 rgba()——两边都拆成三个数再比
const anyRgb = (v) => (/^#/.test(String(v)) ? hexArr(v) : rgbOf(v))
// 未选中那一档屏幕上是"纸白按 alpha 叠在胶囊上"的结果，判像素要先把这层混出来
const blend = (fgHex, bgHex, alpha) => hexArr(fgHex).map((v, i) => Math.round(alpha * v + (1 - alpha) * hexArr(bgHex)[i]))
const sampleBar = (png) => JSON.parse(execFileSync('python3',
  [path.resolve(__dirname, '采-底栏像素.py'), png], { encoding: 'utf8' }))

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })

  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`第 ${i + 1} 次进 ${url} 没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  const styleOf = async (page, sel, prop) => {
    const el = await page.$(sel)
    if (!el) return null
    const v = await el.style(prop)
    // 读不到值要单独红：统一录入条那条 "null === null 判成两边同色" 的假绿不能再犯
    if (v === null || v === undefined) throw new Error(`${sel} 的 ${prop} 读不到`)
    return v
  }
  const before = await mp.evaluate(() => JSON.stringify(wx.getStorageSync('localWallpaper') || ''))
  // 这台机型的 rpx→px 比例（1rpx = windowWidth/750），几何断言全按它换算
  const R = (await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)) / 750

  // 两枚代表：米白是"只换页面底"那一族，天青是"整套色阶"那一族（方块、卡、按钮一起收进一支色相）。
  // 原来第二枚是夜紫——09-30 深色那两枚整条链路屏蔽了（列表永远铺背景图，而深色卡底是 5% 白薄膜，
  // 贴在照片上等于没有），页面上再也走不到那一档，拿它当代表就是拿一个渲染不出来的状态做判据。
  // 深色那两档的取色规则仍然由静态尺子 验-色板零回归.js 直接调 palette 函数钉着。
  for (const w of ['default', 'tint-celadon']) {
    const label = p.themeOf(w).label
    const chrome = p.chromeOf(w)
    await mp.evaluate((key) => wx.setStorageSync('localWallpaper', key), w)
    // 刚 cli auto 完，头一次 reLaunch 会撞上 "getPageMetaByWebviewId(...) is null"：
    // 页面进去了、data 却是空的。上一把带着 0 条往下量，最后在一行几何断言上崩掉，
    // 白跑六分钟。所以这里重试到真拿到笔记为止，拿不到就大声停，不往下算。
    let page, d
    for (let i = 0; i < 3; i++) {
      page = await enter('/pages/index/index')
      await sleep(4500)
      d = await page.data()
      if ((d.notes || []).length) break
      console.log(`第 ${i + 1} 次进列表只拿到 0 条，重进一次`)
    }
    if (!(d.notes || []).length) throw new Error('列表三次都是空的：这一把没法量（先确认登录态与网络）')

    // ---------- ① 搜索那一面：这一屏永远铺图，固定纸白 ----------
    // 原来这条钉的是"搜索条底色 = chromeOf"，那是背景开关还活着、这一屏能退回纯壁纸底时的口径。
    // 09-30 起那一节整块撤了，chromeOf 只剩底栏胶囊一个消费者。
    // 同一天 v8 又把搜索条收成分类行最右那枚圆钮：收起态量不到 .sc-card，这块面由 .sc-btn
    // 代表（两条吃同一条翻色规则），展开态里条子与字色的那三条在 验-列表头部铺图-真跑.js 量。
    const scBg = await styleOf(page, '.sc-btn', 'background-color')
    ck(`${label}：搜索那枚圆钮底色 = 纸白（图上那一面，与哪套壁纸无关）`,
      near(rgbOf(scBg), hexArr(PAPER), 2), `${scBg} vs ${PAPER}`)
    const scInk = await styleOf(page, '.sc-btn', 'color')
    ck(`${label}：圆钮上的放大镜 = 墨色（纸白面上不能再压白字）`, near(rgbOf(scInk), INK, 2), scInk)
    ck(`${label}：搜索条上占位符不吃 opacity（样式里没有这条）`,
      !/\.sc-ph\s*\{[^}]*opacity/.test(fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.wxss'), 'utf8')))

    // ---------- ② 行卡：方块整个撤掉了，分类身份退到 meta 行 ----------
    ck(`${label}：行卡里已经没有 .blk`, (await page.$$('.blk')).length === 0)
    ck(`${label}：列表有数据，这几条不是空转`, (d.notes || []).length > 0, `${(d.notes || []).length} 条`)
    const cats = await page.$$('.cat')
    const rows = await page.$$('.note-row')
    ck(`${label}：每条行卡各有一枚分类身份`, cats.length === rows.length && rows.length > 0,
      `${rows.length} 卡 / ${cats.length} 枚`)
    const mism = []
    for (let i = 0; i < cats.length; i++) {
      const want = p.catSkinFor(d.notes[i].category_id, w)
      const st = css((await cats[i].attribute('style')) || '')
      const painted = await cats[i].style('color')
      if (!st.includes(`--cat-ink:${want.text}`) || !st.includes(`--cat-dot:${want.dot}`)
        || !near(rgbOf(painted), hexArr(want.text), 2)) {
        mism.push(`#${i}(${d.notes[i].category_id}) ${st} / ${painted} ≠ ${want.text}`)
      }
      const cls = (await cats[i].attribute('class')) || ''
      if (/is-ring/.test(cls) !== want.ring) mism.push(`#${i} 空心环挂错 ${cls} ring=${want.ring}`)
    }
    ck(`${label}：逐条比对——递进来的值和渲染出来的字色都是 catSkinFor 那个`, mism.length === 0, mism.join(' | '))
    const dot = await page.$('.cat-dot')
    const ds = dot && await dot.size()
    const want0 = cats.length ? p.catSkinFor(d.notes[0].category_id, w) : null
    const dotBg = dot && await dot.style('background-color')
    // 空心环那一格：底色必须是透明、描边才是那个字色；实心那格反过来。
    // 只比背景会在环那一档读到 rgba(0,0,0,0) 就判成"点没上色"，这是上一把的红。
    const dotOk = !!ds && Math.abs(ds.width - 14 * R) <= 1 && Math.abs(ds.height - 14 * R) <= 1
      && (want0.ring
        ? (/rgba\(0,\s*0,\s*0,\s*0\)/.test(dotBg) && near(rgbOf(await dot.style('border-top-color')), hexArr(want0.text), 2))
        : near(rgbOf(dotBg), hexArr(want0.dot), 2))
    ck(`${label}：那枚点渲染对了（${want0.ring ? '空心环：透明底 + 描边取字色' : '实心：点色 ' + want0.dot}）且 14rpx 见方`,
      dotOk, `${dotBg} / ${ds && ds.width}x${ds && ds.height}`)

    // ---------- ②a 横条那一层毛玻璃 + 日期字号（站长 10-01 两条） ----------
    // 这一组必须在收起态量：展开那一行也吃同一条背景规则，但脚注里另有一枚 .dt。
    const rowBg = await styleOf(page, '.note-row', 'background-color')
    const wantGlass = tokenOf(w, 'bg-card-glass')
    ck(`${label}：横条底色 = 本主题 --bg-card-glass（95% 那一档，不再是实色卡底）`,
      near(rgbOf(rowBg), anyRgb(wantGlass), 2), `${rowBg} vs ${wantGlass}`)
    const glassEl = await page.$('.note-row')
    const bf = glassEl && await glassEl.style('backdrop-filter')
    ck(`${label}：横条真挂了背景模糊（只调透明度不叫毛玻璃）`, /blur\(/.test(String(bf)), String(bf))
    const dtPx = parseFloat(await styleOf(page, '.note-row .dt', 'font-size'))
    const tiPx = parseFloat(await styleOf(page, '.note-row .row-title', 'font-size'))
    ck(`${label}：日期比标题小一档（收进 --fs-meta 24rpx，原来它跟标题同为 16px≈31rpx）`,
      Math.abs(dtPx - 24 * R) <= 0.8 && dtPx < tiPx, `日期 ${dtPx}px / 标题 ${tiPx}px（24rpx=${(24 * R).toFixed(1)}px）`)
    // ---------- ②b／③ 分类名和 meta 行只在展开那一行里有 ----------
    // v4 起收起行只剩「点＋标题＋日期」：原来这两条拿收起行的 .cat 量宽度，量到的是那枚 7px 的点；
    // .row-foot 在收起态整个不渲染，styleOf 读到 null，再被 "null === null" 判成"整行同色"——假绿。
    const firstRow = (await page.$$('.note-row'))[0]
    await firstRow.tap()          // 第一下展开手风琴（第二下才会开详情浮窗）
    await sleep(1400)
    const openCat = await page.$('.note-row.open .row-foot .cat')
    const cs = openCat && await openCat.size()
    ck(`${label}：展开行分类那一段没被压扁（flex:none 生效）`, !!cs && cs.width > 60 * R, cs && `${cs.width}px`)
    const footColor = await styleOf(page, '.note-row.open .row-foot', 'color')
    const dtColor = await styleOf(page, '.note-row.open .row-foot .dt', 'color')
    const sec = secondaryOf(w)
    ck(`${label}：日期吃 --text-secondary（不再是 tertiary 那一档）`,
      near(rgbOf(dtColor), anyRgb(sec), 2), `${dtColor} vs ${sec}`)
    ck(`${label}：meta 行整行同一个色（两值都得真读到，null 不算）`,
      !!footColor && !!dtColor && css(footColor) === css(dtColor), `${footColor} / ${dtColor}`)
    await page.setData({ openIdx: -1 })   // 收回去：下一枚壁纸量的是同一批收起行
    await sleep(700)

    // ---------- ④ 底栏（组件够不到，采像素）----------
    // 像素比对留 ±8：截图落盘带一次色彩管理，偏差不在 CSS 里——计算样式那一头读到的是
    // 精确值（上面①已经钉过）。这个容差是拿三枚壁纸实测出来的，不是猜的：
    // 米白 #443C25 → (67,60,40)｜夜紫 #2D2D6C → (45,45,104)｜天青 #25442B → (44,67,45)，
    // 单通道最大偏 7（天青那一支的红）。原来留 ±6 是只按夜紫那一档定的，换一枚就假红。
    const png = `${OUT}/实测-${label}.png`
    await mp.screenshot({ path: png })
    const s = sampleBar(png)
    ck(`${label}：胶囊填充色 = chromeOf 那一支（像素）`, near(s.fill, hexArr(chrome.bg), 8),
      `${s.fill} vs ${hexArr(chrome.bg)}，占这条线 ${Math.round(s.fill_ratio * 100)}%`)
    // 原来这里还钉一条"胶囊和搜索条同色（同一个函数，两块面必须一个值）"。09-30 起两块面各走各的：
    // 搜索条永远在图上、固定纸白，chromeOf 只剩底栏胶囊一个消费者，这条配对判据已经不成立。
    // 上面那条"胶囊填充色 = chromeOf（像素）"仍在钉这个函数，判据没有丢。
    const idleWant = blend(PAPER, chrome.bg, p.themeOf(w).dark ? 0.68 : 0.62)
    const onCol = s.stroke[1]  // 中间那一格是「笔记」= 选中
    ck(`${label}：选中的字/图标采到纸白（笔画众数）`, near(onCol, hexArr(PAPER), 10), `${onCol} vs ${hexArr(PAPER)}`)
    ck(`${label}：未选中那两格采到淡一档（= 纸白 @${p.themeOf(w).dark ? .68 : .62} 混胶囊）`,
      near(s.stroke[0], idleWant, 8) && near(s.stroke[2], idleWant, 8),
      `${s.stroke[0]} / ${s.stroke[2]} vs 期望 ${idleWant}`)
    ck(`${label}：三格都真的有笔画（不是在三块空面上取样）`, s.ink_pixels.every((n) => n > 200),
      s.ink_pixels.join(' / '))
    ck(`${label}：胶囊和页面底不是同一块（不然这块面就消失了）`,
      near(s.fill, s.page, 6) === false, `胶囊 ${s.fill} / 页面底 ${s.page}`)
    ck(`${label}：底栏样式里已经没有写死的 rgba(255,255,255,…)`,
      !/rgba\(255,\s*255,\s*255/.test(BAR_WXSS.replace(/\/\*[\s\S]*?\*\//g, '')))
    // 几何从像素反推：box_rpx = [左, 上, 右, 下]（单位 rpx）。左右 24、下沿离底 20 这两个还量得动。
    // 高度这一档 09-30 起从像素里读不准了：胶囊背后现在是照片（这一屏永远铺图），
    // 浅壁纸下照片那块深色和胶囊那支派生色在 ±6 容差里连成一片，米白那一档量出来是 178。
    // 108 那个数仍然钉着，只是换了地方——验-列表D2.js 第 137 行从 custom-tab-bar 的 WXSS 读。
    const b = s.box_rpx
    ck(`${label}：胶囊左右各内缩 24rpx、下沿离底 20rpx（fixed 不吃父级 padding 那条）`,
      !!b && Math.abs(b[0] - 24) <= 4 && Math.abs(b[2] - 726) <= 4
      && Math.abs((s.image_rpx[1] - b[3]) - 20) <= 8,
      b && `左 ${b[0]} 右 ${b[2]} 离底 ${Math.round(s.image_rpx[1] - b[3])}（高 ${Math.round(b[3] - b[1])} 只作记录）`)
  }

  // ---------- 页头那三个数：分隔符得是"折不掉"的那种空格 ----------
  // 10-01 站长真截图：英文那档三段糊成 "Week: 1|Month: 0|Total: 4"。模拟器里两个半角空格
  // 是照算宽度的（实测双空格串与整串同宽 133.2px、无空格版 117.7px），真机却把它折成一个——
  // 所以这条判据钉不了"屏幕上开不开"，只能钉送进渲染器的那串字用的是 U+00A0：它不参与空白折叠。
  const langBefore = await mp.evaluate(() => getApp().globalData.userInfo?.language || 'zh')
  for (const [lg, sep, name] of [['zh', '　|　', '中文'], ['en', '\u00A0\u00A0|\u00A0\u00A0', '英文']]) {
    await mp.evaluate((l) => {
      const a = getApp()
      a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
    }, lg)
    const sp = await enter('/pages/index/index')
    await sleep(4500)
    const sd = await sp.data()
    const txt = String(sd.statsText || '')
    ck(`${name}那三个数：分隔符是折不掉的那一档（${name === '英文' ? 'U+00A0' : '全角空格'}）`,
      txt.includes(sep), JSON.stringify(txt))
    ck(`${name}那三个数：三段都还在（换分隔符没把谁吃掉）`,
      ['statWeek', 'statMonth', 'statTotal'].every((k) => txt.includes(i18n.t(k, lg))), txt)
    const sm = await mp.evaluate(() => new Promise((res) => {
      wx.createSelectorQuery().select('.page-stats').boundingClientRect()
        .select('.page-title').boundingClientRect().exec((r) => res({ stats: r[0], title: r[1] }))
    }))
    ck(`${name}那三个数：没顶到标题底下去（两块横向不相交）`,
      !!sm.stats && !!sm.title && sm.stats.left >= sm.title.right - 1,
      sm.stats && `数块左沿 ${sm.stats.left.toFixed(1)} / 标题右沿 ${sm.title.right.toFixed(1)}`)
  }
  await mp.evaluate((l) => {
    const a = getApp()
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
  }, langBefore)

  // 还原：这一台模拟器原来用哪枚壁纸，量完还回去
  await mp.evaluate((raw) => {
    const v = raw === '""' ? '' : JSON.parse(raw)
    if (v) wx.setStorageSync('localWallpaper', v)
    else wx.removeStorageSync('localWallpaper')
  }, before)
  await enter('/pages/create/create')
  await sleep(2500)
  const restored = await mp.evaluate(() => JSON.stringify(wx.getStorageSync('localWallpaper') || ''))
  ck('壁纸偏好已还原', restored === before, `${restored} vs ${before}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
