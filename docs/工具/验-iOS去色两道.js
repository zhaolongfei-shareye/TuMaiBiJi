// 站长 09-25 真机反馈：iPhone 上「波普分格」那四格不是黑白的。根因是 iOS 的 canvas 会
// 静默忽略 ctx.filter，而代码只下了这一道命令。修法是再加一道"饱和度=0"的灰压层，
// 但这一道本身有个更难看的失败模式：机型不认 saturation 时赋值被忽略，那层灰就变成实心灰块。
// 所以这里量两件事：认的机型两道都走；不认的那道一步都不许做。
// 跑法：node docs/工具/验-iOS去色两道.js
const poster = require('../../miniprogram/utils/poster.js')

global.wx = {
  getStorageSync: () => null,
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => { throw new Error('no file') } }),
  env: { USER_DATA_PATH: '/u' },
}

let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)

// 记录型 ctx：属性必须能真实读回，否则"赋值被忽略"这种平台行为根本模拟不出来。
function makeCtx({ supportSaturation }) {
  const ops = []
  const store = { globalCompositeOperation: 'source-over', filter: 'none', fillStyle: '' }
  const ctx = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
      if (typeof k === 'string' && k in store) return store[k]
      if (/^create/.test(String(k))) return () => ({ addColorStop() {} })
      return (...a) => { ops.push([String(k), ...a.map(String)].join(' ')); return undefined }
    },
    set: (_, k, v) => {
      const key = String(k)
      // 真实 canvas 对不认识的 globalCompositeOperation 取值是"静默丢掉"，不是存下来
      if (key === 'globalCompositeOperation' && v === 'saturation' && !supportSaturation) return true
      store[key] = v
      ops.push(`set ${key}=${v}`)
      return true
    },
  })
  return { ctx, ops }
}

const note = {
  id: 1, title: '读过的东西，存成能转发的笔记', summary: '一条链接、一张截图。',
  key_points: ['一句话顶做大字'], key_links: [], tags: ['阅读'], category_id: 1,
  source_type: 'manual', created_at: '2026-09-25T06:00:00Z',
}
const profile = { name: '阿飞', slogan: '每天读一点再走', avatarPath: '/u/poster-avatar.img' }
const imgs = { avatar: { img: {}, width: 600, height: 800 }, qr: { img: {}, width: 200, height: 200 } }

const bad = []
for (const tpl of ['popGrid', 'cover', 'acid']) {
  const plan = poster.planPoster({ measureText: () => ({ width: 10 }) }, note, tpl, profile, 'zh', { showQr: true })
  const grayLayers = plan.layers.filter((l) => l.k === 'image' && l.gray).length
  if (!grayLayers) continue // 这套模板不画去色图，不该有下面两道

  const a = makeCtx({ supportSaturation: true })
  poster.paintLayers(a.ctx, plan.layers, imgs)
  const iFilter = a.ops.findIndex((o) => o === 'set filter=grayscale(1)')
  const iSat = a.ops.findIndex((o) => o === 'set globalCompositeOperation=saturation')
  const iGrayFill = a.ops.findIndex((o, i) => o.startsWith('fillRect') && a.ops[i - 1] === 'set fillStyle=#808080')
  const iBack = a.ops.lastIndexOf('set globalCompositeOperation=source-over')
  if (iFilter < 0) bad.push(`${tpl}: 没下 filter 这一道`)
  if (iSat < 0) bad.push(`${tpl}: 没下 saturation 这一道（iOS 只认这一道）`)
  if (iGrayFill < 0 || iGrayFill < iSat) bad.push(`${tpl}: saturation 之后没有压那层零饱和灰`)
  if (iBack < 0 || iBack < iGrayFill) bad.push(`${tpl}: 混合模式没恢复成 source-over，会污染后面所有层`)

  const b = makeCtx({ supportSaturation: false })
  poster.paintLayers(b.ctx, plan.layers, imgs)
  const jGrayFill = b.ops.findIndex((o, i) => o.startsWith('fillRect') && b.ops[i - 1] === 'set fillStyle=#808080')
  if (jGrayFill >= 0) bad.push(`${tpl}: 机型不认 saturation 时还压了灰，成品会变成四块实心灰`)
  console.log(`${tpl}: 去色图 ${grayLayers} 张 · 认 saturation 走 ${iGrayFill >= 0 ? '两道' : '一道'} · 不认时压灰 ${jGrayFill >= 0 ? '有（错）' : '没有（对）'}`)
}

if (bad.length) {
  console.log(`\n发现 ${bad.length} 处问题：`);
  bad.forEach((x) => console.log('  · ' + x))
  process.exit(1)
}
console.log('\n全部通过：认的机型两道去色都走且混合模式收得回来，不认的机型一步都不多做')
