// v15 效果图：站长 10-02 上午的六条（外观设置直接生效、首页背景可调深浅、第三个 tab 随药丸改名、
// 第二 tab 三列拆三视图、分享视图时间轴+便签墙+长按撤回、种草视图只看不能二次分享）。
// 跑法：node docs/design/10-02三视图与背景亮度/画-v15.mjs
//
// 口径全部从代码侧取，不自己发明：
//   屏高 750×1670 = 1px:1rpx（同 v14，比例照他这次发来的真机截图）；
//   主题 = 现网 theme-default（app.wxss page 那一块令牌原值），底栏那格 palette.chromeOf('default') 现算；
//   小黄点 = palette.TIP_DOT；十枚小图的色 = palette 里已有的色，只新增"模板→色"这一张对应表；
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
/* 铺满屏的那张形象图（现网 create 页就是这个画法：图铺两页、永远铺） */
.wall{position:absolute;inset:0;background:url(../../../miniprogram/assets/home-bg-portrait.jpg) center 15%/cover no-repeat}
.wall.dim0::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%)}
.wall.dim50::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%),rgba(8,9,12,.5)}
.top{position:relative;z-index:3;padding:26px 32px 0}
.top .h1{font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.top .dt{font-size:var(--fs-meta);margin-top:12px;color:rgba(242,239,233,.72);letter-spacing:1px}
.lang{position:absolute;right:32px;top:30px;display:flex;gap:20px;align-items:baseline;font-size:var(--fs-meta);color:rgba(242,239,233,.55)}
.lang b{color:#F2EFE9;font-weight:700;border-bottom:4px solid #F2EFE9;padding:0 2px 4px}
/* ① 新增：竖向亮度滑块。半透明，像浮在图上；下沿不越过面板上沿 */
.bri{position:absolute;right:32px;top:214px;z-index:4;display:flex;flex-direction:column;align-items:center;gap:12px}
.bri .cap2{font-size:var(--fs-micro);color:rgba(242,239,233,.66);letter-spacing:1px}
.bri .track{width:24px;height:300px;margin:26px 0;border-radius:var(--r-pill);background:rgba(242,239,233,.26);
  border:1px solid rgba(242,239,233,.22);position:relative}
.bri .fill{position:absolute;left:0;right:0;top:0;border-radius:var(--r-pill);background:rgba(242,239,233,.62)}
.bri .knob{position:absolute;left:50%;width:44px;height:44px;margin-left:-22px;border-radius:50%;
  background:#F7F5EF;box-shadow:0 4px 14px rgba(0,0,0,.28)}
.bri .val{font-size:var(--fs-micro);color:#F2EFE9;background:rgba(8,9,12,.42);border-radius:var(--r-pill);padding:3px 12px}
.bri.gone{opacity:0}
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
/* ⑤ 分享 / 种草：左时间轴 + 右便签墙 */
.list{position:absolute;left:0;right:0;top:600px;bottom:150px;background:#f4f2ec;border-radius:var(--r-card) var(--r-card) 0 0;padding:0 24px}
.mo{display:flex;gap:0;padding-top:30px}
.tl{width:150px;flex:none;position:relative;padding-right:22px}
.tl .line{position:absolute;right:10px;top:8px;bottom:-40px;width:2px;background:rgba(35,37,44,.14)}
.tl .dot{position:absolute;right:3px;top:8px;width:16px;height:16px;border-radius:50%;background:${TIP}}
.tl .ym{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:30px;color:var(--t2);line-height:1;white-space:nowrap}
.desk{flex:1;position:relative;height:330px}
.note{position:absolute;width:186px;height:264px;border-radius:26px;padding:20px 18px;
  box-shadow:0 10px 26px rgba(8,10,14,.16);font-size:22px;line-height:1.35;font-weight:600}
.note .av{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.9);margin-bottom:12px;
  background-size:cover}
.note .tail{position:absolute;left:18px;right:18px;bottom:18px;font-size:18px;font-weight:400;opacity:.62;
  font-family:'WtsjMind',sans-serif}
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
const slider = (v, gone) => {
  const pct = Math.round((v / 50) * 100)
  return `<div class="bri ${gone ? 'gone' : ''}">
    <span class="cap2">正常</span>
    <div class="track"><div class="fill" style="height:${pct}%"></div><div class="knob" style="top:calc(${pct}% - 22px)"></div></div>
    <span class="cap2">−50%</span><span class="val">${v === 0 ? '正常' : '加深 ' + v + '%'}</span>
  </div>`
}
const cell = (id, cap, html) => `<div class="cell" id="${id}"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`

/* ---- ①② 首页那一屏：三态 ---- */
/* 三枚入口小圆和面板里四个模式标签的颜色，全部从 palette.TONES 按 create.js 那四个
   toneStyle(i) 的下标取（写 0=直接写 1=链接 2=拍照 3=相册），不在这份稿里另抄一份色值。 */
const tone = (i) => palette.TONES[i].bg
const DOTS = [['拍照', 2], ['相册', 3], ['链接', 1]]
const MODES = [['直接写', 0], ['拍照', 2], ['相册', 3], ['链接', 1]]
const createBody = (v, expanded, gone) => `
  <div class="wall ${v === 0 ? 'dim0' : 'dim50'}"></div>
  ${status('10:40')}${nav('图麦笔记')}
  <div class="top"><div class="h1">看到好内容，随手记下来</div><div class="dt">10月2日 周五</div></div>
  <div class="lang"><b>中</b><span>EN</span></div>
  ${slider(v, gone)}
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
       <div class="swap"><i></i>换背景</div>`}
  ${bar(0)}`

/* ---- ④ 外观设置 ---- */
const wp = [
  ['米白', '#F2EFE9', '#E4DFD4'], ['天青', '#DDE7EC', '#C6D8E0'], ['象牙', '#F3EEE3', '#E6DCC8'],
  ['墨黑', '#23252C', '#3A3D46'], ['赭石', '#D2683F', '#B8552F'], ['草绿', '#46A863', '#3B8E55'],
]
const wallpaper = `
  ${status('10:41')}${nav('外观设置', 1)}
  <div class="body">
    <div class="phead"><b>外观设置</b><i>这台设备上的外观都在这里，换完当场生效</i></div>
    <div class="sec"><b>页面壁纸</b><i>带色阶的两枚连左侧方块一起换色，其余六枚只换页面底和文字</i></div>
    <div class="stage"><div class="mock"><div class="sc"><div class="nt"></div><div class="nv">图麦笔记</div>
      <div class="bd"><h5>我的笔记</h5>
        ${[0, 1, 2, 3].map((i) => `<div class="rw"><div class="bk" style="background:${['#F6C445', '#46A863', '#23252C', '#E9723D'][i]}"></div>
          <div style="flex:1"><div class="ln" style="width:${[72, 58, 78, 46][i]}%"></div><div class="ln" style="width:40%;margin-top:10px"></div></div></div>`).join('')}
      </div>
      <div class="tb"><u class="on"></u><u></u><u></u></div></div></div></div>
    <div class="strip">${wp.map(([n, a, b], i) => `<div class="chip ${i === 0 ? 'on' : ''}">
      <div class="tile" style="background:${b}"><i style="background:${a};top:0"></i>${i === 0 ? '<u>✓</u>' : ''}</div>
      <p>${n}</p></div>`).join('')}</div>
    <div class="sfoot">左右滑挑一枚 · 现在在用：米白</div>
  </div>${bar(2)}`

/* ---- ⑤⑥ 第三个 tab：左上角那行随药丸改名 ---- */
const mePage = (tab) => `
  ${status('10:42')}${nav('图麦笔记')}
  <div class="body">
    <div class="band"><div class="ph2"></div><div class="sc"></div>
      <div class="t1">${tab === 'set' ? '设置' : '关于'}</div>
      <div class="mind"><b>110</b><i>魅力</i></div></div>
    <div class="sheet"><div class="lg"></div><div class="tx"><b>你好！我是图麦笔记</b><i>把图文，提炼成有用的干货</i></div>
      <div class="seg"><span class="${tab === 'set' ? 'on' : ''}">设置</span><span class="${tab === 'about' ? 'on' : ''}">关于</span></div></div>
    ${tab === 'set'
      ? `<div class="grp card">${['卡片模板', '外观设置', '分类管理', '私密密码', '注销账号'].map((x) =>
          `<div class="mi" style="${x === '注销账号' ? 'color:#b4231f' : ''}">${x}<div class="ic">›</div></div>`).join('')}</div>`
      : `<div class="grp card"><div class="mi">产品官网<span style="font-size:var(--fs-meta);color:var(--t2);font-weight:400">agentsbin.cn　<div class="ic" style="display:inline-flex">›</div></span></div>
          <div class="mi">反馈邮箱<span style="font-size:var(--fs-meta);color:var(--t2);font-weight:400">18509828@qq.com　<div class="ic" style="display:inline-flex">›</div></span></div>
          <div class="mi">推荐图麦<div class="ic">›</div></div></div>
        <div class="grp card" style="padding:28px 32px"><b style="font-size:var(--fs-body);font-weight:700">魅力值规则</b>
          ${[['新用户', '100'], ['推荐朋友使用', '+10'], ['笔记被朋友种草', '+1']].map(([a, b]) =>
            `<div class="mi" style="height:72px;border:none"><span style="display:flex;align-items:center;gap:16px;font-weight:400;color:var(--t2)"><i style="width:14px;height:14px;border-radius:50%;background:${TIP};display:block"></i>${a}</span>
             <span style="font-family:'WtsjMind';font-weight:100;font-size:var(--fs-title)">${b}</span></div>`).join('')}</div>`}
  </div>${bar(2)}`

/* ---- ⑦ 笔记视图（现状，只多一条黄杠） ---- */
const stats = (on) => `<div class="stats">${[['20', '笔记', 'notes'], ['6', '分享', 'shares'], ['3', '种草', 'saved']].map(([n, l, k]) =>
  `<div class="st ${k === on ? 'on' : ''}"><b>${n}</b><i>${l}</i><u></u></div>`).join('')}</div>`
const notesView = `
  ${status('10:43')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>${stats('notes')}</div>
    <div class="sheet" style="height:auto;padding:24px 28px;display:block">
      <div style="display:flex;gap:14px;align-items:center;height:64px;border-radius:var(--r-pill);background:var(--chip);padding:0 24px">
        <span style="width:26px;height:26px;border:3px solid var(--t3);border-radius:50%;flex:none;position:relative"></span>
        <span style="font-size:var(--fs-meta);color:var(--t3);margin-left:14px">输入关键词</span></div>
      <div style="display:flex;gap:14px;margin-top:20px;font-size:var(--fs-tiny)">
        ${[['全部', '#23252c', '#f2efe9'], ['旅游', '#F6C445', '#2A2005'], ['生活', '#46A863', '#06260F'], ['私密', '#E9723D', '#2C1204']].map(([a, bg, ink]) =>
          `<span style="padding:8px 22px;border-radius:var(--r-pill);background:${bg};color:${ink}">${a}</span>`).join('')}</div></div>
    <div class="grp card" style="padding:8px 28px">${[['Qwen3.8-Flash 限时免费（Qoder 国际）', '#23252c', '10-02'], ['赫本的电影院之夜', '#F6C445', '09-24'], ['把长文读成三条要点', '#46A863', '09-21']].map(([x, d, day]) =>
      `<div class="mi" style="justify-content:flex-start;gap:16px;font-weight:400"><i style="width:14px;height:14px;border-radius:50%;background:${d};flex:none"></i>
        <span style="flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${x}</span>
        <span style="font-size:var(--fs-tiny);color:var(--t3);font-weight:400">${day}</span></div>`).join('')}</div>
  </div>${bar(1)}`

/* ---- ⑧ 分享视图：时间轴 + 便签墙 ---- */
const desk = (items, h) => `<div class="desk" style="height:${h}px">${items.map(([k, x, y, r, t, tail, lg]) =>
  `<div class="note" style="left:${x}px;top:${y}px;transform:rotate(${r}deg);background:${T[k].c};color:${T[k].ink};z-index:${1 + y / 10}">
    ${lg ? `<div class="av" style="background-image:url(../../../miniprogram/assets/logo.png)"></div>` : ''}
    ${t}<div class="tail">${tail}</div></div>`).join('')}</div>`
const shareView = `
  ${status('10:44')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>${stats('shares')}</div></div>
  <div class="list">
    <div class="mo"><div class="tl"><div class="line"></div><div class="dot"></div><div class="ym">2026-10</div></div>
      ${desk([['card', 0, 6, -3, 'Qwen3.8-Flash 限时免…', '10-02'], ['cover', 182, 30, 2.5, '把长文读成三条要点，设…', '10-01'], ['quote', 362, 2, -1.5, '摘句那一套的引号怎么排…', '10-01']], 360)}</div>
    <div class="mo"><div class="tl"><div class="line"></div><div class="dot"></div><div class="ym">2026-09</div></div>
      ${desk([['block', 4, 10, 2, '赫本的电影院之夜，剪…', '09-24'], ['letter', 186, 36, -2.5, '素宣信笺这一套试的那…', '09-21'], ['popGrid', 364, 8, 3.5, '波普分格的四块色…', '09-19']], 360)}</div>
  </div>${bar(1)}`

/* ---- ⑨ 分享视图点大图 ---- */
const bigShare = `
  ${status('10:45')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>${stats('shares')}</div></div>
  <div class="list" style="filter:blur(0)"></div>
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
  ${status('10:45')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div><div class="t1">我的笔记</div>${stats('shares')}</div></div>
  <div class="dark" style="justify-content:flex-end;padding:0;background:rgba(8,9,12,.62)">
    <div class="sheet2"><h3>撤掉这篇的分享？</h3>
      <p>已经发出去的那张海报会立刻扫不开。要再分享就重新生成一张码。</p>
      <div class="two"><b class="g">取消</b><b class="d">撤掉</b></div></div>
  </div>`

/* ---- ⑪ 种草视图：同一版式，小图带对方圆 LOGO ---- */
const savedView = `
  ${status('10:46')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>${stats('saved')}</div></div>
  <div class="list">
    <div class="mo"><div class="tl"><div class="line"></div><div class="dot"></div><div class="ym">2026-10</div></div>
      ${desk([['quote', 0, 8, -2, '阿城笔记：棋王里的吃…', '来自 老李', 1], ['acid', 184, 26, 3, '把书读薄的一整套方法…', '来自 木木', 1], ['spec', 366, 4, -2.5, '规格卡这一套的排版…', '来自 阿岚', 1]], 360)}</div>
  </div>${bar(1)}`

/* ---- ⑫ 种草的大图：只能看 + 跳自己的笔记，没有分享按钮 ---- */
const bigSaved = `
  ${status('10:47')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div><div class="t1">我的笔记</div>${stats('saved')}</div></div>
  <div class="list"></div>
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
  ['s1', `<span class="tag.new">新增</span>① 首页背景可调深浅：<b>入口在 EN 下面</b>，竖向滑块、半透明，像浮在图上。默认「正常」，往上 10% 一档、最深 −50%；值存本机（和壁纸偏好同一处），下次进来还是这一档。`, createBody(0, false, false)],
  ['s2', `① 同一屏拖到 <b>−50%</b>：加深的是图上那层罩子（在现网 <code>.head-scrim</code> 那四个停点之上再叠一层），字仍然读得清。<b>全局生效</b>——首页、笔记页、「我的」页共用同一张图、同一个值。`, createBody(50, false, false)],
  ['s3', `② 点底部那条横窗会往上弹（现网已有这个手势）：<b>滑块整条淡出让位</b>，收起后回到原位。它和弹层永远不重叠——轨道下沿钉在弹层上沿之上 24rpx。`, createBody(20, true, true)],
  ['s4', `③ 外观设置：<b>点下面那排小色块 = 直接换上</b>，不再"先试看再点大图确认"。大图下面那行提示词<span class="tag cut">撤</span>整条删掉（试看这个状态没了，手机预览就只画当前生效的那一套）。`, wallpaper],
  ['s5', `④ 第三个 tab：<b>左上角那行大标题跟着药丸走</b>——药丸在「设置」这里就叫设置。底栏仍然纯图标不加字（那是 10-01 你亲自撤的）。英文同步 Settings。`, mePage('set')],
  ['s6', `④ 药丸切到「关于」，左上角那行立刻改叫关于（英文 About）。这一屏顺手带上 1.9.11 已上线的改动：规则块三行改成点列、不再画线。`, mePage('about')],
  ['s7', `⑤ 笔记视图 = <b>现状一字不动</b>，只在右上角那三列下面给当前那一列加一条黄杠（<code>palette.TIP_DOT</code> 同一档）。点数字或点文字都切。`, notesView],
  ['s8', `⑤ 分享视图：左边半透明竖线 + 一枚小黄点 + 月份（<code>2026-10</code>，吃那支数字字形）；右边当月分享出去的卡片小图，竖状、一套十枚<b>莫兰迪色按模板各占一枚、不重复</b>，像便签纸一样随机摆，轻度重叠但每张都点得着。`, shareView],
  ['s9', `⑤ 点小图 = 黑底看那张真卡片，下面还是那五枚（<code>wx.showShareImageMenu</code>，词和图标都是微信的）。<b>这张要后端记一笔当时用的哪套模板</b>，见下面「两个后端前提」。`, bigShare],
  ['s10', `⑥ 长按大图 = 真撤回（复用现网那条 <code>api.revokeShare</code>）：撤回后小图和大图都从时间轴消失，「分享」那个数跟着减一。弹层一行两枚、各 ≤4 字。`, askRevoke],
  ['s11', `⑦ 种草视图 = 你转存进来的<b>别人</b>的卡片，版式与分享一模一样；卡片左上角带对方的圆形象，没设形象就只留标题。`, savedView],
  ['s12', `⑦ 种草的大图只能看：<b>不给那五枚按钮</b>（不能二次分享），改成「打开我的笔记」跳到你自己库里那一条。`, bigSaved],
  ['s13', `<span class="tag.new">改串</span>⑧ 别人扫你已经撤回的那张码：<b>真的撤</b>——复用现网 <code>api.revokeShare</code>，落地页那一行文案从「这篇笔记的分享已关闭」改成这句。`, revoked],
]

const PRE = `<h2 style="font-size:26px;margin:14px 0 10px">两个后端前提（他 10-02 已按建议拍板）</h2>
<p class="lead">① <b>shares 表要加一列 <code>poster_tpl</code></b>，分享那一刻把用的哪套模板记进去。现在这张表存了标题、概要、要点、封面图，<b>唯独没存模板 id，也不存成品图</b>；不补这一列，第 8-9 屏"回看当时分享出去的那一张"只能拿当前默认模板重画，画出来跟当初那张对不上。<br>
② <b>这一批做完需要部署一次后端</b>（加列 + 迁移，老数据那列留空、按默认模板兜底）。顺带把 #228 那两格欠的 <code>shares_active</code>／<code>saved_by_users</code> 一起上——不上的话第 7 屏「分享」「种草」两个数在真机上还是恒 0。<br>
其余都在前端：滑块值走本机存储、三视图是同页切视图不新增路由、撤回复用现网接口。</p>`

fs.writeFileSync(path.join(DIR, 'v15-三视图与背景亮度.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v15 · 三视图与背景亮度</title><style>${CSS}</style></head><body>
<h1>v15 · 他 10-02 上午的六条（示意，代码一行没动）</h1>
<p class="lead">十三屏：<b>1-3</b> 首页背景亮度三态｜<b>4</b> 外观设置（点小图直接生效）｜<b>5-6</b> 第三个 tab 随药丸改名｜
<b>7</b> 笔记视图｜<b>8</b> 分享视图（时间轴 + 便签墙）｜<b>9</b> 分享的大图与五枚按钮｜<b>10</b> 长按撤回确认｜
<b>11</b> 种草视图｜<b>12</b> 种草的大图｜<b>13</b> 别人扫已撤回的码。<br>
屏高 <code>750×1670</code>（1px = 1rpx），主题吃现网 <code>theme-default</code> 令牌，底栏那格是
<code>palette.chromeOf('default')</code> 现算的 <code>${CH.bg}</code>；<b>便签墙那十枚小图按你 10-02 追加的话改成莫兰迪经典色卡</b>
（雾蓝 / 灰绿 / 燕麦 / 藕荷 / 灰紫 / 砖灰 / 橄榄 / 深海蓝 / 苔绿 / 炭灰蓝，一套十枚不重复），
这十支是这轮新造的一族，实现时和 <code>TIP_DOT</code> 一样进 <code>palette.js</code> 当唯一出口；
小图只是<b>标识色</b>，点开的大图仍是真实海报、吃模板自己的配色。<span class="tag">现网</span>那句在 <code>utils/i18n.js</code> 里逐字对过；
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
console.log(`ok → v15-三视图与背景亮度.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)

