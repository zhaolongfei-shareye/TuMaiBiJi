// 十套模板各出一张**虚拟内容 + 无码**的成品图，给参赛说明 PDF 的图库用。
//
// 站长 10-11 晚原话：「不要用任何真实的笔记二维码和真实笔记内容，很多都是本机测试用，
// 随时删掉，你虚拟内容就行了。只需提供真实交互设计。」
// 所以这一把换掉的是两样：
//   ① 内容——不再挑他库里现成的笔记（10-09 那一批印的是他 09-23 那篇真笔记，带真名真内容），
//      改成**本工具自己建的一篇虚拟笔记**：标题、摘要、要点、标签全是这里写的常量；
//      跑完连服务器那一行、云上卡片对象、本机台账一起删净（照 10-09 乙路那条走法）。
//   ② 码——走产品自己的 `noQr` 那一档，图上一个码都不印。
// 保留的是"真实"那一半：图仍由产品自己的绘制代码在开发者工具里跑出来（换分类色、
// 按内容定高、字体测量都在里面），不是效果图、不是 AI 位图。
//
// 为什么上一把（出-十套模板成品-无码.js）十张一张都不落：它钉的是库里已有卡片的那一篇，
// 而 share 页顶上那道「一篇只留一张」的闸（share.js:65 起）会直接把页面顶回去，
// 于是永远停在「生成分享图…」、`tpls` 0 格。**新建的那一篇本机台账是空的**，正好绕开这道闸。
//
// 前置：微信开发者工具已开，且跑过 cli auto --project …/miniprogram --auto-port 9431。
//   ⚠ 这一把会把模拟器从你当前那一屏接管走（reLaunch 到卡片页，来回约 2 分钟），先确认没人正在用。
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/出-十套模板成品-虚拟.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '../design/10-11模板图库-虚拟')
const BASE = 'https://api.agentsbin.cn/wtsj'
const PORT = 'ws://localhost:9431'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}
const hdr = () => `{ 'content-type': 'application/json', Authorization: \`Bearer ${'$'}{getApp().globalData.token}\` }`

// 服务器回体给的 id 要烤进 evaluate 的函数体，先过一道形状闸：只收纯数字，别的一律不递
// （同 出-验收笔记.js 顶上那条规矩——删笔记、清台账这些动作不该被一份脏回体驱动）。
const numId = (raw) => {
  const s = String(raw == null ? '' : raw)
  if (!/^\d+$/.test(s)) throw new Error(`要一个纯数字 note id，收到的是 ${JSON.stringify(s).slice(0, 80)}`)
  return s
}

// ── 那一篇虚拟笔记（全部内容都是下面的常量，不取自他库里任何一篇）────────
const VIRTUAL = {
  title: '周末去厦门，两天怎么排',
  content: '不赶景点，沿着海边走。第一天从沙坡尾起步，傍晚到演武大桥看海面；'
    + '第二天上鼓浪屿，看老墙、老楼，日落前回到海边。出发前记得预约船票，穿舒服的鞋。'
    + '晚上中山路吃点小吃，早点回酒店，第二天才有精神。',
  summary: '不赶景点，沿着海边走。路线与提醒整理成一张卡，出发前照着走一遍就行。',
  key_points: [
    '第一天｜沙坡尾 → 演武大桥',
    '第二天｜鼓浪屿 → 海边日落',
    '出发前｜预约船票，穿舒服的鞋',
    '晚上｜中山路吃小吃，早点回酒店',
  ],
  tags: ['周末旅行', '厦门', '攻略', '步行'],
}

const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
const findInSandbox = (name, depth = 8) => {
  const walk = (dir, d) => {
    if (d > depth) return null
    let items = []
    try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return null }
    for (const it of items) if (it.isFile() && it.name === name) return path.join(dir, it.name)
    for (const it of items) {
      if (it.isDirectory()) { const hit = walk(path.join(dir, it.name), d + 1); if (hit) return hit }
    }
    return null
  }
  return walk(SANDBOX, 0)
}

const req = (url, method, body) => mp.evaluate(new Function(`
  return new Promise((resolve) => {
    wx.request({
      url: '${BASE}${url}', method: '${method}', timeout: 30000, header: ${hdr()},
      ${body ? `data: ${JSON.stringify(body)},` : ''}
      success: (res) => resolve({ code: res.statusCode, body: res.data }),
      fail: (e) => resolve({ code: -1, err: String((e && e.errMsg) || e) }),
    })
  })
`))
let mp

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  mp = await automator.connect({ wsEndpoint: PORT })

  // 1) 建那一篇虚拟笔记
  const made = await req('/api/notes/', 'POST', VIRTUAL)
  const noteId = made.body && made.body.id
  ck('虚拟笔记建出来了', !!noteId, `HTTP ${made.code} ${JSON.stringify(made.body || made.err || '').slice(0, 160)}`)
  if (!noteId) { mp.disconnect(); process.exit(1) }
  const ID = numId(noteId)
  console.log(`　· NOTE_ID=${ID}（跑完必删；中途挂了就用 node docs/工具/出-验收笔记.js drop ${ID} 收尾）`)

  try {
    // 2) 进卡片页，等模板条十格
    // `mp.reLaunch(路径)` 自己就把页面对象返回来（这一版 automator **没有 `mp.page()`**，
    // 10-11 这一把撞过：报 `mp.page is not a function`，而收尾那一段照样把建出来的那一篇删净了）。
    const page = await mp.reLaunch(`/pages/share/share?id=${ID}`)
    ck('拿到那一屏的页面对象', !!page, page ? 'ok' : 'reLaunch 没回页面对象')
    if (!page) throw new Error('拿不到页面对象，点不到那十格')
    let tplN = 0
    for (let i = 0; i < 12; i++) {
      await sleep(3000)
      tplN = await mp.evaluate(new Function(`
        const p = getCurrentPages().slice(-1)[0]
        return p && Array.isArray(p.data.tpls) ? p.data.tpls.length : -1
      `))
      if (tplN === 10) break
    }
    ck('模板条十格到位', tplN === 10, `等到 ${tplN} 格（每 3 秒问一次，最多 36 秒）`)
    if (tplN !== 10) throw new Error('进不去那一屏，后面九张没有意义')

    const dump = (name) => mp.evaluate((d) => {
      const p = getCurrentPages().slice(-1)[0]
      const src = p.data.imagePath
      if (!src) return '没有成品图'
      try {
        wx.getFileSystemManager().copyFileSync(src, `${wx.env.USER_DATA_PATH}/${d}`)
        return d
      } catch (e) { return `拷贝失败：${e && e.message}` }
    }, name)
    const pull = async (name) => {
      const got = await dump(name)
      if (got !== name) { ck(`${name} 写进沙盒`, false, String(got)); return }
      const local = findInSandbox(name)
      ck(`${name}`, !!local, local ? '' : '沙盒里没找到')
      if (local) fs.copyFileSync(local, `${OUT}/${name}`)
    }
    const tpls = page ? await page.data('tpls') : await mp.evaluate(new Function(`
      return getCurrentPages().slice(-1)[0].data.tpls
    `))
    ck('拿到十格的名字与 id', Array.isArray(tpls) && tpls.length === 10, (tpls || []).map((x) => x.id).join(','))

    // 3) 关掉码那一档，再逐套出图（render() 每次现读 this.data.noQr，设一次管十张）
    await mp.evaluate(new Function(`
      const p = getCurrentPages().slice(-1)[0]
      p.setData({ noQr: true })
      p.render()
      return true
    `))
    await sleep(5200)
    const noQr = await mp.evaluate(new Function(`return getCurrentPages().slice(-1)[0].data.noQr`))
    ck('无码那一档已生效', noQr === true, `noQr=${noQr}`)

    const waitRendered = async (id) => {
      for (let i = 0; i < 10; i++) {
        const got = await mp.evaluate(new Function(`
          const p = getCurrentPages().slice(-1)[0]
          return { tpl: p._renderedTpl || null, img: !!p.data.imagePath, busy: !!p.data.generating }
        `))
        if (got.tpl === id && got.img) return got
        await sleep(2000)
      }
      return { tpl: null, img: false, busy: true }
    }

    const list = Array.isArray(tpls) ? tpls : []
    for (let i = 0; i < list.length; i++) {
      const picks = await page.$$('.pick')
      if (!picks[i]) { ck(`第 ${i + 1} 格点得到`, false, `模板条只有 ${picks.length} 格`); break }
      // 走界面那一下，不用 setData 直接改 picked：换模板那条链上有 `_pickerDone` 与节流，
      // 从数据侧改会绕过它们，出来的图就不算"真点过"。
      await picks[i].tap()
      // 画完之后再读 `picked`：`tap` 之后立刻读拿到的是**上一格**（10-11 第一把就是这么错红 8 处，
      // 而真正权威的 `_renderedTpl` 十条全对——图确实是按各自那一套画的）。
      const done = await waitRendered(list[i].id)
      ck(`第 ${i + 1} 张画完了（${list[i].id}）`, done.img && done.tpl === list[i].id,
        `tpl=${done.tpl} 成品图=${done.img} 还在生成=${done.busy}`)
      const picked = await page.data('picked')
      ck(`第 ${i + 1} 格选中的是 ${list[i].id}`, picked === list[i].id, `picked=${picked}`)
      await pull(`虚拟-${list[i].id}.png`)
    }
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
  } finally {
    // 4) 收尾：先撤公开那一扇门，再删服务器那一行，再删云上对象，最后清本机台账
    const rev = await req('/api/shares/revoke', 'POST', { note_id: Number(ID) })
    ck('分享那一扇门已关上', rev.code === 200, `HTTP ${rev.code} ${JSON.stringify(rev.body || rev.err || '')}`)
    const del = await req(`/api/notes/${ID}`, 'DELETE')
    ck('虚拟笔记那一行已删', del.code === 200, `HTTP ${del.code}`)
    const raw = (del.body && del.body.file_ids) || []
    const ids = raw.filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
    console.log(`　· 回体给的卡片对象 ${raw.length} 个（形状合格的 ${ids.length} 个）`)
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
      ck('云上那批删净了', cloud.ok && cloud.statuses.every((s) => s === 0), JSON.stringify(cloud))
    }
    const led = await mp.evaluate(new Function(`
      const l = wx.getStorageSync('cardLog') || {}
      delete l['${ID}']
      try { wx.setStorageSync('cardLog', l) } catch (e) { return { err: String((e && e.errMsg) || e) } }
      const now = wx.getStorageSync('cardLog') || {}
      return { stillThere: Array.isArray(now['${ID}']), keys: Object.keys(now).length }
    `))
    ck('本机台账里那一栏已清', !led.stillThere, `还剩 ${led.keys} 栏`)
    const gone = await req(`/api/notes/${ID}`, 'GET')
    ck('再读那一篇已经没了（404）', gone.code === 404, `HTTP ${gone.code}`)
  }

  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　成品目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  if (mp) mp.disconnect()
  process.exit(1)
})
