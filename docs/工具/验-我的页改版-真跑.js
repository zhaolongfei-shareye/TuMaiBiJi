/** 「我的」改版这一屏的真跑尺子（v10 口径 + 站长 10-01 那五条）
 *
 *  跑法：先 `cli auto --project .../miniprogram --auto-port 9431`，等约 30 秒，再
 *        NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-我的页改版-真跑.js
 *
 *  作废的旧判据（别再改代码去迁就它们）：
 *   ① 「私密密码那一行右边写着设没设」——这一版行右边只剩一枚箭头，状态不再用文字说；
 *   ② 密码面板的形状这一版又改了一次（站长 10-01 晚：「不在原菜单处理方式，改为前端下方弹出
 *      1/3 窗口」）：v10 那批钉的是"就地展开、内容长在列表里面"，整批作废，
 *      这里改成钉"独立一层铺满视口 + 那一份贴底约 1/3 高 + 菜单行自己不长高"。
 *
 *  evaluate 跑在逻辑层，那里没有 document/window，所以计算样式一律走 element.style()。
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
// 规则块那枚点的颜色只认这一份真相：色值从 palette 读进来比在这里写死一个十六进制强
// （写死了就是"尺子里还有第二份色板"，改了 palette 这一把不会跟着红）。
const { TIP_DOT } = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))

const OUT = path.resolve(__dirname, '../design/我的-改版-实测')
const APORT = 'ws://localhost:9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const toRpx = (px, windowWidth) => (px * 750) / windowWidth

const measure = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const q = wx.createSelectorQuery()
  q.select('.head-band').boundingClientRect()
  q.select('.sheet').boundingClientRect()
  q.select('.sheet-logo').boundingClientRect()
  q.select('.sheet-text').boundingClientRect()
  q.select('.score').boundingClientRect()
  q.select('.score-n').boundingClientRect()
  q.select('.score-l').boundingClientRect()
  q.select('.pill').boundingClientRect()
  q.selectAll('.seg').boundingClientRect()
  q.selectAll('.menu-item').boundingClientRect()
  q.selectAll('.ico').boundingClientRect()
  q.selectAll('.pwd-cell').boundingClientRect()
  q.selectAll('.pwd-btn').boundingClientRect()
  q.select('.pwd-card').boundingClientRect()
  q.select('.menu-group').boundingClientRect()
  q.select('.about-lead').boundingClientRect()
  q.select('.h1').boundingClientRect()
  q.select('.pwd-scene').boundingClientRect()
  q.select('.pwd-name').boundingClientRect()
  q.select('.pwd-mask').boundingClientRect()
  q.selectAll('.rule').boundingClientRect()
  q.selectAll('.rdot').boundingClientRect()
  // 10-04 加：撤掉那一行的框之后，"LOGO 与下方卡里的行名同一条左线"要拿真东西比，
  // 不能拿两个内缩值手算（手算等于在尺子里再抄一份布局）。放在最后一位，前面的下标一个不动。
  q.select('.menu-label').boundingClientRect()
  q.exec((res) => resolve({
    band: res[0], sheet: res[1], logo: res[2], text: res[3],
    score: res[4], num: res[5], lab: res[6], pill: res[7],
    segs: res[8] || [], items: res[9] || [], icos: res[10] || [],
    cells: res[11] || [], btns: res[12] || [], pwdCard: res[13],
    group: res[14], aboutLead: res[15], h1: res[16],
    scene: res[17], pwdName: res[18], mask: res[19], rules: res[20] || [],
    rdots: res[21] || [], label: res[22],
    windowWidth: wx.getWindowInfo().windowWidth,
    windowHeight: wx.getWindowInfo().windowHeight,
  }))
}))

const styleOf = async (page, sel, props) => {
  const el = await page.$(sel)
  if (!el) return {}
  const out = {}
  for (const k of props) out[k] = await el.style(k)
  return out
}

// 昵称/口号走的是 poster.readProfile()，所以往 storage 写真值再重进本页才是真链路。
// 但这一页默认态那几条判据吃的是"没填过"，所以进页前先把这两个字段清掉、
// 收尾再原样还回去——上一轮跑到一半崩了留下 '阿麦'，下一轮就会把默认态判成不过。
const readProfileRaw = (mp) => mp.evaluate(() => JSON.stringify(wx.getStorageSync('poster_profile') || {}))
const seedProfile = (mp, patch) => mp.evaluate((p) => {
  wx.setStorageSync('poster_profile', Object.assign({}, wx.getStorageSync('poster_profile') || {}, p))
  return JSON.stringify(wx.getStorageSync('poster_profile'))
}, patch)
const putProfile = (mp, json) => mp.evaluate((j) => {
  wx.setStorageSync('poster_profile', JSON.parse(j))
  return true
}, json)

const gotoMe = async (mp) => {
  for (let i = 0; i < 5; i++) {
    try {
      await mp.switchTab('/pages/me/me')
      await sleep(3000)
      return await mp.currentPage()
    } catch (e) { await sleep(2500) }
  }
  throw new Error('进不了 /pages/me/me')
}

// 这一页的文字全跟着 `app.globalData.userInfo.language` 走，而这个字段是登录时从服务端
// 带回来的。上一把尺子（验-热启动归因.js）真登录过一次，那个测试号在服务端存的是 'en'，
// 于是这一整批中文判据会凭空红三条——和下面那条 tab 状态一样是顺序依赖的假红，不是代码坏了。
// 所以开跑前把语言钉成 zh，收尾原样还回去。
const readLang = (mp) => mp.evaluate(() => getApp().globalData.userInfo?.language || 'zh')
const pinLang = (mp, lang) => mp.evaluate((l) => {
  const app = getApp()
  app.globalData.userInfo = Object.assign({}, app.globalData.userInfo, { language: l })
  return app.globalData.userInfo.language
}, lang)

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6; i++) {
    try { mp = await automator.connect({ wsEndpoint: APORT }); break }
    catch (e) { await sleep(2000) }
  }
  if (!mp) { console.log('✗ 连不上 9431，先跑 cli auto'); process.exit(1) }

  const originalLang = await readLang(mp)
  await pinLang(mp, 'zh')
  let page = await gotoMe(mp)
  const originalProfile = await readProfileRaw(mp)
  await seedProfile(mp, { name: '', slogan: '' })
  // tab / 展开态是**页面实例**上的，switchTab 出去再回来不会把它们复位（上一轮跑完
  // 停在「关于」，这一轮就红在"默认停在设置"上——那是顺序依赖的假红，不是代码坏了）。
  // 所以每次开跑先把这一页按回出厂那一态。
  await page.setData({ tab: 'set', pwdOpen: false, pwdEntering: false, pwdBuf: '', pwdFirst: '', pwdStep: 1 })
  await mp.switchTab('/pages/index/index')
  await sleep(1200)
  page = await gotoMe(mp)

  /* ---------- ① 头部：底图 + 那一层负责接缝弧的 LOGO 行 ----------
     站长 10-04 两轮话要一起成立：① 那张"留白卡"不再是卡（拿他原图量过：上框贴屏边 x58..846、
     下框左右各收 24rpx x82..823，两块边只差 5 个像素 → 互相粘连）；② 接缝那道弧的方向不许翻
     （我第一版把弧挪到底图下沿，左右两角弯法反了，被他当场打回）。
     所以钉的是：这一层仍往上盖住底图 40、仍只有上沿两角收圆，但它的底色必须**就是页面底本身**
     ——同一个色就不存在第二个框，弧的方向也不用动。 */
  let m = await measure(mp)
  const W = m.windowWidth
  ck('底图这块盒子高 542（可见 502 + 被那一层盖住 40）',
    Math.abs(toRpx(m.band.height, W) - 542) <= 3, toRpx(m.band.height, W).toFixed(1))
  ck('底图左右贴屏边（不内缩）', m.band.left <= 1 && Math.abs(m.band.right - W) <= 1, `${m.band.left}/${m.band.right}`)
  const bandStyle = await styleOf(page, '.head-band', ['border-top-left-radius', 'border-bottom-left-radius', 'background-color'])
  ck('弧不在底图上（下沿两角不收圆，方向仍是下面那层往上凸）',
    parseFloat(bandStyle['border-bottom-left-radius'] || '99') === 0
      && parseFloat(bandStyle['border-top-left-radius'] || '99') === 0,
    `上 ${bandStyle['border-top-left-radius']} / 下 ${bandStyle['border-bottom-left-radius']}`)
  const overlap = m.band.bottom - m.sheet.top
  ck('那一层往上盖住底图 40 → 接缝左右两角是弧（方向与 10-01 那版一致）',
    Math.abs(toRpx(overlap, W) - 40) <= 3, toRpx(overlap, W).toFixed(1))
  const sheetStyle = await styleOf(page, '.sheet', ['border-top-left-radius', 'border-bottom-left-radius', 'background-color'])
  ck('那一层只有上沿两角收圆 40、下沿直角（不是一枚四角卡）',
    Math.abs(toRpx(parseFloat(sheetStyle['border-top-left-radius']), W) - 40) <= 2
      && parseFloat(sheetStyle['border-bottom-left-radius'] || '99') === 0,
    `上 ${sheetStyle['border-top-left-radius']} / 下 ${sheetStyle['border-bottom-left-radius']}`)
  ck('那一层的底色就是页面底本身（与 .head-band 同值 → 不是第二层卡色，读起来是一整片）',
    !!sheetStyle['background-color'] && sheetStyle['background-color'] === bandStyle['background-color'],
    `sheet ${sheetStyle['background-color']} / band ${bandStyle['background-color']}`)
  ck('LOGO 与下方卡里的行名同一条左线（撤框之后不能各走各的）',
    !!m.label && Math.abs(m.logo.left - m.label.left) <= 2, `${m.logo && m.logo.left} vs ${m.label && m.label.left}`)

  /* 站长 10-04 真机：这一页导航条底下多出一条白线，别的页没有。
     拿他那张原图量过：白线 3px ÷ 1.488 = 正好 2rpx，就是 app.wxss 那条
     `.container { padding: 2rpx var(--sp-3) 0 }` 里顶部那一档露出的页面底——
     首页没这条，因为它整条覆盖成了 `padding: 0`，而这一页以前只覆盖了 bottom。
     钉两层：容器顶内缩为 0，且底图盒子的顶边真的贴在视口上（留一条缝就又画出来）。
     反向对照跑过：把 `padding-top: 0` 换成 `2rpx` 再跑这一把，只有这两条红
     （实读 `1px` 与 band 顶 `1.92rpx`），其余 81 条照绿。 */
  const contStyle = await styleOf(page, '.container', ['padding-top'])
  ck('容器顶内缩收到 0（那 2rpx 会在深色导航条底下露成一条白线）',
    parseFloat(contStyle['padding-top'] || '99') === 0, String(contStyle['padding-top']))
  ck('底图顶边贴在视口上，不留缝', Math.abs(toRpx(m.band.top, W)) <= 1, toRpx(m.band.top, W).toFixed(2))

  /* ---------- ② 圆 LOGO 80、整枚在留白区里、与右边两行字等高 ---------- */
  ck('圆 LOGO 是 80 见方', Math.abs(toRpx(m.logo.width, W) - 80) <= 2 && Math.abs(toRpx(m.logo.height, W) - 80) <= 2,
    `${toRpx(m.logo.width, W).toFixed(0)}×${toRpx(m.logo.height, W).toFixed(0)}`)
  ck('LOGO 整枚在图下方那一行里（不再压着底图）', m.logo.top >= m.sheet.top - 1, `${m.logo.top} vs ${m.sheet.top}`)
  ck('LOGO 高度 = 右边两行字的高度（±4）', Math.abs(toRpx(m.logo.height, W) - toRpx(m.text.height, W)) <= 4,
    toRpx(m.text.height, W).toFixed(0))

  /* ---------- ②b 左上角那行大字（站长 10-01：三个 tab 的首页风格要一致） ---------- */
  ck('头部左上角有这行大字', !!m.h1 && m.h1.width > 0, JSON.stringify(m.h1))
  /* 站长 10-04：这一行不再写死「我的」，改成跟着下面那枚药丸走——停在设置就写设置、
     翻到关于就写关于。旧判据「内容就是本页的 tab 名」作废。
     期望值一律从页面自己那份字典现读：写死中文串，账号一切英文就假红（10-03 那条）。 */
  const h1Tx = ((await (await page.$('.h1')).text()) || '').trim()
  const dict0 = await page.data('t')
  const tab0 = await page.data('tab')
  const segTx0 = []
  for (const e of await page.$$('.seg')) segTx0.push(((await e.text()) || '').trim())
  ck('这行大字就是当下这一档的名字（与药丸选中那一枚逐字相同）',
    !!h1Tx && h1Tx === (tab0 === 'about' ? dict0.pillAbout : dict0.pillSettings)
      && segTx0[tab0 === 'about' ? 1 : 0] === h1Tx,
    `${h1Tx} / tab=${tab0} / 药丸 ${segTx0.join('|')}`)
  ck('这行不再写死成本页的 tab 名「我的」', !!h1Tx && h1Tx !== dict0.tabMe,
    `${h1Tx} ≠ ${dict0 && dict0.tabMe}`)
  const h1Style = await styleOf(page, '.h1', ['font-size', 'font-weight', 'letter-spacing', 'color'])
  ck('位子与首页那一行同档：左 32、上 22',
    Math.abs(toRpx(m.h1.left, W) - 32) <= 2 && Math.abs(toRpx(m.h1.top, W) - 22) <= 2,
    `${toRpx(m.h1.left, W).toFixed(0)}/${toRpx(m.h1.top, W).toFixed(0)}`)
  // 字距那条不写死 -1：`-1rpx` 在 375 宽的视口里是 -0.5px，微信把它报成 -1px，
  // 拿换算值去比必然红。"两页这一行一模一样"由静态尺子逐字钉（验-列表头部铺图.js），
  // 这里只量运行时确实是"负的一档小字距"。
  const lsRpx = toRpx(parseFloat(h1Style['letter-spacing']), W)
  ck('字号 42（--fs-h1）、字重 700、字距是负的一档',
    Math.abs(toRpx(parseFloat(h1Style['font-size']), W) - 42) <= 2
    && parseFloat(h1Style['font-weight']) === 700 && lsRpx < 0 && lsRpx >= -2.5,
    `${h1Style['font-size']}/${h1Style['font-weight']}/${h1Style['letter-spacing']}`)
  ck('铺了图这行翻成纸白（与首页 .has-bg .h1 同一档）',
    /rgba\(242,\s*239,\s*233,\s*0?\.96/.test(h1Style.color || ''), h1Style.color)
  // 右上角那一枚现在住的是 MIND 数字（药丸搬进 LOGO 那一行了）。先钉它在不在：
  // 数字整块是 wx:if="{{scoreText}}"，接口没通时节点根本没有，后面几条会 TypeError
  // 把整把尺子带崩——上一条踩过一次"正则回 null 把整把尺子打死"，这里先挡住。
  ck('右上角那枚数字在（积分从服务端读回来了）', !!m.score, JSON.stringify(m.score))
  ck('这行没盖住右上角那枚数字', !!m.score && m.h1.right <= m.score.left + 1, `${m.h1.right} vs ${m.score && m.score.left}`)

  /* ---------- ③ MIND 那个大数字：Poppins Thin、和笔记页那三列同一个锚点 ---------- */
  const numStyle = await styleOf(page, '.score-n', ['font-family', 'font-size', 'font-weight', 'color'])
  const labStyle = await styleOf(page, '.score-l', ['font-size', 'text-align', 'letter-spacing'])
  ck('数字用内嵌的 WtsjMind（Poppins Thin 子集）', /WtsjMind/.test(numStyle['font-family'] || ''), numStyle['font-family'])
  // 100 → 64：站长 10-01 晚要把这两个 tab 的右上角对齐成同一档量，笔记页那三列也是 64。
  ck('数字字号 64（与笔记页那三列同一个量）', Math.abs(toRpx(parseFloat(numStyle['font-size']), W) - 64) <= 2, numStyle['font-size'])
  ck('数字是 100 号字重（Thin）', parseFloat(numStyle['font-weight']) <= 100, numStyle['font-weight'])
  ck('数字保持半透明', /rgba\(242,\s*239,\s*233,\s*0?\.7/.test(numStyle.color || ''), numStyle.color)
  ck('英文字收到最小一档字阶 18', Math.abs(toRpx(parseFloat(labStyle['font-size']), W) - 18) <= 1, labStyle['font-size'])
  ck('英文字改成居中对齐', labStyle['text-align'] === 'center', labStyle['text-align'])
  const cNum = m.num.left + m.num.width / 2
  const cLab = m.lab.left + m.lab.width / 2
  ck('英文字真的对到数字中间（±3rpx）', Math.abs(toRpx(cLab - cNum, W)) <= 3, `Δ${toRpx(cLab - cNum, W).toFixed(1)}`)
  // 原来钉的是"在底图右下角以内、不被留白卡盖住"（bottom 56 那一版）。10-01 晚整块搬到右上角，
  // 旧判据作废——现在要守的是锚点本身：离屏右 32、离图区顶 24，和笔记页那三列逐字同一个数。
  ck('数字整块钉在右上角：离屏右 32、离图区顶 24',
    !!m.score && Math.abs(toRpx(m.band.right - m.score.right, W) - 32) <= 2
    && Math.abs(toRpx(m.score.top - m.band.top, W) - 24) <= 2,
    m.score && `右 ${toRpx(m.band.right - m.score.right, W).toFixed(1)} 顶 ${toRpx(m.score.top - m.band.top, W).toFixed(1)}`)
  ck('数字整块在图区以内，不落进下面那一行', !!m.score && m.score.top >= m.band.top && m.score.bottom <= m.band.bottom,
    m.score && `${m.score.top}~${m.score.bottom} in ${m.band.top}~${m.band.bottom}`)

  /* ---------- ④ 药丸：默认设置，切关于 ---------- */
  let d = await page.data()
  ck('药丸两枚：设置 / 关于', m.segs.length === 2, m.segs.length)
  // 原来钉"药丸钉在底图右上（在 band 里）"。10-01 晚站长要它搬到 LOGO 那一行的最右，
  // 因为它和左上角那行「我的」抢同一条视线——旧判据作废，跟着换成下面这四条。
  ck('药丸在 LOGO 那一行里（不再浮在照片上）', m.pill.top >= m.sheet.top - 1 && m.pill.bottom <= m.sheet.bottom + 1,
    `${m.pill.top}~${m.pill.bottom} in ${m.sheet.top}~${m.sheet.bottom}`)
  /* 原来钉"离屏边 32"——那是留白卡贴屏边、自己吃 32 内缩的那一档。10-04 这一行搬回
     .container 的 24 内缩里，右沿就跟着变成 24+32；这里不再抄这两个数之和（那等于把
     两个令牌值手算一遍），改成钉**左右对称**：药丸右沿离屏边 == LOGO 左沿离屏边。 */
  ck('药丸钉在这一行最右（与 LOGO 左沿离屏边同一档，左右对称）',
    Math.abs(toRpx(W - m.pill.right, W) - toRpx(m.logo.left, W)) <= 2,
    `右离 ${toRpx(W - m.pill.right, W).toFixed(1)} / 左离 ${toRpx(m.logo.left, W).toFixed(1)}`)
  ck('药丸与 LOGO 垂直居中对齐（align-items:center 真生效）',
    Math.abs(toRpx((m.logo.top + m.logo.height / 2) - (m.pill.top + m.pill.height / 2), W)) <= 2,
    `圆心差 ${toRpx((m.logo.top + m.logo.height / 2) - (m.pill.top + m.pill.height / 2), W).toFixed(1)}rpx`)
  ck('两行字没顶到药丸（.sheet-text 是 flex:1 + min-width:0，药丸才钉得住）',
    m.text.right <= m.pill.left + 1, `${m.text.right} vs ${m.pill.left}`)
  ck('默认停在「设置」', d.tab === 'set', d.tab)
  ck('没设过昵称时第一行是问候语', d.nameText === '你好！我是图麦笔记', d.nameText)
  // Slogan 这句从 utils/i18n.js 现读，不抄第二份：10-01 那句换成「把图文，提炼成有用的干货」时，
  // 抄死的判据红了而界面是对的——判据吃的是字典，界面吃的也是字典，那就只该有一份。
  const i18nSrc = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'), 'utf8')
  const zhSlogan = /slogan: '([^']+)'/.exec(i18nSrc)
  // 规则块那三句、以及「推荐图麦」这个新名字，都从字典现读——写第二份进尺子，改了字典就假红。
  const zhRule = (k) => (new RegExp(`\\n\\s+${k}: '([^']+)'`).exec(i18nSrc) || [])[1]
  ck('第二行是应用 Slogan（值现读 i18n.js 的 zh 段）', !!zhSlogan && d.sloganText === zhSlogan[1],
    `${d.sloganText} ← ${zhSlogan && zhSlogan[1]}`)
  ck('圆里是应用 LOGO（没设卡片头像时）', d.logoSrc === '/assets/logo.png', d.logoSrc)
  // 槽里那张在模拟器里落地成 `http://usr/…`（就是 USER_DATA_PATH 那批文件），
  // 所以这一条不能只认包里那张的名字——它要钉的是"图从那个出口来、不是第二处"。
  ck('底图取的是首页那一个出口（包里那张或本机形象文件，两样都算）',
    /home-bg-portrait|USER_DATA_PATH|http:\/\/usr\//.test(d.bgSrc || ''), d.bgSrc)
  // 原来这条把 1448/-136 写死了，那是"默认那张竖构图"的数；本机形象一换就红，
  // 红得没道理。改成钉那条规则本身：按宽铺满、超出那截的 15% 顶到上面去。
  const gHeight = parseFloat((/height:(\d+(?:\.\d+)?)rpx/.exec(d.imgStyle || ''))[1] || 0)
  const gTop = parseFloat((/top:(-?\d+(?:\.\d+)?)rpx/.exec(d.imgStyle || ''))[1] || 0)
  ck('锚点算出来了：按宽铺满、超出那截的 15% 顶给上面（不写死某一张的数）',
    /width:750rpx/.test(d.imgStyle || '') && gHeight > 542 && Math.abs(gTop + (gHeight - 542) * 0.15) <= 1,
    d.imgStyle)
  ck('数字来自服务端（base+bonus，不是界面写死）', /^\d+$/.test(String(d.scoreText || '')) && Number(d.scoreText) >= 100, d.scoreText)
  // 站长 10-02：那一行右边的「新写作者 +10」撤了（同一个数下面那块规则说一遍就够）。
  // 旧判据"右值吃 reward_each、单位不再写篇"整条作废；这里只断页面里连这一格字段都不留了，
  // "+10 整页只出现一次"钉在下面关于那一屏——那里才读得到真正渲染出来的行。
  ck('分享那一行不再算右值（页面里没有 shareValue 这一格了）',
    d.shareValue === undefined, String(d.shareValue))

  /* ---------- ④b 分享载荷：封面换成新图之后，路径写错微信会静默退回"截当前页"，
     那种事在界面上看不出来，只能把 onShareAppMessage 真调一次、再让包去解这张图。 ---------- */
  const payload = await page.callMethod('onShareAppMessage')
  ck('转发标题是新那句「把图文提炼成有用的干货」',
    payload && payload.title === '图麦笔记 | 把图文提炼成有用的干货', payload && payload.title)
  ck('封面指向 assets/share-card.jpg（旧的 .png 已删）',
    payload && payload.imageUrl === '/assets/share-card.jpg', payload && payload.imageUrl)
  const img = await mp.evaluate(() => new Promise((resolve) => {
    wx.getImageInfo({
      src: '/assets/share-card.jpg',
      success: (r) => resolve({ ok: true, w: r.width, h: r.height }),
      fail: (e) => resolve({ ok: false, why: (e && e.errMsg) || 'fail' }),
    })
  }))
  ck('这张图真在包里、尺寸 1280×1024（5:4）', img.ok && img.w === 1280 && img.h === 1024, JSON.stringify(img))

  /* ---------- ⑤ 设置那五条：右端一枚裸箭头 + 从底部弹上来的那一层 ---------- */
  /* 名字要从 `.menu-label` 读，不能整行 `text()`：10-05 那批文案给前四行各加了一枚
     `.menu-hint`，整行文本变成"卡片模板分享给朋友那张卡片上印什么"，这条判据就从
     钉名字变成了钉"这一行永远只有名字"——而它红的那一晚改的是字色，一行没动。 */
  const labels = []
  for (const r of await page.$$('.menu-label')) labels.push((await r.text()).replace(/\s+/g, ''))
  ck('设置态是五条：卡片模板/外观设置/分类管理/私密密码/注销账号',
    labels.join('|') === '卡片模板|外观设置|分类管理|私密密码|注销账号', labels.join('|'))
  /* 四行的小字说明常驻（他 10-05 打回过"切换开关就看不到注释"），钉数量也钉内容——
     内容与字典比、不与硬写的中文比，换语言时这条不该红。注销账号那行没给说明，是他还没拍。 */
  const hints = []
  for (const r of await page.$$('.menu-hint')) hints.push((await r.text()).replace(/\s+/g, ''))
  const dict = (await page.data()).t || {}
  const wantHints = [dict.navProfileTip, dict.wallpaperTip, dict.categoriesTip, dict.privatePasswordTip]
    .map((x) => String(x || '').replace(/\s+/g, ''))
  ck('前四行各有一行右侧小字，且就是字典里那四句（不是硬写的中文）',
    hints.length === 4 && hints.every((x, i) => x === wantHints[i]), hints.join('|'))
  ck('行高 106（不再是 118 那种大块头）', Math.abs(toRpx(m.items[0].height, W) - 106) <= 2, toRpx(m.items[0].height, W).toFixed(0))
  ck('每行右边一枚 46 见方的箭头位（盒子没跟着圆底一起撤，行右端那条竖线要照它对齐）',
    m.icos.length === 5 && Math.abs(toRpx(m.icos[0].width, W) - 46) <= 2
      && Math.abs(m.icos[0].width - m.icos[0].height) <= 1,
    `${m.icos.length}/${toRpx(m.icos[0].width, W).toFixed(0)}`)
  /* 站长 10-04：「右侧的圆点+箭头太突兀，只留箭头符号即可」。
     钉两件事：圆底那块面没了；那一笔箭头不再是圆底上抠出来的纸白。
     箭头色只钉 alpha 不钉色相——--text-tertiary 四套各一份（象牙 53,46,29 / 天青 29,53,34 /
     樱落 53,29,41 / 雨雾 33,36,49），钉死 RGB 就等于把这把尺子钉在象牙那一套上。
     alpha 这一档 10-05 从 .55 抬到 .72（站长真机："部分数字颜色太浅，很难看清"）；
     这里跟着改判据，不改代码去迁就旧尺子。 */
  /* 属性名要用四角那一条，不能用简写：`border-radius` 在这个 style 接口上回 null
     （实测就是这一把第一次红的地方），null 参与 parseFloat 会变 NaN，判据永远红。 */
  const icoStyle = await styleOf(page, '.ico', ['background-color', 'border-top-left-radius'])
  ck('圆底撤了（无底色、无圆角）',
    /rgba\(0, 0, 0, 0\)|transparent/.test(icoStyle['background-color'] || '')
      && parseFloat(icoStyle['border-top-left-radius'] || '99') === 0,
    `${icoStyle['background-color']} / ${icoStyle['border-top-left-radius']}`)
  const cvColor = (await styleOf(page, '.ico .cv', ['border-right-color']))['border-right-color'] || ''
  ck('那一笔箭头吃三级字那一档（alpha .72，不再是圆底上抠出来的纸白）',
    /0\.72\)/.test(cvColor) && !/242, 239, 233/.test(cvColor), cvColor)
  /* 这一条必须拿**整行**文本判，不能退到 `.menu-label`：它钉的是"那一行里再没有别的状态字"
     （旧口径右侧写"未设置/密码已设置"），只看名字那个节点就永远为真、等于没判。 */
  const rowTexts = []
  for (const r of await page.$$('.menu-item')) rowTexts.push((await r.text()).replace(/\s+/g, ''))
  ck('行里不再有"未设置"这类状态文字（除名字与那行常驻小字，右端不挂第三种字）',
    !rowTexts.some((x) => /未设置|密码已设置/.test(x)), rowTexts.join('|'))

  const iPwd = labels.findIndex((x) => x.indexOf('私密密码') === 0)
  await (await (await page.$$('.menu-item'))[iPwd]).tap()
  await sleep(1200)
  d = await page.data()
  m = await measure(mp)
  ck('点那一行弹出遮罩那一层', d.pwdOpen === true, `open=${d.pwdOpen} set=${d.privateSet}`)
  // 站长 10-01 深夜第二次改口径：撤掉「底部 1/3 弹层」，照「分类管理」那一页改成整屏遮罩 + 居中卡。
  // 旧判据（.pwd-layer 铺满 + .pwd-sheet 约 1/3 高 + 贴屏幕底边 + "这一版没有遮罩那一层"）四把全部作废。
  ck('遮罩铺满整屏（与分类管理同口径），不再是一张贴底的板',
    !!m.mask && Math.abs(m.mask.height - m.windowHeight) <= 1 && Math.abs(m.mask.width - m.windowWidth) <= 1,
    m.mask ? `${m.mask.width}×${m.mask.height} 窗 ${m.windowWidth}×${m.windowHeight}` : '没有 .pwd-mask')
  // 这一条才是"不在原菜单处理方式"的正解：打开之后，菜单那一行本身不许长高。
  ck('打开时菜单行没被顶高（内容不就地展开）',
    m.items.length === 5 && Math.abs(toRpx(m.items[iPwd].height, W) - 106) <= 2,
    m.items[iPwd] ? toRpx(m.items[iPwd].height, W).toFixed(0) : '读不到那一行')
  const cardCx = m.pwdCard && m.pwdCard.left + m.pwdCard.width / 2
  // 「与分类管理相同」这句怎么钉？钉一个渲染出来的绝对宽数会假红：那张卡声明的是
  // `width:620rpx` 而 `.card` 的左右内边距是内容之外（box-sizing 没设 border-box），
  // 所以外沿读出来是 684.6 而不是 620。钉两条更实在的：声明逐字与那张对话框一致（静态），
  // 外沿 = 声明宽 + 左右各一档 --sp-4（运行时，容 ±8 吸收描边与取整）。
  const cssOf = (rel, sel) => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../miniprogram', rel), 'utf8')
    return ((src.match(new RegExp(`\\n\\.${sel}\\s*\\{([\\s\\S]*?)\\n\\}`)) || [])[1] || '')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
  }
  const SP4 = Number(/--sp-4:\s*(\d+)rpx/.exec(fs.readFileSync(
    path.resolve(__dirname, '../../miniprogram/app.wxss'), 'utf8'))[1])
  const mine = cssOf('pages/me/me.wxss', 'pwd-card')
  const theirs = cssOf('pages/categories/categories.wxss', 'dialog-card')
  ck('这张卡的宽与内边距逐字抄分类管理那张对话框（不留第二份尺寸）',
    !!mine && !!theirs && mine.replace(/box-shadow:[^;]+;/, '') === theirs.replace(/box-shadow:[^;]+;/, ''),
    `${mine.slice(0, 52)} ↔ ${theirs.slice(0, 52)}`)
  ck(`卡外沿 = 620 + 左右各一档 --sp-4（${620 + 2 * SP4}rpx）`,
    !!m.pwdCard && Math.abs(toRpx(m.pwdCard.width, W) - (620 + 2 * SP4)) <= 8,
    m.pwdCard && toRpx(m.pwdCard.width, W).toFixed(1))
  ck('卡不再居中，坐到上面去：水平居中 + 离顶 180rpx（站长 10-02：键盘盖住两枚按钮，窗口上移）',
    !!m.pwdCard && Math.abs(cardCx - m.windowWidth / 2) <= 2 &&
    Math.abs(toRpx(m.pwdCard.top - m.mask.top, W) - 180) <= 6,
    m.pwdCard && `圆心x ${(cardCx || 0).toFixed(1)} 离顶 ${toRpx(m.pwdCard.top - m.mask.top, W).toFixed(0)}rpx`)
  // 键盘那一截在模拟器里量不到（模拟器不起键盘），所以钉它的物理高度下界：
  // iOS 的数字键盘连安全区约 250pt。键盘是按 pt 长的、不是按 rpx，所以这一条两边都用 px 比。
  ck('卡底下空出来那一截高过系统数字键盘（250pt 那一档），按钮不会再被盖住',
    !!m.pwdCard && m.windowHeight - m.pwdCard.bottom >= 250,
    m.pwdCard && `空档 ${(m.windowHeight - m.pwdCard.bottom).toFixed(0)}px（= ${toRpx(m.windowHeight - m.pwdCard.bottom, W).toFixed(0)}rpx）`)
  ck('卡整块在屏以内', !!m.pwdCard && m.pwdCard.top >= 0 && m.pwdCard.bottom <= m.windowHeight + 1,
    m.pwdCard && `${m.pwdCard.top}~${m.pwdCard.bottom} / ${m.windowHeight}`)
  ck('使用场景这句写在卡里面（不是只有弹窗标题）',
    !!m.scene && !!m.pwdCard && m.scene.top > m.pwdCard.top && m.scene.bottom < m.pwdCard.bottom,
    m.scene && `${m.scene.top}~${m.scene.bottom}`)
  const nameEl = await page.$('.pwd-name')
  const nameTx = nameEl ? (await nameEl.text()).trim() : ''
  ck('从上到下第一样是功能名称（且排在卡里最上）',
    /私密密码/.test(nameTx) && !!m.pwdName && !!m.pwdCard && m.pwdName.top < m.pwdCard.top + 90,
    `${nameTx} top=${m.pwdName && m.pwdName.top}`)
  ck('功能名称就一行，不和右边按钮撞成同一句', nameTx !== '重置密码', nameTx)
  // 这个测试号设没设过密码是会变的（上一把尺子把密码撤了就变 false），
  // 所以这里不钉"哪一态"，只钉两态互斥这条规则（同一件事在 `验-私密密码与分类色-真跑` 里两态各测一遍）。
  ck('格子只跟着那一态走：设置态六格、重置态零格',
    m.cells.length === (d.pwdEntering ? 6 : 0), `cells=${m.cells.length} entering=${d.pwdEntering}`)
  // 站长 10-01 深夜：「6 个框太大，不精致，可以稍微聚集中间」。旧判据"铺满内宽"作废，
  // 换成钉这一条：一整排比卡的内宽窄（收在中间），且整排以卡的中线对称。
  // 卡读不到就不进这一段：下面三把都要用 m.pwdCard 和 cardCx，少一个判据会把整把尺子崩掉
  // （cardCx 是 `m.pwdCard && …`，null 参与减法会被当成 0，量出来的数是假的）。
  if (m.cells.length === 6 && m.pwdCard) {
    const rowL = m.cells[0].left, rowR = m.cells[5].left + m.cells[5].width
    const rowW = toRpx(rowR - rowL, W)
    const inner = toRpx(m.pwdCard.width, W) - 2 * SP4   // 内宽 = 外沿 − 左右各一档 --sp-4
    ck('六格收小了：一整排比卡的内宽窄', rowW < inner, `${rowW.toFixed(0)} < ${inner.toFixed(0)}`)
    ck('一整排在卡里居中（不是靠左堆着）',
      Math.abs((rowL + rowR) / 2 - cardCx) <= 3,
      `Δ${toRpx((rowL + rowR) / 2 - cardCx, W).toFixed(1)}rpx`)
    ck('单格 78×96（比原来那一档收小）',
      Math.abs(toRpx(m.cells[0].width, W) - 78) <= 2 && Math.abs(toRpx(m.cells[0].height, W) - 96) <= 2,
      `${toRpx(m.cells[0].width, W).toFixed(0)}×${toRpx(m.cells[0].height, W).toFixed(0)}`)
  }
  const btnTexts = []
  for (const b of await page.$$('.pwd-btn')) btnTexts.push(await b.text())
  ck('一行两枚：左是取消，右按那一态分别是确定 / 重置密码',
    btnTexts.join('|') === (d.pwdEntering ? '取消|确定' : '取消|重置密码'), btnTexts.join('|'))
  // 原来钉"高 96"，那是底部弹层那一版自己定的大块头；这一版两枚抄 categories 的
  // .dialog-btn（padding 一档、不写死高），所以钉的是"同一行、各占一半、右边那枚
  // 离卡内边沿正好一档内边距"。注意单位：坐标是 px，卡内边距是 rpx，必须换算后再比。
  ck('两枚坐在同一行、各占约一半内宽（照分类管理那两个按钮）',
    !!m.pwdCard && m.btns.length === 2 && Math.abs(m.btns[0].top - m.btns[1].top) <= 1 &&
    Math.abs(m.btns[0].width - m.btns[1].width) <= 1 &&
    Math.abs(toRpx(m.pwdCard.right - m.btns[1].right, W) - SP4) <= 4 &&
    Math.abs(toRpx(m.btns[0].left - m.pwdCard.left, W) - SP4) <= 4,
    m.btns.length === 2 && m.pwdCard
      ? `两枚 ${toRpx(m.btns[0].width, W).toFixed(0)}/${toRpx(m.btns[1].width, W).toFixed(0)}rpx　左内缩 ${toRpx(m.btns[0].left - m.pwdCard.left, W).toFixed(0)} 右内缩 ${toRpx(m.pwdCard.right - m.btns[1].right, W).toFixed(0)}`
      : '读不到两枚')
  const cvStyle = await styleOf(page, '.menu-item.open .ico .cv', ['transform'])
  // rotate(45deg) 在计算样式里回的是 matrix(.707,.707,-.707,.707)，不是字面 45
  const down = /matrix\(\s*0?\.707[^,]*,\s*0?\.707/.test(cvStyle.transform || '')
  ck('那一行的箭头转成朝下（rotate 45°，b 分量为正）', down, cvStyle.transform)
  await mp.screenshot({ path: path.join(OUT, '01-设置-私密密码弹层.png') })

  /* ---------- ⑥ 关于：切过去之后内容直接长在头部下面 ---------- */
  await (await (await page.$$('.seg'))[1]).tap()
  await sleep(1200)
  d = await page.data()
  m = await measure(mp)
  ck('切到关于', d.tab === 'about', d.tab)
  /* 站长 10-04 那条联动要在这里收到第二条读数：切档之后左上角那行大字必须跟着换，
     而且换的就是药丸那一枚的字（只钉第一帧的话，"跟着变"这一半没有任何证据）。 */
  const h1Tx2 = ((await (await page.$('.h1')).text()) || '').trim()
  const segTx2 = []
  for (const e of await page.$$('.seg')) segTx2.push(((await e.text()) || '').trim())
  ck('切到关于，这行大字跟着变成关于那一档（与药丸选中那枚仍然逐字相同）',
    h1Tx2 === dict0.pillAbout && h1Tx2 !== h1Tx && segTx2[1] === h1Tx2,
    `${h1Tx} → ${h1Tx2} / 药丸 ${segTx2.join('|')}`)
  ck('切走时展开着的面板收掉了', d.pwdOpen === false)
  const aboutLabels = []
  for (const r of await page.$$('.menu-item')) aboutLabels.push((await r.text()).replace(/\s+/g, ''))
  // .text() 拿到的是一整行（标签 + 右值），所以按"以这几个字开头"判，不比全等
  // 站长 10-01 深夜：「分享好友」改名「推荐图麦」，最底下那行 MIND 撤掉、换成一块规则。
  // 旧判据"四行、第四行以魅力开头"作废。
  const ruleLabels = []
  for (const r of await page.$$('.rule')) {
    ruleLabels.push((await r.text()).replace(/\s+/g, ''))
  }
  ck('关于只有三行：产品官网/反馈邮箱/推荐图麦',
    aboutLabels.length === 3 && aboutLabels[0].indexOf('产品官网') === 0 &&
    aboutLabels[1].indexOf('反馈邮箱') === 0 && aboutLabels[2].indexOf(zhRule('shareToFriend')) === 0,
    aboutLabels.join('|'))
  ck('那一行不再叫「分享好友」', !aboutLabels.some((x) => /分享好友/.test(x)), aboutLabels.join('|'))
  ck('MIND 那一整行撤掉了（关于里不再有一行以「魅力」开头）',
    !aboutLabels.some((x) => /^魅力/.test(x)), aboutLabels.join('|'))
  ck('规则块三行，一条一行（三句标签现读 i18n.js 的 zh 段，不抄第二份）',
    ruleLabels.length === 3 && ruleLabels.every((x, i) => x.indexOf([zhRule('mindRuleNewUser'), zhRule('mindRuleInvite'), zhRule('mindRuleSaved')][i]) === 0),
    ruleLabels.join('|'))
  ck('三个数全吃服务端：第一行是纯数字，后两行是「+数字」',
    d.mindRules.length === 3 && /^\d+$/.test(d.mindRules[0].value) &&
    /^\+\d+$/.test(d.mindRules[1].value) && /^\+\d+$/.test(d.mindRules[2].value),
    d.mindRules.map((r) => `${r.label}=${r.value}`).join(' '))
  // 站长 10-02：「推荐图麦」那行右边的「新写作者 +10」撤掉——同一个数在上下两张卡各说一遍。
  // 原来那条"两处必须相等"的同源判据跟着作废，换成钉这一条：服务端那个奖励数整页只出现一次，
  // 而且那一次在规则块里。（用 endsWith 不用 indexOf：'笔记被朋友种草+1' 里含 '+1'，会误判。）
  const reward = (d.mindRules[1] || {}).value || ''
  const dup = aboutLabels.concat(ruleLabels).filter((x) => x.endsWith(reward))
  ck('那个奖励数（+10）整页只说一次，且说在规则块那一行',
    !!reward && dup.length === 1 && ruleLabels.indexOf(dup[0]) >= 0,
    `${reward}｜命中 ${dup.length} 行：${dup.join(' / ')}`)
  // 站长 10-02 真机：这三行不要横线分隔——"这是一件事三个要点，是完整的论述，不是区分三件事"。
  // 旧判据"每行至少 106 高（跟菜单行同一档）"跟着作废：那一档是给一行一件事的菜单用的。
  // 换成钉三条：整块收成一段话（每行明显低于菜单那一档）、每行前面一枚点且三枚成列、
  // 样式表里那条 border-top 撤干净（不留没人用的死样式）。
  ck('三行收成一段话：每行 60~90rpx，不再各占一格菜单（106 那一档）',
    m.rules.length === 3 && m.rules.every((r) => {
      const h = toRpx(r.height, W)
      return h >= 60 && h <= 90
    }),
    m.rules.map((r) => toRpx(r.height, W).toFixed(0)).join('/'))
  ck('每行前面一枚点，三枚成列（左沿对齐）、14 见方',
    m.rdots.length === 3 && Math.abs(toRpx(m.rdots[0].width, W) - 14) <= 2 &&
    m.rdots.every((x) => Math.abs(x.left - m.rdots[0].left) <= 1),
    `${m.rdots.length}枚 ${m.rdots.map((x) => toRpx(x.width, W).toFixed(0)).join('/')}`)
  const tipRGB = ((h) => `rgb(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)})`)(
    TIP_DOT.replace('#', ''))
  const dotBg = (await styleOf(page, '.rdot', ['background-color']))['background-color'] || ''
  ck('点的色值从 palette.TIP_DOT 递进来（与新建页四步、Tips 同一枚，不写进 me.wxss）',
    dotBg.replace(/\s/g, '') === tipRGB.replace(/\s/g, ''), `${dotBg} ← palette ${TIP_DOT}`)
  ck('三行之间不再画线（.rule 里那条 border-top 已随旧判据一起撤）',
    !/border-top/.test(cssOf('pages/me/me.wxss', 'rule')), cssOf('pages/me/me.wxss', 'rule').slice(0, 60))
  ck('介绍卡在最上面（紧跟 LOGO 那一行，不分二级）', !!m.aboutLead && !!m.sheet && m.aboutLead.top <= m.sheet.bottom + 2)
  ck('功能介绍和隐私条款不在这一页', !aboutLabels.some((x) => /功能|隐私/.test(x)))
  await mp.screenshot({ path: path.join(OUT, '02-关于-三行加规则块.png') })

  /* ---------- ⑦ 本机填过名称/一句话/形象图：这一格也不跟着走（站长 10-01 拍） ----------
     原来这两条钉的是"头部换成用户填的那两行"，方向正好反了：这一格说的是**应用**是谁，
     不是用户是谁。判据跟着翻——填了真值之后仍必须是固定中英文与固定 LOGO。
     那两栏本身没删，它们印在海报上（`验-形象四槽-真跑.js` 一路仍在钉那条链路）。 */
  await seedProfile(mp, { name: '阿麦', slogan: '读过的都会忘，记下来的才归我' })
  await mp.switchTab('/pages/index/index')
  await sleep(1500)
  page = await gotoMe(mp)
  d = await page.data()
  ck('本机填了「名称」，这一行仍是固定的问候语', d.nameText === '你好！我是图麦笔记', d.nameText)
  ck('本机填了「一句话」，这一行仍是固定的 Slogan', !!zhSlogan && d.sloganText === zhSlogan[1],
    `${d.sloganText} ← ${zhSlogan && zhSlogan[1]}`)
  ck('本机设了卡片头像，圆里仍是应用 LOGO', d.logoSrc === '/assets/logo.png', d.logoSrc)
  await mp.screenshot({ path: path.join(OUT, '03-头部-固定问候语与Slogan.png') })
  await putProfile(mp, originalProfile)   // 复原：别把尺子造的昵称留在这台手机上
  // 语言钉回进场时那个值。中途崩了这份钉不回，但崩了留下的也是 zh——后面几把尺子
  // 吃的正是中文，所以这条只是"不留下我的痕迹"，不是"不留就红"。
  await pinLang(mp, originalLang)

  console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join('、')}` : '\n✓ 全过')
  await mp.close()
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.log('ERR', e && e.message); process.exit(1) })
