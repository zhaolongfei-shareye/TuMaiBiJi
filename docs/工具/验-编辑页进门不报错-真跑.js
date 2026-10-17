/**
 * 真跑尺子：进「编辑笔记」这一屏不许再弹「加载失败」。
 *
 * 站长 10-18 02:0x 真机一句「有问题，编辑笔记时候，报错，赶紧处理」＋两张截图（内容都铺出来了、
 * 却弹一句加载失败）。服务端 journalctl 那半小时**全是 200**、非 GET 一条没有 ⇒ 异常在客户端。
 * 模拟器同一篇（id=67）复现到同一句 `error: 加载笔记失败`，抓出的正文是
 *   TypeError: (intermediate value…).split is not a function  ← at normTags ← 建基线那一行
 * 根因：`normTags` 是给"两头同一把尺"写的（库里 `tags` 是**数组**、屏上文本框读回来是**字符串**），
 * 可它只把非数组那一支折成字符串，数组那一支原样交给 `.split` ⇒ 每次进门都在
 * `loadNoteForEdit` 的 catch 里被接住，成了"字都铺出来了、却说一句加载失败"。
 *
 * 这一把量的是：① 前提（服务端回的 tags 真的是数组）② 进门这一趟 console 里不许有那句失败
 * ③ 基线真的建起来了（`_baseline` 挂在页面实例上，evaluate 直接读它）④ 基线里那一栏折成了字符串
 * ⑤ 反向：旧那一支喂数组必抛（不改文件，就地把两种写法各跑一遍）。
 * 全程只 GET、只导航，不保存、不写库。
 */
const automator = require('miniprogram-automator')
const path = require('path')
const fs = require('fs')

const OUT = path.resolve(__dirname, '../design/10-18-编辑页报错/实测')
let reds = 0
const ck = (name, pass, got) => {
  console.log(`${pass ? '✓' : '✗'} ${name}${got === undefined ? '' : `　→ ${got}`}`)
  if (!pass) reds++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const logs = []
  const bind = (name, fn) => { try { if (typeof mp.on === 'function') mp.on(name, fn) } catch (e) { /* 没这个事件口就不拦，主判据另有三条 */ } }
  bind('console', (m) => logs.push(`${m && m.type}: ${m && m.args ? m.args.map((a) => (a && a.description) || String(a)).join(' ') : m}`))

  /* ---------- 〇、从列表那一屏拿一篇真有的笔记（不许自己编 id） ---------- */
  const listPage = await mp.switchTab('/pages/index/index')
  await sleep(2500)
  const ld = await listPage.data()
  const list = ld.notes || ld.list || ld.notesList || []
  if (!list.length) { console.log('!! 列表是空的，这一把量不了（量不了不是过）'); process.exit(3) }
  const pick = list[0]

  /* ---------- 一、进编辑页（前提与判据同一趟量，不另发一次带凭证的请求） ---------- */
  logs.length = 0
  await mp.evaluate((u) => new Promise((res) => { wx.navigateTo({ url: u, success: res, fail: res }) }),
    `/pages/write/write?id=${pick.id}&mode=edit`)
  await sleep(4000)
  const page = await mp.currentPage()
  const wd = await page.data()

  // 前提：服务端回的 `tags` 真的是**数组**（这就是被修的那个形状）。
  // 不自己再打一次带凭证的请求（那等于把 apiBase 抄第二份），而是拿这一页已经吃过的证据：
  // 第 102-103 行是 `(note.tags || []).join(', ')` 与 `.map(...)` —— 字符串没有这两个方法，
  // 它要是字符串，那一趟在铺字之前就抛了，`tagList` 根本不会有货。
  ck('前提：`tags` 是数组（`tagList` 有货＝`.map` 那一趟活着走完了）　注：这条要是假的，后面全白测',
    Array.isArray(wd.tagList) && wd.tagList.length > 0,
    `tagList ${JSON.stringify(wd.tagList).slice(0, 60)}`)

  const failed = logs.filter((l) => /加载笔记失败/.test(l))
  ck('进门这一趟不许有那句「加载笔记失败」（他那句"报错"就是它）', failed.length === 0,
    failed.length ? failed[0].slice(0, 90) : 'console 里没有这一句')

  ck('进的确实是编辑页这一屏（不是被弹回列表）', page.path === 'pages/write/write', page.path)
  ck('四栏都铺出来了（铺得出＝不是空壳；旧那一版也满足这一条，所以它是配套，不是主判据）',
    !!(wd.formData && wd.formData.title) && typeof wd.keyPointsText === 'string' && wd.keyPointsText.length > 0
    && typeof wd.tagsText === 'string' && wd.tagsText.length > 0,
    `标题「${String((wd.formData && wd.formData.title) || '').slice(0, 10)}」要点 ${wd.keyPointsText.length} 字 标签「${wd.tagsText.slice(0, 22)}」`)

  /* ---------- 三、基线真的建起来了（这一条才是"那一行没抛"的直接证据） ---------- */
  const base = await mp.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const b = p._baseline
    return b ? { has: true, tagsType: typeof b.tags, tags: b.tags, linesType: typeof b.key_points } : { has: false }
  })
  ck('`_baseline` 在（建基线那一行就是抛点：它在＝那一行走完了）', base.has === true,
    base.has ? `tags 是 ${base.tagsType}、key_points 是 ${base.linesType}` : '页面实例上没有 _baseline')
  ck('基线里那一栏折成了**字符串**，且与文本框那一栏同一个形状（两头同一把尺）',
    base.has && base.tagsType === 'string' && typeof wd.tagsText === 'string'
    && base.tags === wd.tagsText.split(/[，,]/).map((x) => x.trim()).filter(Boolean).join(','),
    `基线「${String(base.tags).slice(0, 30)}」／框「${wd.tagsText.slice(0, 30)}」`)

  /* ---------- 四、反向：旧那一支喂数组必抛（就地跑，不动文件） ---------- */
  const rev = await mp.evaluate(() => {
    // 这两支只差"数组那一支怎么进 `.split`"，其余逐字照 `pages/write/write.js` 那一把尺抄
    // （⚠ 上一版我把中间那两步 `map(trim)/filter` 抄丢了，于是"两头同串"红的是这把尺抄错了，
    //    不是实现错了——判据写歪就先改判据。）
    const old = (v) => (Array.isArray(v) ? v : (v == null ? '' : String(v)))
      .split(/[，,]/).map((x) => x.trim()).filter(Boolean).join(',')
    const neu = (v) => (Array.isArray(v) ? v.join(',') : (v == null ? '' : String(v)))
      .split(/[，,]/).map((x) => x.trim()).filter(Boolean).join(',')
    let threw = ''
    try { old(['甲', '乙']) } catch (e) { threw = String(e && e.message || e).slice(0, 40) }
    return { threw, fromStr: neu('甲, 乙'), fromArr: neu(['甲', ' 乙 ']), same: neu('甲, 乙') === neu(['甲', '乙']) }
  })
  ck('反向有牙：旧那一支喂数组当场抛（新那一支不抛，且两种形状折成同一个串）',
    !!rev.threw && rev.fromStr === '甲,乙' && rev.fromArr === '甲,乙' && rev.same === true,
    `旧的抛「${rev.threw}」／框那一头「${rev.fromStr}」／数组那一头「${rev.fromArr}」／两头同串=${rev.same}`)

  await mp.screenshot({ path: path.join(OUT, '01-编辑页进门不报错.png') })
  console.log(`截图：${path.join(OUT, '01-编辑页进门不报错.png')}`)
  mp.disconnect()
  console.log(reds === 0 ? '\n真跑全过' : `\n红 ${reds} 条`)
  process.exit(reds === 0 ? 0 : 1)
})().catch((e) => { console.log('脚本停了：', e && e.message); process.exit(2) })
