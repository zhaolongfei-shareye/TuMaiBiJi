// 现网后台那一栏填的那两句，到底有没有真走到屏上（第二十五次部署的收口那一条）。
//
// 为什么必须单独真跑一把，本地那两把不够：`验-Tips后台下发.js` 量的是服务端那份形状，
// `验-Tips下发收得进.js` 量的是客户端那份读法与兜底顺序——两边都拿替身，中间那段真网络
// （登录成功 ⇒ `mpAssets.pull()` ⇒ 公网 `/api/mp/config` ⇒ 落本机缓存 ⇒ 下一次进页读到）
// 一次没走过。这条链最贵的一类漏法就是静默的：pull 挂了不出声、屏上落回包里那六句，
// 画面看着完全正常，而后台改的那句一个字没生效。只有拿**现网真实回体**当基准才看得见。
//
// 基准不是仓库里的副本，三步（跑法与收回都写在 docs/工具/操作单-Tips后台下发.md）：
//   ① 探针写一份到现网并留在位上：… | python docs/工具/探-现网Tips后台下发.py --keep
//   ② 从服务器签一把用户 token、把 `/api/mp/config` 那份回体落到 /tmp/live-tips.json，scp 回本机
//   ③ 验完收回：… | python docs/工具/探-现网Tips后台下发.py --revert（回到包里那六句）
// 拿不到回体就退 3 报错，**不许拿包里那六句顶替**——顶替等于这把尺子从没量过现网。
//
// 判据的方向是反的：屏上那句必须**不在**包里那六句里。读到"拍照或截图存进来…"那类，
// 说明这一趟压根没收到下发（那是真红，不是尺子的问题）。
//
// ⚠ 量法上钉死的一条（第一把就因为它红了两条）：屏上是哪一门由 `data.lang` 说话，不许拿
//   现网那份中文去比英文那一门。每一门各取"现网该语言那一份"与"包里该语言那六句"，
//   两门都过才算这条链通——只中一门＝后台只发了一半而客户端照收。
//   界面上那一行是「前缀＋那一句」，比之前按同一门把 `tipsPrefix` 切掉，整串相等必然红。
//
// 跑法：bash docs/工具/跑尺子.sh 9431 验-Tips现网收到-真跑
const automator = require('miniprogram-automator')
const fs = require('fs')

const PORT = process.env.MP_PORT || 9431
const PAYLOAD = process.argv[2] || '/tmp/live-tips.json'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const bad = []
let total = 0
const ck = (name, ok, got) => {
  total++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ` → ${got}`}`)
  if (!ok) bad.push(name)
}

if (!fs.existsSync(PAYLOAD)) {
  console.error(`✗ 读不到现网回体：${PAYLOAD}`)
  console.error('  按本文件顶上那三步取一份再跑。拿包里那六句顶替＝这把尺子没量过现网，别那样跑。')
  process.exit(3)
}
const cfg = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8'))
const LIVE = cfg.tips
if (!LIVE || !Array.isArray(LIVE.zh) || !Array.isArray(LIVE.en)) {
  console.error('✗ 现网回体里 tips 是空的（那一栏停用了）。先跑探针 --keep 设一份再来。')
  process.exit(3)
}
// 包里那六句从 i18n 现读，不抄在这里：改了包内文案这把尺子要跟着变才是真判据。
const I18N = require('../../miniprogram/utils/i18n.js')
const APPINFO = require('../../miniprogram/utils/appInfo.js')

const inArr = (s, arr) => Array.isArray(arr) && arr.some((x) => String(x) === String(s))
const wantFor = (lang) => (lang === 'zh' ? LIVE.zh : LIVE.en)
const pkgFor = (lang) => (lang === 'zh' ? I18N.t('tips', 'zh') : I18N.t('tips', 'en'))

;(async () => {
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` })
  } catch (e) {
    console.error(`✗ 连不上模拟器端口 ${PORT}（真跑尺子要走 跑尺子.sh，它负责起 IDE）：${e.message}`)
    process.exit(2)
  }

  const readCache = () => mp.evaluate(() => {
    try { return wx.getStorageSync('MP_TEXT_KEY_tips') || null } catch (e) { return { err: String(e) } }
  })

  // 某一门语言下的三条判据：句数、逐字来自现网那一份、逐字都不是包里那份（反证）。
  const checkLang = (tag, lang, tips) => {
    const want = wantFor(lang)
    const pkg = pkgFor(lang)
    ck(`${tag}｜这一门是 ${lang}，屏上句数＝现网句数（包里 ${pkg.length} 句）`,
      Array.isArray(tips) && tips.length === want.length,
      `屏上 ${(tips || []).length} 句，现网 ${want.length} 句`)
    ck(`${tag}｜屏上每一句逐字来自现网那一份`,
      Array.isArray(tips) && tips.every((s) => inArr(s, want)), JSON.stringify(tips))
    ck(`${tag}｜屏上没有一句是包里那 ${pkg.length} 句（反证：有＝这一趟压根没收到下发）`,
      Array.isArray(tips) && !tips.some((s) => inArr(s, pkg)),
      Array.isArray(tips) && tips.some((s) => inArr(s, pkg)) ? `读到的是包内那份：${tips[0]}` : '')
  }

  // 那一行真把字画到屏上了（不是只有 data 里有数组）：界面上是「前缀＋那一句」，切掉前缀再比。
  const checkLine = async (page, d, lang, tag) => {
    const el = await page.$('.blk-tips-line')
    const txt = el ? await el.text() : null
    const pre = String((d && d.tipsPrefix) || '')
    const body = txt === null || txt === undefined ? null : String(txt).replace(pre, '').trim()
    ck(`${tag}｜那一行画在屏上，去掉前缀「${pre}」后就是现网那一份里的一句`,
      !!body && inArr(body, wantFor(lang)), `整行 ${JSON.stringify(txt)}｜正文 ${JSON.stringify(body)}`)
  }

  const switchLang = async (page, key) => {
    try {
      await page.callMethod('onSwitchLang', { currentTarget: { dataset: { key } } })
    } catch (e) {
      console.log(`  · callMethod 切 ${key} 没成（改点角标）：`, e.message)
      const corner = await page.$('.lang-corner')
      if (corner) await corner.tap()
    }
    await sleep(2500)
    return page.data()
  }

  try {
    const boot = await mp.reLaunch('/pages/create/create')
    await sleep(6000)
    console.log(`  本机这份包的号：${APPINFO.VERSION}（这把量的是屏上读到的字；9431 被两条线共用，号只用来对账）`)

    // pull 挂在"登录成功"那一刻且不 await，所以这里轮询等它把缓存落下来；最多等 40 秒。
    // 等不到是**真红**：那一趟要么没发出去，要么回体收不进缓存。
    let d = null
    let cached = null
    for (let i = 0; i < 20; i++) {
      await sleep(2000)
      try {
        d = await boot.data()
      } catch (e) {
        console.log(`  · 第 ${i + 1} 次读页面数据没读到：${e.message}`)
        continue
      }
      cached = await readCache()
      const tips = d && d.tips
      const want = wantFor(d && d.lang)
      if (Array.isArray(tips) && tips.length === want.length && tips.every((s) => inArr(s, want))) break
    }
    if (!cached) cached = await readCache()

    console.log('  本机缓存里那份：', JSON.stringify(cached))
    console.log('  屏上现在这门：', d && d.lang, '｜句子：', JSON.stringify(d && d.tips))

    ck('客户端收进了本机缓存（zh/en 两份都是现网那一份）',
      !!cached && Array.isArray(cached.zh) && Array.isArray(cached.en)
        && cached.zh.join('|') === LIVE.zh.join('|') && cached.en.join('|') === LIVE.en.join('|'),
      cached && cached.zh ? `zh ${cached.zh.length} 句 / en ${cached.en.length} 句` : '缓存里没有')
    ck('缓存里带 updatedAt 且与现网回体那枚是同一个（它是"本机那份要不要换"的唯一判据）',
      !!(cached && cached.updatedAt === LIVE.updated_at),
      `缓存 ${cached && cached.updatedAt} vs 现网 ${LIVE.updated_at}`)

    const lang0 = d && d.lang
    checkLang('进门那一门', lang0, d && d.tips)
    await checkLine(boot, d, lang0, '进门那一门')

    // 换到另一门再量一遍：两份语言都得从现网来。
    const lang1 = lang0 === 'zh' ? 'en' : 'zh'
    const d1 = await switchLang(boot, lang1)
    ck(`切成 ${lang1} 之后屏上这门真是 ${lang1}（切不动＝另一门压根没量到）`,
      d1 && d1.lang === lang1, `屏上读到 ${d1 && d1.lang}`)
    if (d1 && d1.lang === lang1) {
      checkLang('另一门', lang1, d1 && d1.tips)
      await checkLine(boot, d1, lang1, '另一门')
    }

    // 语言这门是屏上会留下的状态，切回进门那一门（与 验-中英切换-真跑 同一纪律）。
    const d2 = await switchLang(boot, lang0)
    ck(`量完切回进门那一门 ${lang0}（不给屏上留状态）`, d2 && d2.lang === lang0, `屏上读到 ${d2 && d2.lang}`)
  } catch (e) {
    ck('整把跑完没抛异常', false, `${e && e.message ? e.message : e}`)
  } finally {
    console.log(`\n合计 ${total} 条，不过 ${bad.length} 条${bad.length ? `：${bad.join('｜')}` : '　全过'}`)
    try { await mp.close() } catch (_) {}
    process.exit(bad.length ? 1 : 0)
  }
})()
