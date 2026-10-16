// 10-17「精致化」这一轮的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-精致化四刀.js
//
// 站长 10-17 凌晨五句（附两张真机弹窗图）：
//   ①「原文翻译，前面的药丸要缩小一点」
//   ②「然后没有上下等边，歪了。不够精致」
//   ③「这一行字体也要同步压一档，与首屏的三个设置字体一样大」
//   ④「相册，拍照，粘贴三个圆也要加发光。右滑的圆也要加发光」
//   ⑤「两个弹窗中间英文小字连在一起了，应该要改为与下方菜单栏，后面备注的小字一样的字体」
//
// 这一把钉的全是"文件里挂没挂、四处是不是同一份"；屏上画没画出来看 `验-精致化四刀-真跑`。
// ⑤ 的根因是量出来的，不是猜的：**`letter-spacing` 里绝对值小于一整像素的 rpx 会被取整成 ±1px**
// （−0.2rpx 在 390 宽那一台上屏上读到 −1px）。所以这一条钉的是"那一行不许再回来"，
// 而不是"看着松一点"。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const NC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const XW = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
// 同名选择器可能有多块（这一类读法错记在尺子清单里），一律先剥注释再并块
const blocksOf = (css, sel) => {
  const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  let m, all = ''
  while ((m = re.exec(css))) all += m[1]
  return all
}
const grab = (body, prop) => {
  const m = new RegExp(`${prop}:\\s*([^;]+);`).exec(body)
  return m ? m[1].trim().replace(/\s+/g, ' ') : null
}

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const create = NC(read('pages/create/create.wxss'))
const createX = XW(read('pages/create/create.wxml'))
const me = NC(read('pages/me/me.wxss'))
const pwd = NC(read('styles/pwd-sheet.wxss'))

const out = blocksOf(create, '.out')
const swap = blocksOf(create, '.swap-text')
const lab = blocksOf(create, '.wr-sw-lab')
const hint = blocksOf(create, '.wr-sw-hint')
const track = blocksOf(create, '.wr-sw-track')
const dot = blocksOf(create, '.wr-sw-dot')
const dotOn = blocksOf(create, '.wr-sw-on .wr-sw-dot')
const swWrap = blocksOf(create, '.out .wr-sw')

/* ---------- ③ 那一行与首屏三枚设置并成同一支字 ---------- */
ok('③ 那一行的字档降到 --fs-tiny（他「与首屏的三个设置字体一样大」）',
  grab(out, 'font-size') === 'var(--fs-tiny)', String(grab(out, 'font-size')))
ok('③ 名字与说明两枚跟着一起降（它们原来各写一份 --fs-meta，只改行不改进＝屏上还是 24）',
  grab(lab, 'font-size') === 'var(--fs-tiny)' && grab(hint, 'font-size') === 'var(--fs-tiny)',
  `名字 ${grab(lab, 'font-size')}／说明 ${grab(hint, 'font-size')}`)
ok('③ 与首屏那一行三枚逐字同一份：字号／字距／字色（不是"差不多大"）',
  grab(out, 'font-size') === grab(swap, 'font-size')
  && grab(out, 'letter-spacing') === grab(swap, 'letter-spacing')
  && grab(out, 'color') === grab(swap, 'color'),
  `那一行 ${grab(out, 'font-size')} ${grab(out, 'letter-spacing')} ${grab(out, 'color')}`
  + `／首屏 ${grab(swap, 'font-size')} ${grab(swap, 'letter-spacing')} ${grab(swap, 'color')}`)

/* ---------- ①② 药丸缩小，并且上下压得住中线 ---------- */
const tw = parseFloat(grab(track, 'width')), th = parseFloat(grab(track, 'height'))
const dw = parseFloat(grab(dot, 'width')), di = parseFloat(grab(dot, 'top'))
const travel = grab(dotOn, 'transform')
ok('① 面收到 54×30、点 22、四边各留 4（原来 72×40／32／4）',
  tw === 54 && th === 30 && dw === 22 && di === 4 && parseFloat(grab(dot, 'left')) === 4,
  `面 ${tw}×${th}／点 ${dw}／内缩 ${di}`)
ok('① 位移与几何闭合：54 − 22 − 4 − 4 ＝ 24（写错一个数，点就顶出面或留一条缝）',
  /translateX\(24rpx\)/.test(travel || ''), String(travel))
ok('② 药丸比字那一行矮，行里上下各余 7（原来 40 高比 33.6 的字行还高，屏上读成"撑破行"）',
  th < 21 * 1.4 + 1 && (parseFloat(grab(out, 'height')) - th) % 2 === 0
  && (parseFloat(grab(out, 'height')) - th) / 2 === 7,
  `行 ${grab(out, 'height')}／面高 ${th}`)
ok('② 热区没跟着缩：可点区仍是 60rpx（30 ＋ 上下各 15 透明 padding）——缩的是皮，不是按得着的面',
  parseFloat((grab(swWrap, 'padding') || '').split(' ')[0]) === 15 && th + 30 === 60,
  `padding ${grab(swWrap, 'padding')}`)

/* ---------- ④ 四枚圆同一份发光 ---------- */
const GLOW = '0 0 24rpx 2rpx var(--glass-chrome-dock)'
const mini = blocksOf(create, '.mini-c')
const shut = blocksOf(create, '.shut')
const knob = blocksOf(create, '.sld-knob')
const sld = blocksOf(create, '.sld')
;[['相册／粘贴那两枚小圆', mini], ['拍照那一枚（环＋实心是一个视觉单位，发光挂在环上）', shut],
  ['右滑那枚圆', knob]].forEach(([name, body]) => {
  ok(`④ ${name}：外发光一份 ${GLOW}`, grab(body, 'box-shadow') === GLOW, String(grab(body, 'box-shadow')))
})
ok('④ 三处逐字同一份（谁漂成另一种模糊半径，屏上就读出三种"光"）',
  grab(mini, 'box-shadow') === grab(shut, 'box-shadow') && grab(shut, 'box-shadow') === grab(knob, 'box-shadow'))
ok('④ 发光吃的是本档玻璃**本色**那一支，不是条身那一枚提亮的 --glass-plate-dock：白卡上白纱＝对比 1.00',
  /var\(--glass-chrome-dock\)/.test(mini) && !/var\(--glass-plate-dock\)/.test(mini + shut + knob))
ok('④ 条身自己那一份发光一个数没动（他没指，--glass-plate-dock 留着）',
  grab(sld, 'box-shadow') === '0 0 24rpx 2rpx var(--glass-plate-dock)', String(grab(sld, 'box-shadow')))

/* ---------- ④ 的一半：圆要发光，先得让它出得去 ---------- */
ok('④ 条身不再自己裁（overflow: hidden 撤净，否则圆的发光被裁成一条横糊）',
  !/overflow:\s*hidden/.test(sld), sld.replace(/\s+/g, ' ').slice(0, 90))
const clip = blocksOf(create, '.sld-clip')
ok('④ 裁切搬给单独一层 .sld-clip：绝对定位铺满 padding box ＋ 与条身同一个圆角',
  /position:\s*absolute/.test(clip) && /overflow:\s*hidden/.test(clip)
  && grab(clip, 'border-radius') === '50rpx'
  && ['left', 'top', 'right', 'bottom'].every((k) => grab(clip, k) === '0'),
  clip.replace(/\s+/g, ' ').slice(0, 120))
ok('④ 模板里进度那一片确实包在这一层里（圆与字不在）',
  /<view class="sld-clip"><view class="sld-fill"[^>]*style="width:\{\{fillPct\}\}%"><\/view><\/view>/.test(createX)
  && new RegExp('<view class="sld-knob"[^>]*style="left:\\{\\{knobRpx\\}\\}rpx"').test(createX),
  createX.slice(createX.indexOf('class="sld-clip"'), createX.indexOf('class="sld-clip"') + 150).replace(/\s+/g, ' '))
ok('④ 行程那几个数一个没动：边 5、圆宽 90、静置 left 10（圆的落点与 SLD_MAX 全从这三枚算）',
  /border:\s*5rpx solid transparent/.test(sld) && parseFloat(grab(knob, 'width')) === 90
  && parseFloat(grab(knob, 'left')) === 10)
ok('② 圆在条里上下居中由 top:50% ＋ translateY(-50%) 钉（原来写死 top:5rpx，屏上量到上 7.7／下 13.5）',
  grab(knob, 'top') === '50%' && /translateY\(-50%\)/.test(grab(knob, 'transform') || ''),
  `top ${grab(knob, 'top')}／transform ${grab(knob, 'transform')}`)

/* ---------- ⑤ 两个弹窗中间那句小字 ---------- */
const eScene = blocksOf(me, '.me-email-scene')
const pScene = blocksOf(pwd, '.pwd-scene')
const mHint = blocksOf(me, '.menu-hint')
;[['邮箱那一层（.me-email-scene）', eScene], ['密码那一层（.pwd-scene）', pScene]].forEach(([name, body]) => {
  ok(`⑤ ${name}：不再声明 letter-spacing（−0.2rpx 在屏上取整成 −1px，英文整句挤在一起）`,
    grab(body, 'letter-spacing') === null, String(grab(body, 'letter-spacing')))
  ok(`⑤ ${name}：字号与菜单行后面那行备注同一档（都是 --fs-tiny），这一句才是"一样的字体"`,
    grab(body, 'font-size') === grab(mHint, 'font-size') && grab(body, 'font-size') === 'var(--fs-tiny)',
    `这一句 ${grab(body, 'font-size')}／备注 ${grab(mHint, 'font-size')}`)
})
ok('⑤ 两枚的字色一个没动（他只说字挤在一起，没说深浅）',
  grab(eScene, 'color') === 'var(--text-secondary)' && grab(pScene, 'color') === 'var(--text-secondary)')
ok('⑤ 撤字距不许顺手把行高也撤（1.5 是"回行就压过格子"那一档的账）',
  grab(eScene, 'line-height') === '1.5' && grab(pScene, 'line-height') === '1.5')

console.log(`${fails.length ? '✗' : '✓'} 验-精致化四刀：${pass} 绿／${fails.length} 红`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
