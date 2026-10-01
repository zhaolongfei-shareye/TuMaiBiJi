/** 「我的」改版这一屏的真跑尺子（v10 口径 + 站长 10-01 那五条）
 *
 *  跑法：先 `cli auto --project .../miniprogram --auto-port 9431`，等约 30 秒，再
 *        NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-我的页改版-真跑.js
 *
 *  作废的两条旧判据（别再改代码去迁就它们）：
 *   ① 「私密密码那一行右边写着设没设」——这一版行右边只剩一枚一体 icon，状态不再用文字说；
 *   ② 「点那一行浮出密码面板（.pwd-mask + 固定层 .pwd-sheet）」——面板改成就地展开，
 *      浮层和遮罩整两层撤掉，这里改成钉"展开的内容长在列表里面"。
 *
 *  evaluate 跑在逻辑层，那里没有 document/window，所以计算样式一律走 element.style()。
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

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
  q.selectAll('.pwd-input').boundingClientRect()
  q.selectAll('.pwd-btn').boundingClientRect()
  q.select('.pwd-inline').boundingClientRect()
  q.select('.menu-group').boundingClientRect()
  q.select('.about-lead').boundingClientRect()
  q.select('.h1').boundingClientRect()
  q.exec((res) => resolve({
    band: res[0], sheet: res[1], logo: res[2], text: res[3],
    score: res[4], num: res[5], lab: res[6], pill: res[7],
    segs: res[8] || [], items: res[9] || [], icos: res[10] || [],
    inputs: res[11] || [], btns: res[12] || [], inline: res[13],
    group: res[14], aboutLead: res[15], h1: res[16],
    windowWidth: wx.getWindowInfo().windowWidth,
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
  await page.setData({ tab: 'set', pwdOpen: false, pwd1: '', pwd2: '' })
  await mp.switchTab('/pages/index/index')
  await sleep(1200)
  page = await gotoMe(mp)

  /* ---------- ① 头部两块：底图 + 盖在它下沿的圆角留白卡 ---------- */
  let m = await measure(mp)
  const W = m.windowWidth
  ck('底图这块盒子高 542（可见 502 + 被卡盖住 40）', Math.abs(toRpx(m.band.height, W) - 542) <= 3, toRpx(m.band.height, W).toFixed(1))
  const overlap = m.band.bottom - m.sheet.top
  ck('留白卡往上盖住底图 40 → 接缝左右两角是弧', Math.abs(toRpx(overlap, W) - 40) <= 3, toRpx(overlap, W).toFixed(1))
  ck('留白卡左右贴屏边（不内缩）', m.sheet.left <= 1 && Math.abs(m.sheet.right - W) <= 1, `${m.sheet.left}/${m.sheet.right}`)
  const sheetStyle = await styleOf(page, '.sheet', ['border-top-left-radius', 'background-color'])
  ck('留白卡四角圆角 40', Math.abs(toRpx(parseFloat(sheetStyle['border-top-left-radius']), W) - 40) <= 2,
    sheetStyle['border-top-left-radius'])
  ck('留白卡底色不透明（深色壁纸下不会透出照片）', !/rgba/.test(sheetStyle['background-color'] || ''), sheetStyle['background-color'])

  /* ---------- ② 圆 LOGO 80、整枚在留白区里、与右边两行字等高 ---------- */
  ck('圆 LOGO 是 80 见方', Math.abs(toRpx(m.logo.width, W) - 80) <= 2 && Math.abs(toRpx(m.logo.height, W) - 80) <= 2,
    `${toRpx(m.logo.width, W).toFixed(0)}×${toRpx(m.logo.height, W).toFixed(0)}`)
  ck('LOGO 不再压着底图（整枚在留白卡里）', m.logo.top >= m.sheet.top - 1, `${m.logo.top} vs ${m.sheet.top}`)
  ck('LOGO 高度 = 右边两行字的高度（±4）', Math.abs(toRpx(m.logo.height, W) - toRpx(m.text.height, W)) <= 4,
    toRpx(m.text.height, W).toFixed(0))

  /* ---------- ②b 左上角那行大字（站长 10-01：三个 tab 的首页风格要一致） ---------- */
  ck('头部左上角有这行大字，内容就是本页的 tab 名', !!m.h1 && m.h1.width > 0, JSON.stringify(m.h1))
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
  ck('数字整块在图区以内，不落进留白卡', !!m.score && m.score.top >= m.band.top && m.score.bottom <= m.band.bottom,
    m.score && `${m.score.top}~${m.score.bottom} in ${m.band.top}~${m.band.bottom}`)

  /* ---------- ④ 药丸：默认设置，切关于 ---------- */
  let d = await page.data()
  ck('药丸两枚：设置 / 关于', m.segs.length === 2, m.segs.length)
  // 原来钉"药丸钉在底图右上（在 band 里）"。10-01 晚站长要它搬到 LOGO 那一行的最右，
  // 因为它和左上角那行「我的」抢同一条视线——旧判据作废，跟着换成下面这四条。
  ck('药丸在留白卡里（不再浮在照片上）', m.pill.top >= m.sheet.top - 1 && m.pill.bottom <= m.sheet.bottom + 1,
    `${m.pill.top}~${m.pill.bottom} in ${m.sheet.top}~${m.sheet.bottom}`)
  ck('药丸钉在这一行最右：离屏边 32（和左右内缩同一档）',
    Math.abs(toRpx(W - m.pill.right, W) - 32) <= 2, toRpx(W - m.pill.right, W).toFixed(1))
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
  ck('分享那行右值吃服务端 reward_each，单位不再写"篇"', /^\S+ \+\d+$/.test(String(d.shareValue || '')), d.shareValue)

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

  /* ---------- ⑤ 设置那五条：一体 icon + 就地展开 ---------- */
  const labels = []
  for (const r of await page.$$('.menu-item')) labels.push((await r.text()).replace(/\s+/g, ''))
  ck('设置态是五条：卡片模板/外观设置/分类管理/私密密码/注销账号',
    labels.join('|') === '卡片模板|外观设置|分类管理|私密密码|注销账号', labels.join('|'))
  ck('行高 106（不再是 118 那种大块头）', Math.abs(toRpx(m.items[0].height, W) - 106) <= 2, toRpx(m.items[0].height, W).toFixed(0))
  ck('每行右边一枚 46 见方的圆点 icon', m.icos.length === 5 && Math.abs(toRpx(m.icos[0].width, W) - 46) <= 2,
    `${m.icos.length}/${toRpx(m.icos[0].width, W).toFixed(0)}`)
  ck('icon 是圆的（宽高相等）', Math.abs(m.icos[0].width - m.icos[0].height) <= 1)
  ck('行里不再有"未设置"这类状态文字（旧判据作废）', !labels.some((x) => /未设置|密码已设置/.test(x)))

  const iPwd = labels.findIndex((x) => x.indexOf('私密密码') === 0)
  await (await (await page.$$('.menu-item'))[iPwd]).tap()
  await sleep(1200)
  d = await page.data()
  m = await measure(mp)
  ck('点那一行就地展开', d.pwdOpen === true && d.privateSet === true, `open=${d.pwdOpen} set=${d.privateSet}`)
  ck('展开的内容长在列表里面，不是浮层',
    !!m.inline && !!m.group && m.inline.top >= m.group.top && m.inline.bottom <= m.group.bottom + 1,
    m.inline ? `${m.inline.top}~${m.inline.bottom} in ${m.group.top}~${m.group.bottom}` : '没有 .pwd-inline')
  ck('这一版没有遮罩那一层', (await page.$$('.pwd-mask')).length === 0)
  ck('已设过那一态不给输入格', m.inputs.length === 0, m.inputs.length)
  const btnTexts = []
  for (const b of await page.$$('.pwd-btn')) btnTexts.push(await b.text())
  ck('已设过那一态一行两枚：返回 + 重置密码', btnTexts.join('|') === '返回|重置密码', btnTexts.join('|'))
  ck('按钮高 96（与其他页面的 .pwd-btn 同值，没做成超大块）',
    Math.abs(toRpx(m.btns[0].height, W) - 96) <= 2, toRpx(m.btns[0].height, W).toFixed(0))
  const cvStyle = await styleOf(page, '.menu-item.open .ico .cv', ['transform'])
  // rotate(45deg) 在计算样式里回的是 matrix(.707,.707,-.707,.707)，不是字面 45
  const down = /matrix\(\s*0?\.707[^,]*,\s*0?\.707/.test(cvStyle.transform || '')
  ck('展开那行的箭头转成朝下（rotate 45°，b 分量为正）', down, cvStyle.transform)
  await mp.screenshot({ path: path.join(OUT, '01-设置-私密密码展开.png') })

  /* ---------- ⑥ 关于：切过去之后内容直接长在头部下面 ---------- */
  await (await (await page.$$('.seg'))[1]).tap()
  await sleep(1200)
  d = await page.data()
  m = await measure(mp)
  ck('切到关于', d.tab === 'about', d.tab)
  ck('切走时展开着的面板收掉了', d.pwdOpen === false)
  const aboutLabels = []
  for (const r of await page.$$('.menu-item')) aboutLabels.push((await r.text()).replace(/\s+/g, ''))
  // .text() 拿到的是一整行（标签 + 右值），所以按"以这几个字开头"判，不比全等
  ck('关于只有四行：产品官网/反馈邮箱/分享好友/MIND',
    aboutLabels.length === 4 && aboutLabels[0].indexOf('产品官网') === 0 &&
    aboutLabels[1].indexOf('反馈邮箱') === 0 && aboutLabels[2].indexOf('分享好友') === 0 &&
    aboutLabels[3].indexOf('MIND') === 0, aboutLabels.join('|'))
  ck('脑力值那一行右边是服务端那个数', /MIND1\d\d/.test(aboutLabels[3] || ''), aboutLabels[3])
  ck('介绍卡在最上面（紧跟留白卡，不分二级）', !!m.aboutLead && !!m.sheet && m.aboutLead.top <= m.sheet.bottom + 2)
  ck('功能介绍和隐私条款不在这一页', !aboutLabels.some((x) => /功能|隐私/.test(x)))
  await mp.screenshot({ path: path.join(OUT, '02-关于-四行.png') })

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
