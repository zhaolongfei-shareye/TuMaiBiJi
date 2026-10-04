// P0-6 的反向对照（真运行时那一条）：把一批"像服务端会发的"配方直接从 wx.request 端给客户端，
// 看这一屏是不是真的跟着变——多一格、名字跟着改、脏的那一套整套丢而不画半张；
// 然后把补丁撤掉重进一次页，三处必须一起回到原样。
//
// 为什么必须单独一把：前一把真跑（验-模板配方下发-真跑）能证的只有"什么都没下发时这一屏没被
// 拉取搞坏"——现网那张表还没建，请求真打过去就是 404，所以"下发真的生效"这半句今天在网络这条路上
// 无处可证。而"不走发版"这句承诺的全部重量都在那半句上。这里用补丁把接口替成一份本地假批次：
// 请求、闸门、合并、缓存、重画走的是同一条代码路，只有"响应从哪儿来"换成了本机。
// 撤掉补丁那一步是反证：多出来的那一格要是撤了还在，说明它压根不是这批下发值带来的。
//
// 前置：微信开发者工具已开。跑法：bash docs/工具/跑尺子.sh 9431 验-模板配方下发-注入-真跑
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const PORT = process.env.MP_PORT || 9431
const poster = require(path.resolve(__dirname, '../../miniprogram/utils/poster.js'))
const pt = require(path.resolve(__dirname, '../../miniprogram/utils/posterTemplates.js'))
const RECIPES = require(path.resolve(__dirname, '../../miniprogram/utils/posterRecipes.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
let total = 0
const flat = (s) => String(s).replace(/\s+/g, '')
const ck = (name, ok, got) => {
  total++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ` → ${got}`}`)
  if (!ok) bad.push(name)
}

// 骨架占位数与画失败那一款：从 profile.js 现读，理由见 验-模板配方下发-真跑 文件头。
const SRC = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/profile/profile.js'), 'utf8')
const TW = Number(/const THUMB_W = (\d+)/.exec(SRC)[1])
const skel = /h: Math\.round\(\(THUMB_W \* (\d+)\) \/ (\d+)\)/.exec(SRC)
const fail = /h: Math\.round\(THUMB_W \* ([\d.]+)\)/.exec(SRC)
const H_SKEL = skel ? Math.round((TW * Number(skel[1])) / Number(skel[2])) : -1
const H_FAIL = fail ? Math.round(TW * Number(fail[1])) : -1
const painted = (it) => it && it.h !== H_SKEL && it.h !== H_FAIL

const rowOf = (id, over) => {
  const t = poster.TEMPLATES.find((x) => x.id === id)
  const base = t
    ? { template_id: id, label: t.label, label_en: t.labelEn, group_key: t.group }
    : { template_id: id, label: '注入的一套', label_en: 'Probe Extra', group_key: 'bold' }
  return Object.assign({
    sort_order: 500, min_app_version: '1.0.0', content_hash: `inj-${id}`,
    recipe: RECIPES[id] || null,
  }, base, over || {})
}

// 十套原样（配方就是包内那份，只把 id 一致这条守住）+ 第 11 套（新 id，借 quote 的画法）
// + quote 改口 + acid 一份脏的（未知 op，闸门该整套丢它）。
const BATCH = poster.TEMPLATES
  .map((t) => rowOf(t.id))
  .map((r) => (r.template_id === 'quote' ? rowOf('quote', { label: '改名生效', label_en: 'Renamed', content_hash: 'inj-quote-2' }) : r))
  .map((r) => (r.template_id === 'acid'
    ? rowOf('acid', { recipe: { id: 'acid', min_version: 1, steps: [{ let: 'height', value: 1200 }, { emit: { k: 'no_such_op', x: { lit: 0 } } }] }, content_hash: 'inj-acid-dirty' })
    : r))
  .concat([rowOf('__nope__', { template_id: 'probeExtra', recipe: Object.assign({}, RECIPES.quote, { id: 'probeExtra' }), content_hash: 'inj-extra' })])

const measure = (mp) => mp.evaluate(() => new Promise((resolve) => {
  const p = getCurrentPages().slice(-1)[0]
  const q = p.createSelectorQuery()
  q.selectAll('.cell-canvas').boundingClientRect()
  q.exec((res) => resolve({
    boxes: (res[0] || []).map((b) => ({ w: Math.round(b.width), h: Math.round(b.height) })),
    calls: (wx.__probeCalls || []).map(String),
  }))
}))

const labelsOf = async (page) => {
  const out = []
  for (const e of await page.$$('.cell-label')) out.push(((await e.text()) || '').replace(/\s+/g, ''))
  return out
}
const headsOf = async (page) => {
  const out = []
  for (const e of await page.$$('.grid-head')) out.push(((await e.text()) || '').replace(/\s+/g, ''))
  return out
}

async function enterProfile(mp) {
  for (let i = 0; ; i++) {
    try { await mp.reLaunch('/pages/profile/profile'); break } catch (e) {
      if (i >= 4) throw e
      console.log(`第 ${i + 1} 次进卡片模板页没成：${e.message}`)
      await sleep(8000)
    }
  }
  // 十格（注入那趟是十一格）小样是一格一格画的，第一格还要解头像；等它自己画完再读。
  await sleep(14000)
  return mp.currentPage()
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('尺子自己炸了', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }) } catch (e) { await sleep(10000) }
  }
  if (!mp) {
    console.error(`连不上 ${PORT}（环境红，不是判据红）。先跑：bash docs/工具/跑尺子.sh ${PORT} 验-模板配方下发-注入-真跑`)
    process.exit(2)
  }

  // ① 先量一次"没注入"的基线：十一格这件事必须是从注入那一步才出现的。
  await mp.evaluate((key) => {
    wx.__origRequest = wx.request
    wx.__probeCalls = []
    wx.removeStorageSync(key)
    wx.request = (o) => {
      if (o && /poster\/templates/.test(String(o.url))) {
        wx.__probeCalls.push(String(o.url))
        // 这一段是接口替身：success 与 complete 必须一路发完，少一个调用方就悬在半路
        // （表现是判据全绿而屏上什么都读不到）。
        if (o.success) o.success({ statusCode: 200, data: [], header: {}, cookies: [], errMsg: 'request:ok' })
        if (o.complete) o.complete({ statusCode: 200, errMsg: 'request:ok' })
        return { abort() {} }
      }
      return wx.__origRequest(o)
    }
  }, pt.STORE_KEY)
  let page = await enterProfile(mp)
  const base = await measure(mp)
  const baseItems = ((await page.data('groups')) || []).reduce((a, g) => a.concat(g.items || []), [])
  ck(`基线：下发空批次 → 页上 ${poster.TEMPLATES.length} 格，每格都画到了东西`,
    base.boxes.length === poster.TEMPLATES.length && baseItems.length === poster.TEMPLATES.length
      && baseItems.every(painted),
    base.boxes.map((b) => `${b.w}x${b.h}`).join(','))

  // ② 换成十一行那一批：多出来的那一格、改名的那一格、脏的那一格同时看。
  await mp.evaluate((rows) => {
    wx.__probeCalls = []
    wx.request = (o) => {
      if (o && /poster\/templates/.test(String(o.url))) {
        wx.__probeCalls.push(String(o.url))
        if (o.success) o.success({ statusCode: 200, data: rows, header: {}, cookies: [], errMsg: 'request:ok' })
        if (o.complete) o.complete({ statusCode: 200, errMsg: 'request:ok' })
        return { abort() {} }
      }
      return wx.__origRequest(o)
    }
  }, BATCH)
  page = await enterProfile(mp)
  const inj = await measure(mp)
  const dg = await page.data()
  const items = (dg.groups || []).reduce((a, g) => a.concat(g.items || []), [])
  const heads = await headsOf(page)
  const labels = await labelsOf(page)
  const extra = items.find((it) => it.id === 'probeExtra')
  // 分组那两行期望的数从 Node 那份 TEMPLATES 算，不从页面 data 反推（那就成了拿页面自己核对它自己）。
  const expHead = (gid, extraN) => {
    const c = poster.TEMPLATES.filter((t) => t.group === gid).length + (extraN || 0)
    return flat(poster.groupName(gid, dg.lang) + (dg.lang === 'en' ? ` (${c})` : `（${c}）`))
  }

  ck('十一行那批打过来，只发了一遍请求（进一次页拉一次，不在 onShow 里重复打）',
    inj.calls.length === 1 && /\/api\/poster\/templates\/$/.test(inj.calls[0]), JSON.stringify(inj.calls))
  ck(`页上从 ${poster.TEMPLATES.length} 格变成 ${poster.TEMPLATES.length + 1} 格：新 id 那一格真出现了、也真画到了东西（h 不是占位数）`,
    inj.boxes.length === poster.TEMPLATES.length + 1 && !!extra && painted(extra),
    `${inj.boxes.length} 格 / probeExtra=${extra ? extra.h : '没有这一格'}`)
  ck(`分组那两行的数字跟着合并后的列表走（${expHead('classic')}／${expHead('bold', 1)}）`,
    heads.length === poster.TEMPLATE_GROUPS.length
      && heads[0] === expHead('classic') && heads[1] === expHead('bold', 1),
    `${heads.join(' / ')}　（语言 ${dg.lang}）`)
  ck('下发改了那一套的叫法，界面那句跟着改口（不用发版、不用清缓存）',
    labels.indexOf('改名生效') >= 0 || labels.indexOf('Renamed') >= 0, labels.join(' | '))
  ck('脏的那一套整套丢、画的是包内那份：acid 那一格照样画到东西，别的十格不受牵连',
    items.filter(painted).length === poster.TEMPLATES.length + 1 && !!items.find((it) => it.id === 'acid' && painted(it)),
    items.map((it) => `${it.id}:${it.h}`).join(' '))
  const cache = await mp.evaluate((key) => {
    const raw = wx.getStorageSync(key)
    return raw && Array.isArray(raw.rows)
      ? { n: raw.rows.length, hasAcid: raw.rows.some((r) => r.template_id === 'acid'), hasExtra: raw.rows.some((r) => r.template_id === 'probeExtra') }
      : { n: -1 }
  }, pt.STORE_KEY)
  ck(`本机缓存里只写合格那十条（脏的 acid 那条不进机器，否则每次冷启动重踩一遍）→ ${cache.n} 条`,
    cache.n === poster.TEMPLATES.length && cache.hasAcid === false && cache.hasExtra === true, JSON.stringify(cache))

  // ③ 服务端把那批撤空（等价于十行全改成 archived）+ 清掉本机缓存：两处新增必须一起消失。
  //    这一步是上面几条的反证——多出来那一格要是撤了还在，说明它压根不是那批下发值带来的。
  await mp.evaluate((key) => {
    wx.__probeCalls = []
    wx.removeStorageSync(key)
    wx.request = (o) => {
      if (o && /poster\/templates/.test(String(o.url))) {
        wx.__probeCalls.push(String(o.url))
        if (o.success) o.success({ statusCode: 200, data: [], header: {}, cookies: [], errMsg: 'request:ok' })
        if (o.complete) o.complete({ statusCode: 200, errMsg: 'request:ok' })
        return { abort() {} }
      }
      return wx.__origRequest(o)
    }
  }, pt.STORE_KEY)
  page = await enterProfile(mp)
  const back = await measure(mp)
  const bd = await page.data()
  const backItems = (bd.groups || []).reduce((a, g) => a.concat(g.items || []), [])
  const backLabels = await labelsOf(page)
  const backHeads = await headsOf(page)
  const expHeadBack = (gid) => {
    const c = poster.TEMPLATES.filter((t) => t.group === gid).length
    return flat(poster.groupName(gid, bd.lang) + (bd.lang === 'en' ? ` (${c})` : `（${c}）`))
  }
  ck('撤掉那批下发值重进一次页：十一格回到十格、那一格没了',
    back.boxes.length === poster.TEMPLATES.length && !backItems.some((it) => it.id === 'probeExtra'),
    `${back.boxes.length} 格`)
  ck('那句改口的名字与分组那两个数一起回去（改名生效→本名，(7)→(6)）',
    backLabels.indexOf('改名生效') < 0 && backLabels.indexOf('Renamed') < 0
      && backHeads[0] === expHeadBack('classic') && backHeads[1] === expHeadBack('bold'),
    `${backHeads.join(' / ')}　${backLabels.slice(0, 3).join('|')}`)

  try { await mp.disconnect() } catch (e) { /* 收尾断不干净由跑尺子.sh 下一次整体重启兜 */ }
  console.log(bad.length ? `红 ${bad.length} 条：${bad.join('、')}` : `全部通过（${total} 条里 0 红）`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('尺子跑挂了', e && e.message ? e.message : e); process.exit(2) })
