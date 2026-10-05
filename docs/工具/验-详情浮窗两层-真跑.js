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
// ③（站长 10-03 报的落点错）真跳一趟编辑页再回来：没保存点取消，回来的必须还是这扇窗、
// 还是这一篇。标志挂在页面实例上（不是 data，它不是渲染状态），所以用 evaluate 读 getCurrentPages()[0]。
// v25（站长 10-03 第三稿）成品弹窗底排改两行：第一行 取消｜编辑个人名片，第二行那枚通栏
// 组合按钮把二维码药丸吃进去了，按钮上的字跟着 noQr 两态切「带二维码分享／无二维码分享」。
// 于是这一把多钉三件事：药丸必须在 .tpl-main 里面（旧的单独一行 .tpl-qr 不许回来）、
// 点药丸只切开关不能冒泡去分享（开发者工具里点主按钮会真走一次存相册+记台账，全程不碰）、
// 以及「卡片上的信息」那一层浮在成品弹窗上面、收掉它成品弹窗还在。
// 10-03 深夜他对着真机截图改了两条口径：那一层下面那行从"写角色名"变成**「卡片」的勾选器**
// （点「位置 N」把这张指定为卡片，勾上那枚画 ✔ 而不是写"卡片"两个字），所以这一段先摆出
// "三张有图 + 一格空"的现场，再真点四下：挪勾、连带另一个角色不许被碰、取消之后不自动补位、
// 空格不给勾，最后把 storage 原样还回去。
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
// 药丸上面那行的字从字典现读：站长 10-05 要它在「开启二维码」后面补一句说明，
// 抄死旧串的那两条判据会当场变成假红（能不能放得下由 `探-小字不折行.js` 量渲染盒子钉）。
const ZH = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js')).texts('zh')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
// 元素查不到时把"查不到"打在断言行里，而不是让脚本半路崩
const tx = async (el) => (el ? await el.text() : '（元素不存在）')

/* 「卡片上的信息」那一层要点得动，先得有"已经有图"的现场：chooseImage 在模拟器里弹的是
   工具自己的面板，不在页面树里，点不动（同 验-形象四槽-真跑.js 那把的处理）。所以绕开选图，
   直接往 USER_DATA_PATH 写几张真 JPEG、把槽摆进 storage。列表里递 null 表示那一格留空——
   "空格不给打勾"那一支也要有覆盖，不然就是空过。
   跑完把整份 poster_profile 原样写回去：站长模拟器里那四张真图一张不少、角色一个不变。 */
const JPG_1PX = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=='

const seedCi = (mp, roles) => mp.evaluate((list, b64) => {
  const fsx = wx.getFileSystemManager()
  const ud = wx.env.USER_DATA_PATH
  const paths = list.map((r, i) => (r ? `${ud}/ci-ruler-${i}.jpg` : null))
  paths.forEach((p) => { if (p) { try { fsx.writeFileSync(p, b64, 'base64') } catch (e) { /* 已存在就沿用 */ } } })
  const miss = paths.filter((p) => { if (!p) return false; try { fsx.accessSync(p); return false } catch (e) { return true } })
  if (miss.length) return { fatal: `这几张没造出来：${miss.join(',')}` }
  const before = wx.getStorageSync('poster_profile') || {}
  const prof = JSON.parse(JSON.stringify(before))
  prof.images = list.map((r, i) => (r ? { path: paths[i], card: !!r.card, bg: !!r.bg } : null))
  prof.avatarPath = ''
  wx.setStorageSync('poster_profile', prof)
  return { ok: true, before, paths }
}, roles, JPG_1PX)

const restoreCi = (mp, before, paths) => mp.evaluate((p, ps) => {
  wx.setStorageSync('poster_profile', p)
  const fsx = wx.getFileSystemManager()
  ps.forEach((f) => { if (f) { try { fsx.unlinkSync(f) } catch (e) { /* 本来就没有 */ } } })
  return true
}, before, paths)

const readCi = (mp) => mp.evaluate(() => {
  const p = wx.getStorageSync('poster_profile') || {}
  return (p.images || [null, null, null, null]).map((s) => ({ card: !!(s && s.card), bg: !!(s && s.bg), has: !!(s && s.path) }))
})

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
    /* 站长 10-03：「第一屏最好有个"显示更多"，用户点击可以跳到下面看原文」。
       只钉"这一枚在"不够——他要么点了没反应，要么展开了但没滚过去，屏上看到的还是摘要。
       所以真点两次：展开（原文那块真渲染出来 + 指针指到 #ds-orig + 文案换成「收起」）、
       收回（三样一起退回去）。这一段跑完 origOpen 落回 false，后面几节的状态不受影响。 */
    const noteNow = await page.data()
    const origText = (noteNow.detailNote || {}).original_content || ''
    // 原文里带换行，渲染出来的 text 会把它折掉——两边都先去空白再比，否则是一条假红
    const flat = (s) => String(s).replace(/\s+/g, '')
    ck('这一篇有原文，「显示更多」才画得出来（没有原文就不该给一个跳不到的口）', !!origText,
      `原文 ${origText.length} 字`)
    await (await page.$('.ds-more')).tap()
    await sleep(1500)
    let dm = await page.data()
    const paras = await page.$$('.ds-para')
    const last = paras.length ? await paras[paras.length - 1].text() : ''
    ck('点一下=展开原文并把正文滚到那一段（不是只把字塞进去、人还停在摘要那一屏）',
      dm.origOpen === true && dm.dsTo === 'ds-orig' && paras.length === 2
      && flat(last).startsWith(flat(origText).slice(0, 12)),
      `origOpen=${dm.origOpen} 指到=${dm.dsTo} 段落数=${paras.length}`)
    ck('展开之后那一枚的话翻成「收起」（同一个口，不另起第二枚）',
      (await tx(await page.$('.ds-more'))).includes('收起'), await tx(await page.$('.ds-more')))
    await (await page.$('.ds-more')).tap()
    await sleep(1500)
    dm = await page.data()
    ck('再点一下收回：原文撤掉、指针回顶上（两下之后和没点过一样）',
      dm.origOpen === false && dm.dsTo === 'ds-top' && (await page.$$('.ds-para')).length === 1,
      `origOpen=${dm.origOpen} 指到=${dm.dsTo}`)
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
      const want = (dNow.detailCards[0] || {}).p || ''
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

    /* ---------- ④ 点右上那一格 → 只浮模板预览弹窗 ----------
       一篇一张之后这一层分两态（未生成／已生成）。这一把量的是未生成态那一套：底排、药丸、
       滑动不循环、名片小弹窗。所以开窗之前把这一篇那本账临时挪开（detailCards 也一起清空——
       onSheetToPoster 读的就是它），跑完原样放回 storage；已生成态那两问（底排只剩查看笔记｜删除、
       左右滑不动）钉在 验-列表v19-真跑.js 的 ⑧b，不在这把里重复造现场。 */
    const ledKeep = await mp.evaluate((id) => {
      const m = wx.getStorageSync('cardLog') || {}
      const k = String(id)
      const v = m[k] || null
      if (v) { delete m[k]; wx.setStorageSync('cardLog', m) }
      return v
    }, dl.notes[pick].id)
    await page.setData({ detailCards: [] })
    await sleep(400)
    await (await page.$('.ds-entry')).tap()
    await sleep(7000)
    d = await page.data()
    ck('台账挪开之后开出来的这一层落在未生成态（底排有通栏那枚、能滑、能改名片）',
      d.templateOpen === true && d.posterHasCard === false && !!(await page.$('.tpl-main')), '')
    ck('药丸默认是"开着"那一档底色（点一下才退成淡底）',
      (await page.$$('.tpl-main .pill-on')).length === 1 && d.noQr === false,
      `pill-on ${(await page.$$('.tpl-main .pill-on')).length} 枚`)
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
    // 10-03 第三稿：二维码药丸不再单独占一行，搬进那枚通栏主按钮里（站长原话
    // "二维码药丸与分享做成组合按钮，通栏按钮"）。所以这里钉的是"药丸在主按钮里面"。
    ck('开关在主按钮里面（不再单独一行 .tpl-qr）',
      !!(await page.$('.tpl-main')) && !!(await page.$('.tpl-main .pill')) && !(await page.$('.tpl-qr')))
    ck('开关默认开着', d.noQr === false)
    // 10-01 站长：账号认证下来了，这枚主操作从"存进相册"换成弹微信的图片分享面板
    //（发送给朋友 / 朋友圈 / 收藏 / 保存图片 / 转发为贴图五枚都在里面），所以文案不能再只说存相册。
    // 10-03 站长再收两步：先只叫「分享」，第三稿把开关搬进来之后改叫「带二维码分享」／
    // 「无二维码分享」——按钮上的字要跟药丸一起说话。两态刻意都是六个字，切开关时不跳位。
    const tplBtns = []
    for (const b of await page.$$('.tpl-btn')) tplBtns.push(await b.text())
    ck('第一行两枚是「取消｜编辑个人名片」（旧的"保存并分享"不许回来）',
      tplBtns.join('|') === '取消|编辑个人名片', tplBtns.join('|'))
    /* 站长 10-03 23:40：按钮上的字不再跟药丸联动（那两句"带／无二维码分享"撤了），
       主按钮只说干什么＝「生成分享图」，状态改由药丸上面那行小字说。 */
    const mainTx = await (await page.$('.tpl-main')).text()
    ck('通栏那枚只说「生成分享图」，状态交给药丸上面那行小字（默认吃字典里 `qrOn` 那一句）',
      mainTx === '生成分享图' && (await tx(await page.$('.pill-lab'))) === ZH.qrOn,
      `${mainTx} / ${await tx(await page.$('.pill-lab'))}`)
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

    /* ---------- 关码 → 整张重画（点的是主按钮里那枚药丸，不是主按钮本身） ----------
       药丸这层必须 catchtap：它现在整个泡在"分享"那一枚里面，冒泡上去就是关个码顺手把图发出去了。
       ⚠️ 这一把全程不许点 .tpl-main 本体——开发者工具里 showShareImageMenu 一定 fail，
       会顺着兜底那条路真存一次相册并记一次台账。 */
    await (await page.$('.tpl-main .pill')).tap()
    await sleep(7000)
    d = await page.data()
    ck('点了开关就关码', d.noQr === true, `noQr=${d.noQr}`)
    ck('关码后重画完仍出图', !!d.posterImagePath && d.posterBusy === false)
    ck('点药丸只切开关，没冒泡去分享（弹窗还开着、那层黑没铺）',
      d.templateOpen === true && d.shareDim === false, `open=${d.templateOpen} dim=${d.shareDim}`)
    ck('关着码时药丸上面那行小字跟着换成「关闭二维码」（药丸内部底色也退了）',
      (await tx(await page.$('.pill-lab'))) === ZH.qrOff
      && (await page.$$('.tpl-main .pill-on')).length === 0, await tx(await page.$('.pill-lab')))
    await mp.screenshot({ path: path.join(OUT, '05-关码重画.png') })
    await (await page.$('.tpl-main .pill')).tap()
    await sleep(7000)
    ck('再点一下开回来，那行小字也跟着回来',
      (await tx(await page.$('.pill-lab'))) === ZH.qrOn, await tx(await page.$('.pill-lab')))
    ck('主按钮上那行字从头到尾没跟着开关变（它只说这一枚干什么）',
      (await (await page.$('.tpl-main')).text()) === '生成分享图')

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

    /* ---------- ⑦「卡片上的信息」：出卡片这一屏就地改名片（站长 10-03 第三稿） ----------
       这一层读写的是「我的→卡片模板」同一份数据。四格先摆成"已经有图"的现场（见上面 seedCi），
       所以这一整段每一下都是真控件、真处理函数，包括"点下面那行打勾"那一族。 */
    const seeded = await seedCi(mp, [{ card: true, bg: true }, {}, { bg: true }, null])
    if (seeded.fatal) { console.log('!! ' + seeded.fatal); await mp.close(); process.exit(3) }
    const row1 = await page.$$('.tpl-btn')
    await row1[1].tap()
    await sleep(900)
    d = await page.data()
    ck('点「编辑个人名片」浮出小弹窗，成品弹窗那个开关状态还挂着（收掉小弹窗要回得来）',
      d.cardInfoOpen === true && d.templateOpen === true, `ci=${d.cardInfoOpen} tpl=${d.templateOpen}`)
    /* 真机两轮：第一轮 z-index 102 压不过 101（站长 20:42 两张截图，量法见 PRD §8.106——
       在"卡片之外、上层白面板之内"取一条，开与不开都是 251.0，那层 55% 的黑根本没落上去，
       只有 input 那行字漏出来，因为它是原生层不吃 webview 层序）。第二轮换成"藏 visibility"，
       他原话「还没修好，依旧这样」。所以这一态不再讲层序：成品弹窗整层从渲染树里摘掉，
       页面上只剩小弹窗一个浮层——跟「我的」页私密密码那一层同构，那一层在他 iPhone 11 上是好的。
       模拟器里两轮都是绿的，所以这两条只能算"结构上没东西可盖"，真机那一眼仍要他判。 */
    const gone = {
      sheet: !!(await page.$('.tpl-sheet')),
      poster: !!(await page.$('.tpl-poster')),
      mask: (await page.$$('.float-mask')).length,
    }
    ck('小弹窗开着时，成品弹窗整层不在渲染树里（面板、成品图、透明遮罩三样都查不到）',
      !gone.sheet && !gone.poster && gone.mask === 0, JSON.stringify(gone))
    ck('这一态该在的只有小弹窗自己：标题＋四枚格子＋两栏输入',
      !!(await page.$('.ci-title')) && (await page.$$('.ci-disc')).length === 4 && (await page.$$('.ci-input')).length === 2)
    ck('标题是「卡片上的信息」', (await (await page.$('.ci-title')).text()) === '卡片上的信息')
    ck('四枚位置格一行放满', (await page.$$('.ci-disc')).length === 4)
    /* 圆必须是"圆"的：10-03 第一版这里挂的是裸 empty/filled 修饰类，撞上本页 642 行
       列表空态那条 `.loading, .empty, .loading-more { padding: var(--sp-6) 0 }`，
       四枚 124 的圆被撑成 124×254 的竖椭圆——结构判据全绿，只有截图是坏的。
       所以这条量的是盒子形状（宽高、正方），类名对不对换不掉这一眼。 */
    const sc = (await mp.evaluate(() => wx.getWindowInfo().windowWidth)) / 750
    const discs = await mp.evaluate(() => new Promise((done) => {
      wx.createSelectorQuery().selectAll('.ci-disc').boundingClientRect((r) => done(r || [])).exec()
    }))
    ck('四枚格子量出来是正圆：宽 124(+描边)、高与宽相差不超过 2rpx',
      discs.length === 4 && discs.every((b) => {
        const w = b.width / sc, h = b.height / sc
        return w >= 120 && w <= 136 && Math.abs(h - w) <= 2
      }),
      discs.map((b) => `${Math.round(b.width / sc)}×${Math.round(b.height / sc)}rpx`).join(' '))
    const filled = (await page.$$('.ci-disc.ci-filled')).length
    const empties = (await page.$$('.ci-disc.ci-empty')).length
    ck('摆出来的现场对：三枚有图、一枚虚线空格',
      filled === 3 && empties === 1, `有图 ${filled}／空 ${empties}`)
    const repl = (await page.$$('.ci-repl')).length
    const bins = (await page.$$('.ci-bin')).length
    ck('有图那几枚才挂「更换」和垃圾桶，空格两样都没有',
      repl === filled && bins === filled, `有图 ${filled}／更换 ${repl}／垃圾桶 ${bins}`)
    ck('名称与一句话两栏都在', (await page.$$('.ci-input')).length === 2)
    ck('底下两枚是取消｜保存',
      (await (await page.$('.ci-btn.ghost')).text()) === '取消' &&
      (await (await page.$('.ci-btn.pri')).text()) === '保存')

    /* 站长 10-03 22:47 真机两张：这一层整层看得见、选图也正常（**层序那一刀成了**），
       但一网点到下面那栏输入框，屏上就换回成品弹窗——那一拍 `cardInfoOpen` 被遮罩的
       bindtap 收走了，于是 `templateOpen && !cardInfoOpen` 成立、成品弹窗回来，
       只有原生输入层那两个字留在外面。收回现在只留两枚按钮，这两条钉的就是
       "点两栏输入框这一层不许消失、成品弹窗不许回来"。 */
    for (const tapIdx of [0, 1]) {
      const inpEl = (await page.$$('.ci-input'))[tapIdx]
      await inpEl.tap()
      await sleep(700)
      const dTap = await page.data()
      ck(`点第 ${tapIdx + 1} 栏输入框（${tapIdx ? '一句话' : '名称'}）之后，小弹窗还在、成品弹窗没回来`,
        dTap.cardInfoOpen === true && !(await page.$('.tpl-sheet')),
        JSON.stringify({ ci: dTap.cardInfoOpen, tpl: !!(await page.$('.tpl-sheet')) }))
    }

    /* 下面那一行就是「卡片」的勾选器（站长 10-03 看图改的口径：原来那枚写着"卡片"，
       换成一个 ✔；勾是哪两条边转 −45° 画的，不赌系统字体里有没有 U+2713 那个字形）。 */
    const tick0 = (await page.$$('.ci-tick')).length
    const role0 = (await page.$$('.ci-cap.role')).length
    ck('四枚里只有一枚打了勾，且只有那一枚套着现网"选中"芯片那个墨底壳',
      tick0 === 1 && role0 === 1, `勾 ${tick0}／墨底壳 ${role0}`)
    const caps0 = []
    for (const c of await page.$$('.ci-cap')) caps0.push(await c.text())
    ck('没勾上那三枚说的是它当前是什么（正当背景的那格仍写「背景」，这一层不给第二个角色的口）',
      caps0.filter((x) => x).length === 3
        && caps0.filter((x) => x).every((x) => ['位置 1', '位置 2', '位置 3', '位置 4', '背景'].indexOf(x) >= 0),
      caps0.join('|'))
    await mp.screenshot({ path: path.join(OUT, '06b-卡片上的信息.png') })

    /* 点第 3 枚下面那行（它正当背景、不当卡片）→ 勾挪过去，背景那一份不许被碰 */
    let capsEl = await page.$$('.ci-cap')
    await capsEl[2].tap()
    await sleep(700)
    let st = await readCi(mp)
    const marks = (list, k) => list.map((x) => (x[k] ? (k === 'card' ? '✔' : 'B') : '·')).join('')
    ck('点「位置 3」把「卡片」指定给第 3 枚：单选，第 1 枚那枚勾自己灭，屏上仍只有一个 ✔',
      st[2].card === true && st[0].card === false && (await page.$$('.ci-tick')).length === 1,
      marks(st, 'card'))
    ck('另一个角色「背景」一个字没动（打勾只管卡片这一件事）',
      st[0].bg === true && st[2].bg === true && st[1].bg === false && st[3].bg === false,
      marks(st, 'bg'))
    /* 再点已经勾着的那枚 → 取消；取消之后这个位置空着，不自动挪给还留着的别的张
       （同「我的→卡片模板」那一页 09-30 拍板的那条口径，站长原话"不挪"） */
    capsEl = await page.$$('.ci-cap')
    await capsEl[2].tap()
    await sleep(700)
    st = await readCi(mp)
    ck('再点已打勾那枚就是取消：勾灭了、卡片位空着，没有自动挪给别的张',
      st.every((x) => x.card === false) && (await page.$$('.ci-tick')).length === 0,
      marks(st, 'card'))
    /* 空格不给勾：那一格没有图，勾上等于让海报去取一个不存在的文件 */
    capsEl = await page.$$('.ci-cap')
    await capsEl[3].tap()
    await sleep(600)
    st = await readCi(mp)
    ck('空格下面那行点了不响应', st.every((x) => x.card === false), marks(st, 'card'))

    /* 站长 10-03 23:20 提的那条（改了名片，台账里那枚小图还是旧的）这一把不再验了——不是修坏，
       是这条路本身被撤了：10-03 23:40 定的一篇一张之下，「编辑个人名片」只存在于未生成态，
       存量那张不许改，要改只能删掉重新生成。上一版为此加的 cardLog.refresh / _ciSyncCard
       已经整条撤净（不留死代码），钉这一句的静态判据在 验-列表D2。 */
    await mp.evaluate((id, v) => {
      if (!v) return
      const m = wx.getStorageSync('cardLog') || {}
      m[String(id)] = v
      wx.setStorageSync('cardLog', m)
      return true
    }, dl.notes[pick].id, ledKeep)

    await restoreCi(mp, seeded.before, seeded.paths)
    await page.callMethod('onOpenCardInfo')
    await sleep(600)
    const want = [0, 1, 2, 3].map((i) => {
      const s = (seeded.before.images || [])[i]
      return { card: !!(s && s.card), bg: !!(s && s.bg), has: !!(s && s.path) }
    })
    // 变量名别叫 back：下面 ③ 那一段有一处 const back = await mp.currentPage()，
    // 同一个块作用域里重名，node 直接 SyntaxError（这把尺子当场跑不起来）。
    const ciBack = await readCi(mp)
    ck('这一把动过的四格现场原样还回去（站长模拟器里那几张真图一张不少、角色一个不变）',
      JSON.stringify(ciBack) === JSON.stringify(want), JSON.stringify(ciBack))
    await (await page.$('.ci-btn.ghost')).tap()
    await sleep(700)
    d = await page.data()
    ck('收掉小弹窗，成品弹窗还开着（不是连它一起收）',
      d.cardInfoOpen === false && d.templateOpen === true, `ci=${d.cardInfoOpen} tpl=${d.templateOpen}`)
    const tplBack = {
      sheet: !!(await page.$('.tpl-sheet')),
      poster: !!(await page.$('.tpl-poster')),
      mask: (await page.$$('.float-mask')).length,
    }
    ck('收掉小弹窗，成品弹窗整层回来了（面板＋成品图＋透明遮罩都查得到，不用重新出图）',
      tplBack.sheet && tplBack.poster && tplBack.mask === 1, JSON.stringify(tplBack))

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

    /* ---------- ③ 去编辑那一趟，回来还站在这扇窗前（站长 10-03 报的落点错） ---------- */
    // 出发前窗里是这一篇 → 点「编辑」出门 → 编辑页点「取消」回来，落点必须是同一扇窗。
    // 原来 onSheetEdit 把窗收掉、onShow 又无条件 _closeFloats()，两头一夹人就回到列表了。
    const flagOf = () => mp.evaluate(() => {
      const p = getCurrentPages()[0]      // 栈是 [首页, 编辑页]，标志挂在首页那个实例上、不进 data
      return p ? p._backToDetail : '（首页不在栈里）'
    })
    await (await rowOf(pick)).tap()
    await sleep(3000)
    const dB = await page.data()
    const wantId = dB.detailNote && dB.detailNote.id
    ck('出发前窗开着、拿得到这一篇的 id', dB.detailOpen === true && wantId !== undefined, `id=${wantId}`)
    await page.callMethod('onSheetEdit').catch(() => {})
    // 这一句必须吞：callMethod 回话时首页已经不在栈顶，automator 抛的是
    // "page is not on top of page stack"，不是判据错。真跳没跳由下面那条读页面栈来钉。
    await sleep(4000)
    const stackNow = await mp.evaluate(() => getCurrentPages().map((p) => p.route).join(' → '))
    const flagNow = await mp.evaluate(() => getCurrentPages()[0]._backToDetail)
    ck('点「编辑」出门：落在编辑页、窗收掉、这一篇记在实例上',
      stackNow === 'pages/index/index → pages/write/write' && flagNow === wantId,
      `${stackNow} 标志=${flagNow}`)
    await mp.navigateBack()
    await sleep(4500)
    const back = await mp.currentPage()
    d = await back.data()
    ck('没保存点取消回来：还是这扇窗、还是这一篇（不是列表）',
      d.detailOpen === true && d.detailNote && d.detailNote.id === wantId,
      `detailOpen=${d.detailOpen} 窗里=${d.detailNote && d.detailNote.id}`)
    ck('回来那一趟标志当场清掉：下一次切 tab 不会又凭空开一扇', (await flagOf()) === 0,
      `标志=${await flagOf()}`)
    await mp.screenshot({ path: path.join(OUT, '08-编辑回来还在窗里.png') })
    await back.callMethod('onCloseDetail')
    await sleep(1000)
    await mp.switchTab('/pages/me/me')
    await sleep(2500)
    await mp.switchTab('/pages/index/index')
    await sleep(4500)
    const again = await mp.currentPage()
    d = await again.data()
    ck('自己关掉窗之后切走再切回来，停在列表（这条只钉"不该常开窗"）',
      d.detailOpen === false && (await flagOf()) === 0, `detailOpen=${d.detailOpen}`)

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
