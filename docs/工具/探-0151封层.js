// 一次性探针（不是判据）：只验一件事——`.sheet-seal` 那枚真实封层有没有画上、
// 名片行最下那一行的照片凸起有没有被抹平（#151 第三版）。
// 前两版画在伪元素上，复量截图证明压根没落屏 ⇒ 这一把要同时读三样：
// ① `.sheet-seal` 自己的帧（画不上就是 0×0 或直接查不到）；
// ② 截图（线的归属只能从像素判，帧判不了"谁压在谁上面"）；
// ③ 定义在 me.wxss **后半段**的一条规则（`.sheet-slogan`）的计算色——
//    用来排掉另一种可能：整份 wxss 从我那条规则之后就没编译进去（那是另一个病，得另治）。
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi docs/工具/跑尺子.sh 9431 探-0151封层
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const DIR = path.join(ROOT, 'docs/design/10-15首屏六件')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(8000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(1) }
  await sleep(5000)
  await mp.switchTab('/pages/me/me')
  await sleep(4500)
  const page = await mp.currentPage()
  const seal = await page.$('.sheet-seal')
  if (!seal) {
    console.log('!! .sheet-seal 查不到＝标记没进包（wxml 没编进去？）')
  } else {
    const o = await seal.offset(); const s = await seal.size()
    console.log('.sheet-seal 帧：', JSON.stringify({ top: o.top, left: o.left, w: s.width, h: s.height }))
    console.log('.sheet-seal 皮：', JSON.stringify({
      bg: String((await seal.style('background-color'))),
      pos: String((await seal.style('position'))),
      bottom: String((await seal.style('bottom'))),
    }))
  }
  const slogan = await page.$('.sheet-slogan')
  console.log('.sheet-slogan 计算色（查后半段规则有没有编进去）：',
    slogan ? String((await slogan.style('color'))) : '(查不到)')
  const sheet = await page.$('.sheet')
  console.log('.sheet 帧：', JSON.stringify(await (async () => {
    const o = await sheet.offset(); const s = await sheet.size(); return { top: o.top, h: s.height }
  })()))
  await mp.screenshot({ path: path.join(DIR, '探针-0151封层-me.png') })
  await mp.close()
  console.log('探针完')
}
main().catch((e) => { console.log('!! 探针挂了：' + String((e && e.message) || e)); process.exit(1) })
