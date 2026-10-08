// 补卡那一趟（2.0.1 P0 · S3）：把**已经丢的那批**找回来。
//
// 方案 §五 是站长点名要的那一节，原话是"只写'以后不再丢'＝当没解决"。S2 做完之后
// "这篇有没有卡片"问的是服务器那一行，可现网那些在 S2 之前生成的卡片一行都没有：
// 图还在手机上的要补传、图被系统清掉的要重渲、连本机台账都被清掉的只能请他确认。
// **三档缺一档，就还有一批人那一格是空的。**
//
// 分档与动手分开：`plan()` 纯分类、不写不画（静态尺子钉的就是这一半），`run()` 才按档执行。
// 那份数只能从这里出，不许界面自己数格子——§七 验收 1.3 断的是"报出来的数与实际处理条数相等"。
const cardLog = require('./cardLog')
const cardCloud = require('./cardCloud')

// 「这是一张卡片」的唯一判据：**路径在这台手机的 cards/ 底下**。
// 不写死这条就会跟着重渲：10-08 S0 在那台模拟器上现读到台账里混着一条
// `http://usr/ruler-detail-cell.jpg`——某把真跑尺子往 cardLog 写过一条自证截图，
// `tpl` 还填着 classic，看起来完全合法。它不是卡片，跟着补传／重渲等于我们凭空给他造了一张。
// ⚠ 前缀只从 `cardLog.DIR` 那一个常量取，不许在这里再拼一次 `${wx.env.USER_DATA_PATH}/cards`
// ——两处各写一遍，早晚有一处跟目录漂开；漂开的那天这条判据形同不存在。
const isCardPath = (p) => typeof p === 'string' && p.indexOf(`${cardLog.DIR}/`) === 0

const _alive = (p) => {
  try {
    wx.getFileSystemManager().accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

// 形象那一格缺图没有。四槽形象图本身也是本机文件（`poster.js` 顶上那个 `poster_avatar_files`），
// 被清的正好是这几张时，重渲出来的卡片上那一格是空的——**那不是"同一张"**。
// 不做的是：拿品牌占位（没人勾「卡片」时画「麦」字那套）替上去，那等于把一张他没见过的封面当成原图。
// require 写在函数里：poster 与这几份卡片模块互相都要读对方，顶层互引会绕成循环加载（cardLog 同条）。
function _avatarMissing() {
  try {
    const poster = require('./poster.js')
    const p = poster.cardPath()
    return !!p && !_alive(p)
  } catch (e) {
    return false
  }
}

/**
 * 分类：这一趟会碰哪几篇、各自归哪一档。**不动手**，所以可以反复调，也可以先在界面上给一句"要补 N 张"。
 *
 * 每一篇必须落到五个下落之一（补传／重渲／待确认／摘掉／跳过带理由），一条都不许静默——
 * §七 验收 1.3 与那把尺子断的都是这个相等。
 *
 * @param {object} over 页面与尺子的注入点，全部有默认值：
 *   `ledger` 本机台账 / `serverCard(id)` 服务器那一行 / `needConfirm` 服务端那份名单 /
 *   `snapshot(id)` 当年那份分享快照 / `alive(p)` 文件在不在 / `avatarMissing` 形象格缺不缺图
 *   （锁着的那几篇、笔记已删的那几篇**不在这里判**：那两样只有打了接口才知道，收在 run 的 `check` 里）
 */
function plan(over) {
  const o = Object.assign({
    ledger: cardLog.all(),
    serverCard: (id) => cardCloud.serverCard(id),
    needConfirm: cardCloud.needConfirm(),
    snapshot: (id) => cardCloud.snapshotOf(id),
    alive: _alive,
    // 默认现读那一次：这一栏决定"账在图没了"那一篇能不能自动补，读错方向的代价是
    // 一张他没见过的封面当成原图，所以默认走真判据，尺子与页面要覆盖才覆盖。
    avatarMissing: _avatarMissing(),
  }, over || {})

  // 这批数没真从服务端读回来过，"这篇没有卡片行"这句话就不成立，分档的前提没了。
  // 这时候宁可不跑，也不要拿一份本机台账当全部去重渲（界面对同一件事的保守口径见 cardCloud.isLoaded）。
  if (!cardCloud.isLoaded()) {
    return { loaded: false, backfill: [], reRender: [], needConfirm: [], foreign: [], skipped: [], 数: null }
  }

  const backfill = []
  const reRender = []
  const needConfirm = []
  const foreign = []
  const skipped = []
  const touched = {}
  const snap = (id) => o.snapshot(id) || null

  Object.keys(o.ledger || {}).forEach((id) => {
    const noteId = Number(id)
    const list = (o.ledger[id] || []).filter((x) => x && x.p)
    // 不是 cards/ 的那几条只**摘账**，不补、不重渲、不计进那份数（文件本来也不是我们建的）
    list.filter((x) => !isCardPath(x.p)).forEach((x) => foreign.push({ noteId, p: x.p }))
    const cards = list.filter((x) => isCardPath(x.p))
    if (!cards.length) return
    touched[noteId] = true
    if (o.serverCard(noteId)) return   // 服务器上已经有当前那一行了，这一篇本来就不欠
    const newest = cards.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0]
    if (o.alive(newest.p)) { backfill.push({ noteId, entry: newest }); return }
    // ↓ 账在图没了——站长 10-08 撞到的、以及 10-03 就实测到过的那一态。
    if (!newest.tpl) {
      skipped.push({ noteId, reason: 'noTpl' })
      return
    }
    if (o.avatarMissing) {
      // 方案 §五 把这一态归进"待确认"那一档的话术，因为要他重新挑一张形象才能补回来
      needConfirm.push({ noteId, reason: 'avatar', snapshot: snap(noteId) })
      return
    }
    reRender.push({ noteId, entry: newest, snapshot: snap(noteId) })
  })

  // 连账都没了的那一档：服务端知道"这篇公开过、可我这没有它的卡片行"，而本机台账一条路径都没有。
  // 台账里有的（哪怕图没了）不归这一档——那一档记得当年用的哪套模板，能自动补；这一档不记得，
  // 猜一套就是把一张他没见过的图塞进他的库（§五 明写"允许一键、不允许全自动"）。
  // 这一档不需要再判私密：服务端不允许私密笔记分享（见 private_access 那条），所以它进不了这份名单。
  ;(o.needConfirm || []).forEach((noteId) => {
    if (touched[noteId] || o.serverCard(noteId)) return
    needConfirm.push({ noteId, reason: 'noLedger', snapshot: snap(noteId) })
  })

  return {
    loaded: true,
    backfill, reRender, needConfirm, foreign, skipped,
    数: { 补传: backfill.length, 重渲: reRender.length, 待确认: needConfirm.length, 摘掉: foreign.length, 跳过: skipped.length },
  }
}

/**
 * 按档执行。三件事都不在这一层：画布只在页面上、能不能动这篇由服务器说（私密那篇锁着正文、
 * 撤过分享的那篇不能再替它开一张公开码）、正文要从口里读。所以页面注入两个函数，两个都吃整条分档项：
 *   `check(item)` → `{skip:'private'|'noteGone'|'noToken'|...}` 或 `{note, qrPath}`
 *   `render(item, ready)` → 出图那张的临时路径（拿不到就 throw／回 null，那一档自己计一次失败）
 * 这一层只管分档、排队、上传、登记，和那份数。
 * @param {{check?:Function, render?:Function, onEach?:Function}} opt
 */
async function run(opt) {
  const o = opt || {}
  // 这一趟要写库，所以先现读一次服务端那份名单再分档：拿上一次进页读回来的数去分，
  // 中间他在这台手机上又生成过一张的话，会把已经有行的那篇再补一遍（upsert 幂等，但那份数就虚报了）。
  // 读回来是 null ＝ 这一趟根本没连上服务器：宁可一句不补，也不要按一份过期的名单动他的台账。
  const fresh = await cardCloud.refresh()
  if (!fresh) return { loaded: false, 报告: null, offline: true }
  const p = plan(Object.assign({ avatarMissing: _avatarMissing() }, o))
  if (!p.loaded) return { loaded: false, 报告: null, plan: p }

  // 先摘台账里那些不属于卡片的路径（只动那几条，别的一个字节都不碰）
  const 摘掉 = cardLog.pruneNotCards(isCardPath)

  const 这趟跳过 = []
  const 报 = { 补传: 0, 重渲: 0, 待确认: p.needConfirm.length, 摘掉, 跳过: p.skipped.slice(), 失败: [] }
  const 每篇 = (kind) => { if (o.onEach) o.onEach(kind) }
  // 这一趟能不能动这篇：页面那一个 check 说了算（锁着的、笔记已删的、不能再替它开公开码的）。
  // 回 skip 的那些一律进"跳过"，带着理由——§五 那条"跳过的每一篇要能列出是为什么跳过"。
  const 查 = async (x) => (typeof o.check === 'function' ? (await o.check(x)) || {} : {})

  for (const x of p.backfill) {
    const c = await 查(x)
    if (c.skip) { 这趟跳过.push({ noteId: x.noteId, reason: c.skip }); continue }
    // archive() 全程不抛，回的是这一趟的下落；登记没成的那一条它自己进待补队列（S2 那条）。
    const r = await cardCloud.archive(x.noteId, {
      p: x.entry.p, tpl: x.entry.tpl, noQr: !!x.entry.noQr, origin: 'backfilled',
    })
    if (r && r.ok) 报.补传++
    else 报.失败.push({ noteId: x.noteId, reason: (r && (r.reason || 'queued')) || 'throw' })
    每篇('backfill')
  }

  for (const x of p.reRender) {
    const c = await 查(x)
    if (c.skip) { 这趟跳过.push({ noteId: x.noteId, reason: c.skip }); continue }
    if (typeof o.render !== 'function') {
      报.失败.push({ noteId: x.noteId, reason: 'noRenderer' })
      continue
    }
    let tmp = null
    try {
      tmp = await o.render(x, c)
    } catch (e) {
      报.失败.push({ noteId: x.noteId, reason: 'render' })
      每篇('render')
      continue
    }
    if (!tmp) { 报.失败.push({ noteId: x.noteId, reason: 'render' }); 每篇('render'); continue }
    // 顺序要紧：先把这张落到本机那个**持久**文件（canvasToTempFilePath 给的是临时路径，系统随时收得回去），
    // 再拿那个持久路径去传、去登记。反过来做，登记成功而本机那张被回收，这一格又回到"账在图没了"——白补一趟。
    // 第五个参数 `archive:false`：copyIn 默认会顺手起一趟留档，那一趟的 origin 是 **live**，
    // 两句都落地就成了"这张是他刚生成的"，界面上那句「按你当年选的模板重新出的」当场成假话。
    const kept = await cardLog.copyIn(x.noteId, x.entry.tpl, !!x.entry.noQr, tmp, { archive: false, origin: 're-rendered' })
    const entry = kept && kept[kept.length - 1]
    if (!entry) { 报.失败.push({ noteId: x.noteId, reason: 'copyIn' }); 每篇('render'); continue }
    const r = await cardCloud.archive(x.noteId, {
      p: entry.p, tpl: entry.tpl, noQr: entry.noQr, origin: 're-rendered',
    })
    if (r && r.ok) 报.重渲++
    else 报.失败.push({ noteId: x.noteId, reason: (r && (r.reason || 'queued')) || 'throw' })
    每篇('render')
  }

  // 那份数的等式：分档分了几篇，处理完就得有几篇有下落（补上了／跳过了／失败了，三选一，
  // 一条都不许静默）。对不上就是这一趟自己撒了谎——宁可在界面上打出"数对不上"这一句，
  // 也不许报一句"已修复"。§七 验收 1.3 断的就是这一个相等。
  报.跳过 = 报.跳过.concat(这趟跳过)
  const 应补 = p.backfill.length + p.reRender.length
  报.应补 = 应补
  报.实补 = 报.补传 + 报.重渲
  报.数对得上 = 报.实补 + 这趟跳过.length + 报.失败.length === 应补
  return { loaded: true, 报告: 报, 待确认: p.needConfirm, plan: p }
}

/**
 * 界面那一格该说哪句话：`{ noteId: reason }`。判据只有一个出处（上面那个 `plan`），
 * 页面不许自己再拼一遍名单——两处各判一次，同一篇就能在一屏里出两句反话（10-07 那条"两页同源"同一条理由）。
 * 服务器那批数没读回来时这里回空对象：那一态下"这篇该有一张"这句话没有依据，界面对此保守。
 */
function confirmMap(over) {
  const m = {}
  const p = plan(over)
  ;(p.needConfirm || []).forEach((x) => { m[x.noteId] = x.reason })
  return m
}

module.exports = { isCardPath, plan, run, confirmMap }
