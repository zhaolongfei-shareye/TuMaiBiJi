// v19 效果图：站长 10-03 凌晨这一轮把「这一屏怎么排」交给**列表区顶上那两枚 tab**。
// 1 笔记区域内两枚 tab（笔记列表 / 笔记卡片）+ 下面一条横线；
// 2 列表按 X 那种排：左列日期+圆点，右列标题（90% 黑一行截断）+ 摘要 2-3 行（70% 黑、与 Tips 同字号）+「显示更多」蓝字，点开还是现网那个全文浮窗；
// 2bis 卡片模式按图2 下面那种排：两列、只有生成过的、白垫居中、标题第二行 ‹ 1/3 ›；
// 3 搜索条压高度、右侧「搜索笔记」降到分类那一档字号；列表左列撤竖线、日期居中；标题后撤「已分享」色块；
// 4 置顶整个撤掉；时间轴撤掉，只留日期和圆点。
// 跑法：node docs/design/10-03两tab与卡片网格/画-v19.mjs
//
// 口径全部从代码侧取，不自己发明：
//   屏高 750×1670 = 1px:1rpx（同 v18）；主题吃现网 theme-default 令牌；
//   底栏那格 palette.chromeOf('default') 现算；小黄点 = palette.TIP_DOT；
//   「显示更多」那支蓝 = palette.TONES[1].bg（现网 .ds-link 与「已分享」色块同一支 #3F52D6），不新造蓝；
//   摘要字号 = --fs-meta 24（= 头部 Tips 那一档）；标题 = --fs-body 28；
//   分类 chip 实测算高 59、字号 --fs-meta 24 → 搜索条因此压到 60；
//   卡片白垫那一档 340×474 由真跑量出来的最竖比例定（玉版宣 830×1157 = 0.717），摘句 830×854 = 0.972；
//   屏上每句界面话先 grep utils/i18n.js：现网有的照抄，这轮新造的标「新串」。
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
const BLUE = palette.TONES[1].bg
const CH = JSON.parse(JSON.stringify(palette.chromeOf('default')))

/* 正文墨色就按他给的这两档写：标题 90% 黑、摘要 70% 黑（基准色仍是现网那支 #23252c）。 */
const I90 = 'rgba(35,37,44,.9)'
const I70 = 'rgba(35,37,44,.7)'

/* 占位类名别叫 ph：`.ph` 是那一台 750×1670 的手机框（还带 #f4f2ec 底），
   挂在输入框里那个 span 上会当场把整屏糊成一块纸板（10-03 这一版就踩过）。 */
const SVG = {
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/></svg>',
}
/* 全文浮窗下沿那一排：置顶撤了就剩三枚（现网 .ds-irow 是 flex:1 等宽，四枚变三枚不用改数法）。 */
const DOCK = ['编辑', '删除', '生成笔记卡片']
const CATS = [['全部', '#23252c', '#f2efe9'], ['旅游', '#F6C445', '#2A2005'], ['生活', '#46A863', '#06260F'], ['私密', '#E9723D', '#2C1204']]
const TIPS = ['拍照或截图存进来，会自动提炼成要点', '贴一个公众号链接，长文读成三句话']

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
  --sp-2:16px;--sp-3:24px;--sp-4:32px;--r-card:40px;--r-pill:999px;--w-edge:3px;
  --t2:#5c6068;--t3:#9a9ea6;--edge:rgba(35,37,44,.1);--ink:#23252c}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;
  font-size:26px;font-weight:600;color:#fff;background:#181A20}
.status .r{font-size:22px;font-weight:500;letter-spacing:1px}
.nav{height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;position:relative;
  color:#F2EFE9;background:#181A20}
.nav .capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
  display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#fff}
.body{padding:0 24px;position:relative}
/* 头部那一块形象图（现网永远铺）：渐变七个停点逐字抄 create.wxss 的 .page-scrim，
   深浅吃默认那一档（半月，veil .5）——站长 10-02 夜里定的默认。 */
.band{height:542px;position:relative;overflow:hidden;margin:0 -24px}
.band .ph2{position:absolute;inset:0;background:url(../../../miniprogram/assets/home-bg-portrait.jpg) center 15%/cover no-repeat}
.band .sc{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 14%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%),rgba(8,9,12,.5)}
.band .t1{position:absolute;left:32px;top:22px;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.stats{position:absolute;right:32px;top:24px;z-index:4}
.st{width:96px;text-align:center;color:rgba(242,239,233,.74)}
.st b{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:56px;line-height:.9}
.st i{font-style:normal;display:block;margin-top:8px;font-size:var(--fs-micro);letter-spacing:2px;color:rgba(242,239,233,.62)}
/* 头部那一行：左边一条 Tips，右边只剩搜索一枚（纸片墙／一行那两枚排布 icon 撤了，
   它们的活交给列表区顶上那两枚 tab）。 */
.tools{position:absolute;left:24px;right:24px;top:400px;height:88px;display:flex;align-items:center;
  justify-content:space-between;z-index:5}
.tp{display:flex;align-items:center;gap:14px;flex:1;min-width:0;font-size:var(--fs-meta);line-height:1.35;
  color:rgba(242,239,233,.82)}
.tp i{width:14px;height:14px;border-radius:50%;flex:none;background:${TIP}}
.tp span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acts2{display:flex;align-items:center;gap:18px;flex:none;margin-left:26px}
.acts2 svg{width:38px;height:38px;stroke:rgba(255,255,255,.86);fill:none;stroke-width:2.1;
  stroke-linecap:round;stroke-linejoin:round}
.acts2 a{display:flex;align-items:center}
/* ③ 搜索条：88 → 60（分类那一枚 chip 实测算高 59，压到同一档），
   右侧「搜索笔记」从 --fs-title 31/800 降到 --fs-meta 24/600——和分类那几枚同字号同字重。 */
.srch{display:flex;align-items:center;gap:16px;height:60px}
.srch.open{flex:1;min-width:0;border-radius:var(--r-pill);background:rgba(255,255,255,.18);
  border:2px solid rgba(255,255,255,.36);padding:0 22px}
.srch.open svg{width:30px;height:30px;stroke:rgba(255,255,255,.9);fill:none;stroke-width:2.1;
  stroke-linecap:round;stroke-linejoin:round;flex:none}
.srch .in{flex:1;min-width:0;font-size:var(--fs-body);color:rgba(242,239,233,.92);white-space:nowrap}
.srch .in.iph{color:rgba(242,239,233,.55)}
.srch .go{flex:none;font-size:var(--fs-meta);font-weight:600;color:#F2EFE9}
/* 列表区（圆角朝上、往上盖住图 40，与 v18 同一个量） */
.list{position:absolute;left:0;right:0;top:686px;bottom:150px;background:#f4f2ec;z-index:1;
  border-radius:var(--r-card) var(--r-card) 0 0;display:flex;flex-direction:column;overflow:hidden}
/* ① 区内顶上一行两枚 tab：小字、深色那枚已选（下面一条墨色短杠坐在那条横线上）、
   浅色那枚未选；横线通栏。图2 上面那一版就是这个关系。 */
.vtabs{display:flex;gap:44px;padding:0 32px;flex:none;position:relative;
  border-bottom:2px solid rgba(35,37,44,.12)}
.vtabs span{font-size:var(--fs-meta);font-weight:600;letter-spacing:1px;color:rgba(35,37,44,.42);
  padding:22px 0 14px}
.vtabs span.on{color:${I90};font-weight:700;position:relative}
.vtabs span.on::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:4px;border-radius:2px;background:${I90}}
/* 分类那一行紧跟在横线下面（v18 那条浅虚线撤了，改成 tab 下面这条横线）；置顶那一档整个撤掉。 */
.cats{display:flex;gap:14px;padding:20px 24px 4px;font-size:var(--fs-meta);flex:none}
.cats span{padding:14px 28px;border-radius:var(--r-pill);font-weight:600;white-space:nowrap}
/* ② X 那种排：左列只有圆点 + 日期（竖线撤、时间轴撤），竖向居中于整行；
   右列三档——标题 90% 黑一行截断 / 摘要 70% 黑 24 字最多三行 /「显示更多」蓝字。 */
.xlist{flex:1;min-height:0;overflow:hidden}
.xrow{display:flex;gap:20px;padding:24px 24px 20px}
.xd{width:88px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px}
.xd i{width:14px;height:14px;border-radius:50%;background:${TIP}}
.xd b{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:var(--fs-meta);line-height:1;color:rgba(35,37,44,.55)}
.xm{flex:1;min-width:0}
.xm .t{font-size:var(--fs-body);font-weight:600;line-height:1.35;color:${I90};
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm .s{margin-top:8px;font-size:var(--fs-meta);line-height:1.62;color:${I70};display:-webkit-box;
  -webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
.xm .m{margin-top:10px;display:flex;align-items:baseline;gap:18px}
.xm .more{font-size:var(--fs-meta);font-weight:600;color:${BLUE}}
.who{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:var(--fs-micro);color:rgba(35,37,44,.55);
  min-width:0}
.who .g{position:relative;width:20px;height:20px;flex:none;overflow:hidden;opacity:.85}
.who .g::before{content:'';position:absolute;left:5px;top:0;width:10px;height:10px;box-sizing:border-box;
  border:2px solid currentColor;border-radius:50%}
.who .g::after{content:'';position:absolute;left:-2px;bottom:0;width:24px;height:13px;box-sizing:border-box;
  border:2px solid currentColor;border-bottom:none;border-radius:13px 13px 0 0}
.who span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* ②bis 卡片模式：两列等宽（340 + 22 + 340 = 区内 702 正好铺满）、白垫固定一档、图按宽贴合竖向居中。 */
.grid2{flex:1;min-height:0;overflow:hidden;display:flex;flex-wrap:wrap;gap:22px;padding:22px 24px 0}
.gc{width:340px}
.pad{width:340px;height:474px;border-radius:20px;background:#fff;display:flex;align-items:center;
  justify-content:center;overflow:hidden;box-shadow:0 8px 22px rgba(8,10,14,.10)}
.gcap{margin-top:12px;font-size:var(--fs-meta);line-height:1.4;color:${I90};white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}
.pg{margin-top:6px;display:flex;align-items:center;justify-content:center;gap:10px}
.pg u{width:40px;height:40px;display:flex;align-items:center;justify-content:center;text-decoration:none;
  color:rgba(35,37,44,.62)}
.pg u::before{content:'';width:14px;height:14px;border-left:3px solid currentColor;border-bottom:3px solid currentColor;
  border-radius:2px}
.pg u.l::before{transform:rotate(45deg)}
.pg u.r::before{transform:rotate(-135deg)}
.pg b{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:26px;line-height:1;letter-spacing:1px;
  color:rgba(35,37,44,.72)}
/* 卡片小样（示意，不是成品图）：只画出"这一枚比那一枚高"这件事。 */
.art{box-shadow:0 6px 18px rgba(8,10,14,.14);position:relative;overflow:hidden;padding:22px 20px}
.art.jade{background:#FBF8F1;color:#17181C}
.art.jade .hd{display:flex;align-items:center;gap:7px;font-size:12px;letter-spacing:2px;color:rgba(23,24,28,.5)}
.art.jade .hd i{width:16px;height:16px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:10px;
  display:flex;align-items:center;justify-content:center;font-style:normal}
.art.jade h6{margin-top:18px;font-size:20px;line-height:1.3;font-weight:800;letter-spacing:-.4px}
.art.jade .ln{margin-top:12px;height:9px;border-radius:5px;background:rgba(23,24,28,.13)}
.art.jade .ln.w86{width:86%}.art.jade .ln.w72{width:72%}.art.jade .ln.w58{width:58%}
.art.jade .rule{margin-top:20px;height:2px;background:rgba(23,24,28,.16)}
.art.jade .ft{position:absolute;left:20px;right:20px;bottom:18px;display:flex;align-items:flex-end;justify-content:space-between}
.art.jade .ft u{width:34px;height:34px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:15px;
  display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.jade .qr{width:42px;height:42px;background:
  repeating-linear-gradient(0deg,#17181C 0 4px,transparent 4px 8px),
  repeating-linear-gradient(90deg,#17181C 0 4px,#FBF8F1 4px 8px);opacity:.75}
.art.verse{background:#FFFDF6;color:#17181C;display:flex;flex-direction:column;justify-content:center}
.art.verse em{font-style:normal;font-size:56px;line-height:.6;color:rgba(23,24,28,.22)}
.art.verse p{margin-top:14px;font-size:19px;line-height:1.5;font-weight:700;letter-spacing:-.3px}
.art.verse .sg{margin-top:20px;display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:2px;
  color:rgba(23,24,28,.5)}
.art.verse .sg u{width:26px;height:26px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:12px;
  display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.verse.dk{background:#23252C;color:#F2EFE9}
.art.verse.dk em{color:rgba(242,239,233,.28)}
.art.verse.dk .sg{color:rgba(242,239,233,.6)}
.art.verse.dk .sg u{background:#F2EFE9;color:#23252c}
/* 全文浮窗：外壳、动作条照抄 index.wxss 的 .float-sheet / .grip / .ds-*。
   它是 fixed 在**页面视口**里的（视口从导航条下面起算），所以 top 那 130 要再垫上状态条 94 + 导航条 90。 */
.sheet{position:absolute;left:24px;right:24px;top:314px;bottom:152px;background:#FCFBF8;border-radius:32px;
  box-shadow:0 30px 60px rgba(8,10,14,.32);z-index:9;display:flex;flex-direction:column;overflow:hidden}
.grip{flex:none;width:100%;height:56px;display:flex;align-items:center;justify-content:center;position:relative}
.grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.grip span{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;
  font-size:var(--fs-tiny);font-weight:700;letter-spacing:.4px;color:rgba(35,37,44,.42)}
.dsb{flex:1;min-height:0;overflow:hidden;padding:0 34px}
.dsb .meta{margin-top:10px;font-size:var(--fs-meta);color:rgba(35,37,44,.5)}
.dsb h3{margin-top:8px;font-size:38px;font-weight:800;letter-spacing:-.9px;line-height:1.3;color:${I90}}
.dsb .tags{margin-top:14px;display:flex;gap:10px}
.dsb .tags i{font-style:normal;font-size:var(--fs-tiny);font-weight:700;color:#23323C;background:rgba(168,188,201,.35);
  border-radius:8px;padding:5px 12px}
.dsb .lab{margin-top:30px;font-size:var(--fs-label);font-weight:800;letter-spacing:1.6px;color:rgba(35,37,44,.42)}
.dsb p{margin-top:12px;font-size:var(--fs-body);line-height:1.7;color:${I70}}
.dsb .pt{margin-top:14px;display:flex;gap:16px;align-items:flex-start}
.dsb .pt b{flex:none;width:38px;height:38px;border-radius:50%;background:#A8BCC9;color:#FCFBF8;
  font-family:'WtsjMind',sans-serif;font-weight:100;font-size:22px;display:flex;align-items:center;
  justify-content:center}
.dsb .pt span{font-size:var(--fs-body);line-height:1.55;color:${I90}}
.dsb .link{margin-top:12px;font-size:var(--fs-meta);line-height:1.5;color:${BLUE}}
.dsb .orig{margin-top:30px;display:flex;align-items:center;justify-content:space-between}
.dsb .sw{font-size:var(--fs-meta);font-weight:700;color:rgba(35,37,44,.55)}
.dsd{flex:none;border-top:var(--w-edge) solid rgba(35,37,44,.10);padding:22px 30px 30px}
.dsd .irow{display:flex;gap:14px}
.dsd .irow b{flex:1;height:72px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  white-space:nowrap;font-size:var(--fs-meta);font-weight:700;color:#23252C;
  box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.dsd .irow b.d{color:#b4231f}
.dsd .irow b.p{background:#23252C;color:#F4F2EC;box-shadow:none}
.dsd .pub{margin-top:18px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-micro);color:rgba(35,37,44,.55)}
.dsd .pub s{text-decoration:none;font-weight:700;color:#b4231f}
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;z-index:6;
  background:${CH.bg};border:3px solid ${CH.line};display:flex;align-items:center;justify-content:space-around;
  box-shadow:0 16px 44px ${CH.shadow}}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:${CH.idle};color:${CH.ink}}
.bar2 u.on{background:${CH.sel};color:${CH.ink}}
.bar2 svg{width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
`

const status = (t) => `<div class="status"><span>${t}</span><span class="r">100 ▮</span></div>`
const nav = (t) => `<div class="nav">${t}<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const bar = (on) => {
  const svg = [
    '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>',
  ]
  return `<div class="bar2">${svg.map((s, i) => `<u class="${i === on ? 'on' : ''}">${s}</u>`).join('')}</div>`
}
const cell = (id, cap, html) => `<div class="cell" id="${id}"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`

/* 头部那一行：open = 搜索摊开（压到 60 那一版）。状态条 + 导航条在每一屏最上面（184 高），
   下面 band 542 的底沿落在 726，列表区那张卡 686 起、往上盖 40——这三个数是 v18 量定的，动不得。 */
const head = (open) => `
  ${status('10:43')}${nav('图麦笔记')}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">我的笔记</div>
    <div class="stats"><div class="st"><b>20</b><i>笔记</i></div></div>
    <div class="tools">
      ${open ? `<div class="srch open">${SVG.search}<span class="in iph">输入关键词</span><span class="go">搜索笔记</span></div>`
      : `<div class="tp"><i></i><span>${TIPS[0]}</span></div>
         <div class="acts2"><a>${SVG.search}</a></div>`}
    </div></div></div>`

/* ---- ① 区内那一行两枚 tab + 横线（tab 名：现网 navShare=笔记卡片，「笔记列表」是新串） ---- */
const TABS = ['笔记列表', '笔记卡片']
const vtabs = (on) => `<div class="vtabs">${TABS.map((n, i) =>
  `<span class="${i === on ? 'on' : ''}">${n}</span>`).join('')}</div>`
const cats = () => `<div class="cats">${CATS.map(([a, bg, ink]) =>
  `<span style="background:${bg};color:${ink}">${a}</span>`).join('')}</div>`

/* ---- ② X 那种列表（摘要文本是用户内容，界面话只有「显示更多」那一枚是新串） ---- */
const ROWS = [
  { d: '10/02', t: 'Qwen3.8-Flash 限时免费，国际版先装上试一圈', more: true,
    s: '这一版把上下文一次拉到 256K，个人档限时免费到十一月底。换渠道只需重装一次，历史会话能整体带走；拿十篇长文一次喂进去，没报错也没截断。' },
  { d: '10/02', t: '周末去顺义那家旧书店，门口贴着写', more: true, who: '阿麦的读书笔记',
    s: '三十平的小店按年代排架，九五品的文学类占了一半。老板建议工作日下午去，那时光线斜着进来，能看清书脊上的字。' },
  { d: '10/01', t: '素宣信笺这一套试的那三种竖排行距', more: false,
    s: '行距 1.9 最舒服，1.6 会挤；列宽 26 字时标点落到行尾不刺眼。' },
  { d: '09/28', t: '把长文读成三条要点，设一个每天归档的提醒', more: true,
    s: '先摘句子，再问一句"这段在解决什么"，最后用自己的话写一遍。三条要点控制在两行以内，回头才搜得到；超过四行基本不会再点开。' },
  { d: '09/27', t: '棋王里那一段吃的动词密度太高了', more: true,
    s: '三句里塞了七个动词，读起来快得像狼吞虎咽；删掉两个节奏就慢下来了，可那口气也断了。要不要留，看你更在意哪一头。' },
]
const xlist = () => `<div class="xlist">${ROWS.map((r) => `<div class="xrow">
  <div class="xd"><i></i><b>${r.d}</b></div>
  <div class="xm"><div class="t">${r.t}</div><div class="s">${r.s}</div>
    ${r.more || r.who ? `<div class="m">${r.more ? `<span class="more">显示更多</span>` : ''}${
      r.who ? `<span class="who"><span class="g"></span><span>${r.who}</span></span>` : ''}</div>` : ''}
  </div></div>`).join('')}</div>`

/* ---- ②bis 卡片模式：白垫固定 340×474（最竖那一档 0.717），图按宽贴合竖向居中 ---- */
const PAD_W = 340, PAD_H = 474, IN = 14
const fit = (r) => {
  let w = PAD_W - IN * 2, h = Math.round(w / r)
  if (h > PAD_H - IN * 2) { h = PAD_H - IN * 2; w = Math.round(h * r) }
  return [w, h]
}
const jade = (t) => { const [w, h] = fit(0.717)
  return `<div class="art jade" style="width:${w}px;height:${h}px">
    <div class="hd"><i>麦</i><span>图麦笔记</span></div><h6>${t}</h6>
    <div class="rule"></div>
    <div class="ln"></div><div class="ln w86"></div><div class="ln w72"></div><div class="ln w58"></div>
    <div class="ft"><u>麦</u><div class="qr"></div></div></div>` }
const verse = (q, dk) => { const [w, h] = fit(0.972)
  return `<div class="art verse${dk ? ' dk' : ''}" style="width:${w}px;height:${h}px">
    <em>“</em><p>${q}</p><div class="sg"><u>麦</u><span>图麦笔记</span></div></div>` }
const CELLS = [
  { art: () => jade('Qwen3.8-Flash 限时免费'), t: 'Qwen3.8-Flash 限时免费，国际版先装上试', n: 1 },
  { art: () => verse('行距 1.9 最舒服，1.6 会挤。'), t: '素宣信笺这一套试的那三种竖排行距', n: 3, i: 2 },
  { art: () => jade('把长文读成三条要点'), t: '把长文读成三条要点，设一个每天归档的提醒', n: 1 },
  { art: () => verse('那时光线斜着进来，能看清书脊上的字。', 1), t: '周末去顺义那家旧书店，门口贴着写', n: 2, i: 1 },
]
const grid2 = () => `<div class="grid2">${CELLS.map((c) => `<div class="gc">
  <div class="pad">${c.art()}</div>
  <div class="gcap">${c.t}</div>
  ${c.n > 1 ? `<div class="pg"><u class="l"></u><b>${c.i || 1}/${c.n}</b><u class="r"></u></div>` : ''}
</div>`).join('')}</div>`

/* ---- 全文浮窗（现网那一层，只把墨色对齐前一页的 90 / 70） ---- */
const sheet = () => `<div class="sheet">
  <div class="grip"><div class="bar"></div><span>点一下收起</span></div>
  <div class="dsb">
    <div class="meta">公众号文章 · 2026-10-02 10:40</div>
    <h3>Qwen3.8-Flash 限时免费，国际版先装上试一圈</h3>
    <div class="tags"><i>模型</i><i>限时免费</i><i>国际版</i></div>
    <div class="lab">摘要</div>
    <p>这一版把上下文一次拉到 256K，个人档限时免费到十一月底。换渠道只需重装一次，历史会话能整体带走；拿十篇长文一次喂进去，没报错也没截断。</p>
    <div class="lab">核心要点</div>
    <div class="pt"><b>1</b><span>上下文 256K，长文一次喂进去不被切</span></div>
    <div class="pt"><b>2</b><span>个人档限时免费到十一月底，之后按量计费</span></div>
    <div class="pt"><b>3</b><span>换渠道重装即可，历史会话整体带走</span></div>
    <div class="lab">来源链接</div>
    <div class="link">https://mp.weixin.qq.com/s/7fKd0mQpVz2rYbNc</div>
    <div class="orig"><div class="lab" style="margin-top:30px">原文内容</div><div class="sw">展开 ⌄</div></div>
  </div>
  <div class="dsd">
    <div class="irow">${DOCK.map((n, i) =>
      `<b class="${i === 1 ? 'd' : i === 2 ? 'p' : ''}">${n}</b>`).join('')}</div>
    <div class="pub"><span>这篇已经公开，别人扫码能看</span><s>撤掉分享</s></div>
  </div></div>`

/* ---- 四屏 ---- */
const listDesk = (on) => `<div class="list">${vtabs(on)}${on === 0 ? cats() : ''}${on === 0 ? xlist() : grid2()}</div>`
const SCREENS = [
  ['s1', `<span class="tag.new">新串</span>①＋② <b>区内顶上两枚 tab</b>：「笔记列表」<b>已选</b>（深色 90% 黑 + 一条墨色短杠坐在那条通栏横线上）、 「笔记卡片」<b>未选</b>（同一字号、42% 黑）。两枚都是小字（<code>--fs-meta 24</code>，和下面分类同一档）。<b>默认落第一枚</b>。<br>列表换成 X 那种排：左列<span class="tag cut">撤</span>竖线<span class="tag cut">撤</span>月份时间轴，<b>只剩一枚小黄点 + 日期 <code>10/02</code>（现网 <code>formatShortDate</code> 原样），整组竖向居中于这一条</b>；右列三档——<b>标题</b> 28 字重 600、<code>rgba(35,37,44,.9)</code>、一行放不下就截断（这一列宽 546，约 19 个汉字）；<b>摘要</b> 24（= 头部 Tips 那一档）、<code>rgba(35,37,44,.7)</code>、最多 3 行；末尾<b>「显示更多」</b><span class="tag.new">新串</span> 吃 <code>${BLUE}</code>。<span class="tag cut">撤</span>标题后面那枚「已分享」色块。`, head(false) + listDesk(0) + bar(1)],
  ['s2', `② 点「显示更多」浮<b>全文页</b>：外壳、位置、把手、动作条全是现网那一层（<code>.float-sheet</code> 左右 24、上 130（导航条以下再走 130）、下 152、半径 32、纸白 <code>#FCFBF8</code>），<b>只把墨色对齐前一页那两档</b>：标题与要点前景 <code>.9</code>，正文段落 <code>.7</code>（现网 <code>.ds-h2</code> 是写死的 <code>#23252C</code>、<code>.ds-para</code> 是 <code>#3a3e46</code>）。<span class="tag cut">撤</span>动作条里「置顶」那一枚 → 三枚自动等宽（<code>.ds-irow</code> 现成是 <code>flex:1</code>）。公开状态这一句留在下沿第二行（现网原样：<b>这篇已经公开，别人扫码能看 · 撤掉分享</b>）——列表里那枚色块撤了之后，"这篇公不公开"只在<b>这一处</b>说。`, `${head(false)}${listDesk(0)}${sheet()}${bar(1)}`],
  ['s3', `<span class="tag.new">新串</span>②bis 点第二枚「<b>笔记卡片</b>」（这两个字是现网 <code>navShare</code> 的原串，<b>不是</b>新串）：两列等宽（<code>340 + 22 + 340 = 区内净宽 702</code>，左右各内缩 24，和列表那 24 同一条线）。<b>每格一枚白垫 <code>340×474</code>、圆角 20、图按宽贴合、竖向居中</b>——这一档是从真跑量出来的最竖那一套推的（玉版宣 830×1157 = <b>0.717</b>），比它扁的（摘句 830×854 = <b>0.972</b>）上下各留一道白，排列就归一了。垫下面第一行是标题（24、90% 黑、一行截断），<b>第二行 <code>‹ 1/3 ›</code></b>（数字吃 <code>WtsjMind</code> 那支，和右上角那格、日期同一写法），左右两枚箭头各一次点击换一张；只生成过一张的不画这一行。<b>顺序与笔记列表完全一致</b>（同一份排序、同一份筛选，只是把"这一篇的第几张卡片"画出来）。`, head(false) + listDesk(1) + bar(1)],
  ['s4', `③ 点搜索：条身 <b>88 → 60</b>（分类那一枚 chip 实测算高 <b>59</b>，压到同一档就"不高出来一截"了）；右侧那两字「搜索笔记」（现网 <code>.srch-go</code> 是 <code>--fs-title 31 / 800</code>）降到 <code>--fs-meta 24 / 600</code>——与下面「全部 / 旅游 / 生活 / 私密」同字号同字重。输入里的字（现网 <code>--fs-body 28</code>）没动。头部那一行<span class="tag cut">撤</span>右边两枚排布 icon（纸片墙 / 一行），它们的活交给区内那两枚 tab，这一行只剩 Tips + 搜索一枚。`, head(true) + listDesk(0) + bar(1)],
]

const PRE = `<h2 style="font-size:26px;margin:14px 0 10px">这一稿撤掉的、新造的、以及三处等你认</h2>
<p class="lead"><span class="tag cut">撤</span><b>纸片墙那一整版</b>（莫兰迪那四枚色 10-02 才进 <code>palette.PAPERS</code>，这轮跟着没去处——分类色仍留在 chip 上）、<b>「一行 / 纸片墙」那两枚 icon</b>、<b>月份时间轴与那根竖线</b>、<b>置顶整个</b>（分类行那一档 + 全文窗那一枚按钮 + <code>pin</code>／<code>unpin</code>／<code>pinned</code>／<code>pinFilter</code>／<code>pinnedOnly</code> 五串退出界面）、<b>标题后那枚「已分享」色块</b>、<b>分类行下面那条浅虚线</b>（换成 tab 下面这条通栏横线）。<br>
<span class="tag.new">新串</span>只有两句：<b>「笔记列表」</b>（英文我按 <code>List</code> 备着）、<b>「显示更多」</b>（<code>Show more</code>）。「笔记卡片」是现网 <code>navShare</code> 的原串。<br>
<b>列表这一屏的数据不用动后端</b>：摘要走 <code>NoteBrief.summary</code>（<code>backend/app/api/routes/notes.py:87</code>，现网列表接口已带、手风琴那版就在用），日期走现网 <code>formatShortDate</code>。<br>
<span style="color:#b4231f"><b>卡片那一屏现在没有数据源</b></span>：查过 <code>backend/app/models/share.py</code>，<code>shares</code> 表只存快照文字 + 一个 <code>cover_asset_id</code>，<b>生成过的卡片一张都没留档</b>；前端（<code>pages/index/index.js:824,839</code>）也是画完直接 <code>showShareImageMenu</code> / 存相册，本机不写文件。所以"仅显示生成过的卡片"和"‹ 1/3 ›"要落地，得先认一条：<b>① 服务端记账</b>（新表 <code>note_cards</code> + 出图成功后上传成品图，要部署、要存储、一张 JPEG 约百来 KB）或 <b>② 本机留档</b>（出图时写进小程序用户文件目录 + 本机存一份索引，零后端零成本，但<b>换设备、清缓存、删小程序就空了</b>）。这一条不认，卡片那一屏只能一直画着示意图。</p>
<p class="lead" style="margin-top:14px">三处等你认：<b>一</b> tab 与分类谁在上——我画的是 <b>tab → 横线 → 分类 → 内容</b>（照图2 那版 tab 直接坐在横线上），你要是想让分类贴着 tab、横线压在内容上面，说一声就换。<b>二</b>「显示更多」我只在<b>摘要超过三行</b>的那几条上画（第三行本来就画不完了才需要"更多"）；第三屏那条两行放完的就只有「转存自 ××」那半行，要点标题任意处仍浮全文窗。<b>三</b> 蓝的用现网已有的 <code>${BLUE}</code>（也是「已分享」色块、来源链接那支），不是你截图里 X 那种亮蓝 <code>#1D9BF0</code>——要换那一支也是一处改完。</p>`

fs.writeFileSync(path.join(DIR, 'v19-两tab与卡片网格.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v19 · 两枚 tab 与卡片网格</title><style>${CSS}</style></head><body>
<h1>v19 · 区内两枚 tab：X 式列表 + 卡片网格（示意，代码一行没动）</h1>
<p class="lead">四屏：<b>1</b> 笔记列表（默认那枚）——X 那种排，左列只剩黄点 + 日期，右列标题 90% 黑 / 摘要 70% 黑三行 /「显示更多」蓝字｜<b>2</b> 点「显示更多」= 现网全文浮窗，只把墨色对齐 90/70，动作条撤置顶｜<b>3</b> 笔记卡片——两列、白垫 <code>340×474</code> 居中、标题第二行 <code>‹ 1/3 ›</code>｜<b>4</b> 搜索条压到 60、「搜索笔记」降到分类那一档字号。<br>
屏高 <code>750×1670</code>（1px = 1rpx），主题吃现网 <code>theme-default</code> 令牌，底栏那格是 <code>palette.chromeOf('default')</code> 现算的 <code>${CH.bg}</code>；头部那层罩子的停点抄 <code>create.wxss</code> 的 <code>.page-scrim</code> 并吃默认那一档；小黄点 <code>palette.TIP_DOT</code>，「显示更多」吃 <code>palette.TONES[1].bg</code>。<span class="tag">现网</span>那句在 <code>utils/i18n.js</code> 里逐字对过；<span class="tag.new">新串</span>这轮新造的；<span class="tag cut">撤</span>这轮删掉的。</p>
${[0, 2].map((i) => `<div class="row">${SCREENS.slice(i, i + 2).map(([id, cap, html]) => cell(id, cap, html)).join('')}</div>`).join('')}
${PRE}
</body></html>`)

/* 逐屏各写一份只有手机框、无标注的薄页，给 Chrome headless 按 750×1670 直接截。
   必须落在本目录：那几个 ../ 相对路径（home-bg-portrait.jpg、字体）才认得。 */
for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v19-两tab与卡片网格.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)
