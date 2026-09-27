// 首页统一录入条这一批的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-统一录入条.js
// 要守的东西：三张入口卡合并成一条之后，功能一个都不能少、入口只能有一个、
// 颜色只能从 palette 来、条身那句话必须跟着语言切。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const wxml = fs.readFileSync(P('pages/create/create.wxml'), 'utf8')
const wxss = fs.readFileSync(P('pages/create/create.wxss'), 'utf8')
const js = fs.readFileSync(P('pages/create/create.js'), 'utf8')
const i18n = require(P('utils/i18n.js'))
const palette = require(P('utils/palette.js'))
const zh = i18n.texts('zh')
const en = i18n.texts('en')

// ---------- 1. 文案：七个新串两门都有，条数相等 ----------
const NEW_KEYS = ['barIdle', 'barUrl', 'barShot', 'barCollapse', 'modeWrite', 'modeUrl', 'homeBgSwap']
NEW_KEYS.forEach((k) => {
  ok(`i18n.${k} 中文有`, !!zh[k])
  ok(`i18n.${k} 英文有`, !!en[k])
})
ok('barShot 两门都留了 {n} 位', /{n}/.test(zh.barShot) && /{n}/.test(en.barShot), zh.barShot + ' / ' + en.barShot)
ok('中英键数相等', Object.keys(zh).length === Object.keys(en).length,
  Object.keys(zh).length + ' vs ' + Object.keys(en).length)
// 条身四个字不能比页面标题还小，模式标签不能超出现有字阶
ok('拍照/相册两个标签复用现网串', zh.takePhoto === '拍照' && zh.fromAlbum === '相册')

// ---------- 2. 结构：只剩一条，三枚小圆，四个模式 ----------
ok('旧的三张入口卡已经拆掉', !/class="card entry/.test(wxml))
ok('没有残留的手风琴开关', !/toggleCard/.test(wxml) && !/toggleCard/.test(js))
ok('条身只有一条', (wxml.match(/class="bar[ "]/g) || []).length === 1)
ok('条身读 barTitle 这个字段', /class="bar-label">\{\{barTitle\}\}/.test(wxml))
ok('收起态正好三枚小圆', (wxml.match(/class="dot"/g) || []).length === 3)
ok('展开态正好四个模式标签', (wxml.match(/class="mode /g) || []).length === 4)
ok('三枚小圆分别指向 camera / album / url',
  /data-source="camera"/.test(wxml) && /data-source="album"/.test(wxml) && /onDotUrl/.test(wxml))
ok('点条身 = 直接写', /class="bar" catchtap="openBar"/.test(wxml))
ok('面板自己吃掉点击，不会一点输入框就收起', /class="panel" catchtap="noop"/.test(wxml))
ok('整页仍是收起点击区', /bindtap="collapse"/.test(wxml))

// ---------- 3. 一个功能只留一个入口 ----------
ok('换背景只是导流，不弹相册', /goHomeBg\(\)\s*\{\s*wx\.navigateTo/.test(js) && !/goHomeBg[\s\S]{0,200}chooseMedia/.test(js))
ok('导流目标还是那一页', /navigateTo\(\{ url: '\/pages\/profile\/profile' \}\)/.test(js))
ok('选图入口全页只有 pickImage 一处', (js.match(/wx\.chooseMedia/g) || []).length === 1)
ok('换背景那一行只在铺了图时存在', /wx:if="\{\{bgSrc\}\}" class="home-swap"/.test(wxml))

// ---------- 4. 状态机：mode 与 active 的对应 ----------
ok('camera / album 都落到 shot 那一段', /mode === 'camera' \|\| mode === 'album' \? 'shot' : mode/.test(js))
ok('四个模式各自的图形都给了', /leadFor\(mode\)/.test(js)
  && /write: 'pencil', camera: 'camera', album: 'album', url: 'link'/.test(js))
// setData 之前 this.data 还是旧值，所以条身文案必须由调用方把新状态传进来
ok('barTitleFor 收参数、不偷读 this.data.active',
  /barTitleFor\(active, count\)/.test(js) && !/barTitleFor\(\)/.test(js))
// 注释和属性里出现中文不算"写死"；只看真正会上屏的那几段文字
const rendered = wxml.replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]*>/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\{\{[^}]*\}\}/g, '').trim())
  .filter(Boolean)
  .join(' ')
// 「中 / EN」是语言名本身，两门界面都长这样，不算写死
const renderedNoLangNames = rendered.replace(/中/g, '')
ok('上屏文字全走字典，wxml 里没有写死的中文', !/[\u4e00-\u9fa5]/.test(renderedNoLangNames), rendered.slice(0, 60))

// 每个绑定的处理函数都得真的存在
const handlers = new Set()
wxml.replace(/(?:catch|bind)(?:tap|input|confirm|change)="(\w+)"/g, (_, h) => handlers.add(h))
wxml.replace(/bind(change|input)="(\w+)"/g, (_, a, h) => handlers.add(h))
;[...handlers].forEach((h) => {
  ok(`处理函数 ${h} 在 create.js 里`, new RegExp('\\b' + h + '\\s*\\(').test(js))
})

// ---------- 5. 样式：条与面板的几何、以及"颜色不从 wxss 里长出来" ----------
ok('旧的 .entry-cards 改成了 .entry-wrap', !/\.entry-cards/.test(wxss) && /\.entry-wrap/.test(wxss))
// 66vh 是照效果图反推的：42vh 是三张卡（整组 480 高）时代的数，
// 现在只剩一条 128 高的条，照旧数推上去条底会比底栏还低，所以真跑的几何断言才是尺子。
// 关键是这段留白挂在 .entry-wrap 本身、不带 has-bg：关掉背景图时条子也在同一条线上。
ok('留白 66vh，且不随背景开关变', /\.entry-wrap\s*\{[^}]*margin-top: 66vh/.test(wxss)
  && !/\.container\.has-bg \.entry-wrap\s*\{[^}]*margin-top/.test(wxss))
ok('展开让位规则还在', /\.container\.bg-give-way \.entry-wrap\s*\{[^}]*margin-top: 0/.test(wxss))
ok('旧手风琴的高度档全部清掉了', !/\.open-url|\.open-shot|\.open-write|\.entry-label/.test(wxss))
ok('条身 128 高、胶囊圆角', /\.bar\s*\{[^}]*height: 128rpx/.test(wxss) && /\.bar\s*\{[^}]*--r-pill/.test(wxss))
ok('展开时条与面板同一块白、接缝圆角对上', /\.bar\.open\s*\{[^}]*--r-card/.test(wxss) && /\.panel\s*\{[^}]*0 0 var\(--r-card\)/.test(wxss))
ok('面板自带一套"纸面"控件变量', ['--face:', '--face-ink:', '--solid-bg:', '--solid-ink:', '--blk-err:']
  .every((v) => new RegExp('\\.panel\\s*\\{[\\s\\S]*?' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(wxss)))
ok('压暗层收到底部 0.72', /0\.72\)\s*100%/.test(wxss))
ok('换背景那行 110 高、图标 38、字 28', /height: 110rpx/.test(wxss)
  && /\.swap-glyph\s*\{[^}]*width: 38rpx/.test(wxss) && /\.swap-text\s*\{[^}]*font-size: 28rpx/.test(wxss))

// 饱和色必须由 palette 发下来，wxss 里不许出现第二份色板
const TONE_HEXES = palette.TONES ? palette.TONES.map((t) => t.bg.toUpperCase()) : []
const wxssHexes = (wxss.match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toUpperCase())
const banned = ['#F6C445', '#3F52D6', '#E9723D', '#46A863', '#6E4BD0']
ok('wxss 里没有抄色板里的饱和色', !wxssHexes.some((h) => banned.includes(h)),
  wxssHexes.filter((h) => banned.includes(h)).join(','))
ok('三枚小圆都吃 skin', (wxml.match(/class="dot" style="\{\{skin/g) || []).length === 3)
ok('两块选图按钮都吃 skin', (wxml.match(/class="pk" style="\{\{skin/g) || []).length === 2)
ok('四个模式标签的色点吃 skin', (wxml.match(/class="mode-dot" style="\{\{skin/g) || []).length === 4)
ok('create.js 按四个入口取四档 toneStyle',
  /toneStyle\(1\)/.test(js) && /toneStyle\(2\)/.test(js) && /toneStyle\(3\)/.test(js) && /toneStyle\(0\)/.test(js))

// ---------- 6. 老功能没被这一批碰坏 ----------
;['submitUrl', 'submitScreenshots', 'saveManual', 'pasteUrl', 'clearUrl', 'removeShot',
  'clearShots', 'openPermSetting', 'onPickCategory', 'onSwitchLang', 'onUrlInput',
  'onWriteTitle', 'onWriteBody'].forEach((h) => {
  ok(`${h} 仍挂在 wxml 上`, new RegExp('"' + h + '"').test(wxml))
})
ok('忙态仍然挡住收起', /collapse\(\)\s*\{\s*if \(this\.data\.busy/.test(js))
ok('onShow 仍然不重置草稿', !/previewImages: \[\]/.test(js.split('async onShow')[1].split('hintFor(value)')[0]))
ok('选完图返回仍然重算条身', /barTitle: this\.barTitleFor\(this\.data\.active, this\.data\.previewImages\.length\)/.test(js))

console.log(`统一录入条：${pass} 条通过`)
if (fails.length) {
  console.log(`失败 ${fails.length} 条：`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exit(1)
}
