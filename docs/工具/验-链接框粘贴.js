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
// 10-10 深夜这两条从"吐司"改道成"输入框上方那枚气泡"（站长：所有输入错误提示都用这种方式）。
// 钉的还是同一件事：**两条都必须说出来**，不许静默；只是出口换成 sayErr。
ok('两条话术都不静默（走气泡那一个出口，两档共用）',
  (body.match(/this\.sayErr\(/g) || []).length >= 2 && !/wx\.showToast/.test(body),
  `sayErr ${(body.match(/this\.sayErr\(/g) || []).length} 处`)
ok('粘进去的字走与手打同一趟：hintFor ＋ _sync（右滑那一枚的 ready 才跟着变）',
  /this\.hintFor\(/.test(body) && /this\._sync\(\)/.test(body))
ok('粘来的字符串先 trim（微信分享出去的那一坨前后常带空白与句子）', /\.trim\(\)/.test(body))

for (const k of ['paste', 'pasteEmpty', 'pasteFailed', 'pasteNoText', 'pasteReadFail']) {
  const n = (i18n.match(new RegExp(`\\n\\s*${k}:`, 'g')) || []).length
  ok(`字典里 ${k} 中英两边都有`, n === 2, `只找到 ${n} 处`)
}

/* ---------- 10-16 照片那一档第三枚小圆（站长原话「照片第三个按钮，改为"粘贴"从剪贴板粘贴图片，
   如果非图片，就直接跳转到链接，或者文字」）----------
   这一枚原来是"跳到链接那一档"，与上面 `.modes` 那三枚里的「链接」是同一个落点的第二个入口。
   他这句是把它换成粘贴，不是把链接那一档撤了 ⇒ 模式行那三枚必须还在（下面第一条钉这个）。
   图片那一半平台做不到（实测：剪贴板是图片时 success 与 fail 六秒一个都不回来），
   所以钉三样：① 有一条超时的路能说话（不许静默）；② 说的话是"读不出文字／图片贴不进来"，
   不许糊成"剪贴板是空的"；③ 像链接的串走 url 那一档、其余走 write 那一档，两档都真的把值填进去。 */
const crowBlk = (() => {
  const m = /class="crow">([\s\S]*?)\n {8}<\/view>/.exec(wxml)
  return m ? m[1] : ''
})()
ok('照片那一排找得到（找不到说明结构变了，下面全判不了）', crowBlk.length > 0, '正则没捞到那一段')
ok('那一排还是三枚（相册／拍照／粘贴），第三枚不再兼任跳链接',
  (crowBlk.match(/class="mini"/g) || []).length === 2 && /catchtap="onPasteAny"/.test(crowBlk)
  && !/data-tab="url"/.test(crowBlk))
ok('链接那一档的入口没跟着丢（模式行那三枚仍在）',
  (wxml.match(/data-tab="(photo|url|write)"/g) || []).length === 3)
ok('第三枚的字与读屏标签都吃字典里的 paste（屏上不出现字典外的界面话）',
  /aria-label="\{\{t\.paste\}\}"/.test(crowBlk) && /\{\{t\.paste\}\}<\/text>/.test(crowBlk))
ok('第三枚用的是剪贴板那支图形，不是原来那支链接',
  /glyph-clipboard/.test(crowBlk) && !/glyph-link/.test(crowBlk))

const anyFn = (/onPasteAny\(\)\s*\{([\s\S]*?)\n  \},/).exec(js)
ok('create.js 里有 onPasteAny', !!anyFn)
const anyBody = anyFn ? anyFn[1] : ''
ok('它先挡 busy（与另两枚粘贴同一条规矩）', /if \(this\.data\.busy\) return/.test(anyBody))
ok('它真的读剪贴板：走 wx.getClipboardData', /wx\.getClipboardData\(/.test(anyBody))
/* 平台那一半做不到，靠"没有回话"认出来 ⇒ 必须真有一条超时的路，而且它要说话。
   钉 PASTE_WAIT_MS 那一枚：数写在页顶常量里（与 SLD_* 同一套路），判据现读，不抄字面毫秒。 */
ok('有一条超时兜底，且它把话说出来（图片态两个回调都不回，不兜底就是按下去没反应）',
  /setTimeout\([\s\S]*?PASTE_WAIT_MS/.test(anyBody) && /pasteNoText/.test(anyBody))
ok('超时的毫秒数写在页顶常量、注释里带实测依据（不许在 handler 里手写一个数）',
  /const PASTE_WAIT_MS = (\d+)/.test(js) && /getClipboardData/.test(js))
ok('像链接的串跳「链接」那一档并把串填进 urlInput，其余跳「文字」那一档并填 writeBody',
  /isLink\(s\)/.test(anyBody) && /urlInput: s/.test(anyBody) && /this\.open\('url'\)/.test(anyBody)
  && /writeBody:/.test(anyBody) && /this\.open\('write'\)/.test(anyBody))
ok('粘来的串先 trim（微信分享出去那一坨前后常带空白与句子）', /\.trim\(\)/.test(anyBody))
ok('文字那一档不许顶掉已打好的字（有内容时接在后面，与 onPasteWrite 同一语义）',
  /had \? `\$\{had\.replace\(\/\\s\+\$\/, ''\)\}\\n\$\{s\}` : s/.test(anyBody))
ok('三条出口都说话、不静默，且用词分开：空或读不出＝pasteNoText，fail＝pasteReadFail',
  (anyBody.match(/this\.sayErr\(/g) || []).length >= 3 && !/wx\.showToast/.test(anyBody)
  && /pasteReadFail/.test(anyBody) && /fail:/.test(anyBody))
ok('超时那条在 success／fail 任一回话时清掉（否则回话之后还会再补一句，气泡说两遍）',
  /clearTimeout\(this\._pasteTimer\)/.test(anyBody))

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
// 原来这一条把名单第一个选择器（.bar-lead）写死在正则里，10-10 晚胶囊撤了、那个位置换成
// .blk-cam，它就跟着红——可它要说的事和第一个选择器叫什么无关：**这一枚必须落在带
// mask-repeat/mask-size 的那一组里**，不然只有形状没有遮罩。改成按那一组的实际特征认。
// ⚠ 判据抽成一个函数：上一条用它、下面的反向对照也用它，这样"摘掉就该红"是真拿同一把尺子量的，
// 不是另写一条否定式正则自说自话（10-10 审计点的就是那条：它算的是 `!false`，永远绿）。
const inMaskGroup = (src) => /^[^\n{]*\.paste-glyph[^\n{]*\{[^}]*mask-repeat/m.test(src)
ok('.paste-glyph 挂在 mask 基础组那一行里（不然只有形状没有遮罩）', inMaskGroup(wxss))
ok('.glyph-clipboard 有图形，且与那批同 24 格、同 1.6 描边',
  /mask-image/.test(shape) && /viewBox='0 0 24 24'/.test(shape) && /stroke-width='1\.6'/.test(shape))
// 那串 svg 是 URL 编码进 data-uri 的，尖括号在文件里长这样：%3Crect
ok('图形是剪贴板（板身加夹子），不是随手画的别的形状',
  /%3Crect width='8' height='4' x='8' y='2'/.test(shape) && /M16 4h2a2 2 0 0 1 2 2v14/.test(shape))
// 这一枚与 ✕ 同档（"跟 ✕ 同档"这一条从 10-10 起没变过），变的只是那一档压在哪一面：
// 10-16 最后一趟他拿着真机截图定的「输入框要纯白」⇒ 面回到 `--cp-card` 实心白，
// 字与图形跟着回到墨族那一档 `--cp-ink-62`（这一枚就是它 10-16 之前的值，等于把中间那两趟作废）。
ok('那枚图形与 ✕ 同一档、且是白框上读得出的那一档（跟 ✕ 同档，不抢输入框的视觉重心）',
  /var\(--cp-ink-62\)/.test(glyph) && /var\(--cp-ink-62\)/.test(seg('.field-x')),
  `${glyph.replace(/\s+/g, ' ')}｜✕ ${seg('.field-x').replace(/\s+/g, ' ')}`)

// 反向钉：三处各撤一下，判据必须红（证明钉的是真东西，不是恒真）
const cutPaste = (src) => src.replace(/\s*<view class="field-paste"[\s\S]*?<\/view>/, '')
ok('反向对照一：把那枚整枚撤掉，"找得到粘贴那枚"这条就该红',
  !/catchtap="onPasteUrl"/.test(urlBlock(cutPaste(wxml))) && /catchtap="onPasteUrl"/.test(blk))
ok('反向对照二：把 _sync 那一趟摘掉，那条判据就该红',
  !/this\._sync\(\)/.test(body.replace('this._sync()', '')) && /this\._sync\(\)/.test(body))
// 反向对照三：拿上面那条**同一个谓词**去跑一份被改坏的样式表——把基础组那一行的选择器名单里
// `.paste-glyph` 那一枚抹掉（它自己那条规则留着）。谓词必须翻红，才证明钉的是那一行。
ok('反向对照三：从基础组那一行抹掉 .paste-glyph，上一条立刻红（不是恒真）',
  (() => {
    const line = /^[^\n{]*\{[^}]*mask-repeat/m.exec(wxss)?.[0] || ''
    const cut = line.replace(/\.paste-glyph\s*/, '')
    return line.includes('.paste-glyph') && cut !== line && !inMaskGroup(wxss.replace(line, cut))
  })(), '这一枚从名单里抹掉之后谓词仍然为真＝它上面那条没在管任何东西')

console.log(`验-链接框粘贴：过 ${pass} 条`)
if (fails.length) {
  console.log('✗ 不过 ' + fails.length + ' 条：')
  fails.forEach((f) => console.log('  · ' + f))
  process.exit(1)
}
console.log('全过')
