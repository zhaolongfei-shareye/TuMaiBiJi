// 链接框右侧那枚「粘贴」的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-链接框粘贴.js
//
// 站长 10-08 真机反馈：「link模式下，没有粘贴功能，输入框也没有，你在输入框右侧加个按钮，粘贴板ICON」。
// 这一枚当年是被撤掉的，撤的理由写在 wxml 注释里——"粘贴交给系统长按"；那条在真机上不成立，所以加回来。
// 要守的东西：① 那枚必须在链接那一档的输入框里、在右侧，且带读屏标签；
// ② 点它要真的读剪贴板，读到的东西必须走与手打同一趟（hintFor + _sync），否则右滑那一枚的 ready 不跟着变；
// ③ 空剪贴板与读失败是两件事，两条话术不许合成一句、更不许静默；
// ④ 图形与那批同源（Lucide、24 格、1.6 描边），且挂在 mask 基础组里，否则只有形状没有颜色。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxssRaw = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const wxss = wxssRaw.replace(/\/\*[\s\S]*?\*\//g, '')
const js = fs.readFileSync(P('pages/create/create.js'), 'utf8')
const i18n = fs.readFileSync(P('utils/i18n.js'), 'utf8')

// 只取链接那一档那一段（从它的 field 开标签到下一个 </view>）
const urlBlock = (src) => {
  const m = /<view wx:elif="\{\{active === 'url'\}\}" class="field">([\s\S]*?)<\/view>\s*(?=\n\s*\n|\n\s*<!--)/.exec(src)
  return m ? m[1] : ''
}
const blk = urlBlock(wxml)
ok('链接那一档找得到（找不到说明 wxml 结构变了，下面全判不了）', blk.length > 0, '正则没捞到那一段')
ok('那一段里有粘贴那一枚，catchtap 指到 onPasteUrl', /catchtap="onPasteUrl"/.test(blk))
ok('那一枚带读屏标签，且吃的是字典里的 paste（屏上不出现字典外的界面话）',
  /class="field-paste"[^>]*aria-label="\{\{t\.paste\}\}"/.test(blk))
ok('粘贴那枚排在 ✕ 之后＝钉在输入框最右侧',
  blk.indexOf('field-x') > -1 && blk.indexOf('field-x') < blk.indexOf('field-paste'),
  '✕ 只在有字时出现，粘贴一直在，所以粘贴在最右')
ok('输入框本体没被挪走（field-input 还在那一段里）', /class="field-input"/.test(blk))

const fn = (/onPasteUrl\(\)\s*\{([\s\S]*?)\n  \},/).exec(js)
ok('create.js 里有 onPasteUrl', !!fn)
const body = fn ? fn[1] : ''
ok('它先挡 busy（与 clearUrl 同一条规矩：忙的时候不许改框里的字）', /if \(this\.data\.busy\) return/.test(body))
ok('它真的读剪贴板：走 wx.getClipboardData', /wx\.getClipboardData\(/.test(body))
ok('读到空与读失败各有话术，两条键不一样（不许合成一句糊过去）',
  /pasteEmpty/.test(body) && /pasteFailed/.test(body) && /fail:/.test(body))
ok('两条话术都发吐司，不静默', (body.match(/wx\.showToast/g) || []).length >= 2)
ok('粘进去的字走与手打同一趟：hintFor ＋ _sync（右滑那一枚的 ready 才跟着变）',
  /this\.hintFor\(/.test(body) && /this\._sync\(\)/.test(body))
ok('粘来的字符串先 trim（微信分享出去的那一坨前后常带空白与句子）', /\.trim\(\)/.test(body))

for (const k of ['paste', 'pasteEmpty', 'pasteFailed']) {
  const n = (i18n.match(new RegExp(`\\n\\s*${k}:`, 'g')) || []).length
  ok(`字典里 ${k} 中英两边都有`, n === 2, `只找到 ${n} 处`)
}

const seg = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)${esc}\\s*\\{([^}]*)\\}`).exec(wxss)
  return m ? m[1] : ''
}
const paste = seg('.field-paste'), glyph = seg('.paste-glyph'), shape = seg('.glyph-clipboard')
ok('.field-paste 存在且不参与拉伸', /flex:\s*none/.test(paste), paste || '没读到')
const w = parseInt(/width:\s*(\d+)rpx/.exec(paste)?.[1] || '0', 10)
const h = parseInt(/height:\s*(\d+)rpx/.exec(paste)?.[1] || '0', 10)
ok('可点面不小于 64×64rpx（指头按得动，图形只有 40）', w >= 64 && h >= 64, `${w}×${h}`)
ok('.paste-glyph 挂在 mask 基础组那一行里（不然只有形状没有遮罩）',
  /^\.bar-lead[^{]*\.paste-glyph\s*\{/m.test(wxss))
ok('.glyph-clipboard 有图形，且与那批同 24 格、同 1.6 描边',
  /mask-image/.test(shape) && /viewBox='0 0 24 24'/.test(shape) && /stroke-width='1\.6'/.test(shape))
// 那串 svg 是 URL 编码进 data-uri 的，尖括号在文件里长这样：%3Crect
ok('图形是剪贴板（板身加夹子），不是随手画的别的形状',
  /%3Crect width='8' height='4' x='8' y='2'/.test(shape) && /M16 4h2a2 2 0 0 1 2 2v14/.test(shape))
ok('那枚图形吃的是这一页的墨色档（跟 ✕ 同档，不抢输入框的视觉重心）',
  /var\(--cp-ink-62\)/.test(glyph), glyph || '没读到')

// 反向钉：三处各撤一下，判据必须红（证明钉的是真东西，不是恒真）
const cutPaste = (src) => src.replace(/\s*<view class="field-paste"[\s\S]*?<\/view>/, '')
ok('反向对照一：把那枚整枚撤掉，"找得到粘贴那枚"这条就该红',
  !/catchtap="onPasteUrl"/.test(urlBlock(cutPaste(wxml))) && /catchtap="onPasteUrl"/.test(blk))
ok('反向对照二：把 _sync 那一趟摘掉，那条判据就该红',
  !/this\._sync\(\)/.test(body.replace('this._sync()', '')) && /this\._sync\(\)/.test(body))
ok('反向对照三：只把基础组那一行里的 .paste-glyph 摘掉（自己那条规则留着），判据就该红',
  !/^\.bar-lead[^{]*\.paste-glyph\s*\{/m.test(wxss.replace(/(\.bar-lead[^{]*?)\.paste-glyph(\s*\{)/, '$1$2')),
  '注意：.paste-glyph 在文件里出现两次（自己的规则在前、基础组在后），摘错一处这条就是假绿')

console.log(`验-链接框粘贴：过 ${pass} 条`)
if (fails.length) {
  console.log('✗ 不过 ' + fails.length + ' 条：')
  fails.forEach((f) => console.log('  · ' + f))
  process.exit(1)
}
console.log('全过')
