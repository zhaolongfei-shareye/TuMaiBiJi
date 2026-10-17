// 看大图退回来那一趟，不许把详情窗收掉（站长 10-17 23:5x「那条 BUG（点大图再点退回列表）没修」；
// 他的原话是 10-17 白天那句「有BUG，在笔记点某个配图，看到大图，再点会退出笔记详情页」）。
// 跑法：docs/工具/跑尺子.sh 9431 验-看大图退回来不收窗-真跑
//
// 根因（先写下，免得下一轮又去查一遍"点击穿透"）：`wx.previewImage` 开在**新页面**里
// （官方文档那句「在新页面中全屏预览图片」），关掉大图＝切回这一屏 ⇒ `onShow` 补发一次
// ——与 create.js:245 记的「从相机或相册返回时小程序会补发一次 onShow」同一条平台行为。
// 而 onShow 里有一句 `_closeFloats()`（它本来是给"切走再回来要回到列表"准备的），
// 窗就是被这一句收掉的：人从大图退回来看到的是列表。
//
// 这一把验的是**屏上**的事，源码里有那三行不等于它真挡住了：
// ① 走真口 `onPreviewDetailImage`（不是自己 setData 造一窗），看大图这一步真的发生；
// ② 然后切到「我的」再切回来＝平台自己发的那一趟 onShow，窗全程没收过——**逐半秒采，闪过一下也算红**
//    （"收掉再按 id 重开"那种写法能骗过末尾读数，骗不过中间那几格；而且它会重拉全文与配图）；
// ③ 窗里那份内容还是**这一篇**（列表在下面重排过，按号开窗的那条路才会指错人）；
// ④ 反证：同一个切回来的动作，前面没有"看大图"就照旧收窗
//    ⇒ 挡住的只有这一种入口，onShow 整条没被改哑，那一格也没漏到下一次。
//
// ⚠ 红怎么读：②红＋④绿＝模拟器把 previewImage 的 onShow 提前发掉了（那一格被提前消费），
//    这一把的量法要换；②红＋④红＝闸压根没生效，是实现红。①那一格只是诊断，不参与判红。
//
// ⚠ 配图只用服务端真读回来的地址。这一把必须让 previewImage 真开得起来，所以**不许拿替身地址糊**：
//    前三篇都没配图就报红收工，换一台带配图的账号再跑。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const SRC = path.join(ROOT, 'miniprogram/pages/index/index.js')
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(fs.readFileSync(path.join(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  let page = null
  try {
    /* ---------- 〇、连的是不是这一条线、这一号的包 ---------- */
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    const shown = (await meP.data()).version
    ck('IDE 里开的是这一条线（「我的」那格＝源码那格）', String(shown) === SRC_VERSION,
      `屏上 v${shown}／源码 v${SRC_VERSION}`)

    page = await mp.reLaunch('/pages/index/index')
    await sleep(2500)
    const d0 = await page.data()
    const all = d0.notes || []
    const cands = []
    for (let i = 0; i < all.length && cands.length < 3; i += 1) {
      if (all[i] && !all[i].is_private) cands.push(i)
    }
    ck('列表里有可开的非私密笔记（私密那一态归私密那批尺子）', cands.length > 0, `${all.length} 篇，取前 ${cands.length} 篇试`)
    if (!cands.length) throw new Error('一篇可开的都没有，后面量不了')

    /* ---------- 一、找一篇真带配图的（这一把不许拿替身地址） ---------- */
    let pick = -1, d = null
    for (const i of cands) {
      await page.callMethod('_openDetail', i)
      await sleep(2600)
      const dd = await page.data()
      if (dd.detailOpen && (dd.detailImages || []).length > 0) { pick = i; d = dd; break }
      await page.callMethod('onCloseDetail')
      await sleep(500)
    }
    if (pick < 0) throw new Error(`前 ${cands.length} 篇都没有配图——这一把要 previewImage 真开得起来，不拿替身糊，换一台带配图的账号再跑`)
    const id = d.detailNote.id
    const N = d.detailImages.length
    const FIG = d.detailImages[0].cloud_url
    console.log(`  这一篇：id=${id}｜标题「${(d.detailNote.title || '').slice(0, 18)}」｜配图 ${N} 张（服务端读回来的）`)
    ck('窗是开着的（下面每一步都从这一态出发）', d.detailOpen === true)

    /* ---------- 二、走真口看大图，再走一遍平台自己的"切回来" ---------- */
    // 这里**不用** `callMethod('onShow')` 手动点生命周期：切 tab 出去再回来是平台自己发的同一趟 onShow，
    // 比手动调用真。第三节用同一个动作做反证——两次切回来，唯一差别就是前面有没有那次"看大图"。
    const poll = async (ms) => {
      const seen = []
      for (let t = 0; t < ms; t += 500) { seen.push(!!(await page.data()).detailOpen); await sleep(500) }
      return seen
    }
    await page.callMethod('onPreviewDetailImage', { currentTarget: { dataset: { url: FIG } } })
    await sleep(800)
    const afterShot = await page.data()
    // 这一格是诊断用：模拟器里 previewImage 若当场就补发了一趟 onShow，窗在这一刻就已经被走过一次
    ck('点下"看大图"之后窗没被收（模拟器若当场补发 onShow，这一格就能看见）',
      afterShot.detailOpen === true, `detailOpen=${afterShot.detailOpen}`)

    await mp.switchTab('/pages/me/me')
    await sleep(1500)
    await mp.switchTab('/pages/index/index')
    const samples = await poll(5000)
    const back = await page.data()
    ck('看大图退回来那一趟 onShow：全程没收过窗（闪过一下也算红）',
      samples.length > 0 && samples.every(Boolean),
      `${samples.length} 次采样｜末尾 ${back.detailOpen}`)
    ck('而且窗里还是**这一篇**（列表在下面重排过，按号开窗那条路才会指错人）',
      back.detailOpen === true && back.detailNote && back.detailNote.id === id,
      `回来这一份 id=${back.detailNote && back.detailNote.id}｜原来是 ${id}`)
    const h2 = await page.$('.ds-h2')
    ck('屏上那行标题也是这一篇的（不是只有 data 里对上了）', !!h2 && (await h2.text()) === (d.detailNote.title || ''),
      h2 ? (await h2.text()).slice(0, 20) : '屏上没有 .ds-h2')
    ck('配图那一排没被重拉（"收掉再按 id 重开"那种写法会在这里露出来：图重新转一圈）',
      (back.detailImages || []).length === N, `${(back.detailImages || []).length} 张／原来 ${N} 张`)

    /* ---------- 三、反证：同一个动作，前面没有"看大图"就该收窗 ---------- */
    await mp.switchTab('/pages/me/me')
    await sleep(1500)
    await mp.switchTab('/pages/index/index')
    await sleep(2600)
    const d3 = await page.data()
    ck('反证：切走再回来那一趟照旧收窗（"切回这一屏回列表"那条没被我的闸放掉，格子也没漏到下一次）',
      d3.detailOpen === false, `detailOpen=${d3.detailOpen}`)

    // 源码那两条边角：开不成时当场撤格子（否则下一次真切走会被这一格顶住）、其余入口没被顺手放过。
    // 只数行末那一句 `this._closeFloats()`——注释里与定义处都拿行首行末挡掉，不数进来。
    const src = fs.readFileSync(SRC, 'utf8')
    ck('开不成时当场撤掉那一格（没有"切回来"那一趟，格子不能留着）',
      /fail:\s*\(\)\s*=>\s*\{\s*this\._shotFromDetail\s*=\s*0\s*\}/.test(src))
    const calls = src.match(/^\s*(?:if \([^\n]*\) )?this\._closeFloats\(\)$/gm) || []
    const guarded = calls.filter((x) => /fromShot/.test(x))
    ck('挡住的只有 onShow 那一处，其余四条重排整表的入口一个没被放过',
      calls.length === 5 && guarded.length === 1, `${calls.length} 处调用｜带闸 ${guarded.length} 处`)

    console.log(bad.length ? `\n✗ ${bad.length} 条红：\n  · ${bad.join('\n  · ')}` : '\n✓ 全绿')
  } catch (e) {
    console.error('✗ 跑挂了：', e && (e.stack || e.message || e))
    bad.push('异常')
  } finally {
    try { if (page) await page.callMethod('onCloseDetail') } catch (err) { void err }
    mp.close && mp.close()
    process.exit(bad.length ? 1 : 0)
  }
}).catch((e) => { console.error('✗ 连不上 9431（连接红，不是判据红）：', e.message); process.exit(1) })
