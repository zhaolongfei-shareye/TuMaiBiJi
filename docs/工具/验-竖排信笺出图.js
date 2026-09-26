// 竖排信笺（letter）在模拟器里的出图自证：真点模板条、真重画、把成品 PNG 从模拟器
// 沙盒里拷到能被本机读到的目录，再看图判断标点挪位和拉丁段横躺对不对。
// 前置：微信开发者工具已开，且跑过 cli auto --auto-port 9431。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-竖排信笺出图.js
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')

const OUT = path.resolve(__dirname, '../design/竖排信笺-自证')
const NOTE = '/pages/share/share?id=7' // 这条标题是「2026微信小程序开发大赛介绍」：中英混排，正好压拉丁段那条分支
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got ? `　→ ${got}` : ''}`)
  if (!ok) bad.push(name)
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const page = await mp.reLaunch(NOTE)
  await sleep(7000)

  const path0 = await page.data('imagePath')
  ck('进页面先出一张图', !!path0, String(path0).split('/').pop())

  const picks = await page.$$('.pick')
  ck('模板条有十格', picks.length === 10, `${picks.length} 格`)
  const labels = (await Promise.all((await page.$$('.pick-label')).map((e) => e.text()))).join(' / ')
  ck('第四格换成了「素宣信笺」', labels.indexOf('素宣信笺') >= 0 && labels.indexOf('极简') < 0, labels)

  await picks[3].tap()
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
  mp.disconnect()
  console.log(`\n${bad.length ? `✗ ${bad.length} 处不过` : '全过'}　小样目录：${OUT}`)
  process.exit(bad.length ? 1 : 0)
})().catch((e) => {
  console.error('✗ 跑挂了：', e && e.message ? e.message : JSON.stringify(e))
  process.exit(1)
})
