// 笔记列表这两层窗口的真跑自证：详情浮窗与模板预览弹窗两层互斥、每层只浮一个窗口。
// 静态尺子证不了的事都在这里量：弹窗收掉后回来的是详情窗还是列表、模板滑到第十套会不会回卷、
// 二维码开关按下去成品图真变没变。
// v18 起列表没有"就地展开"那一态（v19 沿用：摘要与原文都只在详情窗里，行只有标题+三行摘要），
// 点一枚直接浮详情窗——所以这一把原来钉的"第一下展开、第二下开窗"整批作废，
// 改成反向钉"旧状态键 openIdx 与 .row-foot/.summary 都不许回来"。
// v22（站长 10-03 第四轮）加了一整段 ②b：这一态背后只留一层——中间那批列表件必须
// visibility:hidden（不是没渲染，收窗回来滚动位置要在）、头部那一段必须铺满整屏、
// 「我的笔记」和右上角那列数字必须还在且没被窗盖住、窗下沿必须离底栏 64rpx 而不是 24。
// 同一段还钉死：出卡片的入口只剩右上那一格（底排那枚撤净）、要点前是 14 小黄点
// （带圈序号一枚不许剩）、来源链接下面那行提示在、第一屏有「显示更多」那个出口。
// 私密那两条用 setData 把 detailNote.is_private 钉成 true，验的是 dock 两块条件渲染；
// 后端那个字段本身在现网验过（§8.65 那 12 条），这里不重复造数据。
// 前置：微信开发者工具已开；改过 WXSS/WXML 要先 cli close 再
//   cli auto --project <repo>/miniprogram --auto-port 9431，等十秒端口起来。
// 跑法：bash docs/工具/跑尺子.sh 9431 验-详情浮窗两层-真跑
//   （名字**不带** .js——那支脚本自己拼 `$f.js`，带了就变成找 `…真跑.js.js`，
//    报的是 MODULE_NOT_FOUND、退出码 1，看着像这把尺子崩了其实是调用写错。）
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
    // v19：这一屏不再有排布档（纸片墙/一行随两枚 tab 换了语义，且 view 不落本机），
    // 所以这里不再清 listMode；只保证进的是「笔记列表」那一枚——v19 起 onShow 每次都回第一枚。
    await mp.reLaunch('/pages/index/index')
    await sleep(4000)
    const page = await mp.currentPage()
    let d = await page.data()
    if (!(d.notes || []).length) { console.log('!! 列表为空，无法自证'); process.exit(3) }
    ck('进页落在「笔记列表」那一枚（.xrow 在树上，这一把后面每一条都从这里取）',
      d.view === 'list' && (await page.$$('.xrow')).length >= 2,
      `view=${d.view} 条数=${(await page.$$('.xrow')).length}`)
    // 上一轮可能留着浮窗，先归零，否则断言全在比脏状态
    await page.setData({ detailOpen: false, templateOpen: false })
    await sleep(800)

    // v18 起列表就没有"就地展开"那一态，v19 沿用：data-idx 才是列表里的行号，
    // 而分类筛选都可能让它指向私密那篇——点中私密要走密码闸，
    // 这一把量的是两层窗口，所以挑第一篇**非私密**的行下手。
    const rows = await page.$$('.xrow')
    const dl = await page.data()
    const pick = dl.notes.findIndex((n) => !n.is_private)
    const rowOf = async (want) => {
      for (const e of await page.$$('.xrow')) {
        if (Number(await e.attribute('data-idx')) === want) return e
      }
      return null
    }
    const row = await rowOf(pick)

    /* ---------- ① 列表那一行只有标题与摘要，原文不在列表里 ---------- */
    ck('列表渲染出行', rows.length >= 2, `rows=${rows.length}`)
    // 手风琴那一态整块没了：旧状态键与那两个节点都不许留在树上（回来一次就是又一处"就地展开"）
    ck('列表里没有"就地展开"那一态（摘要只在详情窗里，v18 撤了手风琴）',
      dl.openIdx === undefined && (await page.$$('.row-foot')).length === 0
      && (await page.$$('.summary')).length === 0, `openIdx=${typeof dl.openIdx}`)
    ck('一行有标题', !!(await row.$('.x-t')))
    ck('左边那一列是日期那一档 MM/DD', /^\d{2}\/\d{2}$/.test(await tx(await row.$('.xd-d'))),
      await tx(await row.$('.xd-d')))
    ck('行里没有行内操作按钮', (await row.$$('.act-btn')).length === 0)
    // v19 的标题不是纸片那版"三行夹断"（那是定高 200 的卡片才需要的），
    // 是一行 + 省略号；读错一档会把正常渲染判成"标题会顶歪下一行"那种假红。
    const clamp = await (await row.$('.x-t')).style('-webkit-line-clamp')
    const ellip = await (await row.$('.x-t')).style('text-overflow')
    // style() 读 -webkit-line-clamp 回的是 'none'（不是 null），纸片那版才会回 '3'。
    ck('标题一行截断（不是纸片那版三行夹断）',
      String(clamp) !== '3' && String(ellip) === 'ellipsis', `clamp=${clamp} ellipsis=${ellip}`)
    await mp.screenshot({ path: path.join(OUT, '01-列表收起.png') })

    /* ---------- ②③ 点一行 → 直接浮详情窗（原来要两下，v18 一下） ---------- */
    await row.tap()
    await sleep(3000)
    d = await page.data()
    ck('点一行=浮详情窗（列表不再"第一下展开、第二下开窗"）',
      d.detailOpen === true, `detailOpen=${d.detailOpen}`)
    ck('浮上来的就是点的那一篇', !!d.detailNote && d.detailNote.id === dl.notes[pick].id,
      `${(d.detailNote || {}).title}`)
    ck('详情窗是浮层', !!(await page.$('.float-sheet')))
    ck('没跳独立详情页', page.path === 'pages/index/index', page.path)
    const gripTx = await page.$('.grip-tx')
    ck('把手带「点一下收起」', !!gripTx, await tx(gripTx))
    const gripW = parseFloat((await (await page.$('.grip')).size()).width)
    ck('把手行占满窗宽（文字不被挤成竖排）', gripW > 330, `${gripW}px`)
    ck('窗里大标题就是这篇', (await (await page.$('.ds-h2')).text()) === dl.notes[pick].title)
    const ibtn = []
    for (const b of await page.$$('.ds-ibtn')) ibtn.push(await b.text())
    // v22（站长 10-03 第四轮）：底排从三枚减到两枚——「生成笔记卡片」那一枚整枚撤掉，
    // 出卡片的入口挪进右上那一格（一个功能只留一个把手）。v19 撤「置顶」那条仍然成立。
    ck('dock 只剩两枚并排一行（置顶、生成笔记卡片两枚都撤了）', ibtn.length === 2, ibtn.join('|'))
    ck('底排不再有「生成笔记卡片」那枚（末枚是删除）', ibtn[ibtn.length - 1] === '删除', ibtn.join('|'))
    ck('窗里右上那一格在，它就是出卡片的唯一入口', !!(await page.$('.ds-entry')))
    ck('带圈序号那批整块撤净（.ds-pt-n 一个都不许留在树上）', (await page.$$('.ds-pt-n')).length === 0,
      `${(await page.$$('.ds-pt-n')).length} 枚`)
    const kpN = (((await page.data()).detailNote || {}).key_points || []).length
    ck('要点前是 14 小黄点，数量跟要点条数一样（不是少画一条）',
      (await page.$$('.ds-pt-dot')).length === kpN, `点 ${kpN ? (await page.$$('.ds-pt-dot')).length : 0} / 条 ${kpN}`)
    ck('来源链接下面那行提示在（新串，一句都不许少）',
      !!(await page.$('.ds-hint')) && (await tx(await page.$('.ds-hint'))) === '链接无法直接打开，可复制链接在浏览器打开',
      await tx(await page.$('.ds-hint')))
    ck('第一屏有「显示更多」那个出口（钉在正文与动作条之间）', !!(await page.$('.ds-more')),
      await tx(await page.$('.ds-more')))
    ck('原来挂在原文右边那枚 展开/收起 撤了（同一个功能不留第二个把手）', (await page.$$('.ds-sw')).length === 0)
    // size() 回的是 px 而样式里写的是 rpx（这一档差将近两倍），
    // 拿 252 去比 px 会把正常的格子判成"被挤成一条"——先换算再比。
    const winInfo = await mp.evaluate(() => wx.getWindowInfo())
    const rpx = (px) => px * 750 / winInfo.windowWidth
    const boxOf = (sel) => mp.evaluate((s) => new Promise((done) => {
      wx.createSelectorQuery().select(s).boundingClientRect((r) => done(r || null)).exec()
    }), sel)
    const hasThumb = !!(await page.$('.ds-pad'))
    const pw = rpx(parseFloat((await (await page.$('.ds-entry')).size()).width))
    ck(`右上那一格${hasThumb ? '（有卡片）是白垫那一档 252rpx' : '（空态）不窄于淡底那 176rpx'}，不是被挤成一条`,
      hasThumb ? Math.abs(pw - 252) <= 3 : pw >= 173,
      `${Math.round(pw)}rpx（窗宽 ${winInfo.windowWidth}px）`)
    // 台账与屏上必须一起说话：图还在才画白垫，图被清掉（系统清缓存只清得掉文件，清不掉 storage
    // 那本账）就退回淡底方形那一格。10-03 模拟器就是这么红过一次——src 递到了、文件不在，
    // 屏上留下一块纯白板，看着像"卡片坏了"。判据不量文件在不在，就永远抓不到这一态。
    const dNow = await page.data()
    const led = await mp.evaluate((id) => (wx.getStorageSync('cardLog') || {})[String(id)] || [],
      dl.notes[pick].id)
    const dead = await mp.evaluate((list) => list.filter((x) => {
      try { wx.getFileSystemManager().accessSync(x.p); return false } catch (e) { return true }
    }).length, led)
    ck(`右上那一格只列"文件真的在"那几张（台账 ${led.length} 张、图被清 ${dead} 张 → 窗里 ${dNow.detailCards.length} 张，屏上画的是${hasThumb ? '白垫' : '空态那一格'}）`,
      dNow.detailCards.length === led.length - dead && hasThumb === (dNow.detailCards.length > 0))
    if (hasThumb) {
      const img = await page.$('.ds-pad-img')
      const src = await img.attribute('src')
      const rect = await img.size()
      const want = (dNow.detailCards[dNow.detailCardIdx] || {}).p || ''
      ck('白垫里画的就是台账那一张（src 递到了、图也有尺寸）',
        !!src && src === want && parseFloat(rect.width) > 0 && parseFloat(rect.height) > 0,
        `src=${src ? src.slice(-28) : '（空）'} 台账=${want.slice(-28)} 尺寸=${rect.width}×${rect.height}`)
    }
    ck('正文区有实际高度（能滚）', parseFloat(((await (await page.$('.ds-body')).size()).height || '0')) > 200)
    await mp.screenshot({ path: path.join(OUT, '03-详情浮窗.png') })

    /* ---------- ②b v22：这一态背后只留一层（中间那批藏掉、图贯穿、头部那两样留着） ----------
       站长原话："隐藏上一层的展示，就是只看到背景贯穿，避免看到两层结构"，
       但「我的笔记」和右上角那列数字要留，"否则用户不知道自己处于那个状态下"。
       automator 够不到底栏（自定义组件），那一头的距离从 .float-sheet 自己的 rect 量。
       winInfo / boxOf / rpx 在上一节已经取过（同一块作用域，不重复声明）。 */
    const headBox = await boxOf('.head')
    const sheetBox = await boxOf('.float-sheet')
    const statBox = await boxOf('.stats')
    ck('头部那一段铺满整屏（图贯穿，不再是只守 542）',
      !!headBox && Math.abs(headBox.height - winInfo.windowHeight) <= 2,
      `${headBox && headBox.height} vs 窗 ${winInfo.windowHeight}`)
    ck('中间那批列表件整块藏掉（.sheet 不可见，不是没渲染）',
      (await (await page.$('.sheet')).style('visibility')) === 'hidden',
      await (await page.$('.sheet')).style('visibility'))
    ck('头部那两样还在屏上（「我的笔记」+ 右上角那列数字）',
      !!(await page.$('.h1')) && !!(await page.$('.stats')) && !!(await page.$('.stat .n')),
      await tx(await page.$('.h1')))
    ck('那两样没被窗盖住（窗的上沿在它们下面）',
      !!sheetBox && !!statBox && sheetBox.top > statBox.top,
      `窗上沿 ${sheetBox && sheetBox.top} > 数字 ${statBox && statBox.top}`)
    ck('窗下沿离屏底 192rpx（原来是 152；离底栏那一条从 24 变 64）',
      !!sheetBox && Math.abs(rpx(winInfo.windowHeight - sheetBox.bottom) - 192) <= 3,
      `离底 ${sheetBox && Math.round(rpx(winInfo.windowHeight - sheetBox.bottom))}rpx`)
    await mp.screenshot({ path: path.join(OUT, '03b-窗开着只有一层.png') })

    /* ---------- ④ 点右上那一格 → 只浮模板预览弹窗 ---------- */
    await (await page.$('.ds-entry')).tap()
    await sleep(7000)
    d = await page.data()
    ck('弹窗浮起', d.templateOpen === true)
    ck('详情窗整个藏掉（两层不叠）', d.detailOpen === false)
    // 站长 10-03 第二条："四个图的区，点开也是贯穿弹窗，保持一致性"。
    // 卡片那一屏点一格走的是同一个详情窗（onRowTap），窗里再点右上那一格才到这一层，
    // 所以贯穿这一态必须跟着弹窗一起成立，不能只在详情窗那一层做。
    const thHead = await boxOf('.head')
    ck('弹窗这一层背后同样是贯穿（头部还铺满整屏、中间那批还藏着）',
      !!thHead && Math.abs(thHead.height - winInfo.windowHeight) <= 2
      && (await (await page.$('.sheet')).style('visibility')) === 'hidden',
      `${thHead && thHead.height} vs 窗 ${winInfo.windowHeight}`)
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
    ck('还是开窗那一篇（列表没有就地展开那一态，窗不会半路换篇）',
      !!d.detailNote && d.detailNote.id === dl.notes[pick].id)
    ck('公开状态按服务端读数刷新', d.shared === true, `shared=${d.shared}`)
    ck('窗里那行「撤掉分享」在', !!(await page.$('.ds-pub-act')))

    /* ---------- 把手 / 点窗外 → 收窗回列表 ---------- */
    await (await page.$('.grip')).tap()
    await sleep(1200)
    d = await page.data()
    ck('点把手收窗回列表', d.detailOpen === false)
    ck('收窗之后列表还在（窗是浮层，不顶掉列表）', (await page.$$('.xrow')).length >= 2)
    await (await rowOf(pick)).tap()
    await sleep(3000)
    ck('窗浮着时有一整层遮罩（分类那一行点不到，不存在"开着窗切分类"那个态）',
      !!(await page.$('.float-mask')))
    await (await page.$('.float-mask')).tap()
    await sleep(1200)
    d = await page.data()
    ck('点窗外=收起详情窗', d.detailOpen === false && d.templateOpen === false)
    // v22：遮罩从 bindtap 改成 catchtap。它原来会冒泡到 .container 的 onBlankTap，
    // 于是"窗开着点一下外面"会连带把搜索词清掉——一次点击该只干一件事（词留着，✕ 才是清词的口）。
    await page.setData({ searchOpen: true, searchKeyword: '留着' })
    await sleep(600)
    // 这时候列表那一层是藏着的（.sheet 被 visibility:hidden），点行点不到——直接调开窗那个方法，
    // 量的只是"遮罩那一下会不会连带清词"这一件事。
    await page.callMethod('_openDetail', pick)
    await sleep(3000)
    await (await page.$('.float-mask')).tap()
    await sleep(1200)
    d = await page.data()
    ck('窗开着点外面只收窗，不连带清搜索词（遮罩是 catchtap，不冒泡到 onBlankTap）',
      d.detailOpen === false && d.searchKeyword === '留着', `词="${d.searchKeyword}"`)
    await page.setData({ searchOpen: false, searchKeyword: '' })
    await sleep(600)

    /* ---------- 切分类：这一行在遮罩之外，点它时窗本来就该是收着的 ---------- */
    const chipN = (await page.$$('.chip')).length
    ck('分类那一排有得点（「全部」+ 各分类）', chipN >= 2, `${chipN} 枚`)
    await (await page.$$('.chip'))[1].tap()
    await sleep(3500)
    d = await page.data()
    ck('切分类走 selectCategory：窗收掉、列表按这一档重载',
      d.detailOpen === false && d.selectedCategory !== null, `selectedCategory=${d.selectedCategory}`)
    await (await page.$$('.chip'))[0].tap()
    await sleep(3500)
    ck('点回「全部」把列表还回来（这一把后面的判据都建立在"屏上有行"上）',
      (await page.data()).selectedCategory === null && (await page.$$('.xrow')).length >= 2, '')

    /* ---------- 私密笔记：dock 两块整块不渲染 ---------- */
    await (await rowOf(pick)).tap()
    await sleep(3000)
    ck('普通笔记：右上那一格与公开状态都在', !!(await page.$('.ds-entry')) && !!(await page.$('.ds-pub')))
    await page.setData({ 'detailNote.is_private': true })
    await sleep(1200)
    ck('转成私密后右上那一格整块不渲染（私密不出卡片）', !(await page.$('.ds-entry')))
    ck('转成私密后公开状态那一行不渲染', !(await page.$('.ds-pub')))
    // v22 起两枚本来就是常态（「生成笔记卡片」挪走了），私密这一态不再"少一枚"，
    // 所以这条从"剩两枚"改成"左列摊满整宽、两枚照常并排一行"。
    ck('私密那一态两枚照常并排一行（dock 不空、不折行）', (await page.$$('.ds-ibtn')).length === 2,
      `${(await page.$$('.ds-ibtn')).length} 枚`)
    ck('私密那一态左列摊满整宽（右格没了就不留 252 的空位）',
      !!(await page.$('.ds-hero.solo')))
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
