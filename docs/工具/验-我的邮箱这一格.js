// 「我的 → 我的邮箱」这一格的接线尺子（静态，不打网络）。
//
// 这一格是"账号能力"那一句的实现：用户自己填、自己改、自己清空。界面半边没有数据库可查，
// 能钉的是三件事：① 两个口在前后端是同一个路径、都吃鉴权；② 面板**读数没回来不许打开**
// （服务端把空串定义成清除，预填成空白再让人点保存就是替他清了旧值——这一条是整个界面
// 半边最贵的不变量）；③ 屏上每句话都来自字典、隐私文本两处都提到了这一格。
// 跑法：node docs/工具/验-我的邮箱这一格.js
const fs = require('fs')
const path = require('path')

const R = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')
const ROOT = 'miniprogram'
const API = `${ROOT}/utils/api.js`
const I18N = `${ROOT}/utils/i18n.js`
const WXML = `${ROOT}/pages/me/me.wxml`
const MEJS = `${ROOT}/pages/me/me.js`
const ABOUT = `${ROOT}/pages/about/about.js`
const CONTACT = `${ROOT}/utils/contact.js`
const ROUTES = 'backend/app/api/routes/user.py'
const MODEL = 'backend/app/models/user.py'
const MIG = 'backend/alembic/versions/c8f3a1d6e470_user_contact_email.py'

const KEYS = ['myEmail', 'myEmailUnset', 'myEmailScene', 'myEmailPlaceholder',
  'myEmailSave', 'myEmailSaved', 'myEmailCleared', 'myEmailLoadFailed']

function 判(src) {
  const bad = []
  const ck = (name, ok, got) => {
    console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
    if (!ok) bad.push(name)
  }
  const api = src[API], i18n = src[I18N], wxml = src[WXML], me = src[MEJS]
  const about = src[ABOUT], routes = src[ROUTES], model = src[MODEL], mig = src[MIG]

  // —— ① 两个口：客户端那两个出口、后端那两条路由，路径必须一模一样 ——
  ck('api.js 有读的那个口（GET /api/user/contact-email）',
    /getContactEmail:\s*\(\)\s*=>\s*request\('\/api\/user\/contact-email'\)/.test(api))
  ck('api.js 有写的那个口（PUT 同一址，body 只有 email 一个键）',
    /setContactEmail:\s*\(email\)\s*=>\s*request\('\/api\/user\/contact-email',\s*'PUT',\s*\{ email \}\)/.test(api))
  ck('后端注册的就是这两个路径',
    /@router\.get\("\/contact-email"\)/.test(routes) && /@router\.put\("\/contact-email"\)/.test(routes))
  // 两个口都要挂鉴权——少一个就是任何人都能读写别人的地址。
  // 截取函数体用"从这里到下一个 @router"，不许写死字数：写死了抽不全，判据就变成假红。
  const body = (from) => {
    const i = routes.indexOf(from)
    if (i < 0) return null
    const j = routes.indexOf('\n@router', i)
    return routes.slice(i, j < 0 ? routes.length : j)
  }
  const get = body('@router.get("/contact-email")')
  const put = body('@router.put("/contact-email")')
  ck('GET 那一条吃 get_current_user', !!get && /get_current_user/.test(get), get ? '' : '没抽到函数体')
  ck('PUT 那一条吃 get_current_user', !!put && /get_current_user/.test(put), put ? '' : '没抽到函数体')
  ck('PUT 那一条限流（这一格能被拿来撞库）', !!put && /@limiter\.limit\(/.test(put))

  // —— 长度上限两处必须同一个数（有一条 pytest 在比模型与迁移，这里钉的是"代码里只有一个口径"）——
  const maxRoute = /CONTACT_EMAIL_MAX = (\d+)/.exec(routes)
  const col = /contact_email = Column\(String\((\d+)/.exec(model)
  const migCol = /add_column\(\s*'users',\s*sa\.Column\('contact_email',\s*sa\.String\((\d+)/.exec(mig)
  ck('路由里的上限、模型那一列、迁移那一列三处同一个数（254）',
    !!maxRoute && !!col && !!migCol && maxRoute[1] === col[1] && col[1] === migCol[1] && col[1] === '254',
    `路由 ${maxRoute && maxRoute[1]}／模型 ${col && col[1]}／迁移 ${migCol && migCol[1]}`)
  ck('那一列可空（不填是正常态，不是缺数据）',
    /contact_email = Column\(String\(\d+\), nullable=True\)/.test(model))

  // —— ② 面板那道门：读数没回来之前不许打开，也不许摆一个猜的值 ——
  ck('设置那一组里有这一行，右侧的值由 emailLoaded 挡着',
    /wx:if="\{\{emailLoaded\}\}"/.test(wxml) && /bindtap="onToggleEmail"/.test(wxml))
  ck('这一行没挂小字说明（右侧要留给地址，两处都要字就挤了）',
    !/bindtap="onToggleEmail"[\s\S]{0,260}?menu-hint/.test(wxml))
  const gate = me.indexOf('if (!this.data.emailLoaded) {')
  const open = me.indexOf('emailOpen: true')
  ck('「没读到就不打开」这道门排在面板打开之前（判形状，不比字面）',
    gate >= 0 && open >= 0 && gate < open, `门@${gate} 打开@${open}`)
  ck('打开时预填的是现读回来的那一条，不是空白',
    /emailBuf:\s*this\.data\.emailText/.test(me))
  ck('收回时把半截没保存的字也退回现读那一条',
    /onCloseEmailPanel\(\)\s*\{[\s\S]{0,240}?emailBuf:\s*this\.data\.emailText/.test(me))
  ck('保存成功后屏上写的就是服务端回的那一份（小写化之后），不是输入框里的原样',
    /const r = await api\.setContactEmail\([\s\S]{0,300}?emailText: email/.test(me))
  ck('保存那一趟有防重（连点两下不该发两次 PUT）', /if \(this\.savingEmail\) return/.test(me))
  ck('读数没回来时 loadEmail 把 emailLoaded 归 false（连"未填写"都不摆）',
    /catch \(err\) \{[\s\S]{0,200}?emailLoaded: false/.test(me))

  // —— ③ 每一句话都来自字典，两种语言都在 ——
  const segOf = (L) => {
    const start = i18n.indexOf(`\n  ${L}: {`)
    if (start < 0) return ''
    const end = i18n.indexOf('\n  },', start)
    return i18n.slice(start, end < 0 ? i18n.length : end)
  }
  for (const k of KEYS) {
    const has = (L) => new RegExp(`\\n\\s+${k}: '[^']+'`).test(segOf(L))
    ck(`字典 ${k} 中英两边都有且非空`, has('zh') && has('en'),
      `zh=${has('zh')} en=${has('en')}`)
  }
  ck('面板里那两枚按钮的字吃字典键，不是写死的',
    /\{\{t\.cancel\}\}[\s\S]{0,200}\{\{t\.myEmailSave\}\}/.test(wxml))
  ck('说明那一句在面板里（这一行右侧不给小字，所以整句要写在打开的那一层）',
    /\{\{t\.myEmailScene\}\}/.test(wxml))

  // —— ④ 隐私文本两处都要提到这一格：收集清单里一句、账号与笔记里一句 ——
  for (const [tag, block] of [['中文', /const PRIVACY_ZH = \[([\s\S]*?)\n\]/.exec(about)],
                              ['英文', /const PRIVACY_EN = \[([\s\S]*?)\n\]/.exec(about)]]) {
    const b = block ? block[1] : ''
    ck(`${tag}隐私第 1 条「收集什么」里写了这一格（可填可不填 + 只给本人读）`,
      /邮箱/.test(b) || /email/i.test(b), b ? '' : '没抽到 PRIVACY 块')
    ck(`${tag}「账号与笔记」里写了它随时能改能清空`,
      /(清空|注销)/.test(b) || /clear|deactivat/i.test(b))
  }

  // —— ⑤ 开发者那行反馈邮箱仍是同一个出处 ——
  const cjs = R(CONTACT)
  ck('开发者反馈邮箱只有一个出处（utils/contact.js）', /CONTACT_EMAIL/.test(cjs))
  ck('那一个出处现在是 gmail（10-08 与后台那份《隐私保护指引》对齐）',
    /CONTACT_EMAIL: 'jacky28471258@gmail\.com'/.test(cjs), cjs.trim())

  return bad
}

const src = {}
for (const f of [API, I18N, WXML, MEJS, ABOUT, ROUTES, MODEL, MIG]) src[f] = R(f)

console.log('———— 正例：现在这份代码 ————')
const bad = 判(src)

console.log('\n———— 反向钉：撤掉"读数没回来不许打开"那道门 ————')
const mutant = Object.assign({}, src)
mutant[MEJS] = src[MEJS].replace(
  /    if \(!this\.data\.emailLoaded\) \{[\s\S]{0,160}?\n    \}\n/, '    ')
const mbad = 判(mutant)
const 门红 = mbad.some((x) => x.includes('没读到就不打开'))

console.log('\n———— 反向钉：给那一行补一句小字说明（右侧就挤了）————')
const m2 = Object.assign({}, src)
m2[WXML] = src[WXML].replace(/(<view class="menu-item \{\{emailOpen \? 'open' : ''\}\}" bindtap="onToggleEmail">)/,
  '$1\n        <text class="menu-hint">占位说明</text>')
if (!/menu-hint/.test(m2[WXML])) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const m2bad = 判(m2)

console.log(`\n正例 ${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
console.log(`反向①撤门 ${门红 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向②加小字 ${m2bad.some((x) => x.includes('没挂小字说明')) ? '红在对的地方' : '没红＝这条判据是假的'}`)
process.exit(bad.length || !门红 || !m2bad.some((x) => x.includes('没挂小字说明')) ? 1 : 0)
