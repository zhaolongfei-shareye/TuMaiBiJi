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
    ck('遮罩 + 居中卡两层都在（旧的 .pwd-layer/.pwd-sheet 那一版已撤）', !!mask && !!card)
    ck('遮罩铺满整屏（与分类管理同一口径）',
      !!mask && Math.abs(mask.height - win.windowHeight) <= 1 && Math.abs(mask.width - win.windowWidth) <= 1,
      mask && `${mask.width}×${mask.height}`)
    ck('卡以屏心为中心（不再贴底，所以按钮不会再被切）',
      !!card && Math.abs((card.left + card.right) / 2 - win.windowWidth / 2) <= 2 &&
      Math.abs((card.top + card.bottom) / 2 - win.windowHeight / 2) <= 2,
      card && `圆心 ${((card.left + card.right) / 2).toFixed(1)}/${((card.top + card.bottom) / 2).toFixed(1)} 屏心 ${(win.windowWidth / 2).toFixed(1)}/${(win.windowHeight / 2).toFixed(1)}`)
    // 他打回的那一条就是"下方的按钮被遮挡"——所以这一条是这块的核心判据。
    const btnRects = await rects('.pwd-btn')
    ck('两枚按钮整枚在卡以内（图三那个被切掉的事故不再出现）',
      btnRects.length === 2 && btnRects.every((b) => b.bottom <= card.bottom + 1 && b.top >= card.top - 1),
      btnRects.map((b) => `${b.top.toFixed(0)}~${b.bottom.toFixed(0)}`).join(' ') + ` | 卡 ${card && card.bottom.toFixed(0)}`)
    const sceneTx = await tx(await me.$('.pwd-scene'))
    ck('使用场景那句写在页面里面（不是只在弹窗标题）',
      /私密/.test(sceneTx) && sceneTx.length > 12, sceneTx)
    const nameTx = await tx(await me.$('.pwd-name'))
    ck('从上到下第一样是功能名称', nameTx.indexOf('私密密码') === 0, nameTx)
    ck('方格上方有一行校验提醒', (await tx(await me.$('.pwd-tip'))).length > 6, await tx(await me.$('.pwd-tip')))
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
    ck('那只 input 是数字键盘、最多 6 位、掩码',
      (await capture.attribute('maxlength')) + '' === '6' &&
      (await capture.attribute('password')) !== '' &&
      (await capture.attribute('type')) === 'number')
    const capStyle = await capture.style('opacity')
    ck('input 自己是隐形的（屏上只看见方格）', parseFloat(capStyle) === 0, capStyle)
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

    /* ---------- 造一条归了类的笔记，验圆点吃分类色 ---------- */
    const made = await mp.evaluate(async (api) => {
      const token = getApp().globalData.token
      const send = (url, method, data) => new Promise((resolve) => wx.request({
        url: api + url, method, data,
        header: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        success: (r) => resolve(r.data), fail: (e) => resolve({ _fail: e.errMsg }),
      }))
      return send('/api/notes/', 'POST', { title: '圆点颜色自证·临时', source_type: 'manual', content: '这条只用来验圆点吃分类色，跑完就删。', category_id: 1 })
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
    const rows = await list.$$('.note-row')
    const dotNew = await (await rows[rowOf].$('.row-line .cat-dot')).style('background-color')
    const plainRow = notes.findIndex((n, i) => n.category_id == null && i !== rowOf)
    const dotPlain = plainRow >= 0 ? await (await (await rows[plainRow].$('.row-line .cat-dot')).style('background-color')) : ''
    ck('归了类的行前圆点吃分类色', !!dotNew && dotNew !== dotPlain, `归类=${dotNew} 未分类=${dotPlain}`)
    await mp.screenshot({ path: path.join(OUT, '02-分类章与圆点.png') })

    /* ---------- 详情页：四个动作全在上方 ---------- */
    await mp.navigateTo(`/pages/detail/detail?id=${tempNoteId}`)
    await sleep(3500)
    const det = await mp.currentPage()
    const bar = await det.$$('.action-bar .icon-btn')
    const barTx = []
    for (const b of bar) barTx.push(await b.text())
    ck('详情页上方一排四枚（置顶/编辑/删除/生成笔记卡片）', bar.length === 4, barTx.join('|'))
    ck('第四枚文案是「生成笔记卡片」', barTx[3] === '生成笔记卡片', barTx[3])
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
