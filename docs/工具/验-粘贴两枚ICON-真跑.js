// 验-粘贴两枚ICON-真跑.js — §8.532（站长 11-16 报的 BUG：链接档与写文字档的「粘贴」ICON 点了没动作）
// 跑法：docs/工具/跑尺子.sh 9431 验-粘贴两枚ICON-真跑
//
// 这一把要量到的证据分两层：
//   ① 三枚粘贴入口在模拟器里逐枚真点，剪贴板用 mockWxMethod 钉成已知内容：
//      - 照片档第三枚（onPasteAny）＝自适应对照：URL→自动跳「链接」档并填上；纯文字→跳「写文字」档；
//      - 链接档那枚（onPasteUrl）→ urlInput 变成 mock 的串（参数一个不抹）；
//      - 写文字档那枚（onPasteWrite）→ 接在已有原文后面（换行分隔，不顶掉）。
//   ② 差分证据：每一枚点完都记 {active, errLine, 框内容}。真机上「没动作」有三种死法，
//      屏上读数能分辨：mode 自己收了（点漏到容器=collapse）／气泡报了错（处理器跑了但读失败）／
//      什么都不动（处理器根本没接到 tap）。模拟器这趟先把「代码本身通不通」钉死。
// 空剪贴板那一格也点：读不到 ≠ 静默，得有那句话（pasteEmpty）。
// ⑤ 11-16 落刀后新增：把 wx.getClipboardData 换成**永不回调**（evaluate 里覆写），
//    模拟真机「剪贴板里是图片」那堵墙（10-16 实测：success/fail 六秒内一个都不回）。
//    两枚 ICON 各点一次，断言 PASTE_WAIT_MS(2s) 内 errLine 变成 pasteNoText 那句话——
//    修复前这两枚在真机上就是永远哑在这里。覆写不进去就明说"量不了"，不算产品红。
// mock 只进内存，不碰真剪贴板、不碰现网。收尾 restoreWxMethod 还原。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'docs/design/11-16粘贴ICON')
const INFO = path.join(ROOT, 'miniprogram/utils/appInfo.js')
const CREATE_JS = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/create/create.js'), 'utf8')
const CREATE_WXML = fs.readFileSync(path.join(ROOT, 'miniprogram/pages/create/create.wxml'), 'utf8')

const HIT = /const VERSION = '([^']+)'/.exec(fs.readFileSync(INFO, 'utf8'))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const shot = async (mp, name) => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const p = path.join(OUT, name)
  try { await mp.screenshot({ path: p }); console.log(`  截图 ${p}`) } catch (e) { console.log(`  截图失败 ${name}: ${e.message}`) }
}

// ---------- 静态：三枚都接线、busy 闸都在 ----------
ck('链接档那枚 catchtap=onPasteUrl 在 WXML 上', CREATE_WXML.includes('catchtap="onPasteUrl"'))
ck('写文字档那枚 catchtap=onPasteWrite 在 WXML 上', CREATE_WXML.includes('catchtap="onPasteWrite"'))
ck('照片档第三枚 catchtap=onPasteAny 在 WXML 上', CREATE_WXML.includes('catchtap="onPasteAny"'))
for (const h of ['onPasteUrl', 'onPasteWrite', 'onPasteAny']) {
  ck(`create.js 里 ${h} 处理器还在`, new RegExp(`\\b${h}\\(`).test(CREATE_JS))
}

async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }); break } catch (e) { await sleep(8000) }
  }
  if (!mp) { console.log('!! 连不上自动化端口'); process.exit(1) }
  try {
    await sleep(5000)

    // ---------- 版本闸：9431 两棵工作树共用，先比屏上版本与 appInfo ----------
    await mp.navigateTo('/pages/about/about')
    await sleep(2500)
    let page = await mp.currentPage()
    const aboutData = await page.data()
    ck(`屏上版本＝appInfo（两树共用的 9431 得先对号）`, aboutData.version === HIT[1],
      `屏上 ${aboutData.version} / appInfo ${HIT[1]}`)
    if (aboutData.version !== HIT[1]) { process.exitCode = 3; return }

    // ---------- 进录入面板：点左块开门（openBar→photo） ----------
    await mp.reLaunch('/pages/create/create')
    await sleep(4000)
    page = await mp.currentPage()
    await (await page.$('.blk-plus')).tap()
    await sleep(1200)
    let d = await page.data()
    ck('点左块开门进照片档', d.active === 'photo', `active=${d.active}`)
    await shot(mp, '01-照片档-三枚圈.png')

    // ---------- ① 对照：照片档第三枚自适应（URL→跳链接档） ----------
    const LINK1 = 'https://sspai.com/post/70123'
    await mp.mockWxMethod('getClipboardData', { data: LINK1, errMsg: 'getClipboardData:ok' })
    const minis = await page.$$('.mini')
    ck('照片档三枚圈里第二枚 .mini 是粘贴', minis.length === 2, `找到 .mini ×${minis.length}`)
    await minis[1].tap()
    await sleep(1000)
    d = await page.data()
    ck('①粘贴圈自适应：URL 自动跳链接档', d.active === 'url', `active=${d.active} err=${d.errLine}`)
    ck('①粘贴圈自适应：链接原样进框', d.urlInput === LINK1, d.urlInput)
    await shot(mp, '02-对照-URL跳链接档.png')

    // ---------- ① 对照：纯文字→跳写文字档 ----------
    const TXT1 = '一段来自剪贴板的文字'
    await mp.mockWxMethod('getClipboardData', { data: TXT1, errMsg: 'getClipboardData:ok' })
    page = await mp.currentPage()
    const tabs = await page.$$('.md')
    ck('三档 tab 都在', tabs.length === 3, `找到 .md ×${tabs.length}`)
    await tabs[0].tap() // 回照片档
    await sleep(900)
    page = await mp.currentPage()
    const minis2 = await page.$$('.mini')
    await minis2[1].tap()
    await sleep(1000)
    d = await page.data()
    ck('①粘贴圈自适应：纯文字跳写文字档', d.active === 'write', `active=${d.active} err=${d.errLine}`)
    ck('①粘贴圈自适应：文字落进原文框', d.writeBody === TXT1, JSON.stringify(d.writeBody))

    // ---------- ② 链接档那枚粘贴 ICON（报障主体） ----------
    const LINK2 = 'https://mp.weixin.qq.com/s/abc123?xsec_token=XYZ&from=timeline'
    await mp.mockWxMethod('getClipboardData', { data: LINK2, errMsg: 'getClipboardData:ok' })
    page = await mp.currentPage()
    const tabs2 = await page.$$('.md')
    await tabs2[1].tap() // 链接档
    await sleep(900)
    page = await mp.currentPage()
    d = await page.data()
    ck('切到链接档', d.active === 'url', `active=${d.active}`)
    const pasteUrl = await page.$('.field-paste')
    ck('链接档那枚粘贴钮在屏上', !!pasteUrl)
    if (pasteUrl) {
      await pasteUrl.tap()
      await sleep(1000)
      d = await page.data()
      // 差分：处理器没接到 tap = active 原样、errLine 空、urlInput 原样
      ck('②链接档粘贴：没被容器收走（mode 还在）', d.active === 'url', `active=${d.active}`)
      ck('②链接档粘贴：mock 链接进了框（参数一个不抹）', d.urlInput === LINK2,
        JSON.stringify(d.urlInput))
      ck('②链接档粘贴：没报错气泡', !d.errLine, d.errLine)
    }
    await shot(mp, '03-链接档粘贴后.png')

    // ---------- ③ 写文字档那枚粘贴 ICON（报障主体）＋接续语义 ----------
    const TXT2 = '第二段粘贴进来的'
    await mp.mockWxMethod('getClipboardData', { data: TXT2, errMsg: 'getClipboardData:ok' })
    page = await mp.currentPage()
    const tabs3 = await page.$$('.md')
    await tabs3[2].tap() // 写文字档
    await sleep(900)
    page = await mp.currentPage()
    d = await page.data()
    ck('切到写文字档', d.active === 'write', `active=${d.active}`)
    const before = d.writeBody
    const pasteWrite = await page.$('.field-paste')
    ck('写文字档那枚粘贴钮在屏上', !!pasteWrite)
    if (pasteWrite) {
      await pasteWrite.tap()
      await sleep(1000)
      d = await page.data()
      const want = before ? `${before.replace(/\s+$/, '')}\n${TXT2}` : TXT2
      ck('③写文字档粘贴：没被容器收走（mode 还在）', d.active === 'write', `active=${d.active}`)
      ck('③写文字档粘贴：接在原文后面不顶掉', d.writeBody === want,
        `before=${JSON.stringify(before)} after=${JSON.stringify(d.writeBody)}`)
      ck('③写文字档粘贴：没报错气泡', !d.errLine, d.errLine)
    }
    await shot(mp, '04-写文字档粘贴后.png')

    // ---------- ④ 空剪贴板：读不到 ≠ 静默 ----------
    await mp.mockWxMethod('getClipboardData', { data: '', errMsg: 'getClipboardData:ok' })
    page = await mp.currentPage()
    const pasteWrite2 = await page.$('.field-paste')
    if (pasteWrite2) {
      await pasteWrite2.tap()
      await sleep(1000)
      d = await page.data()
      ck('④空剪贴板有一句话（不静默）', !!d.errLine, d.errLine)
    }
    await shot(mp, '05-空剪贴板气泡.png')

    // ---------- ⑤ 静默剪贴板（真机图片那堵墙）：两秒内必须有那句话，不许永远哑 ----------
    const silentOk = await mp.evaluate(() => {
      wx.__gcdOrig = wx.getClipboardData
      wx.getClipboardData = function () {}
      try { wx.getClipboardData.__silent = true } catch (e) {}
      return !!(wx.getClipboardData && wx.getClipboardData.__silent)
    })
    ck('⑤静默模拟钉上了（wx.getClipboardData 已换成永不回调）', silentOk === true)
    if (silentOk === true) {
      // ⑤-1 写文字档（④之后正停在这一档）
      page = await mp.currentPage()
      const pwSilent = await page.$('.field-paste')
      if (pwSilent) {
        await pwSilent.tap()
        await sleep(2600)
        d = await page.data()
        ck('⑤写文字档：静默剪贴板两秒内说出那句话', !!d.errLine && d.errLine.indexOf('贴不进来') > -1, d.errLine)
        ck('⑤写文字档：没被容器收走', d.active === 'write', `active=${d.active}`)
      }
      await shot(mp, '06-写文字档-静默剪贴板那句.png')
      // ⑤-2 链接档
      page = await mp.currentPage()
      const tabs4 = await page.$$('.md')
      await tabs4[1].tap()
      await sleep(900)
      page = await mp.currentPage()
      const puSilent = await page.$('.field-paste')
      if (puSilent) {
        await puSilent.tap()
        await sleep(2600)
        d = await page.data()
        ck('⑤链接档：静默剪贴板两秒内说出那句话', !!d.errLine && d.errLine.indexOf('贴不进来') > -1, d.errLine)
        ck('⑤链接档：没被容器收走', d.active === 'url', `active=${d.active}`)
      }
      await shot(mp, '07-链接档-静默剪贴板那句.png')
    } else {
      console.log('!! 静默模拟没钉上（appservice 里 wx 覆写不进去）⇒ 这一段量不了，量具能力不足，不算产品红')
    }
    // 还原无条件做一次：覆写成功与否都要把原物放回去，别给后面的步骤留哑桩
    await mp.evaluate(() => {
      if (wx.__gcdOrig) wx.getClipboardData = wx.__gcdOrig
      delete wx.__gcdOrig
    })

    console.log(`\n==== 粘贴三枚真跑：${bad.length} 条红 ====`)
    if (bad.length) process.exitCode = 1
  } finally {
    try { await mp.restoreWxMethod('getClipboardData') } catch (e) {}
    await mp.disconnect()
  }
}

main().catch((e) => { console.error('!! 探针挂', e && e.message); process.exit(2) })
