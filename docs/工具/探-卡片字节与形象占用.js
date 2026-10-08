// S0 现场读数（只读：不写 storage、不传对象、不记账）。
//
// 为什么拆成分段：前两把整块读的写法红过两次——第一次报 "An object could not be cloned"
// （把 canvas 节点那种带内部引用的东西往回递），第二次报 "timeout waiting for automator
// response"（一个 evaluate 里又递归又 stat，超时）。**这两条红都是取数方式红，不是产品红。**
// 所以这里每段只做一件事、只回一个 JSON 字符串、每段自己 try/catch，哪段红就只红那一段。
//
// 要答的两个数（站长批 S1 前点名要的）：
//   ① 一张卡片成品图多少字节；② 台账里"账在图没了"的是哪几篇。
// 跑法：bash docs/工具/跑尺子.sh 9431 探-卡片字节与形象占用
const automator = require('miniprogram-automator')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const kb = (n) => (typeof n === 'number' ? (n / 1024).toFixed(1) + 'KB' : String(n))

const stage = async (name, fn, mp) => {
  let out
  try {
    out = await mp.evaluate(fn)
  } catch (e) {
    console.log(`✗ ${name}：这一段红在取数方式 → ${e.message}`)
    return null
  }
  try {
    const parsed = typeof out === 'string' ? JSON.parse(out) : out
    console.log(`✓ ${name}：` + JSON.stringify(parsed))
    return parsed
  } catch (e) {
    console.log(`? ${name}：回的不是 JSON →` + JSON.stringify(out).slice(0, 200))
    return null
  }
}

;(async () => {
  process.on('unhandledRejection', (e) => { console.error('探针挂了（未处理拒绝）', e); process.exit(2) })
  const watchdog = setTimeout(() => { console.error('!! 180 秒没跑完，当场退出（不给它静默 exit 0 的机会）'); process.exit(3) }, 180000)
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) { clearTimeout(watchdog); throw new Error('连不上 9431，先跑 cli auto') }

  try {
    // —— 0. 通路自检：先确认 evaluate 与这台模拟器说得上话 ——
    await stage('通路自检（wx.env 里有什么）', () => JSON.stringify(Object.keys(wx.env)), mp)

    // —— 1. 私有目录顶层有哪几项（只列名字，不递归）——
    const top = await stage('私有目录顶层', () => {
      try {
        const fm = wx.getFileSystemManager()
        return JSON.stringify({ root: wx.env.USER_DATA_PATH, 顶层: fm.readdirSync(wx.env.USER_DATA_PATH) })
      } catch (e) { return JSON.stringify({ err: String(e) }) }
    }, mp)

    // —— 2. cards 目录逐个文件的字节（这就是"一张卡片多大"的第一手读数）——
    const cards = await stage('cards 目录逐个字节', () => {
      try {
        const fm = wx.getFileSystemManager()
        const dir = wx.env.USER_DATA_PATH + '/cards'
        const names = fm.readdirSync(dir) || []
        const rows = []
        for (let i = 0; i < names.length; i++) {
          const p = dir + '/' + names[i]
          try {
            const s = fm.statSync(p, false)
            const st = s && s.stats ? s.stats : s
            rows.push({ 名: names[i], 字节: st && st.size })
          } catch (e) { rows.push({ 名: names[i], err: String(e) }) }
        }
        return JSON.stringify({ 文件数: rows.length, 清单: rows })
      } catch (e) { return JSON.stringify({ err: '没有 cards 目录或读不动：' + String(e) }) }
    }, mp)

    // —— 3. 台账（只读 storage，不碰文件系统）——
    const led = await stage('卡片台账原文', () => {
      try {
        const raw = wx.getStorageSync('cardLog')
        if (!raw || typeof raw !== 'object') return JSON.stringify({ 台账: '空的（没生成过，或被清掉了）', 原值类型: typeof raw })
        const keys = Object.keys(raw)
        const brief = {}
        for (const k of keys) {
          brief[k] = (raw[k] || []).map((x) => ({ 模板: x.tpl, 带码: !x.noQr, 时间: x.at, 路径: x.p }))
        }
        return JSON.stringify({ 几篇: keys.length, 明细: brief })
      } catch (e) { return JSON.stringify({ err: String(e) }) }
    }, mp)

    // —— 4. 逐条问"这个文件还在不在"（accessSync 一条一问，别和 stat 混一趟）——
    const alive = await stage('账在图没了的是哪几篇', () => {
      try {
        const fm = wx.getFileSystemManager()
        const raw = wx.getStorageSync('cardLog')
        const out = []
        if (!raw || typeof raw !== 'object') return JSON.stringify({ 说明: '台账是空的，这一档无从谈起' })
        for (const id of Object.keys(raw)) {
          const list = raw[id] || []
          for (const x of list) {
            let ok = true
            try { fm.accessSync(x.p) } catch (e) { ok = false }
            out.push({ note_id: id, 模板: x.tpl, 文件: ok ? '在' : '没了' })
          }
        }
        return JSON.stringify(out)
      } catch (e) { return JSON.stringify({ err: String(e) }) }
    }, mp)

    // —— 5. 形象那几张文件（重渲那一档要吃的第二样输入）——
    await stage('形象文件在不在', () => {
      try {
        const fm = wx.getFileSystemManager()
        const av = wx.getStorageSync('poster_avatar_files')
        const list = Array.isArray(av) ? av : []
        const rows = []
        for (const p of list) {
          let ok = true
          try { fm.accessSync(p) } catch (e) { ok = false }
          let size = null
          if (ok) { try { const s = fm.statSync(p, false); size = (s && s.stats ? s.stats.size : s.size) } catch (e) { size = null } }
          rows.push({ 路径: String(p).slice(-40), 文件: ok ? '在' : '没了', 字节: size })
        }
        return JSON.stringify({ 几张: rows.length, 明细: rows })
      } catch (e) { return JSON.stringify({ err: String(e) }) }
    }, mp)

    // —— 6. storage 用量与键名（只看数，不写）——
    await stage('storage 用量', () => {
      try {
        const s = wx.getStorageInfoSync()
        return JSON.stringify({ 已用KB: s.currentSize, 上限KB: s.limitSize, 键名: (s.keys || []) })
      } catch (e) { return JSON.stringify({ err: String(e) }) }
    }, mp)

    console.log('\n———— 读数一：一张卡片多少字节 ————')
    const sizes = ((cards && cards.清单) || []).map((x) => x.字节).filter((n) => typeof n === 'number')
    if (sizes.length) {
      const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
      console.log('这台设备上有 ' + sizes.length + ' 张真生成过的卡片：最小 ' + kb(Math.min.apply(null, sizes))
        + '，平均 ' + kb(avg) + '，最大 ' + kb(Math.max.apply(null, sizes)))
    } else {
      console.log('cards 目录里一个文件都没有（从没生成过，或已被系统清掉）——第一个数今天量不到'
        + '，得先在这台设备上真生成一张（那是写操作，等站长点头再做，这一把是纯只读）')
    }

    console.log('\n———— 读数二：台账里"账在图没了"的是哪几篇 ————')
    if (Array.isArray(alive)) {
      const 没了 = alive.filter((x) => x.文件 === '没了')
      console.log(alive.length ? '台账共 ' + alive.length + ' 条，其中"图没了"的 ' + 没了.length + ' 条：'
        + (没了.length ? '\n  ' + 没了.map((x) => x.note_id + '（模板 ' + x.模板 + '）').join('\n  ') : '') : '台账空，此刻没有条目')
    } else {
      console.log('这一段没读成，看上面那条 ✗')
    }
    if (top) console.log('\n私有目录顶层：' + JSON.stringify(top.顶层))
    if (led) console.log('台账篇数：' + (led.几篇 === undefined ? '(空)' : led.几篇))
  } finally {
    clearTimeout(watchdog)
    try { await mp.close() } catch (e) { /* 已经断了就算了 */ }
  }
})().catch((e) => { console.error('出错', e.message); process.exit(2) })
