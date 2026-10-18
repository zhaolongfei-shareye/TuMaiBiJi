// 外链贴图那两句实话（「原文有 N 张、只留下前 K 张」／「有 M 张没能存下来」）画不画得出来。
// 跑法：node docs/工具/验-贴图那两句实话.js
//
// 为什么要单独一把：方案 §八.4／§八.11 要的就是"截断不许静默"。后端把三个数钉进快照只是半成品——
// 屏上不说，用户看到的仍是"这篇只有 9 张图"，与没说一样。而这一句最容易死在三种写法上：
//   ① 拿本机行数倒推（用户删掉一张，"原文有 26 张"就再也问不出来了）；
//   ② 把"截了"和"没存上"并成一句（两个原因互相兜底，读数永远差一个）；
//   ③ 落点写在配图那一块面板的 wx:if 里面（九张全没存上时那块根本不渲染，
//      最该说的那一句恰好说不出——10-19 落码时就长错过一次，反向③钉的是这一条）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const JS = read('miniprogram/pages/detail/detail.js')
const JS_CLEAN = stripJs(JS)
const WXML = read('miniprogram/pages/detail/detail.wxml')
const I18N = read('miniprogram/utils/i18n.js')

// shotsTruth 那一段（函数体到下一个 Page({ 之前）
const FN = (/function shotsTruth[\s\S]*?\n}/.exec(JS_CLEAN) || [''])[0]
ck('屏上那两句由一个具名函数算出来（不是嵌在 loadNote 里的一串三元）', !!FN && FN.length > 40)

// ① 只读服务端那份快照
ck('两个数都读 imported_from 里的键，不读本机行数',
  /s\.images_truncated/.test(FN) && /s\.images_failed/.test(FN)
  && !/noteImages/.test(FN) && !/\.length/.test(FN))
ck('快照整份为空时回空串（这一篇不是外链转存的，那一格一个字都不画）',
  /const s = src \|\| \{\}/.test(FN) && /return bits\.join/.test(FN))
ck('详情页把这句挂到 note 上，数据源是 note.imported_from 而不是别的',
  /note\.shots_note = shotsTruth\(note\.imported_from, this\.data\.lang\)/.test(JS_CLEAN))

// ② 两件事两句话，各判各的
const IFS = (FN.match(/if \(s\.images_/g) || []).length
ck('截断与没存上是两个独立的 if（不许并成一句互相兜底）', IFS === 2, `${IFS} 个`)
ck('两句读的是四个不同的键：total／kept 给截断那句，failed 给没存上那句',
  /images_total/.test(FN) && /images_kept/.test(FN) && /images_truncated/.test(FN) && /images_failed/.test(FN))

// ③ 落点在面板外面
const PANEL = /wx:if="\{\{noteImages\.length\}\}" class="panel dt-shots-panel"[\s\S]*?<\/view>/.exec(WXML) || ['']
ck('那句实话不在配图面板的 wx:if 里面（九张全没存上时也说得出）',
  /dt-shots-note/.test(WXML) && !/dt-shots-note/.test(PANEL[0]))
ck('那一格自己带 wx:if，空串时整块不画（不留一行空白小字）',
  /<text wx:if="\{\{note\.shots_note\}\}" class="dt-shots-note">/.test(WXML))

// ④ 双语键齐、占位符同一套
for (const k of ['shotsTruncated', 'shotsPartlyFailed']) {
  const hits = I18N.split(k).length - 1
  ck(`i18n 中英两档都有 ${k}`, hits === 2, `${hits} 处`)
}
const truncZh = /shotsTruncated: '([^']+)'/.exec(I18N)
ck('截断那句带 {n} 与 {k} 两个占位（少一个就会把原文张数说成留下张数）',
  truncZh && /\{n\}/.test(truncZh[1]) && /\{k\}/.test(truncZh[1]), truncZh && truncZh[1])
const enBlock = I18N.slice(I18N.lastIndexOf('en: {'))
ck('英文那一档同两个键、同两个占位（不许只上中文）',
  /shotsTruncated: '[^']*\{n\}[^']*\{k\}/.test(enBlock) && /shotsPartlyFailed: '[^']*\{n\}/.test(enBlock))

// ⑤ 反向：三种写歪的形状必须真让上面某条红。判据抽成函数，喂的是改过的形状，不动磁盘。
const readsSnapshot = (body) =>
  /s\.images_truncated/.test(body) && /s\.images_failed/.test(body) && !/\.length/.test(body)
const saysBoth = (body) => (body.match(/if \(s\.images_/g) || []).length === 2
const outsidePanel = (wxml) => {
  const panel = /wx:if="\{\{noteImages\.length\}\}" class="panel dt-shots-panel"[\s\S]*?<\/view>/.exec(wxml)
  return /dt-shots-note/.test(wxml) && !!panel && !/dt-shots-note/.test(panel[0])
}
const rev = (name, okIfRed) => ck(`反向：${name}`, okIfRed, okIfRed ? '改了形状，判据真的跟着红' : '探针无效：改了形状判据却没红')

rev('把两个数改成本机行数倒推（删一张就再也问不出原文几张）',
  !readsSnapshot(FN.replace('s.images_truncated > 0', 'noteImages.length > 0')))
rev('两句并成一句（只说截断，没存上那几张静默）',
  !saysBoth(FN.replace('if (s.images_failed > 0)', 'if (false)')))
const MOVED_BACK = WXML.replace(/\s*<text wx:if="\{\{note\.shots_note\}\}"[\s\S]*?<\/text>/, '')
  .replace('</scroll-view>\n    </view>', `</scroll-view>\n      <text wx:if="{{note.shots_note}}" class="dt-shots-note">{{note.shots_note}}</text>\n    </view>`)
rev('那句搬回面板里面（全失败时那块不渲染 ⇒ 说不出）',
  !outsidePanel(MOVED_BACK) && outsidePanel(WXML))

console.log(`\n${bad.length ? `红 ${bad.length} 条\n  ${bad.map((b) => `\n  · ${b}`).join('')}` : '全绿'}`)
process.exit(bad.length ? 1 : 0)
