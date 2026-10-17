// 首页那枚「换背景」就地拉起「卡片上的信息」这一层，勾「背景」那枚芯片当场把首页这张图换掉。
// 跑法：docs/工具/跑尺子.sh 9431 验-首页换背景拉起这一层-真跑
//
// 他的原话（10-18 01:1x）：「然后首页换背景，也要拉起这个弹窗，不需要跳到设置里面换。这个改了吗？」
// 再往前一句（10-18 00:1x）：「这里不能突然压暗，要保存亮度，背景要变成毛玻璃。」
// ⇒ 这一把一次量两件：① 入口不再跳页、拉起来的确实是同一层；② 这一层的遮罩在屏上不压暗、挂着糊
//    （上一轮那两条屏上读数寄在 验-详情浮窗两层-真跑 里，那一把一进门钉的 `.xrow` 在 2.3.0 列表合一
//     之后就没了、跑不到那两条，所以这里自己量一遍，不拿"源码写了"当"屏上画对了"）。
//
// ⚠ 判红怎么读：
//   「点它之后仍在首页这一屏」红＝还在跳设置那一页（入口没换）；
//   「遮罩底色是透明」红＝那层被改回暗底；「挂着 blur」红＝糊没跟上（`-webkit-` 那条成不成对由
//   验-玻璃令牌齐不齐 钉）；
//   「屏上那张背景真的换了」红＝只写了 data、节点没跟上（读的是 <image> 的 src，不是 data）；
//   「只剩一枚亮着」红＝「背景」成了多选，两张争同一个位。
//
// ⚠ 这一把动的是本机那四个槽（勾一次就是真改），收尾照原样还回去；它不碰现网、不写服务端。
//   有图的格子不足两枚时"单选"与"换图"两条没法成立 ⇒ 大声报"量不了"退 3，不静默跳。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/工具/实测/首页换背景')
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(
  fs.readFileSync(path.join(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]
fs.mkdirSync(OUT, { recursive: true })

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const tail = (s) => String(s === undefined || s === null ? '' : s).slice(-26)
// `.ci-bg` 只画在有图那几格 ⇒ DOM 里的第 k 枚＝第 k 个有图的槽。这一条换算只写在这一个出处。
const orderOf = (slots, idx) => slots.slice(0, idx + 1).filter((s) => s && s.path).length - 1

/* 「已经有图」的现场自己造：chooseMedia 在模拟器里弹的是工具自己的面板，不在页面树里，点不动
   （同 验-详情浮窗两层-真跑 那把的处理，方法照抄它）。往 USER_DATA_PATH 写两张 1×1 真 JPEG、
   把槽摆进 storage，跑完连文件带 storage 一并原样还回去。
   ⚠ 这一把证的是**通路**（勾那枚芯片 → bgSrc → <image> 节点跟上），不是那张图好不好看；
      样本是 1×1 的占位张，屏上必然是一坨纯色，别拿这张截图去判视觉。 */
const JPG_1PX = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='
const seedCi = (mp, roles) => mp.evaluate((list, b64) => {
  const fsx = wx.getFileSystemManager()
  const ud = wx.env.USER_DATA_PATH
  const paths = list.map((r, i) => (r ? `${ud}/ci-home-bg-ruler-${i}.jpg` : null))
  paths.forEach((p) => { if (p) { try { fsx.writeFileSync(p, b64, 'base64') } catch (e) { /* 已存在就沿用 */ } } })
  const miss = paths.filter((p) => { if (!p) return false; try { fsx.accessSync(p); return false } catch (e) { return true } })
  if (miss.length) return { fatal: `这几张没造出来：${miss.join(',')}` }
  const before = wx.getStorageSync('poster_profile') || {}
  const prof = JSON.parse(JSON.stringify(before))
  prof.images = list.map((r, i) => (r ? { path: paths[i], card: !!r.card, bg: !!r.bg } : null))
  prof.avatarPath = ''
  wx.setStorageSync('poster_profile', prof)
  return { ok: true, before, paths }
}, roles, JPG_1PX)
const restoreCi = (mp, before, paths) => mp.evaluate((p, ps) => {
  wx.setStorageSync('poster_profile', p)
  const fsx = wx.getFileSystemManager()
  ps.forEach((f) => { if (f) { try { fsx.unlinkSync(f) } catch (e) { /* 本来就没有 */ } } })
  return true
}, before, paths)

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  let page = null
  let bgBefore = ''
  let seeded = null
  try {
    /* ---------- 〇、连的是不是这一条线、这一号的包 ---------- */
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    const shown = (await meP.data()).version
    ck('IDE 里开的是这一条线（「我的」那格＝源码那格）', String(shown) === SRC_VERSION,
      `屏上 v${shown}／源码 v${SRC_VERSION}`)

    /* 一、先造"已经有两格图"的现场：第 1 枚既当头像又当背景，第 3 枚两个角色都不占。
       不足两格就没法量"换图"与"单选"，所以这一步在任何断言之前。 */
    seeded = await seedCi(mp, [{ card: true, bg: true }, null, {}, null])
    if (!seeded || !seeded.ok) throw new Error(`造现场失败：${(seeded && seeded.fatal) || '没回话'}`)
    ck('现场造好了（两格有图、其中一格正当背景）', true,
      await mp.evaluate(() => {
        const p = wx.getStorageSync('poster_profile') || {}
        return `${(p.images || []).filter((s) => s && s.path).length} 格有图`
      }))

    page = await mp.switchTab('/pages/create/create')
    await sleep(2500)
    const d0 = await page.data()
    bgBefore = d0.bgSrc || ''
    ck('进这一屏时这一层是关着的（不许是上一把留下的残态）',
      d0.cardInfoOpen === false && !(await page.$('.ci-mask')), `cardInfoOpen=${d0.cardInfoOpen}`)

    /* ---------- 一、点「换背景」＝拉起这一层，且人没离开这一屏 ---------- */
    const swap = await page.$('.swap-wallpaper')
    ck('「换背景」那一枚在屏上', !!swap)
    if (!swap) throw new Error('入口都没了，后面量不了')
    await swap.tap()
    await sleep(900)
    const route = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
    ck('点它之后仍在首页这一屏（没有跳到「我的→卡片模板」那一页）',
      route === 'pages/create/create', `屏上是 ${route}`)
    const d1 = await page.data()
    const mask1 = await page.$('.ci-mask')
    ck('这一层真的起来了（cardInfoOpen 翻真、遮罩节点在树上）',
      d1.cardInfoOpen === true && !!mask1, `cardInfoOpen=${d1.cardInfoOpen} 遮罩=${!!mask1}`)
    const titleEl = await page.$('.ci-title')
    const titleWant = await mp.evaluate(() => getCurrentPages().slice(-1)[0].data.t.cardInfo)
    const titleShown = titleEl ? await titleEl.text() : '没这枚'
    ck('拉起来这一层顶上念的是「图片设置」（他 10-18 改的名；同一层，不是另画一张卡）',
      !!titleEl && titleShown === titleWant && titleShown === '图片设置',
      `屏上「${titleShown}」／字典「${titleWant}」`)

    /* ---------- 二、遮罩不压暗、挂着糊 ---------- */
    const maskBg = await mask1.style('background-color')
    const maskFilter = await mask1.style('backdrop-filter')
    ck('这一层的遮罩在屏上不压暗：算出来的底色是透明（透明层不可能把屏压暗）',
      /rgba\(0, 0, 0, 0\)|transparent/.test(String(maskBg)), `屏上 ${maskBg}`)
    ck('这一层的遮罩挂着糊（他那句「背景要变成毛玻璃」）：backdrop-filter 里有 blur',
      /blur\(/.test(String(maskFilter)), `屏上 ${maskFilter}`)

    /* ---------- 三、两枚角色芯片：「背景」只画在有图那几格，「头像」四格都画（空格那枚点不动） ---------- */
    const d2 = await page.data()
    const slots = d2.ciSlots || []
    const filled = slots.map((s, i) => (s && s.path ? i : -1)).filter((i) => i >= 0)
    const caps = await page.$$('.ci-cap')
    const bgs = await page.$$('.ci-bg')
    if (filled.length < 2) throw new Error(`有图的格子只有 ${filled.length} 枚，"换图"与"单选"两条量不了`)
    ck('下面那一排两枚芯片都在：「头像」四格一律画，「背景」枚数＝有图那一格数',
      caps.length === 4 && bgs.length === filled.length && filled.length >= 2,
      `头像 ${caps.length} 枚／背景 ${bgs.length} 枚／有图 ${filled.length} 格`)
    // 次序不靠读 markup 顺序自证，量屏上两枚的顶边：他那句话先念「背景」再念「头像」。
    // ⚠ automator 的 Element 上没有 boundingClientRect（只有 size/offset），要拿矩形就走
    //    页面自己的 selectorQuery——这一条在这一把里只写在这一个出处。
    const tops = await mp.evaluate(() => new Promise((resolve) => {
      const q = wx.createSelectorQuery()
      q.selectAll('.ci-bg').boundingClientRect()
      q.selectAll('.ci-cap').boundingClientRect()
      q.exec((r) => resolve({
        bg: r[0] && r[0][0] ? Math.round(r[0][0].top) : null,
        cap: r[1] && r[1][0] ? Math.round(r[1][0].top) : null,
      }))
    }))
    ck('次序照他那句话：「背景」在上、「头像」在下（量两枚的顶边，不是读源码先后）',
      tops.bg !== null && tops.cap !== null && tops.bg < tops.cap,
      `背景顶 ${tops.bg}／头像顶 ${tops.cap}`)
    // 芯片那一枚有两种画法：**选中＝画勾（里面没有字）**，没选中＝写这个角色的名字。
    // 所以"枚数"要拿勾加字一起数，只数 text 会漏掉正当选的那格（第一版就是这么红的）。
    // 字又挂在 `<text>` 子节点上：对 view 调 text() 读回空串 ⇒ 这里 selectAll 到子节点再读。
    // ⚠ 别改成 selectorQuery 的 `.fields({ text: true })`：官方 fields 里没有 text 这一项，
    //    那一趟直接把 automator 这条连接挂死（本轮实测：timeout waiting for automator response）。
    //    走 automator 自己的元素句柄：page.$$ 拿到 `<text>` 子节点再逐个 text()。
    const texts = { bg: [], cap: [] }
    for (const e of await page.$$('.ci-bg text')) texts.bg.push(String(await e.text()).replace(/\s/g, ''))
    for (const e of await page.$$('.ci-cap text')) texts.cap.push(String(await e.text()).replace(/\s/g, ''))
    const bgTick = (await page.$$('.ci-bg .ci-tick')).length
    const capTick = (await page.$$('.ci-cap .ci-tick')).length
    ck('两枚芯片上屏的字就是「背景」与「头像」（原来那枚叫「卡片」，这次换的字）',
      texts.bg.every((t) => t === '背景') && bgTick + texts.bg.length === filled.length
      && texts.cap.every((t) => t === '头像' || /^位置\d$/.test(t))
      && capTick + texts.cap.length === 4
      && texts.cap.filter((t) => t === '头像').length === filled.length - capTick,
      `背景：勾 ${bgTick}＋字「${texts.bg.join('、')}」｜头像：勾 ${capTick}＋字「${texts.cap.join('、')}」`)

    /* ---------- 四、勾一枚「背景」→ 首页这张图当场换 ---------- */
    const takeIdx = filled.find((i) => !slots[i].bg)
    const cardsOn = (await page.$$('.ci-cap.role')).length
    if (takeIdx === undefined) throw new Error('每一枚有图的格都正当着背景，找不到下手的空缺')
    const want = slots[takeIdx].path
    await bgs[orderOf(slots, takeIdx)].tap()
    await sleep(1400)
    const d3 = await page.data()
    ck(`勾第 ${takeIdx + 1} 枚「背景」之后，data 里 bgSrc 当场换成那张（不跳页、没等 onShow）`,
      d3.bgSrc === want, `bgSrc=${tail(d3.bgSrc)}／该 ${tail(want)}`)
    const bgImg = await page.$('.page-bg')
    const srcShown = bgImg ? await bgImg.attribute('src') : null
    ck('而且屏上那张背景真的换了（读的是 <image> 节点的 src，不是只看 data）',
      String(srcShown) === String(want), `屏上 ${tail(srcShown)}`)
    const roleNow = await page.$$('.ci-bg.role')
    ck('「背景」是单选：换过去之后屏上只剩这一枚亮着，别的格那枚自己灭',
      roleNow.length === 1, `亮着 ${roleNow.length} 枚`)
    ck('换背景只管背景这一件事：「头像」那一枚的勾一个没动',
      (await page.$$('.ci-cap.role')).length === cardsOn,
      `头像勾 ${cardsOn} → ${(await page.$$('.ci-cap.role')).length}`)
    await mp.screenshot({ path: path.join(OUT, '01-勾背景之后这一屏.png') })

    /* ---------- 五、再点已亮那枚＝取消，不自动挪给别人 ---------- */
    const slots3 = d3.ciSlots || []
    await (await page.$$('.ci-bg'))[orderOf(slots3, takeIdx)].tap()
    await sleep(1000)
    const d4 = await page.data()
    const roleOff = (await page.$$('.ci-bg.role')).length
    ck('再点已亮着那枚就是取消：屏上一枚「背景」都不亮（09-30 拍板"不挪"）',
      roleOff === 0, `亮着 ${roleOff} 枚`)
    ck('取消之后首页这张图不再是用过的那张（bgSrc 退回兜底那一支）',
      d4.bgSrc !== want, `bgSrc=${tail(d4.bgSrc) || '空'}`)
    // 还原统一交给收尾那一段（写回 storage 原样＋删临时文件），这里不再多次点芯片：
    // 多点一下就是多一处"读数依赖点击次数"的脆弱点。

    /* ---------- 六、「取消」收窗，人还在这一屏 ---------- */
    const ghost = (await page.$$('.ci-btn.ghost'))[0]
    await ghost.tap()
    await sleep(900)
    const d5 = await page.data()
    const route2 = await mp.evaluate(() => getCurrentPages().slice(-1)[0].route)
    ck('点「取消」这一层收掉、屏仍是首页这一屏（他那句「保存，或取消后，变正常」）',
      d5.cardInfoOpen === false && !(await page.$('.ci-mask')) && route2 === 'pages/create/create',
      `cardInfoOpen=${d5.cardInfoOpen} 屏上 ${route2}`)
  } catch (err) {
    console.log('脚本停了：' + (err && err.message ? err.message : err))
    if (String(err && err.message || '').indexOf('量不了') >= 0) {
      console.log('（环境不足，不参与判红）')
      console.log(`\n${bad.length === 0 ? '没法量' : `红 ${bad.length} 条`}`)
      process.exit(bad.length ? 1 : 3)
    }
    bad.push('脚本没跑完')
  } finally {
    // 把 storage 与那两张临时文件原样还回去：这一把动的是本机画像（四个槽），不该留给下一把尺子。
    // 还完再进一次这一屏，让屏上那张背景也跟着回到进这一把之前的样子。
    try {
      if (seeded && seeded.ok) await restoreCi(mp, seeded.before, seeded.paths)
      const p = page || await mp.currentPage()
      await p.setData({ cardInfoOpen: false })
      await mp.switchTab('/pages/create/create')
      await sleep(900)
      const after = await (await mp.currentPage()).data()
      console.log(`还原：storage 已写回 ${(seeded && seeded.ok) ? '是' : '否（没造现场，本来就没动）'}｜`
        + `屏上 bgSrc 尾部 ${String(after.bgSrc || '').slice(-18) || '空'}｜有图 ${(after.ciSlots || []).filter((s) => s && s.path).length} 格`)
    } catch (e) { /* 还原失败只影响下一次读数，不影响这一把判红 */ }
  }
  console.log(`\n${bad.length === 0 ? '真跑全过' : `红 ${bad.length} 条`}`)
  bad.forEach((n) => console.log('  ✗ ' + n))
  process.exit(bad.length ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(2) })
