// 十套海报模板的几何与图层自检：10 模板 × 6 种笔记 × 中英 × 码开/关 = 240 组，
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
  // 竖排那条"列首不许站标点"的规则会把标点往上一列尾巴上拽，一列因此可能比预算多占格；
  // 再撞上截断补的省略号就是再多一格。标题第 12、13 字特意连排两个逗号：
  // 去掉 perCol 里预留的那三格，第一列就一路戳过底部码贴纸（列底 1034 > 码顶 992）。
  // 单个标点拽不动（只多一格还在预算内），所以必须连排两个，这条用例才有牙。
  { title: '一二三四五六七八九十一，，二三四五六七八九十一二，，三四五六七八九十', summary: '人性就是这么现实。你也是。那么好的。知道了。是的。好的。没错。是的。好的。明白。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
  // 拉丁段是竖排里最容易算错的一种：转 90° 之后它吃的是"自己的字宽"而不是"一个字一格"。
  // 这两条抄自站长 09-26 真机看的那条笔记（id=7）：标题 13 字刚好让第二列只剩一个"绍"，
  // 摘要里的 WAICFutureTech 一段顶三格、当时把整列捅穿了署名带。改分列规则时先确认它还能红。
  { title: '2026微信小程序开发大赛介绍', summary: '微信小程序团队联合 WAICFutureTech 启动 2026 微信小程序开发大赛，以“与 AI 共生”为主题面向全球征集 AI 原生作品。大赛提供 5 万元税前奖金池及多项权益，鼓励开发者接入微信小程序生态。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-23T10:00:00Z' },
  { title: 'WAICFuture 2026 微信小程序开发大赛全球启动', summary: 'The quick brown fox jumps over the lazy dog. 主题面向全球征集 AI 原生作品，International Communication Association 联合主办。', key_points: [], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' },
]
const imgs = { qr: { img: {}, width: 200, height: 200 } }

// 竖排自检要判"这个字占一格还是一段"，所以这两条得在这里另写一份：
// 和 poster.js 共用一份常量的话，常量写错就一起错，等于没查。
const CJKR = /[⺀-鿿豈-﫿︐-﹏＀-￯　-〿]/
const VP = /[，。、；：！？）》」』】〉、·…]/

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
        // 底部码贴纸的上沿：竖排列不许一路戳进这块署名区
        const qrLy = plan.layers.find((l) => l.k === 'image' && l.key === 'qr')
        const qrTop = qrLy ? qrLy.y : plan.height
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
          // 竖排那几列是这里唯一"层坐标看不出问题"的东西：层只记第一格的落笔点，
          // 一列往下走多远、往左吃掉几槽，全在绘制时才算得出来。所以照落笔的规则
          // 独立复算一遍列高与列位（正则另写一份，不复用 poster.js 的——抄来的会一起错）。
          if (l.k === 'text' && l.vert) {
            const size = l.size || 28
            const step = l.lh
            const pitch = l.lh + (l.colGap || 0)
            const bottomOf = (line) => {
              const cs = Array.from(String(line))
              let yy = l.y
              let k = 0
              while (k < cs.length) {
                if (VP.test(cs[k]) || CJKR.test(cs[k])) { yy += step; k += 1; continue }
                let j = k
                while (j < cs.length && !CJKR.test(cs[j]) && !VP.test(cs[j])) j++
                const runW = cs.slice(k, j).reduce((a, c) => a + (c.codePointAt(0) > 0x2e80 ? size : size * 0.55), 0)
                yy += Math.max(step, runW + 8)
                k = j
              }
              return yy
            }
            ;(l.lines || []).forEach((line, col) => {
              const cx = l.x - col * pitch
              if (cx - size / 2 < -1) bad.push(`${tag}: 竖排列越出左边界，第 ${col + 1} 列中心 x=${Math.round(cx)}`)
              // 孤字不成列：最后一列只站一个字，读着像漏字（标题那种大字列尤其明显）
              if (col === l.lines.length - 1 && l.lines.length > 1 && Array.from(String(line)).length === 1) {
                bad.push(`${tag}: 竖排最后一列只剩孤字「${line}」`)
              }
              const bottom = bottomOf(line)
              if (bottom > plan.height - 8) bad.push(`${tag}: 竖排第 ${col + 1} 列伸到画布底外，列底 y=${Math.round(bottom)} 画布高=${plan.height}`)
              if (qrLy && bottom > qrTop) bad.push(`${tag}: 竖排第 ${col + 1} 列压到底部码贴纸，列底 y=${Math.round(bottom)} 码顶 y=${Math.round(qrTop)}`)
            })
          }
        }
        const qrCount = plan.layers.filter((l) => l.k === 'image' && l.key === 'qr').length
        const scan = i18n[lang].scanToView
        const hasScanLine = plan.layers.some((l) => l.k === 'text' && (l.lines || []).some((s) => String(s) === scan))
        const mark = i18n[lang].noQrMark
        const hasMark = plan.layers.some((l) => l.k === 'text' && (l.lines || []).some((s) => String(s).indexOf(mark) === 0 || String(s) === mark))
        if (showQr) {
          if (qrCount !== 1) bad.push(`${tag}: 该有一张码，实际 ${qrCount}`)
          // 十套模板统一"码在右下角"（站长 09-24 的口径），这条是它的可检验版本：
          // 右边缘要贴到画布右边那一条，纵向必须落在下半截。居中一枚裸码、码靠左都算不合格。
          const qr = plan.layers.find((l) => l.k === 'image' && l.key === 'qr')
          if (qr) {
            const rightGap = plan.width - (qr.x + qr.w)
            // 上限给到 120 是因为量的是贴纸里那枚**图**，它比贴纸本体还缩一圈内边距；
            // 居中一枚裸码（旧摆法）算下来是 320 左右，靠左是 500 往上，都在这个窗口外。
            if (rightGap < 20 || rightGap > 120) bad.push(`${tag}: 码没收到右边，距右边界 ${Math.round(rightGap)}`)
            if (qr.y < plan.height * 0.45) bad.push(`${tag}: 码不在下半截，y=${Math.round(qr.y)} 画布高=${plan.height}`)
            const foot = plan.layers.filter((l) => l.k === 'text' && (l.lines || []).some((s) => String(s) === scan))
            if (!foot.length) bad.push(`${tag}: 这套缺「${scan}」那行引导语`)
            else {
              const c = foot[0]
              if (Math.abs(c.x - (qr.x + qr.w / 2)) > 2) bad.push(`${tag}: 引导语没跟着码居中，偏 ${Math.round(c.x - (qr.x + qr.w / 2))}`)
              if (c.y <= qr.y) bad.push(`${tag}: 引导语不在码下面（y=${Math.round(c.y)} vs 码 y=${Math.round(qr.y)}）`)
            }
          }
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
console.log(`${combos} 组排版+绘制（10 模板 × 6 笔记 × 中英 × 码开关），问题 ${bad.length} 处`)
// 纸色那两档由分类明暗决定（站长 09-26：两档都要，走哪档别随机）。这里把映射钉死：
// 偏亮的两档分类走 A 纯宣，偏暗的三档 + 未分类那块墨走 B 黛青。
const { TONES, UNCATEGORIZED } = require('../../miniprogram/utils/palette.js')
const wantA = [0, 2]
const map = TONES.map((t, i) => `${i}:${poster.paperOf(i) === poster.PAPER_A ? 'A' : 'B'}`).join(' ')
const nullSide = poster.paperOf(null) === poster.PAPER_A ? 'A' : 'B'
TONES.forEach((t, i) => {
  if ((wantA.includes(i) ? 'A' : 'B') !== (poster.paperOf(i) === poster.PAPER_A ? 'A' : 'B')) {
    bad.push(`纸色映射变了：分类 ${i}（${t.name}）现在走 ${poster.paperOf(i) === poster.PAPER_A ? 'A' : 'B'}`)
  }
})
if (nullSide !== 'B') bad.push(`未分类那块墨（${UNCATEGORIZED.bg}）应该走 B，现在走 ${nullSide}`)
console.log(`纸色映射 ${map} / 未分类 ${nullSide}，问题 ${bad.length} 处`)
bad.slice(0, 10).forEach((x) => console.log('  ✗', x))
process.exit(bad.length ? 1 : 0)
