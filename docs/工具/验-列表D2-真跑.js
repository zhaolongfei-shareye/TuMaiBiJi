// 笔记列表 D2 这一批的真跑自证：在模拟器里真读计算样式、真截图、真采像素。
// 静态尺子只能证明"CSS 有规则、WXML 有绑定"，证不了这两个加起来在渲染后真是同一个色——
// 统一录入条那两条缺陷就是这么漏掉的（.bar.open 有规则没绑定、占位符吃 opacity），
// 所以这一把全部量视图层算出来的值，不量 data。
// 底栏是组件，automator 的 page.$ 从页面树够不到（实测 .tab-bar / .tab-item 全是 null），
// 那一面改成从截图采像素，采法在 采-底栏像素.py。
// 前置：微信开发者工具已开；改过 WXSS 要先 cli close 再 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-列表D2-真跑.js
const automator = require('miniprogram-automator')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-D2优化/实测')
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
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
const secondaryOf = (w) => {
  const m = new RegExp(`\\.${p.themeOf(w).cls}\\s*\\{([\\s\\S]*?)\\}`).exec(APP_WXSS)
  return /--text-secondary:\s*(#[0-9A-Fa-f]{6})/.exec(m[1])[1]
}
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
  // 这一把量的是 D2 那一版：没有照片、只有壁纸底。09-28 深夜起笔记页头部也开始铺形象图，
  // 两件事不能混在同一把尺子里——先把背景开关按到"不用"，收尾再还原回他原来那一档。
  const bgOffBefore = await mp.evaluate(() => !!wx.getStorageSync('home_bg_off'))
  await mp.evaluate(() => wx.setStorageSync('home_bg_off', true))
  // 这台机型的 rpx→px 比例（1rpx = windowWidth/750），几何断言全按它换算
  const R = (await mp.evaluate(() => wx.getSystemInfoSync().windowWidth)) / 750

  // 两枚代表：浅壁纸走浅档（点留原色、字压白卡按 5），深壁纸走深档（点与字同值、按 7、未分类换空心环）
  for (const w of ['default', 'gradient-purple']) {
    const label = p.themeOf(w).label
    const chrome = p.chromeOf(w)
    await mp.evaluate((key) => wx.setStorageSync('localWallpaper', key), w)
    await enter('/pages/index/index')
    await sleep(4000)
    const page = await enter('/pages/index/index')
    await sleep(4500)
    const d = await page.data()

    // ---------- ① 搜索条：这块面的值必须就是派生出来的那一支 ----------
    const scBg = await styleOf(page, '.sc-card', 'background-color')
    ck(`${label}：搜索条底色 = chromeOf 算出来的那支`, near(rgbOf(scBg), hexArr(chrome.bg)), `${scBg} vs ${chrome.bg}`)
    const scInk = await styleOf(page, '.sc-go', 'color')
    ck(`${label}：搜索条上的字 = 纸白`, near(rgbOf(scInk), hexArr(PAPER), 2), scInk)
    const ph = await styleOf(page, '.sc-input', 'background-color') // 只用来确认读到值；占位符见截图
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
    const cs = cats.length ? await cats[0].size() : null
    ck(`${label}：分类那一段没被压扁（flex:none 生效）`, !!cs && cs.width > 60 * R, cs && `${cs.width}px`)

    // ---------- ③ meta 行那三个字不再灰不溜秋 ----------
    const footColor = await styleOf(page, '.row-foot', 'color')
    const dtColor = await styleOf(page, '.dt', 'color')
    const sec = secondaryOf(w)
    ck(`${label}：日期吃 --text-secondary（不再是 tertiary 那一档）`,
      near(rgbOf(dtColor), hexArr(sec), 2), `${dtColor} vs ${sec}`)
    ck(`${label}：meta 行整行同一个色`, css(footColor) === css(dtColor), `${footColor} / ${dtColor}`)

    // ---------- ④ 底栏（组件够不到，采像素）----------
    // 像素比对留 ±6：截图落盘带一次色彩管理，实测同一支 #2D2D6C 采回来是 (45,45,104)，
    // 差的这四个不在 CSS 里，计算样式那一头读到的是精确值（上面①已经钉过）。
    const png = `${OUT}/实测-${label}.png`
    await mp.screenshot({ path: png })
    const s = sampleBar(png)
    ck(`${label}：胶囊填充色 = chromeOf 那一支（像素）`, near(s.fill, hexArr(chrome.bg), 6),
      `${s.fill} vs ${hexArr(chrome.bg)}，占这条线 ${Math.round(s.fill_ratio * 100)}%`)
    ck(`${label}：胶囊和搜索条同色（同一个函数，两块面必须一个值）`,
      near(s.fill, rgbOf(scBg), 6), `${scBg} / ${s.fill}`)
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
    // 几何从像素反推：box_rpx = [左, 上, 右, 下]（单位 rpx）。左右 24、高 108、下沿离底 20——这四个数是这一版的尺子
    const b = s.box_rpx
    ck(`${label}：胶囊几何 = 左右各 24rpx、高 108rpx、下沿离底 20rpx`,
      !!b && Math.abs(b[0] - 24) <= 4 && Math.abs(b[2] - 726) <= 4
      && Math.abs((b[3] - b[1]) - 108) <= 8 && Math.abs((s.image_rpx[1] - b[3]) - 20) <= 8,
      b && `左 ${b[0]} 右 ${b[2]} 高 ${Math.round(b[3] - b[1])} 离底 ${Math.round(s.image_rpx[1] - b[3])}`)
  }

  // 还原：这一台模拟器原来用哪枚壁纸，量完还回去
  await mp.evaluate((raw) => {
    const v = raw === '""' ? '' : JSON.parse(raw)
    if (v) wx.setStorageSync('localWallpaper', v)
    else wx.removeStorageSync('localWallpaper')
  }, before)
  // 背景开关也还原成进来之前那一档：探针借走的是他的真机偏好，不能留在"不用"
  await mp.evaluate((wasOff) => {
    if (wasOff) wx.setStorageSync('home_bg_off', true)
    else wx.removeStorageSync('home_bg_off')
  }, bgOffBefore)
  await enter('/pages/create/create')
  await sleep(2500)
  const restored = await mp.evaluate(() => JSON.stringify(wx.getStorageSync('localWallpaper') || ''))
  ck('壁纸偏好已还原', restored === before, `${restored} vs ${before}`)

  console.log(`\n${bad.length ? '✗ ' + bad.length + ' 条不过：' + bad.join('、') : '全过'}`)
  mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针挂了', e); process.exit(2) })
