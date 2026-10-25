// 站长 10-17 深夜那一批的静态自证（§8.297）。跑法：node docs/工具/验-详情窗配图与出图那一趟.js
//
// 他那几句话说的是四件事，每一件都对应一种"看起来对、屏上其实不对"的失效：
// ① 「详情窗里加一排配图小图，点了拉大图」——详情窗（首页那层浮窗）原来根本没有配图这一栏，
//    列表上看得见图、点进窗里看不到（他报的「列明明看到有图片，但点进去看不到图片」）。
//    独立详情页一直有（`.dt-shots`），所以这一条钉的是**两页同一套**，不是"首页也画一排"。
// ② 「制作时候，不再固定默认模板……不要每次都固定出现同一样的模板，新用户以为只有一种模板」
//    ——开窗起手不许再钉死 DEFAULT_TEMPLATE，也不许连着两篇开出同一套。
// ③ 「我记得以前还有提醒模板名称的，现在好像看不见」——查出来：那一句历史上**只有**滑那一下
//    一枚 1.2 秒 toast（开窗从来不报、已生成态从来不报），屏上从来没有常驻那一行。
//    所以这一条钉的是"常驻那一行真的在标记里"＋"那枚 toast 已经撤干净"。
// ④ 「生成完，自动保存图片到手机，然后等用户选择分享路径。用户再点保存图片，就静默」
//    ——顺序是 存相册 → 台账 → 开分享面板；同一张再按不重复写相册。
//
// 这把只读源码，不连模拟器（真点那几把归 验-详情页那一格-真跑 与 验-详情浮窗两层-真跑）。
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
// ③′ 那一节要**真调用** matteColor 数颜色，所以这里把绘制那一份 require 进来（不是读它的字节）。
// poster.js 在模块顶层就摸 wx（mpAssets 那一句 getFileSystemManager），node 里必须先立替身——
// 同一形状的先例见 验-海报模板几何.js 文件头那六行。
// 明度用 palette 那一只现成的口——注意它是朴素亮度、不是 WCAG，这里只用来判"这一档还是浅色吗"。
global.wx = {
  getStorageSync: () => ({ name: '', slogan: '', template: '', avatarPath: '' }),
  setStorageSync: () => {},
  getFileSystemManager: () => ({ accessSync: () => true }),
  env: { USER_DATA_PATH: '/u' },
}
const poster = require(path.join(ROOT, 'miniprogram/utils/poster.js'))
const { lumOf } = require(path.join(ROOT, 'miniprogram/utils/palette.js'))
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const stripXml = (s) => s.replace(/<!--[\s\S]*?-->/g, '')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const IX_WXML = read('miniprogram/pages/index/index.wxml')
const IX_WXSS = read('miniprogram/pages/index/index.wxss')
const IX_JS = stripJs(read('miniprogram/pages/index/index.js'))
const DT_WXML = read('miniprogram/pages/detail/detail.wxml')
const DT_WXSS = read('miniprogram/pages/detail/detail.wxss')
const APP_WXSS = read('miniprogram/app.wxss')

const rule = (src, sel) => {
  const m = new RegExp('\\.' + sel + '\\s*\\{([^}]*)\\}').exec(stripCss(src))
  return m ? m[1] : ''
}
const numOf = (src, sel, prop) => {
  const v = new RegExp('(^|;|\\s)' + prop + ':\\s*(\\d+(?:\\.\\d+)?)rpx').exec(rule(src, sel))
  return v ? parseFloat(v[2]) : NaN
}

/* 「换模板那一趟」现在住三段里（10-20 站长那句「支持手指在几个小点上面拖动切换（支持循环，
   滚动最后一个，再切到第一个，不要卡死）」逼出来的）：`_advanceTemplate` 只算下一枚并取模循环，
   `_tplPick` 改选中＋报名字＋记 _lastTplId，`_flushTplRender` 补一次画。
   拆开的原因是手指那一步不能等画布：一次拖动能跨好几套，而画一张要几百毫秒。
   锚因此从"一个方法体"改成"这三段并起来"——钉的三件事一个字没松。
   ⚠ 三个正则都带着**形参列**：`this._advanceTemplate(dir)` 那种调用点吃的是 `dir`／`list[at].id`，
     只锚方法名会截到一小段别人的方法体（这一把我第一次跑就是这么假绿的）。 */
const tplWalk = (src) => [
  /_advanceTemplate\(delta\) \{[\s\S]*?\n  \},/,
  /_tplPick\(id\) \{[\s\S]*?\n  \},/,
  /async _flushTplRender\(\) \{[\s\S]*?\n  \},/,
].map((re) => (re.exec(src) || [''])[0]).join('\n')

/* ---------- ① 详情窗那一排配图 ---------- */
{
  const shots = (/wx:if="\{\{detailImages\.length\}\}"[^>]*class="ix-shots"/.test(IX_WXML)
    || /class="ix-shots"[^>]*wx:if="\{\{detailImages\.length\}\}"/.test(IX_WXML))
  ck('详情窗那一排在"这篇有配图"时才画（没图的篇不占一行）', shots)
  ck('那一排是横滑的 scroll-view，不换行（与详情页同一套：white-space:nowrap + scroll-x）',
    /scroll-x/.test((/<scroll-view[^>]*class="ix-shots"[^>]*>/.exec(IX_WXML) || [''])[0])
    && /white-space:\s*nowrap/.test(rule(IX_WXSS, 'ix-shots')))
  const one = (/<image[^>]*class="ix-shot"[\s\S]*?\/>/.exec(IX_WXML) || [''])[0]
  ck('每一枚小图：aspectFill（定宽定高不被夹扁）＋ data-url 带着自己那一张',
    /mode="aspectFill"/.test(one) && /data-url="\{\{item\.cloud_url\}\}"/.test(one), one.replace(/\s+/g, ' '))
  ck('点小图拉起大图（他那句「点了拉大图」走 wx.previewImage，不是跳页）',
    /catchtap="onPreviewDetailImage"/.test(one))
  // 两页同一排：样式与详情页那一排逐寸相同（.dt-shot 是原来的那一份）
  const pairs = [['width', '180', '180'], ['height', '180', '180']]
  ck('那一枚方格与详情页那枚同宽同高（180×180，两页不许长成两个数）',
    numOf(IX_WXSS, 'ix-shot', 'width') === numOf(DT_WXSS, 'dt-shot', 'width')
    && numOf(IX_WXSS, 'ix-shot', 'height') === numOf(DT_WXSS, 'dt-shot', 'height')
    && pairs.every(([p, w, h]) => String(numOf(IX_WXSS, 'ix-shot', p)) === w),
    `窗 ${numOf(IX_WXSS, 'ix-shot', 'width')}×${numOf(IX_WXSS, 'ix-shot', 'height')} · 详情页 ${numOf(DT_WXSS, 'dt-shot', 'width')}×${numOf(DT_WXSS, 'dt-shot', 'height')}`)
  ck('圆角与占位底色也吃同一档（两页并排看不出一套是新的）',
    (rule(IX_WXSS, 'ix-shot').replace(/\s+/g, '') || '').includes('border-radius:var(--r-block)')
    && (rule(DT_WXSS, 'dt-shot').replace(/\s+/g, '') || '').includes('border-radius:var(--r-block)')
    && /var\(--accent-soft\)/.test(rule(IX_WXSS, 'ix-shot'))
    && /var\(--accent-soft\)/.test(rule(DT_WXSS, 'dt-shot')))
  // 上面那行小字：两页念同一个键，不给窗里另造一句"图片"
  ck('那一排上面那行小字两页同一个键（t.shotsLabel），不另造一句',
    /class="ds-lab"[^>]*>\{\{t\.shotsLabel\}\}/.test(IX_WXML) && /class="section-label"[^>]*>\{\{t\.shotsLabel\}\}/.test(DT_WXML)
    || /class="ds-lab"[^>]*>\{\{t\.shotsLabel\}\}/.test(IX_WXML) && />\{\{t\.shotsLabel\}\}/.test(DT_WXML))
  const load = (/async _loadDetailImages\(noteId\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('那一排的读数只走 api.getNoteAssets 那一个口（不在窗里自己拼云地址）',
    !!load && /await api\.getNoteAssets\(noteId\)/.test(load))
  ck('云开发没就绪就不发请求（CLOUD_ENV 没填的那台机连报错都不该有）',
    !!load && /if \(!cloudUpload\.cloudReady\(\)\) return/.test(load))
  ck('回来那一刻先确认窗还开着、开的还是这一篇（晚到的那一批不许盖到别人身上）',
    !!load && /if \(!this\.data\.detailOpen \|\| !cur \|\| cur\.id !== noteId\) return/.test(load))
  ck('那一趟读失败只 console.warn，不弹吐司（配图读不到不该挡住正文）',
    !!load && /console\.warn/.test(load) && !/wx\.showToast/.test(load))
  ck('开窗那一趟私密篇两样都不查（公开状态那行、配图那一排同一扇）',
    /if \(!priv\) \{\s*this\._loadShareStatus\(row\.id\)\s*this\._loadDetailImages\(row\.id\)/.test(IX_JS))
  const prev = (/onPreviewDetailImage\(e\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('拉大图那一个口收整排的 cloud_url，落点是被点那一张（点第二张不该从第一张开始）',
    !!prev && /urls\.indexOf\(cur\)\s*>=\s*0 \? cur : urls\[0\]/.test(prev) && /wx\.previewImage/.test(prev))
}

/* ---------- ② 开窗起手不再钉死默认模板 ---------- */
{
  const pick = (/_pickOpeningTemplate\(list\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  // `DEFAULT_TEMPLATE` 在这一段里只许出现在"清单是空的"那一道兜底上——落到别处就是又钉死了。
  ck('起手那套从合并后的清单里随机取（不再读「我的→卡片模板」那套默认）',
    !!pick && /Math\.random\(\)/.test(pick)
    && (pick.match(/DEFAULT_TEMPLATE/g) || []).length === 1
    && /if \(!list \|\| !list\.length\) return poster\.DEFAULT_TEMPLATE/.test(pick),
    pick ? `清单里 ${pick.split('\n').length} 行、DEFAULT_TEMPLATE ${(pick.match(/DEFAULT_TEMPLATE/g) || []).length} 次` : '没读到 _pickOpeningTemplate')
  ck('连着两篇不许开出同一套（"随机"在读的人那儿才不是"固定"）',
    !!pick && /while \(pick\.id === this\._lastTplId\)/.test(pick) && /this\._lastTplId = pick\.id/.test(pick))
  ck('清单只有一套时不转圈（那条 do/while 会变成死循环）',
    !!pick && /if \(list\.length === 1\) return list\[0\]\.id/.test(pick))
  const open = (/async _openPosterFor\(note\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('台账里已经有那张的笔记照旧念台账那一套（「生产过就不支持换卡片模板」）',
    !!open && /const start = known \? cur\.tpl : this\._pickOpeningTemplate\(list\)/.test(open))
  ck('台账那套已经不在清单里（改名／撤掉／下发收走）就当没生成过那一支走',
    !!open && /list\.some\(\(x\) => x\.id === cur\.tpl\)/.test(open))
  ck('已生成态那层不给滑模板：那排圆点只在未生成态画（wxml 里那一条 wx:if）',
    /class="tpl-dots" wx:if="\{\{!posterHasCard\}\}"/.test(IX_WXML))
  ck('旧那句"固定给 DEFAULT_TEMPLATE"不许在开窗这一趟里回来（去注释后整段查）',
    !!open && !/posterTpl: poster\.DEFAULT_TEMPLATE/.test(open))
}

/* ---------- ③ 模板名字：常驻在顶上中间那一格，不是那枚一闪而过的 toast ---------- */
{
  // 站长 10-19「卡片名称，被遮挡，要提到顶上中间」。旧判据钉的是 `class="tpl-name"` 挂在 `.tpl-body` 那一列里，
  // 而那一列正是被 `justify-content:center` ＋ `overflow:hidden` 上下切一刀的地方 ⇒ 落点搬了，判据跟着搬，
  // 并且**反向钉死它不许回到那一列**（回到那一列就是把他报的那个遮挡改回来一次）。
  ck('屏上真有一行常驻的模板名（历史上它只是一枚 1.2 秒 toast，从来没有这一行）',
    /class="grip-tx grip-tx-c"/.test(IX_WXML) && />\{\{.+posterTplName.+\}\}<\/text>/.test(IX_WXML))
  /* 站长 10-20「卡片模板名称（字体加粗）左右加小箭头，例如 < 图文卡 >，提醒用户知道可以左右滑」。
     钉三样，各管一种失效：
     ① 两枚箭头真在拼接里（只改样式不改内容＝屏上还是一个光名字）；
     ② 走表达式拼接、不是把裸 `<` 敲进正文（WXML 是 XML，正文里的尖括号解析不过，整屏白）；
     ③ 加粗那一格他这一句里是**描述现状**，不是新需求——原来就成立，所以这里只钉它没被改坏。 */
  ck('名字左右各一枚小箭头，照他写的样子带一个空格',
    /\{\{'< ' \+ posterTplName \+ ' >'\}\}/.test(IX_WXML))
  ck('两枚箭头与名字仍是同一条 text（拆成三枚＝点箭头不再走 onTplNameTap，热区也碎成三段）',
    (IX_WXML.match(/class="grip-tx grip-tx-c"/g) || []).length === 1
    && /class="grip-tx grip-tx-c" catchtap="onTplNameTap">\{\{.+?\}\}<\/text>/.test(IX_WXML))
  ck('加粗那一格没被这一刀带走（`.grip-tx` 仍写死 700，屏上实测同值）',
    /font-weight: 700/.test(rule(IX_WXSS, 'grip-tx')))
  ck('名字那一枚不许回到海报那一列里（那一列的预留只算到圆点，多一行就被切）',
    !/class="tpl-name"/.test(IX_WXML))
  ck('那一行只在未生成态画（已生成态模板不能换，报着名字会以为还能换）',
    /wx:if="\{\{!posterHasCard && posterTplName\}\}"/.test(IX_WXML))
  ck('开窗那一下就把名字 setData 进去（原来开窗从来不报）',
    /posterTplName: poster\.templateLabel\(start, this\.data\.lang\)/.test(IX_JS))
  /* 10-20：锚从"一个方法体"改成 `tplWalk` 那三段（定义与来历在文件头）。 */
  const adv = tplWalk(IX_JS)
  ck('滑到另一套也跟着换名（两趟都从 poster.templateLabel 那一个出处念）',
    !!adv && /posterTplName: poster\.templateLabel\(id, this\.data\.lang\)/.test(adv))
  // 这一趟还剩一枚 toast，那是"生成失败"那一枚，与名字无关；报名字那一枚撤净了。
  ck('报名字那枚 toast 撤净（这一趟剩的那一枚只说生成失败，不在屏上和吐司上说两遍名字）',
    !!adv && (adv.match(/wx\.showToast/g) || []).length === 1
    && /wx\.showToast\(\{ title: t\('generateFailed'/.test(adv)
    && !/showToast[\s\S]{0,80}templateLabel/.test(adv),
    `${(adv.match(/wx\.showToast/g) || []).length} 枚`)
  ck('滑动那一趟也记 _lastTplId（滑过的那套不该是下一次开窗的"上一套"以外）',
    !!adv && /this\._lastTplId = id/.test(adv))
  // 站长 10-20 那一句「支持循环…不要卡死」：这一条钉的是**取下一枚那一步取模**，
  // 不是"看起来能滑"。旧写法 `list[cur + delta]` 走到头取到 undefined 就 return。
  ck('走到最后一套再往前回到第一套（取模，不是 list[i] 取空就 return）',
    /%\s*n\)\s*\+\s*n\)\s*%\s*n/.test(adv) && !/const next = list\[/.test(adv))
  // 拖动那一条：三枚事件必须是 catch——这一排住在 `.tpl-body` 里，用 bind 一次拖动跨两套。
  ck('圆点那排三枚事件是 catch（同一次拖动不许同时喂给海报上那条 60px 滑动）',
    (IX_WXML.match(/catchtouch(start|move|end|cancel)="onTplDotsTouch/g) || []).length >= 3
    && !/bindtouch(start|move|end)="onTplDotsTouch/.test(IX_WXML))
  ck('顶上那一句模板名也是把手，且用 catchtap 截住（不截住会连带触发 `.grip` 那点把手收窗）',
    /class="grip-tx grip-tx-c" catchtap="onTplNameTap"/.test(IX_WXML))
  ck('那一枚有样式，不是裸 text（常驻的东西没皮就是没做）',
    /\.grip-tx-c\s*\{/.test(stripCss(IX_WXSS)), rule(IX_WXSS, 'grip-tx-c').replace(/\s+/g, ' ').trim())
  // 顶上那一行左右各有一句，中间这枚不限宽就会把「点一下收起」挤成竖排（本仓记过那一形状）。
  ck('中间那枚限宽＋省略号，不许把左右两句挤走',
    /max-width:/.test(rule(IX_WXSS, 'grip-tx-c')) && /text-overflow: ellipsis/.test(rule(IX_WXSS, 'grip-tx-c')))
}

/* ---------- ③′ 成品外圈那一档：留着、宽度减半、但颜色结构上出不来黑（站长 10-20 三句） ---------- */
{
  // 他这一轮说了三句，缺一句都会做歪：
  // ①「卡片模板的黑边不好看，换成同色阶，淡一点边框，宽度减一半」
  // ②「为什么还是有黑边……要简单」
  // ③「不是说去掉边框，而是不要黑色边框」
  // ⇒ 边框**不撤**（10-01 那一圈留着），宽 40 → 20，颜色跟着这张卡自己的底走，
  //   但只往纸白那一头渗。②之所以在 2.4.5 真机上又红，是因为那一版把权重方向写成了"往墨渗"：
  //   浅底那套读成灰框，深底那套渗完仍然是深色＝黑边。所以这一节最要紧的一条不是钉常量，
  //   而是**拿包内十套真算出来的 plan 逐套数出那一圈的明度**，看有没有哪一套还是深的。
  const render = (/async _renderPoster\(\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('宽度就是原来那一档的一半（40 → 20，只住 poster.MATTE 一个出处）',
    poster.MATTE === 20, `MATTE=${poster.MATTE}`)
  ck('边框还在：画布比卡本身宽两档、先垫满一圈再把卡挪进来',
    !!render && /const outW = plan\.width \+ poster\.MATTE \* 2/.test(render)
    && /ctx\.fillRect\(0, 0, outW, outH\)/.test(render)
    && /ctx\.translate\(poster\.MATTE, poster\.MATTE\)/.test(render))
  ck('导出那一步不再写死纯黑，改成问 poster 要这一张卡自己的那一档',
    !!render && !/'#000'/.test(render) && /ctx\.fillStyle = poster\.matteColor\(plan\)/.test(render))
  ck('外圈宽度只有一个出处（界面里每一处 MATTE 都从 poster 现读，没人抄一份 20 在页里）',
    (IX_JS.match(/\bMATTE\b/g) || []).length > 0
    && (IX_JS.match(/\bMATTE\b/g) || []).length === (IX_JS.match(/poster\.MATTE/g) || []).length
    && !/\bMATTE\s*=\s*\d/.test(IX_JS), `${(IX_JS.match(/\bMATTE\b/g) || []).length} 处，全带 poster. 前缀`)
  ck('垫完这一圈要把变换收回去（下一张画布不许越挪越远）',
    !!render && /ctx\.save\(\)[\s\S]{0,120}ctx\.restore\(\)/.test(render))

  // 下面这一段是**真调用**：拿产品那份 planPoster 替身 ctx 跑包内十套真配方，
  // 每套算出它自己的那一档，再数这一档的明度。深底那一族（墨黑、黛青、硬黑）正是上一版翻车的地方。
  const hexOf = (s) => (typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s))
  let gFont = 28
  const gCharW = (c) => (c.codePointAt(0) > 0x2e80 ? gFont : gFont * 0.55)
  const gCtx = new Proxy({}, {
    get: (_, k) => {
      if (k === 'measureText') return (s) => ({ width: Array.from(String(s || '')).reduce((a, c) => a + gCharW(c), 0) })
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} })
      if (k === 'font') return ''
      return () => {}
    },
    set: (_, k, v) => { if (k === 'font') { const m = /(\d+(?:\.\d+)?)px/.exec(String(v)); if (m) gFont = parseFloat(m[1]) } return true },
  })
  const gNote = { title: '一条特别长的标题用来压排版看看会不会溢出', summary: '人性就是这么现实啊。你也是。', key_points: ['要点甲', '要点乙'], key_links: [], tags: ['甲'], source_url: null, source_type: 'manual', created_at: '2026-09-24T06:00:00Z' }
  const tones = poster.TEMPLATES.map((tpl) => {
    const plan = poster.planPoster(gCtx, gNote, tpl.id, { name: '阿飞', slogan: '每天读一点再走', template: tpl.id }, 'zh', { showQr: true, hasNote: false })
    return { id: tpl.id, name: tpl.name || tpl.id, c: poster.matteColor(plan), lum: lumOf(poster.matteColor(plan)) }
  })
  const dark = tones.filter((x) => !hexOf(x.c) || x.lum < 200)
  ck(`包内十套逐套真算（现网下发那几套走同一支口）：每一套那一圈都是淡的（明度全部 ≥ 200，${tones.length} 套）`,
    tones.length >= 10 && dark.length === 0, dark.length ? `深的：${dark.map((x) => `${x.name} ${x.c}(${Math.round(x.lum)})`).join(' ')}` : tones.map((x) => `${x.c}(${Math.round(x.lum)})`).join(' '))
  ck('但各是各的色阶，不是全站一条灰边（这十套里那一档至少有两种不同值）',
    new Set(tones.map((x) => x.c)).size >= 2, `${new Set(tones.map((x) => x.c)).size} 档`)

  // 这一条是③那句的结构化落点：不管配方将来加多深的一张底（连纯黑都试），出来的都不许是黑的。
  ck('哪怕某套的底是纯黑，那一圈也只会是浅灰——公式里纸白占大头，方向不可能翻回黑',
    ['#000000', '#12121A', '#23252C', '#55625C'].every((c) => {
      const out = poster.matteColor({ layers: [{ k: 'fill', x: 0, y: 0, w: poster.W, h: 1200, color: c }] })
      return hexOf(out) && lumOf(out) >= 200 && lumOf(out) > lumOf(c)
    }))
  ck('渐变底从 c1 取（只认 fill 的话这一族会静默退回纸白，深渐变那几套白拿一档）',
    (() => {
      const g = poster.matteColor({ layers: [{ k: 'grad', x: 0, y: 0, w: poster.W, h: 1200, c1: '#55625C', c2: '#ffffff' }] })
      const f = poster.matteColor({ layers: [{ k: 'fill', x: 0, y: 0, w: poster.W, h: 1200, color: '#55625C' }] })
      return hexOf(g) && g === f
    })())
  ck('认不得的写法（rgba、或压根没有整幅底）退回纸白，绝不悄悄画回纯黑',
    ['#fff', 'rgba(0,0,0,.5)', null].every((c) => {
      const out = poster.matteColor({ layers: [{ k: 'fill', x: 0, y: 0, w: poster.W, h: 9, color: c }] })
      return hexOf(out) && lumOf(out) >= 200
    }) && lumOf(poster.matteColor({ layers: [] })) >= 200)
}

/* ---------- ④ 存相册 → 台账 → 等用户选分享路径；再点静默 ---------- */
{
  const save = (/onSavePoster\(\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('按下去先查"这张存过没有"，存过就只开分享面板（他说的"再点保存图片，就静默"）',
    !!save && /if \(this\._savedPosterPath === path\) \{ this\._openShareMenu\(path\); return \}/.test(save))
  ck('没存过那一支走存相册那趟（不是先开面板、面板里再存）',
    !!save && /this\._saveToAlbum\(path\)/.test(save) && !/wx\.showShareImageMenu/.test(save))
  const album = (/_saveToAlbum\(path\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('存成功那趟的顺序：落台账（_keepPoster）→ 说一句已保存 → 开面板等人选路径',
    !!album && album.indexOf('_keepPoster()') < album.indexOf('_openShareMenu(path)')
    && album.indexOf('savedToAlbum') < album.indexOf('_openShareMenu(path)'),
    album ? '' : '没读到 _saveToAlbum')
  ck('幂等那把尺量的是那张临时文件的路径本身（换模板出新文件，照旧真存）',
    !!album && /this\._savedPosterPath = path/.test(album))
  ck('没给相册权限那一支只给引导、不开面板（两层系统浮层不许叠着）',
    !!album && /wx\.showModal/.test(album) && /return/.test((/if \(msg\.indexOf\('auth'\) >= 0\) \{[\s\S]*?\n      \}/.exec(album) || [''])[0]))
  ck('存不成功也不堵死分享那条路（拒绝授权走的是 cancel，不报错）',
    !!album && /if \(msg\.indexOf\('cancel'\) < 0\)[\s\S]{0,80}_openShareMenu\(path\)/.test(album.replace(/\n\s*/g, ' '))
    || !!album && /_openShareMenu\(path\)/.test(album.slice(album.lastIndexOf('cancel'))))
  const menu = (/_openShareMenu\(path\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]
  ck('分享面板就是 wx.showShareImageMenu 那一个口（不另开一条分享路）',
    !!menu && /wx\.showShareImageMenu\(\{\s*path,/.test(menu))
  ck('面板成功那一下收窗，失败什么都不说（开发者工具里一定 fail，那里报"导出失败"是骗人）',
    !!menu && /success: \(\) => this\._closeTemplate\(\)/.test(menu) && /fail: \(\) => \{\}/.test(menu))
  ck('这一趟只记一笔台账：面板成功那支不再调 _keepPoster（一篇一张是这本账自己的规则）',
    !!menu && !/_keepPoster/.test(menu))
}

/* ---------- ⑤ 私密那一枚：置灰 + 那句理由 ---------- */
{
  // 两页那一枚各在自己的样式表里（`.icon-btn.disabled` 在 detail.wxss、`.ds-ibtn.disabled` 在 index.wxss），
  // 共用不了同一个类——所以钉的是**同一支字色**，不是同一个数：两页按钮底本来就不同层，
  // 同一个 alpha 量出来是两个对比度（详情页 4.51:1、窗里 3.89:1），这一点写在两处注释里。
  const grey = rule(DT_WXSS, 'icon-btn.disabled'), win = rule(IX_WXSS, 'ds-ibtn.disabled')
  ck('置灰那一枚两页吃同一支字色（rgba(35, 37, 44, .65)），不许一页一个淡法',
    /color:\s*rgba\(35, 37, 44, 0\.65\)/.test(grey) && /color:\s*rgba\(35, 37, 44, 0\.65\)/.test(win),
    `详情页 ${grey.replace(/\s+/g, ' ').trim()} · 窗里 ${win.replace(/\s+/g, ' ').trim()}`)
  ck('灰不是拿 opacity 整枚压（压下去连描边一起淡），也不给 pointer-events（按下去要有回应）',
    !/opacity/.test(grey + win) && !/pointer-events/.test(grey + win))
  ck('挡住私密那一枚的是代码里那一句 return，不是这一层皮（屏上灰只是画）',
    /onCardCell\(\) \{[\s\S]{0,140}is_private\) return/.test(IX_JS.replace(/async _openPosterFor[\s\S]*?onCardCell/, 'onCardCell'))
    || /is_private\) return/.test((/onSheetShare\(\) \{[\s\S]*?\n  \},/.exec(IX_JS) || [''])[0]))
}

/* ---------- ⑥ 反向自证：这几条真的抓得到回退 ---------- */
{
  const backToFixed = IX_JS.replace('const start = known ? cur.tpl : this._pickOpeningTemplate(list)',
    'const start = known ? cur.tpl : poster.DEFAULT_TEMPLATE')
  const open2 = (/async _openPosterFor\(note\) \{[\s\S]*?\n  \},/.exec(backToFixed) || [''])[0]
  ck('反向①：把开窗那一句改回钉死默认模板，"随机那一支"这条必须红',
    backToFixed !== IX_JS && !/this\._pickOpeningTemplate\(list\)/.test(open2))
  const toastBack = IX_JS.replace('this._lastTplId = id',
    'this._lastTplId = id\n    wx.showToast({ title: poster.templateLabel(id, this.data.lang), icon: "none" })')
  const adv2 = tplWalk(toastBack)
  // ⚠ 这一枚原来钉的是 `adv2 !== '' && /showToast/.test(adv2)`——那是条**假反向**：
  //   "生成失败"那一枚 toast 本来就在这一趟里，不注入它也绿。改成数枚数，注入一枚才红。
  ck('反向②：把滑那一下的 toast 加回去（他问"名字怎么看不见"的那个旧形状），"toast 撤净"这条必须红',
    toastBack !== IX_JS && (adv2.match(/wx\.showToast/g) || []).length === 2,
    `${(adv2.match(/wx\.showToast/g) || []).length} 枚`)
  const dupShot = IX_WXML.replace(/class="ix-shot"/, 'class="ix-shot other"')
  ck('反向③：给窗里那一枚另起一个类名（样式跟着分叉），"同宽同高"这条仍然量的是同一个类——'
    + '所以这里钉的是标记：窗里那一排只许有一套 class="ix-shot"',
    (IX_WXML.match(/class="ix-shot"/g) || []).length === 1 && (dupShot.match(/class="ix-shot"/g) || []).length === 0)
  const orderBack = IX_JS.replace(/if \(this\._savedPosterPath === path\) \{ this\._openShareMenu\(path\); return \}/, '')
  ck('反向④：把"再点静默"那一句删掉（每次都重复写相册），那一支判据必须红',
    orderBack !== IX_JS && !/_savedPosterPath === path/.test((/onSavePoster\(\) \{[\s\S]*?\n  \},/.exec(orderBack) || [''])[0]))
  // 挪顺序，不是删调用：删掉的话 `indexOf` 回 -1，比谁都靠前，判据反而绿——那是把尺子磨平。
  const keepAfterMenu = IX_JS.replace('        await this._keepPoster()\n', '')
    .replace('this._openShareMenu(path)\n      },', 'this._openShareMenu(path)\n        await this._keepPoster()\n      },')
  ck('反向⑤：把落台账那一刀挪到开面板之后（"生成完自动保存"变成"分享完才保存"），顺序判据必须红',
    keepAfterMenu !== IX_JS && (() => {
      const a = (/_saveToAlbum\(path\) \{[\s\S]*?\n  \},/.exec(keepAfterMenu) || [''])[0]
      return a !== '' && a.indexOf('_keepPoster()') > a.indexOf('_openShareMenu(path)')
    })() && (() => {
      const a = (/_saveToAlbum\(path\) \{[\s\S]*?\n  \},/.exec(keepAfterMenu) || [''])[0]
      return !(a.indexOf('_keepPoster()') < a.indexOf('_openShareMenu(path)'))
    })(), '把 _keepPoster 那一行搬到 _openShareMenu 之后重读顺序')
}

console.log(`\n${bad.length === 0 ? '全过' : `红 ${bad.length} 条`}`)
bad.forEach((n) => console.log(`  ✗ ${n}`))
process.exit(bad.length ? 1 : 0)
