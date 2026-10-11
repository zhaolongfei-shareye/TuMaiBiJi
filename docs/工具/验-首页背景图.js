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
/* 原来这一条是「体积没吃主包（<150KB）」——那个 150KB 是**我自己拍的**，他没下过，
   10-11 R16 他把默认图换成 1280×1280／314,793 B 那张，这一条当天就红了。
   红的是我那道没主的门槛，不是包出问题：微信的硬线是**主包 2MB**，构建后实测 939,606 B（917.6KB）＝上限的 44.8%。
   所以这一格改成钉真正有主的那条线：拿整个 miniprogram 目录的字节总和当上界代理
   （构建会剥掉注释与空白，所以目录数一定 ≥ 包数，用它判偏保守），预算＝上限的八成，
   留那两成给下一张图与后面的代码。目录再涨过 1.6MB 才红，红法是把两个数都打出来。 */
const MAIN_LIMIT = 2 * 1024 * 1024
const dirBytes = (() => {
  let sum = 0
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name !== '.DS_Store') sum += fs.statSync(p).size
  })
  walk(MP)
  return sum
})()
ck(`默认图字节数只报数不判（他 10-11 换的这张 ${st ? (st.size / 1024).toFixed(1) : '—'}KB，判的是下面那条主包线）`,
  !!st, st && `${(st.size / 1024).toFixed(1)} KB`)
ck(`主包字节总和没越过 2MB 上限的八成（现 ${dirBytes}／预算 ${Math.round(MAIN_LIMIT * 0.8)}）`,
  dirBytes < MAIN_LIMIT * 0.8, `${(dirBytes / 1024 / 1024).toFixed(2)}MB ＝ 上限的 ${(dirBytes / MAIN_LIMIT * 100).toFixed(1)}%`)

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
ck('取图函数导出了', typeof poster.homeBg === 'function')
// 09-30 站长把外观设置里那一节整块撤了：这一屏不再有"用/不用"这个状态，
// 缩略图那个别名函数也一并删了——首页和外观设置只剩同一个出口，不会再有第二份口径。
ck('开关那两个函数已经从导出里拿掉',
  poster.homeBgOn === undefined && poster.setHomeBgOff === undefined)
ck('缩略图别名也已经删掉，只剩 homeBg 这一个出口', poster.homeBgImage === undefined)

const mine = '/usrdata/poster-avatar-1-1.img'
files.add(mine)
poster.writeProfile({ avatarPath: mine })
ck('设过形象就用用户那张', poster.homeBg() === mine, poster.homeBg())
ck('没有任何一条路径能取到空背景', poster.homeBg() !== '')

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
// 抬层那条规则整段捞出来比名单：原来只拿"从 title-row 起 120 字符内出现 z-index:2"这种
// 窗口写法，名单里加一行就会因为窗口不够长而红——那是尺子自己的毛病，不是回归。
// 10-09 站长拍甲：名单要含 `.home-swap`（那两句字原来跟照片一起被罩层压住，读不出来）。
const liftRule = /\.container\.has-bg \.title-row,[\s\S]{0,260}?\{[^}]*z-index:\s*2[^}]*\}/.exec(wxss)
ck('内容压在罩之上（名单三样：标题、那一行、录入条；日期行 10-10 撤了，展开态的 position 另有一条）',
  !!liftRule && ['title-row', 'home-swap', 'entry-wrap'].every((s) => liftRule[0].includes(s))
  && !/date-row/.test(liftRule[0]),
  liftRule ? liftRule[0].split('{')[0].replace(/\s+/g, ' ') : '(没捞到那条抬层规则)')
// 10-10 晚收起态那三块从 `.entry-wrap` 里搬出去自己定顶了，所以这一条改钉 `.home-blk`（裸 `.blk` 与 app.wxss 里那枚分类色方块撞了）。
// 钉的还是同一件事：**整组随视口高走，不许写成定值 rpx**——写死的话矮屏上组底会插进底栏，
// 高屏上又浮得太高。现在这道数落成 min(66.3%, 100vh−546rpx)：比例那一头是站长拍的那条线，
// 夹住那一头是"整组 394 ＋ 底栏 128 ＋ 最少留 24"，两头的机型都不撞。
ck('整组按视口比例下移（10-10 晚搬进 .home-blk，仍不许写死 rpx；min() 那刀兜矮屏）',
  /\.home-blk\s*\{[^}]*top:\s*66\.3%;/.test(wxss)
  && /\.home-blk\s*\{[^}]*top:\s*min\(66\.3%,\s*calc\(100vh - \d+rpx\)\)/.test(wxss)
  && !/\.home-blk\s*\{[^}]*bottom:\s*\d+rpx/.test(wxss)
  && !/\.entry-wrap\s*\{[^}]*margin-top:\s*\d+(vh|rpx|px)/.test(wxss),
  (/\.home-blk\s*\{[\s\S]{0,400}?\}/.exec(wxss) || ['(没读到 .blk)'])[0].replace(/\s+/g, ' ').slice(0, 120))
ck('展开时整块贴底（不再从顶上挂下来盖住照片）',
  /\.container\.entry-dock \.entry-(cards|wrap)\s*{[^}]*position:\s*fixed/.test(wxss))
ck('贴底挂在容器上（active 一翻就跟着翻）',
  /entry-dock/.test(read('pages/create/create.wxml')))
ck('没把本地图写成 wxss 的 background-image（那条微信不认）',
  !/background-image:\s*url\(['"]?\/(assets|images)\//.test(wxss))
ck('新建页每次进页重取图', cjs.includes('bgSrc: poster.homeBg()'))
// 10-01 晚：三页共用 app.applyNavForBand 这一个出口（判据是"铺没铺图"，
// 因为罩层顶部那档压完照片永远是深），没铺图时它整个不碰，主题色留给 applyTheme。
// 10-10 我一度给这条加过第二个参数（新建页翻亮底墨字），站长说没下过这条需求，撤回原样。
ck('铺图时导航条走共用出口', /app\.applyNavForBand\(this\.data\.bgSrc\)/.test(cjs))
ck('这一页不自己写 setNavigationBarColor（值只有一份）', !/setNavigationBarColor/.test(cjs))

// ---------- ④ 入口唯一 ----------
ck('外观设置里不出现选图接口', !/chooseMedia|chooseImage/.test(read('pages/wallpaper/wallpaper.js')))
// 外观设置这一页现在只管壁纸那一横条，背景图那一节整块没了
const wpJs = read('pages/wallpaper/wallpaper.js')
const wpWx = read('pages/wallpaper/wallpaper.wxml')
const wpCss = read('pages/wallpaper/wallpaper.wxss')
ck('外观设置里没有背景图那一节', !/onSetHomeBg|bg-cell|bgThumb|homeBgSection/.test(wpJs + wpWx))
ck('那一节的样式也没留下', !/\.bg-cell|\.bg-thumb|\.bg-plain/.test(wpCss))
ck('首页那枚「换背景」是导流、不弹相册',
  /goHomeBg\(\)[\s\S]{0,120}navigateTo[\s\S]{0,60}pages\/profile\/profile/.test(read('pages/create/create.js'))
  && !/chooseMedia/.test(wpJs))
ck('唯一的选图口还在卡片模板页', /wx\.chooseMedia/.test(read('pages/profile/profile.js')))
// 09-30 形象图改成四槽，「换一张/去掉」那两行字没了，那句说明重写进 slotHint。
// 口径没变：卡片模板页那页必须自己讲清"这张还会铺在首页"，两种语言都得讲。
ck('卡片模板页那句话提了首页背景', /「背景」铺在首页/.test(read('utils/i18n.js'))
  && /Home lays it behind the home page/.test(read('utils/i18n.js')))

// ---------- ⑤ 文案 ----------
const { texts } = require(path.join(MP, 'utils/i18n.js'))
const zh = texts('zh'), en = texts('en')
ck('中英文键数相等', Object.keys(zh).length === Object.keys(en).length,
  `${Object.keys(zh).length} / ${Object.keys(en).length}`)
ck('那一节的四条文案中英都撤干净了',
  ['homeBgSection', 'homeBgHint', 'homeBgUse', 'homeBgNone']
    .every((k) => !zh[k] && !en[k]))
ck('首页导流那枚的文案还在（中英各一份）', !!zh.homeBgSwap && !!en.homeBgSwap,
  `${zh.homeBgSwap} / ${en.homeBgSwap}`)

console.log(bad.length ? `\n${bad.length} 条没过：${bad.join('、')}` : '\n全过')
process.exit(bad.length ? 1 : 0)
