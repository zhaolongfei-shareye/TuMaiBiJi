/**
 * 现网读数：云上那批对象，**创建者读得到、非创建者读不读得到**。
 *
 * 为什么要这一把：10-12 那个 BUG（带图笔记分享出去，朋友打开九格全空白）的根因在
 * 云开发存储的「读」权限那一档，而这一档只能由**非创建者的客户端会话**才试得出来。
 * 站长原话：不许拿他的朋友当测试。所以这里不测"朋友看不看得到"，改成**方向反过来**：
 * 拿一枚**不属于这台会话**的真实对象（现网 `assets` 表里另一个 user 名下的那行），
 * 在这台开发者工具里调 `wx.cloud.downloadFile`。走的正是朋友那台要走的同一条规则，
 * 读数只有两种，两种都是答案：
 *   · 失败（权限不足）  ⇒ 「读」还锁着 = 症状当场复现，甲还没到位；
 *   · 成功             ⇒ 非创建者读得下来 = 甲已生效，朋友那台必然看得见。
 * 同一趟顺带核掉第二个嫌疑（"那九张根本没传上去"）：那九枚是本会话自己名下的对象，
 * 创建者读自己的东西不受这一档影响，读得回来且字节数对得上 ⇒ 对象真在云上。
 *
 * 只读接口返回值（成功/失败、状态码、临时文件字节数），**不打开、不显示、不转存那张图**，
 * 也不打印 object_key 的全文（那里面带别人的 user id 和日期）。
 *
 * 目标清单不在仓库里（带真实 object_key），跑之前现取一次：
 *   ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -c "import sqlite3,json;print(json.dumps([dict(user=r[0],note=r[1],key=r[2],bytes=r[3]) for r in sqlite3.connect('file:./wtsj.db?mode=ro',uri=True).execute('select user_id,note_id,object_key,file_size from assets')]))"' > /tmp/assets-dump-1012.json
 *   node docs/工具/读数-云上对象可读性.js --prep /tmp/assets-dump-1012.json   # 切出 /tmp/perm-probe.json
 * 跑法（真跑那批统一 9431）：docs/工具/跑尺子.sh 9431 读数-云上对象可读性
 *
 * 退出码：0＝拿到完整读数；2＝连不上/清单缺/读数不全（**没有读数不等于"没问题"**）；3＝这会话没登录。
 */
const fs = require('fs')

const LIST = process.env.PERM_LIST || '/tmp/perm-probe.json'
const PORT = process.env.APORT || '9431'
const SAMPLE_OWN_NOTE = Number(process.env.SAMPLE_NOTE || 26)   // 那篇九图的笔记（他截图那篇）
const MAX_KEYS = Number(process.env.MAX_KEYS || 12)

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// --prep：把整份 assets 导出切成"这一把要试的那几枚"，写到 LIST 那个文件里
function prep(dumpPath) {
  const rows = JSON.parse(fs.readFileSync(dumpPath, 'utf8'))
  const own = rows.filter((r) => r.note === SAMPLE_OWN_NOTE)
  const byOther = {}
  rows.forEach((r) => { if (!byOther[r.user]) byOther[r.user] = r })
  const aliens = Object.keys(byOther)
    .filter((u) => !own.length || u !== String(own[0].user))
    .map((u) => byOther[u])
  const picked = own.concat(aliens).slice(0, MAX_KEYS)
  if (!picked.length) { console.log('!! 清单是空的（那篇笔记没有配图行、也没有别人的行），这一把测不了'); process.exit(2) }
  // 对照组：一枚**确定不存在**的地址（前缀与真实对象完全一样，只有末段是随机名）。
  // 为什么要它：别人名下那枚读回来若是"失败"，有两种可能——权限挡着 / 那对象本来就不在。
  // 只有拿"注定不在"的那枚比一次错误码，才分得清这两件事。两者回得一模一样，
  // 这一把就**没有**资格说"是权限锁着"，只能去控制台数文件。
  const proto = picked[0].key
  const head = proto.slice(0, proto.lastIndexOf('/'))
  const phantom = `${head}/zz-not-exist-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.jpg`
  const rows2 = picked.map((r) => ({ user: String(r.user), note: r.note, key: r.key, bytes: r.bytes, phantom: false }))
  rows2.push({ user: '?phantom', note: null, key: phantom, bytes: null, phantom: true })
  fs.writeFileSync(LIST, JSON.stringify(rows2, null, 0))
  console.log(`已切出 ${picked.length} 枚：本会话那篇的 ${own.length} 枚（note ${SAMPLE_OWN_NOTE}）＋别人名下的 ${aliens.length} 枚＋1 枚不存在对照组 → ${LIST}`)
  process.exit(0)
}

if (process.argv[2] === '--prep') { prep(process.argv[3]); }

if (!fs.existsSync(LIST)) {
  console.log(`!! 读不到清单 ${LIST}（/tmp 会被系统清，先按文件头那条命令重取一次）`)
  process.exit(2)
}
const targets = JSON.parse(fs.readFileSync(LIST, 'utf8'))

const automator = require('miniprogram-automator')

;(async () => {
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: `ws://localhost:${PORT}` })
  } catch (e) {
    console.log(`!! 连不上 ${PORT}（环境红，不是判据红）：先跑 docs/工具/跑尺子.sh ${PORT} 读数-云上对象可读性`)
    process.exit(2)
  }

  const who = await mp.evaluate(() => {
    const g = getApp()
    return g && g.globalData && g.globalData.userId !== undefined && g.globalData.userId !== ''
      ? String(g.globalData.userId) : ''
  })
  if (!who) { console.log('!! 这台会话没登录（globalData.userId 是空的），分不出"创建者/非创建者"，这一把不算数'); process.exit(3) }
  const hasCloud = await mp.evaluate(() => !!wx.cloud)
  console.log(`这台会话＝user ${who} · wx.cloud 在不在：${hasCloud ? '在' : '不在（那下面的读数全会是假红）'}`)
  if (!hasCloud) process.exit(2)

  // 点火：一次全发出去，结果挂在 getApp().__perm 上，下面轮询取
  await mp.evaluate((payload) => {
    const g = getApp()
    g.__perm = { total: payload.length, results: {} }
    payload.forEach((t) => {
      wx.cloud.downloadFile({
        fileID: t.key,
        success: (r) => {
          const shape = Object.keys(r || {}).join(',')
          let size = -1
          const p = r && (r.tempFilePath || r.filePath)
          try {
            if (typeof p === 'string') {
              const st = wx.getFileSystemManager().statSync({ path: p, recursive: false })
              const one = st && st.stats ? (Array.isArray(st.stats) ? st.stats[0] : st.stats) : st
              size = one && typeof one.size === 'number' ? one.size : -1
            }
          } catch (e) { /* 拿不到字节不影响"读得回来"这个判定 */ }
          g.__perm.results[t.key] = { ok: true, status: r.statusCode, size: typeof r.dataLength === 'number' ? r.dataLength : size, shape }
        },
        fail: (e) => {
          g.__perm.results[t.key] = { ok: false, code: (e && e.errCode) || null, msg: ((e && e.errMsg) || String(e)).slice(0, 160) }
        },
      })
    })
    return payload.length
  }, targets)

  let snap = null
  for (let i = 0; i < 30; i++) {
    snap = await mp.evaluate(() => {
      const g = getApp()
      if (!g.__perm) return null
      return { total: g.__perm.total, done: Object.keys(g.__perm.results).length, results: g.__perm.results }
    })
    if (snap && snap.done >= snap.total) break
    await sleep(2000)
  }
  if (!snap || snap.done < snap.total) {
    console.log(`!! 读数不全：只等到 ${snap ? snap.done : 0}/${targets.length} 条，这一把不给结论`)
    process.exit(2)
  }

  const own = [], alien = [], phantom = []
  targets.forEach((t) => {
    const r = snap.results[t.key]
    const line = r.ok
      ? `成功 status=${r.status} 字节=${r.size}${t.bytes ? `（账上报 ${t.bytes}·${Number(r.size) === Number(t.bytes) ? '相符' : '不等'}）` : ''} 回体键=[${r.shape}]`
      : `失败 errCode=${r.code} errMsg=${r.msg}`
    const bucket = t.phantom ? phantom : (String(t.user) === who ? own : alien)
    bucket.push({ t, line, ok: !!r.ok, size: r.size, code: r.code, msg: r.msg || '' })
  })

  console.log(`\n【创建者那一组】这台会话自己名下的 ${own.length} 枚`)
  own.forEach((x) => console.log(`  · 末两段 ${x.t.key.split('/').slice(-2).join('/')} → ${x.line}`))
  console.log(`\n【非创建者那一组】别人名下的 ${alien.length} 枚（这一组才是朋友那台走的同一条规则）`)
  alien.forEach((x) => console.log(`  · user ${x.t.user} 的那枚 → ${x.line}`))
  console.log(`\n【对照组】确定不存在的 ${phantom.length} 枚（把"权限挡着"和"对象本来不在"分开）`)
  phantom.forEach((x) => console.log(`  · 随机造的那枚 → ${x.line}`))

  const ownOk = own.filter((x) => x.ok).length
  const alienOk = alien.filter((x) => x.ok).length
  console.log('\n=== 读数 ===')
  if (!own.length) console.log('创建者组：这轮没有（会话 user 和清单对不上，说明分组读不出，不算数）')
  else console.log(`创建者组 ${ownOk}/${own.length} 读得回来 → ${ownOk === own.length ? '对象真在云上，"根本没传上去"那个嫌疑可以划掉' : '有读不回来的，先把上面那行 errMsg 抄进报告，别急着下结论'}`)
  if (!alien.length) console.log('非创建者组：现网没有第二个人名下的对象，这一把测不出权限档（要说"验不了"就只能是这一句，且得有依据）')
  else console.log(`非创建者组 ${alienOk}/${alien.length} 读得回来 → ${alienOk ? '「读」已对所有用户放开，甲到位' : '还锁着，非创建者读不到＝那台症状在这台机器上原样复现，不用等人证'}`)
  if (alien.length && phantom.length && !alienOk) {
    const same = phantom.every((p) => alien.every((a) => String(p.code) === String(a.code) && p.msg.slice(0, 40) === a.msg.slice(0, 40)))
    console.log(same
      ? '⚠ 对照失败：不存在的那枚与别人名下那枚**回的是同一个错**（同 errCode 且前 40 字相同）⇒ 这一把**分不出**"权限挡着"还是"对象本来不在"，只能再问一条接口或去控制台数文件。'
      : '✓ 对照成立：不存在的那枚回的是另一种错 ⇒ 别人名下那枚读不回来这件事**只能是这一档权限**给的，不是"对象不在"。')
  }

  /* 第二把读数：`getTempFileURL` 逐条回 status/errMsg，比 downloadFile 那个笼统的
     -403003 细。上面那把分不开"权限挡"与"对象不在"时，这一把要么把两者分开、
     要么把"客户端就是问不出来"这句话钉死——两种结果都是答案，都不许含糊过去。 */
  const probeKeys = [own[0] && own[0].t.key, alien[0] && alien[0].t.key, phantom[0] && phantom[0].t.key].filter(Boolean)
  await mp.evaluate((keys) => {
    const g = getApp()
    g.__url = { total: keys.length, done: 0, list: [] }
    wx.cloud.getTempFileURL({
      fileList: keys,
      success: (r) => {
        g.__url.list = (r.fileList || []).map((f) => ({
          key: f.fileID, status: f.status, msg: (f.errMsg || '').slice(0, 120),
          urlLen: f.tempFileURL ? String(f.tempFileURL).length : 0,
        }))
        g.__url.done = g.__url.list.length
      },
      fail: (e) => { g.__url.list = [{ wholeCallFailed: true, msg: ((e && e.errMsg) || String(e)).slice(0, 160) }]; g.__url.done = 1 },
    })
    return keys.length
  }, probeKeys)
  let u = null
  for (let i = 0; i < 20; i++) {
    u = await mp.evaluate(() => (getApp().__url && getApp().__url.done >= getApp().__url.total) ? getApp().__url.list : null)
    if (u) break
    await sleep(1500)
  }
  console.log('\n=== 第二把读数：getTempFileURL 逐条 ===')
  if (!u) { console.log('!! 这一把没等到读数（不等于没问题，退出码 2）'); process.exit(2) }
  const label = (k) => (phantom.some((p) => p.t.key === k) ? '不存在那枚'
    : alien.some((a) => a.t.key === k) ? `别人名下(user ${alien[0].t.user})那枚`
    : '自己名下那枚')
  u.forEach((f) => f.wholeCallFailed
    ? console.log(`  · 整趟调用就失败：${f.msg}`)
    : console.log(`  · ${label(f.key)}：status=${f.status} 链接长度=${f.urlLen} errMsg=${f.msg || '（空）'}`))
  const byKind = (want) => u.find((f) => !f.wholeCallFailed && want(f.key))
  const a = byKind((k) => alien.some((x) => x.t.key === k))
  const p = byKind((k) => phantom.some((x) => x.t.key === k))
  const o = byKind((k) => own.some((x) => x.t.key === k))
  if (a && p) {
    const indistinguishable = String(a.status) === String(p.status) && (a.msg || '').slice(0, 40) === (p.msg || '').slice(0, 40)
    console.log(indistinguishable
      ? '⇒ 这一把**还是分不开**："别人名下那枚"与"根本不存在那枚"回得一模一样。结论：客户端问不出"是没权限还是没有这个对象"，**唯一能钉死的是控制台的文件列表**（读它不需要朋友）。自己名下那枚 status=' + (o ? o.status : '?') + ' 证明这条问法本身是通的。'
      : `⇒ 分开了：别人名下那枚 status=${a.status}、不存在那枚 status=${p.status}。${a.status === (o && o.status) ? '别人那枚和自己这枚同 status ⇒ 读已经放开' : '别人那枚回的是拒绝 ⇒ 是这一档权限挡的，不是对象不在'}（自己名下那枚 status=${o ? o.status : '?'} 当基线）。`)
  }
  process.exit(0)
})().catch((e) => { console.log('!! 这把尺子自己崩了：', e && e.message); process.exit(2) })
