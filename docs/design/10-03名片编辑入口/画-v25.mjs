/* v25：站长 10-03 晚第三次改这一块的排布——「取消和编辑个人名片放同一行，二维码药丸与分享做成
   组合按钮、通栏；按钮上的字默认"带二维码分享"／"不带二维码分享"，小字挪到按钮下面一行，
   用之前那句详细说明」。并且明确「单独生成按钮这部分的效果图，不需要全部出效果图」，
   所以这一稿只有三条 dock 本身，整屏不画。
   三条：① 新·药丸开着（带二维码分享） ② 新·药丸关着（不带二维码分享） ③ 对照·现网那一版
   跑法：node docs/design/10-03名片编辑入口/画-v25.mjs
        bash docs/design/10-03名片编辑入口/截-v25.sh
   数全部从代码侧现读（1px = 1rpx）：
     弹窗外壳 index.wxss .float-sheet + .tpl-sheet：左右 24、底 #FCFBF8、内边距 20 0 24
     .tpl-dock padding 0 32 → 内容宽 702−64 = 638；这一条按屏上真实 x 摆：左右各留 56（24+32）
     .tpl-actions gap 20 margin-top 20；.tpl-btn flex:1、padding 22 0、圆角 999、字号 26/700
       → 第一行两枚等宽 (638−20)/2 = 309；「取消」52 字宽、余 128.5；「编辑个人名片」156、余 76.5
     .pill 92×52、圆点 40 见方、离边 6、行程 translateX(40)（.pill-on .pill-dot）
     .tpl-btn.primary 底 var(--accent) = #23252C、字 var(--bg-page) = #F2EFE9（app.wxss 默认那套）
     组合按钮高 = 22 + 52（药丸顶高，比 26 那行字 37 高） + 22 = 96；药丸绝对摆在左边内缩 28、上下各 22
       字居中占 638：「带二维码分享」156 → 241..397；「不带二维码分享」182 → 228..410；药丸右沿 120
     小字 .tpl-qr-hint 现值照搬：21／行高 1.45／rgba(35,37,44,.52)，22 字排满 462 < 638 一行走完（截出来墨迹实测 448）
   药丸那一对在墨底上不能照抄现网色：现网 .pill-on 的轨道就是 #23252C，压在同一个墨底上等于没有。
   这一稿把它反过来（轨道吃纸白透明度、圆点吃纸白），几何一个数没改。 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = __dirname
const palette = require(path.join(DIR, '../../../miniprogram/utils/palette.js'))
const i18n = require(path.join(DIR, '../../../miniprogram/utils/i18n.js'))
const ZH = i18n.texts('zh')
const TEN = i18n.texts('en')
const T = palette.TONES
const TIP = palette.TIP_DOT
const PAPER = palette.themeOf('default').page
const INK = '#23252C'
const NEW = {
  editCard: '编辑个人名片',
  qrOn: '带二维码分享', qrOff: '不带二维码分享',
  qrOnEn: 'Share with QR code', qrOffEn: 'Share without QR code',
  v24Hint: '发外部平台建议关闭',
}
const HINT = ZH.qrToggleHint
const HINTW = [...HINT].length

const CSS = `
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{padding:28px 26px 60px;background:#E7E4DD;color:#23252c;
  font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif}
h1{font-size:27px;margin:0 0 10px}.lead{font-size:14.5px;line-height:1.75;color:#4a4d55;max-width:1180px}
h2{font-size:22px;margin:34px 0 10px}
.row{display:flex;gap:26px;margin-top:26px;align-items:flex-start;flex-wrap:wrap}
.cell{display:flex;gap:16px;align-items:flex-start}
.cap{width:392px;font-size:13.5px;line-height:1.78;color:#3d4048}
.cap b{color:#23252c}.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:13px}
.tag{display:inline-block;font-size:12.5px;padding:2px 8px;border-radius:999px;background:#23252c;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#2A2005}.tag.cut{background:#b4231f;color:#fff}
.tag.keep{background:#3E6B4A;color:#F2EFE9}.tag.pick{background:${T[1].bg};color:#fff}
table{border-collapse:collapse;margin-top:14px;background:#fff;border-radius:12px;overflow:hidden}
th,td{border-bottom:1px solid rgba(35,37,44,.1);padding:9px 13px;font-size:13.5px;line-height:1.7;text-align:left;vertical-align:top}
th{background:#23252c;color:#F2EFE9;font-weight:600}
/* 一条 = 弹窗底下那一段 dock，按屏上真实 x 坐标摆：左右各 56（弹窗外缩 24 + dock 内缩 32） */
.strip{width:750px;background:#FCFBF8;padding:20px 56px 24px;outline:2px solid #B9B6AF;border-radius:0 0 32px 32px}
.acts{display:flex;gap:20px;margin-top:20px}
.btn{flex:1;text-align:center;padding:22px 0;border-radius:999px;font-size:26px;font-weight:700;white-space:nowrap}
.btn.ghost{background:transparent;color:rgba(35,37,44,.62);box-shadow:inset 0 0 0 3px rgba(35,37,44,.16)}
.btn.light{background:rgba(35,37,44,.06);color:${INK}}
.btn.pri{background:${INK};color:${PAPER}}
/* 通栏组合按钮：96 高（22 + 药丸 52 + 22），药丸绝对摆在左 28、上下各 22，字居中占整条 638 */
.main{position:relative;margin-top:20px;height:96px;border-radius:999px;background:${INK};color:${PAPER};
  display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;white-space:nowrap}
.main .pill{position:absolute;left:28px;top:22px}
.pill{width:92px;height:52px;border-radius:999px;position:relative;flex:none}
.pill .pd{position:absolute;top:6px;width:40px;height:40px;border-radius:50%}
/* 墨底上轨道与圆点都反过来吃纸白；几何（92×52、点 40、离边 6、行程 40）一个数没改。
   圆点两态都是实心纸白——现网 .pill-dot 本来就只有一档底色，两态差别只靠轨道明暗 + 点位，
   这里跟着同一条规则（第一版我给关着那态的圆点压到 .6，量出来轨道几乎看不见，已改）。 */
.on .pd{left:46px;background:#F2EFE9}.on{background:rgba(242,239,233,.42)}
.off .pd{left:6px;background:#F2EFE9}.off{background:rgba(242,239,233,.16)}
.hint{margin-top:12px;text-align:center;font-size:21px;line-height:1.45;color:rgba(35,37,44,.52)}
/* 对照那条＝现网：二维码那一行在上（药丸吃墨底、摆在纸白上），取消｜分享在下 */
.qr{display:flex;align-items:center;gap:16px;margin-top:16px}
.qr .txt{flex:1;min-width:0}
.qr .lab{display:block;font-size:28px;font-weight:800;color:${INK}}
.qr .sub{display:block;margin-top:2px;font-size:21px;line-height:1.45;color:rgba(35,37,44,.52)}
.paper-on{background:${INK}}.paper-on .pd{left:46px;background:#F2EFE9}
`

const row1 = `<div class="acts">
  <span class="btn ghost">${ZH.cancel}</span>
  <span class="btn light">${NEW.editCard}</span></div>`
const main = (on) => `<div class="main"><span class="pill ${on ? 'on' : 'off'}"><span class="pd"></span></span>
  ${on ? NEW.qrOn : NEW.qrOff}</div>
<div class="hint">${HINT}</div>`

const live = `<div class="qr"><span class="pill paper-on"><span class="pd"></span></span>
  <span class="txt"><span class="lab">${ZH.qrToggle}</span><span class="sub">${HINT}</span></span></div>
  <div class="acts"><span class="btn ghost">${ZH.cancel}</span><span class="btn pri">${ZH.saveAndShare}</span></div>`

const SCREENS = [
  ['s1', `<b>① 新·药丸开着</b>（默认这一态，现网 <code>noQr === false</code>）。<span class="tag">通栏</span>第二行是一枚 <code>638</code> 宽的组合按钮：左边内缩 <b>28</b> 摆药丸（<code>92×52</code>、圆点 <b>40</b>、离边 <b>6</b>、行程 <code>translateX(40)</code>，四个数全照现网），中间那行字吃<b>「${NEW.qrOn}」</b>。<span class="tag new">新串</span><br><b>高 96</b>：上下内缩仍照现网 <code>22 0</code>，中间被药丸的 52 顶起来（那行字只有 37 高），所以比上面那行<b>高 15</b>。要严格等高就把内缩压到 <code>14</code>，代价是药丸上下只剩 14。<br>小字按您的话<b>挪到按钮下面一行</b>，用的就是原来那句详细说明<span class="tag keep">现网原串</span>「${HINT}」——<b>${HINTW} 个字排满 ${HINTW * 21}rpx，截出来这一行墨迹实测 448，比内容宽 638 窄，一行走完不用折</b>（v24 那稿之所以要压成「${NEW.v24Hint}」是因为它挤在第一行里，这一稿那个约束没了，<b>改串撤掉</b>）。<br><b>点法</b>：药丸那一块只切开关、不分享；按钮其余 <code>638−28−92 = 518</code> 那一条都是分享。`, strip(row1 + main(true))],
  ['s2', `<b>② 新·药丸关着</b>：只有按钮上那行字跟着换<span class="tag new">新串</span>「${NEW.qrOff}」（七个字 182，居中占 <code>228..410</code>，跟药丸右沿 120 之间还空 108，不会挤），其余一个数没动。圆点走到左边、轨道从 <code>.42</code> 暗到 <code>.16</code>（圆点两态都是实心纸白，跟现网同一条规则：只靠轨道明暗 + 点位分态）。<br><b>药丸在墨底上必须反色</b>：现网 <code>.pill-on</code> 的轨道就是 <code>#23252C</code>，而组合按钮的底也是 <code>var(--accent) = #23252C</code>——照抄等于看不见。这一稿轨道吃 <code>rgba(242,239,233,.42)</code>／关着 <code>.16</code>，圆点两态都吃实心纸白，<b>几何四个数一个没改</b>。<br>第一行「${ZH.cancel}｜${NEW.editCard}」两枚等宽 <code>(638−20)/2 = 309</code>：「${ZH.cancel}」52 字宽、左右各余 128.5，「${NEW.editCard}」156、各余 76.5。左边那枚仍吃现网 <code>.ghost</code>（透明底 + <code>inset 0 0 0 3px rgba(35,37,44,.16)</code> 描边、字 <code>rgba(35,37,44,.62)</code>），右边那枚吃 <code>.tpl-btn</code> 默认那个 <code>rgba(35,37,44,.06)</code> 淡底。`, strip(row1 + main(false))],
  ['s3', `<b>③ 对照·现网 1.9.14 这一版</b>（数逐条从 <code>index.wxss:1145-1242</code> 读，不是凭印象）：二维码那一行在上——药丸 92×52 吃墨底、圆点纸白，右边「${ZH.qrToggle}」28/800 + 小字 21；<code>.tpl-actions</code> 在下——「${ZH.cancel}｜${ZH.saveAndShare}」两枚等宽 309。<br>对着看这一轮动四处：一、二维码那一行<b>不再单独占一行</b>，药丸搬进主按钮里；二、主按钮从 309 半宽变 <b>638 通栏</b>，字从「${ZH.saveAndShare}」变两态「${NEW.qrOn}／${NEW.qrOff}」；三、小字从药丸右边挪到<b>按钮下面居中</b>，句子一个字不改；四、第一行右那枚从「${ZH.saveAndShare}」换成<span class="tag new">新串</span>「${NEW.editCard}」。<br><span class="tag pick">一处要您认</span>：您这轮打的是"编辑个人<b>信息</b>"，上一轮原话是"编辑个人<b>名片</b>"——这一稿仍按上一轮那四个字画，要改一个字说一声。`, strip(live)],
]

function strip(inner) { return `<div class="strip">${inner}</div>` }
const cell = (id, cap, html) => `<div class="cell">${html}<div class="cap">${cap}</div></div>`

const TABLE = `<h2>这一稿屏上的字与数</h2>
<table><tr><th>项</th><th>出处</th><th>说明</th></tr>
<tr><td>「${NEW.qrOn}」／「${NEW.qrOff}」</td><td><span class="tag new">新串</span></td><td>组合按钮上那行字，跟着 <code>noQr</code> 两态切。英文建议 <code>${NEW.qrOnEn}</code>／<code>${NEW.qrOffEn}</code></td></tr>
<tr><td>「${NEW.editCard}」</td><td><span class="tag new">新串</span></td><td>第一行右那枚，v23 起就是这四个字（您这轮打的是"编辑个人信息"，见屏③最后一条）</td></tr>
<tr><td>「${HINT}」</td><td><span class="tag keep">现网原串</span></td><td><code>qrToggleHint</code> 一个字不改，只从药丸右边挪到按钮下面居中。<b>v24 提的那句改串撤掉</b>——顺带一条：这串同时挂在海报页 <code>share.wxml:16</code>，真改短会连着那页一起变</td></tr>
<tr><td>「${ZH.cancel}」「${ZH.qrToggle}」「${ZH.saveAndShare}」</td><td><span class="tag keep">现网原串</span></td><td>逐字从 <code>utils/i18n.js</code> 读。<code>saveAndShare</code>（${TEN.saveAndShare}）现网只被这一枚吃（<code>index.wxml:302</code>），换成两态新串之后它在这屏就空出来了</td></tr>
<tr><td>内容宽 638 / 第一行 309 / 组合按钮 638×96 / 药丸 92×52 点 40 边 6 程 40 / 小字 21·1.45·@.52</td><td><span class="tag keep">代码现读</span></td><td><code>index.wxss</code> 的 <code>.tpl-dock</code>／<code>.tpl-actions</code>／<code>.tpl-btn</code>／<code>.pill</code>／<code>.tpl-qr-hint</code>，一个数没自己发明</td></tr></table>
<p class="lead" style="margin-top:14px"><b>代码一行没动。</b>真机现在跑的是 <b>1.9.14</b>，那一版这块还是屏③那个样子（二维码一行 + 取消｜分享两枚），这一稿的三处结构改动都只在这张图上。<br>
要动的口子（照实说）：<code>index.wxml:291-303</code> 那一段重排（药丸那一块搬进主按钮、小字挪到按钮下面）+ <code>index.wxss</code> 加一条通栏那枚的样式；药丸那层现网本来就挂着 <code>catchtap="onToggleQr"</code>（<code>:293</code>），搬进主按钮之后<b>必须留着</b>，不然点药丸会冒泡到分享那一枪；字典加两串（中英各两）。<b>尺子有一条要改口</b>：<code>验-详情浮窗两层-真跑.js:240</code> 现在钉的是 <code>tplBtns.join('|') === '取消|分享'</code>，这一版变成 <code>取消|编辑个人名片</code>，且主按钮那枚的文字要按 <code>noQr</code> 两态分别钉；<code>:233</code> 那条"弹窗 dock 有二维码开关 <code>.tpl-qr</code>"也跟着挪进主按钮。</p>`

const PAGE = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v25 · 只画按钮这一块：取消｜编辑个人名片 + 通栏组合按钮（示意，代码一行没动）</title><style>${CSS}</style></head><body>
<h1>v25 · 成品弹窗底下那一段：两枚一行 + 通栏「${NEW.qrOn}／${NEW.qrOff}」组合按钮（示意，代码一行没动）</h1>
<p class="lead">按您这句改的：「取消和编辑个人信息放在同一行，二维码药丸与分享做成组合按钮，通栏按钮。按钮上面的文字默认"${NEW.qrOn}"、"${NEW.qrOff}"，小字在按钮下面一行，用之前的详细说明。」<br>
这一稿<b>只有 dock 那一段</b>，整屏不画。每条 <code>750</code> 宽、按屏上真实 x 摆（左右各 56 = 弹窗外缩 24 + dock 内缩 32），内容区正好 <code>638</code>。三条：① 新·药丸开着 ② 新·药丸关着 ③ 对照·现网 1.9.14。</p>
${SCREENS.map(([id, cap, html]) => `<div class="row">${cell(id, cap, html)}</div>`).join('')}
${TABLE}
</body></html>`

fs.writeFileSync(path.join(DIR, 'v25-按钮区.html'), PAGE)
for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#FFFFFF;display:inline-block}.strip{outline:none;border-radius:0}</style></head>
<body>${html}</body></html>`)
}
console.log(`ok → v25-按钮区.html（${SCREENS.length} 条，另有 .薄页-sN.html 供截图，截完可删）`)
