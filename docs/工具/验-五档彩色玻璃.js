// 一把静态尺子：五档彩色毛玻璃（「心情」那一档）。不连模拟器，纯读文件＋现编色板。
// 跑法：node docs/工具/验-五档彩色玻璃.js
//
// 需求正本＝站长 10-14 两句原话：
//   「四种界面配色（加上目前深色面板），改为不同颜色的毛玻璃，参考其他AI生成的效果图，
//    下方的tab也与上面的同步，其他页面有涉及毛玻璃的也用相同的颜色面板。同步修改。
//    设置里面的风格入口隐藏。切换毛玻璃改到，首页 增加一个入口"换心情" icon是小云朵。每次点击切换一种。」
// 参考图三张：`docs/design/毛玻璃参考图三张/`（同一版首页布局，只差面板那一层的颜色）。
//
// 这一把管四件事，每件都对应一种"屏上看不出来的静默失效"：
// ① **镜像**：`app.wxss` 那五块 `.mood-*` 必须逐字等于 `palette.moodVars()` 的输出。
//    哪天改了色板忘了改 CSS（或反过来），屏上只有那一档下颜色不对，四档里挑出来极难。
// ② **零回归**：墨那一档（默认）展开出来的九枚玻璃数必须与 `page{}` 那份兜底逐字相同，
//    底栏在墨档下必须仍等于 `chromeOf` 原样——"新加四档"不许顺手把今天这一屏改掉一个字。
// ③ **α 不许跟着色一起动**：透明度那几档（.30/.60/.50/.20/.72/.42/.16→.94→.95/七档渐变）
//    是他 10-11～10-13 逐条拍的，这一轮换的只有色相。所以每档都按同一架 α 梯子核。
// ④ **入口只有一处**：首页那枚「换心情」在、设置里「外观设置」那一格不在（隐藏不是删能力）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const FILES = {
  app: 'miniprogram/app.wxss',
  palette: 'miniprogram/utils/palette.js',
  appjs: 'miniprogram/app.js',
  createWxss: 'miniprogram/pages/create/create.wxss',
  createWxml: 'miniprogram/pages/create/create.wxml',
  createJs: 'miniprogram/pages/create/create.js',
  meWxml: 'miniprogram/pages/me/me.wxml',
  tabJs: 'miniprogram/custom-tab-bar/index.js',
  tabWxss: 'miniprogram/custom-tab-bar/index.wxss',
  i18n: 'miniprogram/utils/i18n.js',
}

// 色板现编一份：刀要改的就是这份真身，`require` 的缓存拿不到变异体（同 验-列表层底色.js 那条）。
const compile = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', '__dirname', src)(
    m, m.exports, require, path.join(ROOT, 'miniprogram/utils'))
  return m.exports
}

// 比较色值前只归一空格与大小写——归一是排版，不是色值本身。
const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase()
const blockOf = (src, sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`).exec(src)
  return m ? m[1] : ''
}
/* 先把注释剥掉再按行取声明：这些块里大量声明的上一行是注释（以 `星号斜杠` 结尾），
   拿 `(?:^|;)` 当锚就会漏掉"紧跟在注释后面的那一枚"——第一版正是这样把四枚玻璃令牌
   读成 null，看着像"page{} 里没有"，其实是解析器没剥注释。 */
const declOf = (block, name) => {
  const code = String(block || '').replace(/\/\*[\s\S]*?\*\//g, '')
  const m = new RegExp(`^\\s*${name}:\\s*([^;]*);`, 'm').exec(code)
  return m ? m[1].trim() : null
}
const alphaOf = (v) => { const m = /,\s*([\d.]+)\s*\)$/.exec(String(v || '')); return m ? Number(m[1]) : null }
const rgbOf = (v) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(v || '')); return m ? [+m[1], +m[2], +m[3]] : null }

// 半透明字要先按实际底色混成实心再算对比（alpha 不落地就是假数——10-09 那条"混成实心"同理会骗人）。
const overHex = (fg, bgHex) => {
  const n = rgbOf(fg) || (/^#[0-9a-f]{6}$/i.test(fg || '') ? [1, 2, 3].map((i) => parseInt(fg.slice(1 + i * 2, 3 + i * 2), 16)) : null)
  if (!n) return null
  const a = /rgba/.test(fg) ? alphaOf(fg) : 1
  const b = rgbOf('#' + bgHex.slice(1)) || [0, 0, 0]
  const bg2 = '#' + [0, 1, 2].map((i) => Math.round(n[i] * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('')
  return bg2
}

function evaluate(S) {
  const P = compile(S.palette)
  const out = []
  const ck = (name, cond, got) => out.push({ name, ok: !!cond, got })
  const V = (key) => P.moodVars(key)

  /* ---------- ① 色板那一头 ---------- */
  ck('MOODS 是五档（四种界面配色＋目前深色面板）', P.MOODS.length === 5, P.MOODS.length)
  ck('五枚 key 不重、五枚 cls 不重', new Set(P.MOODS.map((m) => m.key)).size === 5
    && new Set(P.MOODS.map((m) => m.cls)).size === 5)
  ck('第一档就是"目前深色面板"（默认态＝今天那一屏）', P.MOODS[0].key === 'ink' && P.MOODS[0].glass === '#23252C', P.MOODS[0].glass)
  ck('其余四档各自钉着一套壁纸，且那四套正好是 THEMES 那四枚', (() => {
    const keys = P.MOODS.slice(1).map((m) => m.theme)
    return JSON.stringify(keys.slice().sort()) === JSON.stringify(P.THEMES.map((t) => t.key).sort())
  })(), P.MOODS.map((m) => m.theme).join('/'))
  ck('脏值（别的版本写过的 key、本机读不到的数）落回第一档', P.moodOf('nope').key === 'ink' && P.moodOf('').key === 'ink')
  ck('点五次回到原点（"每次点击切换一种"是一圈，不是走到头就死）', (() => {
    let k = ''
    for (let i = 0; i < 5; i++) k = P.moodNext(k).key
    return k === 'ink'
  })())
  ck('五档玻璃色互不相同（"不同颜色的毛玻璃"这件事真的成立）', (() => {
    const g = P.MOODS.map((m) => m.glass)
    return new Set(g).size === 5
  })(), P.MOODS.map((m) => m.glass).join(' '))
  /* 参考图那三个数钉死：这一档的色不是审美值，是量出来的。谁哪天换成"看着更好看"的数，这条先红。 */
  const REF = { ivory: ['#B1A299', '#8D7564'], mist: ['#A4B0C0', '#6D8DAA'], blush: ['#B5A8BF', '#9E95B0'] }
  Object.keys(REF).forEach((k) => ck(`参考图现量值钉住：${k} 的玻璃／底带＝${REF[k].join('／')}`,
    P.MOODS.filter((m) => m.key === k)[0].glass === REF[k][0]
    && P.MOODS.filter((m) => m.key === k)[0].band === REF[k][1]))
  ck('天青那一档没有参考图，源码里写明"是我推的、他没拍过"',
    /天青那一档参考图里没有/.test(S.palette) && /他没拍过/.test(S.palette))

  /* ---------- ② α 梯子：五档必须同一架 ---------- */
  const LADDER = {
    '--glass-veil': 0.30, '--glass-veil-band': 0.60, '--glass-plate': 0.50, '--glass-fill': 0.20,
    '--glass-plate-dock': 0.72, '--glass-fill-dock': 0.42, '--stage-solid': 0.95,
    '--stage-ink-strong': 0.96, '--stage-ink': 0.85, '--stage-ink-soft': 0.78, '--stage-ink-faint': 0.56,
  }
  P.MOODS.forEach((m) => {
    const v = V(m.key)
    const off = Object.keys(LADDER).filter((k) => alphaOf(v[k]) !== LADDER[k])
    ck(`${m.key}：十一枚 α 与他拍过的那一架逐档相同`, off.length === 0, off.join(',') || '齐')
    const band = (v['--stage-band'].match(/,\s*([\d.]+)\s*\)/g) || []).map((t) => Number(/([\d.]+)\s*\)/.exec(t)[1]))
    ck(`${m.key}：面板 band 仍是 .16→.94（10-13 两刀收出来的那一档）`, JSON.stringify(band) === '[0.16,0.94]', band.join('→'))
    const cnt = (v['--blk-count-bg'].match(/,\s*([\d.]+)\s*\)/g) || []).map((t) => Number(/([\d.]+)\s*\)/.exec(t)[1]))
    ck(`${m.key}：左下那一格仍是那七个停点的 α（10-13「黑底的半透明渐变效果不好」那一版）`,
      JSON.stringify(cnt) === JSON.stringify([0.45, 0.45, 0.38, 0.35, 0.50, 0.68, 0.92]), cnt.join('/'))
  })
  /* 压在玻璃上的字读不读得出来：拿"面板实心那一档"当底（.95 的玻璃），五档各算一次。 */
  P.MOODS.forEach((m) => {
    const face = '#' + rgbOf(V(m.key)['--stage-solid']).map((x) => x.toString(16).padStart(2, '0')).join('')
    const cr = P.crOf(overHex(V(m.key)['--stage-ink-strong'], face) || '', face)
    const crSolid = P.crOf(V(m.key)['--stage-ink-solid'], face)
    ck(`${m.key}：面板上的字压得住这一档的玻璃（强档与实心档都 ≥4.5）`, cr >= 4.5 && crSolid >= 4.5,
      `${cr.toFixed(2)}／${crSolid.toFixed(2)} 底 ${face}`)
  })

  /* ---------- ③ 零回归：墨档 == 今天 ---------- */
  const PAGE = blockOf(S.app, 'page')
  const INK = V('ink')
  ;['--glass-veil', '--glass-veil-band', '--glass-plate', '--glass-fill'].forEach((k) =>
    ck(`${k}：墨档那份与 page{} 兜底逐字相同（默认态零变化的证据）`, norm(INK[k]) === norm(declOf(PAGE, k)),
      `page=${declOf(PAGE, k)}／ink=${INK[k]}`))
  ck('page{} 那五枚玻璃原值一个没动（兜底还在，缺类也不花）',
    /--glass-hair:\s*rgba\(255, 255, 255, 0\.55\)/.test(PAGE) && /--glass-bf:\s*blur\(23px\) saturate\(1\.8\)/.test(PAGE))
  ck('墨档底栏 = chromeOf 原样，只多一枚 --chrome-blur:none', (() => {
    const a = P.chromeOf('tint-paper').style.split(';').filter(Boolean).sort()
    const b = P.moodChromeOf('ink').style.split(';').filter((s) => s && !/--chrome-blur/.test(s)).sort()
    return JSON.stringify(a) === JSON.stringify(b)
  })(), P.moodChromeOf('ink').style.slice(0, 60))
  ck('彩色档底栏那块圆底仍是 chromeOf 算的那一支（只转发、不另算）',
    P.MOODS.slice(1).every((m) => P.moodChromeOf(m.key).sel === P.chromeOf(m.theme).sel))
  ck('每一档都发 --chrome-blur（墨发 none）：少一枚就是 IACVT，那条 backdrop-filter 整行掉下来',
    P.MOODS.every((m) => /--chrome-blur:/.test(P.moodChromeOf(m.key).style)))

  /* ---------- ④ CSS 镜像 ---------- */
  const pos = P.MOODS.map((m) => S.app.indexOf('.' + m.cls + ' {'))
  ck('五块 `.mood-*` 都在 app.wxss 里', pos.every((p) => p > 0), pos.join(','))
  ck('五块排在四块 `.theme-*` 之后（同档 specificity，源码顺序决定谁赢）',
    S.app.indexOf('.theme-blue {') < Math.min(...pos.filter((p) => p > 0)))
  P.MOODS.forEach((m) => {
    const blk = blockOf(S.app, '.' + m.cls)
    const v = V(m.key)
    const diff = Object.keys(v).filter((k) => norm(declOf(blk, k)) !== norm(v[k]))
    const extra = (blk.match(/--[\w-]+\s*:/g) || []).map((s) => s.replace(':', '').trim()).filter((k) => !(k in v))
    ck(`${m.cls} 与 moodVars 逐字等值（少一枚、多一枚、值漂一格都算）`,
      Object.keys(v).every((k) => declOf(blk, k) !== null) && diff.length === 0 && extra.length === 0,
      `缺/错 ${diff.join(',')}　多 ${extra.join(',')}`)
  })
  ck('create.wxss 里那六处引用都在（面板两段、左下一格、四档字色）',
    ['--stage-band', '--stage-solid', '--blk-count-bg', '--stage-ink-solid', '--stage-ink-strong', '--stage-ink-dim']
      .every((k) => new RegExp(`var\\(${k}\\)`).test(S.createWxss)))
  ck('第二屏就地抬那两档发的是 var(--glass-*-dock)（写死白值＝五档同色，D17 甲白落）',
    /--glass-plate:\s*var\(--glass-plate-dock\)/.test(blockOf(S.createWxss, '.container.entry-dock'))
    && /--glass-fill:\s*var\(--glass-fill-dock\)/.test(blockOf(S.createWxss, '.container.entry-dock')))
  ck('底栏那两条滤镜成对（iOS 的 WKWebView 只认 -webkit- 那行）',
    /backdrop-filter:\s*var\(--chrome-blur\)/.test(S.tabWxss)
    && /-webkit-backdrop-filter:\s*var\(--chrome-blur\)/.test(S.tabWxss))

  /* ---------- ⑤ 入口与状态 ---------- */
  ck('首页有「换心情」那一枚：catchtap＋小云朵＋跟着语言的文案',
    /catchtap="onCycleMood"/.test(S.createWxml) && /glyph-cloud/.test(S.createWxml)
    && /\{\{t\.moodSwap\}\}/.test(S.createWxml))
  ck('它是往后加的（调亮度 → 换背景 → 换心情，前面两枚的落点没动）',
    S.createWxml.indexOf('onCycleDim') < S.createWxml.indexOf('goHomeBg')
    && S.createWxml.indexOf('goHomeBg') < S.createWxml.indexOf('onCycleMood'))
  ck('小云朵两条 mask 都写、且挂在共用属性名单里（只写一条＝iPhone 上静默不显形）',
    (S.createWxss.match(/\.glyph-cloud \{[^}]*-webkit-mask-image/g) || []).length === 1
    && /\.glyph-cloud \{[^}]*\n\s*mask-image/.test(S.createWxss)
    && /\.swap-glyph[^}]*\.glyph-cloud|\.glyph-cloud[^}]*\{/.test(S.createWxss.split('\n').find((l) => /blk-plus-glyph, \.mini-glyph/.test(l)) || ''))
  ck('app.js：心情类跟着壁纸一起发在容器上（每一页都走 containerClass，一处改全站）',
    /this\.glassMood\(wallpaper\)\.cls/.test((/containerClass\(wallpaper\)[\s\S]{0,220}/.exec(S.appjs) || [''])[0]))
  ck('app.js：心情先跟壁纸对一次账（本机那档与服务端带回来的壁纸不是同一家族时以壁纸为准）',
    /m\.theme === themeOf\(w\)\.key \? m : moodOfWallpaper\(w\)/.test(S.appjs))
  ck('app.js：cycleGlassMood 从对过账的那一档起（不然壁纸是青的、点一下跳回象牙＋纸底）',
    /moodNext\(this\.glassMood\(\)\.key\)/.test(S.appjs))
  ck('app.js：壁纸在本机留一份缓存（登录没回来时五档才点得动），但服务端那一枚仍排在前面',
    /wx\.setStorageSync\(WALLPAPER_CACHE_KEY, key\)/.test(S.appjs)
    && (() => { const g = (/getWallpaper\(fromServer\)\s*\{([\s\S]{0,240})/.exec(S.appjs) || ['', ''])[1]
      return g.search(/fromServer/) >= 0 && g.includes('WALLPAPER_CACHE_KEY')
        && g.search(/fromServer/) < g.search(/WALLPAPER_CACHE_KEY/) })())
  ck('app.js：cycleGlassMood 一次做齐三件（记档、跟着换壁纸、重算主题）',
    /wx\.setStorageSync\(MOOD_KEY, m\.key\)/.test(S.appjs) && /this\.setWallpaper\(m\.theme\)/.test(S.appjs)
    && /this\.applyTheme\(m\.theme\)/.test(S.appjs))
  ck('首帧占位那一位带 mood-ink（不带＝第一帧没类，落到 page 兜底；带着才是"默认态零变化"）',
    /themeClass: 'theme-tint-paper mood-ink'/.test(S.createJs))
  ck('首页那一枚：只在壁纸真的变了才 PUT，且失败要说一句',
    /if \(after === before\) return/.test(S.createJs) && /api\.updateWallpaper\(after\)/.test(S.createJs)
    && /t\('setFailed'/.test(S.createJs))
  ck('点完底栏跟着重取色（tab 的色由 JS 递，不重推就是上面换了下面没换）',
    /getTabBar\(\)\.applyTheme\(after\)/.test(S.createJs))
  ck('心情这一档只在本机（服务端那一列表达不了"同壁纸两档玻璃"），代价写在注释里',
    /MOOD_KEY = 'glassMood'/.test(S.appjs) && /换手机或重装之后这一档回到默认/.test(S.appjs))
  ck('i18n：moodSwap 中英两份都在，中文三个字',
    /moodSwap: '换心情'/.test(S.i18n) && /moodSwap: 'Mood'/.test(S.i18n))
  /* 「设置里面的风格入口隐藏」——去的是入口，不是能力。 */
  const meLive = S.meWxml.replace(/<!--[\s\S]*?-->/g, '')
  ck('「外观设置」那一格在界面上不再出现（隐藏，不是留着两个入口）',
    !/data-page="wallpaper"/.test(meLive))
  ck('能力没丢：壁纸页与路由都还在，首页那一枚走的是同一条 PUT',
    fs.existsSync(path.join(ROOT, 'miniprogram/pages/wallpaper/wallpaper.js'))
    && /wallpaper: '\/pages\/wallpaper\/wallpaper'/.test(S.appjs.replace(/\s/g, '')
      .replace(/wallpaper:'\/pages\/wallpaper\/wallpaper'/, "wallpaper: '\/pages\/wallpaper\/wallpaper'"))
      || /wallpaper: '\/pages\/wallpaper\/wallpaper'/.test(read('miniprogram/pages/me/me.js')))
  ck('隐藏那一处写明了是谁哪句（可追溯，不是谁顺手删的）',
    /设置里面的风格入口隐藏/.test(S.meWxml) && /切换毛玻璃改到首页/.test(S.meWxml))

  return out
}

/* ---------- 反向自证：每一刀都对应"屏上看不出来的一种静默失效" ---------- */
const KNIVES = [
  ['★删掉 `.mood-blush` 整块（那一档下所有玻璃静默退回 page 兜底＝五档里有一档是白的）', 'app',
    (s) => s.replace(/\.mood-blush \{[^}]*\}/, '')],
  ['★把雨雾那一块的 stage-solid 改成 .90（α 梯子被他没拍的那一刀动了）', 'app',
    (s) => s.replace(/(\.mood-mist \{[^}]*?--stage-solid: rgba\([^)]*, )0\.95/, '$10.90')],
  ['★色板里把樱落那档的玻璃色换成一支"更好看"的（参考图那三个数被换掉）', 'palette',
    (s) => s.replace("glass: '#B5A8BF', band: '#9E95B0'", "glass: '#C0A8C8', band: '#9E95B0'")],
  ['★色板里把墨档的 band 写成面板那支 #23252C（左下那一格与今天差一档）', 'palette',
    (s) => s.replace("glass: '#23252C', band: '#12141A'", "glass: '#23252C', band: '#23252C'")],
  ['★moodChromeOf 里给彩色档另算一支圆底（"深色按钮与底栏选中那枚同色"那条 10-04 的规矩）', 'palette',
    (s) => s.replace('sel: base.sel,', 'sel: hslToHex(0, 40, 40),')],
  ['★墨档底栏也换成玻璃（默认那一屏被他没指的地方改了）', 'palette',
    (s) => s.replace("if (m.key === 'ink') return Object.assign({}, base, { style: base.style + ';--chrome-blur:none' })",
      "if (m.key === 'ink') return Object.assign({}, base, { style: base.style })")],
  ['★containerClass 不再发心情类（五块 CSS 变成没人挂的孤儿）', 'appjs',
    (s) => s.replace('this.glassMood(wallpaper).cls, ', '')],
  ['★心情不与壁纸对账（服务端带回青底、本机还留着旧的樱落 ⇒ 青底配一支粉玻璃）', 'appjs',
    (s) => s.replace('return m.theme === themeOf(w).key ? m : moodOfWallpaper(w)', 'return m')],
  ['★换档从一个没对过账的值起（壁纸是青的，点一下跳回象牙＋纸底）', 'appjs',
    (s) => s.replace('moodNext(this.glassMood().key)', 'moodNext(wx.getStorageSync(MOOD_KEY))')],
  ['★壁纸不留本机缓存（登录没回来那一趟，天青／樱落／雨雾三档被对账判成"对不上"⇒ 首页那枚只剩两档能点）', 'appjs',
    (s) => s.replace('    wx.setStorageSync(WALLPAPER_CACHE_KEY, key)\n', '')],
  ['★把缓存排到服务端那一枚前面（换手机后他选的壁纸被本机旧值顶掉，10-04 那条"服务端当家"就翻了）', 'appjs',
    (s) => s.replace("const wanted = fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper)\n      || wx.getStorageSync(WALLPAPER_CACHE_KEY) || 'default'",
      "const wanted = wx.getStorageSync(WALLPAPER_CACHE_KEY) || fromServer || (this.globalData.userInfo && this.globalData.userInfo.wallpaper) || 'default'")],
  ['★cycleGlassMood 不写本机存储（点一下当场变了，重进就回默认）', 'appjs',
    (s) => s.replace('wx.setStorageSync(MOOD_KEY, m.key)', '')],
  ['★create.wxss 那处引用换回写死的墨（这一档下面板还是黑的）', 'createWxss',
    (s) => s.replace('background: var(--stage-solid);', 'background: rgba(35, 37, 44, 0.95);')],
  ['★「外观设置」那一格放回来（同一件事两个入口）', 'meWxml',
    (s) => s.replace('</block>', '<view class="menu-item" bindtap="onNavigate" data-page="wallpaper"><text class="menu-label">x</text></view></block>')],
  ['★首页那枚只换本机、不 PUT 服务端（换台手机就回到旧壁纸，而界面上明明是他选的）', 'createJs',
    (s) => s.replace('api.updateWallpaper(after)', 'Promise.resolve()')],
  ['★i18n 只补中文那一份（英文态那枚按钮是空白）', 'i18n',
    (s) => s.replace("    moodSwap: 'Mood',\n", '')],
  ['★底栏只写标准那行滤镜（iPhone 上胶囊不糊，安卓糊＝两机两样）', 'tabWxss',
    (s) => s.replace('  -webkit-backdrop-filter: var(--chrome-blur);\n', '')],
]

const base = {}
Object.keys(FILES).forEach((k) => { base[k] = read(FILES[k]) })
const clean = evaluate(base)
const failed = clean.filter((r) => !r.ok)
clean.forEach((r) => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.got !== undefined ? `　→ ${r.got}` : ''}`))
console.log(`\n正向：${clean.length - failed.length}/${clean.length} 条通过`)

const cleanRed = new Set(failed.map((r) => r.name))
let toothless = 0
KNIVES.forEach(([name, file, fn]) => {
  const mutated = Object.assign({}, base, { [file]: fn(base[file]) })
  if (mutated[file] === base[file]) { toothless++; console.log(`  ★刀没切进去（锚点漂了） ${name}`); return }
  const res = evaluate(mutated).filter((r) => !r.ok && !cleanRed.has(r.name))
  if (res.length === 0) { toothless++; console.log(`  ★没牙 ${name}`) }
  else console.log(`  ✓ 反向：${name}　→ 红 ${res.length} 条：${res.map((r) => r.name).join('；').slice(0, 70)}`)
})
console.log(`反向 ${KNIVES.length - toothless}/${KNIVES.length} 有牙`)
process.exit(failed.length === 0 && toothless === 0 ? 0 : 1)
