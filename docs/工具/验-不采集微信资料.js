// 绊线：微信账号信息（昵称、头像）——**不是禁令，是"要做时必须一起补齐"的那三件**。
//
// 口径是站长 10-08 拍的：「用前先告知、同意才读」（PRD §8.147）。今天代码里一个都没调，
// 所以这一把现在应当全绿；将来谁去接 `wx.getUserProfile` / `wx.chooseAvatar`，它会当场红。
// 红了不许把它改绿了事——必须同时补三件才允许转绿：
//   ① 界面上先有一句告知＋拿到同意，未同意不得调用（这一条要能在新页面上指出来）；
//   ② 后台《用户隐私保护指引》勾上「用户信息（微信昵称、头像）」，且与那一次提审同批；
//   ③ 小程序内《隐私》那一栏（pages/about/about.js 的 PRIVACY_ZH / PRIVACY_EN）补一句
//      "我们在什么场景读它、读了拿来干什么"，中英各一份。
// 为什么扫得动：这四个标识符只要真去调就一定出现在源码里，藏不住；而"承诺不采集"那种话
// 是纸面上的，纸面的东西要靠扫文件来对账（旧 PRD 里那条"不做的事"就是这么核的）。
// 跑法：node docs/工具/验-不采集微信资料.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../../miniprogram')
const EXT = ['.js', '.wxml']
// 这四个就是"读微信账号信息"的全部入口：两个旧接口、一个填写能力（wxml 属性）、
// 一个新接口。写成 [正则, 名字] 成对，反向探针与正扫吃同一份表，别两处各写一遍。
const HITS = [
  [/wx\.getUserProfile\s*\(/, 'wx.getUserProfile('],
  [/wx\.getUserInfo\s*\(/, 'wx.getUserInfo('],
  [/chooseAvatar/, 'chooseAvatar（接口或 open-type）'],
  [/type\s*=\s*["']nickname["']/, 'type="nickname"（昵称填写能力）'],
]

const files = []
;(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'miniprogram_npm') continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (EXT.includes(path.extname(name))) files.push(p)
  }
})(ROOT)

function scan(list) {
  const found = HITS.map(() => [])
  for (const f of list) {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      HITS.forEach(([re], k) => {
        if (re.test(line)) {
          const shown = f.startsWith(ROOT) ? path.relative(ROOT, f) : path.basename(f)
          found[k].push(`${shown}:${i + 1}  ${line.trim().slice(0, 90)}`)
        }
      })
    })
  }
  return found
}

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

console.log(`扫 ${files.length} 个文件（${ROOT} 下全部 .js/.wxml）`)
const got = scan(files)
HITS.forEach(([_, label], k) => {
  ck(`${label} 零命中`, got[k].length === 0, got[k].length ? got[k].slice(0, 4).join(' ／ ') : '')
})

// 自测探针：这把扫帚自己得是亮的——把四个标识符打进一份临时副本，必须各扫出一处，
// 且**把那四处原样印成红行**（下面这四行 ✗ 是故意的：它们证明尺子扫得动，不是产品红了）。
const probeDir = path.join(require('os').tmpdir(), `wxinfo-probe-${process.pid}`)
fs.mkdirSync(probeDir, { recursive: true })
try {
  fs.writeFileSync(path.join(probeDir, 'a.js'), 'Page({ onLoad() { wx.getUserProfile({ desc: "用于展示我的头像" }) } })\n')
  fs.writeFileSync(path.join(probeDir, 'b.js'), 'wx.getUserInfo({ success() {} })\n')
  fs.writeFileSync(path.join(probeDir, 'c.wxml'), '<button open-type="chooseAvatar">用头像</button>\n')
  fs.writeFileSync(path.join(probeDir, 'd.wxml'), '<input type="nickname" />\n')
  const probeFiles = fs.readdirSync(probeDir).map((n) => path.join(probeDir, n))
  const probe = scan(probeFiles)
  console.log('\n反向四例（这四行 ✗ 是探针，故意红；四行都出＝扫帚没钝）：')
  probe.forEach((list, k) => {
    const one = list.length === 1
    console.log(`✗ 探针第 ${k + 1} 例 ${HITS[k][1]} ${one ? '扫出 1 处' : '扫出 ' + list.length + ' 处（应为 1）'} → ${list.join(' ／ ')}`)
    if (!one) bad.push(`探针第 ${k + 1} 例`)
  })
} finally {
  for (const n of fs.readdirSync(probeDir)) fs.unlinkSync(path.join(probeDir, n))
  fs.rmdirSync(probeDir)
}

if (bad.length) {
  console.log('\n红了要补的那三件（缺一不可，别只把这把尺子改绿）：')
  console.log('  ① 界面先给一句告知＋取得同意，未同意不得调用；')
  console.log('  ② 后台《用户隐私保护指引》勾上「用户信息（微信昵称、头像）」，与那一次提审同批；')
  console.log('  ③ pages/about/about.js 的 PRIVACY_ZH / PRIVACY_EN 各补一句"什么场景读、读了干什么"。')
}
console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿（四例探针也都打得出）'}`)
process.exit(bad.length ? 1 : 0)
