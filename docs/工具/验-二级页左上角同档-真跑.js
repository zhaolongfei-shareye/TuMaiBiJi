// 「设置」那两屏二级页＋邮箱那一层的真跑尺子（连模拟器，量屏上，不读源码）。
// 前置：docs/工具/跑尺子.sh 9431 验-二级页左上角同档-真跑
//
// 站长 10-16 夜（附三张真机图）：
//   ①「第一个图亮度不能压暗，与密码设置的弹窗一样处理」
//   ②「图二、图三，最顶上的都改为"设置"，他们是设置的二级菜单」
//   ③「左上角统一为该菜单名称，字体风格要统一」＋「名字、一句话输入框太大了，变成一行，
//      输入字体降一档，提示词放在框内提示，不单独一行」
// 静态那把（`验-二级页左上角同档`）钉的是文件里挂没挂；这一把钉的是**画没画出来**：
// ②③ 都改在导航条与同一格大字上，而"源码写对、渲染不对"正是这一类改版最容易漏的。
//
// 三条口径先说死：
// ⚠ 入口走**真点**（点「我的」那一行菜单），不拿 setData 喂状态——这一屏本来就有这枚行。
// ⚠ 邮箱那一层读的是 `background-color` 计算值（这台工具读得出来：`验-四套莫兰迪落地`
//   就是拿它读页面底渲染色的），读不到就报"读不到"，不许当成"没生效"打产品红。
// ⚠ 收尾要还原：邮箱层关掉、退到「我的」，别把模拟器留在二级页里（下一把尺子会量错屏）。
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '../..')
const PORT = process.env.APORT || '9431'
const SHOT_DIR = path.join(ROOT, 'docs/design/10-16二级页收口/实测')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const unwrap = (r) => (r && typeof r === 'object' && 'result' in r ? r.result : r)
const I18N = require(path.join(ROOT, 'miniprogram/utils/i18n.js'))

let pass = 0
const fails = []
function ok(name, cond, extra) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : ' —— ' + (extra || '')}`)
  if (cond) pass += 1; else fails.push(name)
}

;(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  let mp, lastErr = ''
  for (let i = 0; i < 12; i += 1) {
    try { mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` }); break } catch (e) {
      lastErr = String((e && e.message) || e); await sleep(10000)
    }
  }
  if (!mp) { console.log('!! 连不上自动化端口（环境红，不是判据红）：' + lastErr); process.exit(1) }
  for (let i = 0; i < 40; i += 1) {
    try {
      const n = await mp.evaluate(() => { const a = getApp(); return a && a.globalData && a.globalData.token ? a.globalData.token.length : 0 })
      if (unwrap(n) > 100) break
    } catch (e) { /* 还没起来 */ }
    await sleep(3000)
  }
  const lang = unwrap(await mp.evaluate(() => {
    const a = getApp(); return a && a.globalData ? a.globalData.userInfo && a.globalData.userInfo.language : ''
  })) || 'zh'
  console.log(`账号语言＝${JSON.stringify(lang)}（屏上中文/英文以此为准，截图上看到的与它一致才算对上）`)

  // 导航条那一栏只能把 `wx.setNavigationBarTitle` 包一层记账再读实参（这台工具没别的口子）
  await mp.evaluate(() => {
    const w = wx
    if (w.__navRaw) return
    w.__navRaw = w.setNavigationBarTitle
    w.__nav = []
    w.setNavigationBarTitle = (o) => { w.__nav.push(String((o && o.title) || '')); return w.__navRaw(o) }
  })
  const navLast = async () => unwrap(await mp.evaluate(() => (wx.__nav && wx.__nav.length) ? wx.__nav[wx.__nav.length - 1] : ''))

  const R = (await mp.systemInfo()).windowWidth / 750
  const q = (px) => px / R
  const retry = async (fn, times = 8) => {
    for (let i = 0; i < times; i += 1) { try { const v = await fn(); if (v) return v } catch (e) { /* 再试 */ } await sleep(1200) }
    return null
  }
  const styleNum = async (page, sel, prop) => {
    const el = await retry(() => page.$(sel))
    if (!el) return null
    const v = unwrap(await retry(() => el.style(prop)))
    return v === null || v === undefined ? null : String(v)
  }

  /* ---------- 站在「我的·设置」那一屏，按菜单名真点进去 ---------- */
  for (let i = 0; i < 6; i += 1) {
    try { await mp.switchTab('/pages/me/me') } catch (e) { try { await mp.reLaunch('/pages/me/me') } catch (e2) { /* 再试 */ } }
    await sleep(2500)
    const p = await mp.currentPage()
    if ((p.path || '').indexOf('pages/me/me') >= 0) break
  }
  let page = await mp.currentPage()
  const tab = unwrap(await retry(() => page.data('tab')))
  if (tab !== 'set') { await page.callMethod('onTab', { currentTarget: { dataset: { key: 'set' } } }); await sleep(1500) }
  page = await mp.currentPage()

  // 按那一行的字找到它（拿序号找＝上面加一行就全错位，这一屏 10-16 刚改过一轮）
  const findMenu = async (label) => {
    const labels = await retry(() => page.$$('.menu-label'))
    for (const el of labels || []) {
      if (String(await el.text()).trim() === label) return el
    }
    return null
  }
  const navLen = async () => unwrap(await mp.evaluate(() => (wx.__nav && wx.__nav.length) || 0))
  /* 点完**轮询到页面栈落定**，不睡固定一秒数：`探-二级页菜单点不动` 量过，这一枚 label 的 tap
     是真能跨页的（页面栈 ["me"] → ["me","profile"]），但卡片模板那一屏 onLoad 要画十几张小样，
     2.5 秒还没落定 ⇒ 上一趟七个红全是尺子自己抢读，不是产品。 */
  const tapMenuInto = async (label, wantPath) => {
    const el = await findMenu(label)
    if (!el) return { page: null, why: `摸不到「${label}」那一行` }
    const before = await navLen()
    await el.tap()
    for (let i = 0; i < 12; i += 1) {
      await sleep(1500)
      const cur = await mp.currentPage().catch(() => null)
      if (cur && (cur.path || '').indexOf(wantPath) >= 0) return { page: cur, before }
    }
    const cur = await mp.currentPage().catch(() => null)
    return { page: null, before, why: `点完 18 秒还站在 ${cur ? cur.path : '(读不到)'}` }
  }

  /* ---------- ① 邮箱那一层：打开不许把整屏压暗（与六位密码那一层同一档） ---------- */
  const emailLabel = I18N.t('myEmail', lang)
  const emailRow = await findMenu(emailLabel)
  if (emailRow) {
    await emailRow.tap()
    let mask = null
    for (let i = 0; i < 10; i += 1) { await sleep(1200); mask = await page.$('.me-email-mask'); if (mask) break }
    ok(`邮箱那一层真打开了（真点「${emailLabel}」那一行，不拿 setData 喂）`, !!mask, mask ? '' : '屏上没有 .me-email-mask')
    const bg = await styleNum(page, '.me-email-mask', 'background-color')
    const dimless = bg === null ? null : (/transparent/.test(bg) || /rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg))
    ok('邮箱那一层的遮罩屏上确实是透明的（亮度不变）',
      dimless === true, bg === null ? '(这台工具读不到 background-color，见下面那张截图)' : `屏上 ${bg}`)
    if (bg === null) console.log('     （读不到不算产品红：这一档另有 `验-四套莫兰迪落地` 用同一个口子读页面底色，那条路是通的）')
    await retry(() => mp.screenshot({ path: path.join(SHOT_DIR, '8-邮箱层不压暗.png') }))
    // 收口走那一层自己的「返回」那枚（点遮罩正中＝点在卡上，卡上有 catchtap 不关；
    // callMethod 也能关但那不是人走的那条路）
    const ghost = await retry(() => page.$('.me-email-btn.ghost'))
    if (ghost) { await ghost.tap(); await sleep(1500) }
    const stillOpen = unwrap(await retry(() => page.data('emailOpen')))
    ok('收尾把邮箱那一层关掉了（点它自己那枚「返回」）', !stillOpen, String(stillOpen))
  } else {
    ok(`邮箱那一层：摸到「${emailLabel}」那一行`, false, '这一屏没有这一行（菜单文案漂了）')
  }

  /* ---------- ②③ 两屏二级页：顶上念「设置」，左上角念自己 ---------- */
  const SUB = [
    { label: () => I18N.t('navProfile', lang), key: '卡片模板', url: 'pages/profile/profile', shot: '9-卡片模板页.png' },
    { label: () => I18N.t('categories', lang), key: '分类管理', url: 'pages/categories/categories', shot: '10-分类管理页.png' },
  ]
  const titles = {}
  for (const s of SUB) {
    page = await mp.currentPage()
    const gone = await tapMenuInto(s.label(), s.url)
    if (!gone.page) {
      // 没落定就整段跳过：在这一帧上读什么都是上一屏的，读成红是冤枉产品，读成绿是假绿
      ok(`${s.key}：真点那一行菜单进得去（导航落定才算站上这一屏）`, false, gone.why)
      continue
    }
    page = gone.page
    ok(`${s.key}：真的站在这一屏（页面栈读到的就是这一页）`, true)
    const nav = await navLast()
    const grew = (await navLen()) > gone.before
    const wantNav = I18N.t('pillSettings', lang)
    ok(`${s.key}：最顶上那一栏念的是「${wantNav}」（它是设置的二级菜单）`,
      grew && nav === wantNav,
      `${grew ? '' : '这一栏进这一屏后没重设过；'}屏上 ${JSON.stringify(nav)}／期望 ${JSON.stringify(wantNav)}`)
    const tEl = await retry(() => page.$('.page-title'))
    const txt = tEl ? String(await tEl.text()).trim() : ''
    ok(`${s.key}：左上角那一行大字画出来了，念的是这一格自己的菜单名`,
      txt === s.label(), `屏上 ${JSON.stringify(txt)}／期望 ${JSON.stringify(s.label())}`)
    const fs2 = await styleNum(page, '.page-title', 'font-size')
    const fw = await styleNum(page, '.page-title', 'font-weight')
    ok(`${s.key}：那一档大字屏上读得到（字号 ${fs2}／字重 ${fw}），"统一"两字量的就是它`,
      !!fs2 && !!fw, `读到 ${fs2}／${fw}`)
    if (fs2 && fw) titles[s.key] = `${fs2}|${fw}`
    if (s.key === '卡片模板') {
      const inFs = await styleNum(page, '.field-input', 'font-size')
      ok(`卡片模板：输入的字比那档小一号（框内提示吃同一只框；屏上 ${inFs} vs 大字 ${fs2}）`,
        !!inFs && !!fs2 && parseFloat(inFs) < parseFloat(fs2), `读到 ${inFs}`)
      const ph = await retry(() => page.$('.field-input'))
      const phTxt = ph ? String(await ph.attribute('placeholder') || '') : ''
      const wantPh = I18N.t('profileNamePh', lang)
      if (phTxt) {
        ok(`卡片模板：提示词在框内（placeholder＝${JSON.stringify(phTxt)}），上面那行标签没了`,
          phTxt === wantPh, `屏上 ${JSON.stringify(phTxt)}／期望 ${JSON.stringify(wantPh)}`)
      } else {
        console.log(`     （placeholder 这一枚属性这台工具读不回来，这一发退到截图＋静态那把；不算产品红）`)
      }
      const stray = await page.$('.field-label')
      ok('卡片模板：屏上确实没有第二行标签（撤净是两头一起撤：wxml 与 wxss，静态那把钉）', !stray, '还在')
    }
    await retry(() => mp.screenshot({ path: path.join(SHOT_DIR, s.shot) }))
    await mp.navigateBack().catch(() => {})
    await sleep(2000)
  }
  const ks = Object.keys(titles)
  if (ks.length === 2) {
    ok('两屏左上角那一档**逐字同一个数**（字号＋字重相等；漂一档就红）',
      titles[ks[0]] === titles[ks[1]], `${ks[0]} ${titles[ks[0]]}　vs　${ks[1]} ${titles[ks[1]]}`)
  } else ok('两屏左上角那一档逐字同一个数', false, `只量到 ${ks.length} 屏`)

  await mp.evaluate(() => { if (wx.__navRaw) { wx.setNavigationBarTitle = wx.__navRaw; delete wx.__navRaw; delete wx.__nav } }).catch(() => {})
  console.log(`\n截图在 ${SHOT_DIR}`)
  console.log(`${fails.length ? '✗' : '✓'} 二级页收口 真跑：${pass}/${pass + fails.length} 过${fails.length ? '　红：' + fails.join('；') : ''}`)
  process.exit(fails.length ? 1 : 0)
})().catch((e) => { console.log('!! 尺子挂了 ' + ((e && e.stack) || e)); process.exit(1) })
