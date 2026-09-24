// 界面字眼 + 笔记卡片页那一排模板小图，逐条对着需求验收（跑在开发者工具里，打现网真接口）。
// 用法：
//   /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
//       --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram --auto-port 9420
//   NODE_PATH=/tmp/mp-verify/node_modules node docs/工具/验-字眼与模板条.js
//   /Applications/wechatwebdevtools.app/Contents/MacOS/cli close \
//       --project /Users/zlfmac/Documents/TuMaiBiJi/miniprogram
// 它会往现网建一条标题为「验收-客户端 xxxxxx」的笔记，跑完按 id 删掉并撤掉它的分享。
// 导航条标题不是猜的：挂钩子记下 wx.setNavigationBarTitle 每次的实参，页面切完读最后一次。
// 小图那一排"固定样式、不动态刷新"也是量的：先等它长定（两轮取样尺寸一致），再连点三套，
// 比 .pick-canvas 的尺寸和名字——只有选中态的外环可以变，格子本身不许动（曾经边框加粗抖 2px）。
const automator = require('miniprogram-automator')
const fs = require('fs')

const BASE = 'https://api.agentsbin.cn/wtsj'
const MARK = Date.now().toString(36).slice(-6)
const TITLE = `验收-客户端 ${MARK}`
const SHOT = '/tmp/mp-accept'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
const ck = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail || '' })
  console.log(`${ok ? '✓' : '✗'} ${name}` + (detail ? `  · ${detail}` : ''))
}
const wait = async (fn, ms, step) => {
  const until = Date.now() + ms
  for (;;) {
    let v
    try { v = await fn() } catch (e) { v = null }
    if (v) return v
    if (Date.now() > until) return null
    await sleep(step || 800)
  }
}
const txt = async (els) => {
  const out = []
  for (const e of els) { try { out.push((await e.text()).trim()) } catch (e2) { out.push('') } }
  return out
}

;(async () => {
  fs.mkdirSync(SHOT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' })
  let noteId = null
  let jwt = ''
  try {
    jwt = (await wait(() => mp.evaluate(() => getApp().globalData.token || ''), 30000)) || ''
    ck('模拟器已登录', jwt.length > 30, `JWT 长度 ${jwt.length}`)
    // 下面这一整套期望值全是中文串。账号停在英文态时会一次红七条（踩过），
    // 所以先量语言、不对就当场停，别让人去查根本不存在的回归。
    const lang = await mp.evaluate(() => getApp().globalData.userInfo?.language || 'zh')
    if (lang !== 'zh') {
      ck('账号语言＝中文', false, `现在是 ${lang}；到新建页标题右边点「中」再跑`)
      console.log('\n语言不是中文，这套脚本的中文期望值没有参考价值，提前结束')
      process.exitCode = 4
      return
    }
    ck('账号语言＝中文', true)
    if (!jwt) throw new Error('没登录，后面全是空跑')
    const H = { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` }

    // 导航条标题挂钩子：记下每一次 setNavigationBarTitle 的实参，同时照常放行
    const hookOk = await mp.evaluate(() => {
      const app = getApp()
      app.__nav = []
      if (app.__navRaw) return 'already'
      app.__navRaw = wx.setNavigationBarTitle
      wx.setNavigationBarTitle = (o) => {
        app.__nav.push(o && o.title)
        return app.__navRaw(o)
      }
      return typeof wx.setNavigationBarTitle === 'function' && wx.setNavigationBarTitle !== app.__navRaw
    })
    const readNav = () => mp.evaluate(() => (getApp().__nav || []).slice(-1)[0] || '')
    const navTitles = () => mp.evaluate(() => (getApp().__nav || []).join(' | '))
    ck('挂钩子成功（能读到导航条标题的实参）', hookOk === true || hookOk === 'already', String(hookOk))

    // 上一轮跑挂了的同类笔记先清掉，别在真库里堆垃圾
    const list0 = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
    for (const n of (list0.items || list0).filter((x) => String(x.title || '').startsWith('验收-客户端'))) {
      await fetch(`${BASE}/api/notes/${n.id}`, { method: 'DELETE', headers: H })
    }
    const cr = await fetch(`${BASE}/api/notes/`, {
      method: 'POST', headers: H,
      body: JSON.stringify({
        title: TITLE,
        summary: '这一条只为验收界面，跑完就删。要点、链接、标签都放满，好把排版每一条都压到。',
        tags: ['验收', '界面'], key_points: ['第一条要点', '第二条要点'],
        key_links: ['https://example.com/accept'], source_url: 'https://example.com/accept',
      }),
    })
    noteId = (await cr.json()).id
    ck('建了一条验收用笔记（跑完删）', cr.status === 200 && !!noteId, `id=${noteId}`)

    // ---------- 新建页：大标题 + 三个入口 + 导航条标题 ----------
    let page = await mp.reLaunch('/pages/create/create')
    await sleep(1800)
    const heading = (await txt(await page.$$('.page-title'))).join('|')
    ck('新建页大标题＝「选择一种记录方式」', heading === '选择一种记录方式', heading)
    const labels = await txt(await page.$$('.entry-label'))
    ck('三个入口＝拍照或截图 / URL链接 / 手写',
      labels.includes('拍照或截图') && labels.includes('URL链接') && labels.includes('手写'), labels.join(' / '))
    ck('导航条标题＝「新建笔记」', (await readNav()) === '新建笔记', await readNav())
    await mp.screenshot({ path: `${SHOT}/c1-新建页.png` })

    // ---------- 卡片模板页 ----------
    page = await mp.reLaunch('/pages/profile/profile')
    await sleep(1800)
    ck('导航条标题＝「卡片模板」', (await readNav()) === '卡片模板', await readNav())
    await mp.screenshot({ path: `${SHOT}/c2-卡片模板页.png` })

    // ---------- 笔记卡片页：导航条 + 模板一排 ----------
    const profile = (await mp.evaluate(() => wx.getStorageSync('poster_profile') || {})) || {}
    page = await mp.reLaunch(`/pages/share/share?id=${noteId}`)
    const picks = await wait(async () => {
      const e = await page.$$('.pick')
      return e && e.length === 10 ? e : null
    }, 90000, 1500)
    ck('模板一排出齐 10 个小图', !!picks, picks ? '10 个' : '90 秒内没等到')
    if (!picks) throw new Error('模板条没出来，后面没法测')
    ck('导航条标题＝「笔记卡片」', (await readNav()) === '笔记卡片', await navTitles())

    const pickLabels = await txt(await page.$$('.pick-label'))
    ck('每个小图下面都有名字', pickLabels.filter(Boolean).length === 10, pickLabels.join('、'))
    // 小图是"画一次定稿"：先把这一排等到长定（每张按各自模板的真实高度），再取样对比
    const pickBoxes = async () => {
      const a = await page.$$('.pick-canvas')
      const out = []
      let sum = 0
      for (const e of a) { const s = await e.size(); const w = parseFloat(s.width); sum += w; out.push(`${Math.round(w)}x${Math.round(parseFloat(s.height))}`) }
      return { key: out.join(' '), sum, n: a.length }
    }
    const settle = async () => {
      let prev = null
      for (let i = 0; i < 30; i++) {
        const cur = await pickBoxes()
        if (prev && cur.key === prev) return cur
        prev = cur.key
        await sleep(2000)
      }
      return null
    }
    const b0 = await settle()
    ck('这一排小图先长定（两轮取样尺寸完全一致）', !!b0, b0 ? b0.key : '20 秒内一直在变')
    const boxes0 = b0 ? b0.key : ''
    void boxes0

    const picked0 = await page.data('picked')
    const expect0 = profile.template || 'card'
    ck('默认选中的＝「卡片模板」里存的那一套', picked0 === expect0, `存的=${expect0}，选中=${picked0}`)
    const strip = await page.$('.tpl-strip')
    const sw = parseFloat((await strip.size()).width)
    ck('这一排要左右滚才看得全（10 张加起来远超可视区）', b0.sum > sw + 20, `可视宽 ${Math.round(sw)}，10 张合计 ${Math.round(b0.sum)}`)
    const first0 = (await (await page.$('.pick')).offset()).left
    await strip.scrollTo(600, 0)
    await sleep(900)
    const first1 = (await (await page.$('.pick')).offset()).left
    const sl = parseFloat(await strip.property('scrollLeft'))
    ck('确实滚得动（滚一下第一张往左挪，后面的滚得进来）',
      (first0 - first1) > 20 && sl > 20, `第一张 left ${Math.round(first0)}→${Math.round(first1)}，scrollLeft=${Math.round(sl)}`)
    await mp.screenshot({ path: `${SHOT}/c3b-滚到右边.png` })
    await strip.scrollTo(0, 0)
    await sleep(900)
    let all = await page.$$('.pick')

    let path0 = await page.data('imagePath')
    ck('上面的海报已经出图', !!path0, String(path0).split('/').pop())

    const IDS = ['card', 'quote', 'block', 'clean', 'popGrid', 'popDots', 'acid', 'cover', 'lit', 'spec']
    for (const target of [expect0 === 'quote' ? 'block' : 'quote', 'clean', 'popGrid']) {
      all = await page.$$('.pick')
      await all[IDS.indexOf(target)].tap()
      await sleep(4500)
      const picked1 = await page.data('picked')
      const path1 = await page.data('imagePath')
      const ons = await page.$$('.pick-on')
      ck(`点「${target}」后选中变了`, picked1 === target, `选中=${picked1}`)
      ck(`换「${target}」后上面那张重画了`, !!path1 && path1 !== path0, `${String(path0).split('/').pop()} → ${String(path1).split('/').pop()}`)
      ck(`换完高亮仍只有一个`, ons.length === 1, `${ons.length} 个`)
      path0 = path1
      await mp.screenshot({ path: `${SHOT}/c3-换成-${target}.png` })
    }

    const boxes1 = await pickBoxes()
    const labels1 = (await txt(await page.$$('.pick-label'))).join('|')
    ck('点小图只换上面那张，下面这一排不动（位置与名字完全一样）',
      boxes1 === boxes0 && labels1 === pickLabels.join('|'),
      boxes1 === boxes0 ? '位置未变' : '位置变了')

    // 「转为笔记卡片」这个按钮在详情页上
    page = await mp.reLaunch(`/pages/detail/detail?id=${noteId}`)
    await sleep(2000)
    const shareBtn = (await txt(await page.$$('.btn-share'))).join('|')
    ck('详情页按钮＝「转为笔记卡片」', shareBtn === '转为笔记卡片', shareBtn || '没找到 .btn-share')
    await mp.screenshot({ path: `${SHOT}/c6-详情页.png` })
  } catch (err) {
    ck('过程未抛异常', false, String((err && err.message) || err))
  } finally {
    if (noteId && jwt) {
      const H = { 'content-type': 'application/json', Authorization: `Bearer ${jwt}` }
      await fetch(`${BASE}/api/shares/revoke`, { method: 'POST', headers: H, body: JSON.stringify({ note_id: noteId }) })
      const d = await fetch(`${BASE}/api/notes/${noteId}`, { method: 'DELETE', headers: H })
      ck('验收笔记已删掉（连带撤掉分享）', d.status === 200 || d.status === 204, `HTTP ${d.status}`)
      const left = await (await fetch(`${BASE}/api/notes/?limit=100`, { headers: H })).json()
      const dirty = (left.items || left).filter((x) => String(x.title || '').startsWith('验收-客户端'))
      ck('现网库里没留下验收垃圾', dirty.length === 0, `剩 ${dirty.length} 条`)
    }
  }
  const bad = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 条，不过 ${bad.length} 条`)
  bad.forEach((b) => console.log('  ✗ ' + b.name + ' · ' + b.detail))
  console.log('截图在 ' + SHOT)
  process.exit(bad.length ? 1 : 0)
})()
