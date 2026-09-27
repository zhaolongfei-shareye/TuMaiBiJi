// 十套模板各出一张成品图，存进仓库，给跨端（iPhone 版）比对用。
// 出的是当前构建的运行时成品，不是效果图：换分类色、按内容定高、码贴纸那套都在里面。
// 前置：微信开发者工具已开，且跑过 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/出-十套模板成品.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '../design/模板成品-1.5.0')
const NOTE = '/pages/share/share?id=7'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
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

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const page = await mp.reLaunch(NOTE)
  await sleep(7000)

  const dump = (name) => mp.evaluate((d) => {
    const p = getCurrentPages().slice(-1)[0]
    const src = p.data.imagePath
    if (!src) return '没有成品图'
    try {
      wx.getFileSystemManager().copyFileSync(src, `${wx.env.USER_DATA_PATH}/${d}`)
      return d
    } catch (e) {
      return `拷贝失败：${e && e.message}`
    }
  }, name)

  const pull = async (name) => {
    const got = await dump(name)
    if (got !== name) { ck(`${name} 写进沙盒`, false, String(got)); return }
    const local = findInSandbox(name)
    ck(`${name}`, !!local, local ? '已落进仓库' : '沙盒里没找到')
    if (local) fs.copyFileSync(local, `${OUT}/${name}`)
  }

  const tpls = await page.data('tpls')
  ck('模板条拿到十格', Array.isArray(tpls) && tpls.length === 10, tpls ? tpls.map((x) => x.id).join(',') : '没有 tpls')

  for (let i = 0; i < tpls.length; i++) {
    const picks = await page.$$('.pick')
    await picks[i].tap()
    await sleep(5200)
    const picked = await page.data('picked')
    ck(`第 ${i + 1} 格选中的是 ${tpls[i].id}`, picked === tpls[i].id, `picked=${picked}`)
    await pull(`模板-${tpls[i].id}.png`)
  }

  // 关掉二维码那一档：同一套版式在"有码/无码"两种收口下的样子（发微信以外的平台用无码）
  await page.setData({ noQr: true })
  await page.callMethod('render')
  await sleep(5200)
  await pull('模板-card-无码.png')
  await page.setData({ noQr: false })
  await page.callMethod('render')
  await sleep(3000)

  await mp.reLaunch('/pages/index/index')
  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　成品目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  process.exit(1)
})
