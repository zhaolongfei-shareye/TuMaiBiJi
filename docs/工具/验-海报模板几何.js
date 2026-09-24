// 十套海报模板的几何与图层自检：10 模板 × 3 种笔记 × 中英 × 码开/关 = 120 组，
// 全部在 node 里用替身 ctx 跑真代码（poster.js 就是产品那份），不靠肉眼看图。
// 查四件事：图层不许出画布、高度不许塌、开码时恰好一张码、关码时码和"扫码"那行都得没、
// 换成的是那两行纯文字。跑法：node docs/工具/验-海报模板几何.js
const poster = require('../../miniprogram/utils/poster.js')
const { i18n } = require('../../miniprogram/utils/i18n.js')

global.wx = {
  getStorageSync: () => ({ name: '阿飞', slogan: '每天读一点再走', template: 'cover', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}

const grad = () => ({ addColorStop() {} })
// 替身的 measureText 要跟着 ctx.font 里的字号变，否则"按框宽试字号"那条逻辑量不出来。
// 中日韩一个字算一个字号宽，拉丁字母/数字算 0.55 个（接近 sans 实测比例），
// 全按中文量会把英文夸大到永远"出界"，那条红字就没参考价值了。
let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)
const ctx = new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return grad
    if (k === 'font') return ''
    return () => {}
  },
  set: (_, k, v) => {
    if (k === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) fontPx = parseFloat(m[1]) }
    return true
  },
})

const notes = [
  { title: '测试', summary: '人性就是这么现实啊。你', key_points: [], key_links: [], tags: [], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  { title: '一条特别长的标题用来压排版看看会不会溢出到画布外面去继续加长', summary: '摘要'.repeat(60), key_points: ['要点甲', '要点乙', '要点丙'], key_links: ['https://example.com/very/long/path/that/keeps/going'], tags: ['甲', '乙'], source_url: 'https://example.com/x', source_type: 'web_article', created_at: '2026-09-24T06:00:00Z' },
  { title: '', summary: null, key_points: null, key_links: null, tags: null, source_url: null, source_type: 'screenshot', created_at: '2026-09-24T06:00:00Z' },
]
const imgs = { qr: { img: {}, width: 200, height: 200 } }

const bad = []
let combos = 0
for (const lang of ['zh', 'en']) {
  for (const note of notes) {
    for (const tpl of poster.TEMPLATES) {
      for (const showQr of [true, false]) {
        combos++
        const tag = `${tpl.id}/${lang}/${showQr ? '带码' : '无码'}`
        const plan = poster.planPoster(ctx, note, tpl.id, { name: '阿飞', slogan: '每天读一点再走', template: tpl.id }, lang, { showQr })
        if (!(plan.height > 300)) bad.push(`${tag}: 高度异常 ${plan.height}`)
        for (const l of plan.layers) {
          const x = l.x == null ? 0 : l.x
          const y = l.y == null ? 0 : l.y
          if (x < -1 || y < -1) bad.push(`${tag}: 负坐标 x=${x} y=${y}`)
          if (x > plan.width + 1 || y > plan.height + 1) bad.push(`${tag}: 图层跑到画布外 x=${x} y=${y} 画布=${plan.width}x${plan.height}`)
          // 居中的文字要按"中心 ± 半宽"量，只量 x 会放过从中间溢出右边界的长句
          if (l.k === 'text' && l.align === 'center') {
            const size = l.size || 28
            for (const s of l.lines || []) {
              const half = Array.from(String(s)).reduce((a, c) => a + (c.codePointAt(0) > 0x2e80 ? size : size * 0.55), 0) / 2
              if (x + half > plan.width + 1 || x - half < -1) {
                bad.push(`${tag}: 居中文字出界「${s}」占 ${Math.round(half * 2)}，中心 x=${Math.round(x)} 画布宽=${plan.width}`)
              }
            }
          }
        }
        const qrCount = plan.layers.filter((l) => l.k === 'image' && l.key === 'qr').length
        const scan = i18n[lang].scanToView
        const hasScanLine = plan.layers.some((l) => l.k === 'text' && (l.lines || []).some((s) => String(s) === scan))
        const mark = i18n[lang].noQrMark
        const hasMark = plan.layers.some((l) => l.k === 'text' && (l.lines || []).some((s) => String(s).indexOf(mark) === 0 || String(s) === mark))
        if (showQr) {
          if (qrCount !== 1) bad.push(`${tag}: 该有一张码，实际 ${qrCount}`)
        } else {
          if (qrCount !== 0) bad.push(`${tag}: 关了码还剩 ${qrCount} 张`)
          if (hasScanLine) bad.push(`${tag}: 关了码还留着「${scan}」那行`)
          if (!hasMark) bad.push(`${tag}: 关了码没换成文字「${mark}」`)
        }
        poster.paintLayers(ctx, plan.layers, imgs)
      }
    }
  }
}
console.log(`${combos} 组排版+绘制（10 模板 × 3 笔记 × 中英 × 码开关），问题 ${bad.length} 处`)
bad.slice(0, 10).forEach((x) => console.log('  ✗', x))
process.exit(bad.length ? 1 : 0)
