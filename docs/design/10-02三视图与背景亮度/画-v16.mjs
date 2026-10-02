// v16 效果图：站长 10-02 下午两轮。第一轮＝三区统一（纸片墙 / 一行两种排布、搜索与切换 icon 上背景图、
// 置顶钉在时间轴顶上、分类内缩、每区两条自己的 Tips、撤掉原笔记那套行卡）；
// 第二轮＝深浅那根竖向滑块撤了，换「换背景」左边三枚灰度小圆（纯白/25%/50%），箭头挪到「换背景」右边。
// 跑法：node docs/design/10-02三视图与背景亮度/画-v16.mjs
//
// 口径全部从代码侧取，不自己发明：
//   屏高 750×1670 = 1px:1rpx（同 v14/v15，比例照他发来的真机截图）；
//   主题 = 现网 theme-default（app.wxss page 那一块令牌原值），底栏那格 palette.chromeOf('default') 现算；
//   小黄点 = palette.TIP_DOT；录入条四枚色点 = palette.TONES 按 create.js 的 toneStyle 下标；
//   纸片那十枚 = 莫兰迪经典色卡（他 10-02 指定），是这轮新造的一族，实现时进 palette.js；
//   屏上每句界面话先 grep utils/i18n.js：现网有的照抄，这轮新造的在标注里写「新串」。
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
const require = createRequire(import.meta.url)
const palette = require('../../../miniprogram/utils/palette.js')

const DIR = path.dirname(fileURLToPath(import.meta.url))
const FONT = fs
  .readFileSync(path.join(DIR, '../../../miniprogram/app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]
const TIP = palette.TIP_DOT
const CH = JSON.parse(JSON.stringify(palette.chromeOf('default')))

/* 十套模板 → 一枚不重复的标识色。站长 10-02 追加：便签墙那十枚走莫兰迪经典色卡，
   不再吃 palette 里那五支饱和分类色（饱和色铺成一面便签纸太吵，读不出"桌面"）。
   这十支是这轮新造的一族，实现时和 TIP_DOT 一样进 palette.js 当唯一出口，
   不许抄进 wxss（`验-统一录入条.js` 扫的就是这个）。
   注意：这只是小图的标识色；点开的那张大图仍是真实海报，吃模板自己的配色。 */
const T = {
  card: { name: '玉版宣', c: '#DCCFB8', ink: '#3A3122' },
  quote: { name: '摘句', c: '#A8BCC9', ink: '#23323C' },
  block: { name: '叠翠', c: '#A9BCA6', ink: '#22331F' },
  letter: { name: '素宣信笺', c: '#D3B6B4', ink: '#3B2523' },
  popGrid: { name: '波普分格', c: '#C79A80', ink: '#3A2317' },
  popDots: { name: '网点漫画', c: '#B6A8C0', ink: '#2E2540' },
  acid: { name: '荧光渐变', c: '#7B9080', ink: '#F0F4EF' },
  cover: { name: '杂志封面', c: '#6E8296', ink: '#F1F4F6' },
  lit: { name: '纸间文艺', c: '#9A9A6E', ink: '#2A2B16' },
  spec: { name: '规格卡', c: '#5B6470', ink: '#EDEFF2' },
}
/* 「置顶」那一档右侧的小圆点：莫兰迪这一族里唯一偏橙的一枚（砖橙灰），
   与小黄点 TIP_DOT 区分得开，又不跳出这一族。 */
const PIN = T.popGrid.c
/* 三视图共用的三枚 icon：搜索 / 纸片墙 / 一行。描边一律走 .ic svg 的半透明白。 */
const SVG = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3.4" y="3.4" width="7.4" height="9.4" rx="1.8"/><rect x="13.2" y="3.4" width="7.4" height="9.4" rx="1.8"/><rect x="3.4" y="15" width="7.4" height="6" rx="1.8"/><rect x="13.2" y="15" width="7.4" height="6" rx="1.8"/></svg>',
  lines: '<svg viewBox="0 0 24 24"><path d="M4 6.5h16M4 12h16M4 17.5h16"/></svg>',
}
/* 笔记视图的纸片按分类上色（同一族莫兰迪，另配一枚墨黑给未分类） */
const CATM = { 未分类: '#5B6470', 旅游: '#A8BCC9', 生活: '#A9BCA6', 私密: '#D3B6B4' }
const CATINK = { 未分类: '#EDEFF2', 旅游: '#23323C', 生活: '#22331F', 私密: '#3B2523' }

const CSS = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${FONT}) format('truetype');font-weight:100;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:#DCDAD4;font-family:'PingFang SC','Helvetica Neue',sans-serif;color:#23252c;padding:48px 40px 64px}
h1{font-size:34px;letter-spacing:-.6px;margin-bottom:10px}
.lead{font-size:16px;line-height:1.7;color:#4a4f47;max-width:1560px;margin-bottom:34px}
.lead code{background:#fff;padding:2px 7px;border-radius:5px;font-size:15px}
.row{display:flex;gap:34px;align-items:flex-start;flex-wrap:wrap;margin-bottom:44px}
.cell{width:750px}
.cap{font-size:15px;line-height:1.65;color:#4a4f47;margin-top:12px}
.cap b{color:#23252c}
.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:14px}
.tag{display:inline-block;font-size:13px;padding:2px 8px;border-radius:999px;background:#23252c;color:#F2EFE9;margin-right:6px;vertical-align:2px}
.tag.new{background:${TIP};color:#2A2005}
.tag.cut{background:#b4231f;color:#fff}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:#f4f2ec;color:#23252c;
  --fs-h1:42px;--fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --sp-2:16px;--sp-3:24px;--sp-4:32px;--sp-5:48px;--r-card:40px;--r-chip:28px;--r-pill:999px;--w-edge:3px;
  --t2:#5c6068;--t3:#9a9ea6;--edge:rgba(35,37,44,.1);--chip:rgba(35,37,44,.06);--ink:#23252c}
.status{height:94px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 44px;
  font-size:26px;font-weight:600;color:#fff;background:#181A20}
.status .r{font-size:22px;font-weight:500;letter-spacing:1px}
.nav{height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;position:relative;
  color:#F2EFE9;background:#181A20}
.nav .capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
  display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#fff}
.nav.paper{background:#f4f2ec;color:#23252c}
.nav.paper .capsule{background:rgba(35,37,44,.06);border-color:rgba(35,37,44,.14);color:#23252c}
.body{padding:0 24px;position:relative}
.card{background:#fff;border:var(--w-edge) solid var(--edge);border-radius:var(--r-card)}
/* 铺满屏的那张形象图（现网 create 页就是这个画法：图铺两页、永远铺）。
   站长 10-02 下午：那根竖向滑块太重，撤了；改成「换背景」左边三枚灰度小圆，
   纯白 / 25% / 50% 三档，圆点直径与 Tips 字号同一档（--fs-meta 24）。 */
.wall{position:absolute;inset:0;background:url(../../../miniprogram/assets/home-bg-portrait.jpg) center 15%/cover no-repeat}
.wall .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%)}
.wall.dim25 .scrim{background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%),rgba(8,9,12,.25)}
.wall.dim50 .scrim{background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%),rgba(8,9,12,.5)}
.top{position:relative;z-index:3;padding:26px 32px 0}
.top .h1{font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.top .dt{font-size:var(--fs-meta);margin-top:12px;color:rgba(242,239,233,.72);letter-spacing:1px}
.lang{position:absolute;right:32px;top:30px;display:flex;gap:20px;align-items:baseline;font-size:var(--fs-meta);color:rgba(242,239,233,.55)}
.lang b{color:#F2EFE9;font-weight:700;border-bottom:4px solid #F2EFE9;padding:0 2px 4px}
/* ① 新增：竖向亮度滑块。半透明，像浮在图上；下沿不越过面板上沿 */
/* 三枚灰度小圆：直径与 Tips 字号同一档（--fs-meta 24），选中那枚外面套一圈白环。
   纯白 / 25% / 50% 三档，圆本身的深浅就是那层罩子的深浅。 */
.bri2{display:flex;align-items:center;gap:14px}
.bri2 b{width:24px;height:24px;border-radius:50%;display:block;border:1px solid rgba(8,9,12,.28)}
.bri2 b.on{box-shadow:0 0 0 3px rgba(255,255,255,.8)}
/* 底部录入这一带照抄现网 create.wxss：收起态 = Tips 一行 + 一枚纸白胶囊 + 换背景一行。
   .entry-wrap{margin-top:62vh} 在 1486 的视口上把条顶落在 1105，Tips 那 68 高坐在它上面；
   展开态 .entry-dock 把整块钉在 bottom:152，条身换成面板的圆头盖。 */
.tips2{position:absolute;left:0;right:0;top:1037px;height:68px;display:flex;align-items:flex-start;
  padding-left:48px;font-size:var(--fs-meta);line-height:1.4;color:rgba(242,239,233,.82);z-index:5}
.tips2 i{width:14px;height:14px;margin:10px 12px 0 0;border-radius:50%;flex:none;background:${TIP}}
.tips2 span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ebar{position:absolute;left:24px;right:24px;top:1105px;height:128px;border-radius:var(--r-pill);
  background:#f2efe9;border:var(--w-edge) solid rgba(35,37,44,.1);display:flex;align-items:center;gap:22px;
  padding:0 20px 0 34px;z-index:5}
.ebar .lead{width:52px;height:52px;background:#23252c;flex:none}
.ebar .lab{flex:1;min-width:0;font-size:var(--fs-title);font-weight:800;letter-spacing:-1px;color:#23252c;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ebar .hint{flex:none;font-size:var(--fs-meta);font-weight:600;color:rgba(35,37,44,.42)}
.ebar .dots{display:flex;gap:20px;flex:none}
.ebar .dots i{width:72px;height:72px;border-radius:50%}
.swap{position:absolute;left:0;right:0;top:1255px;height:110px;display:flex;align-items:center;justify-content:center;
  gap:12px;font-size:var(--fs-meta);font-weight:700;letter-spacing:1px;color:rgba(242,239,233,.85);z-index:5}
.swap em{font-style:normal}
.swap .bri2{margin:0 10px 0 0}
.swap i{width:24px;height:24px;background:rgba(242,239,233,.85);clip-path:polygon(0 0,100% 50%,0 100%)}
.dock{position:absolute;left:24px;right:24px;bottom:152px;z-index:5}
.dock .ebar{position:static;border-radius:var(--r-card) var(--r-card) 0 0;padding-bottom:4px}
.panel{height:700px;background:#fff;border-radius:0 0 var(--r-card) var(--r-card);padding:28px 32px;position:relative;overflow:hidden}
.p-head{display:flex;align-items:center;gap:18px}
.p-head .ico{width:56px;height:56px;border-radius:16px;background:var(--ink);flex:none}
.p-head b{font-size:var(--fs-h2);font-weight:700;flex:1}
.p-head i{font-style:normal;font-size:var(--fs-meta);color:var(--t3)}
.p-tabs{display:flex;gap:14px;align-items:center;padding:22px 0 8px;border-bottom:3px solid rgba(35,37,44,.07);font-size:var(--fs-body)}
.p-tabs span{color:var(--t2);display:flex;align-items:center;gap:10px}
.p-tabs span::before{content:'';width:16px;height:16px;border-radius:50%;background:var(--d,#ccc)}
.p-tabs span.on{color:var(--ink);font-weight:700;border-bottom:5px solid var(--ink);padding-bottom:10px;margin-bottom:-8px}
.p-body{padding-top:22px;font-size:var(--fs-meta);color:var(--t2)}
.p-faces{display:flex;gap:22px;margin-top:22px}
.p-faces div{flex:1;height:170px;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:var(--fs-h2);font-weight:700}
.p-faces div i{font-style:normal;font-size:var(--fs-tiny);font-weight:400;opacity:.72}
.p-acts{position:absolute;left:32px;right:32px;bottom:30px;display:flex;gap:20px}
.p-acts b{flex:1;height:96px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;font-size:var(--fs-body)}
.p-acts b.g{background:var(--chip);color:var(--t2)}
.p-acts b.s{background:var(--ink);color:#f2efe9}
.guide{margin-top:24px;padding:18px 22px;border-radius:24px;background:rgba(35,37,44,.035)}
.guide p{display:flex;align-items:center;gap:14px;font-size:var(--fs-meta);line-height:1.45;margin-bottom:8px}
.guide p:last-child{margin-bottom:0}
.guide em{font-style:normal;color:rgba(35,37,44,.72)}
.guide s{color:rgba(35,37,44,.42);text-decoration:none}
.guide i{width:14px;height:14px;border-radius:50%;flex:none;background:${TIP}}
/* 底栏：纯图标 + 同色阶圆底（10-01 晚定稿），色从 chromeOf 现算 */
.bar{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;z-index:6;
  background:${CH.bg};border:3px solid ${CH.line};display:flex;align-items:center;justify-content:space-around;
  box-shadow:0 16px 44px ${CH.shadow}}
.bar u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:${CH.idle};color:${CH.ink}}
.bar u.on{background:${CH.sel};color:${CH.ink}}
.bar svg{width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
/* 「我的」页头部（band 542 + sheet 盖住 40） */
.band{height:542px;position:relative;overflow:hidden;margin:0 -24px}
.band .ph2{position:absolute;inset:0;background:url(../../../miniprogram/assets/home-bg-portrait.jpg) center 15%/cover no-repeat}
.band .sc{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 14%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%)}
.band .t1{position:absolute;left:32px;top:22px;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.band .mind{position:absolute;right:32px;top:24px;text-align:right;color:rgba(242,239,233,.74)}
.band .mind b{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:64px;line-height:.86}
.band .mind i{font-style:normal;display:block;margin-top:10px;padding-left:4px;text-align:center;font-size:var(--fs-micro);font-weight:700;letter-spacing:4px;color:rgba(242,239,233,.62)}
.sheet{position:relative;margin:-40px 0 0;height:144px;padding:0 32px;display:flex;align-items:center;gap:24px;
  background:#fff;border-radius:var(--r-card)}
.sheet .lg{width:80px;height:80px;border-radius:50%;flex:none;background:url(../../../miniprogram/assets/logo.png) center/cover no-repeat}
.sheet .tx{flex:1;min-width:0}
.sheet .tx b{display:block;font-size:var(--fs-title);font-weight:800;letter-spacing:-.4px;line-height:1.25}
.sheet .tx i{display:block;font-style:normal;font-size:var(--fs-meta);color:var(--t2);line-height:1.4;margin-top:7px}
.seg{display:flex;gap:4px;background:rgba(35,37,44,.055);border-radius:var(--r-pill);padding:5px;flex:none}
.seg span{height:58px;line-height:58px;padding:0 24px;border-radius:var(--r-pill);font-size:var(--fs-meta);font-weight:700;color:var(--t2)}
.seg span.on{background:var(--ink);color:#f4f2ec}
.grp{margin-top:24px;padding:0 32px}
.mi{display:flex;align-items:center;justify-content:space-between;height:106px;border-bottom:var(--w-edge) solid var(--edge);font-size:var(--fs-body);font-weight:700;letter-spacing:-.3px}
.mi:last-child{border-bottom:none}
.mi .ic{width:46px;height:46px;border-radius:50%;background:var(--ink);color:#f4f2ec;display:flex;align-items:center;justify-content:center;font-size:22px}
/* ④ 三列 = 三视图开关：数字下面一条黄杠表示当前在哪一屏 */
.stats{position:absolute;right:32px;top:24px;display:flex;gap:34px;z-index:4}
.st{width:96px;text-align:center;color:rgba(242,239,233,.74)}
.st b{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:56px;line-height:.9}
.st i{font-style:normal;display:block;margin-top:8px;font-size:var(--fs-micro);letter-spacing:2px;color:rgba(242,239,233,.62)}
.st u{display:block;height:6px;border-radius:3px;margin:10px auto 0;width:0;background:${TIP};text-decoration:none}
.st.on u{width:44px}
/* ⑤ 背景图上那两行 Tips 和那一排控件（站长 10-02 第二轮）：
   每个区各两条自己的 Tips；三枚 icon 单色白、半透明；搜索右锚定，点击向左展开。 */
.tips3{position:absolute;left:32px;right:32px;top:246px;z-index:4;display:flex;flex-direction:column;gap:16px}
.tp{display:flex;align-items:center;gap:14px;font-size:var(--fs-meta);line-height:1.35;color:rgba(242,239,233,.82)}
.tp i{width:14px;height:14px;border-radius:50%;flex:none;background:${TIP}}
.tools{position:absolute;left:24px;right:24px;top:372px;height:76px;display:flex;align-items:center;justify-content:flex-end;gap:20px;z-index:5}
.ic{width:76px;height:76px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4)}
.ic svg,.srch svg{width:34px;height:34px;stroke:rgba(255,255,255,.92);fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.ic.on{background:rgba(255,255,255,.46);border-color:rgba(255,255,255,.9)}
.ic.on svg{stroke:rgba(23,24,28,.88)}
.srch{height:76px;border-radius:var(--r-pill);display:flex;align-items:center;gap:16px;padding:0 21px;
  background:rgba(255,255,255,.2);border:2px solid rgba(255,255,255,.4);flex:none}
.srch.open{width:396px;background:rgba(255,255,255,.34)}
.srch span{font-size:var(--fs-meta);color:rgba(242,239,233,.94);white-space:nowrap}
/* ⑥ 列表区：「置顶」那一档钉在区顶（不跟月份滚）→ 下面左时间轴 + 右纸片墙 / 一行 */
.list{position:absolute;left:0;right:0;top:686px;bottom:150px;background:#f4f2ec;
  border-radius:var(--r-card) var(--r-card) 0 0;padding:0 24px;display:flex;flex-direction:column;overflow:hidden}
.pinh{display:flex;align-items:center;gap:14px;height:66px;padding-top:18px;flex:none}
.pinh i{width:16px;height:16px;border-radius:50%;background:${PIN}}
.pinh b{font-size:var(--fs-meta);font-weight:700;letter-spacing:2px;color:var(--ink)}
.pinh em{font-style:normal;font-size:var(--fs-micro);letter-spacing:1px;color:var(--t3)}
.bodyrow{flex:1;display:flex;min-height:0;position:relative}
.rail{width:126px;flex:none;position:relative;padding-right:20px}
.rail .line{position:absolute;right:9px;top:10px;bottom:0;width:2px;background:rgba(35,37,44,.14)}
.rm{position:absolute;right:20px}
.rm .dot{position:absolute;right:-11px;top:6px;width:16px;height:16px;border-radius:50%;background:${TIP}}
.rm .ym{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:28px;color:var(--t2);line-height:1;white-space:nowrap}
.stage2{flex:1;position:relative}
.gp{position:absolute;left:0;right:0}
.desk{position:absolute;inset:0}
/* 分类那一排在列表区最上面，左右各内缩 24（不贴着区域边缘）；只有笔记视图有 */
.cats{display:flex;gap:14px;padding:24px 24px 0;font-size:var(--fs-tiny);flex:none}
.cats span{padding:8px 22px;border-radius:var(--r-pill)}
.note{position:absolute;width:150px;height:200px;border-radius:22px;padding:16px 14px;
  box-shadow:0 8px 22px rgba(8,10,14,.15);font-size:18px;line-height:1.3;font-weight:600}
.note .av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.92);margin-bottom:10px;background-size:cover}
.note .tail{position:absolute;left:14px;right:14px;bottom:14px;font-size:15px;font-weight:400;opacity:.6;
  font-family:'WtsjMind',sans-serif}
/* 一行模式：只有标题 + 日期，两条之间一条细线；日期再降一档 */
.rows{position:relative;padding-top:6px}
.rw{display:flex;align-items:center;gap:18px;height:92px;border-bottom:2px solid rgba(35,37,44,.07)}
.rw:last-child{border-bottom:none}
.rw b{flex:1;min-width:0;font-size:var(--fs-body);font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rw s{text-decoration:none;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:var(--fs-micro);color:var(--t3);flex:none}
/* 大图那一层：整屏纯黑（与 1.9.11 的 shareDim 同口径） */
.dark{position:absolute;inset:0;background:#000;z-index:8;display:flex;flex-direction:column;align-items:center;padding-top:0}
.dark .art{width:430px;height:640px;border-radius:22px;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.6);margin-top:auto}
.dark .art .in{position:absolute;inset:0;padding:34px 30px;color:#17181C;font-size:24px;line-height:1.4;font-weight:600}
.dark .art .in h4{font-size:34px;line-height:1.25;margin-bottom:14px;font-weight:800}
.dark .hint{color:rgba(255,255,255,.5);font-size:var(--fs-tiny);margin-top:18px}
.dark .wx{margin-top:auto;width:100%;padding:0 24px 40px}
.dark .wxr{display:flex;justify-content:space-between;margin-bottom:26px}
.dark .wxb{text-decoration:none;color:#fff;font-size:var(--fs-tiny);display:flex;flex-direction:column;align-items:center;gap:10px}
.dark .wxb s{width:88px;height:88px;border-radius:26px;display:flex;align-items:center;justify-content:center}
.dark .wxb svg{width:44px;height:44px;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.dark .acts{display:flex;gap:20px;margin-bottom:22px}
.dark .acts b{flex:1;height:96px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:600}
.dark .acts b.g{background:rgba(255,255,255,.12);color:#fff}
.dark .acts b.s{background:#fff;color:#17181C}
.sheet2{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:40px 40px 0 0;padding:36px 32px 48px;z-index:9}
.sheet2 h3{font-size:var(--fs-h2);font-weight:700;margin-bottom:12px}
.sheet2 p{font-size:var(--fs-body);line-height:var(--lh-body,1.6);color:var(--t2);margin-bottom:30px}
.sheet2 .two{display:flex;gap:20px}
.sheet2 .two b{flex:1;height:96px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:600}
.sheet2 .two b.g{background:var(--chip);color:var(--t2)}
.sheet2 .two b.d{background:#b4231f;color:#fff}
/* 落地页（别人扫码） */
.gone{position:absolute;left:0;right:0;top:184px;bottom:0;background:#f4f2ec;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:0 64px;text-align:center}
.gone .mk{width:120px;height:120px;border-radius:50%;background:var(--chip);display:flex;align-items:center;justify-content:center;font-size:56px;color:var(--t3)}
.gone p{font-size:var(--fs-body);line-height:1.6;color:var(--t2)}
.gone b{font-size:var(--fs-h2);font-weight:700}
/* 外观设置 */
.phead{padding:24px 0 0;display:flex;flex-direction:column;gap:8px}
.phead b{font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px}
.phead i{font-style:normal;font-size:var(--fs-tiny);color:var(--t3)}
.sec{margin:34px 0 14px;display:flex;align-items:baseline;gap:14px}
.sec b{font-size:var(--fs-h2);font-weight:700;letter-spacing:-.4px;white-space:nowrap;flex:none}
.sec i{font-style:normal;font-size:var(--fs-tiny);color:var(--t3);line-height:1.5}
.stage{display:flex;flex-direction:column;align-items:center;padding:8px 0 0}
.mock{width:430px;height:772px;border-radius:56px;background:#fff;border:3px solid var(--edge);padding:22px;position:relative}
.mock .sc{width:100%;height:100%;border-radius:38px;background:#f4f2ec;overflow:hidden;position:relative}
.mock .nt{position:absolute;left:50%;top:16px;width:120px;height:26px;margin-left:-60px;border-radius:14px;background:#23252c}
.mock .nv{padding:52px 0 0;text-align:center;font-size:24px;font-weight:600}
.mock .bd{padding:22px 20px}
.mock .bd h5{font-size:30px;font-weight:700;margin-bottom:16px}
.mock .rw{display:flex;gap:14px;align-items:center;background:#fff;border:2px solid var(--edge);border-radius:22px;padding:14px;margin-bottom:14px}
.mock .rw .bk{width:56px;height:56px;border-radius:16px;flex:none}
.mock .rw .ln{height:12px;border-radius:6px;background:rgba(35,37,44,.14)}
.mock .tb{position:absolute;left:14px;right:14px;bottom:14px;height:72px;border-radius:36px;background:#fff;
  border:2px solid var(--edge);display:flex;align-items:center;justify-content:space-around}
.mock .tb u{width:50px;height:50px;border-radius:50%;background:rgba(35,37,44,.1);text-decoration:none}
.mock .tb u.on{background:#23252c}
.sfoot{text-align:center;font-size:var(--fs-tiny);color:var(--t3);padding:24px 0 0}
.strip{display:flex;gap:18px;overflow:hidden;padding:26px 2px 0}
.chip{width:118px;flex:none;text-align:center}
.chip .tile{height:150px;border-radius:26px;position:relative;overflow:hidden;border:3px solid transparent}
.chip .tile i{position:absolute;left:0;right:0;height:34%;display:block}
.chip .tile u{position:absolute;right:10px;bottom:10px;width:34px;height:34px;border-radius:50%;background:#23252c;color:#f2efe9;
  display:flex;align-items:center;justify-content:center;font-size:22px;text-decoration:none;font-style:normal}
.chip.on .tile{border-color:#23252c}
.chip p{font-size:var(--fs-tiny);color:var(--t2);margin-top:10px}
`

const status = (t) => `<div class="status"><span>${t}</span><span class="r">100 ▮</span></div>`
const nav = (t, paper) => `<div class="nav ${paper ? 'paper' : ''}">${t}<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const bar = (on) => {
  const svg = [
    '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>',
  ]
  return `<div class="bar">${svg.map((s, i) => `<u class="${i === on ? 'on' : ''}">${s}</u>`).join('')}</div>`
}
/* 三档灰度：圆本身的深浅就是那层罩子的深浅；纯白那枚是默认（不加深）。
   直径 24 = Tips 那一行的字号，选中那枚套一圈白环——没有别的指示就看不出当前在哪一档。 */
const BRI = [['纯白', '#FFFFFF', 0], ['25%', '#A7ABB2', 25], ['50%', '#5C6169', 50]]
const bri = (v) => `<span class="bri2">${BRI.map(([n, c, k]) =>
  `<b class="${k === v ? 'on' : ''}" style="background:${c}" title="${n}"></b>`).join('')}</span>`
const cell = (id, cap, html) => `<div class="cell" id="${id}"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`

/* ---- ①② 首页那一屏：三态 ---- */
/* 三枚入口小圆和面板里四个模式标签的颜色，全部从 palette.TONES 按 create.js 那四个
   toneStyle(i) 的下标取（写 0=直接写 1=链接 2=拍照 3=相册），不在这份稿里另抄一份色值。 */
const tone = (i) => palette.TONES[i].bg
const DOTS = [['拍照', 2], ['相册', 3], ['链接', 1]]
const MODES = [['直接写', 0], ['拍照', 2], ['相册', 3], ['链接', 1]]
const createBody = (v, expanded) => `
  <div class="wall ${v ? 'dim' + v : ''}"><div class="scrim"></div></div>
  ${status('10:40')}${nav('图麦笔记')}
  <div class="top"><div class="h1">看到好内容，随手记下来</div><div class="dt">10月2日 周五</div></div>
  <div class="lang"><b>中</b><span>EN</span></div>
  ${expanded
    ? `<div class="dock">
        <div class="ebar"><div class="lead"></div><div class="lab">动动手指</div><div class="hint">点空白处收起</div></div>
        <div class="panel">
          <div class="p-tabs">${MODES.map(([n, i], k) => `<span class="${k === 2 ? 'on' : ''}" style="--d:${tone(i)}">${n}</span>`).join('')}</div>
          <div class="p-body">相册选择 / 拍照（JPG·PNG）</div>
          <div class="p-faces"><div style="background:#D9BE8C;color:#23252c">拍照<i>直接开相机</i></div>
            <div style="background:#8A6440;color:#F2EFE9">相册<i>选已有截图</i></div></div>
          <div class="guide">
            <p><i></i><em>粘贴各类图文</em><s>公众号 / 小红书 / 豆瓣 的链接或截图</s></p>
            <p><i></i><em>AI自动提炼</em><s>图里的字也读得懂，出摘要、要点</s></p>
            <p><i></i><em>存成笔记卡片</em><s>能搜、能归类，能分享到朋友圈</s></p>
            <p><i></i><em>种草转存</em><s>别人看到你分享卡片图，一键扫码转存</s></p>
          </div>
          <div class="p-acts"><b class="s" style="flex:1">开始提炼</b></div>
        </div>
      </div>`
    : `<div class="tips2"><i></i><span>Tips：分享时可选卡片模板，换套版式再发出去</span></div>
       <div class="ebar"><div class="lead"></div><div class="lab">动动手指</div>
         <div class="dots">${DOTS.map(([, i]) => `<i style="background:${tone(i)}"></i>`).join('')}</div></div>
       <div class="swap"><em>调亮度</em>${bri(v)}<span>换背景</span><i></i></div>`}
  ${bar(0)}`

/* ---- ⑦ 三视图共用的头部（背景图）与列表区（置顶 + 时间轴 + 两种排布） ---- */
const stats = (on) => `<div class="stats">${[['20', '笔记', 'notes'], ['6', '分享', 'shares'], ['3', '种草', 'saved']].map(([n, l, k]) =>
  `<div class="st ${k === on ? 'on' : ''}"><b>${n}</b><i>${l}</i><u></u></div>`).join('')}</div>`
/* 每个区两条自己的 Tips，前两条逐字取自 utils/i18n.js 的 tips 池；种草那两句字典里没有，标「新串」 */
const TIPS = {
  notes: ['拍照或截图存进来，会自动提炼成要点', '贴一个公众号链接，长文读成三句话'],
  shares: ['分享时可选卡片模板，换套版式再发出去', '笔记卡片可以「保存并分享」，直接发到微信'],
  saved: ['别人种草的卡片只能看，不再往外分享', '点大图能跳到你自己在库里那一条'],
}
const CATS = [['全部', '#23252c', '#f2efe9'], ['旅游', '#F6C445', '#2A2005'], ['生活', '#46A863', '#06260F'], ['私密', '#E9723D', '#2C1204']]
const head = (on, mode, open) => `
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>${stats(on)}
    <div class="tips3">${TIPS[on].map((x) => `<div class="tp"><i></i>${x}</div>`).join('')}</div>
    <div class="tools">
      <div class="srch ${open ? 'open' : ''}">${SVG.search}${open ? '<span>输入关键词</span>' : ''}</div>
      <div class="ic ${mode === 'desk' ? 'on' : ''}">${SVG.grid}</div>
      <div class="ic ${mode === 'rows' ? 'on' : ''}">${SVG.lines}</div>
    </div></div></div>`
const skin = (k) => T[k] || { c: CATM[k], ink: CATINK[k] }
/* 便签墙的摆位：第一行四枚（x 步 140，比 150 的枚宽窄一点，左右轻叠）；第二行错开半格、只三枚，
   往上抬 140（一枚 200 高 → 上下压掉 60）。错开半格是必需的：不躲开的话压掉的那一条正好盖住
   第一行每枚右下角的日期；躲开之后只压掉一个角，日期留在外面。一个月 7 枚。 */
const lay = (cards) => cards.map((c, i) => {
  const row = i < 4 ? 0 : 1, col = row ? i - 4 : i
  return { k: c[1], t: c[0], tail: c[2], lg: c[3] || 0,
    x: row ? col * 140 + 70 : col * 140, y: row * 140 + (row ? [12, 4, 16][col] : [0, 10, 6, 14][col]),
    r: [-3, 2.2, -1.6, 3][col] + row * 1.4 }
})
const desk = (cards) => `<div class="desk">${lay(cards).map((c) =>
  `<div class="note" style="left:${c.x}px;top:${c.y}px;transform:rotate(${c.r}deg);background:${skin(c.k).c};color:${skin(c.k).ink};z-index:${1 + c.y / 10}">
    ${c.lg ? `<div class="av" style="background-image:url(../../../miniprogram/assets/logo.png)"></div>` : ''}
    ${c.t}<div class="tail">${c.tail}</div></div>`).join('')}</div>`
const rows = (cards) => `<div class="rows">${cards.slice(0, 3).map(([t, , d]) => `<div class="rw"><b>${t}</b><s>${d}</s></div>`).join('')}</div>`
/* 三组月份各自的顶边（绝对定位，好让左边那一列月份跟着同一高度对齐）。
   列表区 834 高，扣掉分类那一排 66 和「置顶」那一档 66，剩下 702 给月份——两档刚好铺满，第三档在屏外可滚。 */
const GY = [0, 356]
const GH = 340
const list = (groups, mode, pinned, cats) => `<div class="list">
  ${cats ? `<div class="cats">${CATS.map(([a, bg, ink]) => `<span style="background:${bg};color:${ink}">${a}</span>`).join('')}</div>` : ''}
  <div class="pinh"><i></i><b>置顶</b>${pinned ? '<em>只看这两篇</em>' : ''}</div>
  <div class="bodyrow">
    <div class="rail"><div class="line"></div>${groups.map((g, i) =>
      `<div class="rm" style="top:${GY[i]}px"><div class="dot"></div><div class="ym">${g[0]}</div></div>`).join('')}</div>
    <div class="stage2">${groups.map((g, i) =>
      `<div class="gp" style="top:${GY[i]}px;height:${GH}px">${mode === 'rows' ? rows(g[1]) : desk(g[1])}</div>`).join('')}</div>
  </div></div>`
/* 笔记视图的月份内容（分类各一枚莫兰迪色；未分类那枚是炭灰蓝） */
const GN = [
  ['2026-10', [
    ['Qwen3.8-Flash 限时免…', '未分类', '10-02'], ['把长文读成三条要点，设…', '生活', '10-01'],
    ['周末去顺义看那家旧书店…', '旅游', '10-01'], ['摘句那一套的引号怎么排…', '生活', '10-01'],
    ['素宣信笺这一套试的那…', '私密', '09-30'], ['波普分格的四块色…', '旅游', '09-30'],
    ['赫本的电影院之夜，剪…', '生活', '09-29'],
  ]],
  ['2026-09', [
    ['网点漫画那一套的网点…', '生活', '09-24'], ['纸间文艺：一句一行的…', '旅游', '09-22'],
    ['把书读薄的一整套方法…', '未分类', '09-21'], ['棋王里"吃"那一段…', '私密', '09-19'],
    ['旧书店的三张明信片…', '旅游', '09-18'], ['电影院那晚的排片表…', '生活', '09-16'],
    ['杂志封面的标题压边…', '生活', '09-12'],
  ]],
]
const GPIN = [['2026-10', [
  ['Qwen3.8-Flash 限时免…', '未分类', '10-02'], ['把长文读成三条要点，设…', '生活', '10-01'],
]]]
const notesDesk = `${status('10:43')}${nav('图麦笔记')}${head('notes', 'desk', false)}${list(GN, 'desk', false, 1)}${bar(1)}`
const notesRows = `${status('10:43')}${nav('图麦笔记')}${head('notes', 'rows', false)}${list(GN, 'rows', false, 1)}${bar(1)}`
const notesSearch = `${status('10:43')}${nav('图麦笔记')}${head('notes', 'desk', true)}${list(GN, 'desk', false, 1)}${bar(1)}`
const notesPinned = `${status('10:43')}${nav('图麦笔记')}${head('notes', 'desk', false)}${list(GPIN, 'desk', true, 1)}${bar(1)}`

/* ---- ⑧ 分享 / 种草：同一套版式，纸片按模板各一枚莫兰迪色 ---- */
const GS = [
  ['2026-10', [
    ['Qwen3.8-Flash 限时免…', 'card', '10-02'], ['把长文读成三条要点，设…', 'cover', '10-01'],
    ['摘句那一套的引号怎么排…', 'quote', '10-01'], ['赫本的电影院之夜，剪…', 'block', '09-30'],
    ['素宣信笺这一套试的那…', 'letter', '09-29'], ['波普分格的四块色…', 'popGrid', '09-28'],
    ['网点漫画那一套的网点…', 'popDots', '09-27'],
  ]],
  ['2026-09', [
    ['纸间文艺：一句一行的…', 'lit', '09-24'], ['规格卡这一套的排版…', 'spec', '09-21'],
    ['周末清单：三件事…', 'card', '09-19'], ['旧书店的三张明信片…', 'quote', '09-16'],
    ['读书笔记的两种记法…', 'block', '09-13'], ['一张图能记住的事…', 'letter', '09-10'],
  ]],
]
const GSV = [
  ['2026-10', [
    ['阿城笔记：棋王里的吃…', 'quote', '来自 老李', 1], ['把书读薄的一整套方法…', 'acid', '来自 木木', 1],
    ['规格卡这一套的排版…', 'spec', '来自 阿岚', 1],
  ]],
]
const sharesDesk = `${status('10:44')}${nav('图麦笔记')}${head('shares', 'desk', false)}${list(GS, 'desk', false)}${bar(1)}`
const sharesRows = `${status('10:44')}${nav('图麦笔记')}${head('shares', 'rows', false)}${list(GS, 'rows', false)}${bar(1)}`
const savedDesk = `${status('10:46')}${nav('图麦笔记')}${head('saved', 'desk', false)}${list(GSV, 'desk', false)}${bar(1)}`

/* ---- ⑨ 分享视图点大图 ---- */
const bigShare = `
  ${status('10:45')}${nav('图麦笔记')}${head('shares', 'desk', false)}${list(GS, 'desk', false)}
  <div class="dark">
    <div class="art" style="background:#F6C445"><div class="in"><h4>Qwen3.8-Flash 限时免费（Qoder 国际）</h4>
      Qwen3.8-Flash 是多模态模型，支持编程、长文档处理、图像理解与工具调用。<div style="margin-top:16px;font-size:20px;font-weight:400;opacity:.7">图麦笔记 · 扫码秒看</div></div></div>
    <div class="hint">这就是当时分享出去的那一张（同一套模板重画）· 长按可撤回</div>
    <div class="wx">
      <div class="acts"><b class="g">取消</b><b class="s">保存并分享</b></div>
      <div class="wxr">
        ${[['#2AA968', '发送给朋友', '<path d="M4 12h12M12 6l6 6-6 6"/>'], ['#2AA968', '分享到朋友圈', '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>'],
          ['#3F7FD6', '收藏', '<path d="M12 4l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.5 10.2z"/>'],
          ['#3F7FD6', '保存图片', '<path d="M12 4v10M8 10l4 4 4-4M4 19h16"/>'],
          ['#E0567A', '转发为贴图', '<path d="M4 12l6-7 4 5 6-3-2 12H4z"/>']].map(([bg, n, d]) =>
          `<a class="wxb"><s style="background:${bg}"><svg viewBox="0 0 24 24" style="stroke:#fff">${d}</svg></s>${n}</a>`).join('')}
      </div>
      <div class="hint" style="text-align:center">这一排五枚与那五个词是微信自己的，我们改不了</div>
    </div>
  </div>`

/* ---- ⑩ 长按撤回的确认 ---- */
const askRevoke = `
  ${status('10:45')}${nav('图麦笔记')}${head('shares', 'desk', false)}${list(GS, 'desk', false)}
  <div class="dark" style="justify-content:flex-end;padding:0;background:rgba(8,9,12,.62)">
    <div class="sheet2"><h3>撤掉这篇的分享？</h3>
      <p>已经发出去的那张海报会立刻扫不开。要再分享就重新生成一张码。</p>
      <div class="two"><b class="g">取消</b><b class="d">撤掉</b></div></div>
  </div>`

/* ---- ⑪ 种草视图：同一版式，小图带对方圆 LOGO ---- */
/* ---- ⑫ 种草的大图：只能看 + 跳自己的笔记，没有分享按钮 ---- */
const bigSaved = `
  ${status('10:47')}${nav('图麦笔记')}${head('saved', 'desk', false)}${list(GSV, 'desk', false)}
  <div class="dark">
    <div class="art" style="background:#3F52D6;color:#fff"><div class="in" style="color:#fff"><div class="av" style="width:56px;height:56px;border-radius:50%;background:url(../../../miniprogram/assets/logo.png) center/cover;margin-bottom:16px"></div>
      <h4>阿城笔记：棋王里的吃</h4>这一条是别人分享的，你转存进了自己的笔记。<div style="margin-top:14px;font-size:20px;font-weight:400;opacity:.7">来自 老李 · 09-28</div></div></div>
    <div class="hint">别人那张卡只能看，不再往外分享</div>
    <div class="wx"><div class="acts"><b class="g">关闭</b><b class="s">打开我的笔记</b></div></div>
  </div>`

/* ---- ⑬ 别人扫已经撤回的码 ---- */
const revoked = `
  ${status('10:48')}${nav('图麦笔记', 1)}
  <div class="gone"><div class="mk">⊘</div><b>这篇看不了了</b>
    <p>笔记已经被主人撤回，无法查看。</p></div>`

const SCREENS = [
  ['s1', `<span class="tag.new">改法</span>① 深浅那根竖向滑块<span class="tag cut">撤</span>整个不要了（太重）。改成<b>三枚灰度小圆</b>：纯白 / 25% / 50%，点一下切一档，默认纯白。圆点直径与 Tips 那行字号同一档（24rpx），放在<b>「换背景」左边</b>，圆点左边加三个字「调亮度」，<b>原来那枚箭头挪到「换背景」右边</b>。这一行还是原来那一行的位置，不新占地方。`, createBody(0, false)],
  ['s2', `① 同一屏点第三枚（50%）：加深的是图上那层罩子（在现网 <code>.head-scrim</code> 那四个停点之上再叠一层），字仍然读得清。<b>全局生效</b>——首页、笔记页、「我的」页共用同一张图、同一个值；值存本机，下次进来还是这一档。选中哪一枚靠外面那一圈白环认。`, createBody(50, false)],
  ['s3', `② 笔记视图默认这一种：纸片墙。一枚 <b>150×200</b>（比上一稿又小一圈），第一行四枚、第二行<b>错开半格</b>只三枚并往上抬 140 —— 上下压掉 60，但躲开半格才压不到第一行右下角的日期。一个月 7 枚，一屏两档月份 14 枚。左边时间轴吃 <code>2026-10</code> 那支数字字形；「置顶」那一档钉在列表区顶上、<b>不跟月份滚</b>，右边那枚橙点是莫兰迪这一族里唯一偏橙的一支。分类那一排在列表区最上面、左右各内缩 24，不贴边。`, notesDesk],
  ['s4', `② 同一屏切成「一行」：只有标题 + 日期，两条之间一条细线，日期再降一档（18rpx）。右上角那两枚圆 icon 就是开关，当前那枚底加重。`, notesRows],
  ['s5', `② 点搜索：按钮右锚定、<b>向左展开</b>成输入框（现网那句占位「输入关键词」）。三枚 icon 单色白、半透明，坐在背景图上，与那两枚切换按钮同一行。`, notesSearch],
  ['s6', `② 点「置顶」：右边只留置顶的那两篇，月份那一列淡下去；<b>再拖时间轴上的月份就回正常显示</b>。`, notesPinned],
  ['s7', `③ 分享视图：版式与笔记完全一致，纸片颜色<b>按模板各一枚莫兰迪、不重复</b>（十套模板十支色）。Tips 换成分享那两句。`, sharesDesk],
  ['s8', `③ 分享视图切「一行」。`, sharesRows],
  ['s9', `③ 点小图 = 黑底看那张真卡片，下面还是那五枚（<code>wx.showShareImageMenu</code>，词和图标都是微信的）。<b>这张要后端记一笔当时用的哪套模板</b>，见下面「两个后端前提」。`, bigShare],
  ['s10', `③ 长按大图 = 真撤回（复用现网那条 <code>api.revokeShare</code>）：撤回后小图和大图都从时间轴消失，「分享」那个数跟着减一。弹层一行两枚、各 ≤4 字。`, askRevoke],
  ['s11', `④ 种草视图 = 你转存进来的<b>别人</b>的卡片，同一套版式；卡片左上角带对方的圆形象，没设形象就只留标题。Tips 换成种草那两句<span class="tag.new">新串</span>。`, savedDesk],
  ['s12', `④ 种草的大图只能看：<b>不给那五枚按钮</b>（不能二次分享），改成「打开我的笔记」跳到你自己库里那一条。`, bigSaved],
  ['s13', `<span class="tag.new">改串</span>⑤ 别人扫你已经撤回的那张码：<b>真的撤</b>——落地页那一行从现网那句「这篇笔记的分享已关闭」改成这句。`, revoked],
]

const PRE = `<h2 style="font-size:26px;margin:14px 0 10px">这一稿撤掉的、以及两个后端前提</h2>
<p class="lead"><span class="tag cut">撤</span>原笔记那套展示（白底描边行卡 + 方块 + 分类 chip 压在列表里）整块撤掉，三个区统一成"纸片墙 / 一行"两种排布；搜索条从列表里搬到背景图上。<br>
① <b>shares 表要加一列 <code>poster_tpl</code></b>，分享那一刻把用的哪套模板记进去。现在这张表存了标题、概要、要点、封面图，<b>唯独没存模板 id，也不存成品图</b>；不补这一列，第 5、7 屏"回看当时分享出去的那一张"只能拿当前默认模板重画，跟当初那张对不上。<br>
② <b>这一批做完需要部署一次后端</b>（加列 + 迁移，老数据那列留空、按默认模板兜底）。顺带把 #228 那两格欠的 <code>shares_active</code>／<code>saved_by_users</code> 一起上——不上的话右上角「分享」「种草」两个数在真机上还是恒 0。<br>
其余都在前端：置顶是笔记上已有的一个标记（不新增字段）、三视图同页切视图不新增路由、撤回复用现网接口。</p>`

fs.writeFileSync(path.join(DIR, 'v16-三区便签与亮度小圆.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v16 · 三区便签与亮度小圆</title><style>${CSS}</style></head><body>
<h1>v16 · 他 10-02 下午这两轮（示意，代码一行没动）</h1>
<p class="lead">十三屏：<b>1-2</b> 首页深浅改三枚灰度小圆（撤掉那根竖向滑块）｜<b>3-6</b> 笔记视图（纸片墙 / 一行 / 搜索展开 / 点置顶）｜
<b>7-10</b> 分享视图（墙 / 一行 / 大图 / 长按撤回）｜<b>11-12</b> 种草视图（墙 / 大图）｜<b>13</b> 别人扫已撤回的码。<br>
外观设置点小图直接生效、第三个 tab 随药丸改名那几屏这一轮没动，还在 <code>v15-三视图与背景亮度.html</code>。<br>
屏高 <code>750×1670</code>（1px = 1rpx），主题吃现网 <code>theme-default</code> 令牌，底栏那格是
<code>palette.chromeOf('default')</code> 现算的 <code>${CH.bg}</code>；纸片一律<b>莫兰迪经典色卡</b>
（雾蓝 / 灰绿 / 燕麦 / 藕荷 / 灰紫 / 砖橙灰 / 橄榄 / 深海蓝 / 苔绿 / 炭灰蓝），笔记按分类各一枚、分享与种草按模板各一枚，
这一族是这轮新造的，实现时和 <code>TIP_DOT</code> 一样进 <code>palette.js</code> 当唯一出口。<span class="tag">现网</span>那句在 <code>utils/i18n.js</code> 里逐字对过；
<span class="tag.new">新串</span>这轮新造的，实现时中英各写一份进字典；<span class="tag cut">撤</span>这轮删掉的。</p>
${[0, 2, 4, 6, 8, 10].map((i) => `<div class="row">${SCREENS.slice(i, i + 2).map(([id, cap, html]) => cell(id, cap, html)).join('')}</div>`).join('')}
<div class="row">${cell('s13', SCREENS[12][1], SCREENS[12][2])}</div>
${PRE}
</body></html>`)

/* 逐屏各写一份只有手机框、无标注的薄页，给 Chrome headless 按 750×1670 直接截。
   必须落在本目录：那几个 ../ 相对路径（home-bg-portrait.jpg、logo.png、字体）才认得。 */
for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v16-三区便签与亮度小圆.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)

