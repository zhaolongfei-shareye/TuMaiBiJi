// 把三版封面方向逐张截出来，自己先看一遍再交
import { chromium } from '/Users/zlfmac/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs'

const src = 'file:///Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-详细产品介绍-重构版-20261024/设计样张/竞品取证与封面方向.html'
const out = '/tmp/dir-'

const b = await chromium.launch({ channel: 'chrome', headless: true })
const p = await b.newPage({ viewport: { width: 1400, height: 1700 }, deviceScaleFactor: 1 })
await p.goto(src, { waitUntil: 'load' })
const n = await p.locator('.page').count()
for (let i = 0; i < n; i++) {
  const el = p.locator('.page').nth(i)
  const box = await el.boundingBox()
  await el.scrollIntoViewIfNeeded()
  await el.screenshot({ path: `${out}${i + 1}.png` })
  const title = await p.evaluate((k) => document.querySelectorAll('.dir > header h2')[k]?.textContent || '', i)
  console.log(i + 1, title, JSON.stringify(box))
}
const overflow = await p.evaluate(() => [...document.querySelectorAll('.page')].map((pg) => {
  const bad = [...pg.querySelectorAll('*')].filter((el) => {
    const r = el.getBoundingClientRect(), q = pg.getBoundingClientRect()
    return r.width > 0 && (r.right > q.right + 2 || r.bottom > q.bottom + 2)
  }).map((el) => el.className + '|' + (el.textContent || '').slice(0, 16))
  return bad.slice(0, 4)
}))
console.log('超出页面边界的元素：', JSON.stringify(overflow))
await b.close()
