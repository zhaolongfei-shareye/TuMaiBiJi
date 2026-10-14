/**
 * 首屏顶部那一块改版效果图（中／英两份，现状与改后并排）。
 * 口径：屏 750×1624rpx，一律按 rpx 写再乘 S 换算（1rpx=0.4px，帧宽 300px）；
 * 字号取 app.wxss 的 --fs-*，间距取 --sp-*，色取 palette 现读的墨档那几支；
 * 屏上每句中文抄 i18n 现值，英文那两句是**我拟的**（图上标了），等他改。
 * 用法：node docs/工具/出-首屏顶部改版.js
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const ROOT = process.env.MP_ROOT || path.resolve(__dirname, '..', '..')
const DIR = path.join(ROOT, 'docs/design/10-14首屏顶部改版')
const OUT = path.join(DIR, '对比.png')
const { MOODS, THEMES, createSkin, moodVars, TIP_DOT } = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const { i18n } = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))

const S = 0.4 // 1rpx → px（帧宽 300 = 750rpx）
const px = (rpx) => +(rpx * S).toFixed(1)
const ink = MOODS[0]
const theme = THEMES.filter((t) => t.key === ink.theme)[0]
const skin = Object.fromEntries(createSkin(ink.theme).split(';').map((p) => p.split(':').map((s) => s.replace(/^--/, ''))))
const FACE = [36, 37, 43] // 今天从档1-墨.png 面板无字处采到的那块面
// 10-14 23:5x 站长追那一句之后，这一枚不再是"平 .55"，而是**与面板反向的那条渐变**：
// 值直接吃 `moodVars('ink')['--stage-strip']`（与 `app.wxss` 那五块镜像同一份），稿上不另抄一套数。
const STRIP = moodVars(ink.key)['--stage-strip']
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`
const P = i18n.zh, E = i18n.en

// 新加的那一行：中文照他口述逐字，英文我拟（**一行放得下，不回行**）
const AI_LINE = { zh: '用 AI 帮你读懂一切：拍照 | 读图 | 翻译 | 提炼 | 分享', en: 'AI reads it all: Shoot | Scan | Translate | Distill | Share' }
// 大标题：中文按他给的断点拆两行、去逗号；英文仍是一句（现网 'Save what matters'，不放回行）
const HEAD = { zh: ['看到好内容', '随手记下来'], en: ['Save what matters'] }

function frame(lang, kind) {
  const t = lang === 'zh' ? P : E
  const head = HEAD[lang]
  const ai = AI_LINE[lang]
  const draft = lang === 'zh' ? '' : '<span class="draft">英文我拟，待你改</span>'
  const langSeg = '<div class="lang"><b>中</b><b>EN</b></div>'
  const top = kind === '现状'
    ? `<div class="row1"><div class="h1">${t.createHeading}</div>${langSeg}</div>
       <div class="swap" style="top:${px(206)}px">${t.bgDimLabel || '调亮度'} ｜ ${t.homeBgSwap} ›<span>${t.moodSwap} ☁</span></div>`
    : `<div class="ai" style="background:${STRIP}"><i style="background:${TIP_DOT}"></i>${ai}</div>
       <div class="row1 tight"><div class="h1 soft">${head.join('<br>')}</div>${langSeg}</div>`
  const swapAbovePanel = kind === '现状' ? '' :
    `<div class="swap low">${t.bgDimLabel || '调亮度'}<span>${t.homeBgSwap} ›</span><span>${t.moodSwap} ☁</span></div>`
  return `
<div class="cell"><div class="cap"><b>${lang === 'zh' ? '中文' : 'English'}</b> ${kind}${draft}</div>
 <div class="ph" style="background:${theme.page}">
  <div class="nav">${t.appName || '图麦笔记'}<i></i></div>
  ${top}
  <div class="art ${kind === '现状' ? 'now' : 'after'}"></div>
  ${swapAbovePanel}
  <div class="panel" style="background:${rgb(FACE)}">
    <div class="face"></div>
    <div class="count" style="background:rgba(${ink.band},.94)"><div><em>0</em><hr><span>${t.statNotes}</span></div><div><em>0</em><hr><span>${t.statCards}</span></div></div>
    <div class="tips"><i style="background:${TIP_DOT}"></i>${t.tipsPrefix}${t.tips[1]}</div>
    <div class="plus" style="background:${skin['cp-cam']};color:${skin['cp-cam-ink']}">+</div>
    <div class="tab"><b style="background:${skin['cp-cam']}">+</b><u></u><u></u></div>
  </div>
 </div></div>`
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#F2EFE9;font-family:-apple-system,"PingFang SC",sans-serif;padding:20px}
h1{font-size:17px;margin:0 0 4px}p{font-size:12px;margin:0 0 16px;color:#555}
.grid{display:grid;grid-template-columns:repeat(2,300px);gap:26px 22px}
.cap{font-size:12px;margin:0 0 6px}.cap b{font-size:13px}.draft{color:#B14A2F;margin-left:6px}
.ph{width:300px;height:650px;border-radius:34px;overflow:hidden;position:relative;box-shadow:0 3px 14px rgba(0,0,0,.16)}
.nav{height:${px(88)}px;display:flex;align-items:center;justify-content:center;font-size:${px(30)}px;position:relative;background:rgba(255,255,255,.35)}
.nav i{position:absolute;right:${px(24)}px;top:${px(24)}px;width:${px(170)}px;height:${px(62)}px;border-radius:${px(31)}px;border:1px solid rgba(0,0,0,.3)}
.row1{display:flex;align-items:center;justify-content:space-between;padding:${px(48)}px ${px(24)}px ${px(32)}px}
.row1.tight{padding:${px(20)}px ${px(24)}px ${px(24)}px;align-items:center}
.h1{font-size:${px(42)}px;font-weight:700;letter-spacing:-.4px;line-height:1.15;color:#14161A}
.h1.soft{color:rgba(20,22,26,.70)}
.lang{flex:none;text-align:right}.lang b{font-size:${px(24)}px;color:#8A8578;margin-left:${px(20)}px;font-weight:400}.lang b:first-child{color:rgba(20,22,26,.70);border-bottom:2px solid rgba(20,22,26,.70)}
/* 00:0x 站长追的两句：「左上右不需要留空间，要通栏。左下和右下有圆弧，然后与背景之间带阴影。
   要与下方面板渐变毛玻璃风格一致」⇒ 圆角／阴影／滤镜三样全部照 panel 那一枚上下颠倒抄：
   面板是 radius 40 40 0 0 ＋ shadow 0 -12 28 ＋ blur(30) saturate(1.15)
   这一行是 radius 0 0 40 40 ＋ shadow 0 12 28 ＋ 同一档滤镜。
   ⚠ 稿上的 .ph 本来就没有水平内缩，所以稿上"看着通栏"；真页的 .container 有 2rpx 24rpx 0 那一口内缩，
   代码里必须把它负回去才是真通栏——这一处是**稿对、代码错**，不是反过来。
   （这一版注释里不许出现反引号：整段 CSS 在一个模板字符串里，反引号会当场把串吞掉。） */
.ai{margin:0 0 ${px(0)}px;padding:${px(14)}px ${px(24)}px ${px(34)}px;
    border-radius:0 0 ${px(40)}px ${px(40)}px;box-shadow:0 ${px(12)}px ${px(28)}px rgba(18,20,26,.16);
    color:#F2EFE9;font-size:${px(24)}px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    backdrop-filter:blur(30px) saturate(1.15);-webkit-backdrop-filter:blur(30px) saturate(1.15)}
.ai i{display:inline-block;width:${px(12)}px;height:${px(12)}px;border-radius:50%;margin-right:${px(10)}px}
.swap{position:absolute;left:${px(24)}px;right:${px(24)}px;font-size:${px(21)}px;color:#8A8578;display:flex;justify-content:space-between}
.swap span{margin-left:${px(28)}px}
.swap.low{bottom:${px(560)}px;color:#4A4740}
.art{position:absolute;left:${px(24)}px;right:${px(24)}px;border:1px solid rgba(0,0,0,.16);border-radius:${px(20)}px ${px(20)}px 0 0;
     background:url('底-现网形象图.png') top center / cover no-repeat}
.art.now{top:${px(300)}px;bottom:${px(560)}px}
.art.after{top:${px(396)}px;bottom:${px(612)}px}
.panel{position:absolute;left:0;right:0;bottom:0;height:${px(548)}px;border-radius:${px(40)}px ${px(40)}px 0 0;box-shadow:0 -${px(12)}px ${px(28)}px rgba(18,20,26,.16)}
.face{position:absolute;left:${px(28)}px;top:${px(24)}px;width:${px(274)}px;height:${px(224)}px;background:#fff;border-radius:${px(14)}px}
.count{position:absolute;left:${px(28)}px;top:${px(262)}px;width:${px(274)}px;height:${px(126)}px;border-radius:${px(14)}px;display:flex;align-items:center;justify-content:space-around;color:#F2EFE9}
.count em{font-style:normal;font-size:${px(64)}px;font-weight:200}
.count hr{border:0;border-top:1px solid rgba(242,239,233,.5);margin:${px(6)}px ${px(18)}px}
.count div{text-align:center;width:50%}.count span{font-size:${px(18)}px;opacity:.72}
.tips{position:absolute;left:${px(344)}px;top:${px(60)}px;width:${px(300)}px;color:#F2EFE9;font-size:${px(24)}px;line-height:1.4}
.tips i{display:inline-block;width:${px(12)}px;height:${px(12)}px;border-radius:50%;margin-right:${px(8)}px}
.plus{position:absolute;left:${px(400)}px;top:${px(210)}px;width:${px(190)}px;height:${px(190)}px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${px(96)}px;font-weight:300}
.tab{position:absolute;left:${px(20)}px;right:${px(20)}px;bottom:${px(16)}px;height:${px(96)}px;border-radius:${px(48)}px;background:rgba(${FACE},.62);display:flex;align-items:center;justify-content:space-around}
.tab b{width:${px(76)}px;height:${px(76)}px;border-radius:50%;color:#F2EFE9;font-size:${px(44)}px;display:flex;align-items:center;justify-content:center;font-weight:300}
.tab u{width:${px(46)}px;height:${px(46)}px;border-radius:${px(12)}px;background:rgba(242,239,233,.5)}
</style>
<h1>首屏顶部改版：加一行「用 AI 帮你读懂一切」＋大标题拆两行并降到 70% 透明＋三枚挪到面板上方（中／EN 仍在右侧）</h1>
<p>左列中文、右列英文；上排现状、下排改后。帧宽 300px＝750rpx，字号间距全按现网 --fs-*／--sp-* 换算；新那行底下垫的是同档心情那块玻璃色的一层；中间那块贴的是今天从现网屏上采下来的形象图。英文一律一行放得下、不回行。</p>
<div class="grid">${['zh', 'en'].map((l) => frame(l, '现状')).join('')}${['zh', 'en'].map((l) => frame(l, '改后')).join('')}</div>`

fs.mkdirSync(DIR, { recursive: true })
fs.writeFileSync(path.join(DIR, '对比.html'), html)
spawnSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--window-size=720,1560', `--screenshot=${OUT}`, `file://${path.join(DIR, '对比.html')}`,
], { stdio: 'ignore' })
console.log('图在', OUT)
