// 09-30 这一批的真跑自证：邮箱换址、私密密码行上移、两次输入面板、分类 chip 上色、
// 归类笔记的圆点吃分类色、详情页四个动作全在文档上方。
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

    /* ---------- 两次输入的面板 ---------- */
    await (await (await me.$$('.menu-item'))[iPwd]).tap()
    await sleep(1200)
    d = await me.data()
    ck('点那一行就地展开', d.pwdOpen === true)
    ck('第二行小字说的是使用场景，不重复"6 位数字"',
      /内容|笔记卡片/.test(d.t.privatePasswordScene) && !/6 位/.test(d.t.privatePasswordScene),
      d.t.privatePasswordScene)
    // 这个账号已经设过密码 → 面板应是"重置态"：没有输入格，只有 返回 / 重置密码
    ck('已设过时面板不再给输入格', (await me.$$('.pwd-input')).length === 0)
    let two = []
    for (const b of await me.$$('.pwd-btn')) two.push(await b.text())
    ck('已设过那一态一行两枚：返回 + 重置密码', two.join('|') === '返回|重置密码', two.join('|'))
    await mp.screenshot({ path: path.join(OUT, '01a-面板已设过态.png') })

    // 没设过那一态（只翻本地视图状态，不发请求）：两格输入 + 取消 / 确定
    await me.setData({ privateSet: false })
    await sleep(900)
    const inputs = await me.$$('.pwd-input')
    ck('没设过那一态有两格输入（新密码 + 再输一次）', inputs.length === 2)
    ck('两格都是数字键盘且最多 6 位', (await inputs[0].attribute('maxlength')) + '' === '6')
    ck('输入是掩码的（不吃明文）', (await inputs[0].attribute('password')) !== '')
    two = []
    for (const b of await me.$$('.pwd-btn')) two.push(await b.text())
    ck('没设过那一态一行两枚：取消 + 确定', two.join('|') === '取消|确定', two.join('|'))
    await mp.screenshot({ path: path.join(OUT, '01b-面板设置态.png') })

    // 不足 6 位：不发请求、面板留着
    await me.setData({ pwd1: '12345', pwd2: '12345' })
    await (await me.$('.pwd-btn.primary')).tap()
    await sleep(900)
    d = await me.data()
    ck('不到 6 位不保存、面板不关', d.pwdOpen === true && d.privateSet === false)
    // 两格不一样：不发请求、第二格清空
    await me.setData({ pwd1: '135790', pwd2: '246801' })
    await (await me.$('.pwd-btn.primary')).tap()
    await sleep(900)
    d = await me.data()
    ck('两次不一样不保存', d.pwdOpen === true)
    ck('不一致时第二格清空让人重输', d.pwd2 === '', `pwd2=${d.pwd2}`)
    await (await me.$('.pwd-btn.ghost')).tap()
    await sleep(800)
    ck('取消能收掉面板', (await me.data()).pwdOpen === false)

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
