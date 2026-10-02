// 笔记列表 v7 这一层的真跑自证：详情浮窗与模板预览弹窗两层互斥、每层只浮一个窗口。
// 静态尺子证不了的事都在这里量：点已展开的行到底是开窗还是收起、弹窗收掉后回来的是详情窗
// 还是列表、模板滑到第十套会不会回卷、二维码开关按下去成品图真变没变。
// 私密那两条用 setData 把 detailNote.is_private 钉成 true，验的是 dock 两块条件渲染；
// 后端那个字段本身在现网验过（§8.65 那 12 条），这里不重复造数据。
// 前置：微信开发者工具已开；改过 WXSS/WXML 要先 cli close 再
//   cli auto --project <repo>/miniprogram --auto-port 9431，等十秒端口起来。
// 跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/验-详情浮窗两层-真跑.js
// 跑完自己 disconnect 释放端口，否则挡住站长的真机调试。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = path.resolve(__dirname, '../design/笔记列表-堆叠卡/实测-详情浮窗')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
// 元素查不到时把"查不到"打在断言行里，而不是让脚本半路崩
const tx = async (el) => (el ? await el.text() : '（元素不存在）')

;(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  // 这一把通篇钉的是中文串（「生成笔记卡片」「取消」），而这个字段是登录时从服务端带回来的：
  // 上一把尺子（验-热启动归因.js）真登录过一次，测试号在服务端存的是 en，这里就会凭空红一片。
  // 所以开跑前钉成 zh、收尾还回去——和 验-我的页改版-真跑.js 同一个处理。
  const langBefore = await mp.evaluate(() => getApp().globalData.userInfo?.language || 'zh')
  await mp.evaluate(() => {
    const a = getApp()
    a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: 'zh' })
  })
  try {
    await sleep(2000)
    await mp.switchTab('/pages/index/index')
    await sleep(4000)
    const page = await mp.currentPage()
    let d = await page.data()
    if (!(d.notes || []).length) { console.log('!! 列表为空，无法自证'); process.exit(3) }
    // 上一轮可能留着展开态/浮窗，先归零，否则断言全在比脏状态
    await page.setData({ openIdx: -1, detailOpen: false, templateOpen: false })
    await sleep(800)

    /* ---------- ① 收起态只有三样 ---------- */
    const rows = await page.$$('.note-row')
    ck('列表渲染出行卡', rows.length >= 2, `rows=${rows.length}`)
    ck('收起态没有 meta 脚注行', (await page.$$('.row-foot')).length === 0)
    ck('收起态不露摘要', (await page.$$('.summary')).length === 0)
    ck('收起行走 .row-line（点+标题+日期）', (await page.$$('.row-line')).length === rows.length)
    const line = await rows[0].$('.row-line')
    ck('收起行含分类点', !!(await line.$('.cat-dot')))
    const ti = await line.$('.row-title')
    ck('收起行含标题', !!(await line.$('.row-title')))
    ck('收起行含日期', !!(await line.$('.dt')), await tx(await line.$('.dt')))
    ck('收起行里没有行内操作按钮', (await rows[0].$$('.act-btn')).length === 0)
    // DevTools 不吐 white-space 的计算值，取同一条规则里可测的那条当证据
    ck('收起标题单行截断', await ti.style('text-overflow') === 'ellipsis', await ti.style('text-overflow'))
    await mp.screenshot({ path: path.join(OUT, '01-列表收起.png') })

    /* ---------- ② 点一条 → 卡片挪过去 ---------- */
    await rows[0].tap()
    await sleep(1200)
    d = await page.data()
    ck('点收起的行=展开该行', d.openIdx === 0, `openIdx=${d.openIdx}`)
    ck('展开不等于开窗', d.detailOpen === false)
    const openTi = await page.$('.note-row.open .row-title')
    ck('展开标题单行截断', await openTi.style('text-overflow') === 'ellipsis')
    ck('展开标题是 36rpx 那一档（屏上 18px）', await openTi.style('font-size') === '18px', await openTi.style('font-size'))
    ck('展开态才有 meta 脚注行', (await page.$$('.note-row.open .row-foot')).length === 1)
    await mp.screenshot({ path: path.join(OUT, '02-一条展开.png') })

    /* ---------- ③ 点已展开那条 → 详情浮窗 ---------- */
    await (await page.$$('.note-row'))[0].tap()
    await sleep(3000)
    d = await page.data()
    ck('点已展开的行=浮详情窗（不是收起）', d.detailOpen === true, `detailOpen=${d.detailOpen}`)
    ck('列表那条保持展开', d.openIdx === 0, `openIdx=${d.openIdx}`)
    ck('详情窗是浮层', !!(await page.$('.float-sheet')))
    ck('没跳独立详情页', page.path === 'pages/index/index', page.path)
    const gripTx = await page.$('.grip-tx')
    ck('把手带「点一下收起」', !!gripTx, await tx(gripTx))
    const gripW = parseFloat((await (await page.$('.grip')).size()).width)
    ck('把手行占满窗宽（文字不被挤成竖排）', gripW > 330, `${gripW}px`)
    ck('窗里大标题就是这篇', (await (await page.$('.ds-h2')).text()) === d.notes[0].title)
    const ibtn = []
    for (const b of await page.$$('.ds-ibtn')) ibtn.push(await b.text())
    ck('dock 四枚并排一行', ibtn.length === 4, ibtn.join('|'))
    const primary = await page.$('.ds-ibtn.primary')
    ck('第四枚是「生成笔记卡片」（不再叫转为）', !!primary && (await primary.text()) === '生成笔记卡片', primary ? await primary.text() : '')
    const pw = primary ? parseFloat((await primary.size()).width) : 0
    const w3 = parseFloat((await (await page.$$('.ds-ibtn'))[1].size()).width)
    ck('它比另三枚宽一点（六个字不顶边）', pw > w3, `primary=${pw} 其余=${w3}`)
    ck('正文区有实际高度（能滚）', parseFloat(((await (await page.$('.ds-body')).size()).height || '0')) > 200)
    await mp.screenshot({ path: path.join(OUT, '03-详情浮窗.png') })

    /* ---------- ④ 生成笔记卡片 → 只浮模板预览弹窗 ---------- */
    await (await page.$('.ds-ibtn.primary')).tap()
    await sleep(7000)
    d = await page.data()
    ck('弹窗浮起', d.templateOpen === true)
    ck('详情窗整个藏掉（两层不叠）', d.detailOpen === false)
    ck('成品图已出', !!d.posterImagePath)
    ck('弹窗里是模板预览', !!(await page.$('.tpl-sheet')) && !!(await page.$('.tpl-poster')))
    ck('弹窗里没有详情窗的 dock', !(await page.$('.ds-dock')))
    ck('弹窗 dock 有二维码开关', !!(await page.$('.tpl-qr')))
    ck('开关默认开着', d.noQr === false)
    // 10-01 站长：账号认证下来了，这枚主操作从"存进相册"换成弹微信的图片分享面板
    //（发送给朋友 / 朋友圈 / 收藏 / 保存图片 / 转发为贴图五枚都在里面），所以文案不能再只说存相册。
    const tplBtns = []
    for (const b of await page.$$('.tpl-btn')) tplBtns.push(await b.text())
    ck('主操作那枚叫「保存并分享」（左那枚仍是取消）', tplBtns.join('|') === '取消|保存并分享', tplBtns.join('|'))
    const menuApi = await mp.evaluate(() => typeof wx.showShareImageMenu)
    ck('这一档环境里有微信图片分享面板这个 API（真机上那五枚才是它给的）',
      menuApi === 'function', `typeof=${menuApi}`)
    // 页面方法在逻辑层是代理过的原生函数，String(fn) 只能拿到 [native code]，读不到实现；
    // 所以这一条从源码读：主路径必须只打面板，存相册那一枪只能出现在兜底那个函数里。
    const IDX_JS = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')
    const grab = (name) => (new RegExp(`${name}\\(\\)\\s*\\{([\\s\\S]*?)\\n  \\}`).exec(IDX_JS) || [])[1] || ''
    const main = grab('onSavePoster'), fb = grab('_saveToAlbum')
    ck('主路径只打图片分享面板（wx.showShareImageMenu），不再自己往相册里塞',
      /wx\.showShareImageMenu\(/.test(main) && !/saveImageToPhotosAlbum/.test(main),
      `onSavePoster 里 showShareImageMenu=${/showShareImageMenu/.test(main)} 直接存相册=${/saveImageToPhotosAlbum/.test(main)}`)
    ck('面板打不开时才退回存相册（兜底那条路还在）',
      /wx\.saveImageToPhotosAlbum\(/.test(fb) && /this\._saveToAlbum\(\)/.test(main), `兜底函数 ${fb.length} 字符`)
    // 站长 10-02 iPhone 11：那五枚按钮所在的面板是半透明底，我们这一页（弹窗、取消/保存并分享、
    // 底栏、另一张码）全从它背后透出来，"看到后面杂乱无章"。面板那一层是微信的、压不住，
    // 能压的只有它底下这一页：拉起之前先铺一整屏纯黑。钉三件事——
    // ① 铺在调面板之前、收在 complete（成功/取消/失败三条口最后都走它，漏了就是把人永久关在黑屏里）；
    // ② 那一层真铺满整屏；③ 层序压得过底栏（底栏是自定义组件，automator 够不到，只能读它自己那份 z-index）。
    const barSrc = fs.readFileSync(path.resolve(__dirname, '../../miniprogram/custom-tab-bar/index.wxss'), 'utf8')
    const barZ = Number((/\.tab-bar\s*\{[\s\S]*?z-index:\s*(\d+)/.exec(barSrc) || [])[1] || 0)
    ck('拉起面板前先铺整屏纯黑，收在 complete（不会把人留在黑屏里）',
      /shareDim:\s*true[\s\S]*wx\.showShareImageMenu/.test(main) &&
      /complete:\s*\(\)\s*=>\s*this\.setData\(\{[\s\S]*shareDim:\s*false/.test(main))
    await page.setData({ shareDim: true })
    await sleep(320)
    const dimBox = await mp.evaluate(() => new Promise((done) => {
      wx.createSelectorQuery().select('.share-dim').boundingClientRect((r) => done(r || null)).exec()
    }))
    const win = await mp.evaluate(() => wx.getWindowInfo())
    const dimZ = Number(await (await page.$('.share-dim')).style('z-index'))
    ck('那一层铺满整屏，且层序压得过底栏（底栏那个数是它自己 wxss 里写的）',
      !!dimBox && Math.abs(dimBox.width - win.windowWidth) <= 1 &&
      Math.abs(dimBox.height - win.windowHeight) <= 1 && dimZ > barZ,
      `${dimBox && dimBox.width}×${dimBox && dimBox.height} 窗 ${win.windowWidth}×${win.windowHeight} 层 ${dimZ} > 底栏 ${barZ}`)
    await page.setData({ shareDim: false })
    await sleep(320)
    ck('面板一收就把这层撤掉（平时绝不在屏上）', !(await page.$('.share-dim')))
    await mp.screenshot({ path: path.join(OUT, '04-模板弹窗.png') })

    /* ---------- 关码 → 整张重画 ---------- */
    await (await page.$('.tpl-qr')).tap()
    await sleep(7000)
    d = await page.data()
    ck('点了开关就关码', d.noQr === true, `noQr=${d.noQr}`)
    ck('关码后重画完仍出图', !!d.posterImagePath && d.posterBusy === false)
    await mp.screenshot({ path: path.join(OUT, '05-关码重画.png') })
    await (await page.$('.tpl-qr')).tap()
    await sleep(7000)

    /* ---------- ⑤ 滑到第十套停住、不循环 ---------- */
    await page.setData({ posterTpl: 'lit' })
    await sleep(500)
    await page.callMethod('_advanceTemplate', 1)
    await sleep(7000)
    ck('第九套右滑到第十套', (await page.data()).posterTpl === 'spec', (await page.data()).posterTpl)
    await page.callMethod('_advanceTemplate', 1)
    await sleep(7000)
    ck('第十套再滑不动（不回卷到第一套）', (await page.data()).posterTpl === 'spec')
    await page.setData({ posterTpl: 'card' })
    await sleep(500)
    await page.callMethod('_advanceTemplate', -1)
    await sleep(7000)
    ck('第一套左滑也滑不动（不绕到末尾）', (await page.data()).posterTpl === 'card')
    await mp.screenshot({ path: path.join(OUT, '06-换模板.png') })

    /* ---------- ⑥ 取消 → 回详情窗，不是回列表 ---------- */
    await (await page.$('.tpl-btn.ghost')).tap()
    await sleep(2500)
    d = await page.data()
    ck('弹窗收掉', d.templateOpen === false)
    ck('浮上来的还是详情窗', d.detailOpen === true)
    ck('那条还是展开态', d.openIdx === 0, `openIdx=${d.openIdx}`)
    ck('公开状态按服务端读数刷新', d.shared === true, `shared=${d.shared}`)
    ck('窗里那行「撤掉分享」在', !!(await page.$('.ds-pub-act')))

    /* ---------- 把手 / 点窗外 → 收窗回列表 ---------- */
    await (await page.$('.grip')).tap()
    await sleep(1200)
    d = await page.data()
    ck('点把手收窗回列表', d.detailOpen === false)
    ck('列表保持那条展开', d.openIdx === 0, `openIdx=${d.openIdx}`)
    await (await page.$$('.note-row'))[0].tap()
    await sleep(2500)
    await (await page.$('.float-mask')).tap()
    await sleep(1200)
    d = await page.data()
    ck('点窗外=收起详情窗', d.detailOpen === false && d.templateOpen === false)

    /* ---------- 换筛选会重排行号，两层先收掉 ---------- */
    await (await page.$$('.note-row'))[1].tap()
    await sleep(1200)
    ck('点另一条=卡片挪过去', (await page.data()).openIdx === 1)
    await (await page.$('.chip')).tap()
    await sleep(3500)
    d = await page.data()
    ck('切分类后展开态与窗都收掉', d.openIdx === -1 && d.detailOpen === false, `openIdx=${d.openIdx}`)

    /* ---------- 私密笔记：dock 两块整块不渲染 ---------- */
    await (await page.$$('.note-row'))[0].tap()
    await sleep(1200)
    await (await page.$$('.note-row'))[0].tap()
    await sleep(3000)
    ck('普通笔记：生成卡片与公开状态都在', !!(await page.$('.ds-ibtn.primary')) && !!(await page.$('.ds-pub')))
    await page.setData({ 'detailNote.is_private': true })
    await sleep(1200)
    ck('转成私密后「生成笔记卡片」整块不渲染', !(await page.$('.ds-ibtn.primary')))
    ck('转成私密后公开状态那一行不渲染', !(await page.$('.ds-pub')))
    ck('置顶/编辑/删除三枚不受影响（自动等宽）', (await page.$$('.ds-ibtn')).length === 3)
    await mp.screenshot({ path: path.join(OUT, '07-私密窗.png') })
    await (await page.$('.grip')).tap()
    await sleep(800)

    console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}（截图 → ${OUT}）`)
    process.exitCode = bad.length ? 1 : 0
  } finally {
    await mp.evaluate((l) => {
      const a = getApp()
      a.globalData.userInfo = Object.assign({}, a.globalData.userInfo, { language: l })
    }, langBefore)
    await mp.disconnect()
  }
})().catch((e) => { console.error('脚本崩了', e); process.exit(2) })
