// 经典三款改纸色 + 撤掉字体那一排的出图自证：真点模板条、把成品 PNG 从模拟器沙盒搬进仓库。
// 前置：微信开发者工具已开，跑过 cli auto --auto-port 9431（改过 WXSS 必须先 close 再 auto）。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-经典三款纸色出图.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '../design/经典三款-宣纸色调')
const SANDBOX = path.join(process.env.HOME, 'Library/Application Support/微信开发者工具')
const NOTE = '/pages/share/share?id=7' // 这条没分类 → 未分类那块墨 → 应该走 B 黛青
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

  // ① 外观设置页：那一排字体应该已经没了
  const wp = await mp.reLaunch('/pages/wallpaper/wallpaper')
  await sleep(3500)
  ck('外观设置页已经没有字体那一排', (await wp.$$('.font-grid')).length === 0)
  const secs = (await wp.$$('.sec-title')).length
  ck('这一页只剩「页面壁纸」一节', secs === 1, `${secs} 个小节标题`)
  await mp.screenshot({ path: `${OUT}/实拍-外观设置已无字体排.png` })

  // ② 卡片模板页：十格小样，前三格应该已经是纸色，名字也换了
  await mp.reLaunch('/pages/profile/profile')
  await sleep(9000)
  const labels = (await txtAll(await mp.currentPage(), '.cell-label text')).join(' / ')
  ck('前三格名字已换成 玉版宣 / 摘句 / 叠翠',
    labels.includes('玉版宣') && labels.includes('摘句') && labels.includes('叠翠') && !labels.includes('经典卡片'), labels)
  await mp.screenshot({ path: `${OUT}/实拍-卡片模板十格.png` })

  // ③ 分享页：三套各出一张成品，搬回仓库看细节
  const page = await mp.reLaunch(NOTE)
  await sleep(7000)
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
