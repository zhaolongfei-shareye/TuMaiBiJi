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
/* 半透明墨字压在白上要先算成实心才谈对比（PIL 那条同款坑：alpha 不落地就是假数） */
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const mix = (fg, a, bg) => {
  const f = hex2rgb(fg), b = hex2rgb(bg)
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
}
const cr = (a, b) => Number(palette.crOf(a, b).toFixed(2))
const rgbOf = (h) => 'rgb(' + hex2rgb(h).join(', ') + ')'
const rgbaOf = (h, a) => (a >= 1 ? rgbOf(h) : `rgba(${hex2rgb(h).join(', ')}, ${a})`)   // 屏上算出来就是这个形状，别手写
/* v28：上一版的粉被他整支打回——"你为啥要用粉红？你不能用底部的 BAR 的色系来处理吗？"
   这句是对的：底栏那一支本来就是 palette.chromeOf(壁纸) 从壁纸页面底派生的（H 原样、S 夹进 [30,45]、L 20.5），
   我却另挑了一支 H340 压在它上面，同一屏出现两个不相干的色相。
   这一版不再自己挑色相：四套壁纸各取自己底栏的 H 与 S，只动明度做六档，
   第六档就＝底栏那一支本身（层与栏同色，整屏一个色系）。只画笔记列表一屏，他说不用等别的屏。 */
const rgb2hsl = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => v / 255)
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) h = 60 * (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4)
  const l = (mx + mn) / 2
  return [h, (d ? d / (1 - Math.abs(2 * l - 1)) : 0) * 100, l * 100]
}
const hsl2hex = (h, s, l) => {
  const H = ((h % 360) + 360) % 360, S = s / 100, L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S, x = c * (1 - Math.abs(((H / 60) % 2) - 1)), m = L - c / 2
  const t = H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x]
    : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + t.map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()
}
const LS = [78, 66, 54, 42, 30]   // 前五档只动明度；第六档直接取底栏那一支
const WALLS = ['tint-paper', 'tint-celadon', 'tint-blush', 'gradient-blue'].map((key) => {
  const ch = palette.chromeOf(key)
  const [h, s, l] = rgb2hsl(ch.bg)
  const tag = `H${Math.round(h)} S${Math.round(s)}`
  const steps = LS.map((L, i) => ({ n: String(i + 1), hex: hsl2hex(h, s, L), hsl: `${tag} L${L}` }))
  steps.push({ n: '6', hex: ch.bg, hsl: `${tag} L${Math.round(l * 10) / 10}`, bar: true })
  return { key, label: themeOf(key).label, bar: ch.bg, sel: ch.sel, steps }
})
const rgbTri = (h) => hex2rgb(h).join(', ')
const skinOf = (hex) => {
  const ink = cr(PAPER, hex) >= 4.5 ? PAPER : '#23252C'
  const ia = [.5, .55, .6, .66, .72, .78, .85, .92, 1].find((a) => cr(mix(ink, a, hex), hex) >= 4.5) || 1
  const danger = cr('#ee8277', hex) >= 4.5 ? '#ee8277' : '#b4231f'
  return { ink, ia, danger, si: rgbTri(ink), edge: 'rgba(' + rgbTri(danger) + ',.45)' }
}
const phStyle = (key, dk) => {
  const sk = skinOf(dk)
  return `--dk:${dk};--si:${sk.si};--ia:${sk.ia};--danger:${sk.danger};--danger-edge:${sk.edge};${palette.chromeOf(key).style}`
}
const PH0 = phStyle('tint-paper', WALLS[0].bar)   // 这一版每台机器都显式传色，这里只兜底
const FONT = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
  .match(/font-family: 'WtsjMind';\s*src: url\(data:font\/ttf;base64,([^)]+)\)/)[1]

const CONTRAST = [
  // 白内框里面那一套与两枚固定橙：与底色无关，六档都一样，先钉住"这一版没动它们"
  ['白内框上的标题', mix('#23252C', 0.9, WHITE), WHITE, 4.5],
  ['白内框上的摘要', mix('#23252C', 0.7, WHITE), WHITE, 4.5],
  ['白内框上的三级字', mix('#23252C', 0.5, WHITE), WHITE, 3.0],
  ['拍照橙配深字', CAM_INK, CAM, 4.5],
  ['提炼橙配纸白', EXT_INK, EXT, 4.5],
  ['拍照橙压在白内框上（图形档）', CAM, WHITE, 3.0],
  ['提炼橙压在白内框上（图形档）', EXT, WHITE, 3.0],
  ['删除（白内框那档，现网原值）', '#b4231f', WHITE, 4.5],
  // 四套壁纸各算一遍：换色相不能只算象牙那一档。
  // 每档四条：正文那档字、未选那一档、白内框分离、开关那枚橙。
  // 后三条问的是"这一档能不能当深色面用"，不是"我画错没画错"——不过门槛就照实写清是哪一条结论，标越界、不混进画错。
  ...WALLS.flatMap((w, wi) => w.steps.flatMap((r) => {
    const sk = skinOf(r.hex), b = r.hex
    const light = cr(PAPER, b) < 4.5 ? '浅色面：纸白压不住这一档' : false
    const dead = light && cr('#23252C', b) < 4.5 ? '纸白与墨两头都不达标＝这一档字没法读' : false
    return [
      [w.label + ' ' + r.n + ' 档 ' + b + '：正文与选中那档字（' + (sk.ink === PAPER ? '纸白' : '墨') + '）', sk.ink, b, 4.5, dead, wi],
      [w.label + ' ' + r.n + ' 档：未选那一档（' + sk.ink + ' 压 ' + sk.ia + '）', mix(sk.ink, sk.ia, b), b, 4.5, light, wi],
      [w.label + ' ' + r.n + ' 档：白内框与它分得开吗', WHITE, b, 3.0, light, wi],
      [w.label + ' ' + r.n + ' 档：开关那枚拍照橙压得住吗', CAM, b, 3.0, '压不住那枚固定橙＝这一档不能当深色面', wi],
    ]
  })),
]

// 对比在 Node 这边算完再递给页面（页面里没有 palette.crOf，别在稿子脚本里现调）
const CONTRAST_ROWS = CONTRAST.map(([name, fg, bg, min, note, th]) => {
  const v = cr(fg, bg)
  return [name, fg, bg, min, v, v >= min ? 'ok' : (note ? 'note' : 'bad'), th == null ? -1 : th, typeof note === 'string' ? note : '']
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
  ${TOKENS};${PH0};--w:${WHITE};--cam:${CAM};--ext:${EXT}}
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
.yi .list{background:var(--dk);border-top:var(--w-edge) solid rgba(var(--si),.10)}

/* 区内顶那一行两枚 tab：现网 .vtabs 一个字没改（它就是"首页下划线文字"那把参照物） */
.vtabs{display:flex;gap:44px;padding:0 32px;flex:none;position:relative;
  border-bottom:2px solid rgba(35,37,44,.12)}
.vtabs span{font-size:var(--fs-meta);font-weight:600;letter-spacing:1px;color:rgba(35,37,44,.42);padding:22px 0 14px;position:relative}
.vtabs span.on{color:${I90};font-weight:700}
.vtabs span.on::after{content:'';position:absolute;left:0;right:0;bottom:-2px;height:4px;border-radius:2px;background:${I90}}
.vtabs .fold{margin-left:auto;align-self:center;font-size:var(--fs-meta);color:rgba(35,37,44,.42);padding:0}
.yi .vtabs{border-bottom-color:rgba(var(--si),.10)}
.yi .vtabs span{color:rgba(var(--si),var(--ia))}
.yi .vtabs span.on{color:rgb(var(--si))}
.yi .vtabs span.on::after{background:rgb(var(--si))}
.yi .vtabs .fold{color:rgba(var(--si),var(--ia))}

/* 分类那一行：撤胶囊，换成与上面同一种手法（文字 + 选中一条短杠）。
   与上面那行的分工：横线只有一条（在 tab 底下），分类这行不再自带通栏线——
   两行都压一条线就会被读成"两排 tab"，而分类是一排筛选、不是第二层导航。 */
.cats{display:flex;gap:40px;padding:20px 32px 16px;flex:none;align-items:baseline;overflow:hidden}
.cats span{position:relative;font-size:var(--fs-meta);font-weight:600;letter-spacing:1px;
  color:rgba(35,37,44,.42);padding-bottom:14px;white-space:nowrap;flex:none}
.cats span.on{color:${I90};font-weight:700}
.cats span.on::after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;border-radius:2px;background:${I90}}
.cats .fade{margin-left:auto;align-self:center;flex:none;font-size:var(--fs-micro);color:rgba(35,37,44,.35);padding:0}
.yi .cats span{color:rgba(var(--si),var(--ia))}
.yi .cats span.on{color:rgb(var(--si))}
.yi .cats span.on::after{background:rgb(var(--si))}
.yi .cats .fade{color:rgba(var(--si),.35)}

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
.yi .gcap{color:rgba(var(--si),.82)}

/* 详情那一层（浮窗与独立页共用一套块：白内框 + 里面一段段内容） */
.sheet{position:absolute;left:24px;right:24px;top:314px;bottom:152px;border-radius:32px;z-index:9;
  display:flex;flex-direction:column;overflow:hidden;background:var(--w)}
.jia .sheet{border:6px solid var(--dk)}
.yi .sheet{background:var(--dk);border:var(--w-edge) solid rgba(var(--si),.10)}
.yi .dsb{padding:0 26px}
.grip{flex:none;width:100%;height:56px;display:flex;align-items:center;justify-content:center;position:relative;
  background:var(--w)}
.yi .grip{background:transparent}
.grip .bar{width:88px;height:8px;border-radius:999px;background:rgba(35,37,44,.16)}
.yi .grip .bar{background:rgba(var(--si),.28)}
.grip span{position:absolute;right:34px;top:0;height:56px;display:flex;align-items:center;
  font-size:var(--fs-tiny);font-weight:700;letter-spacing:.4px;color:rgba(35,37,44,.42)}
.yi .grip span{color:rgba(var(--si),var(--ia))}
.dsb{flex:1;min-height:0;overflow:hidden;padding:0 34px}
.dsb .meta{margin-top:14px;font-size:var(--fs-meta);color:rgba(35,37,44,.5)}
.dsb h3{margin-top:8px;font-size:38px;font-weight:800;letter-spacing:-.9px;line-height:1.3;color:${I90}}
.yi .dsb h3{color:rgb(var(--si))}
.yi .dsb .meta{color:rgba(var(--si),var(--ia))}
/* 右上那一格＝出卡片的唯一入口（现网 app.wxss 的 .ds-rt / .ds-empty 那一整套：格 252×352、
   方片 176、"+" 56、品牌行 14/14）。10-07 起动作条只剩两枚，「生成笔记卡片」不再是按钮，
   画稿不许把它画回去（现网注释里就是站长那句"很多余"）。 */
.hero{display:flex;align-items:flex-start;gap:24px}
.hero .lt{flex:1;min-width:0}
.hero .lt .mt{font-size:var(--fs-meta);color:rgba(35,37,44,.5)}
.hero .lt .h1{margin-top:8px;font-size:38px;font-weight:800;letter-spacing:-.9px;line-height:1.3;color:${I90}}
.yi .hero .lt .mt{color:rgba(var(--si),var(--ia))}
.yi .hero .lt .h1{color:rgb(var(--si))}
.rt{flex:none;width:252px}
.rt .cell{box-sizing:border-box;width:252px;height:352px;border-radius:20px;background:var(--w);
  display:flex;flex-direction:column;align-items:center;justify-content:center}
.jia .rt .cell{box-shadow:inset 0 0 0 2px rgba(35,37,44,.16)}
.yi .rt .cell{background:color-mix(in srgb,#FFFFFF 7%,var(--dk))}
.rt .sw{position:relative;width:176px;height:176px;border-radius:28px;flex:none;
  border:var(--w-edge) solid rgba(35,37,44,.10);display:flex;align-items:center;justify-content:center}
.yi .rt .sw{border-color:rgba(var(--si),.10)}
/* 深面那一版：加号与品牌那颗圆点得跟着翻，否则 42% 的墨压在 #2B2D35 上等于没画（10-08 看图抓到） */
.yi .rt .sw u{color:rgba(var(--si),.42)}
.yi .rt .sw .lg i{background:rgb(var(--si));color:var(--dk)}
.rt .sw u{text-decoration:none;font-weight:200;font-size:56px;line-height:1;color:rgba(35,37,44,.42)}
.rt .sw .lg{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:6px}
.rt .sw .lg i{width:28px;height:28px;border-radius:50%;background:${DK};color:${PAPER};font-size:16px;
  font-style:normal;display:flex;align-items:center;justify-content:center}
.rt .sw .lg em{font-style:normal;font-size:var(--fs-micro);letter-spacing:1px;color:rgba(35,37,44,.45)}
.yi .rt .sw .lg em{color:rgba(var(--si),var(--ia))}
.rt .e1{display:block;margin-top:18px;text-align:center;font-size:var(--fs-meta);font-weight:700;color:${I90}}
.rt .e2{display:block;margin-top:4px;text-align:center;font-size:var(--fs-tiny);line-height:1.4;color:rgba(35,37,44,.45)}
.yi .rt .e1{color:rgb(var(--si))}
.yi .rt .e2{color:rgba(var(--si),var(--ia))}
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
.yi .dsd{background:var(--dk);border-top:var(--w-edge) solid rgba(var(--si),.10)}
.dsd .irow{display:flex;gap:14px}
.dsd .irow b{flex:1;height:72px;border-radius:var(--r-pill);display:flex;align-items:center;justify-content:center;
  white-space:nowrap;font-size:var(--fs-meta);font-weight:700;color:#23252C;background:var(--w);
  box-shadow:inset 0 0 0 var(--w-edge) var(--dk)}
.dsd .irow b.d{color:#b4231f;box-shadow:inset 0 0 0 var(--w-edge) rgba(180,35,31,.45)}
.yi .dsd .irow b{background:transparent;color:rgb(var(--si));box-shadow:inset 0 0 0 var(--w-edge) rgba(var(--si),.10)}
.dsd .pub{margin-top:18px;display:flex;align-items:center;justify-content:space-between;
  font-size:var(--fs-micro);color:rgba(35,37,44,.5)}
.yi .dsd .pub{color:rgba(var(--si),var(--ia))}
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
.yi .qrow .tx b{color:rgb(var(--si))}
.qrow .tx i{font-style:normal;display:block;margin-top:4px;font-size:var(--fs-meta);line-height:1.4;color:rgba(35,37,44,.55)}
.yi .qrow .tx i{color:rgba(var(--si),var(--ia))}
.pill{width:92px;height:52px;border-radius:999px;background:rgba(35,37,44,.14);position:relative;flex:none}
.pill u{position:absolute;left:6px;top:6px;width:40px;height:40px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.pill.on{background:${CAM}}
.pill.on u{transform:translateX(40px)}
.yi .pill{background:rgba(var(--si),.18)}
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
.yi .sact b.s2{color:rgb(var(--si));background:transparent;box-shadow:inset 0 0 0 var(--w-edge) rgba(var(--si),.10)}
/* 删除那一枚：浅面沿用现网 #b4231f（压白 6.56），深面换成 #e57368（压深 5.09）。
   现网在深面上没画过这一枚，所以这一档是本稿新定的，实测表里有这两行。 */
.sact b.s2.d,.yi .sact b.s2.d{color:#b4231f;box-shadow:inset 0 0 0 var(--w-edge) rgba(180,35,31,.45)}
.yi .sact b.s2.d{color:var(--danger);box-shadow:inset 0 0 0 var(--w-edge) var(--danger-edge)}
.yi .dsd .irow b.d{color:var(--danger);box-shadow:inset 0 0 0 var(--w-edge) var(--danger-edge)}
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
.zoom .strip2.on-dark{background:${WALLS[0].bar}}
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
table.m td.ok{color:#1c6b3a}table.m td.bad{color:#b4231f}table.m td.soft{color:#8a6d1f}
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
/* 六档色阶，每档两屏（笔记列表 + 详情浮窗），让他横着比；
   这一版只画笔记列表一屏（他说别的屏不用等），四套壁纸各一排。 */
const skinNote = (r) => {
  const sk = skinOf(r.hex)
  const who = sk.ink === PAPER ? '字走纸白' : '字翻成墨'
  const fade = sk.ia >= .92 ? '，但「未选」那一档淡不下去（只能上到 ' + sk.ia + '）' : ''
  const orange = cr(CAM, r.hex) >= 3 ? '' : '，开关那枚橙压不住（' + cr(CAM, r.hex) + '）'
  return (r.bar ? '＝底栏那一支' : '') + who + fade + orange
}
const wallRow = (w, wi) => `<div class="pt"><span class="k">${w.label}</span>
    <span class="t">底栏 <code>${w.bar}</code>（${w.steps[5].hsl}）· 同色系六档，从浅到深</span>
    <span class="desc">这一排的底色全部取自底栏那一支的色相与饱和，只动明度（<code>L78 → L${Math.round(rgb2hsl(w.bar)[2])}</code>），第六档就是底栏本身。底栏、选中那枚圆底、搜索条仍按现网 <code>palette.chromeOf('${w.key}')</code> 一个字没动。</span></div>
  <div class="row">${w.steps.map((r, i) => cell(
    `t${wi}s${i}`,
    `<span class="tag">${r.n} 档</span><b>${r.hex}</b>　${r.hsl}　白框分离 <code>${cr(WHITE, r.hex)}</code>　${skinNote(r)}`,
    listPhone('yi', 1, 0, phStyle(w.key, r.hex)))).join('')}</div>`
const rowsHtml = `<div class="plan"><div class="pt"><span class="k">这一版改的</span>
    <span class="t">底色不再另挑色相，一律从<b>底栏那一支的色系</b>里推</span>
    <span class="desc">上一版我挑了支 H340 的粉压在底栏上，同一屏两个不相干的色相——你这句是对的。这一版四套壁纸各一排：每排的六档全部取那一套底栏自己的 H 与 S（<code>palette.chromeOf()</code> 从壁纸页面底派生出来的那支），只动明度从浅到深，<b>第六档＝底栏那一支本身</b>，也就是层与栏同色、整屏一个色系。每档仍配它自己那套字：浅到纸白压不住底，字就翻成墨。只画笔记列表这一屏。</span></div>
  ${WALLS.map(wallRow).join('')}
  <div class="row" style="margin-top:-14px"><div class="cap" style="width:100%">读法：每一排从左到右是同一条色阶从浅到深。<b>1~2 档实质是"浅色面"</b>（白内框与底分不开、那枚橙压不住，走的是甲案那套皮）；<b>3~4 档是交界</b>；<b>5~6 档才是"深色面"</b>。哪一排的色相你也可能整排都不要——那是另一件事，你说，我换那一套壁纸的色相重出。</div></div>
</div>`

/* 实测表：宽度由页面自己量（Range 只圈字），对比由 palette.crOf 现算 */
const METRICS = `
<div class="plan"><div class="pt"><span class="k">实测</span><span class="t">字放得进吗 · 字压得住底吗</span>
  <span class="d">宽度这一列由页面自己量（<code>Range</code> 只圈文字、<code>clientWidth − 内缩</code> 取可用宽）；对比由 <code>palette.crOf</code> 现算，半透明字先按实际底色混成实心再算。对比表按四套壁纸分成四张，免得一百多行竖着排。</span></div>
  <div class="row" style="flex-wrap:wrap;align-items:flex-start">
    <div class="cell" style="width:1120px"><table class="m"><thead><tr><th>量的是哪一句</th><th>屏上那一串</th><th>落在哪个容器</th><th>字宽／可用</th><th>判定</th></tr></thead><tbody id="mtb"></tbody></table></div>
    <div class="cell" style="width:1120px"><table class="m"><thead><tr><th>与底色无关的那几条</th><th>字</th><th>压底</th><th>对比／门槛</th><th>判定</th></tr></thead><tbody id="ctbx"></tbody></table></div>
    ${WALLS.map((w, i) => `<div class="cell" style="width:1120px"><table class="m"><thead><tr><th>${w.label} 六档</th><th>字</th><th>压底</th><th>对比／门槛</th><th>判定</th></tr></thead><tbody id="ctb${i}"></tbody></table></div>`).join('')}
  </div></div>`

const usable = (w) => w.steps.filter((r) => cr(WHITE, r.hex) >= 3 && cr(CAM, r.hex) >= 3)
const deadSteps = WALLS.flatMap((w) => w.steps.filter((r) => cr(PAPER, r.hex) < 4.5 && cr('#23252C', r.hex) < 4.5)
  .map((r) => `${w.label} ${r.n} 档 <code>${r.hex}</code>（纸白 ${cr(PAPER, r.hex)}、墨 ${cr('#23252C', r.hex)}）`))
const LEGEND = [
  `<b>这一版按你这句话改的：</b>"你为啥要用粉红？不能用底部的 BAR 的色系来处理吗？"——上一版那支 H340 是我自己挑的，跟底栏没关系，同一屏两个色相，这条批评成立。这一版<b>不挑色相了</b>：四套壁纸各取自己底栏那一支（<code>palette.chromeOf()</code> 由壁纸页面底派生：H 原样、S 夹进 [30,45]、L 20.5）的 H 与 S，只动明度出六档，<b>第六档＝底栏那一支本身</b>。`,
  `<b>只画笔记列表一屏</b>（你说不用等别的屏）：四排 × 六台，每排从左到右是同一条色阶从浅到深。详情浮窗、卡片页那几屏这一版没有，等你指了档再画。`,
  `<b>四套壁纸的底栏各是什么：</b>${WALLS.map((w) => `${w.label} <code>${w.bar}</code>（${w.steps[5].hsl}）`).join('；')}。所以这四排不是同一支色变浅变深，是<b>四条各自的色阶</b>——你日常用哪套壁纸，就看哪一排。`,
  `<b>每一档配它自己那套字：</b>纸白压不住底的那几档，屏上的字翻成墨（钉进断言：${WALLS.map((w, i) => `${w.label} 1 档 <code>rgba(35,37,44,${skinOf(w.steps[0].hex).ia})</code>／6 档 <code>rgba(242,239,233,${skinOf(w.steps[5].hex).ia})</code>`).join('，')}）。`,
  `<b>能选的是哪几档（白内框分离 ≥3 且那枚开关橙 ≥3）：</b>${WALLS.map((w) => `${w.label}：${usable(w).map((r) => r.n + ' 档 ' + r.hex).join('、') || '没有一档够'}`).join('；')}。浅的那几档我照样画出来，表里标"越界"并写明是哪一条结论——那是结论，不是我把图画坏了。`,
  deadSteps.length ? `<b>中间有一带字根本没法读：</b>${deadSteps.join('；')}——纸白与墨在这几档上都不到 4.5，所以这几档既不是浅色面也不是深色面，<b>整档排除</b>。上一版我按 H340 一支色算，没暴露这一带；四套色相一起算才撞出来。` : '',
  `<b>底栏、选中那枚圆底、搜索条仍按现网 <code>chromeOf(壁纸)</code> 一个字没动</b>；白内框里所有字、那两枚固定橙、分类那一行的"文字 + 短杠"全部照 v23 的乙案。<b>这一版唯一的新东西就是"底色从底栏那一支推"这条规则本身。</b>`,
  `<b>落地状态与下一步：</b>仍是效果图，代码一行没动。你指一排里的第几档（或者说"象牙这排 5、6 档之间再来一档"），我把 v23 那三条 + 这一档一起落进代码：列表／详情那层的底色改成从 <code>chromeOf()</code> 派生、<code>createSkin()</code> 那两行固定橙、删除那枚红按档走，然后把钉着壁纸色阶的那批尺子重锚。`,
]

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>底色跟底栏同色系：四套壁纸各一条色阶 · v28</title><style>${CSS}</style></head><body>
<h1><i></i>不另挑色相了：底色一律从底栏那一支的色系里推，四套壁纸各六档从浅到深</h1>
<div class="lead"><b>先说落地状态</b>：真机现在跑<b>线上 1.9.29</b>（后台实据 发布 10-07 19:32:01），<b>2.0.0 已提审、正在审核中</b>（10-07 22:31:26）。<b>这一稿只是效果图，代码一行没动</b>；v23 那三条已拍的决定（白内框、分类下划线文字、拍照与提炼固定橙）原样保留，也还没落进 <code>createSkin()</code>。</div>
<div class="lead"><b>这一版在比什么</b>：上一版我自挑了一支 H340 的粉压在底栏上，同一屏两个不相干的色相——你这一句批评我认。这一版<b>底色全部从底栏那一支的色系推</b>：四套壁纸各取自己底栏的 H 与 S（现网 <code>palette.chromeOf()</code> 就是由壁纸页面底派生的），只动明度出六档，<b>第六档就是底栏本身那支</b>，层与栏同色。只画笔记列表一屏，四排 × 六台。<b>每一档配它自己那套字</b>——浅到纸白压不住底，字就翻成墨。尺子仍全部现读：字号／圆角／描边宽 = <code>app.wxss</code> 的 <code>page{}</code>；底栏 = <code>palette.chromeOf(壁纸)</code>；界面话 = <code>utils/i18n.js</code> 的 zh 键；只有"底色从底栏推"这条是本稿提的新规则，所以 24 台各自压的每处字、那两枚橙都逐台算对比。手机框 750×1670 = 1px:1rpx，与 v19／v22／v23／v24／v25／v26／v27 同一套尺。</div>
<div id="app">${rowsHtml}${METRICS}</div>
<div class="legend" id="lg"></div>
<script>
window.addEventListener('error',function(e){document.title='PAGE-ERROR: '+e.message+' @ line '+e.lineno})
/*__GEN_BEGIN__*/
var LEGEND=${JSON.stringify(LEGEND.filter(Boolean))};
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
  (function(){var box=document.querySelector('#t0s0 .cats');
    if(!box){rows.push(['分类四枚加起来','象牙 1 档那台','（找不到节点）','—','bad']);return}
    var s=box.children,t=0;for(var i=0;i<s.length;i++)t+=textW(s[i]);
    var bw=inner(box)-(s.length-1)*40;
    rows.push(['分类四枚加起来',Array.prototype.map.call(s,function(e){return e.textContent}).join(' / '),
      '区内净宽（gap 40 已扣）',t.toFixed(1)+' / '+bw.toFixed(1),(t>0.5&&t<=bw+0.5)?'ok':'bad'])})()
  one('两枚 tab + 收起那一句','#t0s0 .vtabs','#t0s0 .list','区内那一行（含右边「点一下收起」）')
  one('Tips 那一行','#t0s0 .tp span','#t0s0 .tp','头部那一行（含左端那枚点）')
  ${WALLS.map((w, wi) => `one('${w.label} · 3 档标题','#t${wi}s2 .xm .t','#t${wi}s2 .xm','白内框里那一列（现网 nowrap + 省略号）',true)
  one('${w.label} · 6 档标题','#t${wi}s5 .xm .t','#t${wi}s5 .xm','同上',true)`).join('\n  ')}
  // 这一组不问"字放得进吗"，问"这条规则真的落到屏幕上了吗"（v23 那批选择器少个点号就整层没变深，
  // 只量字宽的表全绿，是肉眼看图才发现的）。
  function sty(key,sel,prop,want,pseudo){var el=document.querySelector(sel);
    if(!el){rows.push([key,'（找不到节点 '+sel+'）','计算样式','—','bad']);return}
    var got=getComputedStyle(el,pseudo||null)[prop];
    var norm=String(got).replace(/\s+/g,' ').trim().toLowerCase(), okn=String(want).toLowerCase();
    // 以 ~ 开头＝只要求包含（box-shadow 各浏览器把 inset 排前排后不一样，逐字比会假红）
    var ok=okn[0]==='~'?norm.indexOf(okn.slice(1))>-1:norm===okn
    rows.push([key,sel+' 的 '+prop,'落到屏幕上是什么（要等于右边）',norm+'　要　'+okn,ok?'ok':'bad'])}
  // 二十四台，每台屏上实际吃到的底色逐台钉死（浅档要被 CSS 覆盖成同一支，这里就会红）
  ${WALLS.map((w, wi) => w.steps.map((r, i) => `sty('${w.label} ${r.n} 档 ${r.hex} 落到屏上','#t${wi}s${i} .list','backgroundColor','${rgbOf(r.hex)}')`).join('\n  ')
    + `\n  sty('${w.label} 1 档的字实际吃到哪套','#t${wi}s0 .cats span','color','${rgbaOf(skinOf(w.steps[0].hex).ink, skinOf(w.steps[0].hex).ia)}')`
    + `\n  sty('${w.label} 6 档的字实际吃到哪套','#t${wi}s5 .cats span','color','${rgbaOf(skinOf(w.steps[5].hex).ink, skinOf(w.steps[5].hex).ia)}')`
    + `\n  sty('${w.label} 底栏选中那枚圆底仍是现网 ${w.sel}','#t${wi}s5 .bar2 u.on','backgroundColor','${rgbOf(w.sel)}')`
    + `\n  sty('${w.label} 6 档那一台：底栏面与列表层同色','#t${wi}s5 .bar2','backgroundColor','${rgbOf(w.bar)}')`).join('\n  ')}
  sty('白内框在这版里不另描边','#t0s5 .xrow','borderTopWidth','0px')
  sty('深底顶上有那条 3rpx 边','#t0s5 .list','borderTopWidth','3px')
  sty('分类选中那一枚的短杠高度','#t0s5 .cats span.on','height','4px','::after')
  sty('分类选中那一枚的短杠颜色','#t0s5 .cats span.on','backgroundColor','${rgbOf(skinOf(WALLS[0].steps[5].hex).ink)}','::after');
  // 这一版只画笔记列表，浮窗／卡片页那几屏的探针（动作条两枚等宽、右上入口格、模板那一排）在这一稿没有节点，
  // 等你指了档、把那几屏画回来时再一起钉回去（动作条两枚等宽那条 IIFE 探针随浮窗一起撤了）
  return rows};
(function(){
  var rows=window.__metrics(),bad=0,tb=document.getElementById('mtb')
  var H={mtb:'',ctbx:'',ctb0:'',ctb1:'',ctb2:'',ctb3:''}
  rows.forEach(function(r){if(r[4]==='bad')bad++;
    H.mtb+='<tr><td class="k">'+r[0]+'</td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td class="'+(r[4]==='bad'?'bad':'ok')+'">'+(r[4]==='ok'?'放得进':(r[4]==='soft'?'截断（设计如此）':'放不下／没落地'))+'</td></tr>'});
  // 对比表按壁纸分成四张（一百多行竖着排会把整页撑到看不完）；与底色无关的那几条进 ctbx
  CONTRAST.forEach(function(c){var ok=c[5]==='ok',note=c[5]==='note';if(!ok&&!note)bad++;
    var k=c[6]<0?'ctbx':('ctb'+c[6]);
    H[k]+='<tr><td class="k">'+c[0]+'</td><td>字 '+c[1]+'</td><td>压底 '+c[2]+'</td><td>对比 '+c[4]+' / 门槛 '+c[3]+'</td><td class="'+(ok?'ok':(note?'soft':'bad'))+'">'+(ok?'过':(note?('越界：'+c[7]):'不过'))+'</td></tr>'});
  TOK.forEach(function(t){H.mtb+='<tr><td class="k">令牌 '+t[0]+'</td><td>'+t[1]+'</td><td>app.wxss 的 page{}</td><td>—</td><td class="ok">本稿用的就是这个值</td></tr>'});
  Object.keys(H).forEach(function(k){var e=document.getElementById(k);if(!e)throw new Error('表没了：'+k);e.innerHTML=H[k]});
  var f=document.createElement('div');f.id='metricflag';f.style.cssText='font-size:14px;color:#5c6068;margin-top:10px';
  var notes=CONTRAST.filter(function(c){return c[5]==='note'}).length
  f.textContent=(bad?'METRICS-BAD ':'METRICS-OK ')+'宽度 '+rows.length+' 串 + 对比 '+CONTRAST.length+' 组，画错 '+bad+' 条（浅档那 '+notes+' 条是越界结论，另计）';
  tb.closest('table').parentNode.appendChild(f)})();
(function(){var d=document.documentElement;
  document.title='DIM '+Math.max(d.scrollWidth,document.body.scrollWidth)+'x'+Math.max(d.scrollHeight,document.body.scrollHeight)})();
</script></body></html>`

const OUT = path.join(DIR, 'v28-底色跟底栏同色系.html')
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
const tmp = path.join(DIR, '.probe-v28.html')
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
// 只读那六张 tbody：整份 dump 里脚本源码自己也写着 <tr><td…
const bodies = [...fin.dump.matchAll(/<tbody id="(mtb|ctbx|ctb[0-3])">([\s\S]*?)<\/tbody>/g)]
if (bodies.length !== 6) { console.error(`✗ 只找到 ${bodies.length} 张表，应为 6 张（宽度样式＋对比五张）`); process.exit(1) }
const rows = bodies.flatMap((b) => [...b[2].matchAll(/<tr><td class="k">([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td class="(ok|bad|soft)">([\s\S]*?)<\/td><\/tr>/g)]
  .map((m) => ({ k: m[1], s: m[2], box: m[3], v: m[4], bad: m[5] === 'bad', verdict: m[6] })))
// 11 宽（分类四枚 1 + 两枚 tab 1 + Tips 1 + 每套标题两档 8）+ 44 样式（每台底色 24 + 字两套 8 + 底栏圆底 4 + 底栏面＝6 档 4 + 列表那层两条边与短杠 4）
if (rows.length !== 55 + CONTRAST_ROWS.length + TOKEN_COUNT) {
  console.error(`✗ 表里只有 ${rows.length} 行，页面没把该量的量全（应为 11 宽 + 44 样式 + 对比 ${CONTRAST_ROWS.length} + 令牌 ${TOKEN_COUNT}）`); process.exit(1)
}
console.log('\n实测（宽度由页面自己量 · 对比由 palette.crOf 现算 · 令牌由 app.wxss 核对）：' + fin.flag)
rows.forEach((r) => console.log(`  ${r.bad ? '✗' : '✓'} ${r.k.slice(0, 26).padEnd(28)} ${r.s.slice(0, 22).padEnd(24)} ${r.v.padEnd(24)} ${r.box.slice(0, 26)}`))
if (rows.some((r) => r.bad)) { console.error('✗ 有放不进或对比不过的，图可以给人看，但结论是红的'); process.exitCode = 1 }
fs.unlinkSync(tmp)

const shot = '/tmp/v28-raw.png'
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
