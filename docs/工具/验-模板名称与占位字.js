// 站长 09-24 点了两件事：模板"人像封面"改叫"杂志封面"；十个小样里那一片占位字"把"要换成"麦"。
// 名字是数据、占位字是画出来的，肉眼看图既慢又容易漏（波普那一格一次就画四个"把"）。
// 所以拿产品那份 poster.js 在 node 里跑十套 × 两种语言 × 有无形象，直接量图层。
// 跑法：node docs/工具/验-模板名称与占位字.js
const poster = require('../../miniprogram/utils/poster.js')

global.wx = {
  getStorageSync: () => null,
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => { throw new Error('no file') } }),
  env: { USER_DATA_PATH: '/u' },
}

let fontPx = 28
const charW = (c) => (c.codePointAt(0) > 0x2e80 ? fontPx : fontPx * 0.55)
const ctx = new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + charW(c), 0) })
    if (String(k).startsWith('create') && String(k).endsWith('Gradient')) return () => ({ addColorStop() {} })
    if (k === 'font') return ''
    return () => {}
  },
  set: (_, k, v) => {
    if (k === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) fontPx = parseFloat(m[1]) }
    return true
  },
})

const bad = []
const textsOf = (plan) => plan.layers
  .filter((l) => l.k === 'text')
  .reduce((out, l) => out.concat((l.lines || []).map(String)), [])

// ① 名字：新旧都不能再出现，且必须中英成对。
const labels = poster.TEMPLATES.map((x) => x.label)
const labelsEn = poster.TEMPLATES.map((x) => x.labelEn)
if (!labels.includes('杂志封面')) bad.push(`模板名里没有「杂志封面」，现在是：${labels.join(' / ')}`)
if (labels.includes('人像封面')) bad.push('「人像封面」还在模板名里')
if (!labelsEn.includes('Magazine Cover')) bad.push(`英文那半没跟着改：${labelsEn.join(' / ')}`)
if (labelsEn.some((s) => /Portrait/i.test(s))) bad.push('英文还写着 Portrait')

// ② 占位字：小样标题是以"把"开头的那句，只要还在取标题首字，画出来就是一大片"把"。
//    无形象 = 用户没设头像，人像位全靠那个字顶着，所以这一趟才是他看到的样子。
const glyphTemplates = []
for (const lang of ['zh', 'en']) {
  const note = lang === 'zh' ? poster.SAMPLE_NOTE : poster.SAMPLE_NOTE_EN
  for (const tpl of poster.TEMPLATES) {
    const tag = `${tpl.id}/${lang}`
    const plan = poster.planPoster(ctx, note, tpl.id, { name: '', slogan: '', avatarPath: '' }, lang, { showQr: true })
    const lines = textsOf(plan)
    const hit = lines.filter((s) => s.indexOf('把') >= 0)
    if (hit.length) bad.push(`${tag}: 画面上还出现"把" → ${hit.map((s) => `「${s}」`).join('、')}`)
    const hasGlyph = lines.some((s) => s === poster.BRAND_GLYPH)
    if (hasGlyph) glyphTemplates.push(tag)
  }
}
if (!glyphTemplates.length) bad.push(`没有任何一套模板画出品牌字「${poster.BRAND_GLYPH}」，占位字这条改动没生效`)

// ③ 设了形象的人像位不该再要这个字：那几套画的是头像，不是占位字。
const withAvatar = poster.TEMPLATES.filter((tpl) => {
  const plan = poster.planPoster(ctx, poster.SAMPLE_NOTE, tpl.id, { name: '阿飞', slogan: '每天读一点', avatarPath: '/u/poster-avatar.img' }, 'zh', { showQr: true })
  return textsOf(plan).some((s) => s === poster.BRAND_GLYPH)
}).map((x) => x.id)
if (withAvatar.length) bad.push(`已经设了形象还画占位字：${withAvatar.join(' / ')}`)

console.log(`十套模板 × 中英 = 20 组小样；画到品牌字「${poster.BRAND_GLYPH}」的有 ${glyphTemplates.length} 组`)
console.log(`模板名：${poster.TEMPLATES.map((x) => x.label).join(' / ')}`)
if (bad.length) {
  console.log(`\n发现 ${bad.length} 处问题：`);
  bad.forEach((b) => console.log('  · ' + b))
  process.exit(1)
}
console.log('全部通过：没有"把"，没有"人像封面"，占位字是品牌字，且设了形象时不再画它')
