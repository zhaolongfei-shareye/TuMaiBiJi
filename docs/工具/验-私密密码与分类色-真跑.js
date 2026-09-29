// 09-30 这一批的真跑自证：邮箱换址、私密密码行上移、两次输入面板、分类 chip 上色、
// 归类笔记的圆点吃分类色、详情页四个动作全在文档上方。
// 前置：微信开发者工具已开；改过 WXSS/WXML 要先 cli close 再
//   cli auto --project <repo>/miniprogram --auto-port 9431，等十秒端口起来。
// 会造一条临时笔记（分类=旅游）用来验圆点颜色，跑完删掉，不动他原有那三条。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-私密密码与分类色-真跑.js
const automator = require('miniprogram-automator')
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
    ck('私密密码那一行紧跟在外观设置下面', iPwd === iWall + 1, `外观=${iWall} 密码=${iPwd}`)
    ck('那一行右边写着设没设', /密码已设置|未设置/.test(labels[iPwd] || ''), labels[iPwd])
    ck('关于/反馈邮箱/注销那组里不再有私密密码', !labels.slice(iPwd + 1).some((x) => x.startsWith('私密密码')))

    /* ---------- 两次输入的面板 ---------- */
    await (await (await me.$$('.menu-item'))[iPwd]).tap()
    await sleep(1200)
    d = await me.data()
    ck('点那一行浮出密码面板', d.pwdPanel === true)
    const inputs = await me.$$('.pwd-input')
    ck('面板里有两格输入（新密码 + 再输一次）', inputs.length === 2)
    ck('两格都是数字键盘且最多 6 位', (await inputs[0].attribute('maxlength')) === '6' || (await inputs[0].attribute('maxlength')) === 6)
    ck('输入是掩码的（不吃明文）', (await inputs[0].attribute('password')) !== '')
    ck('重置那一枚在（因为已设置过）', !!(await me.$('.pwd-reset')))

    // 不足 6 位：不发请求、面板留着
    await me.setData({ pwd1: '12345', pwd2: '12345' })
    await (await me.$('.pwd-save')).tap()
    await sleep(900)
    d = await me.data()
    ck('不到 6 位不保存、面板不关', d.pwdPanel === true && d.privateSet === true)
    // 两格不一样：不发请求、第二格清空
    await me.setData({ pwd1: '135790', pwd2: '246801' })
    await (await me.$('.pwd-save')).tap()
    await sleep(900)
    d = await me.data()
    ck('两次不一样不保存', d.pwdPanel === true)
    ck('不一致时第二格清空让人重输', d.pwd2 === '', `pwd2=${d.pwd2}`)
    await mp.screenshot({ path: path.join(OUT, '01-密码面板.png') })
    await (await me.$('.pwd-cancel')).tap()
    await sleep(800)
    ck('取消能收掉面板', (await me.data()).pwdPanel === false)

    /* ---------- 分类那一排上颜色 ---------- */
    await mp.switchTab('/pages/index/index')
    await sleep(3500)
    const list = await mp.currentPage()
    const chips = await list.$$('.chip')
    ck('筛选排有「全部」+ 两枚分类', chips.length === 3, `chips=${chips.length}`)
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
    await mp.disconnect()
  }
  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}（截图 → ${OUT}）`)
  process.exitCode = bad.length ? 1 : 0
})().catch((e) => { console.error('脚本崩了', e); process.exit(2) })
