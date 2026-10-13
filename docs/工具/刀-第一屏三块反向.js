#!/usr/bin/env node
// 反向验证：把首屏每一处判据钉的东西**故意改坏**，尺子必须红。
// 每把刀改完就从 .knifebak 还原；进程以任何方式退出都先还原（不碰 git——工作树里有一整轮未提交改动）。
// 跑法：MP_ROOT=/Users/zlfmac/Documents/TuMaiBiJi-2.2 node docs/工具/刀-第一屏三块反向.js
// ⚠ ROOT 必须能传：这一支原来把主目录写死在这里。2.2 那条线是独立 worktree，不传就直接把刀
//   下在**主目录**那三个文件上——那儿还有另一支 agent 未提交的改动。现在默认改成"这份脚本自己
//   那棵树"（10-13 就真忘传过一次，刀落在主目录三个 create.* 上，改写完才从 .knifebak 还原），
//   首行仍把树打出来，跑错树一眼看得见；那棵树里没有对应的尺子时，一条都不落地就退出。
// ⚠ `edit` 只替换第一条命中：下面每一把落刀前都核对过"那一串在本文件里出现几次、第一条是不是想要的那段"
//   （10-13 那枚 ➕ 换成白玻璃之后不再吃 `--cp-cam`：那支只剩第二屏 `.shut-core` 一处，而色扫只吃首屏那几段，
//    ⇒ 抄色那把刀改落在首屏这一段里还剩的 `--cp-cam-ink`（`.blk-plus-glyph`，全文第一处＝354 行）。）
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

// ROOT 默认取**这一份脚本自己那棵树**（与尺子同一个口径）：10-13 有一次忘了传 MP_ROOT，
// 默认值把刀下在了主目录那三个 create.* 上（另一支 agent 的树），当场改写完才还原回来。
// 环境变量仍然优先，跨树抽跑照旧 `MP_ROOT=… node …`。
const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '../..')
const RULER = path.join(ROOT, 'docs/工具/验-第一屏三块.js')
const files = {
  wxss: path.join(ROOT, 'miniprogram/pages/create/create.wxss'),
  wxml: path.join(ROOT, 'miniprogram/pages/create/create.wxml'),
  js: path.join(ROOT, 'miniprogram/pages/create/create.js'),
}
console.log(`下刀的树：${ROOT}`)
if (!fs.existsSync(RULER)) throw new Error(`这棵树里没有那把尺子：${RULER}`)
for (const f of Object.values(files)) fs.copyFileSync(f, f + '.knifebak')
// restore 用 copy 不用 rename：一轮里要还原二十次上下，备份得一直在。
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
// 2.2 B 方案把这一屏换了骨架，刀跟着重排：上一轮那几把指"白条／纯白／色阶值"的，
// 载体已经不在了，留着就是几条永不现形的声明。
const KNIVES = [
  ['数字抬回 88（一格两枚并排放不下，就是他打回的那种挤）',
    () => edit('wxss', 'font-size: 64rpx;', 'font-size: 88rpx;'), '数字那一档是 64rpx'],
  ['小字自起一架（不走 --fs-micro，「与正常小字一样」这句就断了）',
    () => edit('wxss', '.blk-lab {\n  font-size: var(--fs-micro);', '.blk-lab {\n  font-size: 21rpx;'), '数字那一档是 64rpx'],
  // 10-13 那枚 ➕ 换成白玻璃后不再吃 `--cp-cam` ⇒ 刀挪到首屏这一段里还剩的那一处 `--cp-cam-ink`
  // （`.blk-plus-glyph` 的图形）。挪到 `.shut-core` 是空刀——色扫只吃首屏那几段，第二屏不在里面。
  ['把官网那支赭色抄进样式表（六位 hex）',
    () => edit('wxss', 'background: var(--cp-cam-ink);', 'background: #D2683F;'), '没有抄进来的色相'],
  ['把品牌色抄成 rgba（原来这一支从指缝里过去）',
    () => edit('wxss', 'background: rgba(242, 239, 233, 0.85);', 'background: rgba(210, 104, 63, 0.5);'), '没有抄进来的色相'],
  ['暖白换成另一支暖白（只差三个通道值，照样不放行）',
    () => edit('wxss', 'color: #F2EFE9;', 'color: #F5F0E6;'), '唯一那支暖白必须是全站'],
  ['墨面照抄 .page-scrim 那串幅度（合成只差 2 级＝画了跟没画一样，他原话「渐变效果不好」）',
    () => { edit('wxss', 'rgba(18, 20, 26, 0.35) 62%', 'rgba(18, 20, 26, 0.42) 62%')
      edit('wxss', 'rgba(18, 20, 26, 0.68) 88%', 'rgba(18, 20, 26, 0.62) 88%')
      edit('wxss', 'rgba(18, 20, 26, 0.92) 100%', 'rgba(18, 20, 26, 0.72) 100%') }, '差 ≥6 级'],
  ['停点自己另写一档（「与现网的过程一样」就没了）',
    () => edit('wxss', 'rgba(255, 255, 255, 0.93) 43%', 'rgba(255, 255, 255, 0.93) 38%'), '停点位置与现网'],
  ['窗底抬到 205（脚底与墨面之间开一条缝，就是他说的「悬空」）',
    () => edit('wxss', 'bottom: 197rpx;', 'bottom: 205rpx;'), '窗底与墨面上沿是同一条线'],
  ['把 overflow 写回卡上（人头被切平——他这一句打回的就是这一刀）',
    () => edit('wxss', '.blk-person {\n  position: relative;', '.blk-person {\n  overflow: hidden;\n  position: relative;'), '卡自己不许出现 overflow'],
  /* 这一把原来锚在 `height: 213rpx;` 上——10-13 那一刀（白面上沿 0→24、高 213→189）之后那串字
     在整份表里没有了，刀落下就抛"找不到"；期望红那句也从「两片皮正好拼成整块」改成了「三段拼成整块」
     （多了白面上沿那 24 的口子）。锚点与判据名一起对上。 */
  ['两片皮拼不满整块（白面减 20，中间开一条缝）',
    () => edit('wxss', '  top: 24rpx;\n  height: 189rpx;', '  top: 24rpx;\n  height: 169rpx;'), '三段拼成整块'],
  ['➕ 挪回贴右沿（他 10-13「右下的圆按钮要往中间靠，现在太边缘了」）',
    () => edit('wxss', 'align-self: center;\n  box-sizing: border-box;\n  border-radius: 50%;', 'align-self: flex-end;\n  box-sizing: border-box;\n  border-radius: 50%;'), '➕ 在列的正中'],
  ['那套变量搬回 .panel 上（首屏那枚 ➕ 拿不到 --cp-cam＝一块透明）',
    () => { edit('wxml', '" style="{{skinPanel}}" bindtap="collapse"', '" bindtap="collapse"')
      edit('wxml', `<view class="panel ${'{{'}panelOpen ? 'panel-open' : ''}}" catchtap="noop">`,
        `<view class="panel ${'{{'}panelOpen ? 'panel-open' : ''}}" style="{{skinPanel}}" catchtap="noop">`) },
    '容器仍发那套'],
  ['撤掉计数格那枚的 role 与 aria-label',
    () => edit('wxml', 'role="button" aria-label="{{noteCount}}{{t.statNotes}}" ', ''), '一枚不落'],
  ['整组类名退回裸 .blk（撞全局那枚分类方块）',
    () => edit('wxml', 'class="home-blk"', 'class="blk"', true), '没有一枚和 app.wxss 同名'],
  ['三元分支里塞一枚同名类（证明分支也扫了）',
    () => edit('wxml', "{{active ? 'entry-dock' : ''}}", "{{active ? 'blk' : ''}}"), '三元分支里那几枚'],
  ['面板顶写成定值（不跟着那一组走，矮屏上两态的顶就岔开）',
    () => edit('wxss', 'top: min(calc(66.3% - 24rpx), calc(100vh - 586rpx));', 'top: 1083rpx;'), '收起态：面板顶到组顶的留空'],
  // 10-13 第二屏方案那四刀落码之后重排：原来这一把锚在 `.stage-panel-open { top: calc(66.3% - 107rpx);`，
  // 那条规则随 D16 甲整条撤了（闸改挂 `active`、顶钉成一根线），锚点找不到就报"刀没落下"。
  ['★第二屏那根顶退回"跟着面板走"（＝乙案，聚焦一次往上跳 80）',
    () => edit('wxss', '.container.entry-dock .stage-panel {\n  top: calc(100vh - 749rpx);',
      '.container.entry-dock .stage-panel {\n  top: calc(100vh - 669rpx);'), '第二屏：那一层的顶'],
  ['★那一层重新挂回 `panelOpen`（收起↔展开又上下跳 83，框外那行再悬一次）',
    () => edit('wxml', '<view class="stage-panel"></view>',
      "<view class=\"stage-panel{{panelOpen ? ' stage-panel-open' : ''}}\"></view>"), '不再挂 `panelOpen`'],
  ['★白面上沿抬回块顶（撤掉"头部一半在框外"那一刀）',
    () => edit('wxss', '.blk-face {\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 24rpx;',
      '.blk-face {\n  position: absolute;\n  left: 0;\n  right: 0;\n  top: 0rpx;'), '白面上沿落在女那张的头带中点'],
  ['★白面高写回 213（那 24 的口子没人补，三段拼不满整块）',
    () => edit('wxss', '  top: 24rpx;\n  height: 189rpx;', '  top: 24rpx;\n  height: 213rpx;'), '三段拼成整块'],
  ['★剪影抬到 200 高（头顶越过白面上沿＝"男在框内"那句破了）',
    () => edit('wxss', 'height: 132rpx;\n  z-index: 1;', 'height: 200rpx;\n  z-index: 1;'), '男剪影整张仍在白框内'],
  ['★窗底让开墨面上沿 6rpx（"下方不能悬空"那句反了）',
    () => edit('wxss', '  top: -52rpx;\n  bottom: 197rpx;', '  top: -52rpx;\n  bottom: 191rpx;'), '窗底与墨面上沿是同一条线'],
  ['★那枚 2.4 退回裸类名（与 `.glyph-plus` 同权重、只靠源码顺序赢，挪一下就静默回 1.6）',
    () => edit('wxss', '.blk-plus .blk-plus-glyph {\n  -webkit-mask-image:', '.blk-plus-glyph {\n  -webkit-mask-image:'),
    '首屏那枚 ➕ 的 2.4'],
  ['整组夹值少算一行（562 改回旧的 546＝还按整组 394 算）',
    () => edit('wxss', 'top: min(66.3%, calc(100vh - 562rpx));', 'top: min(66.3%, calc(100vh - 546rpx));'), '夹值是推出来的'],
  ['热区缩到 100 高（剪影 132，头顶一段点了没反应）',
    () => edit('wxss', 'height: 152rpx;', 'height: 100rpx;'), '盖得住'],
  ['剪影抬到主人物前面（「在后面」那条反了）',
    () => edit('wxss', 'height: 132rpx;\n  z-index: 1;', 'height: 132rpx;\n  z-index: 4;'), '剪影在主人物'],
  ['热区改用 bindtap（冒泡到左块＝换人的同时把面板打开）',
    () => edit('wxml', 'catchtap="swapPerson"', 'bindtap="swapPerson"'), '热区用 catchtap'],
  ['开门那一下塞回定时器（就是他被延住的那个手感）',
    () => edit('js', '  openBar() {\n    if (this.data.busy) return', '  openBar() {\n    setTimeout(() => {}, 300)\n    if (this.data.busy) return'), '没有任何延迟'],
  ['把人物路径抄进页面（三处画同一个人就会漂）',
    () => edit('js', 'const person = require', "const _probeSrc = '/assets/ic-person.png'\nconst person = require"), '人物那两张还在包里'],
  ['把效果图上那枚占位数抄进模板（16 一旦落进 wxml 就是永远显示假数）',
    () => edit('wxml', '<text class="blk-num">{{noteCount}}</text>', '<text class="blk-num">16</text>'), '不许是写死的数字'],
  ['白条那条回来（`.blk-jot` 与它那支写死的灰）',
    () => edit('wxss', '.blk-cell {', '.blk-jot {\n  background: #FFFFFF;\n  color: #3A3A3C;\n}\n\n.blk-cell {'), '那一整条白皮'],
  ['计数图标连引用一起回来（文件已经出包，留着就是指向空气）',
    () => edit('wxml', '<view class="blk-count">', '<image class="blk-ic" src="/assets/ic-stat-notes.png" mode="aspectFit" /><view class="blk-count">'), '连文件带引用一起撤净'],
  ['按下态那枚类名写错（按下什么都不退色，界面照样能用、截图也看不出来）',
    () => edit('wxml', 'hover-class="blk-cell-press"', 'hover-class="blk-cell-pressed"'), '真有一条规则接着'],
  ['面板那一层的层号抬到 9999（通栏贴屏底那一片压过底栏，两格导航点了没反应，而静态几何全对）',
    () => edit('wxss', '.stage-panel {\n  position: fixed;', '.stage-panel {\n  z-index: 9999;\n  position: fixed;'), '深色面板那层的层号低于底栏'],
  ['把实心 .95 写回面板本体（10-13 那一刀：与压在它上面的 ::before 相乘，band 顶透出不到 4.2%，'
    + '"上部渐变半透明毛玻璃"画了等于没画，而几何与字色判据全绿）',
    () => edit('wxss', 'background: transparent;\n  backdrop-filter',
      'background: rgba(35, 37, 44, 0.95);\n  backdrop-filter'), '深色面板本体透明'],
]

let bad = 0
for (const [name, dig, needle] of KNIVES) {
  try { dig() } catch (e) { console.log(`✗ 刀没落下：${name} —— ${e.message}`); bad += 1; restore(); continue }
  let red = false, out = ''
  try { execFileSync(process.execPath, [RULER], { encoding: 'utf8' }) }
  catch (e) { red = true; out = `${e.stdout || ''}${e.stderr || ''}` }
  if (!red) { console.log(`✗ 没红：${name} —— 这一条判据是空的`); bad += 1 }
  else if (!out.includes(needle)) {
    console.log(`✗ 红了但不是这一条：${name} —— 期望「${needle}」`)
    console.log('   ' + out.split('\n').filter((l) => l.trim().startsWith('·')).slice(0, 3).join('\n   '))
    bad += 1
  } else console.log(`✓ ${name}`)
  restore()
}
console.log(bad ? `!! ${bad} 把刀没牙（共 ${KNIVES.length} 把）` : `${KNIVES.length}/${KNIVES.length} 把刀都有牙`)
process.exit(bad ? 1 : 0)
