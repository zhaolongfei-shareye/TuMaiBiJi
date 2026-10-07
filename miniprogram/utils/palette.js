// 色块方向的色板与封面生成规则（当前是 V2 左块右文）。
//
// 三条硬规则从 V1 原样继承，都是实测或推理出来的，别随手改：
// ① 六个高饱和色各自固定配一种字色。黄/橙/绿配白字实测只有 1.63 / 3.03 / 2.98，
//    直接看不清，所以这三块配深墨字；蓝/紫/墨配白字。配对关系写死在下面。
// ② 颜色由分类决定，同分类恒定同色；未分类一律墨黑，让"没归类"这件事一眼可见。
// ③ 卡里的抽象母题（圆/弧/条带/点阵/药丸）由笔记 id 取模决定，位置大小也从 id 派生。
//    所以同一条笔记永远画成同一个样子，同分类色相一致但构图不重样。
//    全部用 CSS 画，不生成文件、不调 AI 生图。
//
// V1→V2 变的只有承载方式：颜色从整张卡退到卡片左侧那块方块，正文回白底。
// 所以母题现在住在方块里（方块自己 overflow:hidden），尺寸区间按方块重算。

const TONES = [
  { name: '芥末黄', bg: '#F6C445', ink: '#2A2005' },
  { name: '宝蓝', bg: '#3F52D6', ink: '#FFFFFF' },
  { name: '橙', bg: '#E9723D', ink: '#2C1204' },
  { name: '草绿', bg: '#46A863', ink: '#06260F' },
  { name: '紫', bg: '#6E4BD0', ink: '#FFFFFF' },
]
const UNCATEGORIZED = { name: '墨黑', bg: '#23252C', ink: '#FFFFFF' }

// Tips 行前面那枚"小灯泡"用的黄。值与上面芥末黄同一支，但**不写成 TONES[0]**：
// 那五支是"分类身份"，谁排第一随时会因排序调整而变，提示点不该跟着它走。
// 也不许抄进 WXSS——`验-统一录入条.js` 有一条专门扫 wxss 里有没有色板里的饱和色。
const TIP_DOT = '#F6C445'

/**
 * 纸片墙那一族莫兰迪（站长 10-02 指定"经典色卡里那四枚"）。
 * 为什么单开一族而不吃 TONES 那五支：一枚 150rpx 见方的纸片整块铺饱和色会把标题抢掉，
 * 而 TONES 是"分类身份"那一套小面（点、chip、模板圆点）共用的，改它等于改三个地方。
 * 四组字/底对比实测 5.21 / 6.72 / 6.68 / 7.54，都在正文档那道 4.5 以上。
 */
const PAPERS = [
  { name: '炭灰蓝', bg: '#5B6470', ink: '#EDEFF2' },
  { name: '雾蓝', bg: '#A8BCC9', ink: '#23323C' },
  { name: '灰绿', bg: '#A9BCA6', ink: '#22331F' },
  { name: '藕荷', bg: '#D3B6B4', ink: '#3B2523' },
]
/**
 * 取哪一枚：吃**序号**而不是 categoryId。序号≤0（或未给/非数）=未分类，钉死第一枚炭灰蓝；
 * 分类按它们在分类表里的顺序往后排（第一个分类→雾蓝、第二个→灰绿、第三个→藕荷），
 * 排到第四枚起在这三枚里循环——**不回到炭灰蓝**，那一枚是"没归类"专用身份，
 * 让一个真分类跟它撞色，一屏上就分不清哪篇没归类了。
 * 为什么不拿 id 取模：站长那四枚是按"未分类/旅游/生活/私密"这个顺序点的色，
 * 而 id 是数据库自增的，取模会把 旅游 和 生活 撞成同一枚——同一屏两枚同色就不是分类身份了。
 * 与 toneColor(i) 是同一条做法：序号进、色出，界面上不写第二份色值。
 */
const paperSkinFor = (ordinal) => {
  const n = Number(ordinal)
  const cyc = PAPERS.length - 1
  const p = ordinal == null || isNaN(n) || n <= 0
    ? PAPERS[0]
    : PAPERS[1 + ((n - 1) % cyc)]
  return { bg: p.bg, ink: p.ink, name: p.name }
}
/**
 * 「已分享」那一枚色块（站长 10-02：一行模式右侧只留这一种状态，其他状态什么都不画）。
 * 底色吃 TONES[1] 那支宝蓝——效果图上那架纸飞机用的就是它，飞机撤了、颜色留下。
 * 白字压上去实测 6.2:1。和 TIP_DOT 同一条规矩：只从 palette 出，不许抄进 WXSS。
 */
const SHARED_TAG = { bg: TONES[1].bg, ink: '#FFFFFF' }

/**
 * 背景形象图的深浅三档（站长 10-02 定：点一下换一档，走到最沉那档再回最亮；
 * 界面上就是一枚灰度实心点，不做形状——月相那版点他看过否了）。
 *
 * veil = 现网那层压暗罩（`.page-scrim` / `.head-scrim`）铺几层，直接拧它的 opacity。
 *        0 就是**一点不压**，照片等于原图（他拿原图对过：我上一版"纯白"档实测只有原图亮度的
 *        62%，因为那层 0.42~0.72 的罩子还挂着——那一版把"不叠新层"当成了"不压暗"，是两回事）。
 *        1 就是这半年一直在跑的那七个停点，一个字没改。
 * dot  = 界面上那一枚点的灰度：点本身就是当前档，越沉的档点越黑。
 *
 * 默认停在中档（DIM_DEFAULT，站长 10-02 夜里改的口径）：他原话"三档默认中档就行了，
 * 把调亮度选择权给用户"。所以这一档既不压到最沉（现网那半年的样子），也不放到原图，
 * 取中间那一格；本机键被别的版本写成脏值也兜回这一档。
 * 这一组数与 TIP_DOT 同一条规矩：只从 palette 出，不许抄进 WXSS。
 */
const BG_DIMS = [
  { v: 0, name: '满月', veil: 0, dot: '#FFFFFF' },
  { v: 1, name: '半月', veil: 0.5, dot: '#A7ABB2' },
  { v: 2, name: '弯月', veil: 1, dot: '#5C6169' },
]
const DIM_DEFAULT = BG_DIMS[1]

const dimAt = (v) => BG_DIMS.find((d) => d.v === v) || DIM_DEFAULT
// 点一下换到下一档：满月 → 半月 → 弯月 → 满月。
const dimNext = (v) => BG_DIMS[(BG_DIMS.indexOf(dimAt(v)) + 1) % BG_DIMS.length].v
// 弯月那一档不发样式：CSS 里那层罩子本来就是全铺的，写个 opacity:1 是废话。
const dimScrimStyle = (v) => (dimAt(v).veil === 1 ? '' : `opacity:${dimAt(v).veil}`)
const dimDotStyle = (v) => `background:${dimAt(v).dot}`

/**
 * 壁纸名。中文是两字釉色本名（壁纸条只有"色块 + 名字"那么大地方），
 * 英文侧站长 10-01 晚补的：这一排以前在英文态还是八个汉字。
 * 一律收成单个词——那一格不放得下两行。
 */
function themeLabel(key, lang) {
  const theme = themeOf(key)
  if (!theme) return ''
  return lang === 'en' ? theme.labelEn || theme.label : theme.label
}

const MOTIFS = ['motif-circle', 'motif-arc', 'motif-stripes', 'motif-dots', 'motif-pill']

function hexToRgb(hex) {
  const h = (hex || '').replace('#', '')
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(s.slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}

// weightOfA = 第一个颜色占多少。想让某个颜色"只渗进去一点"，给它一个小权重。
function mix(a, b, weightOfA) {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return toHex(ca.map((v, i) => v * weightOfA + cb[i] * (1 - weightOfA)))
}

// 给一个 hex 加透明度。海报上"同一张图洗一层某色"（波普套色、人像上的色罩）靠它，
// 免得每个模板自己手写 rgba 字面量，色板就又散了。
function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

function hash(n) {
  // 把 id 打散成一个大整数，避免相邻 id 拿到相邻构图。
  const x = (Math.abs(Number(n) || 0) + 1) * 2654435761
  return x % 2147483647
}

/**
 * 分类对应的那组色。blockSkinFor 给的是 CSS 变量串，画布要的是裸色值，所以单独露一个。
 */
function toneFor(categoryId) {
  return categoryId == null ? UNCATEGORIZED : TONES[Math.abs(Number(categoryId)) % TONES.length]
}

/**
 * 生成一条笔记左侧那块方块的外观。
 * @param categoryId 笔记所属分类；null 走墨黑
 * @param noteId 笔记 id，决定构图
 * @returns {{style: string, motif: string}} style 直接塞进方块的 style 属性，motif 是母题类名
 */
function blockSkinFor(categoryId, noteId) {
  const tone = toneFor(categoryId)
  const ramp = rampFor(categoryId)
  const bg = ramp ? ramp.bg : tone.bg
  const ink = ramp ? ramp.ink : tone.ink
  const h = hash(noteId)
  const motif = MOTIFS[h % MOTIFS.length]
  // 母题只比底色暗/亮一点点，做质感不做主角
  const motifColor = mix(ink, bg, 0.16)
  // 墨黑这块在深色壁纸下会和卡片底糊在一起，只有它有描边；亮底上这条描边看不出来，所以两端都安全。
  // 色阶主题反过来：卡底是亮纸，最浅那两档（与卡底只差 1.2~1.6 的对比）会直接在卡上化掉，
  // 所以这里给一条"取 bg 和 ink 里更深那个"的细描边——浅档勾深边、深档勾深底边，都不刺眼。
  const edge = ramp
    ? withAlpha(lumOf(bg) < lumOf(ink) ? bg : ink, 0.22)
    : tone === UNCATEGORIZED ? 'rgba(255,255,255,0.16)' : 'transparent'
  const size = 108 + (h % 4) * 16 // rpx：108~156，方块 176rpx 见 app.wxss --blk
  const shift = 24 + (h % 3) * 8 // rpx：出界多少，从 id 派生
  const style = [
    `--blk-bg:${bg}`,
    `--blk-ink:${ink}`,
    `--blk-motif:${motifColor}`,
    `--blk-edge:${edge}`,
    `--motif-size:${size}rpx`,
    `--motif-shift:${shift}rpx`,
  ].join(';')
  return { style, motif }
}

/**
 * 只取某一组色的 CSS 变量串。给非笔记类的色块用（比如新建页那三张大卡、
 * 分类管理那列色点），免得有人在 WXSS 里另抄一份十六进制。
 * 连 --blk-motif 一起给：淡一层同色系图形要用的就是它，值仍从这一处派生。
 */
function toneStyle(i) {
  const tone = TONES[Math.abs(Number(i) || 0) % TONES.length]
  const ramp = rampFor(i)
  const bg = ramp ? ramp.bg : tone.bg
  const ink = ramp ? ramp.ink : tone.ink
  // --blk-glyph 比 --blk-motif 重一档（0.22 对 0.16）：新建页那三个图形要认得出来，
  // 但仍是压在卡底的水印，不是贴在表面的贴纸。
  //
  // 后面这组是"卡内控件的面"。新建页把输入框和按钮装进了饱和色大卡，
  // 面上用什么色取决于这块色本身是深还是浅：深底卡（字是白的）用半透明白面，
  // 亮底卡（字是深墨）用近白面 + 该卡自己的墨色字，否则黄/橙上放白半透明面会糊成一片。
  const onDark = inkIsLighter(bg, ink)
  return [
    `--blk-bg:${bg}`,
    `--blk-ink:${ink}`,
    `--blk-motif:${mix(ink, bg, 0.16)}`,
    `--blk-glyph:${mix(ink, bg, 0.22)}`,
    `--face:${onDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.78)'}`,
    `--face-ink:${onDark ? '#FFFFFF' : ink}`,
    `--face-off:${onDark ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.34)'}`,
    `--face-off-ink:${onDark ? 'rgba(255,255,255,0.5)' : mix(ink, bg, 0.45)}`,
    `--solid-bg:${onDark ? '#FFFFFF' : ink}`,
    `--solid-ink:${onDark ? bg : '#FFFFFF'}`,
    // 校验/权限提示那行字直接坐在卡色上，所以亮底卡用深红、深底卡用浅红，两边都够对比度。
    // 深红这一支原来也是手挑的（色阶那套 #7A1A13）：甲档第三档比原来暗了 3 档，同一个红掉到
    // 3.44~3.54（要 4.5），所以改成现算——enforce 只往"更深"的方向挪 L，挪到刚好过线为止，
    // 浅一档的卡色上它仍然是原来那个红，不会被无谓地压深。
    `--blk-err:${onDark ? '#FFD7D3' : enforce(ramp ? '#7A1A13' : '#8C2119', bg, 4.5)}`,
  ].join(';')
}

/**
 * 某一档的裸底色。
 * @param i 档号（和分类号同一套取模规则）
 * @param themeKey 画"别的主题"时必须传：壁纸选择器那一排缩略图每格画的都是另一套主题，
 *                 不传就会拿当前激活的主题去染色——停在象牙时去看天青那一格，
 *                 不带 ramp 的那几枚壁纸的缩略图也会跟着变成色阶色（真机截图里抓到过）。
 */
function toneColor(i, themeKey) {
  const theme = themeKey ? themeOf(themeKey) : ACTIVE_THEME
  const ramp = theme && theme.ramp
  if (ramp) return ramp.steps[Math.abs(Number(i) || 0) % ramp.steps.length]
  return TONES[Math.abs(Number(i) || 0) % TONES.length].bg
}

/**
 * 只给一对裸色，不给 --blk-bg。
 * 中性面板里想借用分类色（比如详情页的序号圆点）时用这个：
 * 直接贴方块那串会把整块中性面板染成色块。
 */
function toneVars(categoryId) {
  const tone = toneFor(categoryId)
  const ramp = rampFor(categoryId)
  return `--tone-bg:${ramp ? ramp.bg : tone.bg};--tone-ink:${ramp ? ramp.ink : tone.ink}`
}

/**
 * 四套壁纸（=主题），10-04 定稿。page/line 必须和 app.wxss 里 .theme-* 的
 * --bg-page/--bg-card 逐字等值，--btn-bg 同理必须等于 chromeOf(key).sel
 * （app.wxss 是 CSS、引不了 JS，镜像值是既有做法，等值由色板那把尺子逐枚钉死）。
 * 之所以在 JS 里再存一份：导航条颜色只能由 wx.setNavigationBarColor 传值，
 * 壁纸选择器也要靠它画缩略图，两处都不能猜 CSS 变量。
 *
 * 四枚都是"整套色阶"主题（都带 ramp）：不只换页面底，连左侧方块、新建页那三张大卡、
 * 按钮和标签都收进同一支色相，五档明度对应原来那五支彩色。
 * 色相种子不是我挑的：象牙/天青沿用现网那两枚的 H，樱落＝站长给的莫兰迪参考卡
 * 「樱落」那一格（R212 G172 B191），雨雾＝同一张卡的「豪雨」（R189 G192 B201）。
 * 取数规则三条，全部写在 docs/design/配色统一-四套莫兰迪/生成色板5.py，那一份是唯一出处；
 * 改任何一条都要回生成器重算，别在手底下改 hex：
 * ① 页面底 L86（站长在甲 L86 / 乙 L78 里挑了甲），卡底比页面底亮 9 档。
 * ② 浅三档**锚卡底**、离卡底 11.8 / 21.4 / 33.9 个 L——照的是现网那套他认过的象牙 ramp
 *    的实测距离。锚页面底会出事：甲档下第一档离卡底只剩 2.7 档、对比 1.06，
 *    那块 176rpx 的色块直接化在卡上（v3 就踩了这个，10-04 第二轮量出来才改）。
 * ③ 深两档按 WCAG 反解（方块上那行分类名 16px/800 算小字，门槛 4.5），第 5 档再压 6 档。
 *
 * 四枚一律走服务端持久化（站长 10-04 拍「统一」）：后端 WALLPAPER_PRESETS 已把这四个 key
 * 都收进白名单，所以这里不再有 local 标记、app.js 里那套"只存本机"的旁路也撤干净了。
 * 雨雾沿用 gradient-blue 那个旧 key，象牙/天青/樱落是新加的三枚——旧六个值一个都没删，
 * 存量账号下次 PUT 不会被 400。（方案文档 §5.4 那条不一致到此结案。）
 *
 * line / lineEdge 只给缩略图里那两条中性描边行用：缩略图每一格画的都是"别的主题"，
 * 它拿不到当前主题的 CSS 变量，六个值必须由 JS 一个个带进去。
 */
const THEMES = [
  {
    key: 'tint-paper', cls: 'theme-tint-paper', label: '象牙', labelEn: 'Ivory',
    page: '#E2DED4', line: '#F3F3F1', lineEdge: 'rgba(53, 46, 29, 0.13)', dark: false,
    ramp: {
      steps: ['#DCD8CC', '#C9C1AE', '#AFA488', '#766B50', '#645B43'],
      inks: ['#352E1D', '#352E1D', '#352E1D', '#F2EFE9', '#F2EFE9'],
      uncategorized: { bg: '#352E1D', ink: '#F2EFE9' },
    },
  },
  {
    key: 'tint-celadon', cls: 'theme-tint-celadon', label: '天青', labelEn: 'Celadon',
    page: '#D4E2D7', line: '#F1F3F2', lineEdge: 'rgba(29, 53, 34, 0.13)', dark: false,
    ramp: {
      steps: ['#CCDCCF', '#AEC9B4', '#88AF91', '#4F7557', '#43634A'],
      inks: ['#1D3522', '#1D3522', '#1D3522', '#F2EFE9', '#F2EFE9'],
      uncategorized: { bg: '#1D3522', ink: '#F2EFE9' },
    },
  },
  {
    key: 'tint-blush', cls: 'theme-tint-blush', label: '樱落', labelEn: 'Blush',
    page: '#E2D4DB', line: '#F3F1F2', lineEdge: 'rgba(53, 29, 41, 0.13)', dark: false,
    ramp: {
      steps: ['#DCCCD4', '#C9AEBB', '#AF889C', '#8C5F76', '#7A5266'],
      inks: ['#351D29', '#351D29', '#351D29', '#F2EFE9', '#F2EFE9'],
      uncategorized: { bg: '#351D29', ink: '#F2EFE9' },
    },
  },
  {
    key: 'gradient-blue', cls: 'theme-blue', label: '雨雾', labelEn: 'Mist',
    page: '#D7D9E0', line: '#F1F2F3', lineEdge: 'rgba(33, 36, 49, 0.13)', dark: false,
    ramp: {
      steps: ['#CED1D9', '#B3B7C4', '#8F95A8', '#666C84', '#595F73'],
      inks: ['#212431', '#212431', '#212431', '#F2EFE9', '#F2EFE9'],
      uncategorized: { bg: '#212431', ink: '#F2EFE9' },
    },
  },
]

/**
 * 旧壁纸 key → 现在生效的那一枚。六枚压成四枚（站长 10-04 拍：米白并入象牙），
 * 但后端 WALLPAPER_PRESETS 那六个值**一个都不动**：存量值还得收得下，PUT 才不报 400，
 * 而加 key 就要部署。所以并档只做在前端这一层解析。
 *
 * 现网实测（10-04 只读查询）：18 个用户里 14 存 default、4 存 gradient-ocean，
 * 深色那两枚从 09-30 起本来就被打回米白，所以这 18 个人屏幕上现在都是米白——
 * 并档不会让任何人"丢了他选的壁纸"，因为他选的本来就没在生效。
 * 代价站长认过：那 14 人的整屏从 #f4f2ec 变深到 #E2DED4（ΔL 8.2，两色并排对比 1.20）。
 */
const WALLPAPER_ALIAS = {
  default: 'tint-paper',
  'gradient-green': 'tint-celadon',
  'gradient-sunset': 'tint-paper',
  'gradient-purple': 'tint-paper',
  'gradient-ocean': 'tint-paper',
}

/**
 * 海报专用配色组。界面那六组色是"分类身份"，海报要的是"这一张好不好看、愿不愿意转发"，
 * 所以这里按风格成套给：同一套风格内部再按分类确定性取一个色向，
 * 于是同一条笔记在同一个模板上永远长一个样，但换分类会换色、换模板会换气质。
 *
 * 字段是约定死的，模板只能读这几个：
 *   bg/ink/sub        压在底色上的主字色与次要字色
 *   panel/panelInk    内容面板（白卡/玻璃卡）的底色与字色
 *   accent/accentInk  强调块（色带、序号、按钮）的底色与字色
 *   c1/c2             渐变两端；不用渐变的模板忽略
 *   dot               网点/母题这类"质感色"，一律带透明度
 * 每组都过了一遍对比度脚本：ink 压 bg、panelInk 压 panel、accentInk 压 accent 都要 ≥3。
 */
const POSTER_SCHEMES = {
  pop: [
    { name: '波普·亮黄', bg: '#FFD84D', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#FF3D6E', accentInk: '#FFFFFF', c1: '#FFD84D', c2: '#FFD84D', dot: 'rgba(23,24,28,0.16)' },
    { name: '波普·品红', bg: '#FF3D6E', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#2B44FF', accentInk: '#FFFFFF', c1: '#FF3D6E', c2: '#FF3D6E', dot: 'rgba(23,24,28,0.18)' },
    { name: '波普·宝蓝', bg: '#2B44FF', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.74)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#FFD84D', accentInk: '#17181C', c1: '#2B44FF', c2: '#2B44FF', dot: 'rgba(255,255,255,0.22)' },
    { name: '波普·青绿', bg: '#00C7A9', ink: '#06231D', sub: 'rgba(6,35,29,0.66)', panel: '#FFFFFF', panelInk: '#06231D', accent: '#FF6B4A', accentInk: '#2C1204', c1: '#00C7A9', c2: '#00C7A9', dot: 'rgba(6,35,29,0.16)' },
  ],
  neon: [
    { name: '电光·蓝紫', bg: '#3A49D8', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.84)', panel: 'rgba(255,255,255,0.14)', panelInk: '#FFFFFF', accent: '#FFFFFF', accentInk: '#2A22A0', c1: '#5B4BF0', c2: '#1B1470', dot: 'rgba(255,255,255,0.16)' },
    { name: '电光·暮色', bg: '#A82C86', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.86)', panel: 'rgba(255,255,255,0.16)', panelInk: '#FFFFFF', accent: '#FFD84D', accentInk: '#17181C', c1: '#6D1F9E', c2: '#D6336C', dot: 'rgba(255,255,255,0.18)' },
    { name: '电光·深海', bg: '#1B2E7A', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.78)', panel: 'rgba(255,255,255,0.12)', panelInk: '#FFFFFF', accent: '#7CF5C1', accentInk: '#06260F', c1: '#0B1B4A', c2: '#2B44FF', dot: 'rgba(255,255,255,0.14)' },
    { name: '电光·紫罗兰', bg: '#7A52DE', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.80)', panel: 'rgba(255,255,255,0.14)', panelInk: '#FFFFFF', accent: '#FFD84D', accentInk: '#17181C', c1: '#5B2CF0', c2: '#9B5DE5', dot: 'rgba(255,255,255,0.16)' },
  ],
  riso: [
    { name: '孔版·陶土', bg: '#F4EFE6', ink: '#23252C', sub: 'rgba(35,37,44,0.62)', panel: '#FFFFFF', panelInk: '#23252C', accent: '#E4694A', accentInk: '#2C1204', c1: '#F4EFE6', c2: '#EDE4D4', dot: 'rgba(228,105,74,0.20)' },
    { name: '孔版·紫黄', bg: '#EDEAF7', ink: '#241C4A', sub: 'rgba(36,28,74,0.62)', panel: '#FFFFFF', panelInk: '#241C4A', accent: '#6E4BD0', accentInk: '#FFFFFF', c1: '#EDEAF7', c2: '#E1DBF3', dot: 'rgba(110,75,208,0.18)' },
    { name: '孔版·薄荷', bg: '#E6F1EA', ink: '#12301F', sub: 'rgba(18,48,31,0.62)', panel: '#FFFFFF', panelInk: '#12301F', accent: '#46A863', accentInk: '#06260F', c1: '#E6F1EA', c2: '#D8E9DE', dot: 'rgba(70,168,99,0.20)' },
  ],
  mono: [
    { name: '墨·黑', bg: '#0E0F12', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#F6C445', accentInk: '#2A2005', c1: '#22242C', c2: '#0E0F12', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·绿', bg: '#0F2119', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#7BE0A0', accentInk: '#06260F', c1: '#1B3A2C', c2: '#0F2119', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·蓝', bg: '#0B1436', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.09)', panelInk: '#FFFFFF', accent: '#5FB0FF', accentInk: '#04122E', c1: '#16265C', c2: '#0B1436', dot: 'rgba(255,255,255,0.10)' },
    { name: '墨·棕', bg: '#1D1611', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.72)', panel: 'rgba(255,255,255,0.08)', panelInk: '#FFFFFF', accent: '#F6C445', accentInk: '#2A2005', c1: '#33261B', c2: '#1D1611', dot: 'rgba(255,255,255,0.10)' },
  ],
  spec: [
    { name: '规格·纸白', bg: '#F7F8FA', ink: '#0B0D12', sub: 'rgba(11,13,18,0.62)', panel: '#FFFFFF', panelInk: '#0B0D12', accent: '#2E6BFF', accentInk: '#FFFFFF', c1: '#F7F8FA', c2: '#EEF1F6', dot: 'rgba(11,13,18,0.07)' },
    { name: '规格·石墨', bg: '#14161C', ink: '#FFFFFF', sub: 'rgba(255,255,255,0.74)', panel: 'rgba(255,255,255,0.07)', panelInk: '#FFFFFF', accent: '#7CF5C1', accentInk: '#06260F', c1: '#1B1F28', c2: '#0E1014', dot: 'rgba(255,255,255,0.08)' },
    { name: '规格·米格', bg: '#FFFDF5', ink: '#1A1C22', sub: 'rgba(26,28,34,0.62)', panel: '#FFFFFF', panelInk: '#1A1C22', accent: '#FF5A1F', accentInk: '#FFFFFF', c1: '#FFFDF5', c2: '#F6F1E4', dot: 'rgba(26,28,34,0.07)' },
    { name: '规格·冷蓝', bg: '#EAF0F6', ink: '#0B1A45', sub: 'rgba(11,26,69,0.62)', panel: '#FFFFFF', panelInk: '#0B1A45', accent: '#2E6BFF', accentInk: '#FFFFFF', c1: '#EAF0F6', c2: '#DDE7F2', dot: 'rgba(11,26,69,0.07)' },
  ],
  lime: [
    { name: '酸性·柠', bg: '#D9F24A', ink: '#17181C', sub: 'rgba(23,24,28,0.66)', panel: '#FFFFFF', panelInk: '#17181C', accent: '#17181C', accentInk: '#D9F24A', c1: '#D9F24A', c2: '#B9E02F', dot: 'rgba(23,24,28,0.14)' },
    { name: '酸性·青', bg: '#5FE9E0', ink: '#05272A', sub: 'rgba(5,39,42,0.66)', panel: '#FFFFFF', panelInk: '#05272A', accent: '#2B44FF', accentInk: '#FFFFFF', c1: '#5FE9E0', c2: '#38CFD6', dot: 'rgba(5,39,42,0.14)' },
    { name: '酸性·桔', bg: '#FFB03A', ink: '#2C1204', sub: 'rgba(44,18,4,0.66)', panel: '#FFFFFF', panelInk: '#2C1204', accent: '#17181C', accentInk: '#FFB03A', c1: '#FFB03A', c2: '#FF8A3D', dot: 'rgba(44,18,4,0.14)' },
  ],
}

/**
 * 取某一类海报风格里、这条笔记对应的那组色。
 * 用 hash 而不是取模序号：分类 id 相邻（1/2/3）在六组色里跳着取，
 * 才不会出现"相邻两条笔记的波普海报是相邻两个色"这种一眼看穿的规律。
 */
function schemeFor(style, categoryId) {
  const list = POSTER_SCHEMES[style] || []
  if (!list.length) return null
  return list[Math.abs(hash(categoryId)) % list.length]
}

/**
 * 波普四格用的四个版色。
 * 取法不是"一组色里挑四个"——一组只有底和强调两块，硬凑出来的第三第四块
 * 只能是掺白的浅色，印出来发灰。这里跨着相邻的几组各拿一块，四格才是四个色相。
 */
function plateColors(categoryId) {
  const list = POSTER_SCHEMES.pop
  const i = Math.abs(hash(categoryId)) % list.length
  const n = list.length
  return [list[i].bg, list[i].accent, list[(i + 1) % n].bg, list[(i + 2) % n].accent]
}

function themeOf(wallpaper) {
  const key = WALLPAPER_ALIAS[wallpaper] || wallpaper
  return THEMES.find((x) => x.key === key) || THEMES[0]
}

/* 「笔记卡片」那一格空态的淡底（站长 10-03 原话："做一个淡淡方形，用背景风格的主色阶"）。
   详情窗与详情页两页右上那一格吃这一个函数——10-07 之前它写在首页里，详情页要补同一格时
   只能抄一遍色号，那就是第二份真相。
   10-04 压成四枚壁纸之后规则只剩一条：吃当前主题色阶的最浅那一档（steps[0]）。
   下面那句 mix() 掺 8% 墨的算法现在没有壁纸会走到，留着是给"新加一枚壁纸忘了写 ramp"兜底
   ——那条一触发就会拿页面底去掺，深色那两枚的页底是近黑，掺出来压在纸白面上就是他打回过的
   "太明显了"，所以兜底参照物换成窗口那张纸白。 */
const SHEET_PAPER = '#FCFBF8'
function paleStep(wallpaper) {
  const th = themeOf(wallpaper)
  if (th.ramp && th.ramp.steps && th.ramp.steps.length) return th.ramp.steps[0]
  return mix('#23252C', th.dark ? SHEET_PAPER : th.page, 0.08)
}

/**
 * 当前生效的那套壁纸。由 app.applyTheme 在每次应用主题时写进来。
 * 之所以做成模块状态而不是参数：新建页那三张卡、首页搜索卡的颜色是在 Page 的
 * data 字面量里算出来的（模块加载时就定了），拿不到"这一页当前是哪套主题"。
 */
let ACTIVE_THEME = null

function setActiveTheme(wallpaper) {
  ACTIVE_THEME = themeOf(wallpaper)
  return ACTIVE_THEME
}

/**
 * 某套主题的"整套色阶"取档（10-04 起四枚壁纸全部带 ramp）。
 * 索引公式和 toneFor 逐字一致，所以同一个分类还是同一档，
 * 只是把五支彩色收成了一支色相、用深浅代替色相。
 * 下面那个 `if (!ramp) return null` 现在没有壁纸会走到，留着是给"新加一枚壁纸忘了写 ramp"
 * 兜底的——那条一触发就等于把分类色悄悄带回彩色那套（规范 §3.8 明令禁止），
 * 所以新增壁纸必须自带 ramp，别指望这个分支。
 * wallpaper 那一个参数是给底部导航组件用的：它拿不到 page 上的 CSS 变量，也不能依赖
 * ACTIVE_THEME（那是 app.applyTheme 给页面写的）。不传就是老行为，一处调用没改。
 */
function rampFor(categoryId, wallpaper) {
  const theme = wallpaper ? themeOf(wallpaper) : ACTIVE_THEME
  const ramp = theme && theme.ramp
  if (!ramp) return null
  if (categoryId == null) {
    return { bg: ramp.uncategorized.bg, ink: ramp.uncategorized.ink }
  }
  const i = Math.abs(Number(categoryId)) % ramp.steps.length
  return { bg: ramp.steps[i], ink: ramp.inks[i] }
}

/**
 * 一块色的视觉轻重（亮度加权，和电视信号那套系数一致）。
 * 只用来比"字和底谁更亮"，不当对比度用——那要另一条公式。
 */
function lumOf(hex) {
  const [r, g, b] = hexToRgb(hex)
  return r * 0.299 + g * 0.587 + b * 0.114
}

/**
 * 这块色算"深底"吗——判据是字比底亮，不是"字是不是纯白"。
 * 原来那句 `ink === '#FFFFFF'` 对现有六组色的判定结果，和这条逐组一致（单测钉住）；
 * 换成色阶之后深两档配的是米白字而不是纯白，只有这条判得对。
 */
function inkIsLighter(bg, ink) {
  return lumOf(ink) > lumOf(bg)
}

/* ---------- 下面这一段是 D2 那批的取色规则（docs/规划-笔记列表轻盈化-20260927.md §1.2） ----------
   两条都是函数不是表：后端还会加壁纸、分类数也会变，写成常量表就是每加一枚改一次代码。 */

const PAPER = '#F2EFE9'   // 官网那支纸白，压在派生出来的深色面上

function rgbToHsl(hexStr) {
  const [rr, gg, bb] = hexToRgb(hexStr)
  const r = rr / 255, g = gg / 255, b = bb / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  let h = 0
  if (d) {
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h *= 60
  }
  const l = (mx + mn) / 2
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0
  return [h, s * 100, l * 100]
}

function hslToHex(h, s, l) {
  const ss = s / 100, ll = l / 100
  const c = (1 - Math.abs(2 * ll - 1)) * ss
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ll - c / 2
  const seg = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex(seg.map((v) => (v + m) * 255))
}

/** WCAG 相对亮度与对比度。lumOf 那条是"轻重"，不能拿来判达标。 */
function crOf(a, b) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  const one = (hexStr) => { const [r, g, b2] = hexToRgb(hexStr); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2) }
  const x = one(a), y = one(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * 把一支色调到能压住某块底：色相 H 与饱和度 S 都不动，只挪明度 L。
 * 方向看底——白卡上把色压深，深卡上把色抬亮；本来就过线就原样返回。
 * 不往墨/纸的方向混：那样宝蓝会灰成一片 #97A0DF。分类身份要的是
 * "还是这支色，只是深浅变了"，所以只动 L。
 */
function enforce(color, on, need) {
  if (crOf(color, on) >= need) return color
  const [h, s, l] = rgbToHsl(color)
  const up = lumOf(on) < lumOf(color)
  let lo = up ? l : 0, hi = up ? 100 : l
  for (let k = 0; k < 26; k += 1) {
    const mid = (lo + hi) / 2
    const hit = crOf(hslToHex(h, s, mid), on) >= need
    if (up) { if (hit) hi = mid; else lo = mid } else { if (hit) lo = mid; else hi = mid }
  }
  return hslToHex(h, s, up ? hi : lo)
}

/**
 * 解出"纸白压得住、又尽可能浅"的那一档明度：H、S 都不动，只挪 L。
 * 二分只到实数，落进 8 位色还要四舍五入，会吃掉 0.01~0.05——所以解完再往下退到
 * **这个 hex 真的过线**为止（不补这一刀，表里写的 4.7 实测只有 4.66）。
 * 参数与 docs/design/配色统一-四套莫兰迪/生成色板5.py 里的 fit_dark 逐字一致。
 */
function lightFaceOnPaper(h, s, want) {
  let lo = 5, hi = 60
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2
    if (crOf(PAPER, hslToHex(h, s, mid)) < want) hi = mid; else lo = mid
  }
  let l = (lo + hi) / 2
  for (let k = 0; k < 40; k += 1) {
    if (crOf(PAPER, hslToHex(h, s, l)) >= want) break
    l -= 0.4
  }
  return l
}

/**
 * 底栏和搜索条那一块面：由壁纸的页面底派生。
 * bg（那一条底）一个字没动：H 原样、S 夹进 [30,45]（低于 30 灰成一块脏、高于 45 抢内容）、
 * 浅壁纸 L 20.5。字一律纸白，未选中那一档靠 alpha 分深浅（浅 .62 / 深 .68）。
 * 返回的 style 串直接塞进 style 属性——组件拿不到 page 上的 CSS 变量。
 *
 * sel 是选中态那枚圆底，同时**也是全局深色实心按钮那一面**（#304 甲那条决定：
 * 深色按钮必须和底栏"选中那一格"下面那块圆底同色，app.wxss 的 --btn-bg 就是它的镜像值）。
 * 10-04 改过一次：原来它的 L 是写死的（bg 抬 16 档＝36.5），只看色相不看对比，
 * 于是"不想太深"和"两处同色"这两句只能实现一句。现在 L 由纸白 4.7 反解，两句同时成立。
 * S 也不再夹到 30，改成页面底自己的 1.25 倍——雨雾那一枚页面底只有 S 12，
 * 夹到 30 会把它顶成一支蓝（站长 10-04 明确撤过蓝）。四枚实测：
 * 象牙 #766948(L37.3)、天青 #467350(L36.3)、樱落 #915975(L45.9)、雨雾 #616986(L45.3)，
 * 纸白压上去 4.70~4.78，图形门槛 3.0 更是远过。
 */
function chromeOf(wallpaper) {
  const theme = themeOf(wallpaper)
  const [h, s] = rgbToHsl(theme.page)
  const sat = Math.min(45, Math.max(30, s))
  const light = theme.dark ? 30 : 20.5
  const bg = hslToHex(h, sat, light)
  const selSat = s * 1.25
  const sel = hslToHex(h, selSat, lightFaceOnPaper(h, selSat, 4.7))
  const idle = withAlpha(PAPER, theme.dark ? 0.68 : 0.62)
  const line = withAlpha(PAPER, theme.dark ? 0.22 : 0.14)
  const shadow = withAlpha('#000000', theme.dark ? 0.42 : 0.22)
  return {
    bg, ink: PAPER, idle, line, shadow, sel,
    style: `--chrome-bg:${bg};--chrome-ink:${PAPER};--chrome-idle:${idle};--chrome-line:${line};--chrome-shadow:${shadow};--chrome-sel:${sel}`,
  }
}

/**
 * 分类身份在行卡 meta 行上的两档取色（D2：一块 14rpx 的点 + 二十几个 rpx 的三个字）。
 * 点色 = 这支色本身。浅色卡下它不单独达标是允许的（芥末黄压白卡 1.63）：紧挨着的
 * 分类名已经过了门槛，去掉颜色也不影响读出"这是哪一类"，WCAG 1.4.1 管的是
 * "只靠颜色才能理解"的那些信息。深色卡下原色会化掉，所以那档点和字同值。
 * 门槛两档：浅壁纸按 5、深壁纸按 7（效果图实测到的最低值就是 4.97 / 7.09，
 * 往 round 数靠）。这两个数都比 WCAG 的 4.5 严——这一行是分类身份，不是正文。
 * 卡底由这里算，不在页面里写死：四枚浅色壁纸各吃自己主题的 line
 * （象牙那块是 #F3F3F1，既不是纯白也不是页面底 #E2DED4）。
 */
function catSkinFor(categoryId, wallpaper) {
  const theme = themeOf(wallpaper)
  const ramp = rampFor(categoryId, wallpaper)
  const raw = ramp ? ramp.bg : toneFor(categoryId).bg
  const card = theme.dark ? mix('#FFFFFF', theme.page, 0.05) : theme.line
  const text = enforce(raw, card, theme.dark ? 7 : 5)
  // 未分类在深色下连点都撤掉，换成空心环——"没归类"该长得不一样。
  // 点什么时候用原色、什么时候跟着字走：带 ramp 的这四枚第一档都是"原色在这块卡上会化掉"
  // （#DCD8CC 压 #F3F3F1 只有 1.28），所以点换成算出来的字色；不带 ramp 的那几枚原色点是一块能看见的
  // 色，就照效果图留原色——包括芥末黄那枚压白卡只有 1.63 的点，理由见上面那段 1.4.1。
  return { dot: theme.dark || ramp ? text : raw, text, ring: categoryId == null && theme.dark, card }
}

module.exports = {
  TONES,
  PAPERS,
  paperSkinFor,
  SHARED_TAG,
  UNCATEGORIZED,
  TIP_DOT,
  BG_DIMS,
  dimAt,
  dimNext,
  dimDotStyle,
  dimScrimStyle,
  MOTIFS,
  THEMES,
  WALLPAPER_ALIAS,
  POSTER_SCHEMES,
  schemeFor,
  plateColors,
  blockSkinFor,
  toneFor,
  toneVars,
  toneStyle,
  toneColor,
  themeOf,
  paleStep,
  themeLabel,
  setActiveTheme,
  rampFor,
  chromeOf,
  catSkinFor,
  crOf,
  inkIsLighter,
  mix,
  withAlpha,
  hexToRgb,
  lumOf,
}
