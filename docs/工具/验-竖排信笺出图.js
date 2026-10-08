// 竖排信笺（letter）在模拟器里的出图自证：真点模板条、真重画、把成品 PNG 从模拟器
// 沙盒里拷到能被本机读到的目录，再看图判断标点挪位和拉丁段横躺对不对。
// 前置：微信开发者工具已开，且跑过 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-竖排信笺出图.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const lang = require('./尺子语言钉.js')
const freeNote = require('./尺子挑没卡片那一篇.js')

const OUT = path.resolve(__dirname, '../design/竖排信笺-自证')
// 笔记号不写死（原来钉的是 `share?id=7`，那一篇的标题「2026微信小程序开发大赛介绍」中英混排，
// 正好压拉丁段那条分支——挑不到这种标题时换一篇也一样，这一把真正要量的是"混排怎么排"）。
// 10-09 它和 `验-经典三款纸色出图` 一起红在"进页面先出一张图"：那一篇在这台机器的台账里已经有卡片，
// 而「一篇只留一张」那道闸 2.0.1 起问的是"本机 ∪ 服务器那一行"，进页就被 toast 顶回去。
const NOTE_OF = (id) => `/pages/share/share?id=${id}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 界面语言先钉成中文：这一把第一张要的是中文那一态（英文那一态是下面自己 setData 出来的），
  // 而任何一把真登录的尺子会把测试号那一份 `en` 带进这次会话。
  await lang.pin(mp, 'zh')

  // 先只读挑一篇"这台机器上还没有卡片"的笔记，再进那一页——否则进页被「一篇只留一张」顶回去，
  // 下面每一句都会崩在 `picks[3].tap()` 上。优先挑标题里中英混排的那一篇（量拉丁段横躺那一支）。
  const found = await freeNote.find(mp)
  const mixed = (n) => /[一-龥]/.test(n.title) && /[A-Za-z0-9]/.test(n.title)
  const pool = found.free.length ? found.free : (freeNote.mayBorrow() ? found.all : [])
  const use = pool.filter(mixed)[0] || pool[0] || null
  const isBorrow = !!(use && use.hasCard)
  ck('这一把挑得到一篇能进卡片页的笔记', !!use,
    `列表 ${found.total} 篇、台账里已有卡片 ${found.withCard} 篇、没卡片的 ${found.free.length} 篇`
      + (use ? ` → 用 ${use.id}「${use.title}」${mixed(use) ? '（中英混排，拉丁段那一支量得到）' : '（没有混排那一篇，拉丁段那一支今天量不到，只量标点位）'}${isBorrow ? '（借：先摘台账那一栏，跑完装回）' : ''}` : ' → 一篇都不剩'))
  if (!use) {
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
  if (isBorrow) {
    borrowed = await freeNote.takeOver(mp, use.id)
    console.log(`　· 借走 ${use.id} 台账那一栏：${JSON.stringify(borrowed.removed)}`
      + `（ stillThere=${borrowed.stillThere} 必须是 false；崩了就照这一行原样写回 ）`)
    if (borrowed.err || borrowed.stillThere) {
      ck('借得动（台账那一栏真摘掉了）', false, borrowed.err || `stillThere=${borrowed.stillThere}`)
      mp.disconnect()
      process.exit(1)
    }
  }
  try {
  const page = await mp.reLaunch(NOTE_OF(use.id))
  await sleep(7000)

  const path0 = await page.data('imagePath')
  ck('进页面先出一张图', !!path0, String(path0).split('/').pop())

  const picks = await page.$$('.pick')
  ck('模板条有十格', picks.length === 10, `${picks.length} 格`)
  if (picks.length !== 10) console.log('　· 十格都没画出来：下面点不到第四格，先查那一篇的卡片是不是在'
    + '**服务器上**那一行（本机台账读不到它；今天现网 `note_cards` 实测 0 行，不该出现这一态）')
  const labels = (await Promise.all((await page.$$('.pick-label')).map((e) => e.text()))).join(' / ')
  ck('第四格换成了「素宣信笺」', labels.indexOf('素宣信笺') >= 0 && labels.indexOf('极简') < 0, labels)

  if (picks.length === 10) await picks[3].tap()
  await sleep(6000)
  const picked = await page.data('picked')
  const path1 = await page.data('imagePath')
  ck('点第四格选中的是 letter', picked === 'letter', `picked=${picked}`)
  ck('换完上面那张重画了', !!path1 && path1 !== path0, `${String(path0).split('/').pop()} → ${String(path1).split('/').pop()}`)

  // 成品从沙盒里拷出来看：页面上那张是缩着的，标点位和横躺段看不出细节。
  // 沙盒里的路径是虚拟的 http://usr/…，本机对应 IDE 数据目录下的 .../usr/，所以两步：
  // 先让小程序 copyFile 到 USER_DATA_PATH，再从那个目录把文件搬进仓库。
  const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
  const findInSandbox = (name, depth = 8) => {
    const walk = (dir, d) => {
      if (d > depth) return null
      let items = []
      try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return null }
      for (const it of items) {
        const p = path.join(dir, it.name)
        if (it.isFile() && it.name === name) return p
      }
      for (const it of items) {
        if (it.isDirectory()) { const hit = walk(path.join(dir, it.name), d + 1); if (hit) return hit }
      }
      return null
    }
    return walk(SANDBOX, 0)
  }
  const dump = (dest) => mp.evaluate((d) => {
    const p = getCurrentPages().slice(-1)[0]
    const src = p.data.imagePath
    if (!src) return '没有成品图'
    try {
      wx.getFileSystemManager().copyFileSync(src, `${wx.env.USER_DATA_PATH}/${d}`)
      return d
    } catch (e) {
      return `拷贝失败：${e && e.message}`
    }
  }, dest)
  const pull = async (name) => {
    const got = await dump(name)
    ck(`${name} 已写进沙盒`, got === name, String(got))
    const local = findInSandbox(name)
    ck(`${name} 在 IDE 数据目录里找得到`, !!local, local || '没找到')
    if (local) fs.copyFileSync(local, `${OUT}/${name}`)
  }

  await pull('自证-竖排-中文.png')
  await mp.screenshot({ path: `${OUT}/界面-中文.png` })

  // 英文口径：这一页的 lang 只在页面实例上，改它不动用户存的偏好
  await page.setData({ lang: 'en' })
  await page.callMethod('render')
  await sleep(6000)
  await pull('自证-竖排-英文.png')
  await mp.screenshot({ path: `${OUT}/界面-英文.png` })

  await mp.reLaunch('/pages/index/index')
  } finally {
    // 借来那一栏必须装回去——装不回去就等于这把尺子顺手删了用户的一张卡片。
    if (borrowed && borrowed.removed) {
      const back = await freeNote.putBack(mp, use.id, borrowed.removed)
      ck('借来那一栏跑完原样装回去了', back.ok, JSON.stringify(back))
    }
  }
  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　小样目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  process.exit(1)
})
