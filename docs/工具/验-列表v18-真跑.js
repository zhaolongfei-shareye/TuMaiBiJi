// v18 笔记这一屏的真跑自证：在模拟器里真读几何、真截图、真点。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-列表v18-真跑.js
// 前置：微信开发者工具已开、自动化端口 9431（docs/工具/跑尺子.sh 会先重启一次再跑）。
//
// 这一把管的是静态尺子管不到的两类事：
// ① 排布算出来的坐标落到渲染之后真是那个数（纸片 150×200、横向步 142、纵向步 176、
//    脚注躲开那 24 的叠压带、纸片底色渲染出来真是色板里那一枚）；
// ② 三个切换按钮点下去之后，屏上真是切完的样子——这两条都是这一把自己踩出来的：
//    layout() 里现读 this.data 会让「切一行」算出墙的月档高、「只看置顶」屏上仍是全部篇数
//    （setData 不是同步生效的）。静态读源码一行都看不出来，只有真点才知道。
// ③ 最后一节（⑨）现造一篇**真转存**笔记来量②那一格：测试号库里原本一篇转存来的都没有，
//    "两档都带昵称"那条就成了 0 === 0 的空过。空过不等于验过，所以走 POST /api/notes/from-share
//    造一条真的（来源与昵称都由服务端写），量完再删干净。
// 底栏是自定义组件、automator 的 page.$ 从页面树够不到，那一格不在这一把里量。
//
// ⚠ 两条 automator 的坑（这一把自己撞的，写下来免得下一个人以为代码错了）：
//  · e.style() 只认 **kebab-case**：'background-color' 回值，'backgroundColor' 回 null；
//    拿 camelCase 读到 null 会一路判成"样式没生效"，全是假红。
//  · size()/offset() 回的是旋转之后的外接框（150×200 转 -2.2° 得 157.6×205.6），
//    而且 1rpx 在这台视口是 0.52px：CSS 里写 88rpx 渲染成 45.76px，回读再除回来是 86.5——
//    掉的那 1.5 不是代码错了，是十进制落在 0.52 的格子上。所以**凡"高度/宽度落在几 rpx 的
//    格子上"这类量一律放 ±2**（第一把就是 86.5 vs 88、36.5 vs 38 红了一片）。
//    真正的排布数（步 142、行号、坐标）不吃这个误差，仍按 ±1 卡死。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const lang = require('./尺子语言钉.js')
const OUT = path.resolve(__dirname, '../design/10-02三视图与背景亮度/实测')
const API = 'https://api.agentsbin.cn/wtsj'
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const IDX_JS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
fs.mkdirSync(OUT, { recursive: true })
// 排布那几个常量从源码现读：判据与代码同源，改了代码这条会跟着动，抄一份数就是第二份真相
const JOG = JSON.parse(/const JOG = (\[[^\]]*\])/.exec(IDX_JS)[1])
const XS = Number(/const XS = (\d+)/.exec(IDX_JS)[1])
const YS = Number(/const YS = (\d+)/.exec(IDX_JS)[1])

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 这一把通篇钉中文串（「置顶笔记」「只看置顶」「笔记」那一列的标签），而语言是登录时
  // 从服务端带回的那一份：上一把真跑过登录的尺子会把测试号的 en 带进来，10-03 凌晨就被
  // 这么红过三条（读到 Notes / Pinned / Pinned only）。开跑前钉成中文，收尾还回去。
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  // 两档本机偏好先清掉：这一把量的是"没动过的人第一眼看到什么"，
  // 留着上一轮的键就会读到"为什么默认档是弯月"这种假红。
  await mp.evaluate(() => { wx.removeStorageSync('listMode'); wx.removeStorageSync('bgDim') })
  const page = await mp.reLaunch('/pages/index/index')
  await sleep(4500)

  const win = await mp.evaluate(() => wx.getWindowInfo().windowWidth)
  const R = win / 750
  const rpx = (px) => px / R
  const near = (px, target, tol) => Math.abs(rpx(px) - target) <= (tol === undefined ? 1 : tol)
  ck('换算尺子从视口现读（不把 0.52 这类数抄进判据）', R > 0.4 && R < 0.7, `1rpx=${R.toFixed(4)}px`)

  const $ = (sel) => page.$(sel)
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
  // 那一行的三枚按 data-mode 取，不按下标：搜索摊开时 wx:if 把搜索那枚摘了，
  // 数组从 3 变 2，下标全往左挪一位——第一把 ⑧ 就是拿 ic[1] 当"切回纸片墙"，
  // 实际点到的是一行切换，屏上从此没有 .note，后面直接读 null 崩掉。
  const iconOf = async (mode) => {
    for (const e of await page.$$('.acts .ic')) {
      const m = await e.attribute('data-mode')
      if (mode === null ? !m : m === mode) return e
    }
    return null
  }

  // ---------- ① 第一眼：默认档与默认排布 ----------
  let d = await page.data()
  ck('本机没有键时头部停在中间那一档（罩子实读 0.5，站长 10-02 夜里定的默认）',
    d.dimV === 1 && d.dimScrim === 'opacity:0.5' && (await css('.head-scrim', 'opacity')) === '0.5',
    `dimV=${d.dimV} dimScrim=${JSON.stringify(d.dimScrim)} 实读=${await css('.head-scrim', 'opacity')}`)
  ck('默认排布是纸片墙（效果图 s3 那一屏就是首屏）', d.listMode === 'desk', d.listMode)
  ck('右上角只剩「笔记」一列（分享/种草两列随那两个屏一起撤）',
    d.stats.length === 1 && d.stats[0].l === i18n.texts('zh').statNotes, JSON.stringify(d.stats))
  const tipNow = await txt('.tp-tx')
  ck('Tips 那一行有句子，屏上那句就在池子里（8 秒换一句，不钉死第几句）',
    d.tips.length >= 2 && d.tips.includes(tipNow), tipNow)
  const ALL = d.notes.length
  ck('这一把量的是中文那一面（下面钉的全是中文串，语言没钉住就会凭空红一片）',
    (await txt('.h1')) === '我的笔记', await txt('.h1'))
  ck('这一屏有得可看（下面每条判据都建立在"屏上真有纸片"之上）',
    ALL > 0 && (await page.$$('.note')).length === ALL, `${ALL} 篇`)

  // ---------- ② 图上那一行：三枚裸 icon + 搜索摊开 ----------
  const tools = await rect('.tools'), cats0 = await rect('.cats')
  ck('那一行左右各内缩 24、整行 88 高、下沿离列表区只留 14',
    near(tools.left, 24, 2) && near(tools.w, 702, 2) && near(tools.h, 88, 2)
    && near(cats0.top - tools.bottom, 14, 2),
    `left=${rpx(tools.left).toFixed(1)} w=${rpx(tools.w).toFixed(1)} h=${rpx(tools.h).toFixed(1)} 离列表区=${rpx(cats0.top - tools.bottom).toFixed(1)}`)
  const icons = await page.$$('.acts .ic')
  ck('三枚 icon 都在（搜索 / 纸片墙 / 一行），且没有圆底那种壳', icons.length === 3, icons.length)
  ck('三枚同一条基准 38×38（谁都不比谁小一号）',
    (await Promise.all(icons.map(async (e) => (await e.size()).width)))
      .every((w) => near(w, 38, 2)), '')
  const deskIc = await iconOf('desk'), rowsIc = await iconOf('rows')
  ck('当前那一档比另外两枚白一档（选中只靠颜色与笔画，不靠壳）',
    (await deskIc.style('color')) !== (await rowsIc.style('color')),
    `墙=${await deskIc.style('color')} 行=${await rowsIc.style('color')}`)
  const vr = await rect('.vr')
  ck('icon 之间那道竖线在（2×38）', near(vr.w, 2, 0.6) && near(vr.h, 38, 2),
    `${rpx(vr.w).toFixed(1)}×${rpx(vr.h).toFixed(1)}`)
  await mp.screenshot({ path: path.join(OUT, 'v18-1-纸片墙默认.png') })

  // ---------- ③ 分类那一行：置顶不滚、chips 从时间轴右侧起排、下面一条浅虚线 ----------
  const pinb = await rect('.pinb'), rail = await rect('.rail')
  const stage = await rect('.stage'), chipScroll = await rect('.cat-scroll')
  ck('置顶那一档宽 = 时间轴那一列宽（④：chips 只能从这一列右侧起排）',
    Math.abs(pinb.w - rail.w) <= 1, `${rpx(pinb.w).toFixed(1)} vs ${rpx(rail.w).toFixed(1)}`)
  ck('chips 那一节左沿与纸片墙左沿同一条线（不压到月份那一栏上）',
    Math.abs(chipScroll.left - stage.left) <= 1, `${rpx(chipScroll.left).toFixed(1)} vs ${rpx(stage.left).toFixed(1)}rpx`)
  ck('分类那一整行的左沿不越过时间轴（与卡的 24 内缩同一条线）',
    near(pinb.left, 24), `${rpx(pinb.left).toFixed(1)}rpx`)
  // ③那一句话有三半：字串换成「置顶笔记」、钉在这一行最左、**竖向居中**。前两半上面钉了，
  // 这半量它和 chips 那一节在同一条水平中线上（.cats 是 align-items:center，两兄弟中心必齐）。
  ck('「置顶笔记」与 chips 那一节同一条水平中线（③第三半：竖向居中，不顶行也不坐底）',
    Math.abs((pinb.top + pinb.bottom) / 2 - (chipScroll.top + chipScroll.bottom) / 2) <= 2,
    `置顶中线=${rpx((pinb.top + pinb.bottom) / 2).toFixed(1)} chips中线=${rpx((chipScroll.top + chipScroll.bottom) / 2).toFixed(1)}rpx`)
  ck('分类行与笔记区之间一条浅虚线，且它通到整块卡的边（⑤）',
    (await css('.cats', 'border-bottom-style')) === 'dashed'
    && near((await (await $('.cats')).size()).width, 750),
    `线=${await css('.cats', 'border-bottom-style')} 宽=${rpx((await (await $('.cats')).size()).width).toFixed(1)}`)
  ck('置顶那一档的文字是「置顶笔记」（③，不是效果图那句「置顶」）',
    (await txt('.pinb-t')) === i18n.texts('zh').pinFilter, await txt('.pinb-t'))
  ck('未选中那一档下面没有短黄杠（选中才亮）', !(await $('.pinb.on .pinb-t')), '')

  // ---------- ④ 纸片墙：日期分行、叠压、脚注不被压住、色从色板来 ----------
  d = await page.data()
  const cards = d.groups.reduce((a, g) => a.concat(g.cards), [])
  ck('屏上枚数 = 这一屏的笔记数（一篇都不漏、不重复）',
    cards.length === d.notes.length, `${cards.length} 枚 / ${d.notes.length} 篇`)
  // 同一行 = 去掉每列那点竖向错位（JOG）之后落在同一条 176 的行上
  const rowOf = (c) => Math.round((c.y - JOG[Math.round(c.x / XS) % JOG.length]) / YS)
  const byDay = {}
  cards.forEach((c) => { (byDay[c.tail] = byDay[c.tail] || []).push(c) })
  ck('同一日期的纸片必在同一行（去掉每列错位之后行号相同）',
    Object.values(byDay).every((l) => new Set(l.map(rowOf)).size === 1),
    JSON.stringify(Object.entries(byDay).map(([k, l]) => [k, l.map(rowOf)])))
  ck('不同日期一定另起一行（不同日期的行号互不相同）',
    new Set(Object.values(byDay).map((l) => rowOf(l[0]))).size === Object.keys(byDay).length,
    Object.values(byDay).map((l) => rowOf(l[0])).join(','))
  const geo = []
  for (const e of await page.$$('.note')) {
    const s = await e.size(), o = await e.offset()
    geo.push({ w: s.width, h: s.height, left: o.left, top: o.top })
  }
  const sameRow = geo.filter((x) => Math.abs(x.top - geo[0].top) < 24 * R)
  ck('一行里的两枚横向步 142（一枚 150 只压掉右边那 8）',
    sameRow.length < 2 || near(sameRow[1].left - sameRow[0].left, XS),
    sameRow.length > 1 ? `${rpx(sameRow[1].left - sameRow[0].left).toFixed(1)}rpx` : '这一行只有一枚，跳过')
  ck('一枚纸片 150×200（外接框含旋转多出来的那不到 8）',
    geo.every((x) => x.w / R >= 149 && x.w / R <= 158 && x.h / R >= 199 && x.h / R <= 207),
    geo.map((x) => `${rpx(x.w).toFixed(0)}×${rpx(x.h).toFixed(0)}`).join(' '))
  const foot = await rect('.note-foot'), first = geo[0]
  ck('脚注（已分享 + 日期）躲开纵向叠压那 24：下沿离纸片底 ≥ 24',
    foot && (first.top + first.h - foot.bottom) / R >= 24,
    foot && `${((first.top + first.h - foot.bottom) / R).toFixed(1)}rpx`)
  const z = cards.map((c) => c.z)
  ck('z 全是整数且随行递增（小数会被整条丢掉，届第一行盖住后面所有行）',
    z.every((v) => Number.isInteger(v)) && new Set(z).size > 1, z.join(','))
  ck('月份那一档写成 YY/MM、纸片角上写成 MM/DD（②那处改口）',
    /^\d{2}\/\d{2}$/.test(await txt('.rm-ym')) && /^\d{2}\/\d{2}$/.test(await txt('.note-date')),
    `${await txt('.rm-ym')} / ${await txt('.note-date')}`)
  const dot = await rect('.rm-dot'), line = await rect('.rail-line')
  ck('月份那枚小黄点正压在那根竖线上（点中心落在线中心 ±2）',
    Math.abs((dot.left + dot.w / 2) - (line.left + line.w / 2)) <= 2 * R,
    `${rpx(dot.left + dot.w / 2).toFixed(1)} vs ${rpx(line.left + line.w / 2).toFixed(1)}rpx`)
  const sharedN = cards.filter((c) => c.shared).length
  ck('一屏上只有「已分享」一种状态标记（①：其他状态什么都不画）',
    (await page.$$('.shared-tag')).length === sharedN
    && (await page.$$('.note .pin')).length === 0 && (await page.$$('.note .cat-dot')).length === 0,
    `${(await page.$$('.shared-tag')).length} 块 / ${sharedN} 篇开着的码`)
  const inFamily = (s) => p.PAPERS.some((x) => {
    const a = (String(s).match(/\d+/g) || []).slice(0, 3).map(Number)
    const b = [1, 2, 3].map((i) => parseInt(x.bg.slice(1 + (i - 1) * 2, 1 + i * 2), 16))
    return a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= 1)
  })
  const paperBgs = []
  for (const e of await page.$$('.note')) paperBgs.push(await e.style('background-color'))
  ck('每一枚渲染出来的底色都在 palette.PAPERS 那一族里（没有第二份色）',
    paperBgs.length > 0 && paperBgs.every(inFamily), paperBgs.join(' '))
  const rgbOfHex = (h) => `rgb(${[1, 2, 3].map((i) => parseInt(h.slice(1 + (i - 1) * 2, 1 + i * 2), 16)).join(', ')})`
  const tagBg = await css('.shared-tag', 'background-color'), tagInk = await css('.shared-tag', 'color')
  ck('「已分享」那块渲染出来就是 palette.SHARED_TAG 那一对（底与字都不下第二份值）',
    tagBg === rgbOfHex(p.SHARED_TAG.bg) && tagInk === rgbOfHex(p.SHARED_TAG.ink),
    `${tagBg} / ${tagInk}`)

  // ---------- ⑤ 只看置顶（这一条钉的是 setData 时序那个坑） ----------
  // 未选中那一档的字色先在**点之前**取：选中之后树上只剩那一态，事后再读两次是同一个值，
  // "确实翻了色"那条就会永远绿（这种假绿这一批已经栽过好几回）。
  const idleInk = await css('.pinb-t', 'color')
  await (await $('.pinb')).tap(); await sleep(1200)
  d = await page.data()
  const want = d.notes.filter((n) => n.is_pinned).length
  const shown = d.groups.reduce((a, g) => a + g.cards.length, 0)
  ck('点「置顶笔记」屏上只剩置顶那几篇（现读 this.data 会算成全部）',
    d.pinnedOnly === true && shown === want && want > 0 && want < ALL,
    `${shown} 枚 / 置顶 ${want} 篇 / 全部 ${ALL} 篇`)
  // 选中那一档"亮起来"= 三个字变深一档 + 下面一条短黄杠 + 右端那句提示在。
  // 原来这里钉死 rgb(35,37,44)——红了一轮才发现那是**米白主题**的 --text-primary，
  // 这一屏的字色吃的是主题变量，壁纸换成天青就是 rgb(27,42,33)，判据本身是错的。
  // 绝对值由静态那把钉（`.pinb.on .pinb-t { color: var(--text-primary) }`），
  // 真跑只管"确实翻了色、翻的是那条变量"。
  ck('这一档亮起来：字比未选中那档深一档（吃 --text-primary）、下面一条短黄杠、右端那句提示在',
    !!(await $('.pinb.on .pinb-t')) && (await txt('.pinn')) === i18n.texts('zh').pinnedOnly
    && (await css('.pinb.on .pinb-t', 'color')) !== idleInk,
    `未选中=${idleInk} 选中=${await css('.pinb.on .pinb-t', 'color')} 提示=${await txt('.pinn')}`)
  ck('那句提示不压 chips（它在可滚那一节的右边）',
    (await rect('.pinn')).left >= (await rect('.cat-scroll')).right - 1, '')
  await mp.screenshot({ path: path.join(OUT, 'v18-2-只看置顶.png') })
  await (await $('.pinb')).tap(); await sleep(1200)
  d = await page.data()
  ck('再点一次回正常显示（篇数回到全部）',
    d.pinnedOnly === false && d.groups.reduce((a, g) => a + g.cards.length, 0) === ALL, '')

  // ---------- ⑥ 切一行模式（同一条时序坑的第二处） ----------
  await rowsIc.tap(); await sleep(1400)
  d = await page.data()
  const n0 = d.groups[0].cards.length
  ck('切到「一行」月档高 = 条数 × 88（算成墙的 552 就是排布读到了旧档）',
    d.listMode === 'rows' && d.groups[0].h === n0 * 88, `h=${d.groups[0].h} 期望 ${n0 * 88}`)
  ck('一行一条 88 高', near((await rect('.rw')).h, 88, 2), rpx((await rect('.rw')).h).toFixed(1))
  const rwb = await css('.rw', 'border-bottom-width')
  ck('两条之间那条横线撤了（只靠行高分）', !rwb || rwb === '0px', rwb)
  ck('一行模式不显示日期（月份在左边那一列，同一行不重复第二遍）', !(await $('.note-date')), '')
  // 标题吃满横向字数这件事要拿**没有昵称那一行**量：②那处改口讲的是"这篇打哪儿来"，
  // 一行模式也一样带昵称 + 头像，那一截占了宽度是应该的，不能算成标题没铺开。
  const rwTW = []
  for (const e of await page.$$('.rw-t')) rwTW.push(rpx((await e.size()).width))
  ck('一行模式标题仍吃满横向字数（取没有昵称那一行，可用宽 ≥ 400rpx）',
    rwTW.length > 0 && Math.max(...rwTW) >= 400, rwTW.map((v) => v.toFixed(0)).join(' '))
  const whoRows = (await page.$$('.rw .note-who')).length
  const whoNotes = d.notes.filter((n) => n.who).length
  // 库里一篇转存都没有时这条是 0 === 0，空过——真量在 ⑨（那里现造一篇真转存笔记）。
  ck('转存那篇在一行模式里也带昵称 + 通用头像（②与排布无关，两档说同一句话）',
    whoRows === whoNotes, `${whoRows} 行有 / ${whoNotes} 篇是转存来的`)
  ck('切换这一档是本机偏好（写进 listMode，下次进页还是它）',
    (await mp.evaluate(() => wx.getStorageSync('listMode'))) === 'rows', '')
  await mp.screenshot({ path: path.join(OUT, 'v18-3-一行模式.png') })

  // ---------- ⑦ 搜索摊开：Tips 消失、缩回不清词、✕ 才清词 ----------
  const srchIc = await iconOf(null)
  await srchIc.tap(); await sleep(1200)
  d = await page.data()
  ck('点搜索：那一枚就地向左摊成输入框，Tips 整条不渲染',
    d.searchOpen === true && !(await $('.tp')) && !!(await $('.srch')), '')
  ck('输入框与那一行同高（88），右边两枚切换 icon 留着',
    near((await rect('.srch')).h, 88, 2) && (await page.$$('.acts .ic')).length === 2, '')
  await mp.screenshot({ path: path.join(OUT, 'v18-4-搜索摊开.png') })
  await (await $('.srch-input')).input('中秋'); await sleep(300)
  await (await $('.srch-go')).tap(); await sleep(2500)
  d = await page.data()
  ck('搜完列表是筛过的、词留着',
    d.searchKeyword === '中秋' && d.notes.length >= 1 && d.notes.length <= ALL,
    `${d.notes.length} 篇 / 全部 ${ALL} 篇`)
  await (await $('.h1')).tap(); await sleep(900)
  d = await page.data()
  ck('点空白只缩回、不清词（「收起」和「清空」是两件事）',
    d.searchOpen === false && d.searchKeyword === '中秋', JSON.stringify(d.searchKeyword))
  const srchIc2 = await iconOf(null)
  ck('缩回之后那枚搜索 icon 亮一档（列表是筛过的，得有个地方说）',
    (await srchIc2.style('color')) === 'rgb(255, 255, 255)', await srchIc2.style('color'))
  await srchIc2.tap(); await sleep(900)
  await (await $('.srch-x')).tap(); await sleep(2500)
  d = await page.data()
  ck('点 ✕ 才清词，清完列表回到全部',
    d.searchKeyword === '' && d.notes.length === ALL, `${d.notes.length} 篇`)
  // ✕ 只清词、不收条（收与清是两件事，上面刚钉过），所以下面开工前得自己把它收回去：
  // 摊着的时候屏上没有搜索那枚，点空白是唯一那条收起的通道。
  await (await $('.h1')).tap(); await sleep(900)

  // ---------- ⑧ 点一枚 = 开详情窗（两档都不就地展开） ----------
  await (await iconOf('desk')).tap(); await sleep(1400)   // 切回纸片墙
  const note = await $('.note')
  const idx = Number(await note.attribute('data-idx'))
  await note.tap(); await sleep(2600)
  d = await page.data()
  ck('点一枚纸片直接浮详情窗，窗里就是这一篇（列表没有"就地展开"这一态）',
    d.detailOpen === true && !!d.detailNote && d.detailNote.id === d.notes[idx].id,
    `${(d.detailNote || {}).title}`)
  ck('窗里有摘要（撤掉就地展开不丢内容）', !!(d.detailNote || {}).summary, '')
  await mp.screenshot({ path: path.join(OUT, 'v18-5-详情窗.png') })
  await (await $('.grip')).tap(); await sleep(900)
  ck('点把手收窗，回到列表原样', (await page.data()).detailOpen === false)

  // ---------- ⑨ ②那一格走真链路：造一篇真转存笔记，再量它屏上那行字 ----------
  // 上面 ⑥ 那条"两档说同一句话"在这一把里是**空过**的：测试号库里一篇转存来的都没有
  // （0 行有 / 0 篇是转存来的），等式两边都是 0 也算成立。空过不等于验过，所以这里
  // 现造一条真的：建稿 → 用带昵称的码分享出去 → 从那张码「存到我的笔记」。
  // 这一趟走的是 POST /api/notes/from-share，source_type 与 imported_from 都由服务端写，
  // 不是 setData 糊出来的假态。跑完两篇都删，不留探针痕迹。
  const NAME = '阿麦的自证'
  let srcId = null, impId = null
  try {
    const made = await mp.evaluate(async (api, name) => {
      const tk = getApp().globalData.token
      const send = (url, method, data) => new Promise((resolve) => wx.request({
        url: api + url, method, data,
        header: { 'content-type': 'application/json', Authorization: `Bearer ${tk}` },
        success: (r) => resolve({ code: r.statusCode, data: r.data }),
        fail: (e) => resolve({ code: 0, data: { _fail: e.errMsg } }),
      }))
      const a = await send('/api/notes/', 'POST', {
        title: '转存昵称自证·原稿', source_type: 'manual', content: '这一篇只用来造一张带昵称的码，跑完就删。',
      })
      const id = a.data && (a.data.id || (a.data.note && a.data.note.id))
      if (!id) return { step: '建原稿就没成', a }
      const s = await send('/api/shares/', 'POST', { note_id: id, author_name: name })
      if (!s.data || !s.data.token) return { step: '开码没成', id, s }
      const imp = await send('/api/notes/from-share', 'POST', { token: s.data.token })
      const iid = imp.data && (imp.data.id || (imp.data.note && imp.data.note.id))
      return { step: iid ? 'ok' : '转存没成', id, iid, imp }
    }, API, NAME)
    srcId = made.id || null
    impId = made.iid || null
    ck('造出一篇真转存笔记（建稿 → 开码带昵称 → 从那张码存进自己库）',
      !!impId, `${made.step} ${JSON.stringify(made.imp || made.s || made.a || '').slice(0, 90)}`)
    if (!impId) throw new Error(`造不出转存那篇，②这一格没法量：${made.step}`)

    await page.callMethod('loadNotes', true)
    await sleep(3500)
    d = await page.data()
    const at = (d.notes || []).findIndex((n) => n.id === impId)
    ck('它进了列表，且页面认它是转存来的（来源与昵称都来自服务端那两样）',
      at >= 0 && d.notes[at].is_import === true && d.notes[at].who === NAME,
      at >= 0 ? `row=${at} is_import=${d.notes[at].is_import} who=${JSON.stringify(d.notes[at].who)}` : '（列表里没有这一篇）')

    // 这一节顺手把"多一个月"那一态也量了：原来库里四篇全在九月，月份那一列只有一块，
    // 按连续成段切还是按聚堆切都看不出差别。造出这两篇 10/03 之后，两篇置顶的九月笔记
    // 会把十月那两篇夹在中间——按成段切就会画出 26/09 → 26/10 → 又一块 26/09。
    const mks = (d.groups || []).map((g) => g.mk)
    ck('一个月在时间轴上只有一块（置顶把旧月插到新月前面时，聚堆切才不裂成两块）',
      mks.length >= 2 && new Set(mks).size === mks.length,
      `${mks.join(' | ')}　${d.notes.length} 篇`)

    const boxOf = async (sel, want) => {
      for (const e of await page.$$(sel)) {
        if (Number(await e.attribute('data-idx')) === want) return e
      }
      return null
    }
    const whoOf = async (root) => {
      const w = root && await root.$('.note-who')
      if (!w) return null
      const g = await w.$('.glyph-who'), t = await w.$('.note-name')
      return { glyph: !!g, name: t ? String(await t.text() || '') : '' }
    }
    const wall = await whoOf(await boxOf('.note', at))
    ck('纸片那一格：一枚通用头像 + 那两个字，字就是开码时递过去的昵称（不是自己的名字、不拿"图麦"填）',
      !!wall && wall.glyph === true && wall.name === NAME,
      wall ? `头像描线=${wall.glyph} 名字=${JSON.stringify(wall.name)}` : '（纸片上没有 .note-who）')
    const extra = []
    for (const e of await page.$$('.note')) {
      const i = Number(await e.attribute('data-idx'))
      if (i !== at && (await e.$('.note-who'))) extra.push(i)
    }
    ck('只有转存那篇有：别的纸片一枚都不许挂（①那句"其他状态什么都不画"一并钉住）',
      extra.length === 0, extra.length ? `多出来在 row=${extra.join(',')}` : `其余 ${(await page.$$('.note')).length - 1} 枚都干净`)
    await mp.screenshot({ path: path.join(OUT, 'v18-6-转存那一格昵称.png') })

    await (await iconOf('rows')).tap(); await sleep(1400)
    const row = await whoOf(await boxOf('.rw', at))
    ck('同一句话在「一行」里也成立（排布换了，"这篇打哪儿来"不换）',
      !!row && row.glyph === true && row.name === NAME,
      row ? `头像描线=${row.glyph} 名字=${JSON.stringify(row.name)}` : '（那一行没有 .note-who）')
    await mp.screenshot({ path: path.join(OUT, 'v18-7-一行里转存带昵称.png') })
    await (await iconOf('desk')).tap(); await sleep(1200)
  } finally {
    const codes = await mp.evaluate(async (api, ids) => {
      const tk = getApp().globalData.token
      const del = (id) => new Promise((resolve) => wx.request({
        url: `${api}/api/notes/${id}`, method: 'DELETE',
        header: { Authorization: `Bearer ${tk}` },
        success: (r) => resolve(r.statusCode), fail: () => resolve(0),
      }))
      const out = []
      for (const id of ids) if (id) out.push(await del(id))
      return out
    }, API, [impId, srcId]).catch(() => [])
    console.log(`— 自证用的那两篇已删（HTTP ${codes.join(' / ') || '（没连上，两篇 id：' + impId + '/' + srcId + '）'}）`)
    await page.callMethod('loadNotes', true)
    await sleep(3500)
    const left = ((await page.data()).notes || []).filter((n) => n.id === impId || n.id === srcId)
    ck('库里没留下探针痕迹（屏上也不再是那一篇带昵称）', left.length === 0, `${left.length} 篇残留`)
  }

  try { await lang.pin(mp, langBefore) } catch (e) { /* 连接可能已经断了 */ }
  console.log(`\n${bad.length ? '✗' : '✓'} 列表 v18 真跑：${bad.length ? `${bad.length} 条不过：${bad.join('、')}` : '全过'}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('✗ 跑挂了：', e.message); process.exit(1) })
