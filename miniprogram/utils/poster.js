// 分享海报的绘制引擎。
//
// 为什么从 share.js 里搬出来：模板要长到好几套，而每套的结构不一样（有的整屏铺色、
// 有的白卡、有的只要一句大字）。如果继续用"一个模板一份画布代码"，加一套就得抄一遍
// 量高度的逻辑，改一处漏一处。所以这里定成两件事：模板只负责**产出图层列表**，
// 一个通用绘制器负责把图层落到画布上。坐标在产出阶段全部算完，落笔阶段不再换算法。
//
// 色只从 palette.js 出。头像、名称、slogan 全部来自本机 storage（见 readProfile），
// 服务器不存任何一张用户图片。
const { toneFor, mix, schemeFor, plateColors, withAlpha, lumOf } = require('./palette.js')
const { formatShortDate } = require('./date.js')
const { t } = require('./i18n.js')
// 配方的求值与步型解释器（纯逻辑，不认识任何色和字号），以及包内自带那几套配方（纯数据）。
// 方向是单向的：poster.js 认识这两份，它们不认识 poster.js。
const engine = require('./posterRecipe.js')
const RECIPES = require('./posterRecipes.js')
// 下发那一路的门槛比的是小程序版本号（`min_app_version`），这个号只有 appInfo 那一份出处。
// 配方 JSON 里那个 `min_version` 是解释器版本，两回事，别拿这一个去判那一个。
const { VERSION: APP_VERSION } = require('./appInfo.js')

const W = 750
const INK = '#23252C'
const BODY = '#3C4046'
const MUTED = '#9A9EA6'
const PAPER = '#FFFFFF'
// 下面三个是"结构色"，不参与分类配色：波普的描边与压底黑带、文艺的暖纸。
const HARD = '#12121A'
const WARM = '#FFF6E5'
// 递给微信图片面板的那张成品外圈留一档纯黑（站长 10-01 深夜：面板本身是全黑底，
// 卡片直边贴上去像被裁了一半；加一圈黑后看着就是一整块）。只在导出那一步用。
const MATTE = 40
// 实测模拟器里 serif / sans-serif / Georgia 三种量出来的宽度互不相同，说明真能解析出
// 衬线体；机型没有这个字族时会退回默认字体，属于可接受降级，不会报错。
const SERIF = 'serif'
const MONO = 'Courier New'

const PROFILE_KEY = 'poster_profile'

// 经典三款的纸色，站长 09-26 定："版式一格不动，只把分类蓝换成宣纸那一族"，两档都要。
// 走哪一档由分类色自己的明暗决定（见 paperOf）：
// A 纯宣——色带是旧宣纸的深一档，整套只有一枚朱印是饱和色；
// B 黛青——页面和卡仍是纸色，只有那条大色带换成低饱和的黛青，层次更清楚。
// plate 是色带上那枚方块的发色：浅带上必须比带子更深才看得见，暗带上才用白半透。
const PAPER_A = { bg: '#E4DCC7', ink: '#2E2B24', plate: '#D6C8A9', drop: '#D2C6A8', onDark: false }
const PAPER_B = { bg: '#55625C', ink: '#EEF0EB', plate: 'rgba(255,255,255,0.16)', drop: '#3E4A45', onDark: true }

function paperOf(categoryId) {
  // 分界取在五档分类色的中间（明度 137）：芥末黄、橙这两档偏亮走 A，
  // 宝蓝、草绿、紫和未分类那块墨偏暗走 B。这样换分类时纸的深浅还会跟着动，
  // 不至于经典三款全长成一张脸。
  return lumOf(toneFor(categoryId).bg) >= 137 ? PAPER_A : PAPER_B
}
const DEFAULT_TEMPLATE = 'card'
// 头像文件的统一前缀，名字每次挑都换一个（见 mintAvatar）。
// 之前是"暂存""正式"两个固定名字，1.4.0 真机报出：换第二张图预览还是第一张。
// 原因是路径字符串一模一样，而 <image> 组件和 canvas 的 createImage() 都按路径缓存位图。
const AVATAR_PREFIX = 'poster-avatar'
// 本机存过哪些头像文件（见 trackedAvatars）
const AVATAR_FILES_KEY = 'poster_avatar_files'
// 没设形象时人像位上的那个字。用品牌字而不是笔记标题的首字，见 glyphPlate 上方。
const BRAND_GLYPH = '麦'
// 饱和度混合模式下，这个颜色的饱和度正好是 0：用它压一层等于把下面的图去色。
const GRAY_ZERO_SAT = '#808080'

const TEMPLATES = [
  { id: 'card', label: '玉版宣', labelEn: 'Jade Paper', group: 'classic' },
  { id: 'quote', label: '摘句', labelEn: 'Verse Slip', group: 'classic' },
  { id: 'block', label: '叠翠', labelEn: 'Layered Paper', group: 'classic' },
  { id: 'letter', label: '素宣信笺', labelEn: 'Vertical Letter', group: 'classic' },
  { id: 'popGrid', label: '波普分格', labelEn: 'Pop Panels', group: 'bold' },
  { id: 'popDots', label: '网点漫画', labelEn: 'Ben-Day Comic', group: 'bold' },
  { id: 'acid', label: '荧光渐变', labelEn: 'Acid Gradient', group: 'bold' },
  { id: 'cover', label: '杂志封面', labelEn: 'Magazine Cover', group: 'bold' },
  { id: 'lit', label: '纸间文艺', labelEn: 'Paper & Ink', group: 'bold' },
  { id: 'spec', label: '规格卡', labelEn: 'Spec Sheet', group: 'bold' },
]
const TEMPLATE_GROUPS = [
  { id: 'classic', label: '经典款', labelEn: 'Classic' },
  { id: 'bold', label: '个性款', labelEn: 'Expressive' },
]

// 海报出中英文两版，模板名也就得跟着语言走。
// 名字留在模板表里而不是 i18n 里：加一套模板只改一处，不会漏掉一半键值。
// 这里读的是合并后的那份（templateList），不是包内数组：下发那一行要是改了叫法，
// 界面得跟着改口——这正是"不走发版"那两个把手里的第二个（改文案不用发版，也不用清缓存）。
function templateLabel(id, lang) {
  const tpl = templateList().find((x) => x.id === id)
  if (!tpl) return ''
  return lang === 'en' ? tpl.labelEn || tpl.label : tpl.label
}

function groupName(id, lang) {
  const g = TEMPLATE_GROUPS.find((x) => x.id === id)
  if (!g) return ''
  return lang === 'en' ? g.labelEn || g.label : g.label
}

// ---------------------------------------------------------------- 本地形象

function readProfile() {
  const p = wx.getStorageSync(PROFILE_KEY)
  return p && typeof p === 'object' ? p : {}
}

function writeProfile(patch) {
  const next = Object.assign({}, readProfile(), patch)
  wx.setStorageSync(PROFILE_KEY, next)
  return next
}

function exists(p) {
  if (!p) return false
  try {
    wx.getFileSystemManager().accessSync(p)
    return true
  } catch (e) {
    return false
  }
}

// ---------- 四个槽的形象图（09-30 站长第二轮改的这块） ----------
// 以前这里只有一张：profile.avatarPath 一个字符串，它同时当卡片头像和首页背景，
// 所以换头像必然连首页一起换。现在四个槽，每槽 {path, card, bg}，两个角色各自单选——
// 「卡片」勾在哪张上，海报的头像就是那张；「背景」勾在哪张上，首页铺的就是那张。
// 允许同一张两个都勾（那就是老行为），也允许都不勾（见下面两个 *Path 的兜底）。
const SLOT_COUNT = 4

function blankSlots() {
  return [null, null, null, null]
}

// 读出来永远是四个位置：没放图的槽是 null，界面上就是那枚虚线 ➕ 圆。
// 老版本升上来（storage 里只有 avatarPath、没有 images）时，那张同时勾上两个角色，
// 行为跟他今天看到的一模一样，不需要他重设。
function readSlots() {
  const p = readProfile()
  let list
  if (Array.isArray(p.images)) {
    list = p.images.slice(0, SLOT_COUNT)
  } else if (p.avatarPath) {
    list = [{ path: p.avatarPath, card: true, bg: true }]
  } else {
    list = []
  }
  const out = blankSlots()
  list.forEach((s, i) => {
    // fileID 这一栏 2.1 起要跟着带出来：`profileCloud.pull()` 靠它判断"云上这一格与本机这张
    // 是同一张"，不带上就会每次开机重下一遍，而重下会覆盖掉本机那张正被画布用的文件。
    if (s && s.path && exists(s.path)) out[i] = { path: s.path, card: !!s.card, bg: !!s.bg, fileID: s.fileID || null }
  })
  return out
}

// 两个角色各自单选：点亮某张的「卡片」，别的张那枚自己灭掉。返回新数组，不改传入的那份。
function takeRole(slots, at, role) {
  return slots.map((s, i) => {
    if (!s) return s
    if (i === at) return Object.assign({}, s, { [role]: true })
    if (s[role]) return Object.assign({}, s, { [role]: false })
    return s
  })
}

/**
 * 把新挑的一张放进第 i 格。第一张自动接住两个角色：老版本升上来、或者全新账号放
 * 第一张时，看到的效果跟他今天一模一样（那张既当卡片头像又当首页背景）。
 * 从第二张起不再自动接——用户要的是"自己在图上勾"，自动抢会让勾选失去意义。
 */
function placeSlot(slots, at, path) {
  const next = slots.slice()
  const live = next.filter(Boolean)
  next[at] = { path, card: !live.some((s) => s.card), bg: !live.some((s) => s.bg) }
  return next
}

/**
 * 换掉第 at 格那一张：角色跟着这一格走，不重算。
 * 这条不能拿 placeSlot 顶——那个函数按"当前还有谁在当卡片"决定新这张要不要接住这个角色，
 * 而被换掉那张在算 live 时还在数组里，于是换一张就把「卡片」换没了：全仓没人当卡片，
 * 海报上的头像当场消失（node 里跑一遍就复现）。placeSlot 管的是"往空格放第一张"，
 * 那一趟 live 里没有这一格，自动接角色才是对的。
 */
function replaceSlot(slots, at, path) {
  const next = slots.slice()
  next[at] = Object.assign({}, next[at], { path })
  return next
}

function rolePath(slots, role) {
  const hit = slots.find((s) => s && s[role])
  return hit ? hit.path : ''
}

// 卡片头像取「卡片」那张；没人的时候回空——海报本来就有不画头像那一支
// （hasAvatar=false 时签名行不留头像位，杂志封面那套退成占位字「麦」）。
function cardPath() {
  return rolePath(readSlots(), 'card')
}

/**
 * 画海报、画小样之前要拿的那一份 profile。
 * 名称/一句话/模板直接来自 storage，但 avatarPath 这一栏必须现算成"勾了「卡片」的那一张"——
 * storage 里那一栏早就清空了（见 writeSlots），谁要是图省事把 readProfile() 直接传进
 * planPoster，hasAvatar 会永远是 false：十个模板统统不画头像，而且一声不响。
 */
function posterProfile() {
  return Object.assign({}, readProfile(), { avatarPath: cardPath() })
}

/**
 * 首页与笔记页头部铺的那张：取勾了「背景」的那张，没人勾就用包里这张默认。
 * 站长那张默认图是包内资源。放这儿而不是写进 wxss：WXSS 的 background-image
 * 不认小程序包里的本地文件（只认 base64 和网络地址），只能由 <image> 组件铺。
 * 槽里的文件被系统清掉时 readSlots 已经把那一格当空的，所以这里自然落回默认那张，
 * 不会出现"背景没了、字色还留着翻白"的半截状态。
 */
const HOME_BG_DEFAULT = '/assets/home-bg-portrait.jpg'

function homeBg() {
  return rolePath(readSlots(), 'bg') || HOME_BG_DEFAULT
}

/* 头部那一段 542 的图怎么摆——首页与「我的」页必须同一套数，否则同一个人在两页
   一个是大特写、一个是半身（站长 10-01 真机对出来打回的）。
   aspectFill 只会把画面正中间那一条留在框里，人像照的中段是胸口和手，脸会被裁掉。
   所以先按宽铺满算出图的真实高度，再把"超出盒子的那截余量"按 15% 分给上面——
   也就是留 15% 的头顶空间。读不到图尺寸时返回空串，落回 aspectFill 的默认居中。
   boxH 默认就是头部那一段 542；首页详情窗那一态要把同一张图铺满整屏（站长 10-03：
   "形象图贯穿，与其他页面保持风格统一"），所以盒子高由调用方递进来，
   算法和锚点仍是这一套，不分第二条公式。 */
const BAND_H = 542
const BG_ANCHOR = 0.15
function bandGeom(w, h, boxH = BAND_H) {
  if (!w || !h) return ''
  const byWidth = (750 * h) / w
  if (byWidth >= boxH) {
    const top = -Math.round((byWidth - boxH) * BG_ANCHOR)
    return `width:750rpx;height:${Math.round(byWidth)}rpx;left:0;top:${top}rpx`
  }
  const bw = Math.round((boxH * w) / h)
  return `width:${bw}rpx;height:${boxH}rpx;left:${Math.round((750 - bw) / 2)}rpx;top:0`
}

let avatarSeq = 0

function avatarFilePath() {
  avatarSeq += 1
  // 毫秒 + 本进程内的序号：同一毫秒连点两次也不会撞名，进程重启后时间戳接着错开。
  return `${wx.env.USER_DATA_PATH}/${AVATAR_PREFIX}-${Date.now()}-${avatarSeq}.img`
}

function unlinkFile(p) {
  if (!p) return
  try {
    wx.getFileSystemManager().unlinkSync(p)
  } catch (e) {
    // 要删的本就不在（头一回存、或已被系统清掉），不是错误
  }
}

// 本机存过的头像文件，路径记在这里。名字改成一张一个之后，"这个目录里哪张是我存的"
// 就没法再从命名规则推出来了——清扫时只认这份名单，名单外的一个都不碰。
function trackedAvatars() {
  const v = wx.getStorageSync(AVATAR_FILES_KEY)
  return Array.isArray(v) ? v : []
}

function trackAvatar(p) {
  const all = trackedAvatars()
  if (all.indexOf(p) < 0) {
    all.push(p)
    wx.setStorageSync(AVATAR_FILES_KEY, all)
  }
}

function untrackAvatar(p) {
  const all = trackedAvatars()
  const i = all.indexOf(p)
  if (i >= 0) {
    all.splice(i, 1)
    wx.setStorageSync(AVATAR_FILES_KEY, all)
  }
}

function removeAvatar(p) {
  if (!p) return
  unlinkFile(p)
  untrackAvatar(p)
}

function copyTo(src, dest) {
  return new Promise((resolve, reject) => {
    // 参数名是 srcPath，不是 filePath——真机上写错的表现是 errno 1001
    // "parameter.srcPath should be String instead of Undefined"，
    // 而开发者工具的替身不校验这个，模拟器里一路都是绿的。
    wx.getFileSystemManager().copyFile({ srcPath: src, destPath: dest, success: () => resolve(dest), fail: reject })
  })
}

// 选完先存成一张带新名字的独立文件，再记进槽里。
// 文件名唯一，所以"同一张图被系统按路径缓存"那一坑不会再踩（见 AVATAR_PREFIX 上方）。
// 本地目录一共 10MB，所以这一页临时生成、最后没留下的那些张必须收掉——见 dropUncommitted。
let minted = []

// 从云上拉回来的那一张落成本机一份（2.1 那条 pull 用）。
// 名字仍走 avatarFilePath()：一张一个名，避开"同路径换内容、界面与画布仍是第一张"那一坑。
// 必须记进名单——`pruneAvatars` 只认这份名单，名单外的文件它一个都不碰，
// 不记就等于这台手机上永远清不掉它（本地目录只有 10MB）。
async function adoptLocal(srcPath) {
  const dest = avatarFilePath()
  try {
    await copyTo(srcPath, dest)
  } catch (e) {
    unlinkFile(dest)
    return null
  }
  trackAvatar(dest)
  return dest
}

// 挑回来的图先自己缩一档再落盘，目标宽度＝铺满一屏还留余量。
// 为什么不用 wx.chooseMedia 的 sizeType:['compressed'] 那一步替我们做：微信那档压缩是按
// 它自己的标准来的，竖图实测只给到 750 宽（站长模拟器里存下来的那张就是 750×1448）。
// 而头部那一段画的是 `width:750rpx`＝整屏宽，他真机屏宽 1116 物理像素——750 的源件被放大
// 1.49 倍，这就是"上传了精致的底图，看上去却被拉伸"的全部原因（宽高比没坏，是分辨率不够）。
// 1440 这一档覆盖到 3x 高密度机（1290/1440）；原图 4~6MB 只在临时目录过一下，落盘这份
// 实测 300~500KB，四个槽不到 2MB，仍在 10MB 配额里，比挑原图直接落盘安全得多。
const BG_TARGET_W = 1440

function shrinkForBand(tempPath) {
  return new Promise((resolve) => {
    // 先读尺寸，只有比目标宽才压：实测 wx.compressImage 会把窄图放大（10-04 模拟器里
    // 865 宽的源件给 compressedWidth:1440，回来的就是 1440 宽）。那一步只是把同一份
    // 信息摊大——多不出细节，还白占本机那 10MB 配额。
    wx.getImageInfo({
      src: tempPath,
      success: (info) => {
        if (!info || !info.width || info.width <= BG_TARGET_W) { resolve(tempPath); return }
        compress(tempPath).then(resolve)
      },
      // 读不出尺寸就按"不用压"处理：这一步是优化，不能把选图整个弄失败
      fail: () => resolve(tempPath),
    })
  })
}

function compress(tempPath) {
  return new Promise((resolve) => {
    wx.compressImage({
      src: tempPath,
      // quality 的官方范围是 0～100（"仅对 jpg 有效"），不是 0～1——写成 0.82 会按 100 档
      // 取到最低画质，反而更糊。
      quality: 82,
      // 只给宽，官方类型定义写明"若不填写 compressedHeight 则默认以 compressedWidth 为准等比缩放"
      compressedWidth: BG_TARGET_W,
      // 压不动就退回挑来的那一份：宁可大一点，也不因为一步优化把选图整个弄失败
      success: (res) => resolve((res && res.tempFilePath) || tempPath),
      fail: () => resolve(tempPath),
    })
  })
}

function mintAvatar(tempPath) {
  const dest = avatarFilePath()
  return shrinkForBand(tempPath)
    .then((src) => copyTo(src, dest))
    .then((p) => {
      trackAvatar(p)
      minted.push(p)
      return p
    })
}

// 把这一页的四个槽落进 storage，并删掉"这次不再被任何槽引用"的文件。
// 四槽这一块是即时生效的（点芯片、删图都当场落盘），不像名称/一句话那样等「保存」——
// 因为删除那一步有二次确认，确认完却还要等保存才真删，那句确认就是假话。
function writeSlots(slots) {
  const before = readSlots()
  // avatarPath 这一栏一并清成空串：留着它就是第二条真相来源，早晚跟 images 漂开
  writeProfile({ images: slots, avatarPath: '' })
  const live = readSlots().filter(Boolean).map((s) => s.path)
  before.filter(Boolean).map((s) => s.path)
    .filter((p) => live.indexOf(p) < 0)
    .forEach(removeAvatar)
  minted = minted.filter((p) => live.indexOf(p) >= 0)
}

// 这一页临时生成、但没被任何槽用上的那些张（挑完没点、或者当场又删了）收掉。
function dropUncommitted() {
  const live = readSlots().filter(Boolean).map((s) => s.path)
  minted.filter((p) => live.indexOf(p) < 0).forEach(removeAvatar)
  minted = minted.filter((p) => live.indexOf(p) >= 0)
}

// 名字不固定之后多了一种留垃圾的可能：选完图没存就被系统杀掉，那份临时文件在新进程里
// 已经没人认得，dropUncommitted 手里没有它的路径。开页时按名单扫一遍，除四个槽正在用的
// 那些张之外全收掉。
function pruneAvatars() {
  const keep = readSlots().filter(Boolean).map((s) => s.path).concat(minted)
  trackedAvatars()
    .filter((p) => keep.indexOf(p) < 0)
    .forEach(removeAvatar)
}

// ---------------------------------------------------------------- 图层

const L = {
  fill: (x, y, w, h, color) => ({ k: 'fill', x, y, w, h, color }),
  // dir: 'v'(默认，上→下) | 'h'(左→右)。stops 给了就按多段画，否则 c1→c2。
  grad: (x, y, w, h, c1, c2, o) => Object.assign({ k: 'grad', x, y, w, h, c1, c2 }, o || {}),
  // 径向：圆心 (x,y)，从内半径 r0 到外半径 r1，只在 box=[x,y,w,h] 里落笔。
  // 画"人像后面那圈光""渐变底的一团雾"用这个。
  radial: (x, y, r0, r1, c1, c2, box) => ({ k: 'radial', x, y, r0, r1, c1, c2, box }),
  rrect: (x, y, w, h, r, o) => Object.assign({ k: 'rrect', x, y, w, h, r }, o || {}),
  // y 是第一行基线，与 canvas 的 fillText 语义一致
  text: (o) => Object.assign({ k: 'text', lines: [], lh: 40, size: 28, weight: 'normal', color: INK, align: 'left' }, o),
  circle: (x, y, r, o) => Object.assign({ k: 'circle', x, y, r }, o || {}),
  // 两点线段（杂志封面那类细线、波普的斜切条）
  line: (x1, y1, x2, y2, w, color) => ({ k: 'line', x1, y1, x2, y2, w, color }),
  // 网点阵：波普/孔版印刷的质感来源。gap 是间距，r 是点半径，oddRowShift 让隔行错开。
  dots: (x, y, w, h, o) => Object.assign({ k: 'dots', x, y, w, h, gap: 30, r: 5, color: 'rgba(0,0,0,0.12)', oddRowShift: 0 }, o || {}),
  image: (key, x, y, w, h, o) => Object.assign({ k: 'image', key, x, y, w, h }, o || {}),
  avatar: (x, y, d, o) => Object.assign({ k: 'avatar', x, y, d, ring: 0 }, o || {}),
}

// 头像、二维码都要先解码成位图才能进画布。解码异常时 onload/onerror 可能一个都不
// 触发，所以带超时；返回 null 让海报少一块图继续出，而不是整张出不来。
function loadImage(canvas, src, timeoutMs) {
  if (!src) return Promise.resolve(null)
  return new Promise((done) => {
    const img = canvas.createImage()
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      done(ok ? { img, w: img.width, h: img.height } : null)
    }
    const timer = setTimeout(() => finish(false), timeoutMs || 4000)
    img.onload = () => finish(true)
    img.onerror = () => finish(false)
    img.src = src
  })
}

function ensureRoundRect(ctx) {
  // 部分基础库/机型没有 roundRect，直接调用会抛 TypeError 并让整张图出不来
  if (typeof ctx.roundRect === 'function') return
  ctx.roundRect = function (x, y, w, h, r) {
    const rad = Math.max(0, Math.min(typeof r === 'number' ? r : 0, w / 2, h / 2))
    this.beginPath()
    this.moveTo(x + rad, y)
    this.arcTo(x + w, y, x + w, y + h, rad)
    this.arcTo(x + w, y + h, x, y + h, rad)
    this.arcTo(x, y + h, x, y, rad)
    this.arcTo(x, y, x + w, y, rad)
    this.closePath()
    return this
  }
}

/**
 * 把整张画布裁成圆角，之后所有落笔都被这个形状挡住。
 * 真机上 `canvas type="2d"` 是原生层，CSS 的 border-radius 不吃（模拟器把它当 DOM 画，
 * 所以圆角在模拟器里"看着有"）——小样那一排的圆角只能画进位图，否则四个直角会戳到
 * 选中框的圆弧外面（站长 09-26 真机截图里就是这一条）。
 * cssW / cssR 用同一个单位（rpx）：位图里的半径 = cssR × 画布逻辑宽 ÷ cssW。
 */
function clipRounded(ctx, w, h, cssR, cssW) {
  ensureRoundRect(ctx)
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, (cssR * w) / cssW)
  ctx.clip()
}

// 一行的落笔。track（字距）是"高级感"里最便宜的一招，但 canvas 没有 letterSpacing，
// 只能逐字量宽往后推；整行的对齐要先把加过距的总宽算出来。
// stroke 是描边：先描后填，字就带一圈外发光式的边（波普贴纸那种）。
function drawLine(ctx, line, ly, y) {
  const align = ly.align || 'left'
  if (!ly.track) {
    ctx.textAlign = align
    if (ly.stroke) {
      ctx.lineJoin = 'round'
      ctx.lineWidth = ly.strokeWidth || 8
      ctx.strokeStyle = ly.stroke
      ctx.strokeText(line, ly.x, y)
    }
    ctx.fillText(line, ly.x, y)
    ctx.textAlign = 'left'
    return
  }
  const chars = Array.from(line)
  const widths = chars.map((c) => ctx.measureText(c).width)
  const total = widths.reduce((a, b) => a + b, 0) + ly.track * Math.max(0, chars.length - 1)
  let x = align === 'center' ? ly.x - total / 2 : align === 'right' ? ly.x - total : ly.x
  ctx.textAlign = 'left'
  if (ly.stroke) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = ly.strokeWidth || 8
    ctx.strokeStyle = ly.stroke
  }
  chars.forEach((c, i) => {
    if (ly.stroke) ctx.strokeText(c, x, y)
    ctx.fillText(c, x, y)
    x += widths[i] + ly.track
  })
}

// 一列竖排怎么落笔。三件事是横排那条做不到的，也不该让每个模板各写一遍：
// ① 中日韩逐字一格；
// ② 夹在中间的拉丁/数字整段转 90° 横躺——竖排里把 "2026" 拆成四个直立的字符号很难读，
//    转过去才是通行做法（英文标题整条也就是一个横躺的段）；
// ③ 开了 vpunct 的话，收束标点从格子正中挪到右上角，这才是信笺的样子：
//    标点留在正中时一列下来像漏了字。只挪位置不转字形——「。」本来就是圆的，
//    「，」挪到右上角之后和竖排逗号已经分不出来，转反而容易转出基线。
const V_PUNCT = /[，。、；：！？）》」』】〉、·…]/
// 中日韩字形从基线往上占多少字号。竖排里"这一格到哪里为止"要用它算：
// 每格的盒子是 [基线-0.88字高, 基线]，下一格的顶就是上一格的底，这样两格才不咬。
const V_ASC = 0.88

// 一列拆成"落笔单位"：中日韩和标点各占一格，拉丁/数字整段转 90° 之后占它自己的字宽。
// 分列（vcols）和落笔（drawVertColumn）必须共用这一份，否则列高预算和画出来的不是一回事。
function vertUnits(ctx, text, step) {
  const chars = Array.from(String(text == null ? '' : text))
  const out = []
  let i = 0
  while (i < chars.length) {
    if (CJK.test(chars[i]) || V_PUNCT.test(chars[i])) {
      out.push({ s: chars[i], adv: step })
      i += 1
      continue
    }
    let j = i
    while (j < chars.length && !CJK.test(chars[j]) && !V_PUNCT.test(chars[j])) j += 1
    const run = chars.slice(i, j).join('')
    out.push({ s: run, adv: Math.max(step, ctx.measureText(run).width) })
    i = j
  }
  return out
}

function drawVertColumn(ctx, line, cx, top, ly) {
  const step = ly.lh
  const size = ly.size || 28
  let cy = top
  for (const u of vertUnits(ctx, line, step)) {
    const solo = u.s.length === 1 && (CJK.test(u.s) || V_PUNCT.test(u.s))
    if (solo && V_PUNCT.test(u.s) && ly.vpunct) {
      ctx.fillText(u.s, cx + step * 0.26, cy - step * 0.24)
    } else if (solo) {
      ctx.fillText(u.s, cx, cy)
    } else {
      ctx.save()
      // 转 90° 之后：局部 +x 朝下、局部 -y（基线以上那半截字形）朝右。
      // 所以锚点 x 要往左收大半个字高才压在列心上，锚点 y 落在这一格盒子的顶。
      ctx.translate(cx - size * 0.44, cy - size * V_ASC + u.adv / 2)
      ctx.rotate(Math.PI / 2)
      ctx.fillText(u.s, 0, 0)
      ctx.restore()
    }
    cy += u.adv
  }
  return cy
}

function paintLayers(ctx, layers, images) {
  ensureRoundRect(ctx)
  for (const ly of layers) {
    switch (ly.k) {
      case 'fill':
        ctx.fillStyle = ly.color
        ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        break
      case 'grad': {
        const g = ly.dir === 'h'
          ? ctx.createLinearGradient(ly.x, ly.y, ly.x + ly.w, ly.y)
          : ctx.createLinearGradient(ly.x, ly.y, ly.x, ly.y + ly.h)
        if (ly.stops) ly.stops.forEach((s) => g.addColorStop(s.at, s.color))
        else {
          g.addColorStop(0, ly.c1)
          g.addColorStop(1, ly.c2)
        }
        ctx.fillStyle = g
        ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        break
      }
      case 'radial': {
        const g = ctx.createRadialGradient(ly.x, ly.y, Math.max(0, ly.r0), ly.x, ly.y, ly.r1)
        g.addColorStop(0, ly.c1)
        g.addColorStop(1, ly.c2)
        ctx.fillStyle = g
        ctx.fillRect(ly.box[0], ly.box[1], ly.box[2], ly.box[3])
        break
      }
      case 'rrect':
        if (ly.shadow) {
          ctx.shadowColor = ly.shadow
          ctx.shadowBlur = ly.shadowBlur || 30
          ctx.shadowOffsetY = ly.shadowY || 8
        }
        ctx.beginPath()
        ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
        if (ly.fill) {
          ctx.fillStyle = ly.fill
          ctx.fill()
        }
        if (ly.shadow) {
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.shadowOffsetY = 0
        }
        if (ly.stroke) {
          ctx.lineWidth = ly.strokeWidth || 2
          ctx.strokeStyle = ly.stroke
          ctx.stroke()
        }
        break
      case 'circle':
        ctx.beginPath()
        ctx.arc(ly.x, ly.y, ly.r, 0, Math.PI * 2)
        if (ly.fill) {
          ctx.fillStyle = ly.fill
          ctx.fill()
        }
        if (ly.stroke) {
          ctx.lineWidth = ly.strokeWidth || 2
          ctx.strokeStyle = ly.stroke
          ctx.stroke()
        }
        break
      case 'line':
        ctx.beginPath()
        ctx.moveTo(ly.x1, ly.y1)
        ctx.lineTo(ly.x2, ly.y2)
        ctx.lineWidth = ly.w
        ctx.strokeStyle = ly.color
        ctx.stroke()
        break
      case 'dots': {
        // 点数按面积走，设置页一格一张、十张同屏，所以超过上限就自动放大间距：
        // 网点是质感，不是分辨率，糊成一片比稀一点更难看。
        let step = Math.max(12, ly.gap)
        while ((ly.w / step) * (ly.h / step) > 1500) step += 4
        ctx.save()
        ctx.beginPath()
        ctx.rect(ly.x, ly.y, ly.w, ly.h)
        ctx.clip()
        ctx.fillStyle = ly.color
        let row = 0
        for (let yy = ly.y + step / 2; yy <= ly.y + ly.h; yy += step, row++) {
          const off = row % 2 ? ly.oddRowShift : 0
          for (let xx = ly.x + step / 2 + off; xx <= ly.x + ly.w; xx += step) {
            ctx.beginPath()
            ctx.arc(xx, yy, ly.r, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
        break
      }
      case 'text': {
        ctx.font = `${ly.weight === 'bold' ? 'bold ' : ''}${ly.size}px ${ly.fam || 'sans-serif'}`
        ctx.fillStyle = ly.color
        if (ly.alpha != null) ctx.globalAlpha = ly.alpha
        if (ly.vert) {
          // 竖排：从右往左一列一列走（中文的传统读序），每列从上往下逐字落笔。
          // 文艺/杂志那类版式没有竖排就立不住，而横排堆字做不到。
          ly.lines.forEach((line, col) => {
            const cx = ly.x - col * (ly.lh + (ly.colGap || 0))
            ctx.textAlign = 'center'
            drawVertColumn(ctx, String(line), cx, ly.y, ly)
            ctx.textAlign = 'left'
          })
        } else {
          let y = ly.y
          for (const line of ly.lines) {
            drawLine(ctx, line, ly, y)
            y += ly.lh
          }
        }
        if (ly.alpha != null) ctx.globalAlpha = 1
        break
      }
      case 'image': {
        const im = images && images[ly.key]
        if (!im || !im.img) {
          // 设置页的小样里没有真小程序码，留一块浅底占位，预览才和成品对得上
          if (ly.placeholder) {
            ctx.fillStyle = ly.placeholder
            if (ly.r) {
              ctx.beginPath()
              ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
              ctx.fill()
            } else {
              ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
            }
          }
          break
        }
        ctx.save()
        ctx.beginPath()
        if (ly.clipCircle) ctx.arc(ly.x + ly.w / 2, ly.y + ly.h / 2, Math.min(ly.w, ly.h) / 2, 0, Math.PI * 2)
        else if (ly.r) ctx.roundRect(ly.x, ly.y, ly.w, ly.h, ly.r)
        else ctx.rect(ly.x, ly.y, ly.w, ly.h)
        ctx.clip()
        // 下面几样都在同一个裁剪区里做，所以只影响这张图，不会碰已画好的别的层。
        if (ly.gray) {
          // 第一道：filter。安卓和模拟器认，iOS 的 canvas 会静默忽略（站长 09-25 真机反馈
          // 波普四格仍是彩色），所以它只能当加速，不能当依据。
          ctx.filter = 'grayscale(1)'
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
          ctx.filter = 'none'
          // 第二道：拿"饱和度=0"的灰再压一遍，把颜色真正抽掉、亮度留着。
          // 已经是灰的图再走这一步不变，所以两道一起用是幂等的。
          // 不支持 saturation 的机型赋值会被静默忽略，那时填下去就是一块实心灰，
          // 所以先把值读回来确认这一步真的被接住了才敢填。
          ctx.globalCompositeOperation = 'saturation'
          if (ctx.globalCompositeOperation === 'saturation') {
            ctx.fillStyle = GRAY_ZERO_SAT
            ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
          }
          ctx.globalCompositeOperation = 'source-over'
        } else {
          drawCover(ctx, im, ly.x, ly.y, ly.w, ly.h)
        }
        if (ly.tint) {
          ctx.fillStyle = ly.tint
          ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        }
        if (ly.fadeFrom != null) {
          // destination-in + 一条由实到透的渐变 = 照片下半截融进底色，
          // 杂志封面那种"从画面里长出来"的效果靠这个，不需要模糊也不需要混合模式。
          ctx.globalCompositeOperation = 'destination-in'
          const g = ctx.createLinearGradient(ly.x, ly.y, ly.x, ly.y + ly.h)
          g.addColorStop(0, 'rgba(0,0,0,1)')
          g.addColorStop(Math.max(0.05, Math.min(0.95, ly.fadeFrom)), 'rgba(0,0,0,1)')
          g.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = g
          ctx.fillRect(ly.x, ly.y, ly.w, ly.h)
        }
        ctx.restore()
        break
      }
      case 'avatar': {
        const im = images && images.avatar
        const cx = ly.x + ly.d / 2
        const cy = ly.y + ly.d / 2
        if (im && im.img) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2, 0, Math.PI * 2)
          ctx.clip()
          drawCover(ctx, im, ly.x, ly.y, ly.d, ly.d)
          ctx.restore()
        } else {
          // 没设头像时留一个同色圆，署名行不至于缺一块就歪
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2, 0, Math.PI * 2)
          ctx.fillStyle = ly.fallback || 'rgba(255,255,255,0.22)'
          ctx.fill()
        }
        if (ly.ring) {
          ctx.beginPath()
          ctx.arc(cx, cy, ly.d / 2 + ly.ring / 2, 0, Math.PI * 2)
          ctx.lineWidth = ly.ring
          ctx.strokeStyle = ly.ringColor || PAPER
          ctx.stroke()
        }
        break
      }
      default:
        break
    }
  }
}

// 正方形原图塞进任意比例的块里会变形，所以等比放大到铺满、再居中裁。
function drawCover(ctx, im, x, y, w, h) {
  if (!im.w || !im.h) {
    ctx.drawImage(im.img, x, y, w, h)
    return
  }
  const scale = Math.max(w / im.w, h / im.h)
  const sw = w / scale
  const sh = h / scale
  ctx.drawImage(im.img, (im.w - sw) / 2, (im.h - sh) / 2, sw, sh, x, y, w, h)
}

// ---------------------------------------------------------------- 排版原语

// 断行单位：中日韩逐字，拉丁按词。
// 原来是一个字符一个字符地切，中文没问题，但英文会被从单词中间腰斩成
// "理 / 论"式的一地碎片——海报要出英文版，这一步必须按词。
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/
function units(text) {
  const s = String(text == null ? '' : text)
  const out = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (/\s/.test(ch)) {
      let j = i
      while (j < s.length && /\s/.test(s[j])) j++
      out.push(s.slice(i, j))
      i = j
    } else if (CJK.test(ch)) {
      out.push(ch)
      i += 1
    } else {
      let j = i
      while (j < s.length && !/\s/.test(s[j]) && !CJK.test(s[j])) j++
      out.push(s.slice(i, j))
      i = j
    }
  }
  return out
}

function wrap(ctx, text, maxW) {
  const us = units(text)
  const lines = []
  let cur = ''
  const push = (s) => {
    const t = s.replace(/\s+$/, '')
    if (t) lines.push(t)
  }
  for (const u of us) {
    if (ctx.measureText(cur + u).width > maxW && cur.trim()) {
      push(cur)
      cur = u.replace(/^\s+/, '')
      // 一个词比整行还长（长 URL、长英文术语）：只能硬切，切不断就整张海报少一行
      while (ctx.measureText(cur).width > maxW && cur.length > 1) {
        let k = 1
        while (k < cur.length && ctx.measureText(cur.slice(0, k + 1)).width <= maxW) k++
        lines.push(cur.slice(0, k))
        cur = cur.slice(k)
      }
    } else {
      cur += u
    }
  }
  if (cur.trim()) push(cur)
  return lines
}

function clip(ctx, text, maxW) {
  const s = String(text == null ? '' : text)
  if (ctx.measureText(s).width <= maxW) return s
  let out = s
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  // 英文截到半个词比截到半个字难看十倍：往回收到最后那个完整词
  const sp = out.lastIndexOf(' ')
  if (sp > out.length * 0.55) out = out.slice(0, sp)
  return out.trim() + '…'
}

// 取满 n 行，超出部分在最后一行加省略号
function fit(ctx, text, maxW, n) {
  const all = wrap(ctx, text, maxW)
  if (all.length <= n) return all
  const out = all.slice(0, n)
  out[n - 1] = clip(ctx, out[n - 1], maxW)
  return out
}

function font(ctx, size, bold, fam) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${fam || 'sans-serif'}`
}

// 带字距的文字要占多宽：字距只加在字与字之间，所以是 n-1 段。
// 不做这个的话，加了 tracking 的眉标会悄悄超出画布右边。
function trackW(ctx, text, track) {
  const s = String(text == null ? '' : text)
  const chars = Array.from(s)
  if (!track || chars.length < 2) return ctx.measureText(s).width
  return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + track * (chars.length - 1)
}

// 同上，但超出时按字距一起裁掉尾巴
function clipTrack(ctx, text, maxW, track) {
  const chars = Array.from(String(text == null ? '' : text))
  if (trackW(ctx, chars.join(''), track) <= maxW) return chars.join('')
  const out = []
  for (const c of chars) {
    if (trackW(ctx, out.concat([c, '…']).join(''), track) > maxW) break
    out.push(c)
  }
  return out.join('') + '…'
}

// 海报上"这条笔记属于哪儿"那行小字，和列表/详情同一条规则：第一个标签优先
function blockNameOf(note, lang) {
  const firstTag = (note.tags || []).map((x) => (x || '').trim()).find(Boolean) || ''
  return firstTag || note.category_name || (note.category_id == null ? t('noCategory', lang) : '')
}

function sourceLabelOf(note, lang) {
  const keys = {
    wechat_article: 'sourceWechatArticle',
    web_article: 'sourceWebArticle',
    screenshot: 'sourceScreenshot',
    manual: 'sourceManual',
  }
  const key = keys[note.source_type]
  return key ? t(key, lang) : note.source_type || ''
}

// 金句：要点第一条最像"值得转发的一句话"，没有就退到摘要首句，再退到标题
function quoteOf(note) {
  const kp = (note.key_points || []).map((x) => (x || '').trim()).find(Boolean)
  if (kp) return kp
  const sum = (note.summary || '').trim()
  if (sum) {
    const first = sum.split(/[。！？!?\n]/).map((s) => s.trim()).find((s) => s.length > 4)
    if (first) return first + '。'
  }
  return (note.title || '').trim()
}

// ---------------------------------------------------------------- 署名区
//
// 头像 + 名称 + slogan。三种模板共用一个排法，只是配色和位置不同。
// 返回图层和这一块占掉的总高度，让调用方接着往下排。

function signRow({ ctx, x, y, maxW, size, avatarD, onDark, profile, hasAvatar }) {
  const name = (profile.name || '').trim()
  const slogan = (profile.slogan || '').trim()
  if (!name && !slogan && !hasAvatar) return { layers: [], h: 0 }
  const layers = []
  const main = onDark ? PAPER : INK
  const sub = onDark ? 'rgba(255,255,255,0.72)' : MUTED
  if (hasAvatar) {
    layers.push(L.avatar(x, y, avatarD, {
      fallback: onDark ? 'rgba(255,255,255,0.22)' : 'rgba(35,37,44,0.08)',
    }))
  }
  const tx = hasAvatar ? x + avatarD + 22 : x
  const textW = Math.max(60, x + maxW - tx)
  const sSize = Math.round(size * 0.8)
  let textBottom = y
  if (name) {
    font(ctx, size, true)
    layers.push(L.text({ x: tx, y: y + size, lines: [clip(ctx, name, textW)], size, weight: 'bold', color: main }))
    textBottom = y + size
  }
  if (slogan) {
    font(ctx, sSize, false)
    const sy = name ? y + size + 16 + sSize : y + sSize
    layers.push(L.text({ x: tx, y: sy, lines: [clip(ctx, slogan, textW)], size: sSize, color: sub }))
    textBottom = sy
  }
  return { layers, h: Math.max(hasAvatar ? avatarD : 0, textBottom - y + 8) }
}

// ---------------------------------------------------------------- 模板

function planCard(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = paperOf(note.category_id)
  const cardX = 40
  const cardY = 60
  const pad = 44
  const radius = 44
  const block = 148
  const titleSize = 34
  const titleLH = 46
  const metaSize = 22
  const bodySize = 27
  const bodyLH = 40
  const pointSize = 26
  const pointLH = 42
  const qrSize = 120

  const cardW = W - cardX * 2
  const contentX = cardX + pad
  const contentW = cardW - pad * 2
  const titleX = contentX + block + 24
  const titleW = contentW - block - 24

  font(ctx, titleSize, true)
  const titleLines = fit(ctx, note.title || '', titleW, 3)
  const bandH = pad * 2 + Math.max(block, titleLines.length * titleLH)

  font(ctx, metaSize, true)
  const metaLine = clip(ctx, [sourceLabelOf(note, lang), (note.tags || []).join(' / ')].filter(Boolean).join(' · '), contentW)

  font(ctx, bodySize, false)
  const summaryLines = note.summary ? fit(ctx, note.summary, contentW, 4) : []

  font(ctx, pointSize, false)
  const points = (note.key_points || []).slice(0, 5).map((p) => clip(ctx, p, contentW - 50))

  const metaY = cardY + bandH + 56
  let bottom = metaY + 8
  let summaryTop = 0
  if (summaryLines.length) {
    summaryTop = bottom + 40
    bottom = summaryTop + (summaryLines.length - 1) * bodyLH + 8
  }
  let pointsTop = 0
  if (points.length) {
    pointsTop = bottom + 40
    bottom = pointsTop + 44 + (points.length - 1) * pointLH + 8
  }

  // 底行是一条带：署名靠左、码贴纸靠右下角，两者同一顶边（十套模板都是这一种收口，
  // 见 qrSticker 上方那段话）。所以署名那行的可用宽度要先把码的位置让出来。
  const signTop = bottom + 40
  const sign = signRow({ ctx, x: contentX, y: signTop, maxW: contentW - qrSize - 40, size: 28, avatarD: 76, profile, hasAvatar })
  const qrX = contentX + contentW - qrSize
  const cardBottom = signTop + Math.max(qrStickerH(qrSize), sign.h) + 24
  const height = cardBottom + cardY

  const layers = []
  layers.push(L.grad(0, 0, W, height, mix(tone.bg, '#ffffff', 0.08), mix(tone.bg, '#ffffff', 0.22)))
  layers.push(L.rrect(cardX, cardY, cardW, cardBottom - cardY, radius, { fill: PAPER, shadow: 'rgba(35, 37, 44, 0.10)' }))
  // 色带顶边要沿卡片的圆角切，底边是方的：先画一枚四角都圆的，再用一条方角矩形
  // 盖掉它下半截的圆角，就得到"上圆下方"。
  layers.push(L.rrect(cardX, cardY, cardW, bandH, radius, { fill: tone.bg }))
  layers.push(L.fill(cardX, cardY + radius, cardW, bandH - radius, tone.bg))
  layers.push(L.rrect(contentX, cardY + pad, block, block, 28, { fill: tone.plate }))

  font(ctx, 28, true)
  layers.push(L.text({
    x: contentX + 20, y: cardY + pad + 48, lines: [clip(ctx, blockNameOf(note, lang), block - 40)], size: 28, weight: 'bold', color: tone.ink,
  }))
  layers.push(L.text({
    x: contentX + 20, y: cardY + pad + block - 22, lines: [formatShortDate(note.created_at)], size: 17, weight: 'bold', color: tone.ink, alpha: 0.75,
  }))
  layers.push(L.text({
    x: titleX, y: cardY + pad + titleSize, lines: titleLines, lh: titleLH, size: titleSize, weight: 'bold', color: tone.ink,
  }))
  layers.push(L.text({ x: contentX, y: metaY, lines: [metaLine], size: metaSize, weight: 'bold', color: MUTED }))
  if (summaryLines.length) {
    layers.push(L.text({ x: contentX, y: summaryTop, lines: summaryLines, lh: bodyLH, size: bodySize, color: BODY }))
  }
  if (points.length) {
    layers.push(L.text({ x: contentX, y: pointsTop, lines: [t('keyPoints', lang)], size: metaSize, weight: 'bold', color: MUTED }))
    points.forEach((p, i) => {
      const py = pointsTop + 44 + i * pointLH
      layers.push(L.circle(contentX + 18, py - 9, 18, { fill: tone.bg }))
      layers.push(L.text({ x: contentX + 18, y: py - 2, lines: [String(i + 1)], size: 21, weight: 'bold', color: tone.ink, align: 'center' }))
      layers.push(L.text({ x: contentX + 50, y: py, lines: [p], size: pointSize, color: BODY }))
    })
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: qrX, y: signTop, size: qrSize, offset: tone.bg, ink: MUTED, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'card' }
}

function planQuote(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = paperOf(note.category_id)
  const cardX = 40
  const cardY = 60
  const pad = 52
  const cardW = W - cardX * 2
  const innerW = cardW - pad * 2
  const qrSize = 128

  font(ctx, 24, true)
  const kicker = clip(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), innerW)

  const qSize = 46
  const qLH = 68
  font(ctx, qSize, true)
  const quoteLines = fit(ctx, quoteOf(note), innerW, 5)

  const tSize = 26
  font(ctx, tSize, false)
  const titleLine = note.title ? [clip(ctx, note.title, innerW)] : []

  const kickerY = cardY + pad + 24
  const quoteTop = kickerY + 52
  const quoteBottom = quoteTop + (quoteLines.length - 1) * qLH + qSize
  let titleBottom = quoteBottom
  if (titleLine.length) titleBottom = quoteBottom + 40 + tSize
  const cardBottom = titleBottom + pad
  const cardH = cardBottom - cardY

  const signTop = cardBottom + 56
  const sign = signRow({ ctx, x: cardX + pad, y: signTop, maxW: innerW - qrSize - 40, size: 30, avatarD: 88, onDark: tone.onDark, profile, hasAvatar })
  const qrX = W - cardX - pad - qrSize
  const height = signTop + Math.max(qrStickerH(qrSize), sign.h) + 56

  const layers = []
  layers.push(L.fill(0, 0, W, height, tone.bg))
  layers.push(L.rrect(cardX, cardY, cardW, cardH, 48, { fill: PAPER }))
  // 眉标不能直接用分类色写字：芥末黄压白底只有 1.63 的对比度（palette.js 里那条），
  // 掺一半墨下去保住色相又能看清。
  layers.push(L.text({ x: cardX + pad, y: kickerY, lines: [kicker], size: 24, weight: 'bold', color: mix(tone.bg, INK, 0.55) }))
  layers.push(L.text({ x: cardX + pad, y: quoteTop + qSize, lines: quoteLines, lh: qLH, size: qSize, weight: 'bold', color: INK }))
  if (titleLine.length) {
    layers.push(L.text({ x: cardX + pad, y: quoteBottom + 40 + tSize, lines: titleLine, size: tSize, color: MUTED }))
  }
  layers.push(...sign.layers)
  // 底托用分类色调暗的那一档：这张的底色就是分类色，同色托等于没有。
  // 引导语直接坐在分类色上，所以用它自己配好的那个字色，不写死白。
  qrSticker({ layers, x: qrX, y: signTop, size: qrSize, offset: mix(tone.bg, INK, 0.28), ink: tone.ink, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'quote' }
}

function planBlock(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const tone = paperOf(note.category_id)
  const pad = 44
  const qrSize = 120
  const avatarD = 132
  const cardX = 40
  const cardW = W - cardX * 2
  const innerW = cardW - pad * 2

  font(ctx, 40, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 22, true)
  const metaLine = clip(ctx, [blockNameOf(note, lang), sourceLabelOf(note, lang)].filter(Boolean).join(' · '), W - pad * 2)

  const metaY = 92
  const titleTop = metaY + 52
  const titleBottom = titleTop + (titleLines.length - 1) * 54 + 40
  // 头像压在色块与白卡的那条边上，所以色块下沿留出一截，白卡再从下沿下方起
  const bandBottom = titleBottom + 96
  const cardTop = bandBottom + 40
  const contentTop = cardTop + (hasAvatar ? avatarD / 2 + 24 : pad)

  font(ctx, 27, false)
  const summaryLines = note.summary ? fit(ctx, note.summary, innerW, 4) : []
  font(ctx, 26, false)
  const points = (note.key_points || []).slice(0, 3).map((p) => clip(ctx, p, innerW - 46))

  let base = contentTop + 27
  const summaryY = summaryLines.length ? base : 0
  if (summaryLines.length) base += (summaryLines.length - 1) * 40 + 40
  const pointsY = points.length ? base + 8 : 0
  if (points.length) base = pointsY + 40 + (points.length - 1) * 42 + 26
  // 这块本来就在色块与白卡交界画了一枚大头像，署名行再带一枚就成两个自己了
  const sign = signRow({ ctx, x: cardX + pad, y: base + 36, maxW: innerW, size: 28, avatarD: 76, profile, hasAvatar: false })
  const cardBottom = (sign.h ? base + 36 + sign.h + 12 : base + 8) + pad
  const qrY = cardBottom + 44
  const height = qrY + qrStickerH(qrSize) + 24

  const layers = []
  layers.push(L.fill(0, 0, W, height, '#F5F4F0'))
  layers.push(L.fill(0, 0, W, bandBottom, tone.bg))
  layers.push(L.text({ x: pad, y: metaY, lines: [metaLine], size: 22, weight: 'bold', color: tone.ink, alpha: 0.8 }))
  layers.push(L.text({ x: pad, y: titleTop + 40, lines: titleLines, lh: 54, size: 40, weight: 'bold', color: tone.ink }))
  layers.push(L.rrect(cardX, cardTop, cardW, cardBottom - cardTop, 44, { fill: PAPER, shadow: 'rgba(35, 37, 44, 0.10)' }))
  if (hasAvatar) {
    layers.push(L.avatar((W - avatarD) / 2, bandBottom - avatarD / 2, avatarD, { ring: 8, ringColor: PAPER }))
  }
  if (summaryLines.length) {
    layers.push(L.text({ x: cardX + pad, y: summaryY, lines: summaryLines, lh: 40, size: 27, color: BODY }))
  }
  if (points.length) {
    points.forEach((p, i) => {
      const py = pointsY + i * 42
      layers.push(L.circle(cardX + pad + 16, py - 9, 16, { fill: tone.bg }))
      layers.push(L.text({ x: cardX + pad + 16, y: py - 2, lines: [String(i + 1)], size: 20, weight: 'bold', color: tone.ink, align: 'center' }))
      layers.push(L.text({ x: cardX + pad + 46, y: py, lines: [p], size: 26, color: BODY }))
    })
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: qrY, size: qrSize, offset: tone.bg, ink: MUTED, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'block' }
}

// 把一段文字切成竖排的列。预算单位是"占多长"而不是"几个字"：
// 拉丁段转 90° 之后吃的是它自己的字宽，"WAICFuture" 一段顶三格，按字数分列会一路捅穿署名带
// （模拟器实测过一次）。所以这里走 vertUnits，和落笔共用同一份数。
// 返回 {cols, advs}：advs 是每列实际走了多长，画布高度由它反推（信笺按内容定高，不留大空洞）。
function vcols(ctx, text, colH, step, maxCols) {
  const units = vertUnits(ctx, text, step)
  const pack = []
  let i = 0
  while (i < units.length && pack.length < maxCols) {
    const cur = { parts: [], used: 0 }
    while (i < units.length) {
      const u = units[i]
      // 列首不许站收束标点：宁可这一列多占一格（不超过一格），也不能让「，」顶在下一列最上面
      if (cur.used && cur.used + u.adv > colH && !(V_PUNCT.test(u.s) && cur.used + u.adv <= colH + step)) break
      cur.parts.push(u)
      cur.used += u.adv
      i += 1
    }
    pack.push(cur)
  }
  // 孤字不成列：最后一列只剩一个单位时从上一列挪一个下来（实测过：标题第二列孤零零一个"绍"，
  // 读着像漏字而不是排版）。只在上一列还留得住至少一个单位时挪。
  if (pack.length > 1 && pack[pack.length - 1].parts.length === 1 && pack[pack.length - 2].parts.length > 1) {
    const last = pack[pack.length - 1]
    const prev = pack[pack.length - 2]
    const u = prev.parts.pop()
    last.parts.unshift(u)
    prev.used -= u.adv
    last.used += u.adv
  }
  const cols = pack.map((c) => c.parts.map((u) => u.s).join(''))
  const advs = pack.map((c) => c.used)
  // 没吃完就补省略号；补不下就算了（宁可少个记号，也不能让它顶到列外）
  if (i < units.length && cols.length) {
    const n = cols.length - 1
    if (advs[n] + step <= colH) {
      cols[n] += '…'
      advs[n] += step
    }
  }
  return { cols, advs }
}

// 素宣信笺（竖排小楷）。站长 09-26 从三个变体里挑的是"无栏"这一版：一条栏线都不画，
// 只靠列与列之间的空、一枚引首章、一枚落款印撑住，左边空掉三分之一。
// 它顶掉的是原来那套「极简」——同为留白系，差异只剩线条和居中方式（他的原话是布局差异不大）。
//
// 列位统一走 60 的槽距（标题 46 字、正文 26 字都占同一个槽），标题和正文之间空一个槽，
// 那一格空档就是信笺里"段"的意思；列数从右往左排，标题最多两列，正文吃掉剩下的槽。
// 高度按内容走（和整套海报同一条规矩）：列区取"正文"和"款识+落款印"两路里更长的那条，
// 底下再接署名带。写死一张高纸的话，短笔记会空出下半张。
function planLetter(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('riso', note.category_id)
  const pad = 56
  const qrSize = 108
  const slot = 60
  const x0 = W - 100
  const slots = 7
  const top = 176
  const titleStep = 66
  const bodyStep = 40
  const kickStep = 32
  const SEAL = '#9E3B2F'
  const colH = 772
  const gap = 44

  font(ctx, 46, true, SERIF)
  const T = vcols(ctx, note.title, colH, titleStep, 2)
  const tN = T.cols.length
  font(ctx, 26, false, SERIF)
  const B = vcols(ctx, note.summary, colH, bodyStep, Math.max(1, slots - tN - (tN ? 1 : 0)))
  font(ctx, 20, false, SERIF)
  const kicker = [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · ').slice(0, 14)
  const kickAdv = kicker ? vertUnits(ctx, kicker, kickStep).reduce((a, u) => a + u.adv, 0) : 0
  const signH = Math.max(84, qrStickerH(qrSize))
  const colLen = Math.max(0, ...T.advs, ...B.advs)
  const height = Math.min(1360, top + Math.max(colLen, kicker ? kickAdv + 26 + 44 : 0) + gap + signH + 56)
  const signTop = height - 56 - signH

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  // 引首章：右上那枚只有朱地、不刻字，刻字留给落款那枚，两枚都响就闹了
  layers.push(L.rrect(x0 - 26, 52, 52, 52, 6, { fill: SEAL }))
  // 这一枚内框从来没能画出来：原来这里写的是 `{ line, lineWidth }`，而 paintLayers 的 rrect 只读
  // fill/stroke/strokeWidth，那两个键没人读，所以这一层落下去只有 beginPath+roundRect，一道线都没有。
  // 10-04 转配方时白名单把它拦下来了；撤掉那两个死键画面不变（前后绘制序列 67 步一字不差，实测）。
  // 要不要真给两枚印加一道白细框是设计的事，站长拍。
  layers.push(L.rrect(x0 - 20, 58, 40, 40, 4))
  if (tN) {
    // 槽距统一 60，所以列层的 colGap = 60 - 本层步距（标题 46 字那层是 -6）
    layers.push(L.text({
      x: x0, y: top, lines: T.cols, vert: true, lh: titleStep, colGap: slot - titleStep,
      size: 46, weight: 'bold', color: s.ink, fam: SERIF, vpunct: true,
    }))
  }
  if (B.cols.length) {
    layers.push(L.text({
      x: tN ? x0 - (tN + 1) * slot : x0, y: top, lines: B.cols, vert: true, lh: bodyStep, colGap: slot - bodyStep,
      size: 26, color: mix(s.ink, s.bg, 0.8), fam: SERIF, vpunct: true,
    }))
  }
  // 最左那一细列是款识：分类和日期，小字、淡色，读完正文回头才看得见
  const kickX = 120
  if (kicker) {
    layers.push(L.text({
      x: kickX, y: top, lines: [kicker], vert: true, lh: kickStep, size: 20,
      color: withAlpha(s.ink, 0.5), fam: SERIF, vpunct: true,
    }))
    const sealY = top + kickAdv + 26
    layers.push(L.rrect(kickX - 22, sealY, 44, 44, 5, { fill: SEAL }))
    font(ctx, 24, true, SERIF)
    layers.push(L.text({
      x: kickX, y: sealY + 33, lines: [BRAND_GLYPH], size: 24, weight: 'bold',
      color: PAPER, align: 'center', fam: SERIF,
    }))
  }
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 40, size: 30, avatarD: 84, profile, hasAvatar })
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'letter' }
}

// ---------------------------------------------------------------- 出跳款
//
// 上面四套全部跟着分类色走，安静克制，代价是"人人都一样、转发出去不显眼"。
// 这一批改的是情绪：波普、网点、荧光渐变、杂志封面、文艺、规格卡。
// 两条共同规矩：
// ① 色不再从分类借，而是从 palette.js 的 POSTER_SCHEMES 里按风格取一组，
//    同一条笔记在同一风格下取到哪一组是确定的（换分类才会换色）。
// ② 字号整体抬一档（56~82，原来最大 46）。社交平台上图是被缩着看的，
//    字小就等于没有。
// ③ 再加模板时高度不许超过 1360：安卓对单张画布的大小有上限，9:16（750×1334）
//    已经够竖版用，这批最高的一套是 1350。

// 码不当补丁：白贴纸 + 一块硬偏移的同色底托 + 一行小字。
// 硬偏移代替投影是这批模板统一的收口手法——投影在低分屏上会糊成脏影。
//
// 十套模板现在只有这一种摆法：右下角、引导语居中在码下方。以前那四套稳重的各画各的
// （居中一枚裸码、码靠左引导语坐在右边、干脆没有引导语），改一次要动四处，
// 而且四处互相不一样——站长 09-24 的口径是"统一码在右下方，其他补齐，否则维护起来麻烦"。
function qrSticker({ layers, x, y, size, offset, ink, label }) {
  const drop = Math.round(size * 0.09)
  const r = size * 0.18
  layers.push(L.rrect(x + drop, y + drop, size, size, r, { fill: offset }))
  layers.push(L.rrect(x, y, size, size, r, { fill: PAPER }))
  const padIn = Math.round(size * 0.09)
  layers.push(L.image('qr', x + padIn, y + padIn, size - padIn * 2, size - padIn * 2, { placeholder: '#EFEEE8' }))
  if (label) {
    layers.push(L.text({
      // 引导语跟着二维码本身居中：右对齐时它比那张码宽出一截，看上去就是挂歪的。
      x: x + size / 2, y: y + size + drop + 26, lines: [label], size: 18, color: ink, align: 'center',
    }))
  }
  return qrStickerH(size)
}

// 一枚码贴纸占多高（底托那截硬偏移 + 下面那行引导语）。布局得先知道高度才知道画布要多高，
// 所以这个数必须和 qrSticker 里那三行一起改。
function qrStickerH(size) {
  return size + Math.round(size * 0.09) + 34
}

// 没设形象时，人像位不能空着。占位字固定用品牌字「麦」，站长 09-24 定的：
// 原来取标题第一个字，设置页十个小样里有一片"把"（内置小样的标题以"把"开头），
// 看着像错字而不是设计。换色不换字，四格各转一次色，看着仍像一版印出来的。
function glyphPlate(ctx, { x, y, w, h, color }) {
  return L.text({
    x: x + w / 2, y: y + h / 2 + Math.round(h * 0.18), lines: [BRAND_GLYPH],
    size: Math.round(Math.min(w, h) * 0.72), weight: 'bold', color, align: 'center',
  })
}

// 底行给"署名 + 码贴纸"占多高。码贴纸带一行引导语，比署名块高，所以取两者的大。
function footH(qrSize) {
  return qrSize + 46
}

function planPopGrid(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('pop', note.category_id)
  const pad = 44
  const gut = 10
  const cellW = (W - gut) / 2
  const cellH = 296
  const gridH = cellH * 2 + gut
  const qrSize = 118
  const plates = plateColors(note.category_id)

  font(ctx, 58, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 24, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2, 2) : []
  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 3)

  const kickerY = gridH + 76
  const titleTop = kickerY + 34
  const titleBottom = titleTop + (titleLines.length - 1) * 70 + 58
  const sumTop = sumLines.length ? titleBottom + 26 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 36 + 24 : titleBottom
  const signTop = sumBottom + 44
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, onDark: true, profile, hasAvatar })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, HARD))
  plates.forEach((c, i) => {
    const x = (i % 2) * (cellW + gut)
    const y = Math.floor(i / 2) * (cellH + gut)
    layers.push(L.fill(x, y, cellW, cellH, c))
    layers.push(hasAvatar
      // 先转灰再压一层半透明的版色：四格是同一张脸的四次套印，不是四张不同的图
      ? L.image('avatar', x, y, cellW, cellH, { gray: true, tint: withAlpha(c, 0.62) })
      : glyphPlate(ctx, { x, y, w: cellW, h: cellH, color: withAlpha(HARD, 0.2) }))
  })
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.bg, track: 3 }))
  layers.push(L.text({ x: pad, y: titleTop + 58, lines: titleLines, lh: 70, size: 58, weight: 'bold', color: PAPER }))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 24, lines: sumLines, lh: 36, size: 24, color: 'rgba(255,255,255,0.7)' }))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: 'rgba(255,255,255,0.66)', label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'popGrid' }
}

function planPopDots(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('pop', note.category_id)
  const pad = 46
  const avatarD = 200
  const qrSize = 116
  const light = mix(s.bg, '#FFFFFF', 0.66)
  // 主墨不是纯黑：往 HARD 里渗一点这组的底色，描边和字就和画面是一版的。
  // 权重是 HARD 的占比——写反过一次，结果描边成了亮蓝，漫画的"黑框"就没了。
  const dark = mix(HARD, s.bg, 0.85)

  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), sourceLabelOf(note, lang)].filter(Boolean).join(' · '), W - pad * 2 - avatarD - 24, 2)
  font(ctx, 76, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 56, 3) : []
  font(ctx, 25, false)
  const points = (note.key_points || []).slice(0, 2).map((p) => clip(ctx, p, W - pad * 2 - 120))

  const kickerY = 100
  const titleTop = Math.max(kickerY + 60, avatarD + 56) + 76
  const titleBottom = titleTop + (titleLines.length - 1) * 88 + 76
  const cardTop = titleBottom + 40
  const cardH = 44 + (sumLines.length ? (sumLines.length - 1) * 40 + 34 + 22 : 0) + (points.length ? points.length * 44 : 0) + 20
  const signTop = cardTop + cardH + 44
  // 上面已经有一枚大头像了，署名行只留字：同一张脸上出现两次自己很难看
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, light))
  layers.push(L.dots(0, 0, W, cardTop - 20, { gap: 26, r: 4.5, color: s.dot, oddRowShift: 13 }))
  // 套印错位：同一句标题先按强调色往右下偏 9px 画一遍，再用主墨色压在原位画
  layers.push(L.text({ x: pad + 13, y: titleTop + 89, lines: titleLines, lh: 88, size: 76, weight: 'bold', color: s.accent }))
  layers.push(L.text({ x: pad, y: titleTop + 76, lines: titleLines, lh: 88, size: 76, weight: 'bold', color: dark }))
  layers.push(L.rrect(pad - 8, kickerY - 30, trackW(ctx, kicker, 2) + 32, 44, 22, { fill: s.accent }))
  layers.push(L.text({ x: pad + 8, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.accentInk, track: 2 }))
  if (hasAvatar) {
    layers.push(L.avatar(W - pad - avatarD, 40, avatarD, { ring: 10, ringColor: dark, fallback: withAlpha(dark, 0.16) }))
  } else {
    layers.push(glyphPlate(ctx, { x: W - pad - avatarD, y: 40, w: avatarD, h: avatarD, color: withAlpha(dark, 0.18) }))
  }
  const drop = 12
  layers.push(L.rrect(pad + drop, cardTop + drop, W - pad * 2, cardH, 28, { fill: withAlpha(dark, 0.9) }))
  layers.push(L.rrect(pad, cardTop, W - pad * 2, cardH, 28, { fill: PAPER, stroke: dark, strokeWidth: 4 }))
  let cy = cardTop + 44
  if (sumLines.length) {
    layers.push(L.text({ x: pad + 28, y: cy, lines: sumLines, lh: 40, size: 26, color: BODY }))
    cy += (sumLines.length - 1) * 40 + 56
  }
  points.forEach((p, i) => {
    // 序号点用白底：这组的底色本身就有浅的，蓝底压蓝字的"1"根本认不出来
    layers.push(L.circle(pad + 46, cy - 9, 18, { fill: PAPER, stroke: dark, strokeWidth: 3 }))
    layers.push(L.text({ x: pad + 46, y: cy - 2, lines: [String(i + 1)], size: 20, weight: 'bold', color: dark, align: 'center' }))
    layers.push(L.text({ x: pad + 78, y: cy, lines: [p], size: 25, color: INK }))
    cy += 44
  })
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: dark, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'popDots' }
}

function planAcid(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('neon', note.category_id)
  const pad = 48
  const avatarD = 380
  const qrSize = 118
  const topH = 540
  const pillGap = 84

  font(ctx, 22, true)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 4)
  font(ctx, 72, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 25, false)
  const points = (note.key_points || []).slice(0, 3).map((p) => clip(ctx, p, W - pad * 2 - 76))

  const avatarTop = 76
  const kickerY = topH + 74
  const titleTop = kickerY + 44
  const titleBottom = titleTop + (titleLines.length - 1) * 88 + 72
  const pointsTop = titleBottom + 44
  const signTop = pointsTop + points.length * pillGap + (points.length ? 24 : 0)
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 74, onDark: true, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.grad(0, 0, W, height, s.c1, s.c2, {
    stops: [{ at: 0, color: s.c1 }, { at: 0.52, color: mix(s.c1, s.c2, 0.5) }, { at: 1, color: s.c2 }],
  }))
  // 人像后面那团光：径向渐变从半透明白走到全透，把大圆从渐变里"托"出来
  layers.push(L.radial(W - pad - avatarD / 2, avatarTop + avatarD / 2, 0, avatarD * 1.05,
    withAlpha('#FFFFFF', 0.38), withAlpha('#FFFFFF', 0), [0, 0, W, topH]))
  layers.push(L.fill(0, topH - 1, W, height - topH + 1, withAlpha(HARD, 0.28)))
  if (hasAvatar) {
    layers.push(L.avatar(W - pad - avatarD, avatarTop, avatarD, { ring: 6, ringColor: withAlpha('#FFFFFF', 0.6), fallback: withAlpha('#FFFFFF', 0.2) }))
  } else {
    layers.push(glyphPlate(ctx, { x: W - pad - avatarD, y: avatarTop, w: avatarD, h: avatarD, color: withAlpha('#FFFFFF', 0.28) }))
  }
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 22, weight: 'bold', color: s.sub, track: 4 }))
  layers.push(L.text({ x: pad, y: titleTop + 72, lines: titleLines, lh: 88, size: 72, weight: 'bold', color: s.ink }))
  points.forEach((p, i) => {
    const py = pointsTop + i * pillGap
    layers.push(L.rrect(pad, py - 34, W - pad * 2, 76, 38, { fill: withAlpha('#FFFFFF', 0.14) }))
    layers.push(L.circle(pad + 30, py, 22, { fill: s.accent }))
    layers.push(L.text({ x: pad + 30, y: py + 8, lines: [String(i + 1)], size: 22, weight: 'bold', color: s.accentInk, align: 'center' }))
    layers.push(L.text({ x: pad + 66, y: py + 9, lines: [p], size: 25, color: s.panelInk }))
  })
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: 'rgba(255,255,255,0.72)', label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'acid' }
}

function planCover(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('mono', note.category_id)
  const pad = 48
  const qrSize = 116
  // 文字块从哪儿开始压住人像：这一段以下渐变已经压到 0.88 以上，够白字站住
  const textTop = 720

  font(ctx, 20, true)
  const mast = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2 - 40, 4)
  font(ctx, 76, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 2)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2, 2) : []

  const mastY = pad + 20
  const titleTop = 796
  const titleBottom = titleTop + (titleLines.length - 1) * 90 + 76
  const sumTop = sumLines.length ? titleBottom + 30 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 40 + 26 : titleBottom
  const signTop = sumBottom + 52
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 30, avatarD: 80, onDark: true, profile, hasAvatar })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  if (hasAvatar) {
    // 彩色整幅人像铺满全张，眉标、标题、署名、码全部压在图上。
    // 压得住靠这条渐变：脸那一段（上半张）几乎不加暗，到标题那一段已经到 0.88，
    // 白字落在浅色衣服或白墙上也不会糊掉。
    layers.push(L.image('avatar', 0, 0, W, height))
    layers.push(L.grad(0, 0, W, height, withAlpha(s.bg, 0.2), withAlpha(s.bg, 0.97), {
      stops: [
        { at: 0, color: withAlpha(s.bg, 0.2) },
        { at: 0.5, color: withAlpha(s.bg, 0.42) },
        { at: 0.66, color: withAlpha(s.bg, 0.88) },
        { at: 1, color: withAlpha(s.bg, 0.97) },
      ],
    }))
  } else {
    layers.push(L.radial(W / 2, height * 0.34, 0, height * 0.62, withAlpha(s.accent, 0.34), withAlpha(s.bg, 0), [0, 0, W, height]))
    layers.push(glyphPlate(ctx, { x: 0, y: 0, w: W, h: height, color: withAlpha(s.ink, 0.1) }))
  }
  const mastW = trackW(ctx, mast, 4) + 40
  layers.push(L.rrect(pad, mastY - 30, mastW, 44, 22, { fill: withAlpha(HARD, 0.5) }))
  layers.push(L.text({ x: pad + 20, y: mastY, lines: [mast], size: 20, weight: 'bold', color: '#FFFFFF', track: 4 }))
  layers.push(L.text({ x: pad, y: titleTop + 76, lines: titleLines, lh: 90, size: 76, weight: 'bold', color: s.ink }))
  layers.push(L.fill(pad, titleTop - 26, 84, 8, s.accent))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 26, lines: sumLines, lh: 40, size: 26, color: s.sub }))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'cover' }
}

function planLit(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('riso', note.category_id)
  const pad = 56
  const archW = 380
  const archH = 380
  const archX = (W - archW) / 2
  const vertX = W - 44
  const contentCx = (W - 68) / 2
  const qrSize = 108

  font(ctx, 20, true, SERIF)
  const kicker = clipTrack(ctx, [blockNameOf(note, lang), formatShortDate(note.created_at)].filter(Boolean).join(' · '), W - pad * 2, 6)
  font(ctx, 52, true, SERIF)
  const titleLines = fit(ctx, note.title || '', W - pad * 2 - 60, 3)
  font(ctx, 27, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 50, 3) : []
  // 竖排那一列写来源。不写 slogan：slogan 已经在署名行里，同一句话出现两次很廉价。
  const vertText = (sourceLabelOf(note, lang) || formatShortDate(note.created_at)).slice(0, 10)
  const vertStep = 40
  const archTop = 92
  const kickerY = archTop + archH + 76
  const titleTop = kickerY + 40
  const vertTop = titleTop
  const titleBottom = titleTop + (titleLines.length - 1) * 74 + 52
  const ruleY = titleBottom + 46
  const sumTop = sumLines.length ? ruleY + 44 : 0
  const sumBottom = sumLines.length ? sumTop + (sumLines.length - 1) * 42 + 27 : ruleY
  const signTop = Math.max(sumBottom, vertTop + Array.from(vertText).length * vertStep) + 52
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 72, profile, hasAvatar: false })
  const height = signTop + Math.max(sign.h, footH(qrSize)) + 48

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  // 拱门：四角全圆的长条 + 一条方角矩形盖住下半截的圆角
  layers.push(L.rrect(archX, archTop, archW, archH, archW / 2, { fill: s.accent }))
  layers.push(L.fill(archX, archTop + archH - archW / 2, archW, archW / 2, s.accent))
  const badge = 220
  if (hasAvatar) {
    layers.push(L.avatar(archX + (archW - badge) / 2, archTop + 56, badge, { ring: 8, ringColor: s.bg, fallback: withAlpha(s.bg, 0.3) }))
  } else {
    layers.push(glyphPlate(ctx, { x: archX, y: archTop, w: archW, h: archH, color: withAlpha(s.accentInk, 0.22) }))
  }
  layers.push(L.text({ x: contentCx, y: kickerY, lines: [kicker], size: 20, weight: 'bold', color: s.sub, track: 6, align: 'center', fam: SERIF }))
  layers.push(L.text({
    x: contentCx, y: titleTop + 52, lines: titleLines, lh: 74, size: 52, weight: 'bold', color: s.ink, align: 'center', fam: SERIF,
  }))
  layers.push(L.line(pad, ruleY, W - pad, ruleY, 2, withAlpha(s.ink, 0.18)))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 27, lines: sumLines, lh: 42, size: 27, color: mix(s.ink, s.bg, 0.78) }))
  }
  layers.push(L.text({
    x: vertX, y: vertTop, lines: [vertText], vert: true, lh: vertStep, size: 28, color: withAlpha(s.ink, 0.62), fam: SERIF,
  }))
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'lit' }
}

function planSpec(ctx, d) {
  const { note, profile, hasAvatar, lang } = d
  const s = schemeFor('spec', note.category_id)
  const pad = 52
  const qrSize = 112
  const rule = withAlpha(s.ink, 0.14)
  const SPEC_MIN_H = 1040

  font(ctx, 20, false, MONO)
  const meta = clipTrack(ctx, [
    `NO.${String((note.id || 0) % 1000).padStart(3, '0')}`,
    formatShortDate(note.created_at),
    sourceLabelOf(note, lang),
  ].filter(Boolean).join('  /  '), W - pad * 2, 1)
  font(ctx, 20, true)
  const kicker = clipTrack(ctx, blockNameOf(note, lang), W - pad * 2, 5)
  font(ctx, 60, true)
  const titleLines = fit(ctx, note.title || '', W - pad * 2, 3)
  font(ctx, 26, false)
  const sumLines = note.summary ? fit(ctx, note.summary, W - pad * 2 - 60, 3) : []
  font(ctx, 26, false)
  const points = (note.key_points || []).slice(0, 4).map((p) => clip(ctx, p, W - pad * 2 - 150))

  const metaY = pad + 20
  const barY = metaY + 26
  const kickerY = barY + 56
  const titleTop = kickerY + 34
  const titleBottom = titleTop + (titleLines.length - 1) * 74 + 60
  let y = titleBottom + 44
  const sumTop = sumLines.length ? y : 0
  if (sumLines.length) y += (sumLines.length - 1) * 40 + 76
  const listTop = points.length ? y : 0
  if (points.length) y += points.length * 74
  const foot = Math.max(
    signRow({ ctx, x: pad, y: 0, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 76, profile, hasAvatar }).h,
    footH(qrSize),
  )
  // 只有一条要点的笔记会让这张变成横图，所以给一个竖版下限。
  // 多出来的空白对半分：一半进正文上方，一半留在正文与底行之间，底行贴住画布下沿，
  // 看着像一张摊开的表格，而不是像缺了半页内容。
  const natural = y + 40 + foot + 48
  const height = Math.max(natural, SPEC_MIN_H)
  const bodyShift = Math.round((height - natural) * 0.5)
  const signTop = height - 48 - foot
  const sign = signRow({ ctx, x: pad, y: signTop, maxW: W - pad * 2 - qrSize - 30, size: 28, avatarD: 76, profile, hasAvatar })

  const layers = []
  layers.push(L.fill(0, 0, W, height, s.bg))
  layers.push(L.grad(pad, barY, W - pad * 2, 10, s.accent, withAlpha(s.accent, 0.1), { dir: 'h' }))
  layers.push(L.text({ x: pad, y: metaY, lines: [meta], size: 20, color: s.sub, fam: MONO, track: 1 }))
  layers.push(L.text({ x: pad, y: kickerY, lines: [kicker], size: 20, weight: 'bold', color: s.accent, track: 5 }))
  layers.push(L.text({ x: pad, y: titleTop + 60, lines: titleLines, lh: 74, size: 60, weight: 'bold', color: s.ink }))
  if (sumLines.length) {
    layers.push(L.text({ x: pad, y: sumTop + 26 + bodyShift, lines: sumLines, lh: 40, size: 26, color: mix(s.ink, s.bg, 0.78) }))
  }
  points.forEach((p, i) => {
    const py = listTop + bodyShift + i * 74
    layers.push(L.line(pad, py - 30, W - pad, py - 30, 1.5, rule))
    layers.push(L.text({ x: pad, y: py + 4, lines: [String(i + 1).padStart(2, '0')], size: 22, color: s.accent, fam: MONO, weight: 'bold' }))
    layers.push(L.text({ x: pad + 62, y: py + 4, lines: [p], size: 26, color: mix(s.ink, s.bg, 0.86) }))
  })
  if (points.length) {
    const endY = listTop + bodyShift + points.length * 74 - 30
    layers.push(L.line(pad, endY, W - pad, endY, 1.5, rule))
  }
  layers.push(...sign.layers)
  qrSticker({ layers, x: W - pad - qrSize, y: signTop, size: qrSize, offset: s.accent, ink: s.sub, label: t('scanToView', lang) })
  return { width: W, height, layers, template: 'spec' }
}

// ---------------------------------------------------------------- 配方（L3 数据 → 图层）
//
// 方案 docs/方案-卡片模板不走发版.md §三那三层的下面两层在这里落地：
// L1 = paintLayers 认的十种绘制 op，L2 = 必须量了文字才算得出几何的排版原语。
// 两份名单都以"名字 + 参数表"的形式待在本文件里，因为真正的能力就在这儿；
// 配方（L3）只是引用名字的数据，所以它能下发。解释器在 posterRecipe.js。

// 每个 op 允许的字段（k 之外）。唯一的出处是 paintLayers / drawLine / drawVertColumn
// 里读到的 ly.xxx；docs/工具/验-模板配方可执行.js 会从本文件源码把两边读回来对表，
// 加了绘制字段却忘了这里，那把尺子会红。
const RECIPE_OP_KEYS = {
  fill: ['x', 'y', 'w', 'h', 'color'],
  grad: ['x', 'y', 'w', 'h', 'c1', 'c2', 'dir', 'stops'],
  radial: ['x', 'y', 'r0', 'r1', 'c1', 'c2', 'box'],
  rrect: ['x', 'y', 'w', 'h', 'r', 'fill', 'shadow', 'shadowBlur', 'shadowY', 'stroke', 'strokeWidth'],
  circle: ['x', 'y', 'r', 'fill', 'stroke', 'strokeWidth'],
  line: ['x1', 'y1', 'x2', 'y2', 'w', 'color'],
  dots: ['x', 'y', 'w', 'h', 'gap', 'r', 'color', 'oddRowShift'],
  text: ['x', 'y', 'lines', 'lh', 'size', 'weight', 'color', 'align', 'fam', 'alpha', 'track', 'stroke', 'strokeWidth', 'vert', 'colGap', 'vpunct'],
  image: ['key', 'x', 'y', 'w', 'h', 'placeholder', 'r', 'clipCircle', 'gray', 'tint', 'fadeFrom'],
  avatar: ['x', 'y', 'd', 'ring', 'ringColor', 'fallback'],
}
// 哪些字段属于 L.xxx 最后那个"可选项"参数（其余按位置传）。没列进去的按位置传，
// 这样图层的默认值仍然只有 L 这一份出处。
const RECIPE_OPT_KEYS = {
  grad: ['dir', 'stops'],
  rrect: ['fill', 'shadow', 'shadowBlur', 'shadowY', 'stroke', 'strokeWidth'],
  circle: ['fill', 'stroke', 'strokeWidth'],
  dots: ['gap', 'r', 'color', 'oddRowShift'],
  image: ['placeholder', 'r', 'clipCircle', 'gray', 'tint', 'fadeFrom'],
  avatar: ['ring', 'ringColor', 'fallback'],
  text: ['x', 'y', 'lines', 'lh', 'size', 'weight', 'color', 'align', 'fam', 'alpha', 'track', 'stroke', 'strokeWidth', 'vert', 'colGap', 'vpunct'],
}

// 值没给就不塞这个键：L.rrect(..., {}) 与 L.rrect(..., {shadow: undefined}) 画上是同一张，
// 但图层里多一个键就是多一处差异，逐层等价那条基线会把它判成"改了像素"。
function pickFields(a, keys) {
  const o = {}
  keys.forEach((k) => { if (a[k] !== undefined) o[k] = a[k] })
  return o
}

function buildRecipeLayer(fields) {
  const keys = RECIPE_OP_KEYS[fields.k]
  if (!keys) throw new Error(`不认的绘制 op「${fields.k}」`)
  Object.keys(fields).forEach((k) => {
    if (k !== 'k' && keys.indexOf(k) < 0) throw new Error(`op「${fields.k}」没有字段「${k}」，能用的是 ${keys.join('、')}`)
  })
  const o = pickFields(fields, RECIPE_OPT_KEYS[fields.k] || [])
  switch (fields.k) {
    case 'fill': return L.fill(fields.x, fields.y, fields.w, fields.h, fields.color)
    case 'grad': return L.grad(fields.x, fields.y, fields.w, fields.h, fields.c1, fields.c2, o)
    case 'radial': return L.radial(fields.x, fields.y, fields.r0, fields.r1, fields.c1, fields.c2, fields.box)
    case 'rrect': return L.rrect(fields.x, fields.y, fields.w, fields.h, fields.r, o)
    case 'circle': return L.circle(fields.x, fields.y, fields.r, o)
    case 'line': return L.line(fields.x1, fields.y1, fields.x2, fields.y2, fields.w, fields.color)
    case 'dots': return L.dots(fields.x, fields.y, fields.w, fields.h, o)
    case 'text': return L.text(o)
    case 'image': return L.image(fields.key, fields.x, fields.y, fields.w, fields.h, o)
    default: return L.avatar(fields.x, fields.y, fields.d, o)
  }
}

// L2 原语：配方能点名的排版动作，参数表写死在这里，名单外的名字与参数一律抛错。
// size/bold/fam 刻意重复在每条量字的原语里：canvas 的 measureText 吃 ctx.font 这个隐状态，
// 本文件那十套 planner 都是"先 font 再量"，原语自己带上字号才不会被上一段的字号顶掉。
const RECIPE_TOKENS = { paper: PAPER, ink: INK, body: BODY, muted: MUTED, hard: HARD, warm: WARM, serif: SERIF, mono: MONO }
// 给了 size 就"先切字体再量"（planner 每一处都是这个顺序）；不给 size 就沿用当前字体。
// 后者不是冗余分支：planner 里有一处把切字体写在了三元表达式外面（金句那行的标题），
// 配方要是再切一次，画面一样但绘制序列多一步，逐层等价那条基线就会红。
const measureWithFont = (env, a, fn) => {
  if (a.size !== undefined) font(env.ctx, a.size, a.bold, a.fam)
  return fn(env.ctx)
}
const RECIPE_PRIMS = {
  i18n: { keys: ['key'], call: (env, a) => t(a.key, env.lang) },
  blockName: { keys: [], call: (env) => blockNameOf(env.note, env.lang) },
  sourceLabel: { keys: [], call: (env) => sourceLabelOf(env.note, env.lang) },
  quoteText: { keys: [], call: (env) => quoteOf(env.note) },
  noteDate: { keys: [], call: (env) => formatShortDate(env.note.created_at) },
  tagsJoined: { keys: ['sep'], call: (env, a) => (env.note.tags || []).join(a.sep) },
  paperOf: { keys: ['categoryId'], call: (env, a) => paperOf(a.categoryId) },
  // 活泼那六套不吃宣纸那两档，吃 palette 里的"配色方案"：一个名字 + 一个分类 → 一组色。
  scheme: { keys: ['name', 'categoryId'], call: (env, a) => schemeFor(a.name, a.categoryId) },
  // 波普四格那四块版色：跨着相邻的几组各拿一块，四格才是四个色相（palette.js 里那段注释）。
  // 数组长度是死的 4，但配方里还是按 each 走，条数不写死在配方里。
  plateColors: { keys: ['categoryId'], call: (env, a) => plateColors(a.categoryId) },
  withAlpha: { keys: ['color', 'alpha'], call: (env, a) => withAlpha(a.color, a.alpha) },
  mix: { keys: ['c1', 'c2', 'w'], call: (env, a) => mix(a.c1, a.c2, a.w) },
  // 不 trim：planner 那两处都是 `[a, b].filter(Boolean).join(' · ')`，
  // 顺手 trim 会把"只有一个空格的标签"从有变成无，那是行为差，不是清理。
  joinNonEmpty: { keys: ['sep', 'parts'], call: (env, a) => (a.parts || []).filter(Boolean).join(a.sep) },
  points: {
    keys: ['limit', 'maxW', 'size', 'bold', 'fam'],
    call: (env, a) => measureWithFont(env, a, (ctx) => (env.note.key_points || []).slice(0, a.limit).map((p) => clip(ctx, p, a.maxW))),
  },
  fitLines: { keys: ['text', 'maxW', 'n', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => fit(ctx, a.text, a.maxW, a.n)) },
  wrapLines: { keys: ['text', 'maxW', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => wrap(ctx, a.text, a.maxW)) },
  clipLine: { keys: ['text', 'maxW', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => clip(ctx, a.text, a.maxW)) },
  clipTrack: { keys: ['text', 'maxW', 'track', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => clipTrack(ctx, a.text, a.maxW, a.track)) },
  trackWidth: { keys: ['text', 'track', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => trackW(ctx, a.text, a.track)) },
  fitSize: { keys: ['text', 'maxW', 'want', 'floor'], call: (env, a) => fitSize(env.ctx, a.text, a.maxW, a.want, a.floor) },
  // planner 里有几处"先切字号，再按三元决定要不要量字"：那一次切字体在分支外面，
  // 配方要原样记下来才和基线的绘制序列对得上（配一条 `do` 用它）。
  setFont: { keys: ['size', 'bold', 'fam'], call: (env, a) => { font(env.ctx, a.size, a.bold, a.fam); return null } },
  vertCols: { keys: ['text', 'colH', 'step', 'maxCols', 'size', 'bold', 'fam'], call: (env, a) => measureWithFont(env, a, (ctx) => vcols(ctx, a.text, a.colH, a.step, a.maxCols)) },
  // 竖排那一列走多长：信笺的落款章要盖在款识正下方，那个距离只能量出来。
  // 不给 size 就沿用当前字体（planner 里那次 font(20,SERIF) 在量字外面，多切一次绘制序列就长一步）。
  vertAdv: {
    keys: ['text', 'step', 'size', 'bold', 'fam'],
    call: (env, a) => measureWithFont(env, a, (ctx) => vertUnits(ctx, a.text, a.step).reduce((x, u) => x + u.adv, 0)),
  },
  // 把「一批列里最长的那一列」压成一个数。max 这个算子是定长参数表，摊不开数组，
  // 所以数组求最大只能走原语。seed 必给（planner 那句是 Math.max(0, ...advs)：
  // 标题和摘要都没有时数组是空的，不种子就会得 -Infinity，画布塌成一张负高的）。
  maxOf: {
    keys: ['values', 'seed'],
    call: (env, a) => {
      if (!Array.isArray(a.values)) throw new Error(`maxOf 要一个数组，拿到 ${a.values === null ? 'null' : typeof a.values}`)
      if (typeof a.seed !== 'number' || !Number.isFinite(a.seed)) throw new Error('maxOf 少了 seed（那个种子数必须写出来）')
      return Math.max(a.seed, ...a.values)
    },
  },
  // 落款印里刻的那个字（也是没设形象时的占位字）。配方不许把它抄成字符串「麦」：
  // 站长 09-24 定的这一枚，换字要连着占位图一起换，只许点名。
  brandGlyph: { keys: [], call: () => BRAND_GLYPH },
  signRow: {
    keys: ['x', 'y', 'maxW', 'size', 'avatarD', 'onDark', 'hasAvatar'],
    // hasAvatar 可省：省了就跟随用户到底设没设形象（九套都是这样）。
    // 叠翠那一套显式给 false——它已经在色块与白卡交界画了一枚大头像，署名行再带一枚就成两个自己了。
    call: (env, a) => signRow({
      ctx: env.ctx, x: a.x, y: a.y, maxW: a.maxW, size: a.size, avatarD: a.avatarD,
      onDark: a.onDark, profile: env.profile,
      hasAvatar: a.hasAvatar === undefined ? env.hasAvatar : a.hasAvatar,
    }),
  },
  glyphPlate: { keys: ['x', 'y', 'w', 'h', 'color'], call: (env, a) => glyphPlate(env.ctx, a) },
  // 码贴纸在 JS 里是往调用方的 layers 数组里塞四层；配方不许改数组，
  // 所以这里收进一个局部数组，连同一块占多高一起交回去，由配方自己 emitMany。
  qrSticker: {
    keys: ['x', 'y', 'size', 'offset', 'ink', 'label'],
    call: (env, a) => {
      const layers = []
      const h = qrSticker({ layers, x: a.x, y: a.y, size: a.size, offset: a.offset, ink: a.ink, label: a.label })
      return { layers, h }
    },
  },
  qrStickerH: { keys: ['size'], call: (env, a) => qrStickerH(a.size) },
  footH: { keys: ['qrSize'], call: (env, a) => footH(a.qrSize) },
  // 配方里不许出现写死的 hex：这四个色和两个字体族是本文件的常量，下发一份配方把 hex 抄进去，
  // 下次统一墨色时那一份就会悄悄掉队。所以走名字，名字到值只有这一处映射。
  token: { keys: ['name'], call: (env, a) => {
    const v = RECIPE_TOKENS[a.name]
    if (v === undefined) throw new Error(`色名/字体名「${a.name}」不在名单里，能用的是 ${Object.keys(RECIPE_TOKENS).join('、')}`)
    return v
  } },
}

function callRecipePrim(env, name, rawArgs, scope) {
  const p = RECIPE_PRIMS[name]
  if (!p) throw new Error(`原语「${name}」不在名单里`)
  Object.keys(rawArgs).forEach((k) => {
    if (p.keys.indexOf(k) < 0) throw new Error(`原语「${name}」没有参数「${k}」，能用的是 ${p.keys.join('、')}`)
  })
  const a = {}
  p.keys.forEach((k) => {
    a[k] = k in rawArgs ? engine.evalTerm(rawArgs[k], env, scope, `${name}.${k}`) : undefined
  })
  return p.call(env, a)
}

// 跑一份配方。d 是 planner 那一套入参（note / profile / lang / hasAvatar）。
function planFromRecipe(ctx, d, recipe) {
  const env = {
    ctx, note: d.note, profile: d.profile, lang: d.lang, hasAvatar: d.hasAvatar,
    layers: [], width: W,
    scope: { W, note: d.note, profile: d.profile, lang: d.lang, hasAvatar: d.hasAvatar },
    opKeys: RECIPE_OP_KEYS,
    prims: RECIPE_PRIMS,
    buildLayer: buildRecipeLayer,
    checkLayer: (l, where) => {
      if (!l || !RECIPE_OP_KEYS[l.k]) throw new Error(`${where}: 原语交回来的不是一层能绘制的东西`)
      // 字段也一起查：emitOne/emitMany 交回来的层没经过 buildRecipeLayer，
      // 不查就等于允许配方用 {lit:{k:'fill',…,随便一个键:1}} 绕开名单夹带字段——
      // 绘制时那些键会被静默忽略，正是"字段不认识就跳过"那条不许有的宽容路径。
      const keys = RECIPE_OP_KEYS[l.k]
      Object.keys(l).forEach((k) => {
        if (k !== 'k' && keys.indexOf(k) < 0) throw new Error(`${where}: op「${l.k}」没有字段「${k}」，能用的是 ${keys.join('、')}`)
      })
      return l
    },
  }
  env.callPrim = (name, args, scope) => callRecipePrim(env, name, args, scope)
  return engine.planFromRecipe(recipe, env)
}

// JS 那十份 planner 全先留着：转成配方的那几套走 RECIPE_IDS，没转的照旧走 JS。
// 十套全转完（P0-3）之后这份才会删净。
const PLANNERS = {
  card: planCard, quote: planQuote, block: planBlock, letter: planLetter,
  popGrid: planPopGrid, popDots: planPopDots, acid: planAcid, cover: planCover, lit: planLit, spec: planSpec,
}

// 已经转写成配方的那几套。包内自带的那份就是服务端下发失败时的兜底，
// 名单在 poster.js、内容在 posterRecipes.js，两边对不上由 docs/工具/验-模板配方可执行.js 抓。
const RECIPE_IDS = ['quote', 'card', 'block', 'lit', 'spec', 'popGrid', 'popDots', 'acid', 'cover', 'letter']

// ---------------------------------------------------------------- 下发那一路（P0-5）
//
// 服务端那几行配方到了客户端，这里只回答一个问题：**这一套能不能整套用**。
// 能用就整套盖掉包内那一份，不能用就整套丢掉、包内那份原样留着。
// 绝不做"跳过不认识的那一层继续画"——半张图比不用更糟（方案 §四 第 4 条）。
//
// 这道闸门必须放在本文件：op 的字段表、原语的参数表都只在这里有一份，
// posterTemplates.js 只管拉与存，它不认名单，所以也不许自己判"合格"。
const RECIPE_PRIM_KEYS = {}
Object.keys(RECIPE_PRIMS).forEach((n) => { RECIPE_PRIM_KEYS[n] = RECIPE_PRIMS[n].keys })

// id → 那一行下发值。整个换掉（applyRemoteTemplates 里重赋值），不留旧行：
// 服务端撤掉一套（status 改 archived）之后，本地这一份必须当场没有，
// 否则"撤回秒级生效"就变成"等下一次全量下发覆盖"。
let REMOTE = {}

// '1.9.27' 这种三段号不许按字符串比：'1.10.0' 会被判成比 '1.9.9' 小。
function appVersionOk(want) {
  const a = String(APP_VERSION).split('.').map((x) => parseInt(x, 10) || 0)
  const b = String(want).split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0
    const y = b[i] || 0
    if (x !== y) return x > y
  }
  return true
}

// 一行下发值的毛病清单（空数组＝这一行整套可用）。
// 顺序是：先看信封（id/名字/分组/版本门槛），再看信纸（配方本身过不过名单）。
function remoteRowProblems(row) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return ['这一行不是对象']
  const bad = []
  if (typeof row.template_id !== 'string' || !row.template_id) bad.push('少了 template_id')
  if (typeof row.label !== 'string' || !row.label) bad.push('少了 label')
  if (TEMPLATE_GROUPS.every((g) => g.id !== row.group_key)) bad.push(`分组「${row.group_key}」不在本包认的那两组（${TEMPLATE_GROUPS.map((g) => g.id).join('、')}）里`)
  if (typeof row.min_app_version !== 'string' || !row.min_app_version) bad.push('少了 min_app_version')
  else if (!appVersionOk(row.min_app_version)) bad.push(`这套要 ${row.min_app_version} 以上的包，这台是 ${APP_VERSION}`)
  if (row.recipe === null || typeof row.recipe !== 'object' || Array.isArray(row.recipe)) {
    bad.push('recipe 得是个对象')
    return bad
  }
  // 名单校验（含字节/深度/节点三条上界）由解释器那份现成的 validate 做，不另写一套。
  bad.push.apply(bad, engine.validate(row.recipe, { opKeys: RECIPE_OP_KEYS, primKeys: RECIPE_PRIM_KEYS }))
  // 配方里那个 id 必须就是这一行的 template_id。少这一道，"加第 11 套"可以写成
  // 把 quote 那份配方贴到新 id 上——列表里多一格、点进去画的却是另一张卡，
  // 而每一层都合法，画面不会报错。这种"名字对、内容不对"的错只能在门口拦。
  if (row.recipe && row.recipe.id !== row.template_id) bad.push(`配方自己的 id「${row.recipe && row.recipe.id}」与这行的 template_id 不一致`)
  return bad
}

// 返回 { accepted, rejected: [人话] }。丢掉的那几条不改 REMOTE 里对应的那一项——
// 包内那份照旧，画面上看不出来任何事，这也正是"回退"该有的样子。
function applyRemoteTemplates(rows) {
  const report = { accepted: 0, rejected: [] }
  if (!Array.isArray(rows)) return { accepted: 0, rejected: ['下发不是一个数组'] }
  const next = {}
  rows.forEach((row) => {
    const problems = remoteRowProblems(row)
    if (problems.length) {
      report.rejected.push(`${(row && row.template_id) || '?'}：${problems.join('；')}`)
      return
    }
    next[row.template_id] = row
    report.accepted++
  })
  REMOTE = next
  return report
}

function remoteTemplates() {
  return REMOTE
}

// 界面用它决定"要不要重画选择器"：一串 hash 拼起来的指纹，没变就什么都不做。
function remoteSignature() {
  return Object.keys(REMOTE).sort().map((id) => `${id}:${REMOTE[id].content_hash || ''}`).join('|')
}

function recipeOf(id) {
  const r = REMOTE[id]
  if (r && r.recipe) return r.recipe
  return RECIPE_IDS.indexOf(id) < 0 ? null : RECIPES[id] || null
}

// 这一套现在吃的是哪一份：下发的 / 包内的 / 还没转成配方（只有 JS planner）。
// 出图那一路不问它（问了就要改图层清单，而那份清单是 480 组基线的比对对象），
// 只有 P0-6 那三条反向对照读它——"这张卡到底是谁画的"必须有个不靠猜的说法。
function recipeSource(id) {
  if (REMOTE[id] && REMOTE[id].recipe) return 'remote'
  if (RECIPE_IDS.indexOf(id) >= 0 && RECIPES[id]) return 'bundled'
  return 'js'
}

// 模板列表＝包内 ∪ 下发（按 id 覆盖）。
// 已有那十项**保持包内顺序**：下发改的是画法和叫法，不是排次；真要调序是另一件事，
// 得让站长点头，不能让服务端一次改名字就把「玉版宣」挪到列表末尾。
// 下发里新出现的 id 排在尾巴上，按 sort_order 定点。
function templateList() {
  const out = TEMPLATES.map((x) => {
    const r = REMOTE[x.id]
    if (!r) return x
    return { id: x.id, label: r.label, labelEn: r.label_en || r.label, group: r.group_key }
  })
  const known = TEMPLATES.map((x) => x.id)
  Object.keys(REMOTE)
    .filter((id) => known.indexOf(id) < 0)
    .sort((a, b) => ((REMOTE[a].sort_order || 0) - (REMOTE[b].sort_order || 0)) || (a < b ? -1 : 1))
    .forEach((id) => {
      const r = REMOTE[id]
      out.push({ id, label: r.label, labelEn: r.label_en || r.label, group: r.group_key })
    })
  return out
}

// ---------------------------------------------------------------- 入口

// 关掉二维码：微信以外的平台看见第三方码就直接屏蔽这张图，所以宁可留字不留码。
// 十套模板码位各不相同（有的在右下贴纸、有的在底部居中、有的在左下配一行侧标），
// 与其十处各写一遍，不如从图层里把"这一张码 + 给它垫底的块 + 它下面那行引导语"摘掉，
// 原地换成两行纯文字。摘的条件是中心离码中心近、面积不超过码的四倍，
// 所以整张卡的大底不会被误摘。
// 文字不许截成"图麦笔…"：那种位置宁可字号小一档，所以按框宽往下试字号而不是裁字。
function fitSize(ctx, text, maxW, want, floor) {
  let s = Math.max(want, floor)
  for (;;) {
    font(ctx, s, false)
    if (ctx.measureText(text).width <= maxW || s <= floor) return s
    s = Math.max(Math.round(s * 0.9), floor)
  }
}

function stripQr(plan, ctx, lang) {
  const qr = plan.layers.filter((l) => l.k === 'image' && l.key === 'qr').pop()
  if (!qr) return plan
  const cx = qr.x + qr.w / 2
  const cy = qr.y + qr.h / 2
  const qrArea = qr.w * qr.h
  const scan = t('scanToView', lang)
  const belongsToQr = (l) => {
    if (l.k === 'text') return (l.lines || []).some((s) => String(s) === scan)
    if (l.k !== 'rrect' && l.k !== 'circle') return false
    const w = l.k === 'circle' ? l.r * 2 : l.w
    const h = l.k === 'circle' ? l.r * 2 : l.h
    const x = l.k === 'circle' ? l.x - l.r : l.x
    const y = l.k === 'circle' ? l.y - l.r : l.y
    return Math.abs(x + w / 2 - cx) < qr.w * 0.6 &&
      Math.abs(y + h / 2 - cy) < qr.h * 0.6 &&
      w * h <= qrArea * 4
  }
  const kept = plan.layers.filter((l) => l !== qr && !belongsToQr(l))
  const cap = plan.layers.find((l) => l.k === 'text' && (l.lines || []).some((s) => String(s) === scan))
  const ink = cap ? cap.color : INK
  const name = t('appName', lang)
  const hint = t('noQrMark', lang)
  const maxW = qr.w - 8
  const s1 = fitSize(ctx, name, maxW, Math.round(qr.w * 0.22), Math.round(qr.w * 0.1))
  const s2 = fitSize(ctx, hint, maxW, Math.round(qr.w * 0.115), Math.round(qr.w * 0.06))
  kept.push(L.text({
    x: cx, y: cy - qr.w * 0.04 + s1 * 0.34, lines: [name], size: s1, weight: 'bold', color: ink, align: 'center',
  }))
  kept.push(L.text({
    x: cx, y: cy + qr.w * 0.2 + s2 * 0.34, lines: [hint], size: s2, color: ink, align: 'center',
  }))
  return { width: plan.width, height: plan.height, layers: kept, template: plan.template }
}

function planPoster(ctx, note, templateId, profile, lang, opts) {
  // 认得这一套的两条路：有一份 JS planner，或者有一份配方（下发的或包内的）。
  // 只查 PLANNERS 会把下发来的第 11 套判成"不认识的模板"、退回默认那一套——
  // 站长在服务端加了模板而客户端毫无反应，就是这一行造成的。
  const tpl = (PLANNERS[templateId] || recipeOf(templateId)) ? templateId : DEFAULT_TEMPLATE
  const p = profile || {}
  const o = opts || {}
  const d = { note, profile: p, hasAvatar: !!p.avatarPath, lang: lang || 'zh' }
  const recipe = recipeOf(tpl)
  let plan
  if (!recipe) plan = PLANNERS[tpl](ctx, d)
  else if (o.strict) plan = planFromRecipe(ctx, d, recipe)
  else {
    // 线上这一路是"绝不灰掉、绝不空白"：配方跑不出就拿 JS 那份兜底（P0-3 转完后
    // JS 一份份删，兜底也就一份份少，最后一份兜到默认模板）。
    // 尺子走 strict：坏了就抛。少了这道区分，一份从没跑起来的坏配方会一路用 JS 分支，
    // 等价基线照样全绿，那把尺子就白立了。
    try { plan = planFromRecipe(ctx, d, recipe) } catch (e) { plan = (PLANNERS[tpl] || PLANNERS[DEFAULT_TEMPLATE])(ctx, d) }
  }
  return o.showQr === false ? stripQr(plan, ctx, lang || 'zh') : plan
}

// 设置页那几格小样用的内置笔记：不依赖用户数据，每套模板都能立刻看到效果。
// 中英文各一份，是因为英文的断行、字距、行高和中文不是一回事，只看中文会漏。
const SAMPLE_NOTE = {
  id: 0,
  // 这句原来以"把"开头，十个小样每一张都顶着一个"把"字，站长 09-24 点名要改。
  // 中文的"把字句"在这里读着像错字（品牌叫图麦），换个说法意思一样。
  title: '读过的东西，存成能转发的笔记',
  summary: '一条链接、一张截图，或者自己写两句，存进来就自动分成能转发的样子。',
  key_points: ['一句话顶做大字，别人扫一眼就记得住', '自己的头像和名字印在图上'],
  tags: ['阅读'],
  category_id: 1,
  source_type: 'manual',
  created_at: '2026-09-23T10:00:00Z',
}

const SAMPLE_NOTE_EN = {
  id: 0,
  title: 'Turn anything you read into a note worth forwarding',
  summary: 'A link, a screenshot, or two lines of your own — it comes back as something you can share.',
  key_points: ['One line, set big enough to remember', 'Your own avatar and name printed on it'],
  tags: ['Reading'],
  category_id: 1,
  source_type: 'manual',
  created_at: '2026-09-23T10:00:00Z',
}

module.exports = {
  W,
  MATTE,
  TEMPLATES,
  paperOf,
  PAPER_A,
  PAPER_B,
  TEMPLATE_GROUPS,
  DEFAULT_TEMPLATE,
  RECIPE_IDS,
  RECIPE_OP_KEYS,
  RECIPE_OPT_KEYS,
  RECIPE_PRIMS,
  RECIPE_TOKENS,
  recipeOf,
  recipeSource,
  templateList,
  applyRemoteTemplates,
  remoteTemplates,
  remoteSignature,
  planFromRecipe,
  BRAND_GLYPH,
  SAMPLE_NOTE,
  SAMPLE_NOTE_EN,
  PROFILE_KEY,
  readProfile,
  writeProfile,
  posterProfile,
  SLOT_COUNT,
  blankSlots,
  readSlots,
  writeSlots,
  takeRole,
  placeSlot,
  replaceSlot,
  cardPath,
  homeBg,
  bandGeom,
  BAND_H,
  mintAvatar,
  adoptLocal,
  removeAvatar,
  dropUncommitted,
  pruneAvatars,
  planPoster,
  templateLabel,
  groupName,
  paintLayers,
  clipRounded,
  loadImage,
  quoteOf,
}
