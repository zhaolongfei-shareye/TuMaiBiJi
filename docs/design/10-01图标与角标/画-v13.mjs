// 生成 v13 效果图：三屏（新建 / 笔记 / 我的）+ 细节图（底栏两档、图标清单、英文与展开态）。
// 口径全部从现网取：字号 = app.wxss 令牌，几何 = 各页 wxss，色 = palette.chromeOf 派生规则，
// 图标 = Lucide（ISC）原始 SVG 路径，不改一笔。
// 用法：node 画-v13.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)))
const ICONS = path.join(DIR, 'icons')
const PHOTO = '../../../miniprogram/assets/home-bg-portrait.jpg'
const LOGO = '../../../miniprogram/assets/logo.png'

// Poppins Thin 子集那份 base64 不重打一遍：直接从上一版效果图里读，两版字体保证是同一支。
const MIND = fs
  .readFileSync(path.join(DIR, '..', '首页-统计三列与区内滚动', '首页v12-顶对齐与透明度两档.html'), 'utf8')
  .match(/src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]

function ico(n, size, color, sw = 2) {
  const raw = fs.readFileSync(path.join(ICONS, `${n}.svg`), 'utf8')
  return raw
    .replace(/<!--[\s\S]*?-->/, '')
    .replace(/width="24"\s+height="24"/, `width="${size}" height="${size}"`)
    .replace(/stroke="currentColor"/, `stroke="${color}" stroke-width="${sw}"`)
    .replace(/\n\s+/g, ' ')
    .trim()
}

/* 现网令牌（app.wxss）：--fs-h1 42 / --fs-title 31 / --fs-body 28 / --fs-meta 24 / --fs-micro 18
   外观「象牙」：page #F2EFE9、卡底 #FCFBF8、墨 #241E16（palette.js:183-199）
   底栏：chromeOf(象牙) → bg #443A25、ink 纸白、idle 纸白@62%、line 纸白@14%
   选中圆底那一档 = 同一支 HSL 只把明度抬 16 → #796641（四套壁纸都算过，见下） */
const CSS = `
  :root{
    --page:#F2EFE9; --card:#FCFBF8; --ink:#241E16;
    --sec:rgba(36,30,22,.66); --ter:rgba(36,30,22,.40); --edge:rgba(36,30,22,.12);
    --fs-h1:42px; --fs-title:31px; --fs-body:28px; --fs-meta:24px; --fs-micro:18px;
    --r-card:40px; --r-chip:28px; --r-pill:999px; --w-edge:3px;
    --chrome-bg:#443A25; --chrome-ink:#F2EFE9; --chrome-idle:rgba(242,239,233,.62);
    --chrome-line:rgba(242,239,233,.14); --chrome-sel:#796641;
    --ui:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',sans-serif;
  }
  @font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${MIND}) format('truetype');font-weight:100}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#e7e4dc;font:14px/1.6 var(--ui);padding:40px}
  h1{font-size:22px;margin-bottom:6px}
  .lead{color:#4a4d55;margin-bottom:8px;max-width:2400px;font-size:15px;line-height:1.9}
  .lead b{color:#1d1f20}
  .notes{max-width:2400px;font-size:15px;line-height:1.9;color:#4a4d55;background:#efece4;
    border:1px solid #ddd8cc;border-radius:12px;padding:14px 18px;margin:14px 0 26px}
  .notes b{color:#1d1f20}
  .notes code{background:#e3dfd4;padding:1px 6px;border-radius:5px;font-size:13px}
  .row{display:flex;gap:32px;align-items:flex-start;flex-wrap:wrap}
  .shot{width:750px}
  .cap{margin-top:14px;font-size:15px;color:#4a4d55;line-height:1.7;max-width:750px}
  .cap b:first-child{display:block;font-size:17px;color:#1d1f20;margin-bottom:2px}
  .frame{width:750px;height:1690px;background:var(--page);border-radius:56px;overflow:hidden;
    box-shadow:0 24px 60px rgba(0,0,0,.16);position:relative;display:flex;flex-direction:column}
  .status{height:94px;flex:none;display:flex;align-items:center;justify-content:space-between;
    padding:0 44px;font-size:26px;font-weight:600;color:#fff;background:#181A20}
  .status .r{font-size:22px;font-weight:500;letter-spacing:1px}
  .nav{height:90px;flex:none;display:flex;align-items:center;justify-content:center;position:relative;
    font-size:32px;font-weight:600;color:#f2efe9;background:#181A20}
  .nav .capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;
    background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
    display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#fff}
  /* 「我的」页现网不改导航条颜色（只有笔记页和新建页铺图时改成深底白字），所以这一屏是浅底黑字 */
  .frame.light .status{color:var(--ink);background:var(--page)}
  .frame.light .nav{color:var(--ink);background:var(--page)}
  .frame.light .nav .capsule{background:rgba(36,30,22,.06);border-color:rgba(36,30,22,.14);color:var(--ink)}
  .view{flex:1;position:relative;overflow:hidden;background:var(--page);display:flex;flex-direction:column}
  .photo{position:absolute;inset:0;background:url(${PHOTO}) center 15%/cover no-repeat}
  .scrim{position:absolute;inset:0;background:linear-gradient(180deg,
    rgba(18,20,26,.58) 0%,rgba(18,20,26,.52) 30%,rgba(18,20,26,.46) 58%,rgba(18,20,26,.52) 100%)}

  /* ---------- 底栏：无文字 + 抽象图标 + 选中一枚同色阶圆底 ---------- */
  .tabbar{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:var(--r-pill);
    background:var(--chrome-bg);border:var(--w-edge) solid var(--chrome-line);
    box-shadow:0 16px 44px rgba(0,0,0,.22);display:flex;align-items:center;z-index:6}
  .tab{flex:1;display:flex;align-items:center;justify-content:center}
  .tab i{width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center}
  .tab.on i{background:var(--chrome-sel)}
  .tab svg{opacity:.62}
  .tab.on svg{opacity:.98}

  /* ---------- ① 笔记页头部：三列移到右上角、整块变窄 ---------- */
  .head{position:relative;height:542px;flex:none;overflow:hidden}
  .head .h1{position:absolute;left:32px;top:22px;font-size:var(--fs-h1);font-weight:700;
    letter-spacing:-1px;color:rgba(242,239,233,.96)}
  .stats{position:absolute;right:32px;top:24px;display:flex;align-items:flex-start}
  .stat{width:104px;text-align:center;position:relative}
  .stat + .stat::before{content:'';position:absolute;left:0;top:2px;height:78px;width:1px;
    background:rgba(242,239,233,.30)}
  .stat .n{display:block;font-family:'WtsjMind','Poppins',sans-serif;font-weight:100;
    font-size:64px;line-height:.86;color:rgba(242,239,233,.80)}
  .stat .l{display:block;margin-top:10px;padding-left:4px;font-size:var(--fs-micro);font-weight:700;
    letter-spacing:4px;color:rgba(242,239,233,.62);font-family:var(--ui)}

  /* ---------- 下方整块（现网 .sheet：盖住图 40、半径 40、不描边、内缩 24、上内边距 32） ---------- */
  .sheet{flex:1;position:relative;z-index:3;margin-top:-40px;background:var(--page);
    border-radius:var(--r-card) var(--r-card) 0 0;box-shadow:0 -12px 28px rgba(18,20,26,.16);
    display:flex;flex-direction:column;overflow:hidden;padding:32px 24px 0}
  .tools{flex:none;height:104px;display:flex;align-items:center;gap:14px}
  .chips{flex:1;display:flex;gap:14px;overflow:hidden}
  .chip{flex:none;height:60px;padding:0 26px;border-radius:var(--r-chip);display:flex;align-items:center;
    font-size:var(--fs-meta);font-weight:700;letter-spacing:-.2px}
  .chip.all{background:var(--page);color:var(--ink);box-shadow:inset 0 0 0 var(--w-edge) var(--edge)}
  .c1{background:#D9C9AE;color:#33291B}.c2{background:#C2AA85;color:#2A2114}.c3{background:#85644A;color:#FBF6EC}
  .scbtn{flex:none;width:60px;height:60px;border-radius:50%;background:#F2EFE9;
    box-shadow:0 6px 18px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center}
  .list{flex:1;overflow:hidden;position:relative;padding:0}
  .r{border:var(--w-edge) solid var(--edge);border-radius:var(--r-card);height:106px;margin-bottom:14px;
    display:flex;align-items:center;gap:14px;padding:0 26px;background:rgba(252,251,248,.85)}
  .dot{flex:none;width:14px;height:14px;border-radius:50%;background:#241E16}
  .dot.t1{background:#8B693E}.dot.t2{background:#7D9C88}
  .pin{flex:none;height:38px;padding:0 14px;border-radius:12px;background:#46A863;color:#fff;
    font-size:var(--fs-micro);font-weight:700;letter-spacing:1px;display:flex;align-items:center}
  .ti{flex:1;min-width:0;font-size:var(--fs-title);font-weight:700;color:var(--ink);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .dt{flex:none;font-size:var(--fs-meta);color:var(--sec);letter-spacing:.4px}
  .fade{position:absolute;left:24px;right:24px;bottom:148px;height:110px;pointer-events:none;z-index:4;
    background:linear-gradient(180deg,rgba(242,239,233,0),rgba(242,239,233,.72))}

  /* ---------- 新建页 ---------- */
  .pad{position:relative;z-index:2;padding:0 24px;display:flex;flex-direction:column;flex:1}
  .title-row{display:flex;align-items:center;justify-content:space-between;gap:20px;
    margin:48px 0 32px}
  .page-title{font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
  .lang{display:flex;align-items:baseline;gap:20px;flex:none}
  .lang span{font-size:var(--fs-meta);line-height:1.4;padding:0 2px 4px;border-bottom:4px solid transparent;
    color:rgba(242,239,233,.56)}
  .lang .on{color:#F2EFE9;font-weight:700;border-bottom-color:#F2EFE9}
  .date-row{display:flex;align-items:baseline;gap:14px;margin:-14px 0 32px;font-size:var(--fs-meta);
    line-height:1.4}
  .date-row .d{color:rgba(242,239,233,.95);letter-spacing:1px}
  .date-row .w{color:rgba(242,239,233,.56);letter-spacing:2px}
  .dock{position:absolute;left:24px;right:24px;bottom:150px;z-index:3;display:flex;flex-direction:column}
  /* ⑨ Tips 那一行：字号吃 --fs-meta（与上面年月日星期同一档），居左、前面空两格、离横条留一行 */
  .tips{font-size:var(--fs-meta);line-height:1.4;color:rgba(242,239,233,.78);
    text-indent:48px;margin-bottom:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .bar{display:flex;align-items:center;gap:22px;height:128px;padding:0 20px 0 34px;
    border-radius:var(--r-pill);background:rgba(242,239,233,.85);color:#23252C;
    border:var(--w-edge) solid rgba(35,37,44,.10);box-shadow:0 18px 46px rgba(8,10,14,.42)}
  .bar.open{border-radius:var(--r-card) var(--r-card) 0 0;background:#fff}
  .bl{flex:none;width:52px;height:52px;display:flex;align-items:center;justify-content:center}
  .lb{flex:1;min-width:0;font-size:var(--fs-title);font-weight:800;letter-spacing:-1px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .hint{flex:none;font-size:var(--fs-meta);font-weight:600;color:rgba(35,37,44,.42)}
  .dots{display:flex;align-items:center;gap:20px;flex:none}
  .dk{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center}
  /* ⑩ 换背景：图标撤掉、改一枚小箭头，字号并到 Tips 那一档 */
  .swap{display:flex;align-items:center;justify-content:center;gap:10px;height:110px;margin-top:22px}
  .swap span{font-size:var(--fs-meta);font-weight:700;letter-spacing:1px;color:rgba(242,239,233,.85)}
  .panel{background:#fff;color:#23252C;border-radius:0 0 var(--r-card) var(--r-card);
    padding:8px 32px 32px;height:700px;display:flex;flex-direction:column;
    box-shadow:0 24px 52px rgba(8,10,14,.34)}
  .modes{display:flex;align-items:center;gap:14px;padding:22px 0 4px;
    border-bottom:3px solid rgba(35,37,44,.07)}
  .md{display:flex;align-items:center;gap:10px;font-size:var(--fs-meta);font-weight:700;
    color:rgba(35,37,44,.42);padding:0 4px 16px;border-bottom:5px solid transparent;margin-bottom:-3px}
  .md.on{color:#23252C;border-bottom-color:#23252C}
  .md i{width:26px;height:26px;border-radius:50%}
  .desc{font-size:var(--fs-meta);color:rgba(35,37,44,.66);line-height:1.6;margin-top:24px}
  .pick{display:flex;gap:20px;margin-top:24px}
  .pk{flex:1;height:230px;border-radius:32px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:10px}
  .pk b{font-size:var(--fs-title);font-weight:800;letter-spacing:-.5px}
  .pk em{font-size:var(--fs-micro);font-style:normal;opacity:.72}
  .acts{margin-top:auto;padding-top:20px;display:flex;gap:16px}
  .act{flex:1;height:96px;border-radius:var(--r-pill);display:flex;align-items:center;
    justify-content:center;font-size:var(--fs-body);font-weight:700}
  .act.solid{background:#23252C;color:#F2EFE9;font-size:var(--fs-title);font-weight:800}
  .act.ghost{background:rgba(35,37,44,.06);color:rgba(35,37,44,.66)}

  /* ---------- ③④ 我的页 ---------- */
  .band{position:relative;height:542px;overflow:hidden}
  .score{position:absolute;right:32px;top:24px;z-index:4}
  .score b{display:block;font-family:'WtsjMind','Poppins',sans-serif;font-size:64px;font-weight:100;
    line-height:.86;color:rgba(242,239,233,.74)}
  .score span{display:block;margin-top:10px;padding-left:4px;text-align:center;font-size:var(--fs-micro);
    font-weight:700;letter-spacing:4px;color:rgba(242,239,233,.62);font-family:var(--ui)}
  .ident{position:relative;margin-top:-40px;height:144px;padding:0 32px;display:flex;
    align-items:center;gap:24px;background:var(--card);border-radius:var(--r-card)}
  .av{flex:none;width:80px;height:80px;border-radius:50%;background:url(${LOGO}) center/cover}
  .tx{flex:1;min-width:0}
  .nm{font-size:var(--fs-title);line-height:1.25;font-weight:800;letter-spacing:-.4px;color:var(--ink);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sl{margin-top:7px;font-size:var(--fs-meta);line-height:1.4;color:var(--sec);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* ④ 药丸从图上搬进这张卡：面改成卡上的淡墨，选中那枚还是墨底纸字 */
  .pill{flex:none;display:flex;gap:4px;padding:5px;border-radius:var(--r-pill);background:rgba(36,30,22,.055)}
  .seg{height:58px;line-height:58px;padding:0 24px;border-radius:var(--r-pill);font-size:var(--fs-meta);
    font-weight:700;color:var(--sec)}
  .seg.on{background:var(--ink);color:var(--page)}
  .menu{margin:24px 24px 0;background:var(--card);border:var(--w-edge) solid var(--edge);
    border-radius:var(--r-card);overflow:hidden}
  .mi{display:flex;align-items:center;justify-content:space-between;height:106px;padding:0 34px;
    border-bottom:var(--w-edge) solid var(--edge);font-size:var(--fs-body);font-weight:700;color:var(--ink)}
  .mi:last-child{border-bottom:none}
  .mi.dg{color:#B4231F}
  .ico2{width:46px;height:46px;border-radius:50%;background:var(--ink);display:flex;
    align-items:center;justify-content:center}
  .ico2 i{width:13px;height:13px;border-right:4px solid var(--page);border-bottom:4px solid var(--page);
    transform:rotate(-45deg);margin-left:-4px}

  /* ---------- 细节图 ---------- */
  .strip{width:702px;height:148px;position:relative;padding-top:20px}
  table{border-collapse:collapse;background:#fff;box-shadow:0 12px 34px rgba(0,0,0,.12);margin-top:8px}
  th,td{border:1px solid #ddd8cc;padding:12px 14px;text-align:center;font-weight:600;font-size:13px}
  th{background:#f6f3ec;text-align:left;white-space:nowrap}
  td.cb{background:var(--chrome-bg)}
  td.blk{background:#2D2D6C}
`

const TAB = (on, sel = 'var(--chrome-sel)') => `
  <div class="tabbar" ${sel !== 'var(--chrome-sel)' ? `style="--chrome-sel:${sel}"` : ''}>
    <div class="tab ${on === 0 ? 'on' : ''}"><i>${ico('plus', 40, '#F2EFE9')}</i></div>
    <div class="tab ${on === 1 ? 'on' : ''}"><i>${ico('rows-3', 40, '#F2EFE9')}</i></div>
    <div class="tab ${on === 2 ? 'on' : ''}"><i>${ico('user-round', 40, '#F2EFE9')}</i></div>
  </div>`


const doc = (title, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>${title}</title><style>${CSS}</style></head><body>${body}</body></html>`

/* ================= ① 三屏 ================= */
const createZh = `
<div class="shot"><div class="frame">
  <div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>
  <div class="nav">图麦笔记<span class="capsule"><span>•••</span><span>◎</span></span></div>
  <div class="view">
    <div class="photo"></div><div class="scrim"></div>
    <div class="pad">
      <div class="title-row"><div class="page-title">看到好内容，随手记下来</div>
        <div class="lang"><span class="on">中</span><span>EN</span></div></div>
      <div class="date-row"><span class="d">10月1日</span><span class="w">周四</span></div>
    </div>
    <div class="dock">
      <div class="tips">Tips：拍照或截图存进来，会自动提炼成要点</div>
      <div class="bar">
        <div class="bl">${ico('pen-line', 52, '#23252C')}</div>
        <div class="lb">动动手指</div>
        <div class="dots">
          <div class="dk" style="background:#C2AA85">${ico('camera', 38, '#2A2114')}</div>
          <div class="dk" style="background:#85644A">${ico('images', 38, '#FBF6EC')}</div>
          <div class="dk" style="background:#D9C9AE">${ico('link', 38, '#33291B')}</div>
        </div>
      </div>
      <div class="swap">${ico('chevron-right', 24, 'rgba(242,239,233,.85)')}<span>换背景</span></div>
    </div>
    ${TAB(0)}
  </div>
</div>
<div class="cap"><b>新建页（横条收起）</b>导航条标题统一成「图麦笔记」；横条上方多一行 Tips（<code>--fs-meta 24</code>，与上面年月日星期同一档，前面空两格、离横条留一行）；条身「动动手指」从 <code>46rpx</code> 收到笔记标题那一档 <code>--fs-title 31</code>；前面的铅笔换成 Lucide 那一套；「换背景」字号并到 Tips 同一档、图标撤掉改一枚小箭头。</div></div>`

const notesZh = `
<div class="shot"><div class="frame">
  <div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>
  <div class="nav">图麦笔记<span class="capsule"><span>•••</span><span>◎</span></span></div>
  <div class="view">
    <div class="head">
      <div class="photo"></div><div class="scrim"></div>
      <div class="h1">我的笔记</div>
      <div class="stats">
        <div class="stat"><span class="n">4</span><span class="l">笔记</span></div>
        <div class="stat"><span class="n">2</span><span class="l">分享</span></div>
        <div class="stat"><span class="n">0</span><span class="l">收藏</span></div>
      </div>
    </div>
    <div class="sheet">
      <div class="tools">
        <div class="chips"><div class="chip all">全部</div><div class="chip c1">旅游</div>
          <div class="chip c2">生活</div><div class="chip c3">私密</div></div>
        <div class="scbtn">${ico('search', 26, '#241E16')}</div>
      </div>
      <div class="list">
        <div class="r"><span class="dot t1"></span><span class="pin">置顶</span><span class="ti">2026年中秋节祝福语与问候图片大全</span><span class="dt">09-25</span></div>
        <div class="r"><span class="dot t1"></span><span class="pin">置顶</span><span class="ti">2026微信小程序开发大赛介绍</span><span class="dt">09-23</span></div>
        <div class="r"><span class="dot"></span><span class="ti">测试环境可以了</span><span class="dt">09-30</span></div>
        <div class="r"><span class="dot t2"></span><span class="ti">TVB新晋HiFi女歌手——侯静伊</span><span class="dt">09-25</span></div>
        <div class="r"><span class="dot t1"></span><span class="ti">小红书上一篇讲胶片配色的收藏</span><span class="dt">09-20</span></div>
        <div class="r"><span class="dot"></span><span class="ti">知乎回答：怎么把长文读成三句话</span><span class="dt">09-18</span></div>
      </div>
    </div>
    <div class="fade"></div>
    ${TAB(1)}
  </div>
</div>
<div class="cap"><b>笔记列表</b>三列从"横贯整块"改成钉在右上角：<code>right 32 / top 24</code>，与「我的」页那枚 MIND 同一个锚点；整块宽度从 702 收到 <b>312</b>（三格各 104），数字 100→<b>64</b>、小字 18 不变、字距 6→4。第三列画的是 <b>0</b>：读不到字段就画 0，不再画「—」。</div></div>`

const meZh = `
<div class="shot"><div class="frame light">
  <div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>
  <div class="nav">图麦笔记<span class="capsule"><span>•••</span><span>◎</span></span></div>
  <div class="view">
    <div class="band">
      <div class="photo"></div><div class="scrim"></div>
      <div class="h1" style="position:absolute;left:32px;top:22px;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)">我的</div>
      <div class="score"><b>128</b><span>MIND</span></div>
    </div>
    <div class="ident">
      <div class="av"></div>
      <div class="tx"><div class="nm">你好！我是图麦笔记</div>
        <div class="sl">把图文，提炼成有用的干货</div></div>
      <div class="pill"><div class="seg on">设置</div><div class="seg">关于</div></div>
    </div>
    <div class="menu">
      <div class="mi">卡片模板<span class="ico2"><i></i></span></div>
      <div class="mi">外观设置<span class="ico2"><i></i></span></div>
      <div class="mi">分类管理<span class="ico2"><i></i></span></div>
      <div class="mi">私密密码<span class="ico2"><i></i></span></div>
      <div class="mi dg">注销账号<span class="ico2"><i></i></span></div>
    </div>
    ${TAB(2)}
  </div>
</div>
<div class="cap"><b>「我的」页</b>MIND 从右下角搬到右上角，锚点与笔记页那三列完全同一个（<code>right 32 / top 24</code>）、数字同一档（64）；「设置／关于」那枚药丸从图上搬进留白卡，坐在 LOGO 这一行的最右——这一行现在是「圆 LOGO + 两行字 + 药丸」。</div></div>`

fs.writeFileSync(path.join(DIR, 'v13-三屏-中文.html'), doc('v13 三屏', `
<h1>v13 · 三屏（数字挪到右上角 + 药丸进 LOGO 行 + 底栏纯图标 + 图标换一套）</h1>
<p class="lead">这一版只画你 10-01 傍晚那十条里<b>能一眼看出差别</b>的三屏，尺寸全部按现网令牌取：
<b>数字／字号／间距没有一处是新造的</b>，图标是 Lucide（ISC 授权）原始路径，没改一笔。</p>
<div class="notes">
<b>三屏共同的四处：</b>
① 导航条标题三个 tab 全统一成「图麦笔记」（英文「TumarkNote」）——现网英文那一份是 <code>TuMaiBiJi</code>，拼音不是品牌名。
② 底栏三个按钮<b>去掉文字</b>，只留抽象图标；选中态从"文字下面一条短线"改成"图标垫一枚同色阶圆底"。
③ 图标整套换成 Lucide（24 网格、圆头描边、描边 2），底栏、横条前面那枚、横条右边三枚小圆全部同一套。
④ 「动动手指」这一档从 <code>46rpx</code> 收到笔记标题那一档 <code>--fs-title 31rpx</code>——同一位置上「拍照或截图」「贴个链接」「选了 2 张」跟着一起收。
<br><br>
<b>两个数说明：</b>三列数字整块宽 <code>3×104 = 312rpx</code>（原来横贯 702），数字 <code>64rpx</code>（原来 100）；
读不到字段画 <b>0</b>，不再画「—」——这条会把今天早上写进 PRD 的「画 0 是假话」推翻，改的时候一起改。
<br><br>
<b>一处现网差异照画没修：</b>「我的」页的导航条现在不跟随背景图变深底白字（笔记页和新建页会），所以这一屏顶上还是浅底黑字。要不要三页一起统一，等你一句话。
</div>
<div class="row">${createZh}${notesZh}${meZh}</div>`))

/* ================= ② 细节图 ================= */
const strips = [
  ['象牙 · 甲（推荐）', '#443A25', '#796641', 'rgba(242,239,233,.14)'],
  ['象牙 · 乙（纸白垫底）', '#443A25', 'rgba(242,239,233,.16)', 'rgba(242,239,233,.14)'],
  ['夜紫 · 甲', '#2D2D6C', '#4545A6', 'rgba(242,239,233,.22)'],
  ['深海 · 甲', '#2A4B6F', '#4173AA', 'rgba(242,239,233,.22)'],
].map(([label, bg, sel, line]) => `
  <div style="width:750px">
    <div style="font-size:15px;font-weight:700;color:#1d1f20;margin:18px 0 0">${label}</div>
    <div class="strip" style="--chrome-bg:${bg};--chrome-sel:${sel};--chrome-line:${line}">
      <div class="tabbar">
        <div class="tab"><i>${ico('plus', 40, '#F2EFE9')}</i></div>
        <div class="tab on"><i>${ico('rows-3', 40, '#F2EFE9')}</i></div>
        <div class="tab"><i>${ico('user-round', 40, '#F2EFE9')}</i></div>
      </div>
    </div>
  </div>`).join('')

const iconRow = (name, size, where) => `
  <tr><th>${name}</th>
    <td>${ico(name, size, '#241E16')}</td>
    <td class="cb">${ico(name, size, '#F2EFE9')}</td>
    <td class="blk">${ico(name, size, '#F2EFE9')}</td>
    <td style="text-align:left">${where}</td></tr>`

const sheet = `
<table><thead><tr><th>图标（Lucide）</th><th>纸面 40</th><th>底栏 40</th><th>深壁纸 40</th><th>用在哪儿</th></tr></thead><tbody>
${iconRow('plus', 40, '底栏左一 · 新建')}
${iconRow('rows-3', 40, '底栏中间 · 笔记列表')}
${iconRow('user-round', 40, '底栏右一 · 我的')}
${iconRow('pen-line', 52, '横条前面 · 直接写')}
${iconRow('camera', 52, '横条前面／三枚小圆 · 拍照')}
${iconRow('images', 52, '横条前面／三枚小圆 · 相册')}
${iconRow('link', 52, '横条前面／三枚小圆 · 链接')}
${iconRow('chevron-right', 24, '「换背景」前面那枚小箭头')}
${iconRow('library-big', 40, '备选：底栏中间换成"书脊"（更象形、没那么抽象）')}
${iconRow('square-pen', 52, '备选：横条「直接写」那枚（比斜铅笔好认）')}
</tbody></table>`

const createEn = `
<div class="shot"><div class="frame">
  <div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>
  <div class="nav">TumarkNote<span class="capsule"><span>•••</span><span>◎</span></span></div>
  <div class="view">
    <div class="photo"></div><div class="scrim"></div>
    <div class="pad">
      <div class="title-row"><div class="page-title">Save what matters</div>
        <div class="lang"><span>中</span><span class="on">EN</span></div></div>
      <div class="date-row"><span class="d">Oct 1</span><span class="w">THU</span></div>
    </div>
    <div class="dock">
      <div class="tips">Tips: Photos and screenshots turn into key points</div>
      <div class="bar">
        <div class="bl">${ico('pen-line', 52, '#23252C')}</div>
        <div class="lb">Jot it down</div>
        <div class="dots">
          <div class="dk" style="background:#C2AA85">${ico('camera', 38, '#2A2114')}</div>
          <div class="dk" style="background:#85644A">${ico('images', 38, '#FBF6EC')}</div>
          <div class="dk" style="background:#D9C9AE">${ico('link', 38, '#33291B')}</div>
        </div>
      </div>
      <div class="swap">${ico('chevron-right', 24, 'rgba(242,239,233,.85)')}<span>Change photo</span></div>
    </div>
    ${TAB(0)}
  </div>
</div>
<div class="cap"><b>英文版（同一屏）</b>导航条 <code>TumarkNote</code>；Tips 那行按英文写 <code>Tips: </code>（中文那档是 <code>Tips：</code>），空两格在英文里换成 <code>2em</code> 缩进，否则两个空格看不出。条身 <code>Jot it down</code> 收档后离右边三枚小圆还很松。</div></div>`

const createOpen = `
<div class="shot"><div class="frame">
  <div class="status"><span>13:35</span><span class="r">5G ▮▮</span></div>
  <div class="nav">图麦笔记<span class="capsule"><span>•••</span><span>◎</span></span></div>
  <div class="view">
    <div class="photo"></div><div class="scrim"></div>
    <div class="pad">
      <div class="title-row"><div class="page-title">看到好内容，随手记下来</div>
        <div class="lang"><span class="on">中</span><span>EN</span></div></div>
      <div class="date-row"><span class="d">10月1日</span><span class="w">周四</span></div>
    </div>
    <div class="dock">
      <div class="bar open">
        <div class="bl">${ico('camera', 52, '#23252C')}</div>
        <div class="lb">拍照或截图</div>
        <div class="hint">收起</div>
      </div>
      <div class="panel">
        <div class="modes">
          <div class="md"><i style="background:#EAE0CE"></i>直接写</div>
          <div class="md on"><i style="background:#C2AA85"></i>拍照</div>
          <div class="md"><i style="background:#85644A"></i>相册</div>
          <div class="md"><i style="background:#D9C9AE"></i>链接</div>
        </div>
        <div class="desc">拍一张或截一段，存进来后会自动提炼成标题和要点。</div>
        <div class="pick">
          <div class="pk" style="background:#C2AA85;color:#2A2114">${ico('camera', 72, '#2A2114')}<b>拍照</b><em>现拍一张，只存这一张</em></div>
          <div class="pk" style="background:#85644A;color:#FBF6EC">${ico('images', 72, '#FBF6EC')}<b>从相册选</b><em>一次最多 9 张</em></div>
        </div>
        <div class="acts"><div class="act ghost">清空</div><div class="act solid">开始提炼</div></div>
      </div>
    </div>
    ${TAB(0)}
  </div>
</div>
<div class="cap"><b>展开态（拍照）</b>同一位置的条身「拍照或截图」也走 <code>31rpx</code> 那一档，前面那枚跟着模式换成相机。<b>展开时 Tips 那一行不渲染</b>——和「换背景」同一规矩：面板已经贴底了，上面再滚一行提示会跟表单抢眼睛。这条是我替你定的，不想要就说。</div></div>`

fs.writeFileSync(path.join(DIR, 'v13-底栏与图标.html'), doc('v13 细节', `
<h1>v13 · 细节：底栏两档 × 四套壁纸 + 图标清单 + 英文与展开态</h1>
<p class="lead">底栏去文字之后，选中态只剩"垫一枚圆底"这一件事可做。圆底的颜色<b>不新造</b>：
现网 <code>palette.chromeOf()</code> 已经按壁纸算出那一块面的 HSL，圆底就是<b>同一支色把明度抬 16 档</b>——
甲、乙两档只差圆底用"同色阶提亮"还是"纸白 16%"。</p>
<div class="notes">
<b>甲（推荐）：</b>象牙 <code>#796641</code>、夜紫 <code>#4545A6</code>、深海 <code>#4173AA</code>——四套壁纸都算过，抬 16 档在浅底深底都看得见、又不会亮过图标本身。
<b>乙：</b>纸白 @16%，更淡，深色壁纸下像"按下了一下"，浅色壁纸下几乎看不出来。
<br><br>
<b>图标为什么是 Lucide：</b>ISC 授权（可商用、可打包进小程序），24 网格 + 圆头描边 + 描边 2，
在 40rpx（真机约 21px）上描边正好 1.75px，不发虚也不糊。同一套里我把「笔记」那枚的两个方向都列了：<b>rows-3</b>（三行列表，最抽象）和 <b>library-big</b>（书脊，最好认）。
<br><br>
<b>落地形式：</b>这些 SVG 会以 base64 内嵌进 wxss（WXSS 的 <code>background-image</code> 不认包内本地文件），
颜色由 JS 递进来——底栏那三枚吃 <code>chromeOf</code>，换壁纸不会变回黑色。
</div>
<div class="row" style="flex-wrap:wrap;gap:0 48px">${strips}</div>
<h1 style="margin-top:44px">选定那一套（放大核对）</h1>
${sheet}

<div class="row" style="margin-top:36px">${createEn}${createOpen}</div>`))

console.log('ok')

// ⑨ Tips 池：这六句现网字典里一句都没有，全部标「新串」，实现时中英各写一份进 utils/i18n.js */
const TIPS = [
  ['拍照或截图存进来，会自动提炼成要点', 'Photos and screenshots turn into key points'],
  ['贴一个公众号链接，长文读成三句话', 'Paste a link — get it down to three lines'],
  ['分享时可选卡片模板，换套版式再发出去', 'Pick a card template before you share'],
  ['笔记卡片可以「保存并分享」，直接发到微信', 'Save the card and send it to WeChat'],
  ['设了密码的那一格是私密，锁着不发正文', 'A category with a password stays private'],
  ['外观里能换壁纸，也能换界面字体', 'Change wallpaper and interface font'],
]
const tipTable = `<table><thead><tr><th>#</th><th style="text-align:left">中文（新串）</th><th style="text-align:left">English（新串）</th><th>最长</th></tr></thead><tbody>
${TIPS.map(([z, e], i) => `<tr><td>${i + 1}</td><td style="text-align:left;font-size:24px;color:#241E16">&nbsp;&nbsp;Tips：${z}</td><td style="text-align:left;font-size:24px;color:#241E16">Tips: ${e}</td><td>${z.length} 字</td></tr>`).join('\n')}
</tbody></table>`

fs.writeFileSync(path.join(DIR, 'v13-Tips池.html'), doc('v13 Tips', `
<h1>v13 · Tips 那一行轮播哪几句（六句全是新串，现网字典里没有）</h1>
<p class="lead">字号 <code>--fs-meta 24</code>、前面空两格、离横条一行；一句停 <code>4s</code> 淡入淡出换下一句，
进页从第 1 句起。最长一句 <b>${Math.max(...TIPS.map(([z]) => z.length))} 字</b>，可用宽 <code>750 − 24×2（页边）− 48（空两格）= 654</code>，
24rpx 下能放 27 个汉字，所以<b>一句都放得下、不会折行</b>。英文那几行最长 45 个字母，也在同一档里放得下。</p>
${tipTable}
<p class="lead" style="margin-top:20px">上面每行的"中文"那一格就是屏上真正会出现的样子（含前面那两格空格）。</p>`))
