/* v21：详情不做全屏了，仍走现网那层浮窗，但把"上一层"藏掉——只留背景贯穿 + 底栏。
   四屏：甲（形象图贯穿）／乙（只留主题底色）／空态那一格／小弹窗维持看得见上一层。
   屏高 750×1670（1px = 1rpx）。数全部从代码侧取：
     .float-sheet 左/右 24、上 130、下 152、圆角 32、底 #FCFBF8（index.wxss:886）
     .ds-in 内缩 34（index.wxss:675）→ 窗内净宽 702−68 = 634
     .grip 高 56（index.wxss:634）
     底栏 = 离底 20 + 高 108 → 顶到 128，再留 24 空隙 = 152（custom-tab-bar/index.wxss:6 那三条数）
     状态条 94 + 原生导航条 88 = 182；图区 542 从 182 起
   界面上每一句中文都从 utils/i18n.js 现读（不手抄），新造的串一律标 新串。
   跑法：node docs/design/10-03详情页全屏与卡片元素/画-v21.mjs */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = __dirname
const palette = require(path.join(DIR, '../../../miniprogram/utils/palette.js'))
const i18n = require(path.join(__dirname, '../../../miniprogram/utils/i18n.js'))
const ZH = i18n.texts('zh')
const T = palette.TONES
const TIP = palette.TIP_DOT
const FACE = '../../../miniprogram/assets/home-bg-portrait.jpg'
/* 淡底那一枚的规则：有色阶的主题吃 steps[0]，米白那套从页底掺 8% 墨（v20 第三轮定的） */
const PAPER = palette.themeOf('default').page
const PALE = palette.mix('#23252C', PAPER, 0.08)
const I90 = 'rgba(35,37,44,.9)'
const I70 = 'rgba(35,37,44,.7)'
const META = 'rgba(35,37,44,.5)'
const BLUE = T[1].bg
const PAGE = palette.themeOf('default').page

/* 这一稿只有两串是新造的：小弹窗的标题／那行入口，和链接下面那句提示（站长原话） */
const NEW = { info: '卡片上的信息', linkNote: '链接无法直接打开，可复制链接在浏览器打开' }

const FONT = fs.readFileSync(path.join(DIR, '../../../miniprogram/app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]
/* 底栏：站长 10-03 明确"保持可见"，所以这一态它仍画。几何与颜色一律不自己发明——
   逐字抄 custom-tab-bar/index.wxss（bottom 20、左右 24、高 108、圆角 44、描边 3；图标 40 吃 mask、圆底 76），
   色从 palette.chromeOf(壁纸) 现读（默认那套 bg #443c25 / sel #796b41 / idle 纸白@62% / ink 纸白）。
   三枚图形是 Lucide plus / rows3 / user-round 的 mask，这里直接搬同一段 data URI。 */
const CH = palette.chromeOf('default')
const GLYPH = {
  plus: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12h14' /%3E %3Cpath d='M12 5v14' /%3E%3C/svg%3E",
  rows3: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' /%3E %3Cpath d='M21 9H3' /%3E %3Cpath d='M21 15H3' /%3E%3C/svg%3E",
  user: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='5' /%3E %3Cpath d='M20 21a8 8 0 0 0-16 0' /%3E%3C/svg%3E",
}
const CSS = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${FONT}) format('truetype');font-weight:100;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{margin:0;padding:28px 26px 60px;background:#E7E4DD;color:#23252c;
  font-family:-apple-system,"PingFang SC","Helvetica Neue",sans-serif}
h1{font-size:27px;margin:0 0 10px}.lead{font-size:14.5px;line-height:1.75;color:#4a4d55;max-width:1560px}
.row{display:flex;gap:26px;margin-top:26px;align-items:flex-start;flex-wrap:wrap}
.cell{display:flex;gap:16px;align-items:flex-start}
.cap{width:392px;font-size:13.5px;line-height:1.78;color:#3d4048}
.cap b{color:#23252c}.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:13px}
.tag{display:inline-block;font-size:12.5px;padding:2px 8px;border-radius:999px;background:#23252c;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#2A2005}.tag.cut{background:#b4231f;color:#fff}.tag.pick{background:${T[1].bg};color:#fff}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:${PAGE};color:#23252c;
  --fs-h1:42px;--fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --sp-4:32px;--r-card:40px;--r-chip:28px;--r-pill:999px;--w-edge:3px;--edge:rgba(35,37,44,.1)}
.page{position:absolute;inset:0;overflow:hidden}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;font-size:26px;font-weight:600}
/* 原生导航条：这一页不走 custom，图麦笔记那三个字和胶囊都是系统画的那一条 */
.nbar{height:88px;position:relative;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;
  border-bottom:2px solid rgba(35,37,44,.06)}
.capsule{position:absolute;right:24px;top:21px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.62);border:1px solid rgba(35,37,44,.12);display:flex;align-items:center;
  justify-content:space-around;font-size:22px}
/* 背景那一层：甲＝形象图贯穿整屏（从导航条下面一直铺到底）；乙＝只有主题底色 */
.bg-full{position:absolute;left:0;right:0;top:182px;bottom:0;overflow:hidden}
.bg-full img{width:100%;height:100%;object-fit:cover;object-position:50% 16%}
.bg-full .scrim{position:absolute;inset:0;background:rgba(20,20,28,.5)}
/* 底栏：站长 10-03 明确"保持可见"，四屏都画。z-index 高于小弹窗那层遮罩——
   它是自定义 tab bar，WeChat 单独一层，页面里的 fixed 遮罩压不住它（现网密码那一层就是这么显示的）。 */
.tabbar{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;z-index:40;
  background:${CH.bg};border:3px solid ${CH.line};box-shadow:0 16px 44px ${CH.shadow};
  display:flex;align-items:center}
.tabbar .it{flex:1;display:flex;align-items:center;justify-content:center;color:${CH.idle}}
.tabbar .it.on{color:${CH.ink}}
.tabbar .ic{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:transparent}
.tabbar .it.on .ic{background:${CH.sel}}
.tabbar .ic i{width:40px;height:40px;background-color:currentColor;-webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain}
.tabbar .ic.plus i{-webkit-mask-image:url("${GLYPH.plus}");mask-image:url("${GLYPH.plus}")}
.tabbar .ic.rows3 i{-webkit-mask-image:url("${GLYPH.rows3}");mask-image:url("${GLYPH.rows3}")}
.tabbar .ic.user i{-webkit-mask-image:url("${GLYPH.user}");mask-image:url("${GLYPH.user}")}
/* 详情浮窗：逐寸照 .float-sheet */
.sheet{position:absolute;left:24px;right:24px;top:312px;bottom:152px;background:#FCFBF8;border-radius:32px;
  display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 44px rgba(35,37,44,.22)}
.sheet .grip{flex:none;height:56px;position:relative;display:flex;align-items:center;justify-content:center}
.sheet .grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.sheet .grip .tx{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;
  font-size:var(--fs-tiny);color:${META}}
.sheet .body{flex:1;min-height:0;overflow:hidden;padding:0 34px;position:relative}
/* 窗内那一屏的头：左标题、右卡片格（窗内净宽 634 = 358 + 24 + 252） */
.hero{display:flex;gap:24px;align-items:flex-start;margin-top:10px}
.hero .lt{width:358px;flex:none}
.hero .cat{display:flex;align-items:center;gap:10px;font-size:var(--fs-meta);color:${META}}
.hero .cat i{width:14px;height:14px;border-radius:50%;background:${T[0].bg}}
.hero h2{margin-top:12px;font-size:34px;font-weight:800;line-height:1.3;letter-spacing:-.8px;color:${I90}}
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
.swatch .lg{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:6px;font-size:18px;
  letter-spacing:1px;color:rgba(35,37,44,.45)}
.swatch .lg i{width:28px;height:28px;border-radius:50%;background:#23252C;color:#F2EFE9;font-size:16px;
  display:flex;align-items:center;justify-content:center;font-style:normal}
.rt .e1{margin-top:18px;font-size:var(--fs-meta);font-weight:700;color:${I90};text-align:center}
.rt .e2{margin-top:6px;font-size:var(--fs-micro);color:${META};text-align:center}
/* 窗内正文：字号颜色吃现网 .ds-*（分区头 20/800 字距 1.6） */
.lab{margin-top:30px;font-size:var(--fs-label);font-weight:800;letter-spacing:1.6px;color:${META}}
.lab:first-child{margin-top:0}
p.tx{margin-top:10px;font-size:var(--fs-body);line-height:1.7;color:${I70}}
.pt{margin-top:12px;display:flex;gap:16px;align-items:flex-start}
.pt i{flex:none;width:14px;height:14px;border-radius:50%;background:${TIP};margin-top:12px}
.pt span{font-size:var(--fs-body);line-height:1.55;color:${I90}}
.lnk{margin-top:10px;font-size:var(--fs-meta);line-height:1.5;color:${BLUE}}
.lnote{margin-top:8px;font-size:var(--fs-tiny);line-height:1.5;color:${META}}
/* 动作条：撤掉「生成笔记卡片」那枚（入口挪到右上那一格），只剩两枚 + 公开状态那一行 */
.dock{flex:none;padding:0 34px 26px}
.dock .rule{height:2px;background:rgba(35,37,44,.08);margin:0 -34px 20px}
.dock .irow{display:flex;gap:14px}
.dock .irow b{flex:1;height:88px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-body);font-weight:700;color:${I90};box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.dock .irow b.d{color:#b4231f}
.dock .pub{margin-top:16px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-tiny);color:${META}}
.dock .pub s{color:${I90};text-decoration:underline}
/* 小弹窗：外壳照 me.wxss 的 .pwd-mask / .pwd-card（顶 180、宽 620、遮罩 .55）——维持看得见上一层 */
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
`

/* 这一屏的字被压短了：窗内正文本来就能上下滚，为了把"摘要／要点／来源链接＋那行提示"
   四段一次拍全，示例文字只留每段一到三行。真机上长笔记是滚动，不是截掉。 */
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

const chrome = (bg) => `<div class="page">${bg}<div class="status"><span>13:24</span><span>100 ▮</span></div>
  <div class="nbar">图麦笔记<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const bgJia = `<div class="bg-full"><img src="${FACE}"><div class="scrim"></div></div>`
const bgYi = ''
const tabbar = `<div class="tabbar"><span class="it"><span class="ic plus"><i></i></span></span>
  <span class="it on"><span class="ic rows3"><i></i></span></span>
  <span class="it"><span class="ic user"><i></i></span></span></div>`

const mini = `<div class="mask"><div class="mini">
  <div class="nm">${NEW.info}</div>
  <div class="sc">${ZH.slotHintFull}</div>
  <div class="acts"><b class="g">${ZH.cancel}</b><b class="p">${ZH.confirm}</b></div></div></div>`

const SCREENS = [
  ['s1', `<b>① 甲：背景那一层铺形象图</b>。浮窗开起来时，上一层<b>整层不画</b><span class="tag cut">撤</span>「我的笔记」那行大字、右上角那列「4 笔记」、图上那句轮播 Tips 和搜索那枚、两枚 tab 那条横线、分类那一排、下面那批行卡——<b>只留背景贯穿</b>（形象图从导航条下面一直铺到屏底，压暗那一层仍吃「调亮度」那枚圆点当前的档位）。<b>底栏按你说的保持可见</b><span class="tag">留</span>，所以浮窗下沿仍是 <code>bottom 152</code>（底栏顶到 128，再留 24 空隙），一个字都不改。<br>窗内那一屏换成 v20 那版布局：左标题（34/800，吃现网 <code>.ds-h2</code> 那一档）+ 右<b>这篇笔记的卡片缩略图</b>带 <code>‹ 1/2 ›</code>（这篇存了两张）；正文在下，要点前面是<b>头部 Tips 那种 14 小黄点</b>（<span class="tag cut">撤</span>现网那枚 38 见方的带圈数字，序号不再显示）；来源链接下面那行小字<span class="tag new">新串</span>「${NEW.linkNote}」；底排<span class="tag cut">撤</span>「生成笔记卡片」那枚，只剩 编辑／删除 + 公开状态那一行。<br><b>甲的代价（这条我原来没算）</b>：浮窗盖掉约 <b>72%</b> 的屏高（312→1518），图只在四边露一条，人脸大概率整张被窗挡住；而图区那套取景是 <code>poster.bandGeom</code> <b>按 542 高算的</b>，贯穿到 1488 高得重算一次裁切。`, chrome(bgJia) + sheet(thumb) + tabbar + '</div>'],
  ['s2', `<b>② 乙：背景那一层只留主题底色</b>。藏的东西和甲完全一样，只是背景不铺图——就是这一套壁纸的 <code>--bg-page ${PAGE}</code>（象牙 <code>#F2EFE9</code>／天青 <code>#E9EEEA</code> 各自吃自己那一档）。<br><b>我建议走乙。</b>三条理由：一，浮窗盖掉 72% 屏高，图贯穿只在四边留一条缝，<b>省下的那层信息几乎看不见</b>，但人脸被窗切一半这件事看得见；二，乙<b>一行 CSS 就够</b>（把 <code>.head</code> 里那几样和 <code>.sheet</code> 藏掉，底色本来就是页面自己的），甲要重算 <code>bandGeom</code> 的裁切；三，你要的是"避免看到两层结构"，乙把这一屏压到<b>一个色面 + 一张纸</b>，比甲更干净、也更贴"简约文艺"那条。<br>嫌太素的话还有一档中间选：底色不变，在浮窗四边那条缝里留<b>一枚很淡的母题图形</b>（现网列表那枚方块上就有，<code>palette.MOTIFS</code>），不引照片。`, chrome(bgYi) + sheet(thumb) + tabbar + '</div>'],
  ['s3', `<b>③ 这篇一张卡片都没有</b>（底按乙画，甲也一样）：右上那一格是<b>一枚 176 见方的淡底方形 + 左上角图麦 LOGO + 中间 + 号</b>，下面两行小字「${ZH.shareAsImage}」「${ZH.noCards}」都是现网原串。<br>淡底是规则不是色号：有色阶的壁纸吃 <code>ramp.steps[0]</code>（象牙 <code>#EAE0CE</code>／天青 <code>#DDE7DF</code>），米白这套没有色阶就 <code>mix(墨, --bg-page, .08)</code> = <code>${PALE}</code>；描边 <code>rgba(35,37,44,.10)</code>；尺寸吃列表那枚 <code>--blk</code> 176rpx；+ 号 <code>rgba(35,37,44,.42)</code>（与「我的」那四枚空槽的 + 号同一档）；左上角那枚 LOGO 圆点 28、那四个字 18／字距 1（<code>--fs-micro</code> 那一档，再小屏上就读不出了）。<br><b>这一格就是唯一入口</b>：点它才出成品弹窗（选模板那一层），底排那枚「生成笔记卡片」撤掉之后不留第二个把手。一张都没有时<b>不画 <code>‹ 1/N ›</code> 那一行</b>。`, chrome(bgYi) + sheet(empty) + tabbar + '</div>'],
  ['s4', `<b>④ 小弹窗「${NEW.info}」维持看得见上一层</b>（站长 10-03 明确）：外壳逐寸照 <code>me.wxss</code> 的密码那一层——遮罩 <code>rgba(20,20,28,.55)</code> 整屏垫着、卡片宽 <b>620</b>、离顶 <b>180</b>。所以这一态<b>不藏</b>详情窗，它就是隔着那层 .55 的暗垫着，跟「私密密码」那一层同一个做法。<br>两处按平台层读：<code>.pwd-mask</code> 是页面里的 <code>position:fixed;top:0</code>，落在 <b>webview</b> 顶上，而状态条和「图麦笔记」那一条导航条是系统画的、在 webview 外面，<b>压不到</b>（所以这一屏那两条没跟着暗）；底栏是 <code>custom-tab-bar</code> 那个自定义组件，WeChat 把它单独摆在一层，<b>页面里的遮罩盖不住它</b>。<b>后一条我是从 <code>index.wxss:891</code> 那句"离底栏 24 + 底栏高 ~128"反推出来的</b>（页面 webview 得铺到屏底，那句减法才成立），<b>还没在模拟器上拍过</b>——真做这一版时第一件事就是拿现网私密密码那一层拍一张对一遍，对不上我改这一屏。<br>这一屏只画了外壳和那两句字（四枚位置格与两个输入框跟 v20 屏③④一模一样，没改，就不重画一遍）。<br>⚠️ <b>一处要你点头</b>：详情窗现在藏掉了列表那一层，那<b>成品弹窗（选模板那一层）背后露什么</b>？现网是"详情窗整个藏掉、背后什么都不垫"，也就是会<b>把列表又露回来</b>——从详情窗点进去会看到列表闪一下。我的建议：<b>成品弹窗照同一口径</b>，背后也是"背景贯穿 + 底栏"，别把列表放回来。要保留现网那样就说一声。`, chrome(bgYi) + sheet(thumb) + tabbar + mini + '</div>'],
]

const cell = (id, cap, html) => `<div class="cell"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`
const PRE = `<h2 style="font-size:26px;margin:34px 0 10px">这一稿藏掉的、留着的，和一处要你点头</h2>
<p class="lead"><span class="tag cut">撤</span>详情窗开着时上一层那几样：「我的笔记」大字、右上角「4 笔记」那一列、图上那行轮播 Tips 与搜索那枚、两枚 tab 与那条通栏横线、分类那一排、下面那批行卡。<span class="tag">留</span>底栏（站长原话"确认底栏保持可见"）、原生导航条那一条（图麦笔记 + 胶囊，系统画的）、背景。<b>因为底栏留着，浮窗下沿 <code>bottom 152</code> 一个字不改</b>——我上一条问的"要不要抬到 60 + 安全区"随这条自动作废。<br>
<span class="tag pick">挑一个</span>甲（形象图贯穿）／乙（只留主题底色）——<b>我建议乙</b>，理由在屏②那三条，最关键那条是浮窗盖掉 72% 屏高、图贯穿只在四边留一条缝，省不了多少观感却要多算一次 <code>bandGeom</code> 裁切。<br>
<b>窗内那一屏</b>字号与颜色全部吃现网 <code>.ds-*</code> 那几档（分区头 20/800 字距 1.6、正文 28/1.7 七成黑、标题 34/800），要点那枚黄点是 <code>palette.TIP_DOT</code> 与头部 Tips 同一个数。<b>新串这轮只有一串</b>：「${NEW.linkNote}」（你的原话）；<b>「${ZH.shareAsImage}」「${ZH.noCards}」「${ZH.grip}」「${ZH.slotHintFull}」「${ZH.sharedNow}」「${ZH.unshare}」全是现网字典里现读的</code>。</p>
<p class="lead" style="margin-top:12px"><b>数据这一轮仍然不用动后端</b>：右上那几张卡片读 1.9.13 那份本机台账 <code>cardLog.forNote(noteId)</code>（已按 <code>at</code> 倒序）；配图读 <code>poster.readSlots()</code>；名称／一句话读 <code>profile</code> 那两格。<b>微信头像昵称那套先不对接</b>（站长 10-03 定的）。</p>
<p class="lead" style="margin-top:12px"><b>屏内那篇示例笔记的字被压短了</b>：窗内正文本来就能上下滚，为了把「摘要／核心要点／来源链接＋那行提示」四段一次拍全，示例文字每段只留一到三行。<b>不是在说长笔记会被截掉</b>，长笔记走滚动。</p>`

fs.writeFileSync(path.join(DIR, 'v21-详情浮窗一层.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v21 · 详情浮窗只留一层</title><style>${CSS}</style></head><body>
<h1>v21 · 详情仍走浮窗，但上一层整层不画——只看到背景贯穿（示意，代码一行没动）</h1>
<p class="lead">四屏：<b>1</b> 甲·形象图贯穿 + 新布局｜<b>2</b> 乙·只留主题底色（我建议这个）｜<b>3</b> 一张卡片都没有时那一格｜<b>4</b> 小弹窗维持看得见上一层。<b>底栏四屏都画着</b>（站长：确认底栏保持可见）。<br>
屏高 <code>750×1670</code>（1px = 1rpx）。浮窗逐寸照 <code>index.wxss:886</code> 的 <code>.float-sheet</code>（左右 24、上 130、下 152、圆角 32、底 <code>#FCFBF8</code>；130 是相对 webview，加上状态条 94 + 导航条 88 就是屏上 312）；窗内净宽 <code>702−68=634</code> 分给左标题 358 + 间 24 + 右格 252；卡片比例吃真跑量出来的 0.717。<span class="tag">留</span>这一稿仍然画着的东西；<span class="tag new">新串</span>这轮新造的；<span class="tag cut">撤</span>这轮删掉的。</p>
${SCREENS.map(([id, cap, html]) => `<div class="row">${cell(id, cap, html)}</div>`).join('')}
${PRE}
</body></html>`)

for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v21-详情浮窗一层.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)
