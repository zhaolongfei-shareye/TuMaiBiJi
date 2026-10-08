// v26 效果图：明度退回 v24 那一档（L16，不再压暗），只往"粉"上加。
// 跑法：node docs/design/10-08列表与详情两方案/画-v26.mjs
//
// 上一轮他原话是"明度太高，要降低，颜色不能喧宾夺主，要偏粉一点"，我照字面把明度从 L16 压到 L13、
// 又把饱和从 S29 降到 S15，结果出来的是一支近黑带一点粉——他要的是粉，不是暗。这一版：
//   明度回到 L16（与 v24 那四档同深，等于没加深）；饱和与色相沿粉那一族往上加，给四档阶梯让他指；
//   四套壁纸仍共用一支（"不能喧宾夺主"这半句还成立），底栏仍跟壁纸走 chromeOf(key)。
//
// 口径仍然全部现读：字号／圆角／描边宽 = app.wxss 的 page{}；底栏 = palette.chromeOf(key)；
// 界面话 = utils/i18n.js 的 zh 键（缺键就停）；模板名 = utils/poster.js 的 templateLabel；
// 只有"深底这一支"是本稿提的新值，所以它上面压的每处字都进实测表算对比。
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { execFileSync, spawnSync } from 'child_process'

const require = createRequire(import.meta.url)
const DIR = path.dirname(fileURLToPath(import.meta.url))
const MP = path.join(DIR, '../../..', 'miniprogram')
const palette = require(path.join(MP, 'utils/palette.js'))
const i18n = require(path.join(MP, 'utils/i18n.js'))
const poster = require(path.join(MP, 'utils/poster.js'))

const ZH = i18n.texts('zh')
const T = (k) => {
  if (!(k in ZH)) throw new Error(`i18n 里没有键 ${k} —— 屏上不许出现字典外的界面话`)
  return ZH[k]
}

/* ---- 令牌：从 app.wxss 的 page{} 现读，脚本里写的每一个数都要与它相等 ---- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
const PAGE = APP.slice(APP.indexOf('page{') >= 0 ? APP.indexOf('page{') : APP.indexOf('page {'))
const tok = {}
for (const m of PAGE.slice(0, PAGE.indexOf('}') ).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) tok[m[1]] = m[2].trim()
const need = ['--fs-h1', '--fs-h2', '--fs-title', '--fs-body', '--fs-meta', '--fs-tiny', '--fs-label', '--fs-micro',
  '--sp-2', '--sp-3', '--sp-4', '--r-card', '--r-block', '--r-chip', '--r-pill', '--w-edge']
need.forEach((k) => { if (!tok[k]) throw new Error(`app.wxss 的 page{} 里读不到 ${k}，这份稿子的尺子来源变了，先去核 app.wxss`) })
const TOKEN_KEYS = need.concat(['--bg-page', '--bg-card', '--text-primary', '--text-secondary', '--text-tertiary', '--card-edge', '--accent'])
// rpx 一律换成 px：浏览器不认 rpx，留着会让每一条吃 var(--fs-*)／var(--w-edge) 的声明整条失效
// （字号退回默认、那条 3rpx 的边直接没画——上一版就是靠"计算样式断言"抓到这件事的）
const rpx2px = (v) => v.replace(/rpx\b/g, 'px')
const TOKENS = TOKEN_KEYS.map((k) => `${k}:${rpx2px(tok[k])}`).join(';')


/* ---- 三支点：深色面 / 白内框 / 固定橙 ---- */
// CREATE_SURFACE 没从 palette.js 导出，所以从它的源码里现读那一行（读不到就停，不给自己留兜底成写死的路）
const PAL = fs.readFileSync(path.join(MP, 'utils/palette.js'), 'utf8')
const SURF = /CREATE_SURFACE\s*=\s*\{([^}]+)\}/.exec(PAL)
if (!SURF) throw new Error('palette.js 里读不到 CREATE_SURFACE，深色那一档的出处变了')
const surf = {}
for (const m of SURF[1].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) surf[m[1]] = m[2]
const DK = surf.panel, DK_CARD = surf.card, DK_FIELD = surf.field
const PAPER = '#F2EFE9'
const WHITE = '#FFFFFF'
const CAM = '#E9723D'      // 拍照那枚大圆（正本 v7 写死的那支）
const CAM_INK = '#2C1204'  // 压在橙上的深字
const EXT = '#C4541F'      // 右滑提炼那一枚与进度
// 实测：#C4541F 配现网那支纸白 #F2EFE9 只有 3.95，不过 4.5；同一支橙换纯白 #FFFFFF 是 4.53。
// 所以这一稿保住他点名的那支橙，只把那枚条上的字改成纯白（要留纸白就得把橙深到 #B84A19，那是另一种改法）。
const EXT_INK = '#FFFFFF'
const EDGE_ON_DK = 'rgba(242,239,233,.10)'   // 暗面上那一圈边（create.wxss 的 --cp-edge-10）
const I90 = 'rgba(35,37,44,.9)'
const I70 = 'rgba(35,37,44,.7)'
const TIP = palette.TIP_DOT
const CH = palette.chromeOf('tint-paper')
/* v25 的全部新东西在这儿：深底不再跟着壁纸跑四支，收成一支粉调深墨，三档明度给他挑。
   三支都是同一个色相族（H348~351），只差明度与那一点点饱和。 */
const THEMES = palette.THEMES
const themeOf = (key) => {
  const t = THEMES.find((x) => x.key === key)
  if (!t) throw new Error('palette.js 里没有这套壁纸：' + key)
  return t
}
const PINKS = [
  { n: '淡粉', hex: '#322027', hsl: 'H335 S22 L16' },
  { n: '同樱落', hex: '#341E25', hsl: 'H340 S27 L16' },
  { n: '本版', hex: '#361C22', hsl: 'H345 S32 L16' },
  { n: '最粉', hex: '#381A1F', hsl: 'H350 S37 L16' },
]
const PINK = PINKS[2].hex   // 本版＝第三档：粉得看得出来，明度与 v24 同档（没加深）
const phStyle = (key, dk) => `--dk:${dk || PINK};${palette.chromeOf(key).style}`
const PH0 = phStyle('tint-paper')   // 不特别指明的屏，一律走本版那支粉墨
const FONT = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]

/* 半透明墨字压在白上要先算成实心才谈对比（PIL 那条同款坑：alpha 不落地就是假数） */
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (fg, a, bg) => {
  const f = hex2rgb(fg), b = hex2rgb(bg)
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}
const cr = (a, b) => Number(palette.crOf(a, b).toFixed(2))
const rgbOf = (h) => 'rgb(' + hex2rgb(h).join(', ') + ')'   // 屏上算出来就是这个形状，别手写
const DEEP = PINK                          // 全稿唯一那支深底
const IDLE = 0.55                          // 深底上"未选／次要"那一档的纸白比例（.5 在象牙与天青上只有 4.1~4.18，不过 4.5）
const DANGER_ON_DK = '#ee8277'             // 删除那枚红：v23 的 #e57368 压带色深底只剩 4.41，这一档压粉墨是 6.39
const CONTRAST = [
  ['白内框上的标题', mix('#23252C', 0.9, WHITE), WHITE, 4.5],
  ['白内框上的摘要', mix('#23252C', 0.7, WHITE), WHITE, 4.5],
  ['白内框上的三级字', mix('#23252C', 0.5, WHITE), WHITE, 3.0],
  ['深底上的纸白字（标题、选中那枚）', mix(PAPER, 0.92, DEEP), DEEP, 4.5],
  ['深底上未选那一档', mix(PAPER, IDLE, DEEP), DEEP, 4.5],
  ['深底上卡片名那一档', mix(PAPER, 0.82, DEEP), DEEP, 4.5],
  ['深底上入口格第二行', mix(PAPER, IDLE, DEEP), DEEP, 4.5],
  ['白内框压在这档深底上（分得开吗）', WHITE, DEEP, 3.0],
  ['那条 3rpx 纸白边（分隔用，不算字）', mix(PAPER, 0.10, DEEP), DEEP, 1.2],
  ['拍照橙配深字', CAM_INK, CAM, 4.5],
  ['提炼橙配纸白', EXT_INK, EXT, 4.5],
  ['主按钮（提炼橙）配纸白', EXT_INK, EXT, 4.5],
  ['拍照橙压在白内框上（图形档）', CAM, WHITE, 3.0],
  ['拍照橙压在深底上（开关、图形档）', CAM, DEEP, 3.0],
  ['提炼橙压在白内框上（图形档）', EXT, WHITE, 3.0],
  // 提炼橙直接压深底不过 3.0（象牙 2.97／天青 2.93），所以本版把开关那枚改吃拍照橙；
  // 那两支数值写进说明里，不当成一条红判据（这一版屏上已经没有那一种放法）。
  ['删除（白内框那档，现网原值）', '#b4231f', WHITE, 4.5],
  ['删除（深底这档，本版新定）', DANGER_ON_DK, DEEP, 4.5],
  // 四套壁纸各算一遍：换色相不能只算象牙那一档
  // 深底四套共用一支，所以"按套"只剩这一题：它跟各自那枚底栏还分不分得开
  ...THEMES.map((t) => [t.label + '：这支粉墨与该套底栏分得开吗',
    PINK, palette.chromeOf(t.key).bg, 1.1]),
  // 阶梯那三档同族只差明度，每档都得自己算一遍，不能拿"本版"那档的数糊过去
  ...PINKS.map((k) => ['阶梯 ' + k.n + ' ' + k.hex + '：未选那一档压得住吗',
    mix(PAPER, IDLE, k.hex), k.hex, 4.5]),
  ...PINKS.map((k) => ['阶梯 ' + k.n + '：白内框与它分得开吗', WHITE, k.hex, 3.0]),
]

// 对比在 Node 这边算完再递给页面（页面里没有 palette.crOf，别在稿子脚本里现调）
const CONTRAST_ROWS = CONTRAST.map(([name, fg, bg, min]) => {
  const v = cr(fg, bg)
  return [name, fg, bg, min, v, v >= min ? 'ok' : 'bad']
})

const TOKEN_COUNT = TOKEN_KEYS.length

/* ---- 样本内容（用户内容不是界面话，沿用 v19 那一组，他已看过） ---- */
const CATS = ['全部', '旅游', '生活', '私密']
const ROWS = [
  { d: '10/02', t: 'Qwen3.8-Flash 限时免费，国际版先装上试一圈', more: true,
    s: '这一版把上下文一次拉到 256K，个人档限时免费到十一月底。换渠道只需重装一次，历史会话能整体带走。' },
  { d: '10/02', t: '周末去顺义那家旧书店，门口贴着写', more: true, who: '阿麦的读书笔记',
    s: '三十平的小店按年代排架，九五品的文学类占了一半。老板建议工作日下午去，那时光线斜着进来。' },
  { d: '10/01', t: '素宣信笺这一套试的那三种竖排行距', more: false,
    s: '行距 1.9 最舒服，1.6 会挤；列宽 26 字时标点落到行尾不刺眼。' },
  { d: '09/28', t: '把长文读成三条要点，设一个每天归档的提醒', more: true,
    s: '先摘句子，再问一句"这段在解决什么"，最后用自己的话写一遍。三条要点控制在两行以内。' },
]
const TIPS = ['拍照或截图存进来，会自动提炼成要点']
const SUM = '这一版把上下文一次拉到 256K，个人档限时免费到十一月底。换渠道只需重装一次，历史会话能整体带走；拿十篇长文一次喂进去，没报错也没截断。'
const PTS = ['上下文一次拉到 256K，十篇长文一起喂没截断', '换渠道只需重装一次，历史会话整体带走', '个人档限时免费到十一月底，先装上试一圈']
const ORIG = '上午把国际版装上，拿手头那十篇长文一次喂进去。第一遍没报错，也没截断；第二遍特意挑了最长那篇，进度条走完是完整的。翻设置里那一档上下文长度，已经写到 256K。历史会话能整体带走，这一点对日常影响最大——原来攒的那几十条不用重录。'

/* ---- 卡片小样（示意，不是成品图）：只画"这一枚比那一枚高" ---- */
const PAD_W = 340, PAD_H = 474, IN = 14
const fit = (r) => {
  let w = PAD_W - IN * 2, h = Math.round(w / r)
  if (h > PAD_H - IN * 2) { h = PAD_H - IN * 2; w = Math.round(h * r) }
  return [w, h]
}
const jade = (t) => { const [w, h] = fit(0.717)
  return `<div class="art jade" style="width:${w}px;height:${h}px">
    <div class="hd"><i>麦</i><span>${T('appName')}</span></div><h6>${t}</h6><div class="rule"></div>
    <div class="ln"></div><div class="ln w86"></div><div class="ln w72"></div><div class="ln w58"></div>
    <div class="ft"><u>麦</u><div class="qr"></div></div></div>` }
const verse = (q, dk) => { const [w, h] = fit(0.972)
  return `<div class="art verse${dk ? ' dk' : ''}" style="width:${w}px;height:${h}px">
    <em>“</em><p>${q}</p><div class="sg"><u>麦</u><span>${T('appName')}</span></div></div>` }
const CELLS = [
  { art: jade('Qwen3.8-Flash 限时免费'), t: 'Qwen3.8-Flash 限时免费，国际版先装上试一圈' },
  { art: verse('行距 1.9 最舒服，1.6 会挤。'), t: '素宣信笺这一套试的那三种竖排行距' },
  { art: jade('把长文读成三条要点'), t: '把长文读成三条要点，设一个每天归档的提醒' },
  { art: verse('三句里塞了七个动词。', true), t: '棋王里那一段吃的动词密度太高了' },
]
// 模板 id 用 utils/poster.js 里真实那四个键（玉版宣的 id 是 card，不是画函数那个 jade —— 写错时屏上那格标签是空的，实测表量到 0 宽当场报红）
const TPLS = ['card', 'quote', 'block', 'lit'].map((id) => ({
  id, name: poster.templateLabel(id, 'zh'),
  art: (id === 'card' || id === 'block') ? jade('把长文读成三条要点') : verse('行距 1.9 最舒服，1.6 会挤。', id === 'lit'),
}))


/* ============================ CSS ============================ */
const CSS = `
@font-face{font-family:'WtsjMind';src:url(data:font/ttf;base64,${FONT}) format('truetype');font-weight:100;font-style:normal}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:#DCDAD4;font-family:'PingFang SC','Helvetica Neue',sans-serif;color:#23252c;padding:48px 40px 64px}
h1{font-size:34px;letter-spacing:-.6px;margin-bottom:10px}
h1 i{display:inline-block;width:4px;height:22px;border-radius:2px;background:${CAM};vertical-align:-2px;margin-right:12px}
.lead{font-size:16px;line-height:1.75;color:#4a4f47;max-width:1700px;margin-bottom:12px}
.lead code{background:#fff;padding:2px 7px;border-radius:5px;font-size:15px}
.lead b{color:#23252c}
.row{display:flex;gap:34px;align-items:flex-start;flex-wrap:nowrap;margin:0 0 46px}
.plan{margin:0 0 26px;padding-top:26px;border-top:2px solid rgba(35,37,44,.14)}
.plan .pt{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.plan .k{font-size:14px;font-weight:800;letter-spacing:3px;color:${CAM}}
.plan .t{font-size:26px;font-weight:800;letter-spacing:-.4px}
/* 类名不许用 .d：现网那枚危险态按钮就叫 b.d，撞上一次就把整排撑破（10-08 实测踩过） */
.plan .desc{font-size:15px;color:#5c6068;line-height:1.6;flex:1;min-width:420px}
.cell{width:750px;flex:none}
.cap{font-size:15px;line-height:1.7;color:#4a4f47;margin-top:12px}
.cap b{color:#23252c}
.cap code{background:#fff;padding:1px 6px;border-radius:5px;font-size:14px}
.tag{display:inline-block;font-size:13px;padding:2px 8px;border-radius:999px;background:#23252c;color:${PAPER};margin-right:6px;vertical-align:2px}
.tag.orange{background:${CAM};color:${CAM_INK}}
.tag.cut{background:#b4231f;color:#fff}

/* 手机框：750×1670 = 1px:1rpx；令牌从 app.wxss 现读那份贴进来（上面已逐条核对） */
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;outline:2px solid #B9B6AF;
  background:${'var(--bg-page)'};color:#23252c;
  ${TOKENS};--dk:${PINK};--w:${WHITE};--cam:${CAM};--ext:${EXT}}
:root{${TOKENS}}
.status{height:94px;display:flex;align-items:center;justify-content:space-between;padding:0 44px;
  font-size:26px;font-weight:600;color:#fff;background:#181A20}
.status .r{font-size:22px;font-weight:500;letter-spacing:1px}
.nav{height:90px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;position:relative;
  color:${PAPER};background:#181A20}
.nav .capsule{position:absolute;right:24px;top:22px;width:174px;height:46px;border-radius:999px;
  background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);
  display:flex;align-items:center;justify-content:space-around;font-size:22px;color:#fff}
.body{padding:0 24px;position:relative}
.band{height:542px;position:relative;overflow:hidden;margin:0 -24px}
.band .ph2{position:absolute;inset:0;background:url(${path.relative(DIR, path.join(MP, 'assets/home-bg-portrait.jpg'))}) center 15%/cover no-repeat}
.band .sc{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 14%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%),rgba(8,9,12,.5)}
.band .t1{position:absolute;left:32px;top:22px;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.stats{position:absolute;right:32px;top:24px;z-index:4}
.st{width:96px;text-align:center}
.st b{display:block;font-family:'WtsjMind',sans-serif;font-weight:100;font-size:56px;line-height:.9;color:rgba(242,239,233,.8)}
.st i{font-style:normal;display:block;margin-top:8px;font-size:var(--fs-micro);letter-spacing:2px;color:rgba(242,239,233,.62)}
.tools{position:absolute;left:24px;right:24px;top:400px;height:88px;display:flex;align-items:center;
  justify-content:space-between;z-index:5}
.tp{display:flex;align-items:center;gap:14px;flex:1;min-width:0;font-size:var(--fs-meta);line-height:1.35;color:rgba(242,239,233,.82)}
.tp i{width:14px;height:14px;border-radius:50%;flex:none;background:${TIP}}
.tp span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acts2{display:flex;align-items:center;gap:18px;flex:none;margin-left:26px}
.acts2 svg{width:38px;height:38px;stroke:rgba(255,255,255,.86);fill:none;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
.srch{display:flex;align-items:center;gap:16px;height:60px}
.srch.open{flex:1;min-width:0;border-radius:var(--r-pill);background:rgba(255,255,255,.18);
  border:2px solid rgba(255,255,255,.36);padding:0 22px}
.srch.open svg{width:30px;height:30px;stroke:rgba(255,255,255,.9);fill:none;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;flex:none}
.srch .in{flex:1;min-width:0;font-size:var(--fs-body);color:rgba(242,239,233,.92);white-space:nowrap}
.srch .in.iph{color:rgba(242,239,233,.55)}
.srch .go{flex:none;font-size:var(--fs-meta);font-weight:600;color:${PAPER}}

/* 列表那一层：甲 = 页面底不变；乙 = 整层换深色面（与创建页那块面板同一档），顶部一条纸白@10% 的边
   ——那条边就是"深色边框"在乙里的落点，它同时把这一层与底栏那块深色分开（两块深色挨在一起会连成一片） */
.list{position:absolute;left:0;right:0;top:686px;bottom:150px;z-index:1;
  border-radius:var(--r-card) var(--r-card) 0 0;display:flex;flex-direction:column;overflow:hidden;
  background:var(--bg-page)}
.yi .list{background:var(--dk);border-top:var(--w-edge) solid ${EDGE_ON_DK}}

/* 区内顶那一行两枚 tab：现网 .vtabs 一个字没改（它就是"首页下划线文字"那把参照物） */
.vtabs{display:flex;gap:44px;padding:0 32px;flex:none;position:relative;
  border-bottom:2px solid rgba(35,37,44,.12)}
.vtabs span{font-size:var(--fs-meta);font-weight:600;letter-spacing:1px;color:rgba(35,37,44,.42);padding:22px 0 14px;position:relative}
.vtabs span.on{color:${I90};font-weight:700}
.vtabs span.on::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:4px;border-radius:2px;background:${I90}}
.vtabs .fold{margin-left:auto;align-self:center;font-size:var(--fs-meta);color:rgba(35,37,44,.42);padding:0}
.yi .vtabs{border-bottom-color:${EDGE_ON_DK}}
.yi .vtabs span{color:rgba(242,239,233,.55)}
.yi .vtabs span.on{color:${PAPER}}
.yi .vtabs span.on::after{background:${PAPER}}
.yi .vtabs .fold{color:rgba(242,239,233,.5)}

/* 分类那一行：撤胶囊，换成与上面同一种手法（文字 + 选中一条短杠）。
   与上面那行的分工：横线只有一条（在 tab 底下），分类这行不再自带通栏线——
   两行都压一条线就会被读成"两排 tab"，而分类是一排筛选、不是第二层导航。 */
.cats{display:flex;gap:40px;padding:20px 32px 16px;flex:none;align-items:baseline;overflow:hidden}
.cats span{position:relative;font-size:var(--fs-meta);font-weight:600;letter-spacing:1px;
  color:rgba(35,37,44,.42);padding-bottom:14px;white-space:nowrap;flex:none}
.cats span.on{color:${I90};font-weight:700}
.cats span.on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;border-radius:2px;background:${I90}}
.cats .fade{margin-left:auto;align-self:center;flex:none;font-size:var(--fs-micro);color:rgba(35,37,44,.35);padding:0}
.yi .cats span{color:rgba(242,239,233,.55)}
.yi .cats span.on{color:${PAPER}}
.yi .cats span.on::after{background:${PAPER}}
.yi .cats .fade{color:rgba(242,239,233,.35)}

/* 白内框：两套方案共用这一块，差别只在它外面有没有那一圈深色 */
.wc{background:var(--w);border-radius:var(--r-block);color:#23252c}
.jia .wc{border:4px solid var(--dk)}
.yi .wc{box-shadow:0 6px 18px rgba(8,10,14,.28)}

/* 笔记列表那一支 */
.xlist{flex:1;min-height:0;overflow:hidden;padding:20px 24px 0}
.xrow{display:flex;gap:20px;padding:24px 28px;margin-bottom:20px}
.jia .xrow{padding:20px 24px}
.xd{width:60px;flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px}
.xd i{width:14px;height:14px;border-radius:50%;background:${TIP}}
.xd b{font-family:'WtsjMind',sans-serif;font-weight:100;font-size:var(--fs-meta);line-height:1;color:rgba(35,37,44,.5)}
.xm{flex:1;min-width:0}
.xm .t{font-size:var(--fs-body);font-weight:600;line-height:1.35;color:${I90};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm .s{margin-top:8px;font-size:var(--fs-meta);line-height:1.62;color:${I70};display:-webkit-box;-webkit-box-orient:vertical;
  -webkit-line-clamp:2;overflow:hidden}
.xm .m{margin-top:10px;display:flex;align-items:baseline;gap:18px}
.xm .more{font-size:var(--fs-meta);font-weight:700;color:${EXT}}
.who{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:var(--fs-micro);color:rgba(35,37,44,.5);min-width:0}
.who .g{position:relative;width:20px;height:20px;flex:none;overflow:hidden;opacity:.85}
.who .g::before{content:'';position:absolute;left:5px;top:0;width:10px;height:10px;box-sizing:border-box;border:2px solid currentColor;border-radius:50%}
.who .g::after{content:'';position:absolute;left:-2px;bottom:0;width:24px;height:13px;box-sizing:border-box;border:2px solid currentColor;border-bottom:none;border-radius:13px 13px 0 0}
.who span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yi .xd b{color:rgba(35,37,44,.5)}

/* 卡片那一支：白垫就是白内框；甲给它一圈深色边，乙让它直接坐在深色上 */
.grid2{flex:1;min-height:0;overflow:hidden;display:flex;flex-wrap:wrap;gap:22px;padding:22px 24px 0}
.gc{width:340px}
.pad{width:340px;height:474px;border-radius:20px;background:var(--w);display:flex;align-items:center;justify-content:center;overflow:hidden}
.jia .pad{border:4px solid var(--dk)}
.yi .pad{box-shadow:0 8px 22px rgba(8,10,14,.34)}
.gcap{margin-top:12px;font-size:var(--fs-meta);line-height:1.4;color:${I90};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.yi .gcap{color:rgba(242,239,233,.82)}

/* 详情那一层（浮窗与独立页共用一套块：白内框 + 里面一段段内容） */
.sheet{position:absolute;left:24px;right:24px;top:314px;bottom:152px;border-radius:32px;z-index:9;
  display:flex;flex-direction:column;overflow:hidden;background:var(--w)}
.jia .sheet{border:6px solid var(--dk)}
.yi .sheet{background:var(--dk);border:var(--w-edge) solid ${EDGE_ON_DK}}
.yi .dsb{padding:0 26px}
.grip{flex:none;width:100%;height:56px;display:flex;align-items:center;justify-content:center;position:relative;
  background:var(--w)}
.yi .grip{background:transparent}
.grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.yi .grip .bar{background:rgba(242,239,233,.28)}
.grip span{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;
  font-size:var(--fs-tiny);font-weight:700;letter-spacing:.4px;color:rgba(35,37,44,.42)}
.yi .grip span{color:rgba(242,239,233,.55)}
.dsb{flex:1;min-height:0;overflow:hidden;padding:0 34px}
.dsb .meta{margin-top:14px;font-size:var(--fs-meta);color:rgba(35,37,44,.5)}
.dsb h3{margin-top:8px;font-size:38px;font-weight:800;letter-spacing:-.9px;line-height:1.3;color:${I90}}
.yi .dsb h3{color:${PAPER}}
.yi .dsb .meta{color:rgba(242,239,233,.55)}
/* 右上那一格＝出卡片的唯一入口（现网 app.wxss 的 .ds-rt / .ds-empty 那一整套：格 252×352、
   方片 176、"+" 56、品牌行 14/14）。10-07 起动作条只剩两枚，「生成笔记卡片」不再是按钮，
   画稿不许把它画回去（现网注释里就是站长那句"很多余"）。 */
.hero{display:flex;align-items:flex-start;gap:24px}
.hero .lt{flex:1;min-width:0}
.hero .lt .mt{font-size:var(--fs-meta);color:rgba(35,37,44,.5)}
.hero .lt .h1{margin-top:8px;font-size:38px;font-weight:800;letter-spacing:-.9px;line-height:1.3;color:${I90}}
.yi .hero .lt .mt{color:rgba(242,239,233,.55)}
.yi .hero .lt .h1{color:${PAPER}}
.rt{flex:none;width:252px}
.rt .cell{box-sizing:border-box;width:252px;height:352px;border-radius:20px;background:var(--w);
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.jia .rt .cell{box-shadow:inset 0 0 0 2px rgba(35,37,44,.16)}
.yi .rt .cell{background:color-mix(in srgb,#FFFFFF 7%,var(--dk))}
.rt .sw{position:relative;width:176px;height:176px;border-radius:28px;flex:none;
  border:var(--w-edge) solid rgba(35,37,44,.10);display:flex;align-items:center;justify-content:center}
.yi .rt .sw{border-color:${EDGE_ON_DK}}
/* 深面那一版：加号与品牌那颗圆点得跟着翻，否则 42% 的墨压在 #2B2D35 上等于没画（10-08 看图抓到） */
.yi .rt .sw u{color:rgba(242,239,233,.42)}
.yi .rt .sw .lg i{background:${PAPER};color:${DK}}
.rt .sw u{text-decoration:none;font-weight:200;font-size:56px;line-height:1;color:rgba(35,37,44,.42)}
.rt .sw .lg{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:6px}
.rt .sw .lg i{width:28px;height:28px;border-radius:50%;background:${DK};color:${PAPER};font-size:16px;
  font-style:normal;display:flex;align-items:center;justify-content:center}
.rt .sw .lg em{font-style:normal;font-size:var(--fs-micro);letter-spacing:1px;color:rgba(35,37,44,.45)}
.yi .rt .sw .lg em{color:rgba(242,239,233,.55)}
.rt .e1{display:block;margin-top:18px;text-align:center;font-size:var(--fs-meta);font-weight:700;color:${I90}}
.rt .e2{display:block;margin-top:4px;text-align:center;font-size:var(--fs-tiny);line-height:1.4;color:rgba(35,37,44,.45)}
.yi .rt .e1{color:${PAPER}}
.yi .rt .e2{color:rgba(242,239,233,.55)}
.blk{margin-top:22px;padding:22px 24px;border-radius:24px;background:var(--w)}
.jia .blk{box-shadow:inset 0 0 0 2px rgba(35,37,44,.10)}
.yi .blk{box-shadow:none}
.blk .lab{font-size:var(--fs-label);font-weight:800;letter-spacing:1.6px;color:rgba(35,37,44,.42)}
.blk p{margin-top:10px;font-size:var(--fs-body);line-height:1.7;color:${I70}}
.blk .pt{margin-top:14px;display:flex;gap:16px;align-items:flex-start}
.blk .pt b{flex:none;width:38px;height:38px;border-radius:50%;background:${CAM};color:${CAM_INK};
  font-family:'WtsjMind',sans-serif;font-weight:100;font-size:22px;display:flex;align-items:center;justify-content:center}
.blk .pt span{font-size:var(--fs-body);line-height:1.55;color:${I90}}
.blk .link{margin-top:10px;font-size:var(--fs-meta);line-height:1.5;color:${EXT};word-break:break-all}
.blk .shots{margin-top:14px;display:flex;gap:16px}
.blk .shots u{width:150px;height:150px;border-radius:24px;background:#EDE9E1;flex:none;
  box-shadow:inset 0 0 0 2px rgba(35,37,44,.10)}
.dsd{flex:none;padding:22px 30px 30px;background:var(--w)}
.yi .dsd{background:var(--dk);border-top:var(--w-edge) solid ${EDGE_ON_DK}}
.dsd .irow{display:flex;gap:14px}
.dsd .irow b{flex:1;height:72px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  white-space:nowrap;font-size:var(--fs-meta);font-weight:700;color:#23252C;background:var(--w);
  box-shadow:inset 0 0 0 var(--w-edge) var(--dk)}
.dsd .irow b.d{color:#b4231f;box-shadow:inset 0 0 0 var(--w-edge) rgba(180,35,31,.45)}
.yi .dsd .irow b{background:transparent;color:${PAPER};box-shadow:inset 0 0 0 var(--w-edge) ${EDGE_ON_DK}}
.dsd .pub{margin-top:18px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-micro);color:rgba(35,37,44,.5)}
.yi .dsd .pub{color:rgba(242,239,233,.55)}
.dsd .pub s{text-decoration:none;font-weight:700;color:#b4231f}

/* 卡片页（share） */
.sp{position:absolute;left:0;right:0;top:184px;bottom:0;padding:0 24px;display:flex;flex-direction:column}
.jia .sp{background:var(--bg-page)}
.yi .sp{background:var(--dk)}
.stage{flex:none;height:760px;border-radius:28px;display:flex;align-items:center;justify-content:center;overflow:hidden;
  background:var(--w);margin-top:22px}
.jia .stage{border:4px solid var(--dk)}
.yi .stage{box-shadow:0 10px 26px rgba(8,10,14,.34)}
.stage .big{width:470px;height:566px}
.qrow{flex:none;display:flex;align-items:center;gap:16px;margin-top:22px}
.qrow .tx b{display:block;font-size:var(--fs-body);font-weight:700;color:${I90}}
.yi .qrow .tx b{color:${PAPER}}
.qrow .tx i{font-style:normal;display:block;margin-top:4px;font-size:var(--fs-meta);line-height:1.4;color:rgba(35,37,44,.55)}
.yi .qrow .tx i{color:rgba(242,239,233,.55)}
.pill{width:92px;height:52px;border-radius:999px;background:rgba(35,37,44,.14);position:relative;flex:none}
.pill u{position:absolute;left:6px;top:6px;width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.pill.on{background:${CAM}}
.pill.on u{transform:translateX(40px)}
.yi .pill{background:rgba(242,239,233,.18)}
/* 这一条本来缺：.yi .pill 与 .pill.on 同权重、写在后面，把开那档的橙盖成灰底（v23 就带着这个错，这次新加的断言才抓到） */
.yi .pill.on{background:${CAM}}
.strip{flex:1;min-height:0;overflow:hidden;margin-top:22px;white-space:nowrap}
.strip .in{display:flex;gap:16px;align-items:flex-start}
.pick{flex:none;width:190px;padding:8px;border-radius:24px;background:var(--w)}
.jia .pick{box-shadow:inset 0 0 0 2px var(--dk)}
.yi .pick{box-shadow:none}
.pick.on{box-shadow:inset 0 0 0 4px ${CAM}}
.jia .pick.on{box-shadow:inset 0 0 0 4px ${CAM}}
.pick .mini{width:174px;height:244px;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.pick .mini .art{transform:scale(.51);transform-origin:center}
.pick label{display:block;margin-top:8px;text-align:center;font-size:var(--fs-tiny);font-weight:600;color:rgba(35,37,44,.62);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* 模板那一排在乙案里仍是白格子（白内框那条共用决定），所以字仍是墨色——
   跟着深面翻成纸白就成了白纸白字，肉眼扫过去才发现，实测表量不出来。 */
.pick.on label{color:${I90};font-weight:700}
.sact{flex:none;display:flex;gap:16px;padding:22px 0 30px}
.sact b{flex:1;height:96px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  white-space:nowrap;font-size:var(--fs-body);font-weight:700}
.sact b.s2{color:${I90};background:var(--w);box-shadow:inset 0 0 0 var(--w-edge) var(--dk)}
.yi .sact b.s2{color:${PAPER};background:transparent;box-shadow:inset 0 0 0 var(--w-edge) ${EDGE_ON_DK}}
/* 删除那一枚：浅面沿用现网 #b4231f（压白 6.56），深面换成 #e57368（压深 5.09）。
   现网在深面上没画过这一枚，所以这一档是本稿新定的，实测表里有这两行。 */
.sact b.s2.d,.yi .sact b.s2.d{color:#b4231f;box-shadow:inset 0 0 0 var(--w-edge) rgba(180,35,31,.45)}
.yi .sact b.s2.d{color:#ee8277;box-shadow:inset 0 0 0 var(--w-edge) rgba(238,130,119,.45)}
.yi .dsd .irow b.d{color:#ee8277;box-shadow:inset 0 0 0 var(--w-edge) rgba(238,130,119,.45)}
.sact b.s1{background:${EXT};color:${EXT_INK}}

/* 底栏：v24 起它是**每套壁纸自己那一档**（chromeOf(key).style 贴进手机壳的 style 上），
   所以这里一律走 var，不再把象牙那支烤死在样式里——烤死的话四台机器的底栏会同色。 */
.bar2{position:absolute;left:24px;right:24px;bottom:20px;height:108px;border-radius:44px;z-index:6;
  background:var(--chrome-bg);border:3px solid var(--chrome-line);display:flex;align-items:center;justify-content:space-around;
  box-shadow:0 16px 44px var(--chrome-shadow)}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--chrome-idle);color:var(--chrome-ink)}
.bar2 u.on{background:var(--chrome-sel);color:var(--chrome-ink)}
.bar2 svg{width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}

/* 卡片小样 */
.art{position:relative;overflow:hidden;padding:22px 20px}
.art.jade{background:#FBF8F1;color:#17181C}
.art.jade .hd{display:flex;align-items:center;gap:7px;font-size:12px;letter-spacing:2px;color:rgba(23,24,28,.5)}
.art.jade .hd i{width:16px;height:16px;border-radius:50%;background:#23252c;color:${PAPER};font-size:10px;display:flex;align-items:center;justify-content:center;font-style:normal}
.art.jade h6{margin-top:18px;font-size:20px;line-height:1.3;font-weight:800;letter-spacing:-.4px}
.art.jade .ln{margin-top:12px;height:9px;border-radius:5px;background:rgba(23,24,28,.13)}
.art.jade .ln.w86{width:86%}.art.jade .ln.w72{width:72%}.art.jade .ln.w58{width:58%}
.art.jade .rule{margin-top:20px;height:2px;background:rgba(23,24,28,.16)}
.art.jade .ft{position:absolute;left:20px;right:20px;bottom:18px;display:flex;align-items:flex-end;justify-content:space-between}
.art.jade .ft u{width:34px;height:34px;border-radius:50%;background:#23252c;color:${PAPER};font-size:15px;display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.jade .qr{width:42px;height:42px;background:repeating-linear-gradient(0deg,#17181C 0 4px,transparent 4px 8px),repeating-linear-gradient(90deg,#17181C 0 4px,#FBF8F1 4px 8px);opacity:.75}
.art.verse{background:#FFFDF6;color:#17181C;display:flex;flex-direction:column;justify-content:center}
.art.verse em{font-style:normal;font-size:56px;line-height:.6;color:rgba(23,24,28,.22)}
.art.verse p{margin-top:14px;font-size:19px;line-height:1.5;font-weight:700;letter-spacing:-.3px}
.art.verse .sg{margin-top:20px;display:flex;align-items:center;gap:8px;font-size:12px;letter-spacing:2px;color:rgba(23,24,28,.5)}
.art.verse .sg u{width:26px;height:26px;border-radius:50%;background:#23252c;color:${PAPER};font-size:12px;display:flex;align-items:center;justify-content:center;text-decoration:none}
.art.verse.dk{background:#23252C;color:${PAPER}}
.art.verse.dk em{color:rgba(242,239,233,.28)}
.art.verse.dk .sg{color:rgba(242,239,233,.6)}
.art.verse.dk .sg u{background:${PAPER};color:#23252c}

/* 局部放大那一格（分类行两态 + 尺寸标注） */
.zoom{width:750px;flex:none;background:#fff;border-radius:28px;padding:26px 28px;box-shadow:0 8px 22px rgba(8,10,14,.10)}
.zoom h4{font-size:17px;font-weight:800;letter-spacing:-.2px;margin-bottom:4px}
.zoom .sub{font-size:14px;color:#5c6068;line-height:1.6;margin-bottom:16px}
.zoom .strip2{border-radius:20px;overflow:hidden}
.zoom .strip2.on-light{background:var(--bg-page)}
.zoom .strip2.on-dark{background:${DEEP}}
.zoom .cats{padding:22px 26px 18px;gap:44px}
/* 深色那一条得自己把墨翻成纸白：上一稿只有 .yi 那批规则，放大格里的深色条没吃到，
   画出来是一块纯黑空带（10-08 看图才发现）。 */
.zoom .strip2.on-dark .cats span{color:rgba(242,239,233,.55)}
.zoom .strip2.on-dark .cats span.on{color:${PAPER}}
.zoom .strip2.on-dark .cats span.on::after{background:${PAPER}}
.dim{display:flex;gap:26px;margin-top:14px;font-size:13.5px;color:#4a4f47;line-height:1.65;flex-wrap:wrap}
.dim b{color:#23252c}
.dim code{background:#F2EFE9;padding:1px 6px;border-radius:5px}

/* 实测表 */
table.m{border-collapse:collapse;width:100%;background:#fff;font-size:14.5px;line-height:1.5}
table.m th,table.m td{text-align:left;padding:9px 12px;border-bottom:1px solid rgba(35,37,44,.10);vertical-align:top}
table.m th{font-size:13px;letter-spacing:1px;color:#5c6068;background:#F2EFE9}
table.m td.k{font-family:ui-monospace,Menlo,monospace;white-space:nowrap}
table.m td.ok,table.m td.bad{font-weight:800;white-space:nowrap}
table.m td.ok{color:#1c6b3a}table.m td.bad{color:#b4231f}
.legend{margin-top:34px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 30px}
.legend>div{background:#fff;border-radius:18px;padding:16px 20px 16px 52px;font-size:14.5px;line-height:1.75;color:#3c4046;position:relative}
.legend .n{position:absolute;left:16px;top:16px;width:26px;height:26px;border-radius:50%;background:#23252c;color:${PAPER};
  font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center}
.legend b{color:#23252c}.legend code{background:#F2EFE9;padding:1px 5px;border-radius:4px}
.legend i{color:#5c6068}
`

/* ============================ 屏 ============================ */
const status = `<div class="status"><span>10:43</span><span class="r">100 ▮</span></div>`
// 导航条那三个字不在 i18n 里，是各页 .json 的 navigationBarTitleText —— 现读，不抄
const navTitle = (page) => {
  const j = JSON.parse(fs.readFileSync(path.join(MP, 'pages', page, page + '.json'), 'utf8'))
  if (!j.navigationBarTitleText) throw new Error(`pages/${page}/${page}.json 没有 navigationBarTitleText`)
  return j.navigationBarTitleText
}
const nav = (t) => `<div class="nav">${t}<div class="capsule"><span>•••</span><span>◎</span></div></div>`
const bar = (on) => {
  const svg = ['<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h6"/></svg>',
    '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="3.4"/><path d="M5.5 19a6.5 6.5 0 0 1 13 0"/></svg>']
  return `<div class="bar2">${svg.map((s, i) => `<u class="${i === on ? 'on' : ''}">${s}</u>`).join('')}</div>`
}
const head = () => `${status}${nav(navTitle('index'))}
  <div class="body"><div class="band"><div class="ph2"></div><div class="sc"></div>
    <div class="t1">${T('notesHeading')}</div>
    <div class="stats"><div class="st"><b>20</b><i>${T('statNotes')}</i></div></div>
    <div class="tools"><div class="tp"><i></i><span>${TIPS[0]}</span></div>
      <div class="acts2"><a><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 21 21"/></svg></a></div>
    </div></div></div>`
const vtabs = (on) => `<div class="vtabs"><span class="${on === 0 ? 'on' : ''}">${T('tabList')}</span>`
  + `<span class="${on === 1 ? 'on' : ''}">${T('navShare')}</span><span class="fold">${T('collapseTip')}</span></div>`
const cats = (on) => `<div class="cats">${CATS.map((c, i) => `<span class="${i === on ? 'on' : ''}">${c}</span>`).join('')}</div>`

const xlist = () => `<div class="xlist">${ROWS.map((r) => `<div class="xrow wc" data-m="row">
  <div class="xd"><i></i><b>${r.d}</b></div>
  <div class="xm"><div class="t" data-m="xt">${r.t}</div><div class="s">${r.s}</div>
    ${r.more || r.who ? `<div class="m">${r.more ? `<span class="more">${T('showMore')}</span>` : ''}${
      r.who ? `<span class="who"><span class="g"></span><span>${r.who}</span></span>` : ''}</div>` : ''}
  </div></div>`).join('')}</div>`

const grid2 = () => `<div class="grid2">${CELLS.map((c) => `<div class="gc">
  <div class="pad">${c.art}</div><div class="gcap" data-m="gcap">${c.t}</div></div>`).join('')}</div>`

const listPhone = (mode, on, tab, st = PH0) => `<div class="ph ${mode}" style="${st}">
  ${head()}<div class="list">${vtabs(tab)}${cats(on)}${tab ? grid2() : xlist()}</div>${bar(1)}</div>`

/* 详情那一层的内容块（浮窗与独立页共用） */
const blks = (n) => [`<div class="blk"><div class="lab">${T('summaryLabel')}</div><p>${SUM}</p></div>`,
  `<div class="blk"><div class="lab">${T('keyPoints')}</div>${PTS.slice(0, n).map((p, i) =>
    `<div class="pt"><b>${i + 1}</b><span>${p}</span></div>`).join('')}</div>`,
  `<div class="blk"><div class="lab">${T('sourceLink')}</div><div class="link">https://mp.weixin.qq.com/s/abcdef</div></div>`,
  `<div class="blk"><div class="lab">${T('originalContent')}</div><p>${ORIG}</p></div>`,
  `<div class="blk"><div class="lab">${T('shotsLabel')}</div><div class="shots"><u></u><u></u><u></u></div></div>`]

const entryCell = () => `<div class="rt"><div class="cell">
  <div class="sw"><div class="lg"><i>麦</i><em>${T('appName')}</em></div><u>+</u></div>
  <b class="e1">${T('shareAsImage')}</b><b class="e2">${T('noCards')}</b></div></div>`

const floatSheet = (mode, st = PH0) => `<div class="ph ${mode}" style="${st}">${head()}
  <div class="list">${vtabs(0)}${cats(1)}${xlist()}</div>
  <div class="sheet">
  <div class="grip"><div class="bar"></div><span class="l">${T('grip')}</span></div>
  <div class="dsb"><div class="hero">
    <div class="lt"><div class="meta">10月02日 · 旅游</div><h3>Qwen3.8-Flash 限时免费，国际版先装上试一圈</h3></div>
    ${entryCell()}</div>
    ${blks(2).join('')}</div>
  <div class="dsd"><div class="irow"><b>${T('edit')}</b><b class="d">${T('delete')}</b></div>
    <div class="pub"><span>${T('sharedNow')}</span><s>${T('unshare')}</s></div></div></div>
  ${bar(1)}</div>`

const detailPage = (mode, st = PH0) => `<div class="ph ${mode}" style="${st}">${status}${nav(navTitle('detail'))}
  <div class="sp">
    <div class="hero" style="margin-top:22px">
      <div class="lt"><div class="mt">10月02日 · 旅游</div>
        <div class="h1">Qwen3.8-Flash 限时免费，国际版先装上试一圈</div></div>
      ${entryCell()}</div>
    <div class="sact" style="padding:18px 0 6px"><b class="s2">${T('edit')}</b><b class="s2 d">${T('delete')}</b></div>
    ${blks(3).join('')}
  </div></div>`

const sharePage = (mode, st = PH0) => `<div class="ph ${mode}" style="${st}">${status}${nav(navTitle('share'))}
  <div class="sp"><div class="stage">${jade('把长文读成三条要点').replace('class="art jade"', 'class="art jade big"')}</div>
    <div class="qrow"><div class="pill on"><u></u></div><div class="tx"><b>${T('qrToggle')}</b><i>${T('qrToggleHint')}</i></div></div>
    <div class="strip"><div class="in">${TPLS.map((t, i) => `<div class="pick ${i === 0 ? 'on' : ''}">
      <div class="mini">${t.art}</div><label data-m="pick">${t.name}</label></div>`).join('')}</div></div>
    <div class="sact"><b class="s2">${T('editCard')}</b><b class="s1">${T('saveToAlbum')}</b></div>
  </div>${bar(1)}</div>`

const catZoom = () => `<div class="zoom">
  <h4>分类这一行：撤胶囊之后，两案共用同一种画法</h4>
  <div class="sub">上面那两枚 tab 现网就是"文字 + 一条短杠"（<code>.vtabs</code>：字 24、杠 4 高、通栏于字宽、压在一条 2 的横线上）。分类照同一种手法，但<b>不再自带那条通栏横线</b>——两行都压线就会被读成"两排 tab"，而分类是一排筛选。</div>
  <div class="strip2 on-light">${cats(1)}</div>
  <div class="strip2 on-dark" style="margin-top:12px">${cats(1)}</div>
  <div class="dim">
    <span><b>字号</b> <code>--fs-meta 24rpx</code>（与上面那行同档，不新开一级）</span>
    <span><b>选中</b> 字重 700 + 一条 <code>4×字宽</code> 的杠</span>
    <span><b>未选</b> 42% 黑 / 深色面上 50% 纸白</span>
    <span><b>间距</b> <code>gap 40rpx</code>（胶囊那版是 14，撤掉底色后要拉开才不粘连）</span>
    <span><b>放不下</b> 照旧左右滚，右端留一档淡出</span>
  </div></div>`

/* ============================ 组装 ============================ */
const cell = (id, cap, html) => `<div class="cell" id="${id}">${html}<div class="cap">${cap}</div></div>`
/* 三排：① 明度阶梯（同一支族压暗三档，左边摆现稿那块冷黑比）；
   ② 四套壁纸共用这一支（底栏仍跟壁纸走，这才看得出"不喧宾夺主"）；
   ③ 本版那档铺满其余四屏，与 v23 的乙案逐寸一样。 */
const TH = THEMES.map((t) => ({
  key: t.key, label: t.label, was: t.ramp.uncategorized.bg,
  chrome: palette.chromeOf(t.key).bg, sel: palette.chromeOf(t.key).sel,
}))
const rowsHtml = `<div class="plan"><div class="pt"><span class="k">明度阶梯</span>
    <span class="t">明度退回 v24 那一档不动，只往粉上加四档；最左边摆现稿那块冷黑比</span>
    <span class="desc">上一版我做错了方向：照"明度太高要降低"那句把 <code>L16</code> 压到 <code>L13</code>、又把饱和从 <code>S29</code> 砍到 <code>S15</code>，出来的是一支近黑。这一版<b>明度全部锁在 <code>L16</code>（与 v24 那四档同深，等于没加深）</b>，只把色相与饱和沿粉那一族往上加，四档让他指哪一档。四套壁纸仍共用一支（"不能喧宾夺主"那半句还成立）。</span></div>
  <div class="row">${cell('du1', `<span class="tag">现稿</span><b>那块冷黑</b>　<code>${DK}</code>（H227 S11 L15，创建页那一档）`,
      listPhone('yi', 1, 0, phStyle('tint-paper', DK)))
    + PINKS.map((k, i) => cell('pk' + i, `<span class="tag">${k.n}</span><b>${k.hex}</b>　${k.hsl}　与白内框分离 <code>${cr(WHITE, k.hex)}</code>、纸白正文 <code>${cr(mix(PAPER, 0.92, k.hex), k.hex)}</code>`,
        listPhone('yi', 1, 0, phStyle('tint-paper', k.hex)))).join('')}</div></div>
<div class="plan"><div class="pt"><span class="k">四套壁纸</span>
    <span class="t">深底四套共用这一支，底栏仍各自跟着壁纸走</span>
    <span class="desc">这一排回答"颜色不能喧宾夺主"：列表那一层不再换壁纸就换味，四台是同一支 <code>${PINK}</code>；只有底栏那枚胶囊还跟着 <code>chromeOf(key)</code> 走（现网本来就这样，不动它）。代价写在图例第 4 条。</span></div>
  <div class="row">${TH.map((t, i) => cell(i === 0 ? 'yi1' : 'th' + i,
      `<span class="tag">${t.label}</span><b>笔记列表</b>　深底 <code>${PINK}</code> · 底栏 <code>${t.chrome}</code> · 选中 <code>${t.sel}</code>（v24 那档是 <code>${t.was}</code>）`,
      listPhone('yi', 1, 0, phStyle(t.key)))).join('')}</div></div>
<div class="plan"><div class="pt"><span class="k">其余四屏</span>
    <span class="t">本版那档铺满：卡片 / 详情浮窗 / 详情页 / 卡片页</span>
    <span class="desc">这四屏与 v23 的乙案逐寸一样，只换了深底那一支；白内框里所有字的墨档一个字没动。</span></div>
  <div class="row">${cell('yi2', `<span class="tag">本版</span><b>笔记卡片</b>　两列白垫浮在同一条深底上`, listPhone('yi', 1, 1))
    + cell('yi3', `<span class="tag">本版</span><b>详情浮窗</b>　右上那一格是出卡片的唯一入口，动作条两枚`, floatSheet('yi'))
    + cell('yi4', `<span class="tag">本版</span><b>笔记详情页</b>（与浮窗同一套块、同一排动作）`, detailPage('yi'))
    + cell('yi5', `<span class="tag">本版</span><b>卡片页</b>　海报预览 + 带二维码那一枚 + 模板那一排`, sharePage('yi'))
    + cell('yi6', `<span class="tag">本版</span><b>分类这一行</b>（浅色面与这一档深底各一版）`, catZoom())}</div></div>`

/* 实测表：宽度由页面自己量（Range 只圈字），对比由 palette.crOf 现算 */
const METRICS = `
<div class="plan"><div class="pt"><span class="k">实测</span><span class="t">字放得进吗 · 字压得住底吗</span>
  <span class="d">宽度这一列由页面自己量（<code>Range</code> 只圈文字、<code>clientWidth − 内缩</code> 取可用宽）；对比这一列由 <code>palette.crOf</code> 现算，半透明字先按实际底色混成实心再算。</span></div>
  <div class="row" style="flex-wrap:wrap"><div class="cell" style="width:1100px">
  <table class="m"><thead><tr><th>量的是哪一句</th><th>屏上那一串</th><th>落在哪个容器</th><th>字宽／可用</th><th>判定</th></tr></thead><tbody id="mtb"></tbody></table>
  </div></div></div>`

const LEGEND = [
  `<b>先认一条方向错：</b>上一轮你说"明度太高，要降低…要偏粉一点"，我把力气全花在"降低"上——明度 <code>L16→L13</code>、饱和 <code>S29→S15</code>，出来是一支近黑带一点点粉，那不是"粉一点"。这一版<b>明度退回 <code>L16</code>（跟 v24 那四档一样深，等于没加深）</b>，只把色相与饱和沿粉那一族往上加。`,
  `<b>阶梯四档（明度全锁 L16，只差粉的程度）：</b>${PINKS.map((x) => `<code>${x.hex}</code>（${x.hsl}）`).join('／')}。四档与白内框的分离度是 ${PINKS.map((x) => `<code>${cr(WHITE, x.hex)}</code>`).join('／')}，纸白正文 <code>${PINKS.map((x) => cr(mix(PAPER, 0.92, x.hex), x.hex)).join('／')}</code>，未选那一档 <code>.55</code> 四档都是 <code>5.06~5.07</code>——<b>四档在"读不读得清"上没差别，纯粹是你要多粉</b>。我推荐第三档 <code>${PINK}</code>：粉已经看得出来，又还没到最右那档的红棕。`,
  `<b>"不能喧宾夺主"这半句我照办，但换了个办法：</b>不靠砍饱和，靠<b>统一色相</b>。v24 那四档是各套色阶的最深档（<code>H43／H133／H330／H229</code>），四台并排像四种产品；这一版四套共用一支，壁纸的个性只留在底栏那枚胶囊上（现网 <code>chromeOf(key)</code>，一个字没动）。`,
  `<b>代价说清：</b>换壁纸时列表那一层不再跟着换味，象牙与雨雾下是同一支底。要"还跟着壁纸走、但收敛"也有第四种画法：各套仍取自己那档最深，只把饱和从 <code>S29</code> 压到 <code>S12</code> 左右、色相往粉挪一点——一句话可切，本稿没画。`,
  `<b>三处墨在这支底上更宽松（v24 那三条一起带过来）：</b>深底上"未选／次要"那一档纸白 <code>.55</code> 压四档是 <code>${cr(mix(PAPER, IDLE, PINK), PINK)}</code>；删除那枚红用 <code>#ee8277</code>，压这支底 <code>${cr(DANGER_ON_DK, PINK)}</code>（v23 那支 <code>#e57368</code> 压带色底只有 <code>4.41</code>）；卡片页那枚开关吃拍照橙 <code>#E9723D</code>，压这支底 <code>${cr(CAM, PINK)}</code>——提炼橙 <code>#C4541F</code> 压这支底是 <code>${cr(EXT, PINK)}</code>，过不了图形那 3.0，所以不拿它压深底。`,
  `<b>那条 3rpx 纸白边仍不能撤，但这一版比 v24 从容：</b>本版深底与四套底栏的分离度是 <code>${THEMES.map((t) => cr(PINK, palette.chromeOf(t.key).bg)).join('／')}</code>（v24 那四档对各自底栏只有 <code>1.12~1.22</code>），靠这条边切开"哪一块是列表、哪一块是底栏"。`,
  `<b>这一稿没动的东西，说清免得你以为在提案：</b>头部那 542rpx 形象图与压暗罩、区内两枚 tab 的几何、底栏那枚胶囊本身的形状与跟壁纸的关系、搜索条那一档、列表行三档字号（标题 28／摘要 24／末行 18）、卡片白垫 340×474、模板小图 174×244、<b>白内框里所有字的墨档</b>——全部照现网或照 v23。<b>只换了深底这一支，和为了它必须跟着算一遍的那几处压字。</b>`,
  `<b>落地状态与下一步：</b>这一版仍是效果图，代码一行没动。真要落，改的是列表／详情那一层的底色（现在写死在页面里），加上 v23 那三条已拍的决定；改完之后 <code>docs/工具/验-统一录入条.js</code> 那批钉着壁纸色阶的尺子要一起重锚。`,
]

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>明度退回 v24 那一档，只往粉上加 · v26</title><style>${CSS}</style></head><body>
<h1><i></i>那一层深底：明度不动（与 v24 同档），只往粉上加四档给你指</h1>
<div class="lead"><b>先说落地状态</b>：真机现在跑<b>线上 1.9.29</b>（后台实据 发布 10-07 19:32:01），<b>2.0.0 已提审、正在审核中</b>（10-07 22:31:26）。<b>这一稿只是效果图，代码一行没动</b>；v23 那三条已拍的决定（白内框、分类下划线文字、拍照与提炼固定橙）原样保留，也还没落进 <code>createSkin()</code>。</div>
<div class="lead"><b>这一版改了什么、没改什么</b>：<b>改</b>——深底从 v25 那支近黑 <code>#261C1E</code>（L13）回到与 v24 同明的 <code>L16</code>，色相与饱和沿粉往上加，给四档阶梯。<b>没改</b>——明度没有比 v24 更深、白内框里所有字的墨档、底栏跟壁纸走的关系、那两枚固定橙、分类那一行的画法。字号／圆角／描边宽仍从 <code>app.wxss</code> 的 <code>page{}</code> 现读，界面话仍从 <code>utils/i18n.js</code> 现读，深底这几支是本稿提的新值，所以压在上面每处字都算一遍对比。手机框 750×1670 = 1px:1rpx，与 v19／v22／v23／v24／v25 同一套尺。</div>
<div id="app">${rowsHtml}${METRICS}</div>
<div class="legend" id="lg"></div>
<script>
window.addEventListener('error',function(e){document.title='PAGE-ERROR: '+e.message+' @ line '+e.lineno})
/*__GEN_BEGIN__*/
var LEGEND=${JSON.stringify(LEGEND)};
var CONTRAST=${JSON.stringify(CONTRAST_ROWS)};
var TOK=${JSON.stringify(TOKEN_KEYS.map((k) => [k, tok[k]]))};
/*__GEN_END__*/
document.getElementById('lg').innerHTML=LEGEND.map(function(x,i){return '<div><span class="n">'+(i+1)+'</span>'+x+'</div>'}).join('');
/* ---- 宽度实测：Range 只圈字（scrollWidth 会把容器自己的内缩算进来，那条坑记在记忆里） ---- */
window.__metrics=function(){
  var rows=[];
  function inner(el){var cs=getComputedStyle(el);return el.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight)}
  function textW(el){var r=document.createRange();r.selectNodeContents(el);return r.getBoundingClientRect().width}
  function one(key,sel,boxSel,label,soft){var el=document.querySelector(sel),box=document.querySelector(boxSel);
    if(!el||!box){rows.push([key,'（探针找不到节点：'+(el?'box':'sel')+'）',label,'—','bad']);return}
    var ew=textW(el),bw=inner(box),txt=(el.textContent||'').trim();
    // 量到 0 宽＝那一串根本没落到屏幕上（选择器指错或父级没渲染），这必须算红，不能算"放得进"
    // soft＝这一格本来就是设计成截断的（nowrap + 省略号），超出去是截字、不是折行，所以不算红但仍报数
    rows.push([key,txt,label,'字 '+ew.toFixed(1)+' / 可用 '+bw.toFixed(1),
      ew<=0.5?'bad':(ew<=bw+0.5?'ok':(soft?'soft':'bad'))])}
  // 分类那一行四枚加起来（gap 40 已扣）：放不下就要滚，那是设计，但要知道差多少
  (function(){var box=document.querySelector('.zoom .strip2.on-light .cats');
    if(!box){rows.push(['分类四枚加起来','放大那一格（浅色面）','（找不到节点）','—','bad']);return}
    var s=box.children,t=0;for(var i=0;i<s.length;i++)t+=textW(s[i]);
    var bw=inner(box)-(s.length-1)*40;
    rows.push(['分类四枚加起来',Array.prototype.map.call(s,function(e){return e.textContent}).join(' / '),
      '区内净宽（gap 40 已扣）',t.toFixed(1)+' / '+bw.toFixed(1),(t>0.5&&t<=bw+0.5)?'ok':'bad'])})()
  one('两枚 tab + 收起那一句','.vtabs','.list','区内那一行（含右边「点一下收起」）')
  one('列表标题（最长那条）','#yi1 .xm .t','#yi1 .xm','白内框里那一列（现网 nowrap + 省略号）',true)
  one('列表标题 · 天青台','#th1 .xm .t','#th1 .xm','换深底不改布局，逐台复量',true)
  one('列表标题 · 樱落台','#th2 .xm .t','#th2 .xm','同上',true)
  one('列表标题 · 雨雾台','#th3 .xm .t','#th3 .xm','同上',true)
  one('卡片标题','#yi2 .gcap','#yi2 .gc','白垫下面那一行（现网就是 nowrap + 省略号）',true)
  one('浮窗标题','#yi3 h3','#yi3 .hero .lt','左列（右边让给 252 那一格）')
  one('详情页标题','#yi4 .hero .lt .h1','#yi4 .hero .lt','同一档 38，独立页那一屏')
  one('浮窗按钮 1','#yi3 .dsd .irow b','#yi3 .dsd .irow b','两枚等宽 flex:1')
  one('入口格第一行','#yi3 .rt .e1','#yi3 .rt','252 那一格：生成笔记卡片')
  one('入口格第二行','#yi3 .rt .e2','#yi3 .rt','252 那一格：还没有生成过卡片')
  one('卡片页主按钮','#yi5 .sact b.s1','#yi5 .sact b.s1','「保存到相册」')
  one('卡片页次按钮','#yi5 .sact b.s2','#yi5 .sact b.s2','「编辑个人名片」六字那枚')
  one('模板名 1','#yi5 .pick label','#yi5 .pick','190 宽的格子')
  one('Tips 那一行','.tp span','.tp','头部那一行（含左端那枚点）')
  // 这一组不问"字放得进吗"，问"这条规则真的落到屏幕上了吗"（v23 那批选择器少个点号就整层没变深，
  // 只量字宽的表全绿，是肉眼看图才发现的）。
  function sty(key,sel,prop,want,pseudo){var el=document.querySelector(sel);
    if(!el){rows.push([key,'（找不到节点 '+sel+'）','计算样式','—','bad']);return}
    var got=getComputedStyle(el,pseudo||null)[prop];
    var norm=String(got).replace(/\s+/g,' ').trim().toLowerCase(), okn=String(want).toLowerCase();
    // 以 ~ 开头＝只要求包含（box-shadow 各浏览器把 inset 排前排后不一样，逐字比会假红）
    var ok=okn[0]==='~'?norm.indexOf(okn.slice(1))>-1:norm===okn
    rows.push([key,sel+' 的 '+prop,'落到屏幕上是什么（要等于右边）',norm+'　要　'+okn,ok?'ok':'bad'])}
  // 深底这一支到底落到屏上没有：四台共用一支，逐台钉；阶梯那三档各钉一档
  sty('象牙那台的深底','#yi1 .list','backgroundColor','${rgbOf(PINK)}')
  sty('天青那台的深底（与象牙同支）','#th1 .list','backgroundColor','${rgbOf(PINK)}')
  sty('樱落那台的深底（与象牙同支）','#th2 .list','backgroundColor','${rgbOf(PINK)}')
  sty('雨雾那台的深底（与象牙同支）','#th3 .list','backgroundColor','${rgbOf(PINK)}')
  sty('对照＝现稿那块冷黑','#du1 .list','backgroundColor','${rgbOf(DK)}')
  sty('阶梯 最沉 那一档','#pk0 .list','backgroundColor','${rgbOf(PINKS[0].hex)}')
  sty('阶梯 本版 那一档','#pk1 .list','backgroundColor','${rgbOf(PINKS[1].hex)}')
  sty('阶梯 再粉 那一档','#pk2 .list','backgroundColor','${rgbOf(PINKS[2].hex)}')
  sty('阶梯 最粉 那一档','#pk3 .list','backgroundColor','${rgbOf(PINKS[3].hex)}')
  sty('白内框在这版里不另描边','#yi1 .xrow','borderTopWidth','0px')
  sty('深底顶上有那条 3rpx 边','#yi1 .list','borderTopWidth','3px')
  sty('分类选中那一枚的短杠高度','#yi1 .cats span.on','height','4px','::after')
  sty('分类选中那一枚的短杠颜色','#yi1 .cats span.on','backgroundColor','${rgbOf(PAPER)}','::after')
  sty('分类未选那一档抬到 .55','#yi1 .cats span','color','rgba(242, 239, 233, 0.55)')
  sty('放大格深色那条的字翻纸白','.zoom .strip2.on-dark .cats span.on','color','rgb(242, 239, 233)')
  sty('放大格深色那条的短杠','.zoom .strip2.on-dark .cats span.on','backgroundColor','rgb(242, 239, 233)','::after');
  sty('深底入口格那枚加号翻纸白','.yi .rt .sw u','color','rgba(242, 239, 233, 0.42)');
  sty('模板那一排仍是白格子黑字','#yi5 .pick:not(.on) label','color','rgba(35, 37, 44, 0.62)');
  // 提炼橙压在这档深底上过不了 3.0（实测 2.97），所以开关那枚改吃拍照橙——这条钉住它真的换了
  sty('开关那枚改吃拍照橙','#yi5 .pill.on','backgroundColor','${rgbOf(CAM)}')
  sty('卡片页主按钮吃固定橙','#yi5 .sact b.s1','backgroundColor','${rgbOf(EXT)}')
  sty('模板选中那一枚吃拍照橙','#yi5 .pick.on','boxShadow','~${rgbOf(CAM)} 0px 0px 0px 4px')
  sty('删除那枚红是抬过的那档','#yi3 .dsd .irow b.d','color','${rgbOf(DANGER_ON_DK)}');
  // 四台底栏必须各自跟着壁纸走（全等＝烤死了象牙那一档）
  (function(){var seen={},out=[];
    ['#yi1','#th1','#th2','#th3'].forEach(function(id){
      var el=document.querySelector(id+' .bar2');if(!el){out.push(id+'✕');seen['_'+id]=1;return}
      var c=getComputedStyle(el).backgroundColor;out.push(id.replace('#','')+':'+c);seen[c]=1})
    var n=Object.keys(seen).length
    rows.push(['四台底栏各不相同','象牙／天青／樱落／雨雾','四台各自的底栏色',out.join('　'),n===4?'ok':'bad'])})();
  // 动作条必须等宽，且每一排都只有两枚（现网 10-07 起「生成笔记卡片」不再是按钮，画稿不许画回去）
  // 上一版类名撞车把它撑成 48/420/144、多画一枚也没人管，这两条都是肉眼看图才发现的，所以钉成断言
  (function(){var out=[],ok=true;
    ['#yi3 .dsd .irow','#yi4 .sact'].forEach(function(sel){
      var sets=document.querySelectorAll(sel);
      if(sets.length!==1){out.push(sel+'✕'+sets.length);ok=false;return}
      var els=sets[0].children,ws=[];
      for(var i=0;i<els.length;i++)ws.push(Math.round(els[i].getBoundingClientRect().width));
      out.push(sel.replace(/[#.]/g,'')+':'+ws.join('+'));
      if(!(ws.length===2&&Math.max.apply(null,ws)-Math.min.apply(null,ws)<=1))ok=false})
    rows.push(['动作条：两枚且等宽','编辑 / 删除','两排各自量出来的宽',out.join('　'),ok?'ok':'bad'])})()
  return rows};
(function(){
  var rows=window.__metrics(),bad=0,tb=document.getElementById('mtb'),h='';
  rows.forEach(function(r){if(r[4]==='bad')bad++;
    h+='<tr><td class="k">'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td class="'+(r[4]==='bad'?'bad':'ok')+'">'+(r[4]==='ok'?'放得进':(r[4]==='soft'?'截断（设计如此）':'放不下／没落地'))+'</td></tr>'});
  CONTRAST.forEach(function(c){var ok=c[5]==='ok';if(!ok)bad++;
    h+='<tr><td class="k">'+c[0]+'</td><td>字 '+c[1]+'</td><td>压底 '+c[2]+'</td><td>对比 '+c[4]+' / 门槛 '+c[3]+'</td><td class="'+(ok?'ok':'bad')+'">'+(ok?'过':'不过')+'</td></tr>'});
  TOK.forEach(function(t){h+='<tr><td class="k">令牌 '+t[0]+'</td><td>'+t[1]+'</td><td>app.wxss 的 page{}</td><td>—</td><td class="ok">本稿用的就是这个值</td></tr>'});
  tb.innerHTML=h;
  var f=document.createElement('div');f.id='metricflag';f.style.cssText='font-size:14px;color:#5c6068;margin-top:10px';
  f.textContent=(bad?'METRICS-BAD ':'METRICS-OK ')+'宽度 '+rows.length+' 串 + 对比 '+CONTRAST.length+' 组，不过 '+bad+' 条';
  tb.closest('table').parentNode.appendChild(f)})();
(function(){var d=document.documentElement;
  document.title='DIM '+Math.max(d.scrollWidth,document.body.scrollWidth)+'x'+Math.max(d.scrollHeight,document.body.scrollHeight)})();
</script></body></html>`

const OUT = path.join(DIR, 'v26-明度退回只加粉.html')
// 页内脚本里"上一句没分号、下一行以 ( 开头"会被读成函数调用，静默把整批实测干掉。
// 这一类 10-08 栽了两次（都是 sty(...) is not a function），所以写文件前先扫一遍，别等 Chrome 报。
const sb = html.slice(html.lastIndexOf('<script>') + 8, html.lastIndexOf('</script>')).split('\n')
const sloppy = sb.map((_, i, a) => {
  if (!a[i].trim().startsWith('(')) return null
  for (let j = i - 1; j >= 0; j--) {
    const p = a[j].trim()
    if (!p || p.startsWith('//') || p.startsWith('/*') || p.startsWith('*')) continue
    return /[)\]]$/.test(p) && !/;$/.test(p) ? `第 ${j + 1} 行「${p.slice(0, 34)}…」以 ) 收尾却没分号` : null
  }
  return null
}).filter(Boolean)
if (sloppy.length) { console.error('✗ 页内脚本语句没收尾：' + sloppy.join('；')); process.exit(1) }
fs.writeFileSync(OUT, html)
console.log('写 ' + path.relative(process.cwd(), OUT))
console.log(`　界面话 ${new Set((html.match(/[\u4e00-\u9fa5]{2,}[，。、？]/g) || [])).size} 串样本；字典键现读 ${Object.keys(ZH).length} 个里取用；对比 ${CONTRAST.length} 组；令牌 ${need.length} 条已核对`)

/* ---------- 渲图：窗口宽由"还有没有容器被撑出去"定，宽高都不手写 ---------- */
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PNG = OUT.replace(/\.html$/, '.png')
// Chrome 在把 stderr 关掉的那条调用路上会以 2 退出，而同一份命令、同一份 stdout 在 spawnSync 下是 0
// （10-08 实测：execFileSync status 2 / spawnSync status 0，stdout 都是 80956 字节）。
// 所以这里不信退出码，只信它有没有真的吐出带标记的东西。
const chrome = (args, need) => {
  const r = spawnSync(CHROME, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  const out = r.stdout || ''
  if (r.error || !out || (need && !need.test(out))) {
    console.error('✗ Chrome 没吐出可用的东西：' + (r.error ? r.error.message : `status ${r.status} / stdout ${out.length} 字节`))
    process.exit(1)
  }
  return out
}
const probe = (W) => {
  const dump = chrome(['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=8000', `--window-size=${W},9500`, '--dump-dom', tmp],
    /OV \d+|PAGE-ERROR/)
  const t = (dump.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  if (/PAGE-ERROR/.test(t)) { console.error('✗ 页面里有 JS 报错，图与实测表都不可信：' + t); process.exit(1) }
  const ov = /OV (\d+)x(\d+) H (\d+) P (\d+)/.exec(t)
  return { ov: ov ? { n: +ov[1], rowW: +ov[2], h: +ov[3], pad: +ov[4] } : null,
    flag: (dump.match(/METRICS-(OK|BAD)[^<]*/) || ['（页面没写出实测表）'])[0], dump }
}
// 探针脚本临时贴一份（正本不动）：数"有没有容器被内容撑出去"
const tmp = path.join(DIR, '.probe-v26.html')
const base = fs.readFileSync(OUT, 'utf8')
// 只问一件事：**那一排手机（.row）有没有被窗口切掉**。不许数"任何容器溢出"——
// 这一页故意有横向滚动条与省略号（模板那一排、列表标题），那种溢出是设计，加宽窗口治不了（上一版就在这儿空转六轮）
const PROBE_JS = "var _n=0,_x=0;document.querySelectorAll('.row').forEach(function(e){if(e.scrollWidth>e.clientWidth+1)_n++;if(e.scrollWidth>_x)_x=e.scrollWidth});"
  + "var _cs=getComputedStyle(document.body);document.title='OV '+_n+'x'+_x+' H '+Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)"
  + " +' P '+Math.round(parseFloat(_cs.paddingLeft)+parseFloat(_cs.paddingRight))"
// 贴在最后一个脚本结束标记**之前**（原来用 replace 把结束标记本身吃掉了，脚本再没闭合，探针一个字都没跑）
const at = base.lastIndexOf('<' + '/script>')
if (at < 0) { console.error('✗ 生成的页面里没有脚本结束标记，探针没法贴'); process.exit(1) }
fs.writeFileSync(tmp, base.slice(0, at) + PROBE_JS + base.slice(at))

let W = 2400, H = 9500, pad = 80
for (let i = 0; i < 4; i++) {
  const r = probe(W)
  const o = r.ov || { n: -1, rowW: 0, h: 0, pad: 80 }
  console.log(`　窗口 ${W}css：被切的排 ${o.n} 条，最宽那一排要 ${o.rowW}css，内容高 ${o.h}css`)
  pad = o.pad || 80
  if (o.n === 0) { H = o.h; break }
  const want = o.rowW + pad + 24
  if (i === 3 || want <= W) { console.error('✗ 加宽到 ' + W + ' 还有排被切，不能交'); fs.unlinkSync(tmp); process.exit(1) }
  W = want
}
const fin = probe(W)
const tb = /<tbody id="mtb">([\s\S]*?)<\/tbody>/.exec(fin.dump)   // 只读 tbody：整份 dump 里脚本源码自己也写着 <tr><td…
  const rows = [...(tb ? tb[1] : '').matchAll(/<tr><td class="k">([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td class="(ok|bad)">([\s\S]*?)<\/td><\/tr>/g)]
  .map((m) => ({ k: m[1], s: m[2], box: m[3], v: m[4], bad: m[5] === 'bad', verdict: m[6] }))
if (rows.length !== 40 + CONTRAST_ROWS.length + TOKEN_COUNT) {
  console.error(`✗ 表里只有 ${rows.length} 行，页面没把该量的量全（应为 16 宽 + 24 样式 + 对比 ${CONTRAST_ROWS.length} + 令牌 ${TOKEN_COUNT}）`); process.exit(1)
}
console.log('\n实测（宽度由页面自己量 · 对比由 palette.crOf 现算 · 令牌由 app.wxss 核对）：' + fin.flag)
rows.forEach((r) => console.log(`  ${r.bad ? '✗' : '✓'} ${r.k.slice(0, 26).padEnd(28)} ${r.s.slice(0, 22).padEnd(24)} ${r.v.padEnd(24)} ${r.box.slice(0, 26)}`))
if (rows.some((r) => r.bad)) { console.error('✗ 有放不进或对比不过的，图可以给人看，但结论是红的'); process.exitCode = 1 }
fs.unlinkSync(tmp)

const shot = '/tmp/v26-raw.png'
if (fs.existsSync(shot)) fs.unlinkSync(shot)
spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', '--virtual-time-budget=9000', `--window-size=${W},${Math.max(H + 200, 9500)}`,
  `--screenshot=${shot}`, OUT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
if (!fs.existsSync(shot)) { console.error('✗ 没出图（' + shot + ' 不存在），不能交'); process.exit(1) }
const py = `
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
im=Image.open(${JSON.stringify(shot)}).convert('RGB'); w,h=im.size; px=im.load(); bg=px[3,h-3]
last=0
for y in range(h-1,-1,-1):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(0,w,5) for c in range(3)): last=y; break
print('图',w,h,'最后一行',last)
if last>=h-2: raise SystemExit('顶到底＝窗口还不够高，不能交')
right=0
for y in range(0,min(last,h),7):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(w-6,w) for c in range(3)): right+=1
if right>3: raise SystemExit('最右一列有 %d 行带内容＝右边被切了，不能交' % right)
out=im.crop((0,0,w,min(h,last+40))); out.save(${JSON.stringify(PNG)}); print('写入',out.size)
`
console.log(execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim() + '\n出图：' + PNG)
