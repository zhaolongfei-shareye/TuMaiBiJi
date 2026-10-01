// 量一件事：新建页展开面板在四个模式各自的自然高度，用来定"四屏等高"那个常量。
// 为什么先量再写死：面板里最高那一段是"直接写"（标题框 + 多行区 + 归类行 + 按钮行），
// 但英文那一档说明文字会折行，中文量出来的数放到英文上就不够——所以两种语言都量，
// 取最大值当常量，而不是照 CSS 里的数字手算。
// 前置：cli auto --auto-port 9431。跑法：NODE_PATH=/tmp/mpaauto/node_modules node docs/工具/量-面板四态自然高.js
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const i18n = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))

;(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' })
  const win = await mp.systemInfo()
  const toRpx = (px) => Math.round((px * 750) / win.windowWidth)
  const page = await mp.reLaunch('/pages/create/create')
  await sleep(1200)

  const h = async (sel) => {
    const el = await page.$(sel)
    if (!el) return null
    const s = await el.size()
    return toRpx(s.height)
  }

  const rows = []
  for (const lang of ['zh', 'en']) {
    await page.setData({
      lang,
      t: i18n.texts(lang),
      shotDesc: i18n.t('albumDesc', lang),
      writeTitle: '',
      writeBody: '',
      urlInput: '',
      urlHint: 'idle',
      errLine: '',
    })
    for (const [active, mode, withShots] of [
      ['write', 'write', false],
      ['write', 'write', true],
      ['shot', 'camera', false],
      ['shot', 'camera', true],
      ['url', 'url', false],
      ['url', 'url', true],
    ]) {
      await page.setData({
        active,
        mode,
        lead: mode,
        previewImages: withShots
          ? ['/assets/share-card.jpg', '/assets/share-card.jpg', '/assets/share-card.jpg']
          : [],
        // 报错行是"最坏情况"：它只在出错时出现，一旦面板定高就得给它留位置
        errLine: withShots ? (lang === 'zh' ? '内容安全校验未通过，请换个说法再试' : 'Content check failed, please rephrase and try again') : '',
      })
      await sleep(260)
      rows.push({
        lang, seg: mode, shots: withShots ? 3 : 0, err: withShots ? 1 : 0,
        body: await h('.entry-body'),
        panel: await h('.panel'),
        modes: await h('.modes'),
        acts: await h('.acts'),
      })
    }
  }
  console.table(rows)
  const maxBody = Math.max(...rows.map((r) => r.body))
  const maxPanel = Math.max(...rows.map((r) => r.panel))
  console.log(`body 最大 ${maxBody}rpx　panel 最大 ${maxPanel}rpx（含 modes + 上下内边距）`)
  await mp.disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
