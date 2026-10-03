/* v22：站长 10-03 第四轮把 v21 的口径改准了——不是"上一层整层不画"，而是
     留头部那一块（「我的笔记」＋右上角那列「4 笔记」），形象图贯穿，中间那批列表件藏掉，
     窗下沿跟底栏拉开，点窗外任意一处都收窗。
   他的原话理由："否则用户不知道自己处于那个状态下""与其他页面保持风格统一，
   让用户知道还在图麦笔记的小程序里面"。
   四屏：① 窗开着·这篇有卡片 ② 窗开着·一篇卡片都没有 ③ 小弹窗维持看得见上一层
        ④ 对照·现网实拍（1.9.13 那版窗开着的样子，直接贴 v19-3 那张真截图）
   跑法：node docs/design/10-03详情页全屏与卡片元素/画-v22.mjs
        bash  docs/design/10-03详情页全屏与卡片元素/截-v22.sh
   数全部从代码侧现读（1px = 1rpx，屏 750×1670，webview 从状态条 94 + 导航条 88 = 182 起）：
     形象图 assets/home-bg-portrait.jpg 实测 865×1670 → poster.bandGeom 走 byWidth 那条：
       width:750 height:Math.round(750*1670/865)=1448；头部那一态 top:-136（锚点 BG_ANCHOR .15），
       贯穿这一态 top:0 —— 同一张图同一个宽，只改一个锚点，1448 高铺到屏底差 40，
       而那 40 正落在底栏那一条（1360..1468）后面，看不见。
     「我的笔记」= .h1：left 32 top 22，42/700 字距 -1，铺图时 rgba(242,239,233,.96)（index.wxss:1089）
     右上角那列 = .stats：right 32 top 24，一格 104 宽居中；数字 64/100 WtsjMind lh .86 纸白@.8，
       下面那两个字 18/700 字距 4 纸白@.62（index.wxss:55、1093、1097）
     图上那层罩 = .head-scrim 那道四段渐变（18,20,26 的 .58/.5/.44/.52），
       透明度吃「调亮度」当前档：默认半月 = opacity .5（palette.BG_DIMS）
     浮窗 = .float-sheet：左右 24、上 130、底 #FCFBF8、圆角 32、投影 0 30 60 rgba(8,10,14,.32)
       下沿这一稿从 152 抬到 192（离底栏那一条从 24 变 64）
     底栏 = custom-tab-bar：离底 20、左右 24、高 108 → 顶到 128；色从 palette.chromeOf 现读
     小弹窗外壳 = me.wxss .pwd-mask／.pwd-card：遮罩 rgba(20,20,28,.55)、宽 620、顶 180
     窗内净宽 = 750−24×2−34×2 = 634 → 左标题 358 + 间 24 + 右格 252
     卡片小样比例吃真跑量出来的 0.717（玉版宣 830×1157）
   屏上每一句中文从 utils/i18n.js 现读；这轮新造的串仍然只有一串（链接下面那句提示）。 */
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
const SHOT = '../10-03两tab与卡片网格/实测/v19-3-详情窗三枚.png'
const PAPER = palette.themeOf('default').page
const PALE = palette.mix('#23252C', PAPER, 0.08)
const I90 = 'rgba(35,37,44,.9)'
const I70 = 'rgba(35,37,44,.7)'
const META = 'rgba(35,37,44,.5)'
const BLUE = T[1].bg
const CH = palette.chromeOf('default')
const DIM = palette.dimAt(1)
/* 头部那三档纸白，逐字抄 index.wxss 的 .container.has-bg 那几条 */
const ON_H1 = 'rgba(242,239,233,.96)'
const ON_N = 'rgba(242,239,233,.8)'
const ON_L = 'rgba(242,239,233,.62)'
const NEW = { info: '卡片上的信息', linkNote: '链接无法直接打开，可复制链接在浏览器打开' }
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
.row{display:flex;gap:26px;margin-top:26px;align-items:flex-start;flex-wrap:wrap}
.cell{display:flex;gap:16px;align-items:flex-start}
.cap{width:392px;font-size:13.5px;line-height:1.78;color:#3d4048}
.cap b{color:#23252c}.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:13px}
.tag{display:inline-block;font-size:12.5px;padding:2px 8px;border-radius:999px;background:#23252c;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#2A2005}.tag.cut{background:#b4231f;color:#fff}.tag.pick{background:${T[1].bg};color:#fff}
.tag.keep{background:#3E6B4A;color:#F2EFE9}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:${PAPER};color:#23252c;
  --fs-h1:42px;--fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --sp-4:32px;--r-card:40px;--r-chip:28px;--r-pill:999px;--w-edge:3px;--edge:rgba(35,37,44,.1)}
.page{position:absolute;inset:0;overflow:hidden}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:26px;font-weight:600}
.nbar{height:88px;position:relative;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;
  border-bottom:2px solid rgba(35,37,44,.06)}
.capsule{position:absolute;right:24px;top:21px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.62);border:1px solid rgba(35,37,44,.12);display:flex;align-items:center;
  justify-content:space-around;font-size:22px}
/* 形象图贯穿：webview 从 182 起，图 750×1448、top 0（头部那一态是 top:-136，只改这一个锚点） */
.thru{position:absolute;left:0;top:182px;width:750px;height:1448px;overflow:hidden}
.thru img{width:750px;height:1448px;object-fit:cover;display:block}
.thru .veil{position:absolute;inset:0;opacity:${DIM.veil};background:linear-gradient(180deg,
  rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 30%,rgba(18,20,26,.44) 62%,rgba(18,20,26,.52) 100%)}
/* 头部那两样照站长这一轮的"都要保留"：逐寸抄 .h1 / .stats */
.h1{position:absolute;left:32px;top:204px;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:${ON_H1}}
.stats{position:absolute;right:32px;top:206px;width:104px;text-align:center}
.stats .n{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:64px;line-height:.86;color:${ON_N}}
.stats .l{display:block;margin-top:10px;font-size:var(--fs-micro);font-weight:700;letter-spacing:4px;color:${ON_L}}
/* 底栏：四屏都画（站长"确认底栏保持可见"）；z 高于小弹窗那层遮罩 */
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
/* 详情浮窗：上沿仍 130（屏上 312），下沿这一稿抬到 192 */
.sheet{position:absolute;left:24px;right:24px;top:312px;bottom:192px;background:#FCFBF8;border-radius:32px;
  display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 60px rgba(8,10,14,.32)}
.sheet .grip{flex:none;height:56px;position:relative;display:flex;align-items:center;justify-content:center}
.sheet .grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.sheet .grip .tx{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;
  font-size:var(--fs-tiny);color:${META}}
.sheet .body{flex:1;min-height:0;overflow:hidden;padding:0 34px;position:relative}
.hero{display:flex;gap:24px;align-items:flex-start;margin-top:10px}
.hero .lt{width:358px;flex:none}
.hero .cat{display:flex;align-items:center;gap:10px;font-size:var(--fs-meta);color:${META}}
.hero .cat i{width:14px;height:14px;border-radius:50%;background:${T[0].bg}}
.hero h2{margin-top:12px;font-size:var(--fs-h2);font-weight:800;line-height:1.3;letter-spacing:-.8px;color:${I90}}
.hero .tags{margin-top:14px;display:flex;gap:10px;flex-wrap:wrap}
.hero .tags u{text-decoration:none;font-size:var(--fs-tiny);font-weight:700;color:#23323C;
  background:rgba(168,188,201,.35);border-radius:8px;padding:5px 12px}
.rt{width:252px;flex:none}
.pad{width:252px;height:352px;border-radius:20px;background:#fff;display:flex;align-items:center;
  justify-content:center;overflow:hidden;box-shadow:0 8px 22px rgba(8,10,14,.10)}
.pg{margin-top:8px;display:flex;align-items:center;justify-content:center;gap:10px}
.pg u{width:36px;height:36px;display:flex;align-items:center;justify-content:center;text-decoration:none;color:rgba(35,37,44,.62)}
.pg u::before{content:'';width:13px;height:13px;border-left:3px solid currentColor;border-bottom:3px solid currentColor;border-radius:2px}
.pg u.l::before{transform:rotate(45deg)}.pg u.r::before{transform:rotate(-135deg)}
.pg b{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:24px;line-height:1;color:rgba(35,37,44,.72)}
.rt .empty{display:flex;flex-direction:column;align-items:center}
.swatch{width:176px;height:176px;border-radius:28px;position:relative;background:${PALE};
  border:var(--w-edge) solid rgba(35,37,44,.10);display:flex;align-items:center;justify-content:center}
.swatch b{font-weight:200;font-size:56px;line-height:1;color:rgba(35,37,44,.42)}
.swatch .lg{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:6px;font-size:var(--fs-micro);
  letter-spacing:1px;color:rgba(35,37,44,.45)}
.swatch .lg i{width:28px;height:28px;border-radius:50%;background:#23252C;color:#F2EFE9;font-size:16px;
  display:flex;align-items:center;justify-content:center;font-style:normal}
.rt .e1{margin-top:18px;font-size:var(--fs-meta);font-weight:700;color:${I90};text-align:center}
.rt .e2{margin-top:6px;font-size:var(--fs-micro);color:${META};text-align:center}
.lab{margin-top:30px;font-size:var(--fs-label);font-weight:800;letter-spacing:1.6px;color:${META}}
p.tx{margin-top:10px;font-size:var(--fs-body);line-height:1.7;color:${I70}}
.pt{margin-top:12px;display:flex;gap:16px;align-items:flex-start}
.pt i{flex:none;width:14px;height:14px;border-radius:50%;background:${TIP};margin-top:12px}
.pt span{font-size:var(--fs-body);line-height:1.55;color:${I90}}
.lnk{margin-top:10px;font-size:var(--fs-meta);line-height:1.5;color:${BLUE};word-break:break-all}
.lnote{margin-top:8px;font-size:var(--fs-tiny);line-height:1.5;color:${META}}
.dock{flex:none;padding:0 34px 26px}
.dock .rule{height:2px;background:rgba(35,37,44,.08);margin:0 -34px 20px}
.dock .irow{display:flex;gap:14px}
.dock .irow b{flex:1;height:88px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-body);font-weight:700;color:${I90};box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.dock .irow b.d{color:#b4231f}
.dock .pub{margin-top:16px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-tiny);color:${META}}
.dock .pub s{color:${I90};text-decoration:underline}
/* 小弹窗：外壳照 me.wxss 的 .pwd-mask／.pwd-card；遮罩在 webview 内，压不到系统那两条 */
.mask{position:absolute;left:0;right:0;top:182px;bottom:0;background:rgba(20,20,28,.55);z-index:30;
  display:flex;justify-content:center}
.mini{width:620px;margin-top:180px;background:#fff;border:var(--w-edge) solid var(--edge);border-radius:var(--r-card);
  padding:40px 32px 32px;align-self:flex-start}
.mini .nm{font-size:var(--fs-h2);font-weight:800;color:${I90}}
.mini .sc{margin-top:14px;font-size:var(--fs-tiny);line-height:1.6;color:${META}}
.mini .acts{margin-top:26px;display:flex;gap:16px}
.mini .acts b{flex:1;height:88px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-body);font-weight:700}
.mini .acts b.g{color:#23252c;box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.mini .acts b.p{background:#23252C;color:#F4F2EC}
/* 卡片小样：只画"这是一张玉版宣"，比例吃真跑量出来的 0.717 */
.art{box-shadow:0 6px 18px rgba(8,10,14,.14);position:relative;overflow:hidden;padding:20px 18px;background:#FBF8F1;color:#17181C}
.art .hd{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:2px;color:rgba(23,24,28,.5)}
.art .hd i{width:15px;height:15px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:9px;display:flex;align-items:center;justify-content:center;font-style:normal}
.art h6{margin-top:14px;font-size:17px;line-height:1.3;font-weight:800;letter-spacing:-.4px}
.art .ln{margin-top:10px;height:8px;border-radius:5px;background:rgba(23,24,28,.13)}
.art .ln.w86{width:86%}.art .ln.w72{width:72%}.art .ln.w58{width:58%}
.art .rule2{margin-top:16px;height:2px;background:rgba(23,24,28,.16)}
.art .ft{position:absolute;left:18px;right:18px;bottom:16px;display:flex;align-items:flex-end;justify-content:space-between}
.art .ft u{width:28px;height:28px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:13px;display:flex;align-items:center;justify-content:center;text-decoration:none}
.art .qr2{width:34px;height:34px;background:repeating-linear-gradient(0deg,#17181C 0 3px,transparent 3px 6px),
  repeating-linear-gradient(90deg,#17181C 0 3px,#FBF8F1 3px 6px);opacity:.75}
/* 对照那一屏：直接贴现网真截图（734×1588 的模拟器实拍），拉到同宽同高摆进来 */
.shot{position:absolute;inset:0}
.shot img{width:750px;height:1670px;object-fit:cover;object-position:center top}
`

const NOTE = {
  cat: '公众号文章 · 09/25', t: '2026微信小程序开发大赛介绍',
  tags: ['微信小程序', '开发大赛', '人工智能', '创新创业'],
  sum: '微信小程序团队联合WAIC创新孵化平台启动2026开发大赛，面向全球征集AI作品。',
  pts: ['大赛由微信小程序团队与WAIC联合启动',
    '主题为"与AI共生"，接入微信AI生态',
    '作品须基于微信小程序技术体系'],
  link: 'https://mp.weixin.qq.com/s/Qh7VdLm2pXw9Rt4Yc',
}

const art = () => `<div class="art" style="width:228px;height:318px">
  <div class="hd"><i>麦</i><span>图麦笔记</span></div><h6>${NOTE.t}</h6>
  <div class="rule2"></div><div class="ln"></div><div class="ln w86"></div><div class="ln w72"></div><div class="ln w58"></div>
  <div class="ft"><u>麦</u><div class="qr2"></div></div></div>`

const thumb = `<div class="pad">${art()}</div>
  <div class="pg"><u class="l"></u><b>1/2</b><u class="r"></u></div>`
const empty = `<div class="empty"><div class="swatch"><span class="lg"><i>麦</i><span>图麦笔记</span></span><b>+</b></div>
  <div class="e1">${ZH.shareAsImage}</div><div class="e2">${ZH.noCards}</div></div>`

const body = `<div class="lab">${ZH.summaryLabel}</div><p class="tx">${NOTE.sum}</p>
  <div class="lab">${ZH.keyPoints}</div>
  ${NOTE.pts.map((p) => `<div class="pt"><i></i><span>${p}</span></div>`).join('')}
  <div class="lab">${ZH.sourceLink}</div><div class="lnk">${NOTE.link}</div>
  <div class="lnote">${NEW.linkNote}</div>`

const dock = `<div class="dock"><div class="rule"></div>
  <div class="irow"><b>${ZH.edit}</b><b class="d">${ZH.delete}</b></div>
  <div class="pub"><span>${ZH.sharedNow}</span><s>${ZH.unshare}</s></div></div>`

const sheet = (right) => `<div class="sheet"><div class="grip"><span class="bar"></span><span class="tx">${ZH.grip}</span></div>
  <div class="body"><div class="hero"><div class="lt">
    <div class="cat"><i></i><span>${NOTE.cat}</span></div><h2>${NOTE.t}</h2>
    <div class="tags">${NOTE.tags.map((x) => `<u>${x}</u>`).join('')}</div></div>
    <div class="rt">${right}</div></div>${body}</div>${dock}</div>`

const thru = `<div class="thru"><img src="${FACE}"><div class="veil"></div></div>
  <div class="h1">${ZH.notesHeading}</div>
  <div class="stats"><span class="n">4</span><span class="l">${ZH.statNotes}</span></div>`
const chrome = `<div class="page">${thru}<div class="status"><span>13:24</span><span>100 ▮</span></div>
  <div class="nbar">图麦笔记<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const tabbar = `<div class="tabbar"><span class="it"><span class="ic plus"><i></i></span></span>
  <span class="it on"><span class="ic rows3"><i></i></span></span>
  <span class="it"><span class="ic user"><i></i></span></span></div>`
const mini = `<div class="mask"><div class="mini">
  <div class="nm">${NEW.info}</div>
  <div class="sc">${ZH.slotHintFull}</div>
  <div class="acts"><b class="g">${ZH.cancel}</b><b class="p">${ZH.confirm}</b></div></div></div>`

const SCREENS = [
  ['s1', `<b>① 窗开着这一态（这篇存过两张卡片）。</b><span class="tag keep">留</span>头部那两样：<b>「${ZH.notesHeading}」</b>那行大字（<code>.h1</code>，left 32／top 22／42/700，铺图时纸白 @96%）和<b>右上角那一列「4 ${ZH.statNotes}」</b>（<code>.stats</code>，right 32／top 24，数字 64/100 走 WtsjMind）。<span class="tag">贯穿</span>形象图从导航条底下一直铺到屏底，罩子仍吃「调亮度」当前档（默认半月 = <code>opacity .5</code>）。<b>贯穿这一态锚点要从 <code>top:-136</code> 改回 <code>0</code></b>：同一张 <code>750×1448</code> 的摆法，头部那一条看到的是图最上面那一段（虚化的背景，人还在窗底下原来的位置、原来大小），而窗底下新空出来的那 64 才有图盖着——不改成 0，1448 高的图从 -136 起铺只到 1312，窗底下那一条会露出纸色。<span class="tag cut">撤</span>中间那批列表件：<b>那张圆角纸卡本体</b>（含它的底色、圆角、上抛的投影）、两枚 tab 和那条通栏横线、分类那一排、下面那批行卡。<span class="tag">留</span>底栏、原生导航条。<br><b>下沿这一稿抬起来</b>：<code>bottom</code> 从 <b>152 → 192</b>，窗和底栏那一条之间的空隙从 <b>24 → 64</b>（底栏顶到 128 这个数不动）。上沿仍 130，所以窗只是矮了 40，窗内四段（摘要／核心要点／来源链接＋那行提示）仍然拍得全。<br><b>点窗外任意一处都收窗</b>：现网 <code>.float-mask</code> 本来就是 <code>fixed inset 0</code>、绑 <code>onCloseDetail</code>，头部那两样在它下面，所以<b>点在「${ZH.notesHeading}」那几个字上也会收窗</b>——这条不用新写。`, chrome + sheet(thumb) + tabbar + '</div>'],
  ['s2', `<b>② 这篇一张卡片都没有</b>：右上那一格是<b>一枚 176 见方的淡底方形 + 左上角图麦 LOGO + 中间 + 号</b>，下面两行小字「${ZH.shareAsImage}」「${ZH.noCards}」都是现网原串。<br>淡底是规则不是色号：有色阶的壁纸吃 <code>ramp.steps[0]</code>（象牙 <code>#EAE0CE</code>／天青 <code>#DDE7DF</code>），米白这套没有色阶就 <code>mix(墨, --bg-page, .08)</code> = <code>${PALE}</code>；描边 <code>rgba(35,37,44,.10)</code>；尺寸吃列表那枚 <code>--blk</code> 176rpx；+ 号 <code>rgba(35,37,44,.42)</code>；LOGO 圆点 28、那四个字 18／字距 1。<br><b>这一格就是唯一入口</b>：点它才出成品弹窗（选模板那一层），底排那枚「${ZH.shareAsImage}」<span class="tag cut">撤</span>之后不留第二个把手。一张都没有时<b>不画 <code>‹ 1/N ›</code> 那一行</b>。头部两样、贯穿、下沿 192 与屏①一模一样。`, chrome + sheet(empty) + tabbar + '</div>'],
  ['s3', `<b>③ 小弹窗「${NEW.info}」维持看得见上一层</b>（站长 10-03 定的）：外壳逐寸照 <code>me.wxss</code> 的密码那一层——遮罩 <code>rgba(20,20,28,.55)</code>、卡片宽 <b>620</b>、离顶 <b>180</b>。所以这一态<b>不藏</b>详情窗，它就是隔着那层 .55 的暗垫着。<br>这一屏只画了外壳和那两句字（四枚位置格与两个输入框跟 v20 屏③④一模一样，没改，就不重画一遍）。<br>两处按平台层读：遮罩 <code>position:fixed;top:0</code> 落在 <b>webview</b> 顶上，而状态条和「图麦笔记」那一条是系统画的、在 webview 外面，<b>压不到</b>（所以那两条没跟着暗）；底栏是 <code>custom-tab-bar</code> 那个自定义组件、WeChat 单独摆一层，<b>页面里的遮罩盖不住它</b>。<b>后一条我是从 <code>index.wxss:891</code> 那句"离底栏 24 + 底栏高 ~128"反推的，还没实测</b>——真做这一版时第一件事就是拿现网私密密码那一层在模拟器拍一张对一遍，对不上我回来改这一屏。`, chrome + sheet(thumb) + tabbar + mini + '</div>'],
  ['s4', `<b>④ 对照：现网 1.9.13 真开着窗的那一张</b>（模拟器实拍，就是您昨天发给我的那三张里的同一个态）。对着看这一轮要动的就四处：<br>一、图区<b>只守头部那 542</b>，窗左右两条缝和窗底下那一条露出来的是<b>那张圆角纸卡和行卡</b>（截图最下面那行「TVB新晋HIFI女歌手」就是从窗底下露出来的）——<b>这就是您说的"两层结构"</b>，这一轮把纸卡和列表件整块藏掉，换成图贯穿。<br>二、窗下沿<b>离底栏只 24</b>，看着就是"贴着"，这一轮抬到 64。<br>三、底排三枚（编辑／删除／<b>${ZH.shareAsImage}</b>）→ 只剩两枚，出卡片的入口挪到右上那一格。<br>四、要点前那列<b>带圈数字 1 2 3 4</b> → 换成头部 Tips 那种 14 小黄点，序号不再显示。<br><span class="tag keep">没动</span>头部那两样（「${ZH.notesHeading}」和右上角那列）现网本来就露在窗上面，这一轮<b>只是不撤它</b>，画法不变。<br>⚠️ 这张实拍是<b>草绿那套壁纸</b>下拍的（底栏那一支深绿、页面底偏青），前三屏画的是<b>米白默认那套</b>（底栏 <code>${CH.bg}</code>、页底 <code>${PAPER}</code>）。底栏那个色是 <code>palette.chromeOf(壁纸)</code> 按同一支色相算出来的，<b>不是这一轮改的</b>，两相对着看时别当成换色。`, `<div class="page"><div class="shot"><img src="${SHOT}"></div></div>`],
]

const cell = (id, cap, html) => `<div class="cell"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`
const PRE = `<h2 style="font-size:26px;margin:34px 0 10px">这一稿改了什么，和一处我按建议先做了、您不同意就说一声</h2>
<p class="lead"><b>四处改动</b>：① 头部那两样<span class="tag keep">留</span>（「${ZH.notesHeading}」大字 + 右上角那列「4 ${ZH.statNotes}」，理由用您的原话：否则用户不知道自己处于哪个状态下）；② 背景<span class="tag">贯穿</span>走<b>形象图</b>（甲），与其他页统一；③ 窗下沿 <code>bottom 152 → 192</code>，离底栏的空隙 <code>24 → 64</code>；④ 点窗外任意一处收窗——<b>这条现网已经是这样</b>（<code>.float-mask</code> 是 <code>inset 0</code> 的透明罩、绑 <code>onCloseDetail</code>，头部那两样在它下面，点在字上也算点窗外），所以不用新写。<span class="tag cut">撤</span>的是中间那批：圆角纸卡本体 + 两枚 tab + 分类行 + 行卡。<br>
<b>贯穿这一项比我上一轮说的便宜得多，这条我要更正。</b>我上一轮写"甲要重算一次 <code>bandGeom</code> 裁切"，量了才发现：这张形象图实测 <b>865×1670</b>，<code>bandGeom</code> 走的是按宽铺那一条（<code>width:750; height:1448</code>），头部那一态只是把它往上挪 <code>top:-136</code> 再裁到 542。<b>贯穿就是同一个宽、同一个高，把锚点从 -136 改回 0</b>；1448 铺到 1488 差的那 40 正好落在底栏那一条（1360..1468）后面，看不见。人脸的位置和大小跟列表那一态完全一样（同一个缩放），只是窗从 130 起把它盖住了。<br>
<span class="tag pick">一处先按建议做了</span>：那层透明罩现在绑的是 <code>bindtap</code>，<b>会冒泡到 <code>.container</code> 的 <code>onBlankTap</code></b>——也就是窗开着时点一下外面，会<b>同时</b>把搜索词清掉（那条是上一轮刚按您原话改的）。我建议<b>改成 <code>catchtap</code>：一次点击只干一件事</b>——先收窗，词留着，<code>✕</code> 才是清词的口。这条我按建议写进实现，不同意说一声。</p>
<p class="lead" style="margin-top:12px"><b>还有一处想跟您对一句口径</b>：贯穿<b>只在窗开着那一段</b>，窗一关掉回列表，图区仍是 542、那张圆角纸卡照旧盖上来（就是屏④那个样子，不动）。因为 09-28 那版"图贯穿全屏 + 列表压在图上"是您打回的，我不擅自把它请回来。要是您其实想让列表那一态也贯穿，那就另开一稿。</p>
<p class="lead" style="margin-top:12px"><b>屏内那篇示例笔记的字被压短了</b>：窗内正文本来就能上下滚，为了把「摘要／核心要点／来源链接＋那行提示」四段一次拍全，示例文字每段只留一到三行。<b>新串这轮仍然只有一串</b>：「${NEW.linkNote}」（您的原话）；其余屏上每一句都是从 <code>utils/i18n.js</code> 现读的。<b>数据这一轮仍然不用动后端</b>：右上那几张卡片读 1.9.13 那份本机台账 <code>cardLog.forNote(noteId)</code>（已按 <code>at</code> 倒序）。</p>`

fs.writeFileSync(path.join(DIR, 'v22-详情窗一层贯穿.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v22 · 详情窗这一层：图贯穿 + 头部两样保留</title><style>${CSS}</style></head><body>
<h1>v22 · 详情窗：形象图贯穿、头部那两样留着、下沿抬到 192（示意，代码一行没动）</h1>
<p class="lead">四屏：<b>1</b> 窗开着·这篇有卡片｜<b>2</b> 窗开着·一篇卡片都没有｜<b>3</b> 小弹窗维持看得见上一层｜<b>4</b> 对照·现网 1.9.13 实拍那一张。<b>底栏四屏都画着</b>。<br>
屏高 <code>750×1670</code>（1px = 1rpx）。浮窗照 <code>index.wxss:886</code> 的 <code>.float-sheet</code>（左右 24、上 130、底 <code>#FCFBF8</code>、圆角 32；130 是相对 webview，加上状态条 94 + 导航条 88 就是屏上 312），<b>下沿这一稿从 152 改到 192</b>；窗内净宽 <code>750−48−68=634</code> 分给左标题 358 + 间 24 + 右格 252；卡片比例吃真跑量出来的 0.717。<span class="tag keep">留</span>这一稿留着的东西；<span class="tag">贯穿</span>背景这一态；<span class="tag new">新串</span>这轮新造的；<span class="tag cut">撤</span>这轮删掉的。</p>
${SCREENS.map(([id, cap, html]) => `<div class="row">${cell(id, cap, html)}</div>`).join('')}
${PRE}
</body></html>`)

for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v22-详情窗一层贯穿.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)
