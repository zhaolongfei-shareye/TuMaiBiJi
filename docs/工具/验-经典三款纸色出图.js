// 经典三款改纸色 + 撤掉字体那一排的出图自证：真点模板条、把成品 PNG 从模拟器沙盒搬进仓库。
// 前置：微信开发者工具已开，跑过 cli auto --auto-port 9431（改过 WXSS 必须先 close 再 auto）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-经典三款纸色出图.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const lang = require('./尺子语言钉.js')
const freeNote = require('./尺子挑没卡片那一篇.js')

const OUT = path.resolve(__dirname, '../design/经典三款-宣纸色调')
const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
// 笔记号不写死：`share?id=7` 那一篇今天已经在这台机器的台账里留了卡片，而「一篇只留一张」那道闸
// 2.0.1 起问的是"本机 ∪ 服务器那一行"，写死号的两把尺子 10-09 一起红在"进页没图"＋`tap()` 崩。
// 改成进来先只读挑一篇没卡片的（见 尺子挑没卡片那一篇.js），挑不到就报红，不许静默跳过。
const NOTE_OF = (id) => `/pages/share/share?id=${id}` // 这一篇没分类 → 未分类那块墨 → 应该走 B 黛青
const TAPS = [['card', '玉版宣'], ['quote', '摘句'], ['block', '叠翠']]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}
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

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')

  // 界面语言先钉成中文：这把钉的全是中文串（模板名、节标题），而任何一把真登录的尺子
  // （验-热启动归因）会把测试号那一份 `en` 带进这次会话——10-09 就是这么红了一整条"名字没换"。
  await lang.pin(mp, 'zh')

  // ① 外观设置页：那一排字体应该已经没了
  const wp = await mp.reLaunch('/pages/wallpaper/wallpaper')
  await sleep(3500)
  ck('外观设置页已经没有字体那一排', (await wp.$$('.font-grid')).length === 0)
  const secs = await wp.$$('.sec-title')
  // 逐字比而不是数个数：光数个数既抓不住多出来的节，也抓不住被谁顶掉的节。
  // 09-30 站长把「背景图」那一节整块撤了（换图只有卡片模板一个入口），所以这一页只剩一节。
  const want = [await wp.data('t.wallpaperSection')]
  const got = []
  for (const el of secs) got.push((await el.text()).trim())
  ck('这一页只剩「页面壁纸」一节，背景图那节已经没了', got.join('|') === want.join('|'), got.join(' | '))
  await mp.screenshot({ path: `${OUT}/实拍-外观设置已无字体排.png` })

  // ② 卡片模板页：十格小样，前三格应该已经是纸色，名字也换了
  await mp.reLaunch('/pages/profile/profile')
  await sleep(9000)
  const labels = (await txtAll(await mp.currentPage(), '.cell-label text')).join(' / ')
  ck('前三格名字已换成 玉版宣 / 摘句 / 叠翠',
    labels.includes('玉版宣') && labels.includes('摘句') && labels.includes('叠翠') && !labels.includes('经典卡片'), labels)
  await mp.screenshot({ path: `${OUT}/实拍-卡片模板十格.png` })

  // ③ 分享页：三套各出一张成品，搬回仓库看细节
  // 先挑一篇"进得去那一屏"的笔记——否则被「一篇只留一张」挡在门口，下面每一句量的都不是模板本身。
  // 首页那一列是登录时就拉回来的那一份，不额外打接口；一篇都不空时**借**一篇：只摘台账那一栏，
  // 位图一张都不动，跑完原样装回（见 尺子挑没卡片那一篇.js 顶上那段为什么）。
  const found = await freeNote.find(mp)
  const pool = found.free.length ? found.free : (freeNote.mayBorrow() ? found.all : [])
  const target = pool.length ? pool[0] : null
  ck('这一把挑得到一篇能进卡片页的笔记', !!target,
    `列表 ${found.total} 篇、台账里已有卡片 ${found.withCard} 篇、没卡片的 ${found.free.length} 篇`
      + (target ? ` → 用 ${target.id}「${target.title}」${target.hasCard ? '（借：先摘台账那一栏，跑完装回）' : ''}` : ' → 一篇都不剩'))
  if (!target) {
    console.log(`\n✗ 前提不成立：列表 ${found.total} 篇，台账里 ${found.withCard} 篇都已经有卡片，`
      + '这一把进不去卡片页那一屏（那道闸 2.0.1 起问的是"本机 ∪ 服务器那一行"）。两条路，默认都不做：\n'
      + '　甲｜撤掉某一篇那一格（详情页右上那枚「删除」），空出一篇再跑；\n'
      + '　乙｜带 `RULER_BORROW=1` 跑：尺子借一篇——只摘本机台账那一栏（位图一张都不动），跑完装回并现读复核。\n'
      + '　⚠ 两条都会让那一页真发一次 `POST /api/shares`（现网建一张活码）——10-09 实测：即便挑到/借到没卡片的那一篇，'
      + '那一页仍然 0 格、一句成品图都没有，所以这一条今天断在"进页那一趟没成"，不是断在闸上。\n'
      + '别把这一把改成"跳过"——跳过等于这一条今天没人测。')
    mp.disconnect()
    process.exit(1)
  }
  let borrowed = null
  if (target.hasCard) {
    borrowed = await freeNote.takeOver(mp, target.id)
    console.log(`　· 借走 ${target.id} 台账那一栏：${JSON.stringify(borrowed.removed)}`
      + `（ stillThere=${borrowed.stillThere} 必须是 false；崩了就照这一行原样写回 ）`)
    if (borrowed.err || borrowed.stillThere) {
      ck('借得动（台账那一栏真摘掉了）', false, borrowed.err || `stillThere=${borrowed.stillThere}`)
      mp.disconnect()
      process.exit(1)
    }
  }
  try {
  const page = await mp.reLaunch(NOTE_OF(target.id))
  await sleep(7000)
  const picks0 = await page.$$('.pick')
  ck('进页面模板条是十格', picks0.length === 10, `${picks0.length} 格`)
  if (picks0.length !== 10) {
    console.log('\n✗ 进不去那一屏（台账那一栏已经摘了，却还是没画出模板条）——先查那一篇的卡片'
      + '是不是在**服务器上**那一行（本机台账读不到它；今天现网 `note_cards` 实测 0 行，不该出现这一态）')
    process.exitCode = 1
  } else {
  for (const [id, cn] of TAPS) {
    const picks = await page.$$('.pick')
    const i = ['card', 'quote', 'block', 'letter', 'popGrid', 'popDots', 'acid', 'cover', 'lit', 'spec'].indexOf(id)
    await picks[i].tap()
    await sleep(6000)
    ck(`点「${cn}」选中的是 ${id}`, (await page.data('picked')) === id, `picked=${await page.data('picked')}`)
    const name = `成品-${id}.png`
    const got = await mp.evaluate((n) => {
      const p = getCurrentPages().slice(-1)[0]
      try {
        wx.getFileSystemManager().copyFileSync(p.data.imagePath, `${wx.env.USER_DATA_PATH}/${n}`)
        return n
      } catch (e) { return `拷贝失败：${e && e.message}` }
    }, name)
    ck(`${cn} 成品写进沙盒`, got === name, String(got))
    const local = findInSandbox(name)
    if (local) fs.copyFileSync(local, `${OUT}/${name}`)
    ck(`${cn} 成品已搬进仓库`, !!local, local || '没找到')
  }
  }
  } finally {
    // 借来那一栏必须装回去——装不回去就等于这把尺子顺手删了用户的一张卡片。
    if (borrowed && borrowed.removed) {
      const back = await freeNote.putBack(mp, target.id, borrowed.removed)
      ck('借来那一栏跑完原样装回去了', back.ok, JSON.stringify(back))
    }
  }
  // 收尾别再 reLaunch 到 tab 页：automator 对"reLaunch 一个 tab 页"的回信本来就不稳
  // （实测会 timeout waiting for automator response），断言早在上面跑完了，不值得为收尾挂一次红。
  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  process.exit(1)
})

async function txtAll(page, sel) {
  const els = await page.$$(sel)
  const out = []
  for (const e of els) { const s = String(await e.text()).trim(); if (s) out.push(s) }
  return out
}
