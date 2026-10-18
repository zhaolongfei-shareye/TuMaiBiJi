/**
 * 一把静态尺子（不连模拟器）：钉住站长 10-18 这两刀的形状。
 *  ① 「所有标签，在页面上每个标签自动加 # 号……但入库时候不要自动加 #。这个仅仅是前端显示。」
 *     ⇒ 渲染那三处必须带 `#`，而**数据层一个字不许动**：保存那条链（write.js 的 tagsText/splitTags）、
 *       后端那栏、出卡片那条链（poster/）都不许出现拼 `#` 的写法。这一条反向钉比正向钉有用——
 *       哪天有人图省事把 # 拼进 `tagList`，库里就长出一堆带井号的标签，撤都撤不干净。
 *  ② 「看私密笔记已经输入一次密码，编辑时候不应该再输入一次，然后返回列表又要输一次，这个要去掉。」
 *     ⇒ 「验过哪一篇」必须记在 privateGate 模块那一份上（三屏共用），不许再回到页面实例上；
 *       但它仍然要与 `api.hasPrivateUnlock()` 相与（10-12 那条"页面布尔没人清"的坑不能复活）；
 *       并且判据仍是"同一篇"——换一篇必问是站长 10-12 拍的，今天这一句没翻它，这里钉住防我放宽。
 * 跑法：node docs/工具/验-标签井号与私密只问一次.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

// ---------- ① 标签：三处渲染都带 # ----------
const idxW = read('pages/index/index.wxml')
const detW = read('pages/detail/detail.wxml')
const viewW = read('pages/share/view.wxml')
ok('详情窗那一排每枚前面带 #（`#{{tg}}`，纯标记层，不改数据）',
  /class="ds-tag"[^>]*>#\{\{tg\}\}<\/text>/.test(idxW))
ok('独立详情页那一排同样带 #', /class="tag"[^>]*>#\{\{tg\}\}<\/text>/.test(detW))
ok('分享落地页那一排也带 #（他说的是"所有标签"，这一屏也是页面）',
  /class="tag">#\{\{item\}\}<\/text>/.test(viewW))
ok('三处都还在各自的 wx:for 里（# 是逐枚加，不是在那一排前面加一枚总的）',
  (idxW.match(/wx:for="\{\{detailNote\.tags\}\}"/g) || []).length === 1
  && (detW.match(/wx:for="\{\{note\.tags\}\}"/g) || []).length === 1
  && (viewW.match(/wx:for="\{\{share\.tags\}\}"/g) || []).length === 1)

// ---------- ①-b 反向：数据层不许带 # ----------
const writeJs = read('pages/write/write.js')
const tagSave = writeJs.slice(writeJs.indexOf('splitTags'), writeJs.indexOf('onSave'))
const HASH_QUOTE = String.fromCharCode(39) + '#' + String.fromCharCode(39)
ok('保存那条链（splitTags→onSave 这一段）里一个井号都没有：入库仍是原样',
  tagSave.length > 100 && !tagSave.includes(HASH_QUOTE) && !tagSave.includes('`#'),
  `那一段 ${tagSave.length} 字符`)
ok('全站除 palette.js（那是 hex 色值）之外没有「井号当串头拼」这种写法',
  (() => {
    const hit = []
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); return }
      if (!/\.(js|wxml)$/.test(e.name)) return
      if (/'#'\s*\+|`#\$\{/.test(fs.readFileSync(f, 'utf8'))) hit.push(path.relative(ROOT, f))
    })
    walk(P(''))
    return hit.every((f) => f.endsWith('utils/palette.js'))
  })(), '多出来的那些文件把 # 拼进了数据层')

// ---------- ② 私密：验过哪一篇记在模块里，一份共用 ----------
const gate = read('utils/privateGate.js')
ok('privateGate 里有一份模块级的「验过哪一篇」（`let unlockedNoteId`）——三屏共用才不会再问',
  /^let unlockedNoteId = 0$/m.test(gate))
// ⚠ 查"旧写法有没有撤净"这一类必须**剥掉注释再查**：这几处来历把旧写法整句抄在注释里
//   （同 `验-统一录入条` 那一条同一个理由），拿原文扫就是把"解释了为什么撤掉"判成残留。
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
ok('全站不许再出现页面实例上那份「下划线 unlockedNoteId」这个字段（留着就是第二份记法）',
  !/_unlockedNoteId/.test(['utils/privateGate.js', 'pages/index/index.js',
    'pages/detail/detail.js', 'pages/write/write.js'].map((f) => strip(read(f))).join('\n')))
ok('needsUnlock 收的是那一篇本身（单参数），且仍与 `api.hasPrivateUnlock()` 相与',
  /function needsUnlock\(note\) \{/.test(gate) && /unlockedNoteId === note\.id && api\.hasPrivateUnlock\(\)/.test(gate))
ok('判据仍是"同一篇"：换一篇必问（10-12 那条口径，今天这句没翻它，钉住防放宽）',
  !/unlockedNoteId\s*&&\s*api\.hasPrivateUnlock|return api\.hasPrivateUnlock\(\)/.test(gate))
ok('验不成先作废手上这把（clearPrivateUnlock 与归零同批，不许只清一把）',
  /api\.clearPrivateUnlock\(\)\s*\n\s*unlockedNoteId = 0/.test(gate))
ok('三屏仍走同一个 unlockOn，没有第二份实现',
  /unlockOn\(this, note\)/.test(read('pages/write/write.js'))
  && /privateGate\.unlockOn\(this, note\)/.test(read('pages/detail/detail.js'))
  && /await unlockOn\(this, /.test(read('pages/index/index.js')))

console.log(`${pass}/${pass + fails.length} 过${fails.length ? '　红：\n  - ' + fails.join('\n  - ') : ''}`)
process.exit(fails.length ? 1 : 0)
