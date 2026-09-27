// 首页背景图这一批的静态自证：不连模拟器也能跑的那部分。
// 管三件事：① 那张默认图真的在包里、没胖到吃主包；② 三档取图的语义（默认/用户形象/关掉）；
// ③ 入口唯一——换图只有「我的 → 卡片模板」那一个门，外观设置里只许有开关。
// 跑法：node docs/工具/验-首页背景图.js
const fs = require('fs')
const path = require('path')
const MP = path.resolve(__dirname, '../../miniprogram')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const read = (p) => fs.readFileSync(path.join(MP, p), 'utf8')

// ---------- ① 资源 ----------
const ASSET = 'assets/home-bg-portrait.jpg'
const st = fs.existsSync(path.join(MP, ASSET)) ? fs.statSync(path.join(MP, ASSET)) : null
ck('默认背景图在包里', !!st, ASSET)
ck('体积没吃主包（<150KB）', !!st && st.size < 150 * 1024, st ? `${(st.size / 1024).toFixed(1)} KB` : '没有文件')

// ---------- ② 取图语义：把 wx 桩出来，直接跑 poster.js 那三个函数 ----------
const files = new Set()
const store = {}
global.wx = {
  env: { USER_DATA_PATH: '/usrdata' },
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v },
  getFileSystemManager: () => ({
    accessSync: (p) => { if (!files.has(p)) throw new Error('ENOENT') },
    unlinkSync: () => {},
    writeFile: () => {},
  }),
}
const poster = require(path.join(MP, 'utils/poster.js'))
const DEFAULT_BG = '/assets/home-bg-portrait.jpg'

ck('没设形象时落回站长那张', poster.homeBg() === DEFAULT_BG, poster.homeBg() || '(空)')
ck('取图函数导出了', ['homeBg', 'homeBgOn', 'homeBgImage', 'setHomeBgOff']
  .every((k) => typeof poster[k] === 'function'))

const mine = '/usrdata/poster-avatar-1-1.img'
files.add(mine)
poster.writeProfile({ avatarPath: mine })
ck('设过形象就用用户那张', poster.homeBg() === mine, poster.homeBg())
poster.setHomeBgOff(true)
ck('关掉开关就没有背景', poster.homeBg() === '', poster.homeBg() || '(空)')
ck('关掉时缩略图仍画"会用哪张"', poster.homeBgImage() === mine, poster.homeBgImage())
ck('开关状态读得回来', poster.homeBgOn() === false)
poster.setHomeBgOff(false)
ck('再打开就回来了', poster.homeBg() === mine)

// 形象文件被系统清掉：不能出现"图没了、字色还翻着白"的半截状态
files.delete(mine)
ck('形象文件没了就落回默认，不空铺', poster.homeBg() === DEFAULT_BG, poster.homeBg() || '(空)')

// ---------- ③ 接线 ----------
const wxml = read('pages/create/create.wxml')
const wxss = read('pages/create/create.wxss')
const cjs = read('pages/create/create.js')
ck('新建页铺了 <image> 组件', /class="page-bg"[^>]*src="{{bgSrc}}"/.test(wxml) || /src="{{bgSrc}}"/.test(wxml))
ck('新建页有压暗罩', wxml.includes('page-scrim'))
ck('铺图时容器带 has-bg', wxml.includes("{{bgSrc ? 'has-bg' : ''}}"))
ck('图和罩都 fixed，跟着视口不跟着滚',
  /\.page-bg\s*{[^}]*position:\s*fixed/.test(wxss) && /\.page-scrim\s*{[^}]*position:\s*fixed/.test(wxss))
ck('铺图时三级字翻白', /\.container\.has-bg\s*{[^}]*--text-primary:\s*#f2efe9/.test(wxss))
ck('语言切换那条下划线也跟着翻白', /\.container\.has-bg\s*{[^}]*--accent:\s*#f2efe9/.test(wxss))
ck('内容压在罩之上', /\.container\.has-bg \.title-row,[\s\S]{0,80}?z-index:\s*2/.test(wxss))
ck('三块按视口比例下移（不是写死 rpx）', /\.container\.has-bg \.entry-cards\s*{[^}]*margin-top:\s*\d+vh/.test(wxss))
ck('展开卡时把留白让出来', /\.container\.bg-give-way \.entry-cards\s*{[^}]*margin-top:\s*0/.test(wxss))
ck('让位挂在容器上（active 一翻就跟着翻）',
  /bg-give-way/.test(read('pages/create/create.wxml')))
ck('没把本地图写成 wxss 的 background-image（那条微信不认）',
  !/background-image:\s*url\(['"]?\/(assets|images)\//.test(wxss))
ck('新建页每次进页重取图', cjs.includes('bgSrc: poster.homeBg()'))
ck('铺图时导航条刷成墨色', /setNavigationBarColor\(\{[^}]*#181a20/.test(cjs))
ck('没铺图时不碰导航条（主题色留给 applyTheme）',
  /if \(this\.data\.bgSrc\) \{\s*\n\s*wx\.setNavigationBarColor/.test(cjs))

// ---------- ④ 入口唯一 ----------
ck('外观设置里不出现选图接口', !/chooseMedia|chooseImage/.test(read('pages/wallpaper/wallpaper.js')))
ck('外观设置只有开关', /onSetHomeBg/.test(read('pages/wallpaper/wallpaper.js'))
  && /data-off="0"[\s\S]*data-off="1"/.test(read('pages/wallpaper/wallpaper.wxml')))
ck('开关那一格画的是 <image> 不是背景图', /<image class="bg-thumb" src="{{bgThumb}}"/.test(read('pages/wallpaper/wallpaper.wxml')))
ck('唯一的选图口还在卡片模板页', /wx\.chooseMedia/.test(read('pages/profile/profile.js')))
ck('卡片模板页那句话提了首页背景', /还会铺在首页当背景/.test(read('utils/i18n.js')))

// ---------- ⑤ 文案 ----------
const { texts } = require(path.join(MP, 'utils/i18n.js'))
const zh = texts('zh'), en = texts('en')
ck('中英文键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} / ${Object.keys(en).length}`)
ck('四段新文案中英都有',
  ['homeBgSection', 'homeBgHint', 'homeBgUse', 'homeBgNone'].every((k) => zh[k] && en[k]))
ck('提示语指的入口名字是真的',
  zh.homeBgHint.includes(zh.navProfile), `navProfile=${zh.navProfile}`)

console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
