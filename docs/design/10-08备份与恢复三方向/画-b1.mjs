// 2.1「备份与恢复」那一格：三个方向的效果图（同一套皮，只差结构与步数）。
// 跑法：node docs/design/10-08备份与恢复三方向/画-b1.mjs
//
// 站长 10-08 拍的三条口径直接进稿，不再问第二遍：加密按常规（界面上不出现密钥口令）、
// 邮箱不做归属验证（发错重发）、减少用户使用门槛是关键。
// 首页/列表/详情那条链另一支 agent 正在跑 v23→v30，这一轮不碰它，只出 2.1 新增的那一屏。
//
// 尺子全部现读，脚本里不写第二个数：
//   字号/圆角/描边/间距 = miniprogram/app.wxss 的 page{} + .theme-tint-paper（象牙那一档）
//   界面话 = miniprogram/utils/i18n.js 的 zh 键（字典里没有的键一律标"新拟"，不混进现网话里）
//   底栏 = palette.chromeOf('tint-paper')；那枚黄点 = palette.TIP_DOT
//   头部那一段图 = assets/home-bg-portrait.jpg 真件 + poster.js 的 bandGeom 同一条公式
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
const ZH = i18n.texts('zh')

/* ---------------- 一、令牌：从 app.wxss 现读 ---------------- */
const APP = fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8')
function blockOf(sel) {
  const re = new RegExp('(?:^|\\n)' + sel.replace(/[.{}()]/g, '\\$&') + '\\s*\\{([^}]*)\\}')
  const m = re.exec(APP)
  if (!m) throw new Error(`app.wxss 里读不到 ${sel}，这份稿子的尺子来源变了`)
  return m[1]
}
const parse = (body) => {
  const o = {}
  for (const m of body.matchAll(/(--?[a-z0-9-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim()
  return o
}
const BASE = parse(blockOf('page'))
const IVORY = parse(blockOf('.theme-tint-paper'))
const TOK = { ...BASE, ...IVORY }
const rpx2px = (v) => String(v).replace(/rpx\b/g, 'px')
const TOKEN_KEYS = ['--fs-h1', '--fs-h2', '--fs-title', '--fs-body', '--fs-meta', '--fs-tiny', '--fs-label', '--fs-micro',
  '--sp-2', '--sp-3', '--sp-4', '--r-card', '--r-chip', '--r-pill', '--w-edge',
  '--bg-page', '--bg-card', '--text-primary', '--text-secondary', '--text-tertiary', '--card-edge', '--accent', '--accent-soft', '--chip-idle', '--btn-bg', '--danger']
TOKEN_KEYS.forEach((k) => { if (!TOK[k]) throw new Error(`app.wxss 里读不到令牌 ${k}`) })
const TOKENS = TOKEN_KEYS.map((k) => `${k}:${rpx2px(TOK[k])}`).join(';')
const V = (k) => TOK[k]

/* ---------------- 二、界面话：现网字典 ---------------- */
const T = (k) => {
  if (!(k in ZH)) throw new Error(`i18n 里没有键 ${k}`)
  return ZH[k]
}
// 本稿新拟的话：字典里还没有，所以单独一个表，屏上要用别的颜色标出来（不冒充现网话）
const NEW = {
  backupRow: '备份与恢复',
  backupHint: '存一份文件，发到邮箱',
  backupState: '上次备份 10-06 21:14 · 24 篇已加密',
  backupSend: '备份并发送到邮箱',
  backupPick: '选文件恢复',
  backupSent: '已发到 630***@qq.com，去邮箱收',
  backupBusy: '正在打包…',
  backupNote: '加密的一份文件，换手机后用它拿回笔记。',
  restoreSteps: '1 打开那封邮件，把附件转存到微信聊天　2 回到这里点「选文件恢复」　3 选中那个文件',
  restoreDone: '恢复了 12 篇，另外 12 篇本来就在',
  backupMailTo: '发到这个邮箱',
  backupCancel: '取消',
}
const NEWKEYS = Object.keys(NEW)

/* ---------------- 三、底栏 / 那枚黄点 / 头部那张图 ---------------- */
const CH = palette.chromeOf('tint-paper')
const TIP = palette.TIP_DOT
const BG = path.join(MP, 'assets', 'home-bg-portrait.jpg')
const [bgW, bgH] = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', BG], { encoding: 'utf8' })
  .split('\n').filter((l) => /pixel(Width|Height)/.test(l)).map((l) => Number(l.split(':')[1].trim()))
// poster.js 的 bandGeom(1116,1920,542) 同一条公式，抄过来是为了不再"凭印象摆图"
const BAND_H = 542, ANCHOR = 0.15
const byWidth = (750 * bgH) / bgW
const IMG = byWidth >= BAND_H
  ? { w: 750, h: Math.round(byWidth), left: 0, top: -Math.round((byWidth - BAND_H) * ANCHOR) }
  : { w: Math.round((BAND_H * bgW) / bgH), h: BAND_H, left: Math.round((750 - (BAND_H * bgW) / bgH) / 2), top: 0 }
const BG64 = 'data:image/jpeg;base64,' + fs.readFileSync(BG).toString('base64')
const DIM = palette.BG_DIMS ? palette.BG_DIMS[1].veil : 0.5 // 默认中档（半月）：现网那一档

const ref64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, 'ref', f)).toString('base64')

/* ---------------- 四、三个方向共用的那一屏（「我的」·设置档） ---------------- */
const NAV = `<div class="nav"><span class="t">15:20</span><span class="capsule"><i></i><i></i></span></div>`
const BAND = `<img class="bgimg" style="width:${IMG.w}px;height:${IMG.h}px;left:${IMG.left}px;top:${IMG.top}px" src="${BG64}">
  <div class="scrim" style="opacity:${DIM}"></div>`
const HEAD = `
  <div class="head-band">
    ${BAND}
    <div class="h1 fit">${T('pillSettings')}</div>
    <div class="score"><span class="n">128</span><span class="l fit">${T('brainScore')}</span></div>
  </div>
  <div class="sheet">
    <div class="logo"></div>
    <div class="st"><span class="nm fit">赵龙飞</span><span class="sl fit">${T('slogan')}</span></div>
    <div class="pill"><span class="seg on fit">${T('pillSettings')}</span><span class="seg fit">${T('pillAbout')}</span></div>
  </div>`
const row = (label, hint, extra = '') => `
  <div class="menu-item"><span class="menu-label fit">${label}</span>
    <span class="menu-right">${hint ? `<span class="menu-hint fit">${hint}</span>` : ''}<span class="ico"><span class="cv"></span></span></span>
  </div>${extra}`
const emailRow = (open) => `
  <div class="menu-item ${open ? 'open' : ''}"><span class="menu-label fit">${T('myEmail')}</span>
    <span class="menu-right"><span class="menu-value fit">630***@qq.com</span><span class="ico"><span class="cv"></span></span></span>
  </div>`
const backupRow = (open) => `
  <div class="menu-item ${open ? 'open' : ''} bk"><span class="menu-label fit">${NEW.backupRow}</span>
    <span class="menu-right"><span class="menu-hint fit new">${NEW.backupHint}</span><span class="ico"><span class="cv"></span></span></span>
  </div>`
const MENU_TOP = row(T('navProfile'), T('navProfileTip')) + row(T('wallpaper'), T('wallpaperTip')) +
  row(T('categories'), T('categoriesTip')) + row(T('privatePassword'), T('privatePasswordTip'))
const MENU_BOT = row(T('deleteAccount'), '')
const BAR = `
  <div class="bar2" style="${CH.style}">
    <u><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg></u>
    <u><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></u>
    <u class="on"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 19c1.6-3.2 4-4.6 6.5-4.6s4.9 1.4 6.5 4.6"/></svg></u>
  </div>`

// 展开块里的两枚动作：主＝实心（现网 --btn-bg），次＝右端浅色文字（抄 Cubox 那一行）
const btnPrimary = `<div class="bk-main fit">${NEW.backupSend}</div>`
const btnGhost = `<span class="bk-ghost fit">${NEW.backupPick}</span>`

const artA = `
  ${NAV}${HEAD}
  <div class="menu-group card">
    ${MENU_TOP}${emailRow(false)}${backupRow(false)}${MENU_BOT}
  </div>
  <div class="mask"><div class="card panel">
    <div class="p-name fit">${NEW.backupRow}</div>
    <div class="p-state fit new">${NEW.backupState}</div>
    <div class="p-note fit new">${NEW.backupNote}</div>
    <div class="p-two"><div class="p-btn ghost fit">${NEW.backupCancel}</div><div class="p-btn pri fit new">${NEW.backupSend}</div></div>
    <div class="p-link fit new">${NEW.backupPick}</div>
  </div></div>
  ${BAR}`

const artB = `
  ${NAV}${HEAD}
  <div class="menu-group card">
    ${MENU_TOP}${emailRow(false)}${backupRow(true)}
    <div class="bk-open">
      <div class="bk-state fit new">${NEW.backupState}</div>
      ${btnPrimary}
      <div class="bk-under"><span class="bk-note fit new">${NEW.backupNote}</span>${btnGhost}</div>
    </div>
    ${MENU_BOT}
  </div>
  ${BAR}`

const artC = `
  ${NAV}
  <div class="head-band">${BAND}
    <div class="sub-nav"><span class="back"></span><span class="fit new">${NEW.backupRow}</span></div>
  </div>
  <div class="card grp"><div class="g-lab fit new">${NEW.backupRow}</div>
    <div class="bk-state fit new">${NEW.backupState}</div>
    ${btnPrimary}
    <div class="bk-note c fit new">${NEW.backupNote}</div>
  </div>
  <div class="card grp"><div class="g-lab fit new">${NEW.backupPick}</div>
    <div class="steps fit new">${NEW.restoreSteps}</div>
    <div class="p-btn ghost wide fit new">${NEW.backupPick}</div>
  </div>
  ${BAR}`

const DIRS = [
  ['甲', '弹层那一层', '几何照现网「我的邮箱」那一层，两枚等宽按钮；「选文件恢复」压成底下一行小字。', artA],
  ['乙', '就地摊开', '行点开就在下面长出那一块：状态一行 + 一枚实心主按钮 + 右端一枚浅色「选文件恢复」，不开新的一层。', artB],
  ['丙', '独立一屏', '进去是两张卡（备份／恢复），恢复那张把"转存到微信聊天"那三步写全。', artC],
]

/* ---------------- 五、样式（一套皮，三个方向共用） ---------------- */
const STY = `
*{margin:0;padding:0;box-sizing:border-box}
body{background:#EDEAE3;font-family:-apple-system,"PingFang SC",sans-serif;color:#23252C;padding:44px}
h1{font-size:38px;letter-spacing:-1px}
.lead{width:2320px;margin:14px 0 26px;font-size:19px;line-height:1.62;color:#4A4C55}
.lead b{color:#23252C}
.refs{display:flex;gap:26px;margin-bottom:34px}
.refs figure{width:296px}
.refs img{width:296px;border-radius:14px;border:1px solid #C9C5BC}
.refs figcaption{font-size:16px;line-height:1.5;color:#4A4C55;margin-top:9px}
.refs figcaption b{color:#23252C}
.arts{display:flex;gap:40px;align-items:flex-start}
.art{width:750px;flex:none}
.art .cap{font-size:20px;line-height:1.5;color:#4A4C55;margin:12px 0 14px;width:750px}
.art .cap b{color:#23252C;font-size:23px}
.ph{width:750px;height:1670px;border-radius:60px;overflow:hidden;position:relative;
  outline:2px solid #B9B6AF;background:var(--bg-page);${TOKENS}}
.nav{position:absolute;left:0;right:0;top:0;height:88px;z-index:9;display:flex;align-items:center;
  justify-content:space-between;padding:0 32px;font-size:26px;font-weight:700;color:rgba(242,239,233,.95)}
.nav .capsule{width:174px;height:46px;border-radius:999px;background:rgba(255,255,255,.2);
  border:1px solid rgba(0,0,0,.08);display:flex;align-items:center;justify-content:space-evenly}
.nav .capsule i{width:9px;height:9px;border-radius:50%;background:rgba(35,37,44,.7)}
.head-band{position:relative;height:542px;overflow:hidden;background:var(--bg-page)}
.bgimg{position:absolute;object-fit:cover}
.scrim{position:absolute;left:0;right:0;top:0;bottom:0;
  background:linear-gradient(180deg,rgba(18,20,26,.58) 0%,rgba(18,20,26,.58) 14%,rgba(18,20,26,.5) 58%,rgba(18,20,26,.44) 100%)}
.h1{position:absolute;left:var(--sp-4);top:110px;z-index:4;font-size:var(--fs-h1);font-weight:700;letter-spacing:-1px;color:rgba(242,239,233,.96)}
.score{position:absolute;right:32px;top:104px;z-index:4;text-align:center}
.score .n{display:block;font-size:64px;font-weight:100;line-height:.86;color:rgba(242,239,233,.74)}
.score .l{display:block;margin-top:10px;font-size:var(--fs-micro);font-weight:700;letter-spacing:4px;color:rgba(242,239,233,.62)}
.sheet{position:relative;margin-top:-40px;height:144px;padding:0 56px;display:flex;align-items:center;gap:24px;
  background:var(--bg-page);border-radius:var(--r-card) var(--r-card) 0 0;z-index:5}
.sheet .logo{flex:none;width:80px;height:80px;border-radius:50%;background:#23252C}
.sheet .st{display:flex;flex-direction:column;gap:7px;flex:1;min-width:0}
.sheet .nm{font-size:var(--fs-title);font-weight:800;letter-spacing:-.4px;line-height:1.25;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sheet .sl{font-size:var(--fs-meta);line-height:1.4;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill{flex:none;display:flex;gap:4px;padding:5px;border-radius:var(--r-pill);background:rgba(35,37,44,.055)}
.seg{height:58px;line-height:58px;padding:0 24px;border-radius:var(--r-pill);font-size:var(--fs-meta);font-weight:700;color:var(--text-secondary);white-space:nowrap}
.seg.on{background:var(--accent);color:var(--bg-page)}
.card{background:var(--bg-card);color:var(--text-primary);border:var(--w-edge) solid var(--card-edge);
  border-radius:var(--r-card);padding:var(--sp-3) var(--sp-4) var(--sp-4);margin:24px;overflow:hidden}
.menu-group{padding:0 var(--sp-4)}
.menu-item{display:flex;align-items:center;justify-content:space-between;height:106px;border-bottom:var(--w-edge) solid var(--card-edge)}
.menu-label{font-size:var(--fs-body);font-weight:700;letter-spacing:-.3px;color:var(--text-primary);white-space:nowrap}
.menu-hint{margin-left:auto;margin-right:12px;font-size:var(--fs-tiny);color:var(--text-tertiary);white-space:nowrap}
.menu-value{font-size:var(--fs-tiny);color:var(--text-tertiary);white-space:nowrap}
.menu-right{display:flex;align-items:center;gap:18px;min-width:0}
.ico{flex:none;width:46px;height:46px;display:flex;align-items:center;justify-content:center}
.cv{width:13px;height:13px;border-right:4px solid var(--text-tertiary);border-bottom:4px solid var(--text-tertiary);transform:rotate(-45deg);margin-left:-4px}
.menu-item.open{background:var(--accent-soft)}
/* 带这枚黄点的字是本稿新拟的话（现网字典里还没有）——不冒充现网话 */
.new::after{content:'';display:inline-block;width:9px;height:9px;border-radius:50%;background:${TIP};margin-left:9px;vertical-align:1px}
/* 甲：弹层（几何照 me.wxss 的 .me-email-mask / .me-email-card） */
.mask{position:absolute;left:0;right:0;top:0;bottom:0;background:rgba(20,20,28,.55);display:flex;align-items:flex-start;justify-content:center;z-index:20}
.panel{width:620px;margin-top:180px;box-shadow:0 18px 44px rgba(8,10,14,.22)}
.p-name{font-size:var(--fs-h2);font-weight:700;letter-spacing:-.6px;color:var(--text-primary)}
.p-state{margin-top:12px;font-size:var(--fs-tiny);color:var(--text-secondary)}
.p-note{margin-top:14px;font-size:var(--fs-tiny);line-height:1.55;color:var(--text-secondary)}
.p-two{margin-top:34px;display:flex;gap:var(--sp-2)}
.p-btn{flex:1;height:96px;border-radius:var(--r-chip);display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:700}
.p-btn.ghost{background:var(--chip-idle);color:var(--text-primary)}
.p-btn.pri{background:var(--btn-bg);color:#FFFFFF}
.p-btn.wide{flex:none;width:100%;margin-top:26px}
.p-link{margin-top:26px;text-align:center;font-size:var(--fs-tiny);color:var(--text-secondary)}
/* 乙：就地摊开那一块 */
.bk-open{padding:22px 0 26px}
.bk-state{font-size:var(--fs-tiny);color:var(--text-secondary)}
.bk-main{margin-top:16px;height:96px;border-radius:var(--r-chip);background:var(--btn-bg);color:#FFFFFF;
  display:flex;align-items:center;justify-content:center;font-size:var(--fs-body);font-weight:700}
.bk-under{margin-top:16px;display:flex;align-items:center;gap:18px}
.bk-note{flex:1;min-width:0;font-size:var(--fs-micro);line-height:1.5;color:var(--text-tertiary)}
.bk-ghost{flex:none;font-size:var(--fs-tiny);font-weight:700;color:var(--btn-bg);border-bottom:2px solid var(--card-edge);padding-bottom:4px}
/* 丙：独立一屏 */
.sub-nav{position:absolute;left:0;right:0;top:96px;height:88px;z-index:4;display:flex;align-items:center;gap:18px;
  padding:0 32px;font-size:var(--fs-h2);font-weight:700;color:rgba(242,239,233,.96);z-index:6}
.sub-nav .back{width:22px;height:22px;border-left:4px solid rgba(242,239,233,.9);border-bottom:4px solid rgba(242,239,233,.9);transform:rotate(45deg)}
.grp{margin-top:24px}
.grp + .grp{margin-top:24px}
.g-lab{font-size:var(--fs-label);font-weight:700;letter-spacing:1px;color:var(--text-tertiary);
  border-bottom:var(--w-edge) solid var(--card-edge);padding-bottom:10px;margin-bottom:20px}
.steps{font-size:var(--fs-tiny);line-height:1.7;color:var(--text-secondary)}
.bk-note.c{margin-top:18px;font-size:var(--fs-micro);line-height:1.5;color:var(--text-tertiary)}
/* 底栏 */
.bar2{position:absolute;left:24px;right:24px;bottom:24px;height:118px;border-radius:34px;
  display:flex;align-items:center;justify-content:space-around;padding:0 26px;
  background:var(--chrome-bg);border:3px solid var(--chrome-line);box-shadow:0 16px 44px var(--chrome-shadow)}
.bar2 u{text-decoration:none;width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:var(--chrome-idle);color:var(--chrome-ink)}
.bar2 u.on{background:var(--chrome-sel)}
.bar2 svg{width:36px;height:36px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.notes{width:2320px;margin-top:30px;font-size:19px;line-height:1.7;color:#4A4C55}
.notes b{color:#23252C}
`

/* 半透明令牌要先落到实色上再算对比：palette.mix 吃的是 hex，喂 rgba 会静默算出错数
   （10-08 这一版就是这么把一条 3.13 的假红算出来的）。 */
function over(rgba, hex) {
  const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(rgba)
  if (!m) return rgba
  const [r0, g0, b0] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
  const a = parseFloat(m[4])
  const h = hex.replace('#', '')
  const [r1, g1, b1] = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  const f = (x, y) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0')
  return '#' + f(r0, r1) + f(g0, g1) + f(b0, b1)
}

/* ---------------- 六、对比度：本稿每处"字/底"都算一遍 ---------------- */
const CONTRAST = [
  ['主按钮字 / --btn-bg', '#FFFFFF', V('--btn-bg'), 4.5],
  ['实心药丸(选中)字 / --accent', V('--bg-page'), V('--accent'), 4.5],
  ['菜单标签 / 卡底', V('--text-primary'), V('--bg-card'), 4.5],
  ['菜单小字 / 卡底', V('--text-tertiary'), V('--bg-card'), 4.5],
  ['展开块说明小字 / 卡底', V('--text-tertiary'), V('--bg-card'), 4.5],
  ['展开块状态行 / 卡底', V('--text-secondary'), V('--bg-card'), 4.5],
  ['ghost 按钮字 / chip-idle 叠卡底', V('--text-primary'), over(V('--chip-idle'), V('--bg-card')), 4.5],
  ['次动作那支实心色文字 / 卡底', V('--btn-bg'), V('--bg-card'), 4.5],
  ['弹层里说明字 / 卡底', V('--text-secondary'), V('--bg-card'), 4.5],
  ['头部大字 / 压暗后的图（按最亮一档估）', 'rgba(242,239,233,.96)', '#6A6E78', 3],
]

/* ---------------- 七、探针清单（页面自己量，量不到就红） ---------------- */
const PROBES = [
  ['甲 手机底色＝--bg-page', `getComputedStyle(document.querySelectorAll('.ph')[0]).backgroundColor`],
  ['乙 主按钮实心色＝--btn-bg', `getComputedStyle(document.querySelector('.bk-main')).backgroundColor`],
  ['乙 展开块高度>0', `document.querySelector('.bk-open').getBoundingClientRect().height`],
  ['丙 两张卡都落地', `document.querySelectorAll('.ph')[2].querySelectorAll('.grp').length`],
  ['甲 弹层卡宽 620', `document.querySelector('.panel').getBoundingClientRect().width`],
]

const arts = DIRS.map(([k, name, line, body]) => `
  <div class="art"><div class="cap"><b>${k} ${name}</b>：${line}</div><div class="ph">${body}</div></div>`).join('\n')

const REFS = [
  ['stdnotes-2.png', `<b>Standard Notes</b>（设置抽屉）：账号那一行下面直接挂一句 "88/88 notes and tags encrypted"。本稿那句"上次备份 · 24 篇已加密"抄的是这一条——状态跟着身份行，不另起一块。`],
  ['obsidian-4.png', `<b>Obsidian</b>（Notes 面板）：面板标题下一行 "77 files, 9 folders"，行尾 chevron 只表示"还能往下"。本稿展开块顶部那行计数按这一条摆。`],
  ['cubox-0.png', `<b>Cubox</b>（Home）：次要动作退成分组标题右端一枚浅色文字（"All Unread"），不与主动作抢实心。本稿乙那枚「选文件恢复」抄的是这个位置。`],
  ['flomo-0.png', `<b>flomo</b>（MEMO 列表）：行与行只靠一条发丝线分开，展开的东西不再套第二层卡。本稿乙不新增卡片层级、仍用现网那条 --card-edge。`],
].map(([f, cap]) => `<figure><img src="${ref64(f)}"><figcaption>${cap}</figcaption></figure>`).join('\n')

const HTML = `<!doctype html><meta charset="utf-8"><style>${STY}
.probe{position:absolute;left:-99999px;top:0;width:2400px}
.r{font-size:16px}</style>
<h1>2.1 备份与恢复 · 三个方向（同一套皮，只差结构与步数）</h1>
<div class="lead">口径按你 10-08 拍的三条：加密按常规做、界面上不出现密钥口令；邮箱不验证归属（发错重发）；减少使用门槛。
<b>皮不是新画的</b>——字号/圆角/描边/底色全部从 <code>app.wxss</code> 的 <code>page{}</code> 与象牙那一档现读，底栏从 <code>palette.chromeOf('tint-paper')</code> 现算，头部那张图用 <code>assets/home-bg-portrait.jpg</code> 真件按 <code>poster.js</code> 的 <code>bandGeom</code> 同一条公式摆（1116×1920 → 750×${IMG.h}，top ${IMG.top}）。
<b>屏上带黄点的字是本稿新拟的话</b>（现网字典里还没有），其余每一句都从 <code>utils/i18n.js</code> 的 zh 键现读。首页/列表/详情那条链另一支在跑 v23→v30，这一轮不碰。</div>
<div class="refs">${REFS}</div>
<div class="arts">${arts}</div>
<div class="notes"><b>落地状态：代码一行没动。</b>真机现在跑的是线上 1.9.29，2.0.0 在审核台（10-07 22:31 提审），这一屏连页面都还没建。
挑定某一版之后才动实现，要动的是：「我的」那一行 + 一条 <code>POST /api/user/backup/export</code> + 一封带附件的邮件 + 一条 <code>chooseMessageFile</code> 上传口；
而 <b>「能不能从小程序读到那个文件」这件事我还没在真机上验过</b>，所以丙那三步的话术现在只是画，不写进规格。
<br><b>我的建议是乙</b>：甲把「恢复」压成弹层底下一行小字，两个动作里被藏掉的是他更常找的那个；丙多开一层页、多一个入口（与"一个功能只留一个入口"打架）；乙两个动作都在同一屏，实心只有一枚。
<br>对比度实测（本稿每处字/底）：${CONTRAST.map(([k, fg, bg, need]) => `${k} ${palette.crOf(fg, bg).toFixed(2)}（需≥${need}）`).join('　·　')}</div>
<div class="probe" id="probe"></div>
<script>
window.__P = []
function P(k, v){ window.__P.push([k, String(v)]) }
P('手机底色', getComputedStyle(document.querySelectorAll('.ph')[0]).backgroundColor)
P('主按钮实心', getComputedStyle(document.querySelector('.bk-main')).backgroundColor)
P('展开块高', document.querySelector('.bk-open').getBoundingClientRect().height.toFixed(1))
P('丙两张卡', document.querySelectorAll('.ph')[2].querySelectorAll('.grp').length)
P('甲弹层宽', document.querySelector('.panel').getBoundingClientRect().width.toFixed(1))
P('底栏选中那格', getComputedStyle(document.querySelector('.bar2 u.on')).backgroundColor)
P('文档高', document.documentElement.scrollHeight)
document.querySelectorAll('.fit').forEach((el,i)=>{
  if (el.scrollWidth > el.clientWidth + 1) P('放不下#' + i + ' ' + el.textContent.slice(0,12), el.scrollWidth + '>' + el.clientWidth)
})
document.getElementById('probe').textContent = JSON.stringify(window.__P)
window.__N = document.querySelectorAll('.fit').length
</script>`

/* ---------------- 八、渲染：先量、再判、最后才出图 ---------------- */
const tmp = path.join(DIR, '.b1.html')
fs.writeFileSync(tmp, HTML)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 2500
const shot = '/tmp/b1-raw.png'

// 第一趟只要数：窗口给多高都不影响 documentElement.scrollHeight，量完再决定截图窗口
const dump = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files',
  '--virtual-time-budget=9000', `--window-size=${W},1200`, '--dump-dom', tmp], { encoding: 'utf8', maxBuffer: 1 << 28 })
const probeTxt = /<div class="probe" id="probe">(\[.*?\])<\/div>/.exec(dump.stdout || '')
if (!probeTxt) { console.error('✗ 探针没回东西（页面里 JS 大概挂了），不能交'); fs.unlinkSync(tmp); process.exit(1) }
const probes = JSON.parse(probeTxt[1])
const EXPECT = {
  '手机底色': 'rgb(226, 222, 212)',
  '主按钮实心': 'rgb(118, 105, 72)',
  '底栏选中那格': 'rgb(118, 105, 72)',
}
let bad = 0
console.log('\n探针（页面自己量）：')
for (const [k, v] of probes) {
  const want = EXPECT[k]
  const ok = want ? v === want : true
  if (k.startsWith('放不下')) { console.log(`  ✗ ${k} ${v}`); bad++; continue }
  console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(14)} ${v}`)
  if (!ok) bad++
}
if (probes.length < 7) { console.error('✗ 探针少于 7 条，不能交'); bad++ }
if (Number((probes.find((p) => p[0] === '展开块高') || [])[1] || 0) < 200) { console.error('✗ 乙那块没展开够高度'); bad++ }
if (Number((probes.find((p) => p[0] === '丙两张卡') || [])[1] || 0) !== 2) { console.error('✗ 丙两张卡不齐'); bad++ }

console.log('\n对比度（palette.crOf 现算）：')
for (const [k, fg, bg, need] of CONTRAST) {
  const cr = palette.crOf(fg, bg)
  const ok = cr >= need
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${k.padEnd(24)} ${cr.toFixed(2)}:1  需≥${need}  ${fg} on ${bg}`)
}
if (bad) {
  fs.unlinkSync(tmp)
  console.error(`\n✗ 有 ${bad} 条红：红的不成图，先修稿再给人看`)
  process.exit(1)
}

// 窗口高按量到的文档高给（上一版写死 2760 直接被这道闸拦下：顶到底＝被切了）
const docH = Number((probes.find((p) => p[0] === '文档高') || [])[1] || 0)
const H = docH + 160
if (fs.existsSync(shot)) fs.unlinkSync(shot)
spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files', '--virtual-time-budget=9000', `--window-size=${W},${H}`,
  `--screenshot=${shot}`, tmp], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
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
out=im.crop((0,0,w,min(h,last+40))); out.save(${JSON.stringify(path.join(DIR, 'b1-三方向.png'))}); print('写入',out.size)
`
console.log(execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim())
fs.unlinkSync(tmp)
console.log('\n全绿。出图：' + path.join(DIR, 'b1-三方向.png'))
