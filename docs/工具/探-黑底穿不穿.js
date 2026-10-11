// 黑底探针：站长 10-11 11:0x 那句「首页三个块磨玻璃的背景图换成白底再毛玻璃，否则现在如果背景深色的话，
// 毛玻璃就会很暗，13，12 等数字完全看不清」的**量法**。
// 为什么必须真铺一张黑图去量，而不是拿公式算：这三块底下是 `backdrop-filter` ＋两层白，
// 合成结果对不对，只有渲染出来的像素说话（同一屏的默认那张照片是中偏暗，量不出最坏情况）。
// 基准也不我自己立：拿他 10-10 拍过的那版**实心面**（`--eb-notes` #C9C1AE 配同一支字墨 #352E1D＝对比 7.51）——
// 判据就是"垫了白底之后，压在纯黑照片上也不能比他当初那张实心面更难读"。
// 前置：docs/工具/跑尺子.sh 9431 探-黑底穿不穿
// ⚠ 探针图是**临时**写进 miniprogram/assets 的（跑完必删，见 finally）；它不进包、不提交。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/design/10-11毛玻璃/实测')
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
const INK = [0x35, 0x2E, 0x1D]              // 现网那两枚数字的字墨（palette.entryBlocks 的 --eb-*-ink，真函数跑出来的）
const BASE = cr([0xC9, 0xC1, 0xAE], INK)    // 他 10-10 拍过的那版实心面（右上 notes 那一档），基准就是它

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
    const [notes, cards] = [await geo('.blk-stat-notes'), await geo('.blk-stat-cards')]

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

    // 4. 面板中位与字墨的对比（取块里那一圈"没有图标没有数字"的面）
    const 读数 = execFileSync('python3', ['-c', `
from PIL import Image
import json, sys
im = Image.open(${JSON.stringify(shot)}).convert('RGB')
def med(box):
    px = list(im.crop(tuple(int(v) for v in box)).getdata())
    return tuple(round(sorted(p[i] for p in px)[len(px)//2]) for i in range(3))
def lin(c):
    c/=255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def L(t):
    r,g,b=[lin(x) for x in t]; return .2126*r+.7152*g+.0722*b
def cr(a,b):
    x,y=sorted([L(a),L(b)],reverse=True); return (x+.05)/(y+.05)
ink=(0x35,0x2E,0x1D)
boxes=json.loads(sys.argv[1])
out=[]
for name, bx in boxes:
    p=med(bx)
    out.append([name, list(p), round(cr(p,ink),2)])
print(json.dumps(out))
`, JSON.stringify([
      ['照片区（探针图本身）', boxOf(cards, 0.45, 1.9, 0.55, 2.1)],
      ['notes 面板', boxOf(notes, 0.42, 0.06, 0.62, 0.34)],
      ['cards 面板', boxOf(cards, 0.42, 0.06, 0.62, 0.34)],
    ])], { encoding: 'utf8' }).trim()
    const rows = JSON.parse(读数)
    const 照片 = rows[0]
    ok('那张纯黑**真的画到屏上了**（照片区不是黑的＝下面几条全在量默认那张，探针白跑）',
      Math.max(...照片[1]) <= 24, `照片区 rgb(${照片[1].join(',')})`)
    for (const [name, p, c] of rows.slice(1)) {
      ok(`${name}：压在**纯黑照片**上仍然是浅面，且不比 10-10 那版实心面（${BASE.toFixed(2)}）难读`,
        c >= BASE, `面板 rgb(${p.join(',')})｜对字墨 #352E1D 对比 ${c}｜基准 ${BASE.toFixed(2)}`)
    }
    console.log('  截图：' + shot)
  } finally {
    if (fs.existsSync(FIXTURE)) fs.unlinkSync(FIXTURE)
    console.log('  探针图已删：' + FIXTURE + (fs.existsSync(FIXTURE) ? '　!! 没删掉，手动删' : '　✓'))
    try { await mp.close() } catch (e) {}
  }
}

main().catch((e) => { console.log('!! 尺子挂了 ' + e.message); process.exitCode = 1 }).finally(report)
