/** 「我的 → 设置」那一栏：小程序侧截图＋逐行取数，供 H5 同屏对照。
 *
 *  为什么单独一把：11-13 口令登录给 H5 的设置栏顶上加了「账号」一行。小程序走微信登录、
 *  没有这一行（也不该有），所以对照的口径是**共有的那四行**逐块相等：行高、名字字号字色、
 *  小字字号字色、右端箭头、分隔线、面板圆角与内缩。新增那一行只许沿用同一套令牌。
 *
 *  单位口径：小程序吃 rpx、H5 吃 px（375 基线，1px = 2rpx）。所以数值对照一律换算成 rpx 再比，
 *  不拿两边 px 直接减——模拟器窗宽若不是 375，直接减就是假红。窗宽现读进 JSON，H5 侧照它设视口，
 *  两张截图才是同尺寸、能并排给肉眼。
 *
 *  跑法：docs/工具/跑尺子.sh 9431 对照-设置栏小程序侧
 *  产出：docs/取证/1113-口令登录/对照/小程序-设置栏.png ＋ .json
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const { t: I18N_T } = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

const OUT = path.resolve(__dirname, '../取证/1113-口令登录/对照')
const APORT = 'ws://localhost:9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  let mp = null
  for (let i = 0; i < 10; i++) {
    try { mp = await automator.connect({ wsEndpoint: APORT }); break } catch (e) { await sleep(2000) }
  }
  if (!mp) { console.log('!! 连不上 9431'); return 2 }
  try {
    await mp.switchTab('/pages/index/index')
    await sleep(1200)
    await mp.switchTab('/pages/me/me')
    await sleep(2500)
    let page = await mp.currentPage()
    let d = await page.data()
    if (d.tab !== 'set') {
      const segs = await page.$$('.seg')
      for (const s of segs) { if (/设置/.test(await s.text())) { await s.tap(); break } }
      await sleep(1200)
      d = await page.data()
    }
    ck('停在设置档', d.tab === 'set', d.tab)

    const sys = await mp.systemInfo()
    const W = sys.windowWidth
    const toRpx = (px) => (px * 750) / W

    const rects = await mp.evaluate(() => new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      q.selectAll('.menu-item').boundingClientRect()
      q.selectAll('.menu-label').boundingClientRect()
      q.selectAll('.menu-hint').boundingClientRect()
      q.selectAll('.ico').boundingClientRect()
      q.selectAll('.ico .cv').boundingClientRect()
      q.select('.menu-group').boundingClientRect()
      q.select('.sheet').boundingClientRect()
      q.exec((r) => resolve(JSON.stringify({
        items: r[0], labels: r[1], hints: r[2], icos: r[3], cvs: r[4], group: r[5], sheet: r[6],
      })))
    }))
    const m = JSON.parse(rects)

    const rows = []
    const items = await page.$$('.menu-item')
    for (let i = 0; i < items.length; i++) {
      const lab = await items[i].$('.menu-label')
      const hint = await items[i].$('.menu-hint')
      const val = await items[i].$('.menu-value')
      const ico = await items[i].$('.ico')
      const cv = await items[i].$('.ico .cv')
      rows.push({
        label: lab ? (await lab.text()).replace(/\s+/g, '') : '',
        hint: hint ? (await hint.text()).replace(/\s+/g, '') : '',
        value: val ? (await val.text()).replace(/\s+/g, '') : '',
        labelFs: lab ? await lab.style('font-size') : '',
        labelColor: lab ? await lab.style('color') : '',
        labelWeight: lab ? await lab.style('font-weight') : '',
        labelLs: lab ? await lab.style('letter-spacing') : '',
        hintFs: hint ? await hint.style('font-size') : '',
        hintColor: hint ? await hint.style('color') : '',
        hintMr: hint ? await hint.style('margin-right') : '',
        valFs: val ? await val.style('font-size') : '',
        valColor: val ? await val.style('color') : '',
        itemBorderBottom: await items[i].style('border-bottom-width'),
        itemBorderBottomColor: await items[i].style('border-bottom-color'),
        hasIco: !!ico,
        cvBorderRight: cv ? await cv.style('border-right-width') : '',
        cvBorderRightColor: cv ? await cv.style('border-right-color') : '',
        rect: m.items[i], labelRect: m.labels[i], hintRect: m.hints[i] || null,
        icoRect: m.icos[i] || null, cvRect: m.cvs[i] || null,
      })
    }
    const g = await page.$('.menu-group')
    const group = {
      paddingLeft: await g.style('padding-left'), paddingTop: await g.style('padding-top'),
      radius: await g.style('border-radius'), borderWidth: await g.style('border-top-width'),
      borderColor: await g.style('border-top-color'), bg: await g.style('background-color'),
      shadow: await g.style('box-shadow'), marginBottom: await g.style('margin-bottom'),
    }

    const want = ['navProfile', 'privatePassword', 'myEmail', 'deleteAccount'].map((k) => I18N_T(k, 'zh'))
    ck('小程序设置栏仍是四行（微信登录，没有「账号」这一行）',
      rows.map((r) => r.label).join('|') === want.join('|'), rows.map((r) => r.label).join('|'))
    ck('四行行高都是 106rpx', rows.every((r) => Math.abs(toRpx(r.rect.height) - 106) <= 1),
      rows.map((r) => toRpx(r.rect.height).toFixed(1)).join(','))
    ck('名字字号都是 28rpx', rows.every((r) => Math.abs(toRpx(parseFloat(r.labelFs)) - 28) <= 0.6),
      rows.map((r) => toRpx(parseFloat(r.labelFs)).toFixed(1)).join(','))
    ck('没有一行名字或小字折行', rows.every((r) => r.labelRect.height <= parseFloat(r.labelFs) * 1.8 &&
      (!r.hintRect || r.hintRect.height <= parseFloat(r.hintFs) * 1.8)),
      rows.map((r) => `${r.labelRect.height}/${r.hintRect ? r.hintRect.height : '-'}`).join(','))
    ck('四行右端都有箭头那一枚', rows.every((r) => r.hasIco))
    ck('注销那一行名字是危险色', /180|164|35|b4231f|a83224/i.test(rows[3].labelColor) || rows[3].labelColor !== rows[0].labelColor,
      rows[3].labelColor)

    await mp.screenshot({ path: path.join(OUT, '小程序-设置栏.png') })
    const dump = {
      side: 'miniprogram', windowWidth: W, windowHeight: sys.windowHeight, pixelRatio: sys.pixelRatio,
      toRpx: 'px*750/windowWidth', rows, group,
      groupRect: m.group, sheetRect: m.sheet,
    }
    fs.writeFileSync(path.join(OUT, '小程序-设置栏.json'), JSON.stringify(dump, null, 2))
    console.log(`窗宽 ${W}×${sys.windowHeight} @${sys.pixelRatio}x；读数与屏照已落 ${OUT}`)
    await mp.switchTab('/pages/index/index')
  } finally {
    try { await mp.close() } catch (e) {}
  }
  console.log(`=== ${bad.length ? bad.length + ' 红' : '0 红'} ===`)
  return bad.length ? 1 : 0
}

main().then((c) => process.exit(c)).catch((e) => { console.error('脚本崩：', e && e.stack || e); process.exit(2) })