// 四套莫兰迪（甲档）落地的真跑自证。站长 10-04 拍了三条：⑥ 页面底走甲档 L86、
// ② 米白并入象牙、⑧ 按钮走 A（深底白字）且 chromeOf 的 sel 改成按 WCAG 4.7 反解。
// 静态那两把（验-色板零回归 / 验-列表D2）钉的是"表里的数对不对"，这一把钉的是
// "真页面上真渲染出那个数没有"——CSS 镜像值和 JS 不一致时只有这把抓得到，
// 而它恰好是这次改动最容易出的错（app.wxss 是 CSS、引不了 JS，两边各写一份）。
//
// 每套都做四件事：点色块真生效 → 三 tab 各读一次 .container 的底色 → 读三级字那档的
// 透明度 → 截三张图。跑完把壁纸和语言还原回进来时的样子。
//
// 前置：微信开发者工具已开，跑过 cli auto --project .../miniprogram --auto-port 9431
//      （改过 WXSS 必须先 quit 再 auto，否则吃的还是上一轮的样式表）。
// 跑法：docs/工具/跑尺子.sh 9431 验-四套莫兰迪落地
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const lang = require('./尺子语言钉.js')
const p = require(path.resolve(__dirname, '../../miniprogram/utils/palette.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/配色统一-四套莫兰迪/落地-四套真界面')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const hex = (rgbStr) => {
  const m = String(rgbStr).match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  return m ? '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('').toUpperCase() : String(rgbStr)
}
const alphaOf = (v) => {
  const m = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(String(v))
  return m ? Number(m[1]) : null
}
const TABS = [['/pages/index/index', '笔记'], ['/pages/create/create', '新建'], ['/pages/me/me', '我的']]
// 半透明的字压在实心底上，WCAG 要拿"合成之后的那个色"去算，不能拿原墨色：
// crOf 只收两个 hex，所以先在这里按 alpha 合成成一支实心色再交给它。
const mixOn = (bgHex, inkHex, a) => {
  const b = p.hexToRgb(bgHex), k = p.hexToRgb(inkHex)
  return '#' + k.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('').toUpperCase()
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')
  fs.mkdirSync(OUT, { recursive: true })
  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`进 ${url} 第 ${i + 1} 次没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }
  // 进来时那一枚从 app 自己那一层读（10-04 起四枚都由服务端当家，本机那份存储已经没人写了，
  // 再读 localWallpaper 只会读到一个死键）。收尾时靠"点回这一格"还原，走的是真链路。
  const before = await mp.evaluate(() => getApp().getWallpaper() || '')
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')

  for (const theme of p.THEMES) {
    const chrome = p.chromeOf(theme.key)
    console.log(`\n===== ${theme.label} ${theme.key}　页底 ${theme.page}　卡 ${theme.line}　按钮 ${chrome.sel} =====`)
    // ① 点色块真生效（走的是壁纸页那条真实 onPick → applyWallpaper，不碰存储后门）
    let wp = await enter('/pages/wallpaper/wallpaper')
    await sleep(4000)
    const chips = await wp.$$('.wp-chip')
    const idx = p.THEMES.findIndex((t) => t.key === theme.key)
    ck(`${theme.label}：壁纸条里有这一格`, !!chips[idx], `${chips.length} 格`)
    await chips[idx].tap()
    await sleep(3500)
    wp = await enter('/pages/wallpaper/wallpaper')
    await sleep(3500)
    const picked = await wp.data()
    ck(`${theme.label}：点下去当场生效（页面 data 就是这一枚）`,
      picked.currentWallpaper === theme.key, `data ${picked.currentWallpaper}`)
    ck(`${theme.label}：壁纸条上亮的是这一格（旧 key 的人不再一格都不亮）`,
      (picked.wallpapers.find((x) => x.active) || {}).key === theme.key,
      (picked.wallpapers || []).map((x) => `${x.key}${x.active ? '●' : ''}`).join(' '))

    // ② 三个 tab 各自的真页面底 == theme.page（CSS 镜像值没对上，这里必红）
    for (const [url, tab] of TABS) {
      const page = await enter(url)
      await sleep(4000)
      const box = await page.$('.container')
      const got = box ? hex(await box.style('background-color')) : '(没读到 .container)'
      ck(`${theme.label}·${tab}：页面底渲染成 ${theme.page}`, got.toUpperCase() === theme.page.toUpperCase(), got)
      await mp.screenshot({ path: `${OUT}/${theme.key}-${tab}.png` })
    }

    // ③ 三级字那一档：读一个**真吃它的元素**的计算色，不读变量。
    //    （`el.style('--text-tertiary')` 实测回 null——automator 的 style() 只给常规计算属性，
    //      自定义属性读不到；读消费者那一侧反而顺带证明"这条声明真的落到了这个元素上"）
    //    .copyright 在「关于」那一档里（me.wxml 的 block wx:else），而 data.tab 默认是 'set'，
    //    进来直接查它是 null——所以先真点那枚 seg 切过去（不是 callMethod 绕入口）。
    //    档位沿革：.4 → .55（10-04）→ .72（10-05 站长"部分数字颜色太浅了"）。
    //    .55 那档实测压页底 3.03~3.24、压卡底 3.23~3.51，四套全不过正文门槛 4.5；
    //    .72 是四套两面同时过线的最低值（再高到 .75 会反超二级字那档，顺序就倒了）。
    const me = await enter('/pages/me/me')
    await sleep(4000)
    const segs = await me.$$('.seg')
    if (segs[1]) {
      await segs[1].tap()
      await sleep(2500)
    }
    const tabNow = (await me.data()).tab
    const cp = await me.$('.copyright')
    const tertiary = cp ? String(await cp.style('color')) : `(没读到 .copyright，当前 tab=${tabNow})`
    const a3 = alphaOf(tertiary)
    const want3 = p.hexToRgb(theme.ramp.inks[0])
    const rgb3 = (String(tertiary).match(/\d+/g) || []).slice(0, 3).map(Number)
    ck(`${theme.label}：切到「关于」那一档（.copyright 在这档里才渲染）`, tabNow === 'about', tabNow)
    ck(`${theme.label}：三级字 alpha = .72（.55 压页底实测 3.03~3.25，站长真机说"很难看清"）`,
      a3 !== null && Math.abs(a3 - 0.72) < 0.01, tertiary)
    ck(`${theme.label}：三级字用的就是本套那支墨 ${theme.ramp.inks[0]}（没串色）`,
      rgb3.length === 3 && rgb3.every((v, i) => Math.abs(v - want3[i]) <= 1), `${rgb3.join(',')} vs ${want3.join(',')}`)
    // 两面都要过线：那些数字有的压在卡上（列表日期、要点计数），有的直接压在页底
    //（「关于」那几行右侧的值、版权行）——只测卡底会漏掉页底那一面，而页底才是更暗的一面。
    ck(`${theme.label}：三级字压本套卡底过正文门槛 4.5`,
      p.crOf(mixOn(theme.line, theme.ramp.inks[0], 0.72), theme.line) >= 4.5,
      p.crOf(mixOn(theme.line, theme.ramp.inks[0], 0.72), theme.line).toFixed(2))
    ck(`${theme.label}：三级字压本套页底过正文门槛 4.5`,
      p.crOf(mixOn(theme.page, theme.ramp.inks[0], 0.72), theme.page) >= 4.5,
      p.crOf(mixOn(theme.page, theme.ramp.inks[0], 0.72), theme.page).toFixed(2))

    // ③b 二级字这一档 .66 → .72（站长 10-04 拍）：读「我的」页那行 slogan 的计算色，
    //     它是真吃 --text-secondary 且**不压在照片上**的元素（首页 .stat .l 在铺图态被翻成纸白，
    //     拿它测这一档会量到另一条规则）。.66 时象牙/天青压卡底只有 4.35/4.38，本来就不线。
    const sl = await me.$('.sheet-slogan')
    const secondary = sl ? String(await sl.style('color')) : '(没读到 .sheet-slogan)'
    const a2 = alphaOf(secondary)
    const want2 = p.hexToRgb(theme.ramp.inks[0])
    const rgb2 = (String(secondary).match(/\d+/g) || []).slice(0, 3).map(Number)
    ck(`${theme.label}：二级字 alpha = .72`, a2 !== null && Math.abs(a2 - 0.72) < 0.01, secondary)
    ck(`${theme.label}：二级字用的就是本套那支墨 ${theme.ramp.inks[0]}（没串色）`,
      rgb2.length === 3 && rgb2.every((v, i) => Math.abs(v - want2[i]) <= 1), `${rgb2.join(',')} vs ${want2.join(',')}`)
    ck(`${theme.label}：二级字压本套卡底过正文门槛 4.5`,
      p.crOf(mixOn(theme.line, theme.ramp.inks[0], 0.72), theme.line) >= 4.5,
      p.crOf(mixOn(theme.line, theme.ramp.inks[0], 0.72), theme.line).toFixed(2))

    // ④ 按钮那一面（＝底栏选中那枚圆底）在真页面上的证据由另一把尺子采像素给：
    //    它是自绘组件，automator 的 $() 够不到，只能截图采点 —— 见 验-底栏像素-真跑.js
    //    （10-04 起那把从"挑两枚代表"改成四枚全跑）。这里只钉静态那一条钉不到的：
    //    壁纸切过来之后，chromeOf 现算的那一支确实 ≥ 4.7（纸白压得住）。
    ck(`${theme.label}：chromeOf.sel ${chrome.sel} 纸白压得住（≥4.7）`,
      p.crOf('#F2EFE9', chrome.sel) >= 4.7, p.crOf('#F2EFE9', chrome.sel).toFixed(2))

    // ⑤ 这一节 10-09 换过一次口径：v30/v31 那版钉的是"层色 + 区内顶那一行吃创建页那块深面"，
    //    站长拿「我的」页的截图打回"太深"，现在这两屏是**两层浅背景**：外层页底 `--bg-page`、
    //    那张圆角卡 `--bg-card`（＝palette 的 `theme.line`），区内顶那一行不再有自己的面。
    //    读的还是真页面上真渲染出来的计算色——不读变量、不读源码，理由同上一版注释。
    const ix = await enter('/pages/index/index')
    await sleep(4000)
    const sheet = await ix.$('.sheet')
    const gotSheet = sheet ? hex(await sheet.style('background-color')) : '(没读到 .sheet)'
    ck(`${theme.label}：那张圆角卡落在这一套的卡色 ${theme.line} 上（10-09 起不再吃 v31 那层派生灰）`,
      gotSheet.toUpperCase() === theme.line.toUpperCase(), gotSheet)
    const outer = await ix.$('.container')
    const gotOuter = outer ? hex(await outer.style('background-color')) : '(没读到 .container)'
    ck(`${theme.label}：卡外面那一层就是页面底 ${theme.page}（两层浅背景＝这两支，与「我的」同一对）`,
      gotOuter.toUpperCase() === theme.page.toUpperCase(), gotOuter)
    const row = await ix.$('.vtabs')
    const gotRow = row ? String(await row.style('background-color')) : '(没读到 .vtabs)'
    ck(`${theme.label}：区内顶那一行不再自己画面（撤深面要读到透明才算撤净）`,
      /rgba\(0, 0, 0, 0\)|transparent/i.test(gotRow), gotRow)
    const tabs = await ix.$$('.vtab')
    // 不用 `:not(.on)`：automator 的选择器引擎跑在 WXML 树上，`:not()` 它不认，
    // 10-09 实测会退回匹配第一枚（正好是选中那枚），于是这条判据永远读到纸白、永远红。
    // 改成按 class 属性自己捞——读的是真元素身上的 class，不是我自己推的。
    const pick = async (want) => {
      for (const e of tabs) {
        const c = await e.attribute('class')
        // attribute() 这一版直接回字符串，不是 {name,value}（同文件上面 ③ 那条读 style 也一样）。
        // 先按字符串读、读不到再退 .value，两条路都不成立时判据红，不会闷声当"没这个 class"。
        const v = typeof c === 'string' ? c : (c && c.value)
        if (typeof v !== 'string') return null
        if (v.split(/\s+/).includes('on') === want) return e
      }
      return null
    }
    const onTab = await pick(true)
    const offTab = await pick(false)
    const onCol = onTab ? String(await onTab.style('color')) : '(没读到选中那枚 .vtab)'
    const offCol = offTab ? String(await offTab.style('color')) : '(没读到未选那枚 .vtab)'
    ck(`${theme.label}：tab 一共两枚（捞少了下面的色就无从比）`, tabs.length === 2, `${tabs.length} 枚`)
    ck(`${theme.label}：选中那枚吃这一页的整档墨 ${theme.ramp.inks[0]}（10-09 撤深面之后不再吃纸白）`,
      hex(onCol).toUpperCase() === theme.ramp.inks[0].toUpperCase(), onCol)
    ck(`${theme.label}：未选那枚是同一支墨的 .72 档（--text-secondary），不是 62% 纸白`,
      hex(offCol).toUpperCase() === theme.ramp.inks[0].toUpperCase()
      && Math.abs((alphaOf(offCol) || 0) - 0.72) < 0.01, offCol)
    const bw = row ? String(await row.style('border-bottom-width')) : '(读不到)'
    ck(`${theme.label}：那一行底下那条通栏线撤了（border-bottom-width 归零）`, /^0/.test(bw.trim()), bw)
    const capsules = await ix.$$('.chip')
    ck(`${theme.label}：分类行不再有胶囊（首页上 .chip 一枚都不该剩）`, capsules.length === 0, `${capsules.length} 枚`)
    const cats = await ix.$$('.ix-cat')
    ck(`${theme.label}：分类那一行是文字档（.ix-cat 至少两枚，捞空不等于通过）`, cats.length >= 2, `${cats.length} 枚`)
  }

  // 收尾：把进来那一枚**点**回去（四枚都走服务端，这一趟会真发 PUT），
  // 不再往那个已经没人读的本机键里写值——那等于什么都没还原。
  {
    const wp = await enter('/pages/wallpaper/wallpaper')
    await sleep(4000)
    const list = (await wp.data()).wallpapers || []
    const bi = list.findIndex((x) => x.key === before)
    const els = await wp.$$('.wp-chip')
    if (bi >= 0 && els[bi]) { await els[bi].tap(); await sleep(3500) }
    ck('收尾把壁纸还原回进来那一枚（服务端也写回去了）',
      (await wp.data()).currentWallpaper === before, `${before} ← ${(await wp.data()).currentWallpaper}`)
  }
  await lang.pin(mp, langBefore)
  await mp.close()
  console.log(`\n${bad.length ? `✗ 红 ${bad.length} 条：${bad.join(' | ')}` : '全过'}`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('尺子挂了', e); process.exitCode = 2 })
