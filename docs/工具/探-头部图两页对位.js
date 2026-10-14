// 头部那张形象图在**列表**与**我的**两屏的纵向对位（站长 10-11 11:2x 回电：「我第二，第三切换时候
// 背景图为什么会上下跳到，下面面板高度不变，为什么背景图会跳动，你是否有其他代码影响」）。
// 他附的两张截图就是这两屏，所以这一把量的就是"同一张照片、同一屏宽，两页的图顶差多少"。
//
// 为什么必须真量：`poster.bandGeom(w, h, boxH)` 里那句 `top = -round((byWidth - boxH) * 0.15)`
// 带着 boxH，而我 10-11 R12 那趟给两页各递了一个 boxH（列表 740／「我的」646）⇒ 同一张照片在两页
// 的锚点差 (740−646)×0.15＝14.1rpx。再叠上两页那条带子自己不等高（列表 `.head` 542 靠 overflow:visible 让图下溢，
// 「我的」`.head-band` 646），读起来就是"面板没动、图跳了"。
// 前置：docs/工具/跑尺子.sh 9431 探-头部图两页对位
const automator = require('miniprogram-automator')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const BG = '/assets/share-card.jpg'   // 同宽（1280）的量具替身，见 §8.231 删图那一刀
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
const fails = []
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name + (detail ? '　→ ' + detail : '')) }
  else { fails.push(name + (detail ? '　→ ' + detail : '')); console.log('  !! ' + name + (detail ? '　→ ' + detail : '')) }
}
function report() {
  console.log(fails.length ? `\n!! 两页对位：${fails.length} 条不过（共 ${pass + fails.length}）` : `\n✓ 两页对位：${pass} 条全过`)
  if (fails.length) process.exitCode = 1
}

async function main() {
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(10000) }
  }
  if (!mp) throw new Error('连不上 9431：先跑 docs/工具/跑尺子.sh 9431 探-头部图两页对位')
  await mp.reLaunch('/pages/create/create')
  await sleep(6000)
  const home = await mp.currentPage()
  await home.setData({ bgSrc: BG })
  await sleep(2000)
  const win = await mp.systemInfo()
  const R = (px) => px / (win.windowWidth / 750)   // 视口 px → rpx（1rpx＝屏宽/750）

  const at = async (url, imgSel, bandSel) => {
    try { await mp.switchTab(url) } catch (e) { await mp.reLaunch(url) }
    await sleep(3600)
    const p = await mp.currentPage()
    const img = await p.$(imgSel)
    if (!img) throw new Error(`${url} 上摸不到 ${imgSel}（这一屏没铺图？还是类名改了？）`)
    const o = await img.offset()
    const s = await img.size()
    const band = await p.$(bandSel)
    const bo = band ? await band.offset() : null
    const bs = band ? await band.size() : null
    return {
      path: p.path,
      topR: R(o.top), heightR: R(s.height), widthR: R(s.width), leftR: R(o.left),
      bandTopR: bo ? R(bo.top) : null, bandH: bs ? R(bs.height) : null,
    }
  }

  const A = await at('/pages/index/index', '.head-img', '.head')
  const B = await at('/pages/me/me', '.head-img', '.head-band')

  console.log(`  读数（rpx）　列表：图 top ${A.topR.toFixed(1)}／高 ${A.heightR.toFixed(0)}／带宽 ${A.widthR.toFixed(0)}｜带 ${A.bandTopR === null ? '—' : A.bandTopR.toFixed(1)} 高 ${(A.bandH || 0).toFixed(0)}`)
  console.log(`　　　　　　　　我的：图 top ${B.topR.toFixed(1)}／高 ${B.heightR.toFixed(0)}／带宽 ${B.widthR.toFixed(0)}｜带 ${B.bandTopR === null ? '—' : B.bandTopR.toFixed(1)} 高 ${(B.bandH || 0).toFixed(0)}`)

  ok('两页都真铺上了同一张图（图高＝750 按宽铺满，两页一致 ⇒ 下面那两条才不是在比两张图）',
    Math.abs(A.heightR - B.heightR) < 1.5 && Math.abs(A.widthR - 750) < 1.5,
    `列表高 ${A.heightR.toFixed(1)}／我的高 ${B.heightR.toFixed(1)}`)
  /** 判据：照片的**落点**两页必须一致。带子等高不等高是他的版式（列表 542 靠下溢、我的 646），
   *  不归这一格管；这一格只管"同一张照片别因为页面不同而上下挪"。 */
  ok('同一张照片在两页的图顶位置一致（差 ≤1rpx＝上下不跳）',
    Math.abs(A.topR - B.topR) <= 1,
    `列表 ${A.topR.toFixed(1)}／我的 ${B.topR.toFixed(1)}／差 ${Math.abs(A.topR - B.topR).toFixed(1)}rpx ≈ ${(Math.abs(A.topR - B.topR) * win.windowWidth / 750).toFixed(1)} 视口px`)
  await mp.close()
}

main().catch((e) => { console.log('!! 尺子挂了 ' + e.message); process.exitCode = 1 }).finally(report)
