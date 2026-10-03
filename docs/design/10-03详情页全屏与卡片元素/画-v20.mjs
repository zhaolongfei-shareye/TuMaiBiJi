// v20 效果图：站长 10-03 上午这一轮把「详情」从浮窗改成**一整屏**，并把卡片上要用的三样东西
// （配图、昵称、一句话）收进**一枚小弹窗**。他给的三条回答钉死了结构：
//   1 浮窗不要了 → 列表点「显示更多」直接进全屏页，照附件一（书籍详情）那种排法；
//   2 图片 + 昵称 + 一句话 统一走一枚小弹窗，尺寸照私密密码那一层（卡 620、顶 180、遮罩 .55），
//     填过一次之后每次打开**把上次的读回来**，可反复改；
//   3 四个位置都满了要再传 → 弹窗里先让他**挑一格删掉**，再传（不自动顶替）。
// 六屏：
//   s1 详情全屏·这篇已经有卡片（右上缩略图 + ‹ 1/3 ›）
//   s2 详情全屏·一张卡片都没有（右上那一格改画「生成笔记卡片」，底是抽象色块）
//   s3 小弹窗·第一次进来（四个位置空着，两个输入框空着）
//   s4 小弹窗·填过（上次的值读回来；有图那枚显示「更换」；四格已满 → 让他先删一格）
//   s5 生成卡片成品弹窗（现网那一层，只把十枚小圆点换成三张可见的封面墙 + 一行「卡片上的信息」入口）
//   s6 「我的」→「卡片模板」（四个位置改小、一行排满不再滚；名称/一句话两个框压高度）
// 跑法：node docs/design/10-03详情页全屏与卡片元素/画-v20.mjs
//      bash  docs/design/10-03详情页全屏与卡片元素/截-v20.sh
//
// 口径全部从代码侧取，不自己发明：
//   屏高 750×1670（1px = 1rpx），令牌逐字抄 app.wxss 的 theme-default；
//   小弹窗那一层的宽/顶/遮罩 = me.wxss 的 .pwd-card / .pwd-mask（620 / 180 / rgba(20,20,28,.55)）；
//   成品弹窗外壳 = index.wxss 的 .float-sheet（左右 24、上 130、下 152、纸白 #FCFBF8、背后不垫遮罩）；
//   详情正文两档墨色沿用列表那一屏（前景 rgba(35,37,44,.9)、正文 .7），标题 38/800 = 现网 .ds-h2；
//   卡片比例吃真跑量出来的两档：玉版宣 830×1157 = 0.717、摘句 830×854 = 0.972；
//   色块只有两个来源：palette.TONES 五支 + palette.PAPERS 四支，抽象那一块不新造颜色；
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
const T = palette.TONES
const TIP = palette.TIP_DOT
const BLUE = T[1].bg
const I90 = 'rgba(35,37,44,.9)'
const I70 = 'rgba(35,37,44,.7)'
const META = 'rgba(35,37,44,.5)'

/* 现网 i18n.js 里逐字对过的串（这一稿几乎不需要新串，"先删后传"那句 slotHintFull 早就在） */
const S = {
  gen: '生成笔记卡片', cancel: '取消', ok: '确定', save: '保存',
  share: '保存并分享', qr: '带二维码', qrHint: '发到微信以外的平台容易被屏蔽，可关掉只留文字',
  swipe: '左右滑换模板', grip: '点一下收起', more: '显示更多',
  name: '名称', namePh: '你的名字或昵称', slogan: '一句话', sloganPh: '想印在图上的一句话，可不填',
  slotHint: '四个位置，先点 ＋ 放一张图进来。图下面两枚开关：「背景」铺在首页、也垫在笔记页头部，「卡片」画在卡片头像上。',
  slotHintFull: '四个位置都放满了。要换一张，先点哪张右上角的垃圾桶删掉一个。',
  preview: '卡片预览', card: '卡片', bg: '背景',
  pub: '这篇已经公开，别人扫码能看', revoke: '撤掉分享', edit: '编辑', del: '删除',
  summary: '摘要', points: '核心要点', srcLink: '来源链接', orig: '原文内容', expand: '展开',
}
/* 这轮新造的（屏上会挂「新串」标） */
const NEW = { info: '卡片上的信息', replace: '更换', upload: '上传',
  sheetHint: '这几样会印在卡片上。改一次就留着用，下次打开还是这几样。',
  linkNote: '链接无法直接打开，可复制链接在浏览器打开' }

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
/* 手机框。占位文字类名一律 .plc——.ph 是这台框自己（10-03 上一版踩过：挂在 span 上把整屏糊成纸板） */
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:#f4f2ec;color:#23252c;
  --fs-h1:42px;--fs-h2:34px;--fs-title:31px;--fs-body:28px;--fs-meta:24px;--fs-tiny:21px;--fs-label:20px;--fs-micro:18px;
  --sp-1:8px;--sp-2:16px;--sp-3:24px;--sp-4:32px;--sp-5:48px;
  --r-card:40px;--r-chip:28px;--r-pill:999px;--w-edge:3px;--sh-float:0 16px 44px rgba(35,37,44,.22);
  --t2:#5c6068;--t3:#9a9ea6;--edge:rgba(35,37,44,.1);--ink:#23252c;--danger:#b4231f}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;
  font-size:26px;font-weight:600;color:#23252c}
.status .r{font-size:22px;font-weight:500;letter-spacing:1px}
/* 沉浸式：这一页走 navigationStyle:custom，系统导航条那一层不要了，
   但微信胶囊仍固定在右上角（右 24、上 116、174×46）——右上那一格卡片必须从它下面起。 */
.capsule{position:absolute;right:24px;top:116px;width:174px;height:46px;border-radius:999px;z-index:20;
  background:rgba(255,255,255,.62);border:1px solid rgba(35,37,44,.12);
  display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#23252c}
.back{position:absolute;left:32px;top:112px;width:56px;height:56px;z-index:20;display:flex;align-items:center;justify-content:center}
.back i{width:26px;height:26px;border-left:4px solid ${I90};border-bottom:4px solid ${I90};
  border-radius:2px;transform:rotate(45deg)}
.page{position:absolute;inset:0;overflow:hidden}
/* ---- 首屏那一行：左标题、右卡片缩略图（附件一就是这个左右关系） ---- */
.hero{position:absolute;left:32px;right:32px;top:200px;display:flex;gap:24px;align-items:flex-start}
.hero .lt{width:382px;flex:none;padding-top:6px}
.hero .cat{display:flex;align-items:center;gap:10px;font-size:var(--fs-meta);color:${META}}
.hero .cat i{width:14px;height:14px;border-radius:50%;background:${T[0].bg}}
.hero h2{margin-top:14px;font-size:38px;font-weight:800;line-height:1.28;letter-spacing:-.9px;color:${I90};
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden}
.hero .tags{margin-top:16px;display:flex;gap:10px;flex-wrap:wrap}
.hero .tags u{text-decoration:none;font-size:var(--fs-tiny);font-weight:700;color:#23323C;
  background:rgba(168,188,201,.35);border-radius:8px;padding:5px 12px}
/* 右上那一格：有卡片＝白垫缩略图 + ‹ 1/3 ›；没卡片＝一枚抽象色块底的「生成笔记卡片」 */
.rt{width:280px;flex:none}
.pad{width:280px;height:390px;border-radius:20px;background:#fff;display:flex;align-items:center;
  justify-content:center;overflow:hidden;box-shadow:0 8px 22px rgba(8,10,14,.10)}
.pg{margin-top:10px;display:flex;align-items:center;justify-content:center;gap:10px}
.pg u{width:40px;height:40px;display:flex;align-items:center;justify-content:center;text-decoration:none;
  color:rgba(35,37,44,.62)}
.pg u::before{content:'';width:14px;height:14px;border-left:3px solid currentColor;border-bottom:3px solid currentColor;
  border-radius:2px}
.pg u.l::before{transform:rotate(45deg)}
.pg u.r::before{transform:rotate(-135deg)}
.pg b{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:26px;line-height:1;letter-spacing:1px;
  color:rgba(35,37,44,.72)}
/* 站长 10-03 看过首版打回：那一整块抽象色块"太花哨、与整体简约文艺不搭"。
   改成一小块分类色 + 中间一枚 + 号 + 两行小字，颜色仍从 palette 出（不新造一支）。 */
.rt .empty{display:flex;flex-direction:column;align-items:center}
.swatch{width:132px;height:132px;border-radius:28px;display:flex;align-items:center;justify-content:center;
  font-size:58px;font-weight:200;line-height:1}
.rt .e1{margin-top:20px;font-size:var(--fs-meta);font-weight:700;color:${I90};text-align:center}
.rt .e2{margin-top:6px;font-size:var(--fs-micro);color:${META};text-align:center}
/* ---- 正文（字号颜色照列表那两档；分区头沿用现网 .ds-lab 20/800 字距 1.6） ---- */
.dbody{position:absolute;left:32px;right:32px;top:646px;bottom:190px;overflow:hidden}
.dbody .lab{margin-top:34px;font-size:var(--fs-label);font-weight:800;letter-spacing:1.6px;color:${META}}
.dbody .lab:first-child{margin-top:0}
.dbody p{margin-top:12px;font-size:var(--fs-body);line-height:1.7;color:${I70}}
/* 要点前面那枚：站长 10-03 打回——现网是 38 见方的带圈数字徽（太大、太抢），
   改成头部 Tips 前面那种 14 实心小黄点（同一个 palette.TIP_DOT），精致一档。 */
.dbody .pt{margin-top:14px;display:flex;gap:16px;align-items:flex-start}
.dbody .pt i{flex:none;width:14px;height:14px;border-radius:50%;background:${TIP};margin-top:12px}
.dbody .pt span{font-size:var(--fs-body);line-height:1.55;color:${I90}}
.dbody .link{margin-top:12px;font-size:var(--fs-meta);line-height:1.5;color:${BLUE}}
.dbody .lnote{margin-top:8px;font-size:var(--fs-tiny);line-height:1.5;color:${META}}
.dbody .orig{margin-top:34px;display:flex;align-items:center;justify-content:space-between}
.dbody .sw{font-size:var(--fs-meta);font-weight:700;color:rgba(35,37,44,.55)}
.rule{height:2px;background:rgba(35,37,44,.08);margin:0 -32px}
/* 底部那一排：现网三枚里「生成笔记卡片」搬到右上那格了，这里只剩两枚（一个功能只留一个入口） */
.dock{position:absolute;left:32px;right:32px;bottom:44px}
.dock .irow{display:flex;gap:14px}
.dock .irow b{flex:1;height:72px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  white-space:nowrap;font-size:var(--fs-meta);font-weight:700;color:#23252C;
  box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.dock .irow b.d{color:var(--danger)}
.dock .pub{margin-top:16px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-micro);color:rgba(35,37,44,.55)}
.dock .pub s{text-decoration:none;font-weight:700;color:var(--danger)}
/* ---- 小弹窗：外壳逐寸照 me.wxss 的 .pwd-mask / .pwd-card ---- */
.mask{position:absolute;inset:0;background:rgba(20,20,28,.55);z-index:40;display:flex;
  align-items:flex-start;justify-content:center;padding-top:180px}
.mini{width:620px;background:#fff;border:var(--w-edge) solid var(--edge);border-radius:var(--r-card);
  box-shadow:var(--sh-float);padding:var(--sp-5) var(--sp-4) var(--sp-4)}
.mini .nm{font-size:var(--fs-h2);font-weight:700;letter-spacing:-.6px;color:#23252c}
.mini .sc{margin-top:12px;font-size:var(--fs-tiny);letter-spacing:-.2rpx;line-height:1.5;color:#5c6068}
/* 四个位置：卡内净宽 556 = 4×124 + 3×20（现网那一页是 200 一枚、一行横滑） */
.d4{margin-top:28px;display:flex;gap:20px;justify-content:center}
.d4 .sl{position:relative;width:124px;flex:none}
.d4 .disc{width:124px;height:124px;border-radius:50%;overflow:hidden;background:rgba(35,37,44,.06);
  border:var(--w-edge) solid var(--edge);display:flex;align-items:center;justify-content:center;position:relative}
.d4 .disc img{width:100%;height:100%;object-fit:cover;display:block}
.d4 .plus{font-size:44px;font-weight:300;color:rgba(35,37,44,.4);line-height:1}
.d4 .cap2{margin-top:8px;text-align:center;font-size:var(--fs-micro);color:rgba(35,37,44,.5)}
/* 有图那枚上的「更换」：压在图下沿，不另起一行（密码那层的芯片浮在下沿外 4rpx 是同一个做法） */
.d4 .rep{position:absolute;left:6px;right:6px;bottom:6px;height:34px;border-radius:0 0 62px 62px;
  background:rgba(20,20,28,.55);color:#F2EFE9;font-size:var(--fs-micro);font-weight:700;
  display:flex;align-items:center;justify-content:center}
/* 四格已满 → 每枚右上角一枚 ×，让他先删一格（现网 slotHintFull 那句已经这么写了，不新造话）。
   画法与「我的→卡片模板」那页现网的垃圾桶逐寸相同（深色圆 + ×），所以那句"点右上角的垃圾桶"不用改口。 */
.d4 .x{position:absolute;right:-2px;top:-2px;width:34px;height:34px;border-radius:50%;background:rgba(20,20,28,.5);
  color:#fff;font-size:20px;line-height:34px;text-align:center;z-index:3}
.d4 .sl.picking .disc{box-shadow:0 0 0 4px ${T[0].bg}}
/* 两个输入框：现网 .field-input 是 --fs-title 31 + gap 16，这一稿压到 --fs-body 28 + gap 8 */
.fld{margin-top:26px}
.fld .fl{font-size:var(--fs-meta);font-weight:700;color:#5c6068}
.fld .box{margin-top:8px;height:52px;border-bottom:var(--w-edge) solid rgba(35,37,44,.14);
  display:flex;align-items:center;font-size:var(--fs-body);font-weight:600;color:#23252c}
.fld .box.plc{color:#9a9ea6;font-weight:400}
.mini .acts{margin-top:34px;display:flex;gap:16px}
.mini .acts b{flex:1;height:80px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-meta);font-weight:700}
.mini .acts b.g{color:#23252c;box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.mini .acts b.p{background:#23252C;color:#F4F2EC}
/* ---- 成品弹窗：外壳照 index.wxss .float-sheet（背后不垫遮罩，那是站长 10-02 定的分层口径） ---- */
.sheet{position:absolute;left:24px;right:24px;top:130px;bottom:152px;background:#FCFBF8;border-radius:32px;
  box-shadow:0 30px 60px rgba(8,10,14,.32);z-index:30;display:flex;flex-direction:column;overflow:hidden;
  align-items:center;padding:20px 0 24px}
.grip{flex:none;width:100%;height:56px;display:flex;align-items:center;justify-content:center;position:relative}
.grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.grip span{position:absolute;top:0;height:56px;display:flex;align-items:center;font-size:var(--fs-tiny);
  font-weight:700;letter-spacing:.4px;color:rgba(35,37,44,.42)}
.grip .l{left:34px}
.grip .r{right:34px}
/* 封面墙：中间当前、左右各露一截（附件三那种）。同时最多三枚，十套靠左右滑走。 */
.midwrap{flex:1;min-height:0;width:100%;display:flex;flex-direction:column;align-items:center;
  justify-content:center}
.flow{flex:none;height:500px;width:100%;display:flex;align-items:center;justify-content:center;
  position:relative;overflow:hidden}
.flow .t{position:absolute;border-radius:20px;background:#fff;box-shadow:0 12px 30px rgba(8,10,14,.18);
  overflow:hidden;display:flex;align-items:center;justify-content:center}
/* 站长 10-03：首版"只看到中间那张，左右那一截看不见"。根因是左右两枚也用了米白底 + opacity .5，
   压在纸白弹窗上等于没画。这版：左右各让出 181（不是 137）、透明度抬到 .85、补一道描边，
   并且左右两枚换成有颜色的那两套（荧光渐变／叠翠），中间留米白那套。 */
.flow .t.mid{width:340px;height:474px;z-index:3}
.flow .t.side{width:320px;height:446px;z-index:2;opacity:.85;transform:scale(.94);
  border:var(--w-edge) solid rgba(35,37,44,.10)}
.flow .t.l{left:0}
.flow .t.r{right:0}
.flow .nm{position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:var(--fs-micro);
  letter-spacing:1px;color:rgba(35,37,44,.55);z-index:4}
/* 一行「卡片上的信息」入口：缩略 + 当前昵称/一句话 + 右端 › ——点它拉起上面那枚小弹窗 */
.info{flex:none;margin:14px 24px 0;width:654px;display:flex;align-items:center;gap:14px;
  padding:16px 20px;border-radius:var(--r-chip);background:rgba(35,37,44,.05)}
.info .av{width:64px;height:64px;border-radius:50%;overflow:hidden;flex:none;background:rgba(35,37,44,.08);
  display:flex;align-items:center;justify-content:center;color:rgba(35,37,44,.4);font-size:30px}
.info .av img{width:100%;height:100%;object-fit:cover}
.info .tx{flex:1;min-width:0}
.info .tx b{display:block;font-size:var(--fs-body);font-weight:600;color:${I90};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info .tx u{display:block;margin-top:2px;text-decoration:none;font-size:var(--fs-meta);color:${I70};
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.info .go{flex:none;width:20px;height:20px;border-top:3px solid rgba(35,37,44,.4);
  border-right:3px solid rgba(35,37,44,.4);transform:rotate(45deg)}
.dockp{flex:none;width:100%;padding:0 24px;margin-top:auto}
.qr{display:flex;align-items:center;gap:16px;padding:18px 4px 0}
.pill{width:88px;height:52px;border-radius:999px;background:rgba(35,37,44,.14);position:relative;flex:none}
.pill.on{background:#23252C}
.pill i{position:absolute;top:6px;left:6px;width:40px;height:40px;border-radius:50%;background:#fff;
  transition:none}
.pill.on i{left:42px}
.qr .tx b{display:block;font-size:var(--fs-body);font-weight:700;color:${I90}}
.qr .tx u{display:block;margin-top:2px;text-decoration:none;font-size:var(--fs-tiny);color:${META}}
.trow{display:flex;gap:16px;margin-top:20px}
.trow b{flex:1;height:88px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  font-size:var(--fs-body);font-weight:700}
.trow b.g{color:#23252c;box-shadow:inset 0 0 0 var(--w-edge) rgba(35,37,44,.16)}
.trow b.p{background:#23252C;color:#F4F2EC}
/* ---- 卡片模板页（s6）：四个位置改小、一行排满不滚；两个框压高度 ---- */
.nav{height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;position:relative;
  color:#23252c}
.nav .capsule{top:22px;background:rgba(35,37,44,.05);border-color:rgba(35,37,44,.1)}
.wrap{position:absolute;left:24px;right:24px;top:184px;bottom:0;overflow:hidden}
.card{background:#fff;border:var(--w-edge) solid var(--edge);border-radius:var(--r-card);
  padding:var(--sp-3) var(--sp-4) var(--sp-4);margin-bottom:var(--sp-2);position:relative;overflow:hidden}
.card .hint{margin-top:20px;font-size:var(--fs-tiny);line-height:1.55;color:#5c6068}
/* 卡内净宽 638：4×124 + 3×24 = 568，居中左右各余 35（现网是 200 一枚、横滑） */
.s4{display:flex;gap:24px;justify-content:center}
.s4 .sl{position:relative;width:124px;flex:none}
.s4 .disc{width:124px;height:124px;border-radius:50%;overflow:hidden;background:rgba(35,37,44,.06);
  border:var(--w-edge) solid var(--edge);display:flex;align-items:center;justify-content:center}
.s4 .disc img{width:100%;height:100%;object-fit:cover}
.s4 .plus{font-size:44px;font-weight:300;color:rgba(35,37,44,.4)}
.s4 .bin{position:absolute;right:-2px;top:-2px;width:34px;height:34px;border-radius:50%;background:rgba(20,20,28,.5);
  color:#fff;font-size:20px;line-height:34px;text-align:center}
.s4 .chips{margin-top:8px;display:flex;flex-direction:column;gap:4px;align-items:center}
.s4 .chips u{text-decoration:none;font-size:var(--fs-micro);font-weight:700;padding:2px 8px;border-radius:6px;
  background:rgba(35,37,44,.06);color:rgba(35,37,44,.45)}
.s4 .chips u.on{background:${T[0].bg};color:${T[0].ink}}
.fld2{margin-top:0}
.fld2 .fl{font-size:var(--fs-meta);font-weight:700;color:#5c6068}
.fld2 .box{margin-top:8px;height:52px;border-bottom:var(--w-edge) solid rgba(35,37,44,.14);display:flex;
  align-items:center;font-size:var(--fs-body);font-weight:600;color:#23252c}
.fld2 .box.plc{color:#9a9ea6;font-weight:400}
.save{height:88px;border-radius:var(--r-pill);background:#23252C;color:#F4F2EC;font-size:var(--fs-body);
  font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:4px}
.pvhead{margin:var(--sp-4) 0 var(--sp-2);font-size:var(--fs-meta);font-weight:700;color:#5c6068}
.pvrow{display:flex;gap:16px;white-space:nowrap;overflow:hidden}
.pvrow .pv{width:150px;flex:none}
.pvrow .pv .art{width:150px;height:210px;display:flex;flex-direction:column;justify-content:center}
.pvrow .pv u{display:block;text-decoration:none;margin-top:8px;text-align:center;font-size:var(--fs-micro);
  color:rgba(35,37,44,.55)}
/* ---- 卡片小样（示意，不是成品图）：只画"这一枚比那一枚高"这件事 ---- */
.art{box-shadow:0 6px 18px rgba(8,10,14,.14);position:relative;overflow:hidden;padding:22px 20px}
.art.jade{background:#FBF8F1;color:#17181C}
.art.jade .hd{display:flex;align-items:center;gap:7px;font-size:12px;letter-spacing:2px;color:rgba(23,24,28,.5)}
.art.jade .hd i{width:16px;height:16px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:10px;
  display:flex;align-items:center;justify-content:center;font-style:normal}
.art.jade h6{margin-top:18px;font-size:20px;line-height:1.3;font-weight:800;letter-spacing:-.4px}
.art.jade .ln{margin-top:12px;height:9px;border-radius:5px;background:rgba(23,24,28,.13)}
.art.jade .ln.w86{width:86%}.art.jade .ln.w72{width:72%}.art.jade .ln.w58{width:58%}
.art.jade .rule2{margin-top:20px;height:2px;background:rgba(23,24,28,.16)}
.art.jade .ft{position:absolute;left:20px;right:20px;bottom:18px;display:flex;align-items:flex-end;justify-content:space-between}
.art.jade .ft u{width:34px;height:34px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:15px;
  display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.jade .qr2{width:42px;height:42px;background:
  repeating-linear-gradient(0deg,#17181C 0 4px,transparent 4px 8px),
  repeating-linear-gradient(90deg,#17181C 0 4px,#FBF8F1 4px 8px);opacity:.75}
.art.verse{background:#FFFDF6;color:#17181C;display:flex;flex-direction:column;justify-content:center}
.art.verse em{font-style:normal;font-size:56px;line-height:.6;color:rgba(23,24,28,.22)}
.art.verse p{margin-top:14px;font-size:19px;line-height:1.5;font-weight:700;letter-spacing:-.3px}
.art.verse .sg{margin-top:20px;display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:2px;
  color:rgba(23,24,28,.5)}
.art.verse .sg u{width:26px;height:26px;border-radius:50%;background:#23252c;color:#F2EFE9;font-size:12px;
  display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.block{background:#EAF0EC;color:#22331F}
.art.block .k{font-size:13px;letter-spacing:2px;color:rgba(34,51,31,.55)}
.art.block h6{margin-top:14px;font-size:21px;line-height:1.28;font-weight:800}
.art.block .ln{margin-top:12px;height:9px;border-radius:5px;background:rgba(34,51,31,.16)}
.art.block .ln.w80{width:80%}.art.block .ln.w60{width:60%}
.art.acid{background:linear-gradient(150deg,${T[4].bg},${T[1].bg} 55%,${T[3].bg});color:#fff}
.art.acid h6{margin-top:6px;font-size:22px;line-height:1.26;font-weight:800}
.art.acid .k{font-size:12px;letter-spacing:3px;opacity:.8}
.art.pop{background:#fff;color:#17181C;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;
  gap:6px;padding:14px}
.art.pop div{border:3px solid #17181C;display:flex;align-items:center;justify-content:center;font-size:15px;
  font-weight:800;background:${T[0].bg}}
.art.pop div:nth-child(2){background:${T[2].bg}}
.art.pop div:nth-child(3){background:${T[1].bg};color:#fff}
.art.pop div:nth-child(4){background:#fff}
`

const status = (t) => `<div class="status"><span>${t}</span><span class="r">100 ▮</span></div>`
const capsule = `<div class="capsule"><span>•••</span><span>◎</span></div>`
const back = `<div class="back"><i></i></div>`
const cell = (id, cap, html) => `<div class="cell" id="${id}"><div class="ph">${html}</div><div class="cap">${cap}</div></div>`

/* 玉版宣 0.717 / 摘句 0.972：白垫里按宽贴合、竖向留白（v19 真跑量出来的两档） */
const R = { jade: 0.717, block: 0.717, acid: 0.717, verse: 0.972, pop: 1 }
const art = (kind, o, W) => {
  const w = W || 252, h = Math.round(w / R[kind])
  const st = `width:${w}px;height:${h}px`
  if (kind === 'verse') return `<div class="art verse" style="${st}"><em>“</em><p>${o && o.q}</p>
    <div class="sg"><u>麦</u><span>图麦笔记</span></div></div>`
  if (kind === 'block') return `<div class="art block" style="${st}"><div class="k">图麦笔记</div>
    <h6>${o && o.t}</h6><div class="ln"></div><div class="ln w80"></div><div class="ln w60"></div></div>`
  if (kind === 'acid') return `<div class="art acid" style="${st}"><div class="k">ACID</div><h6>${o && o.t}</h6></div>`
  if (kind === 'pop') return `<div class="art pop" style="${st}"><div>图</div><div>麦</div><div>笔</div><div>记</div></div>`
  return `<div class="art jade" style="${st}">
    <div class="hd"><i>麦</i><span>图麦笔记</span></div><h6>${o && o.t}</h6>
    <div class="rule2"></div><div class="ln"></div><div class="ln w86"></div><div class="ln w72"></div><div class="ln w58"></div>
    <div class="ft"><u>麦</u><div class="qr2"></div></div></div>`
}
/* 真机上这一格画的是 cardLog 里那张 jpg；示意图按同一比例摆进白垫（340×474 那一档的缩版） */
const thumb = (kind, o) => `<div class="pad">${art(kind, o)}</div>
  ${o && o.n > 1 ? `<div class="pg"><u class="l"></u><b>${o.i || 1}/${o.n}</b><u class="r"></u></div>` : ''}`

/* 一小块分类色（与这一屏左上那枚点、列表那枚点同一个来源）+ 中间一枚 + 号 + 两行小字 */
const abstract = `<div class="empty">
  <div class="swatch" style="background:${T[0].bg};color:${T[0].ink}">+</div>
  <div class="e1">${S.gen}</div><div class="e2">还没有生成过卡片</div></div>`

const NOTE = {
  cat: '公众号文章 · 09/25', t: '2026年中秋节祝福语与问候图片大全',
  tags: ['中秋节', '祝福语', '问候图片'],
  sum: '本文汇集了2026年中秋节的诸多温馨祝福语，配合最美问候图片，传达花好月圆、阖家团圆的美好祝愿。内容以月圆人安、平安喜乐、岁岁圆满为核心，适合向亲友表达中秋问候。',
  pts: ['提供18张2026年9月25日中秋节最美祝福问候图', '中秋祝福核心为花好月圆、月圆人圆、平安喜乐', '多条祝福语强调阖家安康、家人闲坐、灯火可亲', '借明月与秋风寄寓思念，愿所有牵挂皆有回响'],
  link: 'https://mp.weixin.qq.com/s/Qh7VdLm2pXw9Rt4Yc',
}
/* 正文起点跟着"左右谁更高"走：有缩略图那一版右格 390 + 页码 → 646；
   只有小色块那一版左列（标题+标签）更高 → 抬到 500，中间不留一条空带。 */
const body = (top) => `<div class="dbody" style="top:${top || 646}px">` + bodyHtml() + '</div>'
function bodyHtml() { return `
  <div class="lab">${S.summary}</div><p>${NOTE.sum}</p>
  <div class="lab">${S.points}</div>
  ${NOTE.pts.map((p) => `<div class="pt"><i></i><span>${p}</span></div>`).join('')}
  <div class="lab">${S.srcLink}</div><div class="link">${NOTE.link}</div>
  <div class="lnote">${NEW.linkNote}</div>
  <div class="orig"><div class="lab" style="margin-top:34px">${S.orig}</div><div class="sw">${S.expand} ⌄</div></div>
` }
const dock = () => `<div class="dock"><div class="rule" style="margin-bottom:20px"></div>
  <div class="irow"><b>${S.edit}</b><b class="d">${S.del}</b></div>
  <div class="pub"><span>${S.pub}</span><s>${S.revoke}</s></div></div>`
const heroLeft = () => `<div class="lt"><div class="cat"><i></i><span>${NOTE.cat}</span></div>
  <h2>${NOTE.t}</h2>
  <div class="tags">${NOTE.tags.map((x) => `<u>${x}</u>`).join('')}</div></div>`
const detailPage = (right, top) => `<div class="page">${status('11:06')}${capsule}${back}
  <div class="hero">${heroLeft()}<div class="rt">${right}</div></div>${body(top)}${dock()}</div>`

/* 小弹窗：外壳照密码那一层；四个位置 + 昵称 + 一句话；一次填完，下次读回来 */
const mini = (discs, vals) => `<div class="mask"><div class="mini">
  <div class="nm">${NEW.info}</div>
  <div class="sc">${vals.full ? S.slotHintFull : NEW.sheetHint}</div>
  <div class="d4">${discs}</div>
  <div class="fld"><div class="fl">${S.name}</div>
    <div class="box${vals.name ? '' : ' plc'}">${vals.name || S.namePh}</div></div>
  <div class="fld"><div class="fl">${S.slogan}</div>
    <div class="box${vals.slogan ? '' : ' plc'}">${vals.slogan || S.sloganPh}</div></div>
  <div class="acts"><b class="g">${S.cancel}</b><b class="p">${vals.full ? NEW.upload : S.ok}</b></div>
</div></div>`
const FACE = '../../../miniprogram/assets/home-bg-portrait.jpg'
const discEmpty = (n) => `<div class="sl"><div class="disc"><span class="plus">+</span></div><div class="cap2">${n}</div></div>`
const discFull = (n, picking) => `<div class="sl${picking ? ' picking' : ''}"><div class="disc">
    <img src="${FACE}" style="object-position:50% 12%">
    <span class="rep">${NEW.replace}</span></div><span class="x">×</span><div class="cap2">${n}</div></div>`

/* 成品弹窗：现网那一层，只把十枚小圆点换成三张可见的封面墙 + 一行「卡片上的信息」 */
const sheet = (withInfo) => `<div class="sheet">
  <div class="grip"><span class="l">${S.swipe}</span><div class="bar"></div><span class="r">${S.grip}</span></div>
  <div class="midwrap">
  <div class="flow">
    <div class="t side l">${art('acid', { t: '花好月圆' }, 296)}</div>
    <div class="t mid">${art('jade', { t: NOTE.t.slice(0, 14) + '…' }, 316)}</div>
    <div class="t side r">${art('block', { t: '月圆人安' }, 296)}</div>
    <div class="nm">玉版宣 · 3/10</div>
  </div>
  ${withInfo ? `<div class="info"><div class="av"><img src="${FACE}" style="object-position:50% 12%"></div>
    <div class="tx"><b>平安喜乐</b><u>月圆人安，岁岁圆满</u></div><i class="go"></i></div>` : ''}
  </div>
  <div class="dockp">
    <div class="qr"><div class="pill on"><i></i></div><div class="tx"><b>${S.qr}</b><u>${S.qrHint}</u></div></div>
    <div class="trow"><b class="g">${S.cancel}</b><b class="p">${S.share}</b></div>
  </div></div>`

const SCREENS = [
  ['s1', `<b>① 详情改成一整屏</b>（附件一那种左右关系）：左上角<span class="tag new">新画</span>一枚返回键，<b>右上那一格是这篇笔记的卡片缩略图</b>，多张时图下面挂一行小字 <code>‹ 1/3 ›</code>（左右各一次点击，读的就是本机那份卡片台账，与「笔记卡片」那一格同一本账）；<b>标题在左</b>（38/800 = 现网 <code>.ds-h2</code>，四行截断），<b>正文在下方整块铺开</b>。<br>字号与颜色<span class="tag">照列表</span>：前景 <code>rgba(35,37,44,.9)</code>、正文 <code>.7</code>、分区头 20/800 字距 1.6（现网 <code>.ds-lab</code> 那档）。<span class="tag cut">撤</span>列表点「显示更多」开的那层全文浮窗——直接进这一屏。<br><b>这一稿跟了你三条改口里的两条</b>：要点前面那枚<span class="tag cut">撤</span>现网 38 见方的带圈数字徽，改成<b>头部 Tips 前面那种 14 实心小黄点</b>（同一个 <code>palette.TIP_DOT</code>、与那枚点同一个数）——代价是<b>序号不再显示</b>，要留序号就得在文字前挂一个"1."，你说一声就加；来源链接下面加一行小字注明<span class="tag new">新串</span>「${NEW.linkNote}」（你的原话）。<br>⚠️ <b>这一行可能是多余的</b>：官方类型定义里有一条 <code>wx.openOfficialAccountArticle</code>，原文写"<b>通过小程序打开任意公众号文章</b>…必须有点击行为才能调用成功"，门槛是<b>基础库 3.4.8</b>（开发工具这边跑的是 <code>3.17.3</code>，见 <code>project.private.config.json</code>，够得上；线上「最低基础库版本」在后台设置里，仓库里查不到，真机验之前顺手后台瞄一眼）。也就是说 <code>mp.weixin.qq.com</code> 这种链接<b>有机会一点就开</b>，不用复制——但这条<b>模拟器点不出来，只有真机能判</b>。所以这一稿先按你说的画（注明打不开）；真机验通之后，这一行小字换成「点击打开原文」，那枚链接从"长按复制"改成"一点就开"。<br>⚠️ 这一屏走 <code>navigationStyle: custom</code>（否则左上那枚返回键是系统的、位置不由我们定），代价是<b>微信胶囊仍钉在右上角（右 24、上 116、174×46）</b>，所以右上那一格必须从胶囊下面起（这稿落在 top 200）。`, detailPage(thumb('jade', { t: '2026年中秋节祝福语…', n: 3, i: 1 }))],
  ['s2', `<b>② 这篇一张卡片都没有</b>：右上那一格改成<b>一小块 132 见方的色块 + 中间一枚 + 号 + 两行小字</b>（第一行「${S.gen}」现网 <code>shareAsImage</code> 原串，第二行「还没有生成过卡片」现网 <code>noCards</code> 原串）。<span class="tag cut">撤</span>首版那一整块抽象色块——你的原话"太花哨、与整体简约文艺不搭"。<br>色块<b>吃这篇笔记分类那一支</b>（与这一屏左上那枚点、列表那枚点同一个来源 <code>palette.catSkinFor</code>），<b>不新造一支色</b>；+ 号用同一支的 <code>ink</code>。嫌艳就统一退成 <code>--chip-idle</code> 灰底 + 墨色 + 号，一处改完。点色块或那行字才出成品弹窗（屏⑤）。<br>底部那一排<span class="tag cut">撤</span>「生成笔记卡片」那枚：入口挪到右上这一格之后，同一件事不再有两个把手（剩 编辑／删除 + 公开状态那一行，都是现网原样）。右上这一格<b>没有 <code>‹ 1/3 ›</code></b>——一张都没有，页码不画。`, detailPage(abstract, 500)],
  ['s3', `<b>③ 统一的那枚小弹窗</b>（站长：大小照输入密码那一层）——外壳逐寸抄 <code>me.wxss</code>：<code>.pwd-mask</code> 遮罩 <code>rgba(20,20,28,.55)</code> + 顶 180、<code>.pwd-card</code> 宽 <b>620</b>、圆角 40、白底描边。<br>里面三样东西一次填完：<b>四个位置的配图</b>（卡内净宽 556 = <b>4×124 + 3×20</b>，一排放满不滚；空着的那枚就是<b>圆形 + 号</b>）、<b>名称</b>、<b>一句话</b>（现网 <code>profileName</code>／<code>profileSlogan</code> 两串，占位字照抄）。<br>下面一行两枚左退出右动作（密码那层的同一条口径，右按钮这两个字「确定」是现网 <code>privatePasswordOk</code> 原串）。<span class="tag new">新串</span>两处：标题「${NEW.info}」与格子上方那一句。<b>那一句没有照搬现网 <code>slotHint</code></b>——现网那句讲的是"图下面两枚开关（卡片／背景）"，而<b>开关只留在「我的→卡片模板」那一页</b>，小弹窗里不画，照搬就是骗人（要不要把开关也搬进来，见文末第二条）。`, detailPage(abstract, 500) + mini([1, 2, 3, 4].map((i) => discEmpty('位置 ' + i)).join(''), { full: false, name: '', slogan: '' })],
  ['s4', `<b>④ 填过之后再打开</b>：三样都<b>把上次的读回来</b>（名称、一句话回填；有图那枚显示<span class="tag new">新串</span>「${NEW.replace}」压在图下沿）。<br><b>四个位置都满了还要再传</b>（站长第 3 条）：不自动顶替——这一屏让他<b>先挑一格删</b>，四枚右上角各挂一枚垃圾桶，<b>画法与「我的→卡片模板」那页现网那枚逐寸相同</b>（深色圆 + ×，34 见方、出格 2），所以现网那句"点右上角的垃圾桶"<b>不用改口</b>；被挑中那枚再描一圈黄（<code>TONES[0]</code>），删掉之后那一格退回 + 号、右按钮变「上传」。<br>两个输入框<b>高度压一档</b>：现网 <code>.field-input</code> 是 <code>--fs-title 31</code> + 与标签间距 16，这稿压到 <code>--fs-body 28</code> + 间距 8（占位字跟着降，与新建页那条录入框同一档）。`, detailPage(thumb('jade', { t: '2026年中秋节祝福语…', n: 1 })) + mini(
      [discFull('卡片', false), discFull('背景', false), discFull('位置 3', true), discFull('位置 4', false)].join(''),
      { full: true, name: '平安喜乐', slogan: '月圆人安，岁岁圆满' })],
  ['s5', `<b>⑤ 成品弹窗</b>：外壳、位置、把手那两句、带二维码、取消／保存并分享<b>全是现网那一层</b>（<code>.float-sheet</code> 左右 24、上 130、下 152、纸白 <code>#FCFBF8</code>、背后不垫遮罩）。<br>只换两处：<b>一</b> <span class="tag cut">撤</span>那排十枚小圆点 → 改成<b>同时最多看到三张</b>的封面墙（附件三那种）：中间是当前模板的成品图（<code>posterW×posterH</code> 那一档，这稿 340×474），左右各露出一截待选、左右滑走十套；<b>首版那两枚你看不见，根因查清了</b>：左右两枚也画成米白底、又压了 <code>opacity:.5</code>，落在纸白弹窗（<code>#FCFBF8</code>）上等于没画——这版左右各让出 <b>181</b>（原来 137）、透明度抬到 <b>.85</b>、补一道描边，并且左右换成<b>有颜色的那两套</b>（荧光渐变／叠翠），中间留米白那套，三张一眼分得开；<b>二</b> 封面墙下面加一行<span class="tag new">新串</span>「${NEW.info}」——头像 + 当前昵称 + 当前一句话，点它就拉起屏③④那枚小弹窗（<b>这就是"不用跑去我的里面设置"那一条的落点</b>）。`, detailPage(thumb('jade', { t: '2026年中秋节祝福语…', n: 3, i: 1 })) + sheet(true)],
  ['s6', `<b>⑥ 「我的」→「卡片模板」跟着改两处</b>（这一页留着，不是被小弹窗替掉——它多两样小弹窗没有的：每枚图下面的<b>「卡片」／「背景」两枚开关</b>和右上角的<b>垃圾桶</b>）：<br><b>一</b> 四个位置<b>改小、一行排满、不再横滑</b>——现网是 <code>.disc</code> 200×200 装在 <code>scroll-view</code> 里左右滑（1.8.9 定的），这稿跟小弹窗统一成<b>一枚 124</b>（卡内净宽 638 = 4×124 + 3×24，居中左右各余 35），<span class="tag cut">撤</span>那条 <code>scroll-x</code>；<b>二</b> 名称／一句话两个框<b>压高度</b>（同屏④那两处数）。<br><b>这一页与那枚小弹窗读同一份数据</b>（<code>poster.readSlots()</code> + <code>name</code>／<code>slogan</code>），改哪一处另一边都跟着变，不建第二份。`, `<div class="page">${status('11:06')}<div class="nav">图麦笔记${capsule}</div><div class="wrap">
    <div class="card"><div class="s4">${[discFull2('on', ''), discFull2('', 'on'), discEmpty2(), discEmpty2()].join('')}</div>
      <div class="hint">${S.slotHint}</div></div>
    <div class="card"><div class="fld2"><div class="fl">${S.name}</div><div class="box">平安喜乐</div></div></div>
    <div class="card"><div class="fld2"><div class="fl">${S.slogan}</div><div class="box">月圆人安，岁岁圆满</div></div></div>
    <div class="save">${S.save}</div>
    <div class="pvhead">${S.preview}</div>
    <div class="pvrow">${[['jade', '玉版宣'], ['verse', '摘句'], ['block', '叠翠'], ['acid', '荧光渐变']].map(([k, n]) =>
      `<div class="pv"><div class="art ${k}">${pvInner(k)}</div><u>${n}</u></div>`).join('')}</div>
  </div></div>`],
]

function discFull2(cardOn, bgOn) {
  return `<div class="sl"><div class="disc"><img src="${FACE}" style="object-position:50% 12%"></div>
    <span class="bin">×</span><div class="chips"><u class="${cardOn ? 'on' : ''}">${S.card}</u>
    <u class="${bgOn ? 'on' : ''}">${S.bg}</u></div></div>`
}
function discEmpty2() { return `<div class="sl"><div class="disc"><span class="plus">+</span></div></div>` }
function pvInner(k) {
  return k === 'verse' ? '<em style="font-size:34px">“</em>'
    : k === 'block' ? '<div class="k">图麦笔记</div><h6 style="font-size:15px">花好月圆</h6>'
    : k === 'acid' ? '<div class="k">ACID</div><h6 style="font-size:15px">花好月圆</h6>'
    : '<div class="hd" style="font-size:9px"><i>麦</i><span>图麦笔记</span></div><h6 style="font-size:14px;margin-top:10px">花好月圆</h6>'
}

const PRE = `<h2 style="font-size:26px;margin:14px 0 10px">这一稿撤掉的、新造的，以及三处要你认</h2>
<p class="lead"><span class="tag cut">撤</span><b>首版那一整块抽象色块</b>（太花哨，改一小块分类色 + 号）、<b>要点前面那枚 38 见方的带圈数字徽</b>（换 Tips 那种 14 小黄点）、<b>列表点「显示更多」开的那层全文浮窗</b>（改成整屏页）、<b>详情底排那枚「生成笔记卡片」</b>（入口挪到右上那一格，一个功能不留两个把手）、<b>成品弹窗里那排十枚小圆点</b>（换三张可见的封面墙）、<b>「我的→卡片模板」那排横滑</b>（四个位置改小、一行排满）。<br>
<span class="tag.new">新串</span>一共四串：<b>「${NEW.info}」</b>（成品弹窗里那一行入口的名字，也是那枚小弹窗的标题——同一个东西一个名字）、<b>「${NEW.replace}」</b>（有图那枚压在图下沿的两个字）、<b>「${NEW.upload}」</b>（四格已满、删完一格之后右按钮那两个字）、<b>「${NEW.linkNote}」</b>（来源链接下面那行小字，你的原话）。<b>「四个位置都放满了，先删一张再传」那句不用新造</b>——现网 <code>slotHintFull</code> 早就这么写着；<b>「还没有生成过卡片」</b>也是现网 <code>noCards</code> 原串。<br>
<b>数据这一轮不用动后端</b>：配图走 <code>poster.readSlots()</code>（本机），名称／一句话走 <code>profile</code> 那两格（现网 <code>PUT</code> 已通），右上那几张卡片走 1.9.13 那份本机台账 <code>cardLog.forNote(noteId)</code>（已按 <code>at</code> 倒序，第一张就是最近留下的）。<b>微信头像昵称那套先不对接</b>（站长 10-03 定的）——所以小弹窗里三样全是要用户自己填／选的，没有"一键带出微信资料"那枚按钮，那两格也就不会凭空多出内容。</p>
<p class="lead" style="margin-top:14px">三处要你认：<b>一</b> 这一屏要走 <code>navigationStyle: custom</code>（左上返回键才是我们画的那枚），而<b>微信胶囊右上角撤不掉</b>——所以右上那一格卡片只能从胶囊下面起（这稿顶到 200），标题区因此比附件一矮一截；不接受就把返回键交回系统、这一屏留原生导航条。<b>二</b> 小弹窗里那四枚<b>不带「卡片／背景」两枚开关</b>（角色只在「我的→卡片模板」那页设），要不要把开关也搬进小弹窗、让它成为唯一一处设置口？<b>三</b> 屏⑤那行「${NEW.info}」我放在<b>封面墙和带二维码之间</b>（它是"改内容"，模板是"选样子"，两者不同档）；你要是想让它贴着大图，说一声挪。</p>`

fs.writeFileSync(path.join(DIR, 'v20-详情全屏与卡片元素.html'), `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>v20 · 详情全屏 + 统一卡片元素小弹窗</title><style>${CSS}</style></head><body>
<h1>v20 · 详情改成一整屏，卡片上要的三样收进一枚小弹窗（示意，代码一行没动）</h1>
<p class="lead">六屏：<b>1</b> 详情全屏·已有卡片（右上缩略图 + <code>‹ 1/3 ›</code>）｜<b>2</b> 详情全屏·一张都没有（右上那一格＝一小块分类色 + 中间 + 号 + 两行小字）｜<b>3</b> 小弹窗·第一次（四个位置空、两个框空）｜<b>4</b> 小弹窗·填过（上次的读回来；四格已满 → 先挑一格删）｜<b>5</b> 成品弹窗（十枚小圆点换三张可见的封面墙 + 一行「${NEW.info}」）｜<b>6</b> 「我的→卡片模板」（四枚改小不滚 + 两个框压高度）。<br>
屏高 <code>750×1670</code>（1px = 1rpx），令牌逐字抄 <code>app.wxss</code> 的 <code>theme-default</code>；小弹窗那一层照 <code>me.wxss</code> 的 <code>.pwd-mask</code>／<code>.pwd-card</code>（620 宽、顶 180、遮罩 .55）；成品弹窗照 <code>index.wxss</code> 的 <code>.float-sheet</code>；卡片比例吃真跑量出来的 0.717／0.972；色块只出自 <code>palette.TONES</code>。<span class="tag">现网</span>那句在 <code>utils/i18n.js</code> 里逐字对过；<span class="tag.new">新串</span>这轮新造的；<span class="tag cut">撤</span>这轮删掉的。</p>
${[0, 2, 4].map((i) => `<div class="row">${SCREENS.slice(i, i + 2).map(([id, cap, html]) => cell(id, cap, html)).join('')}</div>`).join('')}
${PRE}
</body></html>`)

for (const [id, , html] of SCREENS) {
  fs.writeFileSync(path.join(DIR, `.薄页-${id}.html`), `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
body{padding:0;background:#fff}.ph{border-radius:0;outline:none}</style></head>
<body><div class="ph">${html}</div></body></html>`)
}
console.log(`ok → v20-详情全屏与卡片元素.html（${SCREENS.length} 屏，另有 .薄页-sN.html 供截图，截完可删）`)
