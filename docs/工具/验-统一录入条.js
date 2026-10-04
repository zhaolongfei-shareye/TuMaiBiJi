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
ok('点条身 = 直接写', /class="bar \{\{active \? 'open' : ''\}\}" catchtap="openBar"/.test(wxml))
/* 这条是补 09-28 那个真 bug：wxss 里 .bar.open 的规则一直写着，wxml 却从来没挂过这个类，
   于是展开态还是纸白胶囊 + 下面一块独立的白面板，和效果图不是一套。
   只查 CSS 有规则等于没查——规则和挂载必须一起断。 */
ok('展开态那条规则真的被挂上了（CSS 有规则 + WXML 有绑定，缺一即红）',
  /\.bar\.open\s*\{/.test(wxss) && /class="bar \{\{active \? 'open' : ''\}\}"/.test(wxml))
ok('面板自己吃掉点击，不会一点输入框就收起', /class="panel" catchtap="noop"/.test(wxml))
ok('整页仍是收起点击区', /bindtap="collapse"/.test(wxml))

// ---------- 3. 一个功能只留一个入口 ----------
ok('换背景只是导流，不弹相册', /goHomeBg\(\)\s*\{\s*wx\.navigateTo/.test(js) && !/goHomeBg[\s\S]{0,200}chooseMedia/.test(js))
ok('导流目标还是那一页', /navigateTo\(\{ url: '\/pages\/profile\/profile' \}\)/.test(js))
ok('选图入口全页只有 pickImage 一处', (js.match(/wx\.chooseMedia/g) || []).length === 1)
ok('换背景那一行只在铺了图时存在', /wx:if="\{\{bgSrc\}\}" class="home-swap"/.test(wxml))

// ---------- 4. 状态机：mode 与 active 的对应 ----------
ok('camera / album 都落到 shot 那一段', /mode === 'camera' \|\| mode === 'album' \? 'shot' : mode/.test(js))
// 10-01 晚整套换成 Lucide 那一支：写=pen-line、相册=images（原来那枚"四格"读的是"网格"，
// 不是"从相册挑照片"）。四支都必须在这页 wxss 里有对应的 mask 形状。
ok('四个模式各自的图形都给了（pen / camera / images / link 四支都在）', /leadFor\(mode\)/.test(js)
  && /write: 'pen', camera: 'camera', album: 'images', url: 'link'/.test(js)
  && ['glyph-pen', 'glyph-camera', 'glyph-images', 'glyph-link'].every((c) => wxss.includes('.' + c))
  && !/glyph-pencil|glyph-album/.test(js + wxss))
// 描边重量整套只留一个值：原来这组里 1.5（link/image/pencil）和 1.6（camera/album）混着，
// 同一排小图形在 38~52rpx 上粗细不齐——这正是"自己画的显廉价"的那一半原因。
const sw = [...new Set((wxss.match(/stroke-width='[\d.]+'/g) || []).map((x) => x.slice(14, -1)))]
ok('这一页的图形描边只有一个重量，且是 1.6', sw.length === 1 && sw[0] === '1.6', sw.join(','))
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
// 62vh 是量出来的：42vh 是三张卡（整组 480 高）时代的数，只剩一条 128 高的条时照旧数推上去
// 条底会比底栏还低；66vh 是 09-28 那一版的落点，09-30 标题下补了日期＋星期那一行之后整组被
// 往下推了 26px（换背景那一行钻进底栏后面），收到 62vh 才回到「行底 681 / 底栏顶 689」。
// 关键是这段留白挂在 .entry-wrap 本身、不带 has-bg：这一屏永远有图，也不会有第二种落点。
ok('留白 62vh，且不随背景开关变', /\.entry-wrap\s*\{[^}]*margin-top: 62vh/.test(wxss)
  && !/\.container\.has-bg \.entry-wrap\s*\{[^}]*margin-top/.test(wxss))
// 09-28 深夜起展开不再"让位到顶"，而是整块 fixed 贴到底栏上方（真机反馈：从顶上挂下来
// 把照片和标题全盖住了）。留白那条 margin-top:0 仍在，但只是"从流里拿出来"的副作用。
ok('展开时整块 fixed 贴底，且不再吃那 62vh',
  /\.container\.entry-dock \.entry-wrap\s*\{[^}]*position: fixed/.test(wxss)
  && /\.container\.entry-dock \.entry-wrap\s*\{[^}]*margin-top: 0/.test(wxss))
ok('旧手风琴的高度档全部清掉了', !/\.open-url|\.open-shot|\.open-write|\.entry-label/.test(wxss))
ok('条身 128 高、胶囊圆角', /\.bar\s*\{[^}]*height: 128rpx/.test(wxss) && /\.bar\s*\{[^}]*--r-pill/.test(wxss))
ok('展开时条与面板同一块白、接缝圆角对上', /\.bar\.open\s*\{[^}]*--r-card/.test(wxss) && /\.panel\s*\{[^}]*0 0 var\(--r-card\)/.test(wxss))
ok('面板自带一套"纸面"控件变量', ['--face:', '--face-ink:', '--face-ph:', '--solid-bg:', '--solid-ink:', '--blk-err:']
  .every((v) => new RegExp('\\.panel\\s*\\{[\\s\\S]*?' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(wxss)))
/* <textarea> 的 placeholder 不吃 opacity：实测 摘要 那格是全墨 #23252c、标题 那格才是 50%。
   所以这一档必须由带 alpha 的色发下来，谁哪天把 opacity 加回去，两种输入框又会分家。 */
const appwxss = fs.readFileSync(P('app.wxss'), 'utf8')
ok('占位符那一档改用 --face-ph 发色，不再靠 opacity',
  /\.face-ph\s*\{[^}]*var\(--face-ph/.test(appwxss) && !/\.face-ph\s*\{[^}]*opacity/.test(appwxss))
ok('压暗层收到底部 0.72', /0\.72\)\s*100%/.test(wxss))
// 站长 10-01 晚：那枚照片图标撤掉、换成一枚小箭头，字号并到 Tips 那一档（--fs-meta 24）。
// 整行热区 110 高没动——撤的是图形，不是可点的那一条。
ok('换背景那行仍是 110 高，图标换成 24 的小箭头、字并到 Tips 那一档',
  /height: 110rpx/.test(wxss)
  && /\.swap-glyph\s*\{[^}]*width: 24rpx/.test(wxss)
  && /glyph-chev/.test(wxml) && /\.glyph-chev\s*\{/.test(wxss)
  && /\.swap-text\s*\{[^}]*font-size: var\(--fs-meta\)/.test(wxss))
ok('条身那一档收到笔记标题同一档（--fs-title 31，原来 46）',
  /\.bar-label\s*\{[^}]*font-size: var\(--fs-title\)/.test(wxss) && !/font-size: 46rpx/.test(wxss))
ok('Tips 那一行：字号吃 --fs-meta、左边留空 48rpx，且展开态不渲染',
  /\.tips\s*\{[^}]*font-size: var\(--fs-meta\)/.test(wxss)
  && /\.tips\s*\{[^}]*padding-left: 48rpx/.test(wxss)
  && !/text-indent/.test(wxss)
  && /wx:if="\{\{!active && tips\.length\}\}"/.test(wxml))
// 这一行整块是从流里"抵掉"的：盒子高 = 负 margin 的绝对值时，横条才一动不动。
// 上一版写成 height:34 / margin:-68，两个数不等，横条被往上顶了 34rpx，
// 而 Tips 的文字底紧贴条顶（他要的是"离下方横条保留一行距离"）。
// 这里不钉 68 这个具体数（那是"文字 34 + 间距 34"的和），钉的是这两个数必须相等。
const tipsSeg = /\.tips\s*\{([^}]*)\}/.exec(wxss) || [, '']
const tipsH = parseFloat((/height:\s*(-?[\d.]+)rpx/.exec(tipsSeg[1]) || [NaN, NaN])[1])
const tipsM = parseFloat((/margin-top:\s*(-?[\d.]+)rpx/.exec(tipsSeg[1]) || [NaN, NaN])[1])
ok('Tips 那只盒子的高 == 负 margin 的绝对值（不等就会把横条整组顶走）',
  Number.isFinite(tipsH) && Number.isFinite(tipsM) && tipsM < 0 && Math.abs(tipsH + tipsM) < 0.01,
  `高 ${tipsH} / margin ${tipsM}`)
// 盒子里除了文字那一行，还要剩下一行的空隙，否则 Tips 会贴在横条上。
ok('Tips 盒子比文字那一行高出一档（68 = 文字 34 + 下方留一行 34）',
  Math.abs(tipsH - 68) <= 1, tipsH)
// 可用宽 = 750 − 24×2（页边）− 48（左边留空）− 14（点）− 12（点与字的间距）= 652rpx，
// 24rpx 字号下放得下 27 个汉字（比加点前少半个字，最长那句 20 字仍然宽裕）；
// 卡在这条线上，句子才不会在照片上折成两行、把横条顶下去。
ok('Tips 六句中英各一份、句数相等', Array.isArray(zh.tips) && Array.isArray(en.tips)
  && zh.tips.length === 6 && en.tips.length === zh.tips.length)
ok('每条中文 Tips 不超过 24 个汉字（一句都不折行）',
  zh.tips.every((x) => x.length <= 24), zh.tips.map((x) => x.length).join(','))
ok('前缀两门各按自己的冒号（中文全角、英文半角带空格）',
  zh.tipsPrefix === 'Tips：' && en.tipsPrefix === 'Tips: ')

// 站长 10-01 晚两条：① 4 秒"还没看完就跳下一条"→ 慢一倍；② 句首加一枚小黄点当"小灯泡"。
ok('一句停 8 秒（不是原来的 4 秒）',
  /\}, 8000\)/.test(js) && !/\}, 4000\)/.test(js))
ok('小黄点在文字前面，色值由 palette 经 style 递进来',
  /<view class="tips-dot" style="\{\{tipDotStyle\}\}"><\/view>\s*<text class="tips-line">/.test(wxml)
  && /tipDotStyle: 'background:' \+ TIP_DOT/.test(js)
  && palette.TIP_DOT === '#F6C445')
ok('点那一格：14rpx 正圆、离字 12rpx',
  /\.tips-dot\s*\{[^}]*width: 14rpx[^}]*height: 14rpx[^}]*margin-right: 12rpx[^}]*border-radius: 50%/.test(wxss))
ok('点必须排在点前面（顺序反了就成了"句子里嵌个点"）',
  wxml.indexOf('class="tips-dot"') < wxml.indexOf('class="tips-line"'))

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
;['submitUrl', 'submitScreenshots', 'submitManual', 'pasteUrl', 'clearUrl', 'removeShot',
  'clearShots', 'openPermSetting', 'onPickCategory', 'onSwitchLang', 'onUrlInput',
  'onWriteTitle', 'onWriteBody'].forEach((h) => {
  ok(`${h} 仍挂在 wxml 上`, new RegExp('"' + h + '"').test(wxml))
})
ok('忙态仍然挡住收起', /collapse\(\)\s*\{\s*if \(this\.data\.busy/.test(js))
ok('onShow 仍然不重置草稿', !/previewImages: \[\]/.test(js.split('async onShow')[1].split('hintFor(value)')[0]))
ok('选完图返回仍然重算条身', /barTitle: this\.barTitleFor\(this\.data\.active, this\.data\.previewImages\.length\)/.test(js))

// ---------- 7. 「直接写」这一档改成走提炼（站长 10-04：标题 + 原文 → 模型出摘要）----------
const apijs = fs.readFileSync(P('utils/api.js'), 'utf8')
ok('api 层新增 ingestText，打的就是 /api/ingest/text',
  /ingestText: \(data\) => request\('\/api\/ingest\/text', 'POST'/.test(apijs))
// 两道窗口（900／200）是 10-04 第八轮抬的：ingestText 的参数里多了「原文翻译」那一行
// 和它上面两行注释，字符窗口就撞开了——这条断的是"提交→拿 task_id→轮询"这根接线，
// 不是某段代码的物理长度。
ok('写那态提交走 ingestText + 轮询任务（与链接／截图同一条等法）',
  /async submitManual\(\)[\s\S]{0,1400}api\.ingestText\([\s\S]{0,520}api\.pollTask\(/.test(js))
ok('这一档不再自己建笔记（手打那条路只留提炼一个入口）', !/api\.createNote\(/.test(js))
// 原来钉的是三样（标题／原文／归类），10-04 起是四样：多一枚开关就多一个字段。
ok('送进去的是标题 + 原文 + 归类 + 原文翻译四样',
  /ingestText\(\{\s*title,\s*content,\s*category_id: picked \? picked\.id : null,[\s\S]{0,260}translate: this\.data\.writeTranslate,\s*\}/.test(js))
ok('原文空着要拦一道，且两门都有这句话', !!zh.needBody && !!en.needBody,
  `${zh.needBody} / ${en.needBody}`)
ok('归类那一格只报名字（"归类"两个字和那一整行都撤了）',
  !/cat-key|categoryLabel/.test(wxml) && /class="wr-cat-val">\{\{categoryNames\[catIndex\]\}\}/.test(wxml))
ok('按钮说的是提炼，不是保存', /catchtap="submitManual">\{\{busy === 'write' \? t\.busyExtract : t\.startExtract\}\}/.test(wxml))
ok('腾出来的高度还给了原文（比加开关前的 180 高一档）',
  /\.wr-body\s*\{[^}]*height: (2[0-4][0-9])rpx/.test(wxss))

// ---------- 8. 第六轮那三条（站长 10-04 原话：标题在左，分类在右、分类字体颜色淡一点、"提要"改为"摘要"）----------
const wrLine = wxml.slice(wxml.indexOf('class="wr-line"'), wxml.indexOf('class="face-area wr-body"'))
ok('这一行里标题排在分类前面（DOM 顺序＝左右顺序，flex 没给 order）',
  wrLine.indexOf('class="wr-title"') > -1
  && wrLine.indexOf('class="wr-cat"') > wrLine.indexOf('class="wr-title"'),
  `title@${wrLine.indexOf('class="wr-title"')} cat@${wrLine.indexOf('class="wr-cat"')}`)
ok('wxss 里没有 order:/direction:/row-reverse 把左右又翻回去',
  !/\.wr-line\s*\{[^}]*(order:|direction:|row-reverse)/.test(wxss))
ok('分类那一格的字淡一档：吃 --face-dim 这个令牌，不在规则里写死色',
  /\.wr-cat-face\s*\{[^}]*color: var\(--face-dim\)/.test(wxss))
ok('--face-dim 就定义在面板那套令牌里（不吃页面级 --text-tertiary：has-bg 会把它翻成纸白）',
  /--face-dim: rgba\(35, 37, 44, 0\.55\)/.test(wxss)
  && !/\.wr-cat-face\s*\{[^}]*--text-tertiary/.test(wxss))
const i18nSrc = fs.readFileSync(P('utils/i18n.js'), 'utf8')
ok('界面上那句说明改成「摘要」，与详情页那一格同一个词',
  !/提要/.test(zh.manualDesc) && /摘要/.test(zh.manualDesc), zh.manualDesc)
ok('整本字典里再没有"提要"这个另造的词', !/提要/.test(i18nSrc))

// ---------- 9. 「原文翻译」那一枚小开关（站长 10-04 原话：「在取消按钮上方，加个小开关，
// 原文翻译，默认关，可以打开」）——根因在提示词整篇是中文，这里断的是接线与两态画法 ----------
const swAt = wxml.indexOf('class="wr-sw ')
const actsAfter = wxml.indexOf('<view class="acts">', swAt)
const cancelAt = wxml.indexOf('catchtap="cancelWrite"')
ok('这一行在原文框与那排按钮之间，中间不夹别的块',
  swAt > wxml.indexOf('class="face-area wr-body"') && actsAfter > swAt && actsAfter - swAt < 600,
  `swAt=${swAt} actsAfter=${actsAfter}`)
ok('那排按钮里确实有「取消」，开关就在它上方',
  cancelAt > swAt && /catchtap="cancelWrite">\{\{t\.cancel\}\}/.test(wxml),
  `cancelAt=${cancelAt}`)
ok('落点是整行，且用 catchtap（面板外壳挂着「点空白收回」，冒上去就顺手把面板收了）',
  /class="wr-sw \{\{writeTranslate \? 'wr-sw-on' : ''\}\}" catchtap="onToggleTranslate">/.test(wxml))
ok('药丸和那行字上没有第二个落点（一个功能只留一个入口）',
  !/wr-sw-track[^>]*catchtap|wr-sw-lab[^>]*catchtap/.test(wxml))
ok('两门都有这一句，中文就是他原话「原文翻译」',
  zh.origTranslate === '原文翻译' && !!en.origTranslate,
  `${zh.origTranslate} / ${en.origTranslate}`)
ok('默认关：data 里那一位写的是 false', /writeTranslate: false,/.test(js))
ok('点一下只翻这一个状态，不提交也不动别的字段',
  /onToggleTranslate\(\)\s*\{\s*this\.setData\(\{ writeTranslate: !this\.data\.writeTranslate \}\)/.test(js))
ok('存进去一篇之后跟着归零（下一篇回到默认关）',
  /writeBody: '',\s*writeTranslate: false,/.test(js))
ok('链接／截图那两条没带这个字段（它们没这枚开关，提示词一字不变）',
  /api\.ingestUrl\(url\)/.test(js) && /api\.ingestScreenshots\(batch\)/.test(js)
  && !/ingestUrl\([^)]*translate/.test(js) && !/ingestScreenshots\([^)]*translate/.test(js))
// 两态各吃一对令牌：关是 --face 面配 --face-ink 点，开是 --solid-bg 面配 --solid-ink 点。
// 配对是对的才不会"同底色压透明度等于没画"——开关画成看不见，比画丑更糟。
ok('关态吃 --face 面 + --face-ink 点',
  /\.wr-sw-track\s*\{[^}]*background: var\(--face\)/.test(wxss)
  && /\.wr-sw-dot\s*\{[^}]*background: var\(--face-ink\)/.test(wxss))
ok('开态吃 --solid-bg 面 + --solid-ink 点（与 .act.solid 同一对）',
  /\.wr-sw-on \.wr-sw-track\s*\{[^}]*background: var\(--solid-bg\)/.test(wxss)
  && /\.wr-sw-on \.wr-sw-dot\s*\{[^}]*background: var\(--solid-ink\)/.test(wxss))
ok('这四条规则里没有一处写死色',
  !/\.wr-sw[^{]*\{[^}]*(#[0-9A-Fa-f]{3,8}|rgba\()/.test(wxss))
// 几何闭合：面 72 宽、点 32 宽、左右各留 4 → 位移只能是 72-32-4-4＝32，写别的数就留半格缝
ok('点推到最右正好贴边（位移 32rpx 与 72／32／4 三个数对得上）',
  /\.wr-sw-track\s*\{[^}]*width: 72rpx/.test(wxss)
  && /\.wr-sw-dot\s*\{[^}]*width: 32rpx/.test(wxss)
  && /\.wr-sw-on \.wr-sw-dot\s*\{[^}]*transform: translateX\(32rpx\)/.test(wxss))

console.log(`统一录入条：${pass} 条通过`)
if (fails.length) {
  console.log(`失败 ${fails.length} 条：`)
  fails.forEach((f) => console.log('  ✗ ' + f))
  process.exit(1)
}
