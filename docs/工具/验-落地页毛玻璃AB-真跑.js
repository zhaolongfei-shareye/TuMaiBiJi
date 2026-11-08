// 扫码那一页窗外那层纱：同一屏、同一张底图，拍两张给站长肉眼判"糊没糊"。
// 跑法：SHARE_TOKEN=<一枚活码> AB_TAG=with-veil docs/工具/跑尺子.sh 9431 验-落地页毛玻璃AB-真跑
//
// 为什么单独要有这一把（站长 10-25 12:2x 一句「仍然看不到毛玻璃」）：
// 判据那四条（糊／面／源里那条 -webkit-／层序）读的是**计算值**——它只能证明"这一层带着
// `backdrop-filter: blur(23px) saturate(1.8)`"，证明不了"屏幕上看出来是糊的"。他要的是后者。
// 所以这一把的判据只到"该不该有这一层"为止（纱在不在场、这一屏有没有壁纸、那一态落没落下来），
// "糊没糊"仍旧归那四条计算值判据与站长的眼睛。它干的三件事：① 把纱这一层的计算值与在不在场原样打出来；
// ② 出一张整屏截图；③ 把①里已经看得见的问题递进退出码。
// 两张截图（纱在／纱撤）配成一对，差没差一目了然——撤那一发是把 `.sv-veil` 临时写死
// `display:none` 之后重开一次 IDE 量的，跑完按字节还原（`cmp` 验）。
//
// 10-25 审计 M22 补的一刀：这一把**读数照旧一条不改**，但末尾不许再无条件 `process.exit(0)`。
// 摸不到纱那一层、或这一屏压根没壁纸（纱按壁纸条件走，没壁纸时本来就不画）时说出口时，
// 调用方原先拿到的都是 0——"纱不在场"这句写在屏幕上却进不了退出码，等于把发现吞掉了。
const automator = require('miniprogram-automator')
const fs = require('fs')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TOKEN = String(process.env.SHARE_TOKEN || '').trim()
const TAG = String(process.env.AB_TAG || 'shot').trim()
const OUT = '/tmp/mp-ab'
const RED = []   // 判据红：这一屏该有那层纱而没有
const ENV = []   // 环境红：这一把拿的样本压根量不了（不是产品的错，别当回归查）

;(async () => {
  if (!TOKEN) { console.log('环境红：没给 SHARE_TOKEN'); process.exit(2) }
  fs.mkdirSync(OUT, { recursive: true })
  let mp = null
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  await mp.reLaunch('/pages/share/view?token=' + encodeURIComponent(TOKEN))
  await sleep(5000)
  const page = await mp.currentPage()
  const d = await page.data()
  const veil = await page.$('.sv-veil')
  const bg = await page.$('.sv-bg')
  const read = async (el, prop) => (el ? await el.style(prop) : null)
  console.log(`〔${TAG}〕这一屏：loading=${d.loading} 有 share=${!!d.share} 底图 bgSrc=${d.bgSrc ? '有' : '没有'}`)
  console.log(`〔${TAG}〕壁纸那一层 .sv-bg 在=${!!bg}` +
    (bg ? `｜宽高=${JSON.stringify(await bg.size())}｜src 前 30=${String(d.bgSrc).slice(0, 30)}` : ''))
  console.log(`〔${TAG}〕纱那一层 .sv-veil 在=${!!veil}`)
  if (veil) {
    console.log(`〔${TAG}〕纱的计算值：display=${await read(veil, 'display')}` +
      `｜backdrop-filter=${await read(veil, 'backdrop-filter')}` +
      `｜background=${await read(veil, 'background-color')} ${await read(veil, 'background')}` +
      `｜z-index=${await read(veil, 'z-index')}`)
    const box = await veil.size()
    console.log(`〔${TAG}〕纱铺满=${JSON.stringify(box)}`)
  }
  // 判据三条（读法一条没改，只是把已经打在屏幕上的发现同时记进退出码）：
  const noWallpaper = !d.bgSrc
  if (!d.share || d.loading) ENV.push('这一屏还没落到有 share 的那一态（loading／无 share），两张图配不成一对')
  if (!veil && noWallpaper) ENV.push('这一屏没有壁纸：纱那一层按壁纸条件走、本来就不画 ⇒ 这一把挑的码量不了毛玻璃')
  if (!veil && !noWallpaper) RED.push('有壁纸却摸不到 .sv-veil ⇒ 窗外那层纱不在场')
  const file = `${OUT}/${TAG}.png`
  await mp.screenshot({ path: file })
  console.log(`〔${TAG}〕截图 ${file}（${fs.statSync(file).size} B）`)
  for (const m of RED) console.log(`✗ 判据红：${m}`)
  for (const m of ENV) console.log(`!! 环境红：${m}`)
  process.exit(RED.length ? 1 : ENV.length ? 2 : 0)
})().catch((e) => { console.error('崩：', e && e.message ? e.message : e); process.exit(3) })
