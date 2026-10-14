#!/usr/bin/env node
// 反向验证：把第一屏三块每一处新判据钉的东西**故意改坏**，尺子必须红。
// 每把刀改完就从 .knifebak 还原；进程以任何方式退出都先还原（不碰 git——工作树里有一整轮未提交改动）。
// 跑法：node docs/工具/刀-第一屏三块反向.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = '/Users/zlfmac/Documents/TuMaiBiJi'
const RULER = path.join(ROOT, 'docs/工具/验-第一屏三块.js')
const BG_RULER = path.join(ROOT, 'docs/工具/验-首页背景图.js')
const files = {
  wxss: path.join(ROOT, 'miniprogram/pages/create/create.wxss'),
  wxml: path.join(ROOT, 'miniprogram/pages/create/create.wxml'),
  js: path.join(ROOT, 'miniprogram/pages/create/create.js'),
  // 10-14 第 0 步那两把刀下在「我的」那一页（无图态字色钉在那里），文件名单得跟着长；
  // 备份/还原按这张表走，漏一个就会把那页改坏了留在树里。
  me: path.join(ROOT, 'miniprogram/pages/me/me.wxss'),
}
for (const f of Object.values(files)) fs.copyFileSync(f, f + '.knifebak')
// restore 用 copy 不用 rename：一轮里要还原十几次，备份得一直在。
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
  /* 10-10 深夜换的"点剪影换位"那一组，刀也跟着换：上一轮钉的是双击那套机器，这一轮钉的是剪影本身。 */
  /* 10-11 他改口"剪影按高定"（`验-第一屏三块.js` 第 7 段跟着换了量法），这两把的落刀点当天就漂了：
     落点还写着 `width: 91rpx`，而那一行早没了 ⇒ 刀没落下、整个 harness 在那儿炸掉，
     后面所有刀（含 10-14 新加的两把）一次都没跑过。换成现在那一行的高。 */
  ['剪影高抬到 200（对主人物不再是"约一半"那一档）', () => edit('wxss', 'height: 132rpx;\n  z-index: 1;', 'height: 200rpx;\n  z-index: 1;'), '剪影屏上高'],
  ['热区缩到 100 高（剪影按高定之后是 132，头顶一段点了没反应）', () => edit('wxss', 'height: 152rpx;', 'height: 100rpx;'), '盖得住两张里更宽的那一张'],
  ['剪影抬到主人物前面（"在后面"那条反了）', () => edit('wxss', 'height: 132rpx;\n  z-index: 1;', 'height: 132rpx;\n  z-index: 4;'), '剪影在主人物'],
  ['热区改用 bindtap（冒泡到左块＝换人的同时把面板打开）', () => edit('wxml', 'catchtap="swapPerson"', 'bindtap="swapPerson"'), '热区用 catchtap'],
  ['开门那一下塞回定时器（就是他被延住的手感）', () => edit('js', "  openBar() {\n    if (this.data.busy) return", '  openBar() {\n    setTimeout(() => {}, 300)\n    if (this.data.busy) return'), '没有任何延迟'],
  ['把人物路径抄进页面（三处画同一个人就会漂）', () => edit('js', 'const person = require', "const _probeSrc = '/assets/ic-person.png'\nconst person = require"), '只写在 utils/person.js'],
  /* 10-14 第 0 步（§8.233 那条 P0 前置闸）钉的是「无图态那两行字读得清」，刀下在「我的」那一页，
     尺子换成 `验-首页背景图.js`——那把里新加的三条就是这两口刀要见血的地方。 */
  ['把 MIND 那对数字的纸白写回基样式（＝10-14 实测红的那一条，浅底上 1.10）',
    () => edit('me', '.score-n {\n  display: block;', '.score-n {\n  color: rgba(242, 239, 233, 0.74);\n  display: block;'),
    '头部那几行的**基样式**里没有一条写纸白', BG_RULER],
  ['把纸白那两档从 .head-band.has-bg 上摘掉（＝图上那一态一起没）',
    () => edit('me', '.head-band.has-bg .score-n {', '.score-n-orphans {'),
    '纸白档挂在 .head-band.has-bg 下面', BG_RULER],
]

const run = (ruler) => {
  try { execFileSync(process.execPath, [ruler || RULER], { encoding: 'utf8' }); return { red: false, out: '' } }
  catch (e) { return { red: true, out: `${e.stdout || ''}${e.stderr || ''}` } }
}

let bad = 0
for (const [name, dig, needle, ruler] of KNIVES) {
  dig()
  const r = run(ruler)
  const hit = r.out.includes(needle)
  if (r.red && hit) console.log(`✓ 红得对    ｜${name}`)
  else {
    bad += 1
    console.log(`✗ 这把刀没生效｜${name}｜${r.red ? `红了但没命中「${needle}」：${r.out.split('\n').slice(1, 3).join(' / ')}` : '还是绿的'}`)
  }
  restore()
}
restore(); cleanup()
console.log(bad === 0 ? `${KNIVES.length} 把刀全部见血，改完已还原` : `${bad}/${KNIVES.length} 把刀没见血（改完已还原）`)
process.exit(bad ? 1 : 0)
