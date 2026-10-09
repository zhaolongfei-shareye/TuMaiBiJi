// 乙路那一把（站长 2026-10-09 拍定）：往现网建**一篇专用验收笔记**，让两把出图尺子有地方可进，
// 跑完连卡片对象一起删干净。
//
// 为什么要有它：`cardCloud.hasCard` 那道闸 2.0.1 起问的是"本机台账 ∪ 服务器那一行"，而现网他那
// 12 篇**每一篇都已经有卡片**（10-09 只读现读：`note_cards` 12 行全 backfilled、本机台账 12 栏），
// 所以任何一把要进「笔记卡片」那一屏的真跑尺子，挑到哪一篇都被顶回去。甲路是撤掉他某一格
// （动他的真数据），乙路是另建一篇、跑完删——站长选的是乙。
//
// 三个动作，都只碰这一把自己建的那一篇：
//   node docs/工具/出-验收笔记.js make        → 建一篇，打 `NOTE_ID=<id>`
//   node docs/工具/出-验收笔记.js peek <id>   → 只读：进那一屏把"为什么 0 格"的数扒出来
//   node docs/工具/出-验收笔记.js drop <id>   → 走应用自己的 DELETE 拿 file_ids，再 wx.cloud.deleteFile
//
// ⚠ 这一把里**每一个** `mp.evaluate` 都不走第二个参数：`MiniProgram.evaluate` 不吃它（见
// [[Ruler units and box model]] 第 17 条，实测那个值到不了小程序侧），要递进去的一律
// 烤进函数体字面量。id 先过 `/^\d+$/`，标题正文是本文件里的常量，没有外部输入拼进代码这条路。
//
// 前置：`cli auto --project …/miniprogram --auto-port 9431` 已经起着。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/出-验收笔记.js make
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = 'ws://localhost:9431'
const BASE = 'https://api.agentsbin.cn/wtsj'

// 标题中英混排是**故意**的：竖排信笺那一条分支量的就是"拉丁段要不要横躺"，纯中文标题挑到了也量不到。
const TITLE = '验收 Acceptance 2026 笔记，含标点，'
const BODY = '这一段是给竖排信笺量的：中英混排 hello world 123 与，。、「」等标点都要落位。'
  + '第二段稍长一点，好让纸面真的排满几行，看看行首行尾的标点挪位对不对。'

// 只收纯数字 id，别的形状一律不给拼进函数体。
const numId = (raw) => {
  const s = String(raw || '')
  if (!/^\d+$/.test(s)) throw new Error(`要一个纯数字 note id，收到的是 ${JSON.stringify(s)}`)
  return s
}

const hdr = () => `{ 'content-type': 'application/json', Authorization: \`Bearer ${'$'}{getApp().globalData.token}\` }`

const modes = {
  async make(mp) {
    const r = await mp.evaluate(new Function(`
      return new Promise((resolve) => {
        wx.request({
          url: '${BASE}/api/notes/',
          method: 'POST',
          timeout: 30000,
          header: ${hdr()},
          data: { title: ${JSON.stringify(TITLE)}, content: ${JSON.stringify(BODY)}, summary: '验收用，跑完就删。' },
          success: (res) => resolve({ code: res.statusCode, id: res.data && res.data.id, err: res.data && (res.data.detail || res.data.message) }),
          fail: (e) => resolve({ code: -1, err: String((e && e.errMsg) || e) }),
        })
      })
    `))
    if (!r.id) { console.log(`✗ 建不成：HTTP ${r.code} ${JSON.stringify(r.err || '')}`); return 1 }
    console.log(`NOTE_ID=${r.id}  (HTTP ${r.code})`)
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(7000)
    const seen = await mp.evaluate(new Function(`
      const id = '${r.id}'
      const p = getCurrentPages().slice(-1)[0]
      const list = ((p.data && p.data.notes) || []).filter((n) => n && n.id != null)
      const hit = list.filter((n) => String(n.id) === id)[0] || null
      return { count: list.length, found: !!hit, title: hit ? String(hit.title) : null }
    `))
    console.log(`列表 ${seen.count} 篇 · 新建那一篇在不在：${seen.found} ·「${seen.title || ''}」`)
    return seen.found ? 0 : 1
  },

  // 只读把那一屏的底数扒出来：模板条几格、有没有成品图、页里那几个数各是多少。
  // 两把出图尺子 10-09 一起红在"进页 0 格、一句成品图都没有"，而"红在闸上"和"红在这一趟没成"
  // 光看尺子的输出分不开——这一档就是拿来给它们分家的。
  async peek(mp, argv) {
    const id = numId(argv[0])
    await mp.callWxMethod('reLaunch', { url: `/pages/share/share?id=${id}` })
    await sleep(9000)
    const d = await mp.evaluate(new Function(`
      const p = getCurrentPages().slice(-1)[0]
      const g = (k) => (p.data ? p.data[k] : undefined)
      const len = (v) => (Array.isArray(v) ? v.length : (v == null ? null : typeof v))
      return {
        route: p.route,
        dataKeys: Object.keys(p.data || {}).join(','),
        noteId: g('noteId') || g('id') || null,
        hasNote: !!g('note'),
        imagePath: g('imagePath') || null,
        picked: g('picked') || null,
        templates: len(g('templates')),
        tplList: (g('templates') || []).map((t) => t && t.id).join(','),
        loading: g('loading'),
        err: g('error') || g('errMsg') || null,
      }
    `))
    console.log(JSON.stringify(d, null, 1))
    const picks = await mp.evaluate(new Function(`
      const p = getCurrentPages().slice(-1)[0]
      const q = wx.createSelectorQuery().in(p)
      q.selectAll('.pick').boundingClientRect()
      return new Promise((resolve) => q.exec((r) => resolve(r && r[0] ? r[0].length : -1)))
    `))
    console.log(`屏上 .pick 实测 ${picks} 格`)
    return 0
  },

  // 删：先撤服务器那一行（应用自己的 DELETE，回体带 file_ids），再让客户端把云上对象删掉，
  // 最后清本机台账那一栏。顺序与界面那枚「删除」同一条规矩：**先撤服务器再清本机**，
  // 撤不成就当没删，不做半截删。
  async drop(mp, argv) {
    const id = numId(argv[0])
    const r = await mp.evaluate(new Function(`
      return new Promise((resolve) => {
        wx.request({
          url: '${BASE}/api/notes/${id}',
          method: 'DELETE',
          timeout: 30000,
          header: ${hdr()},
          success: (res) => resolve({ code: res.statusCode, body: res.data }),
          fail: (e) => resolve({ code: -1, err: String((e && e.errMsg) || e) }),
        })
      })
    `))
    if (r.code !== 200) { console.log(`✗ 服务器那一行没撤成：HTTP ${r.code} ${JSON.stringify(r.body || r.err)}`); return 1 }
    const raw = (r.body && r.body.file_ids) || []
    // 这一批字符串是服务器回体给的（外面来的值），要拼进函数体，先过一道形状闸：
    // 只收 `cloud://` 开头的那几条，别的一律不递——删对象这个动作不该被一份脏回体驱动。
    const ids = raw.filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
    console.log(`HTTP ${r.code} · 回体给的 file_ids ${raw.length} 个（形状合格的 ${ids.length} 个）`)
    if (ids.length) {
      const cloud = await mp.evaluate(new Function(`
        const list = ${JSON.stringify(ids)}
        return new Promise((resolve) => {
          wx.cloud.deleteFile({
            fileList: list,
            success: (res) => resolve({ ok: true, statuses: (res.fileList || []).map((x) => x.status) }),
            fail: (e) => resolve({ ok: false, err: String((e && e.errMsg) || e) }),
          })
        })
      `))
      console.log(`云上删除：${cloud.ok ? `状态 ${JSON.stringify(cloud.statuses)}（0＝删成了）` : `失败 ${cloud.err}`}`)
      if (!cloud.ok || cloud.statuses.some((s) => s !== 0)) console.log('⚠ 云上那批没全删成，收尾必须人工复查，别留孤儿对象')
    }
    const led = await mp.evaluate(new Function(`
      const id = '${id}'
      const l = wx.getStorageSync('cardLog') || {}
      delete l[String(id)]
      try { wx.setStorageSync('cardLog', l) } catch (e) { return { err: String((e && e.errMsg) || e) } }
      const now = wx.getStorageSync('cardLog') || {}
      return { stillThere: Array.isArray(now[String(id)]), keys: Object.keys(now).length }
    `))
    console.log(`本机台账：还剩 ${led.keys} 栏 · 这一篇还在吗 ${led.stillThere}`)
    return led.stillThere ? 1 : 0
  },
}

;(async () => {
  const [mode, ...rest] = process.argv.slice(2)
  if (!modes[mode]) { console.log('用法：出-验收笔记.js make|peek|drop [id]'); process.exit(1) }
  let mp
  try {
    mp = await automator.connect({ wsEndpoint: PORT })
    process.exitCode = await modes[mode](mp, rest)
  } catch (e) {
    console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
    process.exitCode = 1
  }
  if (mp) mp.disconnect()
})()
