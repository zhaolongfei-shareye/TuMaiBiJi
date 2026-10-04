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

    // ③ 三级字那一档抬到 .55：读一个**真吃它的元素**的计算色，不读变量。
    //    （`el.style('--text-tertiary')` 实测回 null——automator 的 style() 只给常规计算属性，
    //      自定义属性读不到；读消费者那一侧反而顺带证明"这条声明真的落到了这个元素上"。）
    //    .copyright 在「关于」那一档里（me.wxml 的 block wx:else），而 data.tab 默认是 'set'，
    //    进来直接查它是 null——所以先真点那枚 seg 切过去（不是 callMethod 绕入口）。
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
    ck(`${theme.label}：三级字 alpha = .55（原来 .4 压卡底只有 2.35~2.44，不过 3.0）`,
      a3 !== null && Math.abs(a3 - 0.55) < 0.01, tertiary)
    ck(`${theme.label}：三级字用的就是本套那支墨 ${theme.ramp.inks[0]}（没串色）`,
      rgb3.length === 3 && rgb3.every((v, i) => Math.abs(v - want3[i]) <= 1), `${rgb3.join(',')} vs ${want3.join(',')}`)

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
