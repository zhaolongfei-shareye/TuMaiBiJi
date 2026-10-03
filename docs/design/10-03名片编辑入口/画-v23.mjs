/* v23：站长 10-03 傍晚定的这一条——
     「点击生成笔记卡片后，拉起笔记窗口，在卡片预览图上，增加一个按钮，编辑个人名片。
       就是下方三个按钮，取消，编辑个人名片，分享。三个按钮。你出效果图。」
   三屏：① 成品弹窗底排从两枚变三枚 ② 点中间那枚浮出「卡片上的信息」小弹窗 ③ 对照·现网实拍两枚
   跑法：node docs/design/10-03名片编辑入口/画-v23.mjs
        bash docs/design/10-03名片编辑入口/截-v23.sh
   数全部从代码侧现读（1px = 1rpx，屏 750×1670，webview 从状态条 94 + 导航条 88 = 182 起）：
     弹窗外壳 = index.wxss .float-sheet：左右 24、top 130（屏上 312）、bottom 192、底 #FCFBF8、圆角 32、
       投影 0 30 60 rgba(8,10,14,.32)；.tpl-sheet 只是 align-items:center + padding 20 0 24
     把手行 .grip 高 56（条 88×8），左右各一句：swipeHint / grip
     .tpl-body flex:1 + padding 0 24；.tpl-poster 宽高由 js 按海报比例写进 style（这里画 502×700，
       比例 0.717 = 真跑量出来的玉版宣 830×1157）；.tpl-dots 每枚 10、当前那枚 16、间 12
     .tpl-dock padding 0 32 → 内容宽 702−64 = 638
     .tpl-actions gap 20、margin-top 20；.tpl-btn flex:1、padding 22 0、圆角 999、字号 26/700
       两枚时每枚 (638−20)/2 = 309；三枚时每枚 (638−40)/3 = 199.3
       「编辑个人名片」六个汉字 = 6×26 = 156 < 199.3 → 放得下，不用缩字号也不用折行
     小弹窗外壳 = me.wxss .pwd-mask／.pwd-card：遮罩 rgba(20,20,28,.55)、宽 620、离顶 180、圆角 40、
       描边 3 rgba(35,37,44,.1)、白底；卡内净宽 620−64 = 556 = 4×124 + 3×20（四格一排放满不滚）
     垃圾桶 = profile.wxss .bin：44 见方、离格边 2、rgba(20,22,26,.72) 深圆 + 2rpx 白描边 + 三笔线形桶
     名称／一句话 = profile.wxss .field-label（--fs-meta 24／700）与 .field-input（--fs-title 31／600），
       这一稿照现网原档，不采用 v20 那稿"压到 28／间距 8"的写法
   屏上每一句中文都从 utils/i18n.js 现读；这轮新造的串列在文末表里。 */
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
const T = palette.TONES
const TIP = palette.TIP_DOT
const FACE = '../../../miniprogram/assets/home-bg-portrait.jpg'
const SHOT = '../笔记列表-堆叠卡/实测-详情浮窗/04-模板弹窗.png'
const PAPER = palette.themeOf('default').page
const CH = palette.chromeOf('default')
const DIM = palette.dimAt(1)
const I90 = 'rgba(35,37,44,.9)'
const META = 'rgba(35,37,44,.5)'
/* 这一轮屏上新造的串（其余每一句都是现网字典里现读的） */
const NEW = {
  info: '卡片上的信息',
  replace: '更换',
  editCard: '编辑个人名片',
  slot3: '位置 3', slot4: '位置 4',
  hint: '这四张就是卡片上的人和名字。换一张点「更换」，不要了点右上角的垃圾桶。',
}
const GLYPH = {
  plus: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12h14' /%3E %3Cpath d='M12 5v14' /%3E%3C/svg%3E",
  rows3: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' /%3E %3Cpath d='M21 9H3' /%3E %3Cpath d='M21 15H3' /%3E%3C/svg%3E",
  user: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5' /%3E %3Cpath d='M20 21a8 8 0 0 0-16 0' /%3E%3C/svg%3E",
}
const FONT = fs.readFileSync(path.join(DIR, '../../../miniprogram/app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]

const CSS = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${FONT}) format('truetype');font-weight:100;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{padding:28px 26px 60px;background:#E7E4DD;color:#23252c;
  font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif}
h1{font-size:27px;margin:0 0 10px}.lead{font-size:14.5px;line-height:1.75;color:#4a4d55;max-width:1560px}
h2{font-size:22px;margin:34px 0 10px}
.row{display:flex;gap:26px;margin-top:26px;align-items:flex-start;flex-wrap:wrap}
.cell{display:flex;gap:16px;align-items:flex-start}
.cap{width:392px;font-size:13.5px;line-height:1.78;color:#3d4048}
.cap b{color:#23252c}.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:13px}
.tag{display:inline-block;font-size:12.5px;padding:2px 8px;border-radius:999px;background:#23252c;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#2A2005}.tag.cut{background:#b4231f;color:#fff}.tag.pick{background:${T[1].bg};color:#fff}
.tag.keep{background:#3E6B4A;color:#F2EFE9}
table{border-collapse:collapse;margin-top:14px;background:#fff;border-radius:12px;overflow:hidden}
td,th{font-size:13.5px;padding:9px 14px;border-bottom:1px solid #E7E4DD;text-align:left}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:${PAPER};color:#23252c;
  --fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --r-card:40px;--r-pill:999px;--w-edge:3px;--edge:rgba(35,37,44,.1);--accent:#23252c}
.page{position:absolute;inset:0;overflow:hidden}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:26px;font-weight:600}
.nbar{height:88px;position:relative;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;
  border-bottom:2px solid rgba(35,37,44,.06)}
.capsule{position:absolute;right:24px;top:21px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.62);border:1px solid rgba(35,37,44,.12);display:flex;align-items:center;
  justify-content:space-around;font-size:22px}
.thru{position:absolute;left:0;top:182px;width:750px;height:1448px;overflow:hidden}
.thru img{width:750px;height:1448px;object-fit:cover;display:block}
.thru .veil{position:absolute;inset:0;opacity:${DIM.veil};background:linear-gradient(180deg,
  rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 30%,rgba(18,20,26,.44) 62%,rgba(18,20,26,.52) 100%)}
.h1t{position:absolute;left:32px;top:204px;font-size:42px;font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.stats{position:absolute;right:32px;top:206px;width:104px;text-align:center}
.stats .n{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:64px;line-height:.86;color:rgba(242,239,233,.8)}
.stats .l{display:block;margin-top:10px;font-size:var(--fs-micro);font-weight:700;letter-spacing:4px;color:rgba(242,239,233,.62)}
.tabbar{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;z-index:40;
  background:${CH.bg};border:3px solid ${CH.line};box-shadow:0 16px 44px ${CH.shadow};
  display:flex;align-items:center}
.tabbar .it{flex:1;display:flex;align-items:center;justify-content:center;color:${CH.idle}}
.tabbar .it.on{color:${CH.ink}}
.tabbar .ic{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center}
.tabbar .it.on .ic{background:${CH.sel}}
.tabbar .ic i{width:40px;height:40px;background-color:currentColor;-webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain}
.tabbar .ic.plus i{-webkit-mask-image:url("${GLYPH.plus}");mask-image:url("${GLYPH.plus}")}
.tabbar .ic.rows3 i{-webkit-mask-image:url("${GLYPH.rows3}");mask-image:url("${GLYPH.rows3}")}
.tabbar .ic.user i{-webkit-mask-image:url("${GLYPH.user}");mask-image:url("${GLYPH.user}")}
/* 成品弹窗：外壳与详情窗同一个 .float-sheet（左右 24、屏上 312、下沿 192） */
.sheet{position:absolute;left:24px;right:24px;top:312px;bottom:192px;background:#FCFBF8;border-radius:32px;
  display:flex;flex-direction:column;align-items:center;overflow:hidden;box-shadow:0 30px 60px rgba(8,10,14,.32);
  padding:20px 0 24px;z-index:20}
.grip{flex:none;width:100%;height:56px;position:relative;display:flex;align-items:center;justify-content:center}
.grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.grip .tx{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;font-size:var(--fs-tiny);color:${META}}
.grip .txl{position:absolute;left:34px;top:0;height:56px;display:flex;align-items:center;font-size:var(--fs-tiny);color:${META}}
.body{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  overflow:hidden;padding:0 24px}
.poster{width:502px;height:700px;flex:none;border-radius:20px;box-shadow:0 12px 30px rgba(8,10,14,.18);
  background:#FBF8F1;color:#17181C;padding:34px 30px;position:relative;overflow:hidden}
.poster .hd{display:flex;align-items:center;gap:10px;font-size:16px;letter-spacing:2px;color:rgba(23,24,28,.55)}
.poster .hd i{width:26px;height:26px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:15px;font-style:normal;
  display:flex;align-items:center;justify-content:center}
.poster h6{margin-top:24px;font-size:34px;line-height:1.28;font-weight:800;letter-spacing:-1px}
.poster .rule{margin-top:22px;height:2px;background:rgba(23,24,28,.16)}
.poster .ln{margin-top:14px;height:11px;border-radius:6px;background:rgba(23,24,28,.13)}
.poster .w86{width:86%}.poster .w72{width:72%}.poster .w58{width:58%}
.poster .ft{position:absolute;left:30px;right:30px;bottom:26px;display:flex;align-items:flex-end;justify-content:space-between}
.poster .who{display:flex;align-items:center;gap:12px}
.poster .who img{width:56px;height:56px;border-radius:50%;object-fit:cover}
.poster .who u{text-decoration:none;font-size:19px;font-weight:700;color:rgba(23,24,28,.75)}
.poster .qr2{width:52px;height:52px;background:repeating-linear-gradient(0deg,#17181C 0 4px,transparent 4px 8px),
  repeating-linear-gradient(90deg,#17181C 0 4px,#FBF8F1 4px 8px);opacity:.75;border-radius:6px}
.dots{flex:none;display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px}
.dots i{width:10px;height:10px;border-radius:50%;opacity:.55}
.dots i.on{width:16px;height:16px;opacity:1}
.dock{flex:none;width:100%;padding:0 32px}
.qr{margin-top:16px;display:flex;align-items:center;gap:16px}
.pill{flex:none;position:relative;width:92px;height:52px;border-radius:999px;background:#23252C}
.pill .pd{position:absolute;left:44px;top:6px;width:40px;height:40px;border-radius:50%;background:#fff;
  transition:left 160ms ease-out}
.qr .lab{font-size:var(--fs-body);font-weight:800;color:#23252C}
.qr .hint{display:block;margin-top:2px;font-size:var(--fs-tiny);line-height:1.45;color:rgba(35,37,44,.52)}
.acts{display:flex;gap:20px;margin-top:20px}
.btn{flex:1;text-align:center;padding:22px 0;border-radius:var(--r-pill);font-size:26px;font-weight:700;
  white-space:nowrap}
.btn.ghost{background:transparent;color:rgba(35,37,44,.62);box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.btn.mid{background:rgba(35,37,44,.06);color:#23252C}
.btn.pri{background:var(--accent);color:${PAPER}}
/* 小弹窗：外壳逐寸照 me.wxss 的密码那一层 */
.mask{position:absolute;left:0;right:0;top:182px;bottom:0;background:rgba(20,20,28,.55);z-index:30;
  display:flex;justify-content:center}
.mini{width:620px;margin-top:180px;align-self:flex-start;background:#fff;border:var(--w-edge) solid var(--edge);
  border-radius:var(--r-card);padding:40px 32px 32px}
.mini .nm{font-size:var(--fs-h2);font-weight:800;color:${I90}}
.mini .sc{margin-top:14px;font-size:var(--fs-meta);line-height:1.6;color:${META}}
.slots{margin-top:26px;display:flex;gap:20px}
.sl{position:relative;width:124px;flex:none}
.sl .disc{position:relative;width:124px;height:124px;border-radius:50%;overflow:hidden;background:rgba(35,37,44,.06);
  display:flex;align-items:center;justify-content:center;border:2px dashed rgba(35,37,44,.18)}
.sl.has .disc{border:none}
.sl .disc img{width:100%;height:100%;object-fit:cover}
.sl .plus{font-size:44px;font-weight:300;color:rgba(35,37,44,.4)}
.sl .bin{position:absolute;right:2px;top:2px;width:44px;height:44px;border-radius:50%;
  background:rgba(20,22,26,.72);border:2px solid rgba(255,255,255,.92);
  display:flex;align-items:center;justify-content:center}
.sl .bg{position:relative;width:18px;height:17px}
.sl .bg .lid{position:absolute;left:0;right:0;top:4px;height:2px;background:#fff;border-radius:1px}
.sl .bg .lid::before{content:"";position:absolute;left:5px;right:5px;top:-3px;height:2px;background:#fff;border-radius:2px}
.sl .bg .bd{position:absolute;left:2px;right:2px;top:6px;bottom:0;border:2px solid #fff;border-top:none;border-radius:0 0 4px 4px}
.sl .repl{position:absolute;left:0;right:0;bottom:0;height:34px;background:rgba(20,20,28,.52);color:#fff;
  font-size:var(--fs-micro);font-weight:700;display:flex;align-items:center;justify-content:center;
  border-radius:0 0 0 0}
.sl .role{margin-top:10px;text-align:center;font-size:var(--fs-micro);font-weight:700;color:${META}}
.sl .role u{text-decoration:none;padding:3px 10px;border-radius:8px;background:${T[0].bg};color:${T[0].ink}}
.fld{margin-top:26px}
.fld .k{font-size:var(--fs-meta);font-weight:700;color:rgba(35,37,44,.7)}
.fld .v{margin-top:16px;font-size:var(--fs-title);font-weight:600;color:${I90};padding-bottom:12px;border-bottom:2px solid rgba(35,37,44,.12)}
.mini .acts2{margin-top:32px;display:flex;gap:16px}
.mini .acts2 b{flex:1;height:88px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-body);font-weight:700}
.mini .acts2 b.g{color:#23252c;box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.mini .acts2 b.p{background:#23252C;color:#F4F2EC}
.shot{position:absolute;inset:0}
.shot img{width:750px;height:1670px;object-fit:cover;object-position:center top}
`

const NOTE_T = '2026微信小程序开发大赛介绍'
const chrome = `<div class="page"><div class="thru"><img src="${FACE}"><div class="veil"></div></div>
  <div class="h1t">${ZH.notesHeading}</div>
  <div class="stats"><span class="n">4</span><span class="l">${ZH.statNotes}</span></div>
  <div class="status"><span>17:58</span><span>100 ▮</span></div>
  <div class="nbar">${ZH.appName}<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const tabbar = `<div class="tabbar"><span class="it"><span class="ic plus"><i></i></span></span>
  <span class="it on"><span class="ic rows3"><i></i></span></span>
  <span class="it"><span class="ic user"><i></i></span></span></div>`
const poster = `<div class="poster"><div class="hd"><i>麦</i><span>${ZH.appName}</span></div>
  <h6>${NOTE_T}</h6><div class="rule"></div><div class="ln"></div><div class="ln w86"></div>
  <div class="ln w72"></div><div class="ln w58"></div>
  <div class="ft"><span class="who"><img src="${FACE}"><u>平安喜乐</u></span><span class="qr2"></span></div></div>`
const dots = `<div class="dots">${T.slice(0, 6).map((x, i) =>
  `<i class="${i === 0 ? 'on' : ''}" style="background:${x.bg}"></i>`).join('')}</div>`
const qr = `<div class="qr"><span class="pill"><span class="pd"></span></span>
  <span class="lab">${ZH.qrToggle}<span class="hint">${ZH.qrToggleHint}</span></span></div>`
const three = `<div class="acts"><span class="btn ghost">${ZH.cancel}</span>
  <span class="btn mid">${NEW.editCard}</span><span class="btn pri">${ZH.saveAndShare}</span></div>`
const two = `<div class="acts"><span class="btn ghost">${ZH.cancel}</span>
  <span class="btn pri">${ZH.saveAndShare}</span></div>`
const sheet = (acts) => `${chrome}<div class="sheet">
  <div class="grip"><span class="bar"></span><span class="txl">${ZH.swipeHint}</span><span class="tx">${ZH.grip}</span></div>
  <div class="body">${poster}${dots}</div><div class="dock">${qr}${acts}</div></div>${tabbar}</div>`

const sl = (i, role) => {
  const has = !!role
  const cap = has ? `<u>${role === 'card' ? ZH.slotCard : ZH.slotBg}</u>` : `位置 ${i}`
  return `<div class="sl ${has ? 'has' : ''}">
  <div class="disc">${has ? `<img src="${FACE}"><span class="repl">${NEW.replace}</span>` : '<span class="plus">+</span>'}</div>
  ${has ? '<span class="bin"><span class="bg"><span class="lid"></span><span class="bd"></span></span></span>' : ''}
  <div class="role">${cap}</div></div>`
}
const mini = `<div class="mask"><div class="mini"><div class="nm">${NEW.info}</div>
  <div class="sc">${NEW.hint}</div>
  <div class="slots">${sl(1, 'card')}${sl(2, 'bg')}${sl(3, '')}${sl(4, '')}</div>
  <div class="fld"><div class="k">${ZH.profileName}</div><div class="v">平安喜乐</div></div>
  <div class="fld"><div class="k">${ZH.profileSlogan}</div><div class="v">月圆人安，岁岁圆满</div></div>
  <div class="acts2"><b class="g">${ZH.cancel}</b><b class="p">${ZH.save}</b></div></div></div>`

const SCREENS = [
  ['s1', `<b>① 成品弹窗底排：两枚 → 三枚</b>（您这一句就是这一屏）。<span class="tag new">新串</span>中间那枚「${NEW.editCard}」，左右两枚都是现网原串「${ZH.cancel}」「${ZH.saveAndShare}」。<br><b>宽度是量过的，不是估的</b>：弹窗内容宽 <code>750−24×2−32×2=638</code>，三枚之间两条 <code>gap 20</code>，每枚 <code>(638−40)/3 = 199.3rpx</code>；「${NEW.editCard}」六个汉字按 <code>26rpx</code> 字号是 <code>156rpx</code>，<b>放得下，还剩 43</b>——不用缩字号、不会折行（两枚那档是 309，所以这一改每枚窄了 110）。<br>三枚的层阶：左「${ZH.cancel}」描边空心（现网 <code>.ghost</code>），中「${NEW.editCard}」淡底实心（现网 <code>.tpl-btn</code> 那个 <code>rgba(35,37,44,.06)</code>），右「${ZH.saveAndShare}」实心主色——<b>主操作仍只有最右那一枚</b>，中间这枚不能也上主色，否则一屏两个"最要紧"。<br>上面那些一行没动：海报 <code>502×700</code>（比例 0.717 是真跑量出来的玉版宣 830×1157）、六枚模板点、那行「${ZH.qrToggle}」开关、把手行左右那两句。`, sheet(three) + '</div>'],
  ['s2', `<b>② 点中间那枚，浮出「${NEW.info}」</b>——外壳逐寸照现网私密密码那一层（<code>.pwd-mask</code>／<code>.pwd-card</code>）：遮罩 <code>rgba(20,20,28,.55)</code>、卡片宽 <b>620</b>、离顶 <b>180</b>、圆角 40、白底描边 3。它<b>盖在成品弹窗上面</b>，所以背后那张卡片还看得见（隔着那层 .55 的暗），跟密码那一层同一个读法。<br>里面一次填完三样，全是从「我的→卡片模板」那一页搬过来的同一批数据：<b>四张位置的图</b>（卡内净宽 <code>620−64=556 = 4×124 + 3×20</code>，一排放满不滚）、<b>${ZH.profileName}</b>、<b>${ZH.profileSlogan}</b>（两个标签和占位字都是现网原串，这里显示的是回填的上次值）。<br><span class="tag new">新串</span>「${NEW.replace}」压在<b>有图那两枚</b>的下沿：点它直接选一张换掉这一格，<b>不用先删</b>——这条就是您上一轮问的那个逻辑，现网是"点照片本身什么都不做，必须先垃圾桶删一格"（<code>profile.js:164</code> 那句注释写着理由：误一下把在用的图换掉代价太大）。<b>单独一枚「${NEW.replace}」把误点隔开了，所以这条顾虑不冲突</b>。右上角那枚垃圾桶画法照现网 <code>profile.wxss</code> 的 <code>.bin</code>（<b>44 见方、离格边 2、<code>rgba(20,22,26,.72)</code> 深圆 + 2rpx 白描边 + 里面那三笔线形桶</b>，不是"×"），删掉这一格仍要它。<br><span class="tag pick">一处要您认</span>：这四枚<b>下面只写它现在的角色</b>（「${ZH.slotCard}」「${ZH.slotBg}」，没设角色的写<span class="tag new">新串</span>「${NEW.slot3}」「${NEW.slot4}」），<b>不给那两枚开关</b>。理由是开关只留在「我的→卡片模板」那一页，这里放了就是同一件事两个地方能改；换一张图时角色沿用旧的。要是您想让角色也在这里改，说一声，两枚胶囊搬进来就是。<br>下面两枚「${ZH.cancel}／${ZH.save}」：右按钮用现网 <code>save</code> 那个「${ZH.save}」，<b>不另起「上传」</b>（v20 那稿写的是"上传"，那是新串；这页存的东西和那一页存的是同一份，叫法该一样）。`, sheet(three) + mini + '</div>'],
  ['s3', `<b>③ 对照：现网 1.9.14 真开着这个弹窗的那一张</b>（模拟器实拍，底排就是两枚「${ZH.cancel}｜${ZH.saveAndShare}」）。对着看这一轮只动两处：<br>一、底排<b>两枚 → 三枚</b>，中间加「${NEW.editCard}」。<br>二、点它浮出屏②那层小弹窗——<b>现网没有这一层</b>，四张位置的图、名称、一句话现在都在「我的→卡片模板」那一整页里改，从卡片这儿过去要收窗、切 tab、翻一屏再翻回来。<br><span class="tag keep">没动</span>海报本身、六枚模板点、左右滑换模板、那行「${ZH.qrToggle}」开关、把手行那两句、点窗外收窗、收窗回详情窗（这三个口上一轮刚钉住）。<br>⚠️ <b>这一屏是 1.9.14 的实拍，那版底排右枚还写着「保存并分享」</b>——上一轮已经改成「${ZH.saveAndShare}」，还没出包，所以这张对照图上看到的是旧名，不是我改漏了。`, `<div class="page"><div class="shot"><img src="${SHOT}"></div></div>`],
]

const cell = (id, cap, html) => `<div class="cell"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`
const TABLE = `<h2>这一轮屏上的新串只有四组，其余每一句都是现网字典里现读的</h2>
<table><tr><th>串</th><th>出处</th><th>说明</th></tr>
<tr><td>「${NEW.editCard}」</td><td><span class="tag new">新串</span></td><td>您的原话。六字 156rpx，三枚那档每枚 199.3rpx，放得下</td></tr>
<tr><td>「${NEW.info}」／「${NEW.hint}」</td><td><span class="tag new">新串</span></td><td>小弹窗标题与那一句说明（v20 那稿就是这两句，没改）</td></tr>
<tr><td>「${NEW.replace}」</td><td><span class="tag new">新串</span></td><td>有图那一格下沿那枚胶囊（v20 那稿同一条）</td></tr>
<tr><td>「${NEW.slot3}」／「${NEW.slot4}」</td><td><span class="tag new">新串</span></td><td>没设角色的那一格下面写的字（v20 同一条）</td></tr>
<tr><td>「${ZH.cancel}」「${ZH.saveAndShare}」「${ZH.save}」「${ZH.profileName}」「${ZH.profileSlogan}」「${ZH.slotCard}」「${ZH.slotBg}」「${ZH.qrToggle}」「${ZH.swipeHint}」「${ZH.grip}」</td><td><span class="tag keep">现网原串</span></td><td>逐字从 <code>utils/i18n.js</code> 读，占位字与标签都不新造</td></tr></table>
<p class="lead" style="margin-top:14px"><b>代码一行没动。</b>这一稿只是把您那句话画成三屏，实现要等您点头。落地时的三处代价先摆在这儿：一、成品弹窗底排从两枚改三枚，<code>验-详情浮窗两层-真跑</code> 里钉"两枚等宽等高"和"取消｜分享"那两条要跟着改；二、小弹窗里那四格与「我的→卡片模板」那一页读的是同一份本机四槽（<code>poster.readSlots()</code>），<b>两处都要能改同一份数据，改完另一处得跟着刷新</b>（那一页现在是 <code>onShow</code> 重读，从弹窗回去会走到，不用新写）；三、「${NEW.replace}」这条要动 <code>profile.js:164</code> 那个"点已放满的格子不响应"的口径——不是删掉它，是<b>多一个明确的口</b>，那一页上要不要也给这枚「${NEW.replace}」，等您一并定（给：两处同一个动作；不给：只有弹窗里能直接换）。</p>`

fs.writeFileSync(path.join(DIR, 'v23-名片编辑入口.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v23 · 成品弹窗加一枚「${NEW.editCard}」</title><style>${CSS}</style></head><body>
<h1>v23 · 卡片预览那一屏底排三枚：${ZH.cancel}｜${NEW.editCard}｜${ZH.saveAndShare}（示意，代码一行没动）</h1>
<p class="lead">三屏：<b>1</b> 成品弹窗底排三枚｜<b>2</b> 点中间那枚浮出「${NEW.info}」小弹窗｜<b>3</b> 对照·现网 1.9.14 实拍两枚。<br>
屏高 <code>750×1670</code>（1px = 1rpx）。弹窗外壳照 <code>index.wxss</code> 的 <code>.float-sheet</code> + <code>.tpl-sheet</code>（左右 24、屏上 312、下沿 192、底 <code>#FCFBF8</code>、圆角 32、内边距 20 0 24）；底排照 <code>.tpl-actions</code>／<code>.tpl-btn</code>（gap 20、padding 22 0、字号 26/700）；小弹窗外壳照 <code>me.wxss</code> 的 <code>.pwd-mask</code>／<code>.pwd-card</code>（遮罩 .55、宽 620、离顶 180）；四格与垃圾桶照 <code>profile.wxss</code>（124 圆、bin 34 出格 2）。</p>
${SCREENS.map(([id, cap, html]) => `<div class="row">${cell(id, cap, html)}</div>`).join('')}
${TABLE}
</body></html>`)

for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v23-名片编辑入口.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)
