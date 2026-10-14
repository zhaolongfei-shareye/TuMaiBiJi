// 黑底探针：站长 10-11 11:0x 那句「……否则现在如果背景深色的话，毛玻璃就会很暗，13，12 等数字完全看不清」的**量法**。
// 为什么必须真铺一张黑图去量，而不是拿公式算：这些面底下是 `backdrop-filter`，
// 合成结果对不对只有渲染出来的像素说话（同一屏的默认那张照片是中偏暗，量不出最坏情况）。
//
// ⚠ 2.2 B 方案把这一屏的极性整个换了，所以判据跟着换，**问题没换**：
//   10-11 那版是"墨色数字压在白 .50 玻璃上"，他怕的是黑照片把白面压暗到墨字归零；
//   2.2 这版首屏的字全在恒深的面上（墨面 `.blk-count` 与那层 `.stage-panel`），字是纸白——
//   黑照片穿不穿得过这层面板，问的是**纸白字还读不读得清**，以及块里那两片皮还分不分得开。
//   两档线都不是我立的：正文/标签按 WCAG 4.5，"两面分得开"按非文字图形那条 3.0（静态那把 `验-第一屏三块.js` §3 同一套）。
// 前置：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi-2.2 docs/工具/跑尺子.sh 9431 探-黑底穿不穿
// ⚠ 探针图是**临时**写进 miniprogram/assets 的（跑完必删，见 finally）；它不进包、不提交。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/design/10-12-2.2全量效果图/实测-黑底探针')
const FIXTURE = path.join(ROOT, 'miniprogram/assets/__探针-黑.png')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
const fails = []
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log('  ✓ ' + name + (detail ? '　→ ' + detail : '')) }
  else { fails.push(name + (detail ? '　→ ' + detail : '')); console.log('  !! ' + name + (detail ? '　→ ' + detail : '')) }
}
function report() {
  console.log(fails.length ? `\n!! 黑底探针：${fails.length} 条不过（共 ${pass + fails.length}）` : `\n✓ 黑底探针：${pass} 条全过`)
  if (fails.length) process.exitCode = 1
}
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }
// 这一屏那三行字的颜色从 app.wxss 现读（`--btn-ink`＝纸白），不抄第二份真相。
const PAPER_HEX = /--btn-ink:\s*#([\dA-Fa-f]{6})/.exec(fs.readFileSync(path.join(ROOT, 'miniprogram/app.wxss'), 'utf8'))[1]
const PAPER = [0, 2, 4].map((i) => parseInt(PAPER_HEX.slice(i, i + 2), 16))

async function main() {
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(10000) }
  }
  if (!mp) throw new Error('连不上 9431：先跑 docs/工具/跑尺子.sh 9431 探-黑底穿不穿')
  fs.mkdirSync(OUT, { recursive: true })
  try {
    // 1. 临时铺一张纯黑进 assets（跑完在 finally 删）
    execFileSync('python3', ['-c', `
from PIL import Image
Image.new('RGB', (433, 866), (0, 0, 0)).save(${JSON.stringify(FIXTURE)})
`])
    ok('探针图落进 assets（临时件）', fs.existsSync(FIXTURE), `${fs.statSync(FIXTURE).size} B`)

    await mp.reLaunch('/pages/create/create')
    await sleep(6000)
    const page = await mp.currentPage()
    // automator 的 Element 只有 offset()／size()，**没有 boundingClientRect**（写了就是当场崩）
    const geo = async (sel) => {
      const node = await page.$(sel)
      const o = await node.offset()
      const s = await node.size()
      return { left: o.left, top: o.top, width: s.width, height: s.height }
    }
    const [face, band, colBox, panelBox] = [await geo('.blk-face'), await geo('.blk-count'),
      await geo('.blk-col'), await geo('.stage-panel')]

    // 2. 铺黑图，截整屏
    await page.setData({ bgSrc: '/assets/__探针-黑.png' })
    await sleep(3000)
    const src = String(((await page.data()) || {}).bgSrc || '')
    ok('这一屏真的铺上了那张纯黑（没铺上，下面四条全是在量默认那张）', /__探针/.test(src), src || '(空)')
    const shot = path.join(OUT, '黑底探针.png')
    await mp.screenshot({ path: shot })

    // 3. 视口 px → 整屏截图那套坐标（这两套坐标不换算就是上一批废图的根因）
    const win = await mp.systemInfo()
    const scale = (await execFileSync('python3', ['-c', `
from PIL import Image
im = Image.open(${JSON.stringify(shot)})
print(im.size[0], im.size[1])
`], { encoding: 'utf8' })).trim().split(' ').map(Number)
    const s = scale[0] / win.windowWidth
    // 截图是**整屏**（含状态栏与导航条），boundingClientRect 是**视口**——不换算就是上一批废图那个坑
    const chrome = scale[1] / s - win.windowHeight
    const px = (r) => [r[0] * s, (r[1] + chrome) * s, r[2] * s, (r[3] + chrome) * s]
    const boxOf = (g, fx1, fy1, fx2, fy2) => px([g.left + g.width * fx1, g.top + g.height * fy1,
      g.left + g.width * fx2, g.top + g.height * fy2])

    // 4. 各片中位色（都取"这一片上没有字、没有插画、没有图标"的那一条）
    //    对比度不在这里算：这一把已经有 lin/lum/cr 三个函数（上面 28~30 行），
    //    python 里再写一份就是两份真相——10-11 那版就是这么两份一起漂的。
    const 读数 = execFileSync('python3', ['-c', `
from PIL import Image
import json, sys
im = Image.open(${JSON.stringify(shot)}).convert('RGB')
def med(box):
    px = list(im.crop(tuple(int(v) for v in box)).getdata())
    return tuple(round(sorted(p[i] for p in px)[len(px)//2]) for i in range(3))
boxes=json.loads(sys.argv[1])
print(json.dumps([[n, list(med(b))] for n, b in boxes]))
`, JSON.stringify([
      // 探针图本体：面板**以上**那一段（这一层不吃 bgSrc，黑图只能在这条线以上直接露出来）
      ['照片区（面板以上，探针图本身）', px([win.windowWidth * 0.2, panelBox.top * 0.4,
        win.windowWidth * 0.8, panelBox.top * 0.6])],
      ['白面（块里上那片）', boxOf(face, 0.78, 0.08, 0.94, 0.5)],
      ['墨面（数字那一片）', boxOf(band, 0.005, 0.12, 0.055, 0.88)],
      ['右列面板（➕ 左边那一段空白）', boxOf(colBox, 0.02, 0.62, 0.28, 0.85)],
    ])], { encoding: 'utf8' }).trim()
    const rows = JSON.parse(读数)
    const M = Object.fromEntries(rows.map(([n, p]) => [n, p]))
    const 照片 = M['照片区（面板以上，探针图本身）']
    ok('那张纯黑**真的画到屏上了**（照片区不是黑的＝下面几条全在量默认那张，探针白跑）',
      Math.max(...照片) <= 24, `照片区 rgb(${照片.join(',')})`)
    // 字的那三行（数字／分类名／Tips）全是纸白，底是恒深的墨面与面板 ⇒ 问的是纸白还剩多少对比。
    for (const n of ['墨面（数字那一片）', '右列面板（➕ 左边那一段空白）']) {
      const c = cr(PAPER, M[n])
      ok(`${n}：压在**纯黑照片**上，纸白 #${PAPER_HEX} 那几行字仍然够读（WCAG 正文 4.5）`,
        c >= 4.5, `面 rgb(${M[n].join(',')})｜对比 ${c.toFixed(2)}`)
    }
    // "两片皮还分不分得开"与"白面还是不是浅的那一面"：同一个非文字图形那档 3.0，两档线都不是我立的。
    const 两面 = cr(M['白面（块里上那片）'], M['墨面（数字那一片）'])
    ok('白面与墨面在黑底上仍然分得开（一块之内两片皮糊成一片就是"看不出这是两个区"）',
      两面 >= 3, `白面 rgb(${M['白面（块里上那片）'].join(',')}) vs 墨面 rgb(${M['墨面（数字那一片）'].join(',')})｜对比 ${两面.toFixed(2)}`)
    const 浅面 = cr(M['白面（块里上那片）'], 照片)
    ok('白面压在纯黑照片上仍然是浅面（他 10-11 那一句问的就是这个，极性换了、问题没换）',
      浅面 >= 3, `白面 rgb(${M['白面（块里上那片）'].join(',')}) vs 黑照片 rgb(${照片.join(',')})｜对比 ${浅面.toFixed(2)}`)
    console.log('  截图：' + shot)
  } finally {
    if (fs.existsSync(FIXTURE)) fs.unlinkSync(FIXTURE)
    console.log('  探针图已删：' + FIXTURE + (fs.existsSync(FIXTURE) ? '　!! 没删掉，手动删' : '　✓'))
    try { await mp.close() } catch (e) {}
  }
}

main().catch((e) => { console.log('!! 尺子挂了 ' + e.message); process.exitCode = 1 }).finally(report)
