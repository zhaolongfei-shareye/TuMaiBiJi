// 09-30 这一批的真跑自证：邮箱换址、私密密码行上移、分类 chip 上色、
// 归类笔记的圆点吃分类色、详情页四个动作全在文档上方。
// 10-01 晚改了私密密码那一块：不在菜单里就地展开，改成从底部弹上来的 1/3 一层 + 六个方格、
// 输遍再输遍，所以这一把里密码那段的判据整块换过（旧的"两格输入 / pwd1 pwd2"作废）。
// 前置：微信开发者工具已开；改过 WXSS/WXML 要先 cli close 再
//   cli auto --project <repo>/miniprogram --auto-port 9431，等十秒端口起来。
// 会造一条临时笔记（分类=旅游）用来验圆点颜色，跑完删掉，不动他原有那三条。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-私密密码与分类色-真跑.js
const automator = require('miniprogram-automator')
const lang = require('./尺子语言钉.js')
const fs = require('fs')
const path = require('path')
// 「使用场景」那句判据吃字典，不抄第二份（界面读同一份 i18n）
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-堆叠卡/实测-0930')
const API = 'https://api.agentsbin.cn/wtsj'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const tx = async (el) => (el ? await el.text() : '（元素不存在）')

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 这一把通篇钉中文串，而语言是登录时从服务端带回的：上一把真登录的尺子会把测试号的 en
  // 带进来，那 iPwd 就找成 -1、下面直接崩在 undefined.tap() 上。开跑前钉成 zh，收尾还回去。
  const langBefore = await lang.read(mp)
  await lang.pin(mp, 'zh')
  let tempNoteId = null
  try {
    /* ---------- 「我的」那一页 ---------- */
    await mp.switchTab('/pages/me/me')
    await sleep(3500)
    const me = await mp.currentPage()
    let d = await me.data()
    ck('反馈邮箱换成新址', d.contactEmail === '18509828@qq.com', d.contactEmail)
    const labels = []
    for (const r of await me.$$('.menu-item')) labels.push((await r.text()).replace(/\s+/g, ''))
    const iWall = labels.findIndex((x) => x.startsWith('外观设置'))
    const iPwd = labels.findIndex((x) => x.startsWith('私密密码'))
    const iCat = labels.findIndex((x) => x.startsWith('分类管理'))
    const iDel = labels.findIndex((x) => x.startsWith('注销账号'))
    // 判据跟着 v10 定稿改：那一排的顺序是效果图拍的（外观→分类→私密→注销），
    // 09-30 那条"紧跟外观设置"是被 11092b2 换外壳作废的旧尺子，不动代码迁就它。
    ck('设置那一排按 v10 定稿排：外观 → 分类 → 私密 → 注销',
      iWall > -1 && iCat === iWall + 1 && iPwd === iCat + 1 && iDel === iPwd + 1,
      labels.slice(iWall, iDel + 1).join('|'))
    // 1.9.0 起这一行右边只剩一枚一体 icon，设没设不再用文字说（旧判据作废，改判据不改代码）
    ck('那一行右边不再有状态文字', !/未设置|密码已设置/.test(labels[iPwd] || ''), labels[iPwd])
    ck('关于/反馈邮箱/注销那组里不再有私密密码', !labels.slice(iPwd + 1).some((x) => x.startsWith('私密密码')))

    /* ---------- 私密密码：整屏遮罩 + 居中卡 + 六格（站长 10-01 深夜第二次改口径） ----------
       「秘密弹窗高度不够，下方的按钮被遮挡，改为与分类管理页面相同的全屏展示方式，取消半屏
        弹窗方式；6 个框太大不精致，稍微聚集中间；密码使用场景说明要在页面里面写清楚。」
       上一版的判据（1/3 高、贴屏幕底边、33vh）整块作废——那正是他截图里按钮被切掉那一版。
       改判据，不回头动代码去迁就旧尺子。 */
    await (await (await me.$$('.menu-item'))[iPwd]).tap()
    await sleep(1200)
    d = await me.data()
    ck('点那一行弹出独立一层，不是就地展开', d.pwdOpen === true && !(await me.$('.pwd-inline')))
    // 这一层进"设置态"还是"重置态"只由服务端那条读数决定，而**这个账号设没设是会变的**
    // （上一把尺子跑完密码就没了）。所以这里不许钉死哪一态，只钉"翻得对"：
    // 没设过 → entering（给六格）；设过 → 只给重置那一枚。两态都往下用 openPwdSheet 显式摆出来测。
    const btnOf = async () => { const a = []; for (const b of await me.$$('.pwd-btn')) a.push(await b.text()); return a }
    const cellsOf = async () => (await me.$$('.pwd-cell')).length
    ck('门吃的是服务端那条读数（没设过就走设置态、设过就走重置态）',
      d.pwdEntering === !d.privateSet, `entering=${d.pwdEntering} privateSet=${d.privateSet}`)
    const cellsNow = await cellsOf()
    ck('设置态给六格、重置态不给，两边互斥',
      cellsNow === (d.pwdEntering ? 6 : 0), `cells=${cellsNow}`)
    ck('两态右边那枚分别是确定 / 重置密码',
      (await btnOf()).join('|') === (d.pwdEntering ? '取消|确定' : '取消|重置密码'), (await btnOf()).join('|'))
    const rect = (sel) => mp.evaluate((s) => new Promise((done) => {
      wx.createSelectorQuery().select(s).boundingClientRect((r) => done(r)).exec()
    }), sel)
    const rects = (sel) => mp.evaluate((s) => new Promise((done) => {
      wx.createSelectorQuery().selectAll(s).boundingClientRect((r) => done(r || [])).exec()
    }), sel)
    const win = await mp.evaluate(() => wx.getWindowInfo())
    const mask = await rect('.pwd-mask')
    const card = await rect('.pwd-card')
    ck('遮罩 + 那张卡两层都在（旧的 .pwd-layer/.pwd-sheet 那一版已撤）', !!mask && !!card)
    ck('遮罩铺满整屏（与分类管理同一口径）',
      !!mask && Math.abs(mask.height - win.windowHeight) <= 1 && Math.abs(mask.width - win.windowWidth) <= 1,
      mask && `${mask.width}×${mask.height}`)
    // 站长 10-02 iPhone 11：居中那一版键盘还是把两枚按钮盖住了（微信只保证焦点框不被压住，
    // 它不知道卡底下还有按钮）。这一层改成坐到上面，旧判据"卡以屏心为中心"作废，
    // 换成钉这条功能：卡底下空出来的那一截高过系统数字键盘。
    // 键盘是按 pt 长的、不是按 rpx，所以这一条用 px 比；离顶那一档是 rpx，两边都折成 rpx 看。
    const rpx = (px) => (px * 750) / win.windowWidth
    ck('卡坐到上面（离顶 180rpx），底下空出来那一截高过系统数字键盘（250pt 那一档）',
      !!card && Math.abs(rpx(card.top) - 180) <= 6 && win.windowHeight - card.bottom >= 250,
      card && `离顶 ${rpx(card.top).toFixed(0)}rpx 底下空 ${(win.windowHeight - card.bottom).toFixed(0)}px`)
    // 他打回的那一条就是"下方的按钮被遮挡"——所以这一条是这块的核心判据。
    // card 读不到的时候不许往下走：`card.bottom` 会把整把尺子炸掉，后面几十条一起没。
    const btnRects = await rects('.pwd-btn')
    ck('两枚按钮整枚在卡以内（图三那个被切掉的事故不再出现）',
      !!card && btnRects.length === 2 && btnRects.every((b) => b.bottom <= card.bottom + 1 && b.top >= card.top - 1),
      btnRects.map((b) => `${b.top.toFixed(0)}~${b.bottom.toFixed(0)}`).join(' ') + ` | 卡 ${card && card.bottom.toFixed(0)}`)
    // 那句"使用场景"分两态：设置态讲这串用在哪，重置态讲怎么换。这一屏走到这里时是哪一态
    // 由服务端那条读数决定（上一个账号跑完密码就没了），所以不钉字面值、钉"等于字典里对应那一态"。
    const sceneTx = await tx(await me.$('.pwd-scene'))
    const wantScene = i18n.t(d.pwdEntering ? 'privatePasswordScene' : 'privatePasswordSetHint', 'zh')
    ck('使用场景那句写在卡里面，且吃的是字典里对应这一态的那句',
      sceneTx.replace(/\s+/g, '') === wantScene.replace(/\s+/g, ''), `${sceneTx.slice(0, 24)} ← ${d.pwdEntering ? 'Scene' : 'SetHint'}`)
    // 站长 10-02：这句一回行就把下面那排格子顶歪，所以要压字号。
    // 钉两条与单位无关的相对判据，不钉"等于 --fs-tiny 那个绝对数"：实测替身回给
    // `style('font-size')` 的字级值和声明里的 rpx 不是同一个折法（这里量到 19.2 而不是 21），
    // 拿绝对数钉会假红，而这句真正要的两件事都是相对的——比下面那句提醒小一档、且只占一行。
    const sceneEl = await me.$('.pwd-scene')
    const sceneBox = await rect('.pwd-scene')
    const tipElForFS = await me.$('.pwd-tip')
    const sceneFS = parseFloat(await sceneEl.style('font-size'))
    const tipFS = tipElForFS ? parseFloat(await tipElForFS.style('font-size')) : 0
    ck('那句比下面「新密码（6 位数字）」那档还小（压过字号），且整句只占一行（没有回行）',
      !!sceneBox && sceneFS > 0 && (!tipElForFS || sceneFS < tipFS) && sceneBox.height < sceneFS * 2,
      `字 ${rpx(sceneFS).toFixed(1)} 提醒 ${tipFS && rpx(tipFS).toFixed(1)}rpx 高 ${rpx(sceneBox.height).toFixed(0)}rpx`)
    const nameTx = await tx(await me.$('.pwd-name'))
    ck('从上到下第一样是功能名称', nameTx.indexOf('私密密码') === 0, nameTx)
    // 原来这条只量「长度 > 6」，而 tx(null) 回的是「（元素不存在）」整整七个字——
    // 那一格不存在的时候它反而绿。改成按那一态钉死：设置态必须是字典里那句，重置态整行不许挂。
    const tipEl = await me.$('.pwd-tip')
    const tipTx = (await tx(tipEl)).replace(/\s+/g, '')
    const wantTip = [i18n.t('privatePasswordNew', 'zh'), i18n.t('privatePasswordAgain', 'zh')]
      .map((x) => x.replace(/\s+/g, ''))
    ck('校验提醒那一行：设置态给的是字典那句，重置态整行不挂',
      d.pwdEntering ? wantTip.indexOf(tipTx) >= 0 : !tipEl,
      `${d.pwdEntering ? '设置' : '重置'}态 "${tipTx}"`)
    await mp.screenshot({ path: path.join(OUT, `01a-私密密码弹层-${d.pwdEntering ? '设置' : '重置'}态.png`) })

    // 重置态（这一层的样子是 openPwdSheet(entering) 一次性算出来的，
    // 只把 privateSet 翻过来不会改格子，所以直接走那个入口摆两态）
    await me.callMethod('openPwdSheet', false)
    await sleep(900)
    ck('重置态不给输入格', (await cellsOf()) === 0)
    ck('重置态那只隐藏 input 也不挂', !(await me.$('.pwd-capture')))
    ck('重置态一行两枚：取消 + 重置密码', (await btnOf()).join('|') === '取消|重置密码', (await btnOf()).join('|'))
    // 标题是功能名，不能和右边那枚撞成同一句（撞了就像页面上说了两遍"重置密码"）
    ck('标题不与右边那枚按钮同词', nameTx !== '重置密码', nameTx)
    await mp.screenshot({ path: path.join(OUT, '01a2-私密密码重置态弹层.png') })

    // 设置态：六格 + 一只隐藏的收字 input
    await me.callMethod('openPwdSheet', true)
    await sleep(900)
    const cells = await me.$$('.pwd-cell')
    ck('设置态是六个方格', cells.length === 6, `cells=${cells.length}`)
    const capture = await me.$('.pwd-capture')
    ck('六格背后只有一只 input（六只就要点六次才起键盘）', !!capture)
    // 站长 10-02 iPhone 11：这只原来挂 password="{{true}}"，iOS 的密文点是系统那一层画的、
    // 不吃 CSS opacity，于是六个格子左边漏出一串点和光标（他说的"锚点错位"）。
    // 现在改成普通数字输入 + 字和光标一律染透明；同时 adjust-position 关掉，键盘不再顶整页。
    const meWx = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/me/me.wxml'), 'utf8')
    const capTag = ((meWx.match(/<input class="pwd-capture"[\s\S]*?\/>/) || [])[0] || '')
    ck('那只 input 是数字键盘、最多 6 位，且整只标签里不再挂 password（漏点的就是它）',
      (await capture.attribute('maxlength')) + '' === '6' &&
      (await capture.attribute('type')) === 'number' &&
      !!capTag && !/\bpassword=/.test(capTag),
      `maxlength=${await capture.attribute('maxlength')} type=${await capture.attribute('type')} 标签里挂 password=${/password=/.test(capTag)}`)
    ck('那只 input 自己不让微信顶页（adjust-position 关掉，键盘改由卡上移让）',
      /adjust-position="\{\{false\}\}"/.test(capTag), capTag.slice(0, 78))
    const capOpacity = await capture.style('opacity')
    const capColor = await capture.style('color')
    ck('input 整只隐形：opacity 0，字色也染透明（opacity 被哪个内核忽略都不会把密码露在屏上）',
      parseFloat(capOpacity) === 0 && /rgba\(0, 0, 0, 0\)|transparent/i.test(capColor),
      `opacity=${capOpacity} color=${capColor}`)
    ck('设置态一行两枚：取消 + 确定', (await btnOf()).join('|') === '取消|确定', (await btnOf()).join('|'))
    await mp.screenshot({ path: path.join(OUT, '01b-私密密码设置态弹层.png') })

    /* 状态机直接喂 onPwdBuf（替身不会起系统键盘，喂事件流是同一入口） */
    // 不满 6 位：不该自动跳第二遍、也不该存
    await me.callMethod('onPwdBuf', { detail: { value: '12345' } })
    await sleep(600)
    d = await me.data()
    ck('五位时还停在第一遍', d.pwdStep === 1 && d.pwdBuf === '12345', `step=${d.pwdStep} buf=${d.pwdBuf}`)
    ck('五位时格子只亮五格', (await me.$$('.pwd-cell.fill')).length === 5)
    // 输满 6 位 → 自动跳到第二遍，格子清空、提醒换成"再输一次"
    await me.callMethod('onPwdBuf', { detail: { value: '123456' } })
    await sleep(800)
    d = await me.data()
    ck('输满六位自动进第二遍', d.pwdStep === 2, `step=${d.pwdStep}`)
    ck('第二遍格子是空的（重新输）', d.pwdBuf === '', `buf=${d.pwdBuf}`)
    ck('第二遍上方提醒换成"再输一次"', /再输|再输入|确认一次/.test(d.pwdTip), d.pwdTip)
    ck('第一遍那六位被留着比对', d.pwdFirst === '123456', d.pwdFirst)
    ck('六格重新亮起来是零格', (await me.$$('.pwd-cell.fill')).length === 0)
    await mp.screenshot({ path: path.join(OUT, '01c-私密密码第二遍.png') })
    // 两遍不一样：不发请求、清空、面板留着
    await me.callMethod('onPwdBuf', { detail: { value: '246801' } })
    await sleep(900)
    d = await me.data()
    ck('两次不一样不保存（层还留着、第一遍那串也还在）',
      d.pwdOpen === true && d.pwdFirst === '123456', `open=${d.pwdOpen} first=${d.pwdFirst}`)
    ck('不一致时格子清空让人重输', d.pwdBuf === '' && d.pwdStep === 2, `buf=${d.pwdBuf} step=${d.pwdStep}`)
    // 第二遍不一致之后点取消：整层收起，六格、两步、留着比对的那串一起清零
    await (await me.$('.pwd-btn.ghost')).tap()
    await sleep(800)
    d = await me.data()
    ck('取消能收掉弹层', d.pwdOpen === false)
    ck('收起时缓冲区一起清掉（不留明文）',
      d.pwdBuf === '' && d.pwdFirst === '' && d.pwdStep === 1 && d.pwdFocus === false,
      `buf=${d.pwdBuf} first=${d.pwdFirst} step=${d.pwdStep} focus=${d.pwdFocus}`)
    ck('收起后遮罩整层从屏上拿掉', !(await me.$('.pwd-mask')))

    /* ---------- 首页 slogan 下面那行日期 + 星期 ---------- */
    await mp.switchTab('/pages/create/create')
    await sleep(3500)
    const home = await mp.currentPage()
    const hd = await home.$('.date-row .d')
    const hw = await home.$('.date-row .w')
    const now = new Date()
    ck('slogan 下面有日期那一行', !!hd, hd ? await hd.text() : '没找到 .date-row .d')
    ck('日期是今天', hd && (await hd.text()) === `${now.getMonth() + 1}月${now.getDate()}日`, hd ? await hd.text() : '')
    ck('星期跟着今天', hw && (await hw.text()) === ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()], hw ? await hw.text() : '')
    const seg = await home.$('.lang-seg')
    ck('字号与右边「中」一致', await hd.style('font-size') === await seg.style('font-size'),
      `${await hd.style('font-size')} vs ${await seg.style('font-size')}`)
    const cd = await hd.style('color')
    const dh = await home.data()
    if (dh.bgSrc) ck('铺了图时是半透明的纸白', /rgba\(242, 239, 233/.test(cd), cd)
    else console.log('— 这一屏没铺背景图，颜色走灰字那一档（半透明白那条只在铺图时成立）')
    const posD = await hd.offset()
    const posT = await (await home.$('.page-title')).offset()
    ck('靠左坐在 slogan 下面', posD.left < 40 && posD.top > posT.top, `left=${posD.left} top=${posD.top} 标题 top=${posT.top}`)
    await mp.screenshot({ path: path.join(OUT, '01c-首页日期行.png') })

    /* ---------- 分类那一排上颜色 ---------- */
    await mp.switchTab('/pages/index/index')
    await sleep(3500)
    const list = await mp.currentPage()
    const chips = await list.$$('.chip')
    // 枚数从页面自己手上的分类表读，不钉死"两枚"：09-30 起「私密」那一格由服务端补出来，
    // 这个账号现在有三枚分类，钉死数字的判据会把它当成 BUG。
    const nCat = ((await list.data()).categories || []).length
    ck('筛选排一枚「全部」+ 每枚分类各一枚', chips.length === nCat + 1, `chips=${chips.length} 分类=${nCat}`)
    const bg = []
    const fg = []
    for (const c of chips) { bg.push(await c.style('background-color')); fg.push(await c.style('color')) }
    ck('两枚分类章底色不一样（各自吃自己的分类色）', bg[1] !== bg[2], `${bg[1]} vs ${bg[2]}`)
    ck('分类章底色不再是那层暗玻璃', bg[1] !== 'rgba(18, 20, 26, 0.42)', bg[1])
    ck('每枚字色跟着底色配对', fg[1] !== fg[2] || bg[1] === bg[2], `${fg[1]} vs ${fg[2]}`)
    ck('「全部」那枚仍吃这一态自己的底（没被误上色）', !!bg[0], bg[0])

    /* ---------- 造一条归了类的笔记，验"归了哪一类"在屏上读得出来 ---------- */
    // v18 那一版这一格量的是**纸片底色跟着分类走**（paperSkinFor 按分类序号发色）。
    // v19 撤了纸片墙：列表那一行只剩日期 + 一枚点 + 标题 + 摘要，行自己既无底色也不上色，
    // 左边那枚点退成全局那支 TIP_DOT（与 Tips 前面那一枚同一个色）。
    // 分类身份这一轮由两件事说：①分类行那一枚章（上面一节已量）；②详情窗里 .ds-tag
    // 吃的那一双（catSkinFor 现算，经 catStyle 递进来）。所以这里改成钉这三件事。
    const pal = require('../../miniprogram/utils/palette.js')
    const made = await mp.evaluate(async (api) => {
      const token = getApp().globalData.token
      const send = (url, method, data) => new Promise((resolve) => wx.request({
        url: api + url, method, data,
        header: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        success: (r) => resolve(r.data), fail: (e) => resolve({ _fail: e.errMsg }),
      }))
      return send('/api/notes/', 'POST', { title: '圆点颜色自证·临时', source_type: 'manual', content: '这条只用来验纸色跟分类走，跑完就删。', category_id: 1 })
    }, API)
    tempNoteId = made && (made.id || (made.note && made.note.id))
    ck('临时笔记建出来了（分类=旅游）', !!tempNoteId, JSON.stringify(made).slice(0, 90))
    await mp.switchTab('/pages/index/index')
    await sleep(1500)
    await list.callMethod('loadNotes', true)
    await sleep(3500)
    const notes = (await list.data()).notes || []
    const rowOf = notes.findIndex((n) => n.id === tempNoteId)
    ck('它出现在列表里', rowOf >= 0, `row=${rowOf}`)
    const bgOf = async (want) => {
      for (const e of await list.$$('.xrow')) {
        if (Number(await e.attribute('data-idx')) === want) return await e.style('background-color')
      }
      return ''
    }
    const dotOf = async (want) => {
      for (const e of await list.$$('.xrow')) {
        if (Number(await e.attribute('data-idx')) !== want) continue
        const d = await e.$('.xd-dot')
        return d ? await d.style('background-color') : ''
      }
      return ''
    }
    const asRgb = (h) => `rgb(${[1, 2, 3].map((i) => parseInt(h.slice(1 + (i - 1) * 2, 1 + i * 2), 16)).join(', ')})`
    const plainRow = notes.findIndex((n, i) => n.category_id == null && i !== rowOf)
    const dotNew = await dotOf(rowOf)
    const dotPlain = plainRow >= 0 ? await dotOf(plainRow) : ''
    ck('归类那一行自己不垫底色（列表不再按分类铺色，屏上没有第二层框）',
      /rgba\(0, 0, 0, 0\)|transparent/.test(await bgOf(rowOf)), await bgOf(rowOf))
    ck('左边那枚点就是全局那支 TIP_DOT，归类与未分类同一支（分类身份不在点上）',
      dotNew === asRgb(pal.TIP_DOT) && (plainRow < 0 || (dotPlain === dotNew && !!dotPlain)),
      `归类=${dotNew} 未分类=${dotPlain || '（屏上没有未分类的行，只量归类那一行）'}`)
    // catStyle 是详情窗里那几枚标签的取色口：这一串错一个字符，窗里的字色就跟分类脱钩。
    const wallpaper = await mp.evaluate(() => getApp().getWallpaper())
    const sk = pal.catSkinFor(1, wallpaper)
    const wantStyle = `--cat-dot:${sk.dot};--cat-ink:${sk.text};--cat-chip:${pal.withAlpha(sk.dot, 0.12)}`
    const gotStyle = ((notes[rowOf] || {}).catStyle) || ''
    ck('归类那一行递进来的就是 catSkinFor(1, 现读壁纸) 那一双（窗里的标签靠它上色）',
      gotStyle === wantStyle, `壁纸=${wallpaper}\n实读=${gotStyle}\n期望=${wantStyle}`)
    await mp.screenshot({ path: path.join(OUT, '02-分类章与行前那枚点.png') })

    /* ---------- 详情页：三个动作全在上方（10-03「置顶」那枚撤了） ---------- */
    await mp.navigateTo(`/pages/detail/detail?id=${tempNoteId}`)
    await sleep(3500)
    const det = await mp.currentPage()
    const bar = await det.$$('.action-bar .icon-btn')
    const barTx = []
    for (const b of bar) barTx.push(await b.text())
    ck('详情页上方一排三枚（编辑/删除/生成笔记卡片，置顶那枚已撤）', bar.length === 3, barTx.join('|'))
    ck('末枚文案是「生成笔记卡片」', barTx[2] === '生成笔记卡片', barTx[2])
    ck('文末不再有底部操作区', !(await det.$('.bottom-actions')))
    await mp.screenshot({ path: path.join(OUT, '03-详情页动作在上方.png') })
    await mp.navigateBack().catch(() => {})
  } finally {
    if (tempNoteId) {
      await mp.evaluate(async (api, id) => new Promise((resolve) => {
        const token = getApp().globalData.token
        wx.request({
          url: `${api}/api/notes/${id}`, method: 'DELETE',
          header: { Authorization: `Bearer ${token}` },
          success: (r) => resolve(r.statusCode), fail: () => resolve(0),
        })
      }), API, tempNoteId).then((code) => console.log(`— 临时笔记已删（HTTP ${code}）`)).catch((e) => console.error('删临时笔记失败', e))
    }
    try { await lang.pin(mp, langBefore) } catch (e) { /* 可能已经断了 */ }
    await mp.disconnect()
  }
  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}（截图 → ${OUT}）`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('脚本崩了', e); process.exit(2) })
