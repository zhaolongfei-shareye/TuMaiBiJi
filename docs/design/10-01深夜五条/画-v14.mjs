// v14 效果图：站长 10-01 深夜给的五条（+ 分享态改全黑衬底这一条是他看完参考图补的）。
// 跑法：node docs/design/10-01深夜五条/画-v14.mjs
//
// 口径全部从代码侧取，不自己发明：
//   屏高一比一照他这次发来的真机截图比例（1116×2484 → 750×1670rpx）；
//   字号/间距/圆角/描边 = app.wxss 令牌；天青那一套主题变量 = app.wxss .theme-tint-celadon；
//   底栏那一格 = palette.chromeOf('tint-celadon') 现算；小黄点 = palette.TIP_DOT；
//   屏上每句中文先 grep utils/i18n.js，现网有的照抄，新造的在标注里写「新串」。
// 第 2 条他给的参照物是「分类管理」那一页——量过：整屏遮罩 rgba(20,20,28,.55) + 620rpx 居中卡
// + 一行两枚各占一半（categories.wxss .dialog-mask/.dialog-card/.dialog-actions）。
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const palette = require('../../../miniprogram/utils/palette.js')

const DIR = path.dirname(fileURLToPath(import.meta.url))
// 那支细圆体不自己另找一份：直接从 app.wxss 里那段 @font-face 抠 base64，效果图和现网用的是同一支。
const FONT = fs
  .readFileSync(path.join(DIR, '../../../miniprogram/app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]
const CH = JSON.parse(JSON.stringify(palette.chromeOf('tint-celadon')))
const TIP = palette.TIP_DOT
const W = 750
const H = 1670

/* 这一版的底图／LOGO／图标／模板小样全部用现网真件，不再拿 CSS 渐变糊：
   照片 = miniprogram/assets/home-bg-portrait.jpg（取景口径同 v13：center 15%/cover）；
   图标 = docs/design/10-01图标与角标/icons 那批 Lucide 原始 SVG（ISC），不改一笔；
   模板小样 = docs/design/模板成品-1.5.0/模板-<id>.png（海报引擎真出的图）。 */
const PHOTO = '../../../miniprogram/assets/home-bg-portrait.jpg'
const LOGO = '../../../miniprogram/assets/logo.png'
const ICONS = path.join(DIR, '..', '10-01图标与角标', 'icons')
const TPL = (id) => path.join(DIR, '..', '模板成品-1.5.0', `模板-${id}.png`)
const TONE = (i) => palette.toneColor(i)
const ico = (n, size, color, sw = 2) =>
  fs
    .readFileSync(path.join(ICONS, `${n}.svg`), 'utf8')
    .replace(/<!--[\s\S]*?-->/, '')
    .replace(/width="24"\s+height="24"/, `width="${size}" height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}" stroke-width="${sw}"`)
    .replace(/\n\s+/g, ' ')
    .trim()

// ---------------- 外壳 ----------------
const CSS = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${FONT}) format('truetype');font-weight:100;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:#DCDAD4;font-family:'PingFang SC','Helvetica Neue',sans-serif;color:#1B2A21;padding:48px 40px 64px}
h1{font-size:34px;letter-spacing:-.6px;margin-bottom:10px}
.lead{font-size:16px;line-height:1.7;color:#4a4f47;max-width:1500px;margin-bottom:34px}
.lead code{background:#fff;padding:2px 7px;border-radius:5px;font-size:15px}
.row{display:flex;gap:34px;align-items:flex-start;flex-wrap:wrap;margin-bottom:44px}
.cell{width:${W}px}
.cap{font-size:15px;line-height:1.65;color:#4a4f47;margin-top:12px}
.cap b{color:#1B2A21}
.tag{display:inline-block;font-size:13px;padding:2px 8px;border-radius:999px;background:#1B2A21;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#241E16}
/* 手机框：1px = 1rpx */
.ph{width:${W}px;height:${H}px;border-radius:60px;overflow:hidden;position:relative;
  background:var(--bg-page);outline:2px solid #B9B6AF;
  --bg-page:#E9EEEA;--bg-card:#F7FAF7;--glass:rgba(247,250,247,.85);
  --t1:#1B2A21;--t2:rgba(27,42,33,.66);--t3:rgba(27,42,33,.4);
  --edge:rgba(27,42,33,.13);--accent:#1B2A21;--chip:rgba(27,42,33,.07);
  --fs-h1:42px;--fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --sp-2:16px;--sp-3:24px;--sp-4:32px;--sp-5:48px;--r-card:40px;--r-chip:28px;--r-pill:999px;--r-btn:16px;--w-edge:3px;
  --cbg:${CH.bg};--cink:${CH.ink};--csel:${CH.sel};--cline:${CH.line};--cidle:${CH.idle}}
/* 状态条 + 导航条：现网 window 用的是微信默认那条（不是 custom），但三个 tab 页铺了图就调
   app.applyNavForBand → backgroundColor #181a20、frontColor #ffffff（app.js:210-217）。
   二级页（卡片模板）没铺图，走 app.json 那份 #f4f2ec 底黑字。 */
.status{height:94px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 44px;
  font-size:26px;font-weight:600;color:#fff;background:#181A20}
.status .r{font-size:22px;font-weight:500;letter-spacing:1px}
.nav{height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;position:relative;
  color:#F2EFE9;background:#181A20}
.nav .capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
  display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#fff}
.ph.paper .status{background:#F4F2EC;color:#1B2A21}
.ph.paper .nav{background:#F4F2EC;color:#1B2A21}
.ph.paper .nav .capsule{background:rgba(27,42,33,.06);border-color:rgba(27,42,33,.14);color:#1B2A21}
.body{padding:2px 24px 0}
.card{background:var(--bg-card);border:var(--w-edge) solid var(--edge);border-radius:var(--r-card)}
/* 头部：底图 + 罩子（两句都从 me.wxss 抄：.head-band 542rpx、.head-scrim 那四个停点） */
.band{height:542px;position:relative;overflow:hidden;background:var(--bg-page)}
.band .photo{position:absolute;inset:0;background:url(${PHOTO}) center 15%/cover no-repeat}
.band .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 14%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%)}
.band .ct{position:absolute;left:32px;top:22px;z-index:4;color:rgba(242,239,233,.96)}
.band .ct .t1{font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px}
.band .ct .d{font-size:var(--fs-meta);margin-top:14px;opacity:.8}
.band .who{position:absolute;left:32px;top:22px;z-index:4;font-size:var(--fs-h1);font-weight:700;color:rgba(242,239,233,.96);letter-spacing:-1px}
.band .mind{position:absolute;right:32px;top:20px;text-align:right;color:#F2EFE9}
.band .mind b{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:64px;line-height:1}
.band .mind span{font-size:var(--fs-label);letter-spacing:4px;padding-left:4px;opacity:.72}
.sheet{margin:-40px 0 0;padding:36px 32px;display:flex;align-items:center;gap:20px;position:relative;z-index:2}
.sheet .logo{width:80px;height:80px;border-radius:26px;flex:none;background:url(${LOGO}) center/cover no-repeat}
.sheet .txt{flex:1;min-width:0}
.sheet .txt b{display:block;font-size:34px;font-weight:700;letter-spacing:-.5px}
.sheet .txt i{display:block;font-style:normal;font-size:var(--fs-meta);color:var(--t3);margin-top:6px}
.seg{display:flex;gap:4px;background:rgba(35,37,44,.055);border-radius:var(--r-pill);padding:5px;flex:none}
.seg span{height:58px;line-height:58px;padding:0 24px;border-radius:var(--r-pill);font-size:var(--fs-meta);font-weight:700;color:var(--t2)}
.seg span.on{background:var(--accent);color:var(--bg-page)}
/* 通用行 */
.grp{margin-top:24px;padding:6px 32px}
.it{display:flex;align-items:center;min-height:106px;border-top:var(--w-edge) solid var(--edge)}
.grp .it:first-child{border-top:0}
.it .l{font-size:var(--fs-body);font-weight:700;letter-spacing:-.2px}
.it .r{margin-left:auto;display:flex;align-items:center;gap:14px;font-size:var(--fs-meta);color:var(--t3);font-weight:600}
.ico{width:46px;height:46px;border-radius:50%;background:var(--csel);display:flex;align-items:center;justify-content:center;flex:none}
/* 规则块（第 1 条新画的那块） */
.rule{margin:0;padding:0}
.rule h4{font-size:var(--fs-body);font-weight:700;letter-spacing:-.2px}
.rule p{font-size:var(--fs-meta);color:var(--t3);margin-top:6px;line-height:1.5}
.rule ul{list-style:none;margin-top:22px}
.rule li{display:flex;align-items:baseline;font-size:var(--fs-body);padding:20px 0;border-top:1px solid rgba(27,42,33,.07)}
.rule li:first-child{border-top:0}
.rule li em{font-style:normal;margin-left:auto;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:var(--fs-title);color:var(--t1)}
/* 底栏 */
.tab{position:absolute;left:24px;right:24px;bottom:24px;height:112px;border-radius:var(--r-pill);
  background:var(--cbg);border:var(--w-edge) solid var(--cline);display:flex;align-items:center}
.tab div{flex:1;display:flex;align-items:center;justify-content:center}
.tab b{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--cink);opacity:.62}
.tab div.on b{background:var(--csel);opacity:1}
.tab svg{width:38px;height:38px;stroke:currentColor;stroke-width:1.6;fill:none;stroke-linecap:round;stroke-linejoin:round}
/* 遮罩 + 居中卡（第 2 条：抄分类管理那一页） */
.mask{position:absolute;inset:0;background:rgba(20,20,28,.55);display:flex;align-items:center;justify-content:center;z-index:20}
.dlg{width:620px;background:var(--bg-card);border:var(--w-edge) solid var(--edge);border-radius:var(--r-card);
  padding:48px 32px 32px;box-shadow:0 16px 44px rgba(35,37,44,.22)}
.dlg h3{font-size:var(--fs-h2);font-weight:700;letter-spacing:-.6px}
.dlg .scene{font-size:var(--fs-meta);color:var(--t2);line-height:1.55;margin-top:14px}
.dlg .ask{font-size:var(--fs-meta);color:var(--t3);margin-top:34px;text-align:center}
.boxes{display:flex;gap:14px;justify-content:center;margin-top:18px}
.boxes i{width:78px;height:96px;border-radius:var(--r-chip);background:var(--chip);
  box-shadow:inset 0 0 0 var(--w-edge) var(--edge);display:flex;align-items:center;justify-content:center}
.boxes i.f{box-shadow:inset 0 0 0 var(--w-edge) var(--csel)}
.boxes i.f::after{content:'';width:18px;height:18px;border-radius:50%;background:var(--csel)}
.acts{display:flex;gap:16px;margin-top:40px}
.acts span{flex:1;text-align:center;font-size:var(--fs-body);font-weight:600;padding:24px 0;border-radius:var(--r-pill)}
.acts .g{background:var(--chip);color:var(--t1)}
.acts .p{background:var(--accent);color:#F7FAF7}
/* 卡片模板页（第 4 条） */
.field{padding:26px 32px;border-top:var(--w-edge) solid var(--edge)}
.field:first-child{border-top:0}
.field label{display:block;font-size:var(--fs-label);font-weight:700;color:var(--t3);letter-spacing:.4px}
.field .v{font-size:var(--fs-body);margin-top:10px}
.field .v.ph2{color:var(--t3)}
.btn{height:104px;border-radius:var(--r-pill);background:var(--accent);color:#F7FAF7;
  display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:700;margin:24px 0 0}
.preview{margin-top:26px;border-top:2px dashed rgba(27,42,33,.16);padding-top:20px}
.preview .cap2{display:flex;align-items:center;gap:12px;font-size:var(--fs-label);font-weight:700;color:var(--t3);letter-spacing:.6px}
.preview .cap2 s{width:10px;height:10px;border-radius:50%;background:${TIP};display:block}
.preview .note{font-size:var(--fs-micro);color:var(--t3);margin-top:6px}
.slots{display:flex;gap:20px;margin-top:20px}
.slot{width:120px;flex:none;text-align:center}
.slot .c{width:120px;height:120px;border-radius:50%;position:relative;background:url(${PHOTO}) center/cover no-repeat}
.slot .c em{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);font-style:normal;
  font-size:var(--fs-label);font-weight:700;background:var(--accent);color:#F7FAF7;border-radius:999px;padding:4px 12px}
.slot span{display:block;font-size:var(--fs-micro);color:var(--t3);margin-top:16px}
.strip{display:flex;gap:20px;margin-top:18px;overflow:hidden}
.tpc{width:200px;flex:none;background:var(--bg-card);border:var(--w-edge) solid var(--edge);border-radius:var(--r-block);padding:14px}
.tpc.on{box-shadow:inset 0 0 0 var(--w-edge) var(--csel),0 0 0 var(--w-edge) var(--csel)}
.tpc .im{height:150px;border-radius:18px;background-size:cover;background-position:center top}
.tpc p{font-size:var(--fs-micro);text-align:center;margin-top:10px;color:var(--t2)}
/* 新建页四步（第 5 条） */
.panel{position:absolute;left:0;right:0;bottom:152px;height:700px;box-sizing:border-box;display:flex;flex-direction:column;
  background:var(--bg-card);border:var(--w-edge) solid var(--edge);border-radius:0 0 var(--r-card) var(--r-card);padding:8px 32px 32px}
.panel .hd{display:flex;align-items:center;gap:14px;font-size:var(--fs-title);font-weight:700}
.panel .hd s{width:34px;height:26px;border-radius:6px;border:3px solid var(--t1);display:block;position:relative}
.panel .hd s::after{content:'';position:absolute;left:50%;top:-9px;transform:translateX(-50%);width:12px;height:6px;border-radius:3px;background:var(--t1)}
.panel .hd span{margin-left:auto;font-size:var(--fs-meta);color:var(--t3);font-weight:500}
.chips{display:flex;gap:26px;margin-top:28px;font-size:var(--fs-meta);color:var(--t3)}
.chips b{display:flex;align-items:center;gap:8px;font-weight:600}
.chips b.on{color:var(--t1);font-weight:700;border-bottom:4px solid var(--t1);padding-bottom:6px}
.chips s{width:14px;height:14px;border-radius:50%;display:block}
.modes{display:flex;gap:20px;margin-top:28px}
.mode{flex:1;height:172px;border-radius:var(--r-block);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:#fff}
.mode b{font-size:var(--fs-title);font-weight:700}
.mode i{font-style:normal;font-size:var(--fs-micro);opacity:.86}
.steps{margin-top:22px;padding:18px 22px;border-radius:24px;background:rgba(35,37,44,.035)}
.steps div{display:flex;align-items:center;gap:14px;margin-bottom:8px}
.steps div:last-child{margin-bottom:0}
.steps s{width:14px;height:14px;border-radius:50%;background:${TIP};flex:none}
.steps p{flex:1;font-size:var(--fs-meta);line-height:1.4;color:rgba(35,37,44,.78)}
.steps b{font-size:var(--fs-body);font-weight:700;color:#23252C;margin-right:10px}
.go{height:88px;border-radius:var(--r-pill);background:rgba(35,37,44,.06);color:rgba(35,37,44,.42);
  display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:700}
.acts2{margin-top:auto;padding-top:20px}
/* 分享态（全黑衬底） */
.dark{background:#000}
.dark .status,.dark .nav{color:#fff}
.share{position:absolute;inset:0;background:#000;display:flex;flex-direction:column;align-items:center;padding-top:96px}
/* 这一整块（含外圈黑）才是我们递给 wx.showShareImageMenu 的那张图 */
.canvas{width:690px;background:#000;padding:60px 0 0;display:flex;flex-direction:column;align-items:center;
  outline:1px dashed rgba(255,255,255,.18);outline-offset:0}
.canvas .stamp{font-size:17px;color:#6E6A64;margin-top:20px;letter-spacing:.4px;text-align:center}
.note2{margin-top:14px;font-size:17px;color:#6E6A64;text-align:center;letter-spacing:.3px}
.share .art{width:520px;border-radius:26px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.6)}
.share .art img{display:block;width:100%}
.share .stamp{font-size:16px;color:#6E6A64;margin-top:22px;letter-spacing:1px}
/* 微信面板示意（不是我们的界面） */
.wxsheet{position:absolute;left:0;right:0;bottom:0;background:#000;padding:0 0 40px}
.who2{margin-top:16px;text-align:center;font-size:18px;color:#636366}
.wxrow{display:flex;justify-content:center;gap:16px;padding:0 26px}
.wxb{width:118px;text-align:center;color:#fff}
.wxb s{width:118px;height:118px;border-radius:26px;background:#2C2C2E;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.wxb s svg{width:52px;height:52px;stroke:#8E8E93;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}
.wxb p{font-size:20px}
.wxx{margin:40px auto 0;width:88px;height:88px;border-radius:50%;background:#2C2C2E;color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px}
`

const status = () => `<div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>`
const nav = (title) => `<div class="nav">${title}<span class="capsule"><span>•••</span><span>◎</span></span></div>`
// 底栏三枚 = 现网那三个 Lucide 图形（plus / rows-3 / user-round），选中那枚吃 chromeOf(天青) 的同一色阶圆底。
const TABBAR = `<div class="tab">
  <div><b>${ico('plus', 40, CH.ink)}</b></div>
  <div><b>${ico('rows-3', 40, CH.ink)}</b></div>
  <div class="on"><b>${ico('user-round', 40, CH.ink)}</b></div></div>`
const cell = (cap, inner) => `<div class="cell">${inner}<div class="cap">${cap}</div></div>`

/* ============ 屏 1｜「我的」→ 关于（第 1 条） ============ */
const s1 = cell(
  `<b>第 1 条</b>：「分享好友」→<b>推荐图麦</b>（右边那句仍是服务端真值 <code>新写作者 +10</code>，<code>shareRewardN</code>）；
   这一组最底下那行<b>「魅力 + 数字」整行删掉</b>，换成一块<b>魅力值规则</b>，一条一行、数字右对齐吃那支数字字形。
   顶部图区画矮了是<b>这一屏已往下滚</b>的示意（不是把图区改矮）。
   <span class="tag">新串</span>推荐图麦／魅力值规则／三行规则；<span class="tag" style="background:#1B2A21;color:#F2EFE9">现网</span>产品官网、反馈邮箱、新写作者 +10。
   <span class="tag.new">要你点头</span>第三行「笔记被朋友种草 +1」这条规则代码里已有（<code>IMPORT_REWARD</code>），但后端那两个字段还没部署（#228），<b>不部署这一行就是画饼</b>。`,
  `<div class="ph">${status()}${nav('图麦笔记')}<div class="band" style="height:290px">
    <div class="photo"></div><div class="scrim"></div></div>
  <div class="body">
    <div class="card grp" style="margin-top:0;padding-top:34px;padding-bottom:34px">
      <div style="display:flex;align-items:baseline;gap:16px"><b style="font-size:34px">图麦笔记</b>
        <span style="font-family:WtsjMind,sans-serif;font-weight:100;font-size:24px;color:var(--t3)">v1.9.8</span></div>
      <p style="font-size:var(--fs-body);line-height:1.62;color:var(--t2);margin-top:14px">图麦笔记做的事很窄：把看到的好东西变成能用的笔记。公众号文章、网页链接、手机截图丢进来，出来就是一条带摘要、要点和标签的笔记。</p>
    </div>
    <div class="card grp" style="padding-top:0;padding-bottom:0">
      <div class="it"><div class="l">产品官网</div><div class="r">agentsbin.cn<span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">反馈邮箱</div><div class="r">18509828@qq.com<span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">推荐图麦</div><div class="r">新写作者 +10<span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
    </div>
    <div class="card grp" style="padding-top:34px;padding-bottom:34px">
      <div class="rule"><h4>魅力值规则</h4>
        <ul><li>新用户<em>100</em></li><li>推荐朋友使用<em>+10</em></li><li>笔记被朋友种草<em>+1</em></li></ul></div>
    </div>
  </div>${TABBAR}</div>`
)

/* ============ 屏 2/3｜私密密码：整屏遮罩 + 居中卡（第 2 条） ============ */
const dlg = (title, scene, ask, boxes, acts) => `<div class="mask"><div class="dlg">
  <h3>${title}</h3><p class="scene">${scene}</p>
  ${ask ? `<p class="ask">${ask}</p><div class="boxes">${boxes}</div>` : ''}
  <div class="acts">${acts}</div></div></div>`
const six = (n) => Array.from({ length: 6 }, (_, i) => `<i class="${i < n ? 'f' : ''}"></i>`).join('')

// 私密密码那一层的背后就是「我的」设置那一档（这一行是从菜单「私密密码」点进来的），三屏共用一份。
const meSet = `<div class="band"><div class="photo"></div><div class="scrim"></div>
    <div class="who">我的</div><div class="mind"><b>110</b><span>魅力</span></div></div>
  <div class="body">
    <div class="card sheet" style="margin-top:0"><div class="logo"></div>
      <div class="txt"><b>你好！我是图麦笔记</b><i>把图文，提炼成有用的干货</i></div>
      <div class="seg"><span class="on">设置</span><span>关于</span></div></div>
    <div class="card grp" style="padding-top:0;padding-bottom:0">
      <div class="it"><div class="l">卡片模板</div><div class="r"><span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">外观设置</div><div class="r"><span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">分类管理</div><div class="r"><span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">私密密码</div><div class="r"><span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
      <div class="it"><div class="l">注销账号</div><div class="r"><span class="ico">${ico('chevron-right', 26, CH.ink, 2.6)}</span></div></div>
    </div>
  </div>`

const s2 = cell(
  `<b>第 2 条·设置态第一遍</b>：照你给的参照物改成<b>整屏遮罩 + 居中卡</b>（分类管理那页同一套：遮罩 <code>rgba(20,20,28,.55)</code>、卡宽 <code>620rpx</code>、一行两枚各占一半）。
   六格从"撑满整行"收成<b>每格 78×96、整组居中</b>。场景说明用现网 <code>privatePasswordScene</code> 那句，格子上方那句是校验提醒。`,
  `<div class="ph">${status()}${nav('图麦笔记')}${meSet}
    <div style="position:absolute;inset:0;top:0">${dlg(
      '私密密码',
      '看私密笔记的内容时要输这串；归到私密的笔记不出笔记卡片。',
      '新密码（6 位数字）', six(2), '<span class="g">取消</span><span class="p">确定</span>')}</div></div>`
)

const s3 = cell(
  `<b>第 2 条·第二遍</b>：第一遍输满六位自动跳来这一屏——格子清空、上方提醒换成「再输一次」，还是同一张居中卡，不另起一层。
   两遍不一样就地清空重输（不弹新页、不弹系统框）。`,
  `<div class="ph">${status()}${nav('图麦笔记')}${meSet}
    <div style="position:absolute;inset:0">${dlg(
      '私密密码',
      '一遍就存上了。两遍不一样会清空重输。',
      '再输一次', six(0), '<span class="g">取消</span><span class="p">确定</span>')}</div></div>`
)

const s3b = cell(
  `<b>第 2 条·已经设过</b>：<b>不给格子</b>，只讲清楚"要换就得先重置"，一行两枚左取消右<b>重置密码</b>。
   标题两态都叫「私密密码」，不和右边那枚撞成同一句。`,
  `<div class="ph">${status()}${nav('图麦笔记')}${meSet}
    <div style="position:absolute;inset:0">${dlg(
      '私密密码',
      '已经设过了。要换一条就先重置，再输两遍设新的。',
      '', '', '<span class="g">取消</span><span class="p">重置密码</span>')}</div></div>`
)

/* ============ 屏 4｜卡片模板页（第 4 条） ============ */
const s4 = cell(
  `<b>第 4 条</b>：「保存」上移到<b>一句话下面</b>；它下面整块用一条虚线 + 「卡片预览」小标 + 一句提示隔开，
   读起来是"成品样子"而不是"另一组设置"。预览里挑模板、换图照旧能点。`,
  `<div class="ph paper">${status()}${nav('卡片模板')}
  <div class="body"><div class="card" style="margin-top:0">
    <div class="field"><label>头像</label><div class="slots" style="margin-top:16px">
      <div class="slot"><div class="c"><em>卡片</em></div></div>
      <div class="slot"><div class="c"><em>背景</em></div></div>
      <div class="slot"><div class="c"></div></div><div class="slot"><div class="c"></div></div></div></div>
    <div class="field"><label>名称</label><div class="v">乔治·莫兰迪</div></div>
    <div class="field"><label>一句话</label><div class="v">透过此框，静觉别样的世界。</div></div>
    <div style="padding:0 32px 32px"><div class="btn">保存</div></div>
  </div>
  <div class="card" style="margin-top:24px;padding:0 32px 32px">
    <div class="preview"><div class="cap2"><s></s>卡片预览</div>
      <p class="note">下面是成品样子；改完记得点上面的保存。</p>
      <div class="strip"><div class="tpc on"><div class="im" style="background-image:url(${TPL('card')})"></div><p>玉版宣</p></div>
        <div class="tpc"><div class="im" style="background-image:url(${TPL('quote')})"></div><p>摘句</p></div><div class="tpc"><div class="im" style="background-image:url(${TPL('block')})"></div><p>叠翠</p></div></div>
      <div class="cap2" style="margin-top:28px"><s style="background:var(--t3)"></s>个性款</div>
      <div class="strip"><div class="tpc"><div class="im" style="background-image:url(${TPL('popGrid')})"></div><p>波普分格</p></div>
        <div class="tpc"><div class="im" style="background-image:url(${TPL('cover')})"></div><p>杂志封面</p></div><div class="tpc"><div class="im" style="background-image:url(${TPL('lit')})"></div><p>纸间文艺</p></div></div>
    </div></div>
  </div></div>`
)

/* ============ 屏 5｜新建页四步（第 5 条） ============ */
const s5 = cell(
  `<b>第 5 条</b>：三步→<b>四步</b>，四句文案照你给的原话；前面那三枚彩色实心方块（1/2/3，现网是宝蓝／橙／草绿）撤掉，
   统一换成<b>一枚小黄点</b>（和 Tips 那枚同一支 <code>${TIP}</code>，不再四色）。容器几何照现网 <code>.guide</code>：内边距 18/22、行距 12、标题 <code>--fs-body</code>/700、说明 <code>--fs-meta</code>。
   <span class="tag.new">要你点头</span>面板是<b>定高 700rpx</b>（那个数是量出来的，见 <code>docs/工具/量-面板四态自然高.js</code>），多一行约 52rpx 会把「开始提炼」顶出面板：
   要么行距 12→8 挤回去，要么 700→752 并重跑那把尺子。这一屏画的是<b>不顶出去</b>那一档（行距 8）。`,
  `<div class="ph">${status()}${nav('图麦笔记')}
  <div class="band" style="height:486px"><div class="photo"></div><div class="scrim"></div>
    <div class="ct"><div class="t1">看到好内容，随手记下来</div><div class="d">10月1日&nbsp;&nbsp;周四</div></div></div>
  <div class="panel">
    <div class="hd"><s></s>拍照或截图<span>点空白处收起</span></div>
    <div class="chips"><b><s style="background:${TONE(0)}"></s>直接写</b><b class="on"><s style="background:${TONE(2)}"></s>拍照</b>
      <b><s style="background:${TONE(3)}"></s>相册</b><b><s style="background:${TONE(1)}"></s>链接</b></div>
    <div class="modes"><div class="mode" style="background:${TONE(2)}"><b>拍照</b><i>直接开相机</i></div>
      <div class="mode" style="background:${TONE(3)}"><b>相册</b><i>选已有截图</i></div></div>
    <div class="steps">
      <div><s></s><p><b>粘贴各类图文</b>公众号 / 小红书 / 豆瓣 的链接或截图</p></div>
      <div><s></s><p><b>AI自动提炼</b>图里的字也读得懂，出摘要、要点</p></div>
      <div><s></s><p><b>存成笔记卡片</b>能搜、能归类，能分享到朋友圈</p></div>
      <div><s></s><p><b>种草转存</b>别人看到你分享卡片图，一键扫码转存</p></div>
    </div>
    <div class="acts2"><div class="go">开始提炼</div></div>
  </div></div>`
)

/* ============ 屏 6｜分享态：全黑衬底（第 3 条改口径） ============ */
const s6 = cell(
  `<b>第 3 条（按你最后那句改了口径：不折腾面板）</b>。这一屏要说清<b>谁能改、谁不能改</b>：
   下面那排五枚（<b>发送给朋友／分享到朋友圈／收藏／保存图片／转发为贴图</b>）和它们的名字、颜色、图标，
   全是 <code>wx.showShareImageMenu</code> 里微信自己的——<b>我们改不了一个像素，也改不了那几个词</b>（现网调用点在 <code>pages/index/index.js:633</code>）。
   <b>能改的是递给它的那张图</b>：现在海报是满幅模板底色，落在微信那块黑上就是一整块彩色矩形；
   改成<b>画布外圈铺纯黑、卡片本体缩到中间</b>，就成了参考图那种"全黑衬底、只留一张卡"的干净。
   <span class="tag.new">要你点头</span>这张图同时是「存相册」和「分享封面」那两张，外圈加黑边要不要一起加？还是只在走分享那条时加？`,
  `<div class="ph dark"><div class="share">
    <div class="canvas"><div class="art"><img src="${TPL('cover')}" /></div>
    <div class="note2">↑ 这一整块（含外圈黑）才是我们递给微信的那张图，虚线是图的边界</div></div>
  <div class="wxsheet"><div class="wxrow">
      <div class="wxb"><s><svg viewBox="0 0 24 24"><path d="M4 12h12M12 6l6 6-6 6"/></svg></s><p>发送给朋友</p></div>
      <div class="wxb"><s><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/></svg></s><p>分享到朋友圈</p></div>
      <div class="wxb"><s><svg viewBox="0 0 24 24"><path d="M12 4l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 10.2l5.9-.8z"/></svg></s><p>收藏</p></div>
      <div class="wxb"><s><svg viewBox="0 0 24 24"><path d="M12 4v10M8 10l4 4 4-4M4 19h16"/></svg></s><p>保存图片</p></div>
      <div class="wxb"><s><svg viewBox="0 0 24 24"><path d="M4 12l6-7 4 5 6-3-2 12H4z"/></svg></s><p>转发为贴图</p></div>
    </div><div class="wxx">✕</div>
    <div class="who2">以上这一排：微信的，我们动不了</div></div></div>`
)

fs.writeFileSync(path.join(DIR, 'v14-五条改动.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v14 · 10-01 深夜五条</title><style>${CSS}</style></head><body>
<h1>v14 · 他深夜给的五条（第 3 条按参考图改了口径）</h1>
<p class="lead">七屏：<b>1</b> 我的→关于（推荐图麦 + 魅力值规则）｜<b>2</b> 私密密码·设置态第一遍｜<b>3</b> 第二遍｜<b>4</b> 已经设过｜
<b>5</b> 卡片模板页（保存上移）｜<b>6</b> 新建页四步｜<b>7</b> 分享态全黑。<br>
屏高一比一照这次真机截图的比例（1116×2484 → <code>750×1670rpx</code>）；
主题吃他手机上那一套<b>天青</b>：<code>app.wxss .theme-tint-celadon</code> 的变量原值，底栏那格是
<code>palette.chromeOf('tint-celadon')</code> 现算的 <code>${CH.bg}</code> / 选中 <code>${CH.sel}</code>。
字号全部落在现网令牌上（<code>--fs-h1 42 / h2 34 / title 31 / body 28 / meta 24 / tiny 21 / label 20 / micro 18</code>）。
<span class="tag">现网</span>屏上那句在 <code>utils/i18n.js</code> 里逐字对过；<span class="tag.new">新串</span>这轮新造的，实现时中英各写一份进字典。</p>
<div class="row">${s1}${s2}</div>
<div class="row">${s3}${s3b}</div>
<div class="row">${s4}${s5}</div>
<div class="row">${s6}</div>
</body></html>`)
console.log('ok → v14-五条改动.html')
