#!/usr/bin/env node
// 反向验证：把第一屏三块每一处新判据钉的东西**故意改坏**，尺子必须红。
// 每把刀改完就从 .knifebak 还原；进程以任何方式退出都先还原（不碰 git——工作树里有一整轮未提交改动）。
// 跑法：node docs/工具/刀-第一屏三块反向.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = '/Users/zlfmac/Documents/TuMaiBiJi'
const RULER = path.join(ROOT, 'docs/工具/验-第一屏三块.js')
const files = {
  wxss: path.join(ROOT, 'miniprogram/pages/create/create.wxss'),
  wxml: path.join(ROOT, 'miniprogram/pages/create/create.wxml'),
}
for (const f of Object.values(files)) fs.copyFileSync(f, f + '.knifebak')
// restore 用 copy 不用 rename：一轮里要还原九次，备份得一直在。
const restore = () => { for (const f of Object.values(files)) if (fs.existsSync(f + '.knifebak')) fs.copyFileSync(f + '.knifebak', f) }
const cleanup = () => { for (const f of Object.values(files)) fs.rmSync(f + '.knifebak', { force: true }) }
process.on('exit', () => { restore(); cleanup() })
process.on('uncaughtException', (e) => { console.log('炸了：' + e.message); restore(); cleanup(); process.exit(2) })

const edit = (which, from, to, all = false) => {
  const p = files[which]
  const src = fs.readFileSync(p, 'utf8')
  if (!src.includes(from)) throw new Error(`刀没落下：${which} 里找不到 ${from}`)
  fs.writeFileSync(p, all ? src.split(from).join(to) : src.replace(from, to))
}

// 每把刀：[名字, 下刀, 期望红的那条判据（子串）]
const KNIVES = [
  ['小字抬回写死的 14rpx', () => edit('wxss', 'font-size: var(--fs-micro);\n  font-weight: 500;', 'font-size: 14rpx;\n  font-weight: 500;'), '小字这一档'],
  ['小字灰退成 #8E8E93（对白底只有 3.26）', () => edit('wxss', 'color: #6E6E73;', 'color: #8E8E93;'), '压得住白条那张纯白'],
  ['把色阶值抄进样式表（六位 hex）', () => edit('wxss', '.blk-stat-notes {\n  background: var(--eb-notes);', '.blk-stat-notes {\n  background: #C9C1AE;'), '没有抄进来的色相'],
  ['把品牌色抄成 rgba（原来这一支从指缝里过去）', () => edit('wxss', 'background: rgba(255, 255, 255, 0.85);', 'background: rgba(210, 104, 63, 0.5);'), '没有抄进来的色相'],
  ['窗底抬到 200（贴不住白条）', () => edit('wxss', 'bottom: 105rpx;', 'bottom: 200rpx;'), '取景窗下沿'],
  ['组名退回裸 .blk（撞全局那枚分类方块）', () => edit('wxml', 'class="home-blk"', 'class="blk"', true), '没有一枚和 app.wxss 同名'],
  ['三元分支里塞一枚同名类（证明分支也扫了）', () => edit('wxml', "{{active ? 'entry-dock' : ''}}", "{{active ? 'blk' : ''}}"), '三元分支里那几枚'],
  ['撤掉 role 与 aria-label', () => edit('wxml', 'role="button" aria-label="{{noteCount}}{{t.statNotes}}" ', ''), 'role="button"'],
  ['整组类名改名（色扫必须自证真扫到了段）', () => { edit('wxss', '.home-blk', '.zz-grp', true); edit('wxss', '.blk-', '.zz-', true) }, '色扫真扫到了'],
]

const run = () => {
  try { execFileSync(process.execPath, [RULER], { encoding: 'utf8' }); return { red: false, out: '' } }
  catch (e) { return { red: true, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

let bad = 0
for (const [name, dig, needle] of KNIVES) {
  dig()
  const r = run()
  const hit = r.out.includes(needle)
  if (r.red && hit) console.log(`✓ 红得对    ｜${name}`)
  else {
    bad += 1
    console.log(`✗ 这把刀没生效｜${name}｜${r.red ? `红了但没命中「${needle}」：${r.out.split('\n').slice(1, 3).join(' / ')}` : '还是绿的'}`)
  }
  restore()
}
restore(); cleanup()
console.log(bad === 0 ? '九把刀全部见血，改完已还原' : `${bad} 把刀没见血（改完已还原）`)
process.exit(bad ? 1 : 0)
