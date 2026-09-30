// 「形象图四个槽 + 卡片/背景两个角色」这块的静态尺子（不联网、不开模拟器）。
// 跑法：node docs/工具/验-形象四槽.js
//
// 为什么用替身把 poster.js 真跑一遍而不是只 grep：这一块的规则全是"两个来源不许漂"
// 那一类——老账号升上来要跟他今天看到的一样、角色单选、删掉不补位、第一张自动接角色。
// 光看代码文本，把 readProfile 换成 posterProfile 这种改动是看不出来的，
// 而它的症状是"十个模板统统不画头像，一声不响"。
// 所以这里给 wx 装一套内存替身，把 utils/poster.js 真调用一遍。
const path = require('path')
const fs = require('fs')

const MP = path.resolve(__dirname, '../../miniprogram')

// ---------------- wx 替身 ----------------
const store = {}
const disk = new Set()
let copies = 0

global.wx = {
  env: { USER_DATA_PATH: '/tmp/fake-user' },
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)) },
  getFileSystemManager: () => ({
    accessSync: (p) => {
      if (!disk.has(p)) throw new Error('no such file')
    },
    unlinkSync: (p) => { disk.delete(p) },
    copyFile: (o) => { disk.add(o.destPath); copies += 1; o.success() },
  }),
}
// poster.js 里 readProfile 认的是 PROFILE_KEY，取出来先看它叫什么
const poster = require(path.join(MP, 'utils/poster.js'))
const PROFILE_KEY = poster.PROFILE_KEY

function putFile(name) {
  const p = `/tmp/fake-user/${name}`
  disk.add(p)
  return p
}
// 摆一个"storage 里长这样、本机有这几张文件"的现场。
// files 一定要在 seed 里加回 disk：以前是先把文件 putFile 出来、再 seed，而 seed 清了
// disk，于是"老账号那张"当场蒸发，测出来的是文件丢失那一支，不是升级那一支。
function seed(profile, files) {
  Object.keys(store).forEach((k) => delete store[k])
  disk.clear()
  copies = 0
  store[PROFILE_KEY] = profile || {}
  const list = files || []
  list.forEach((p) => disk.add(p))
  if (list.length) store[poster.AVATAR_FILES_KEY || 'poster_avatar_files'] = list.slice()
}

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------------- ① 全新账号 ----------------
{
  seed()
  const s = poster.readSlots()
  ck('全新账号读出来就是四个空位（界面画四枚虚线 ➕）', s.length === 4 && s.every((x) => !x), JSON.stringify(s))
  ck('全新账号没有卡片头像 → 海报走无头像那一支', poster.cardPath() === '')
  ck('全新账号没人勾背景 → 首页落回包里那张默认图',
    poster.homeBg() === '/assets/home-bg-portrait.jpg', poster.homeBg())
}

// ---------------- ② 老版本升上来 ----------------
{
  const old = putFile('legacy.img')
  seed({ avatarPath: old, name: '平安喜乐' }, [old])
  const s = poster.readSlots()
  ck('老账号只有一张 avatarPath：升上来自动当第 1 格', !!s[0] && s[0].path === old, JSON.stringify(s[0]))
  ck('升上来那张同时勾着两个角色（跟他今天的表现一模一样）',
    s[0].card === true && s[0].bg === true, JSON.stringify(s[0]))
  ck('升级后 homeBg 还是那张 —— 首页不会跳成默认图', poster.homeBg() === old)
  ck('升级后卡片头像还是那张 —— 海报不会突然没头像', poster.cardPath() === old)
}

// ---------------- ③ 文件被系统清掉 ----------------
{
  const gone = '/tmp/fake-user/deleted.img'
  seed({ avatarPath: gone }, [])
  ck('storage 里记着但文件没了：那一格当空的，不画半截图', poster.readSlots().every((x) => !x))
  ck('文件没了 → 首页落回默认、卡片没头像（不会引用一个不存在的文件）',
    poster.homeBg() === '/assets/home-bg-portrait.jpg' && poster.cardPath() === '')
}

// ---------------- ④ 落盘形状与文件回收 ----------------
{
  const a = putFile('a.img'), b = putFile('b.img')
  seed({ images: [{ path: a, card: true, bg: true }, null, null, null] }, [a, b])
  poster.writeSlots([{ path: a, card: false, bg: true }, { path: b, card: true, bg: false }, null, null])
  const p = poster.readProfile()
  ck('写完之后 storage 里 images 是四项', Array.isArray(p.images) && p.images.length === 4, JSON.stringify(p.images))
  ck('avatarPath 那一栏一并清空：留着它就是第二条真相来源', p.avatarPath === '', JSON.stringify(p.avatarPath))
  ck('两个角色各自落到不同的张上',
    p.images[0].bg && !p.images[0].card && p.images[1].card && !p.images[1].bg)
  poster.writeSlots([null, p.images[1], null, null])
  ck('删掉一格之后，那个文件真的从本机收掉了', !disk.has(a), `[${[...disk].join(',')}]`)
  ck('还在用的那张不会被顺手删掉', disk.has(b))
}

// ---------------- ⑤ 角色单选、不改传入 ----------------
{
  const a = putFile('1.img'), b = putFile('2.img'), c = putFile('3.img')
  seed({ images: [{ path: a, card: true, bg: true }, { path: b, card: false, bg: false }, { path: c }] }, [a, b, c])
  const before = poster.readSlots()
  const after = poster.takeRole(before, 1, 'card')
  ck('点亮第 2 格的「卡片」，第 1 格那枚自己灭掉', after[0].card === false && after[1].card === true,
    JSON.stringify(after.map((s) => s && s.card)))
  ck('「背景」不受牵连，还在第 1 格上', after[0].bg === true && after[1].bg === false)
  ck('takeRole 不改传入的那份（页面 setData 要靠新数组触发）',
    before[0].card === true && before[1].card === false)
  const third = poster.takeRole(after, 2, 'bg')
  ck('第 3 格勾「背景」，第 1 格那枚灭掉', third[0].bg === false && third[2].bg === true)
}

// ---------------- ⑥ 第一张自动接角色，第二张不抢 ----------------
{
  seed()
  const a = putFile('f1.img')
  let s = poster.placeSlot(poster.readSlots(), 0, a)
  ck('放第一张：两个位置都空着，它自动接住（等于老行为）',
    s[0].card === true && s[0].bg === true, JSON.stringify(s[0]))
  const b = putFile('f2.img')
  s = poster.placeSlot(s, 1, b)
  ck('放第二张：不抢任何角色，等他自己在图上勾',
    s[1].card === false && s[1].bg === false, JSON.stringify(s[1]))
  ck('第一张仍然是两个位置的主人', s[0].card === true && s[0].bg === true)
}

// ---------------- ⑦ 删掉不补位 ----------------
{
  const a = putFile('p1.img'), b = putFile('p2.img')
  seed({ images: [{ path: a, card: true, bg: true }, { path: b, card: false, bg: false }] }, [a, b])
  const next = [null, { path: b, card: false, bg: false }]
  poster.writeSlots(next)
  ck('删掉唯一那张之后，「卡片」位空着 —— 不会自动挪给还留着的那张', poster.cardPath() === '')
  ck('「背景」位同理：首页落回默认图，不自动接管',
    poster.homeBg() === '/assets/home-bg-portrait.jpg')
}

// ---------------- ⑧ 上限就是四个位置 ----------------
{
  const f = ['x1', 'x2', 'x3', 'x4', 'x5'].map(putFile)
  seed({ images: f.map((p) => ({ path: p, card: false, bg: false })) }, f)
  ck('塞五个也只留四个（界面上根本没有第五个可点的地方）', poster.readSlots().length === 4)
  ck('SLOT_COUNT 就是 4，跟界面那四枚圆一一对应', poster.SLOT_COUNT === 4)
}

// ---------------- ⑨ 头像来源只有一条路 ----------------
{
  const a = putFile('s1.img'), b = putFile('s2.img')
  seed({ images: [{ path: a, card: false, bg: true }, { path: b, card: true, bg: false }] }, [a, b])
  ck('首页背景取勾「背景」那张、卡片头像取勾「卡片」那张（两张可以不同）',
    poster.homeBg() === b || poster.homeBg() === a ? poster.homeBg() === a && poster.cardPath() === b : false,
    `bg=${poster.homeBg()} card=${poster.cardPath()}`)
  const pp = poster.posterProfile()
  ck('posterProfile 现算 avatarPath —— 画海报拿的是它，不是裸 readProfile',
    pp.avatarPath === b, JSON.stringify(pp.avatarPath))
  ck('裸 readProfile 里那一栏是空的（所以谁误用它，尺子当场红）',
    poster.readProfile().avatarPath === '' || poster.readProfile().avatarPath === undefined)
}

// ---------------- ⑩ 页面接线与文案 ----------------
{
  const wxml = fs.readFileSync(path.join(MP, 'pages/profile/profile.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(MP, 'pages/profile/profile.wxss'), 'utf8')
  const pageJs = fs.readFileSync(path.join(MP, 'pages/profile/profile.js'), 'utf8')
  const i18n = fs.readFileSync(path.join(MP, 'utils/i18n.js'), 'utf8')

  ck('界面是四个槽 wx:for 出来的，不是手写四份', /wx:for="\{\{slots\}\}"/.test(wxml))
  ck('空槽点它选图、满槽点它不动（onTapSlot 里判 item）',
    /catchtap="onTapSlot"/.test(wxml) && /if \(!\(i >= 0\) \|\| this\.data\.slots\[i]\) return/.test(pageJs))
  ck('两枚开关在图上，各自带 role', /data-role="card"[\s\S]*data-role="bg"/.test(wxml))
  ck('垃圾桶是独立一枚、走二次确认', /catchtap="onDropSlot"/.test(wxml) && /wx\.showModal\(\{[\s\S]{0,200}slotDropTitle/.test(pageJs))
  ck('「换一张」「去掉」两行文字链接已经撤干净',
    !/avatarChange|avatarDrop|avatarPick|avatarHint/.test(wxml + i18n))
  ck('芯片字号用现网最底一档 --fs-micro（他要的"按钮字体可以小点"）',
    /\.chip\s*\{[^}]*font-size:\s*var\(--fs-micro\)/.test(wxss))
  ck('四个槽是 2×2：一行放不下两字芯片，所以换行', /\.slots\s*\{[^}]*flex-wrap:\s*wrap/.test(wxss))
  const keys = ['slotCard', 'slotBg', 'slotHint', 'slotHintFull', 'slotDropTitle', 'slotDropOk', 'slotDropBody', 'slotDropWasCard', 'slotDropWasBg']
  keys.forEach((k) => {
    const n = (i18n.match(new RegExp(`\\b${k}:`, 'g')) || []).length
    ck(`新串 ${k} 中英文各一份`, n === 2, `出现 ${n} 次`)
  })
  // 真机上 showModal 的按钮只收 4 个字（替身不校验，这里当场量）
  // 真机上 showModal 只给按钮定了 4 字上限（替身不校验），标题没有这条，
  // 现网那两枚标题本来就比 7 个字长，所以这里只量按钮。
  const { texts } = require(path.join(MP, 'utils/i18n.js'))
  ;['zh', 'en'].forEach((lang) => {
    const tx = texts(lang)
    ck(`${lang} 确认按钮「${tx.slotDropOk}」不超 4 字`, tx.slotDropOk.length <= 4, `${tx.slotDropOk.length} 个字符`)
    ck(`${lang} 取消按钮复用现网那一枚，不超 4 字`, tx.cancel.length <= 4, `${tx.cancel} ${tx.cancel.length} 个字符`)
  })
  ck('取消那枚吃的是现网 cancel，没另造串', /cancelText: t\('cancel', lang\)/.test(pageJs))
}

console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
process.exitCode = bad.length ? 1 : 0
