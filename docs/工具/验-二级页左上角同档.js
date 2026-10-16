// 「设置」那两屏二级页的静态尺子（不连模拟器，纯读文件）。
// 跑法：node docs/工具/验-二级页左上角同档.js
//
// 站长 10-16 夜（附三张真机图）三句话，这一把钉的是后两句：
//   ①「第一个图亮度不能压暗，与密码设置的弹窗一样处理」
//   ②「图二、图三，最顶上的都改为"设置"，他们是设置的二级菜单」
//   ③「左上角统一为该菜单名称，字体风格要统一」
// 外加同一句里那半条：「名字，和一句话输入框太大了，变成一行，输入字体降一档，
//   提示词放在框内提示，不单独一行」。
//
// 图二＝`pages/profile`（卡片模板），图三＝`pages/categories`（分类管理）。
// 这一把全是"结构＋字面"的判据：屏上到底对不对，看 `docs/design/10-16二级页收口/实测/` 那几张真截图。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const NC = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
// wxml 那份也要先剥注释：这一把钉的是"撤净了没有"，而撤净这件事本身写在注释里
// （`那两行标签（.field-label）整行撤掉`），不剥就是注释自己把自己判红。
const XW = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
// 同名选择器可能有多块（这一类读法错记在尺子清单第 119 条②），一律先剥注释再**并块**
const blocksOf = (css, sel) => {
  const re = new RegExp(`(?:^|\\n)\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g')
  let m, all = ''
  while ((m = re.exec(css))) all += m[1]
  return all
}

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

const SUB = [
  { page: 'pages/profile/profile', label: '卡片模板', titleKey: 'navProfile' },
  { page: 'pages/categories/categories', label: '分类管理', titleKey: 'categories' },
]

/* ---------- ② 最顶上那一栏：两屏都念「设置」 ---------- */
SUB.forEach((s) => {
  const js = read(`${s.page}.js`)
  ok(`${s.label}：导航条吃的是「pillSettings」那一枚键（与「我的」那一屏顶上同源，不新起字串）`,
    /app\.setNavTitle\(\s*'pillSettings'/.test(js))
  ok(`${s.label}：旧那句（报自己那一格的名字）已经撤净，不留第二条出口`,
    !new RegExp(`setNavTitle\\(\\s*'${s.titleKey}'`).test(js), `还留着 setNavTitle('${s.titleKey}')`)
  const json = JSON.parse(read(`${s.page}.json`))
  ok(`${s.label}：静态那一份 json 也写「设置」（第一帧不许闪旧页名）`,
    json.navigationBarTitleText === '设置', String(json.navigationBarTitleText))
})
const dict = require(P('utils/i18n.js'))
ok('「设置」这一枚键两门都有值（zh 设置／en Settings），导航条不会念成空',
  dict.i18n.zh.pillSettings === '设置' && dict.i18n.en.pillSettings === 'Settings',
  `${dict.i18n.zh.pillSettings}｜${dict.i18n.en.pillSettings}`)

/* ---------- ③ 左上角＝该菜单名称，且两屏字体同一档 ---------- */
SUB.forEach((s) => {
  const wxml = XW(read(`${s.page}.wxml`))
  const tag = (wxml.match(new RegExp(`<text class="page-title">\\{\\{([^}]+)\\}\\}</text>`)) || [, ''])[1]
  ok(`${s.label}：左上角那一行大字存在，且吃的是这一格自己的菜单名键（不抄字面量）`,
    tag.trim() === `t.${s.titleKey}`, `读到 ${JSON.stringify(tag.trim())}`)
  ok(`${s.label}：这一枚**不是**首屏那枚书法位图（他同一夜定过"图只在有背景图状态下加"，这屏没那一态）`,
    !/brand-title|title-heading\.png/.test(wxml))
})
const decls = (css) => {
  const b = blocksOf(NC(css), '.page-title')
  const pick = (k) => ((new RegExp(`${k}:\\s*([^;]+);`).exec(b) || [, '(缺)'])[1]).trim()
  return ['font-size', 'font-weight', 'letter-spacing', 'color'].map(pick).join(' / ')
}
const ptProfile = decls(read('pages/profile/profile.wxss'))
const ptCats = decls(read('pages/categories/categories.wxss'))
ok('两屏 `.page-title` 四条声明逐字相同（"字体风格要统一"这条有牙：漂一个字就红）',
  ptProfile === ptCats && !/\(缺\)/.test(ptProfile), `profile ${ptProfile}　vs　categories ${ptCats}`)
ok('那一档就是全站那档大标题：`--fs-h1`／700／-1rpx／`--text-primary`',
  ptProfile === 'var(--fs-h1) / 700 / -1rpx / var(--text-primary)', ptProfile)

/* ---------- 同一句里那半条：名片那两格压成一行 ---------- */
const pfWxml = XW(read('pages/profile/profile.wxml'))
const pfCss = NC(read('pages/profile/profile.wxss'))
ok('那两行标签整行撤掉（wxml 与 wxss 两头都不许留 `.field-label`，留半行就是"看着有规则其实不生效"）',
  !/field-label/.test(pfWxml) && !/\.field-label\s*\{/.test(pfCss))
const inputs = pfWxml.match(/<input[\s\S]*?\/>/g) || []
ok('确实是两只框，不是一只也没多出一只', inputs.length === 2, `读到 ${inputs.length} 只`)
;[['profileNamePh', '16'], ['profileSloganPh', '24']].forEach(([ph, max], i) => {
  const el = inputs[i] || ''
  ok(`第 ${i + 1} 只：提示在框内（placeholder 吃字典键 ${ph}）且字数上限仍在（maxlength=${max}）`,
    new RegExp(`placeholder="\\{\\{t\\.${ph}\\}\\}"`).test(el) && new RegExp(`maxlength="${max}"`).test(el),
    el.replace(/\s+/g, ' ').slice(0, 90))
})
ok('输入的字降一档：吃 `--fs-body`（28）而不是原来那档 `--fs-title`（31）',
  /font-size:\s*var\(--fs-body\)/.test(blocksOf(pfCss, '.field-input'))
    && !/font-size:\s*var\(--fs-title\)/.test(blocksOf(pfCss, '.field-input')),
  blocksOf(pfCss, '.field-input').trim())
ok('`.field` 里那条 `gap` 跟着撤（它是给"标签＋框"两样之间的间距，现在只剩一样）',
  !/gap:/.test(blocksOf(pfCss, '.field')), blocksOf(pfCss, '.field').trim())
ok('两个键没变成死键：`profileName`／`profileSlogan` 在首页那张卡片小弹窗与分享页还在用',
  [/ci-label/, /ci-label/].every((re, i) => re.test(XW(read(i ? 'pages/share/share.wxml' : 'pages/index/index.wxml'))))
    && new RegExp('t\\.profileName[^P]').test(read('pages/index/index.wxml'))
    && new RegExp('t\\.profileSlogan[^P]').test(read('pages/share/share.wxml')))

/* ---------- ① 邮箱那一层：打开不许把整屏压暗 ---------- */
const meCss = NC(read('pages/me/me.wxss'))
const emailMask = blocksOf(meCss, '.me-email-mask')
ok('邮箱那一层的遮罩是透明的（只留热区，不压暗）',
  /background:\s*transparent/.test(emailMask) && !/rgba\(/.test(emailMask), emailMask.trim())
ok('这一层没顺手补上糊（他要的是"与密码弹窗一样"，那一层没有 backdrop-filter）',
  !/backdrop-filter/.test(emailMask), emailMask.trim())
const pwdMask = blocksOf(NC(read('styles/pwd-sheet.wxss')), '.pwd-mask')
ok('同一档的另一头（六位密码那一层）照旧透明——这一改不许把它带回压暗',
  /background:\s*transparent/.test(pwdMask), pwdMask.trim())
ok('他没指的那两层照旧压暗（`.ci-mask` 首页卡片小弹窗／`.dialog-mask` 新增分类）：'
    + '「去掉」只覆盖他指的那一处',
  /background:\s*rgba\(20, 20, 28, 0\.55\)/.test(blocksOf(NC(read('app.wxss')), '.ci-mask'))
    && /background:\s*rgba\(20, 20, 28, 0\.55\)/.test(blocksOf(NC(read('pages/categories/categories.wxss')), '.dialog-mask')))

console.log(`${fails.length ? '✗' : '✓'} 二级页左上角同档：${pass}/${pass + fails.length} 过`)
fails.forEach((f) => console.log('  ✗ ' + f))
process.exit(fails.length ? 1 : 0)
