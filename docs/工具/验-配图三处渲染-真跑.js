// 配图这一排在三处画得对不对（详情页 / 分享落地页 / 「我的」那行脚注）。
// 跑法：docs/工具/跑尺子.sh 9431 验-配图三处渲染-真跑
//
// 为什么必须真跑：第 0 关那把尺子查的是"两边口径是不是一条线"，查不到**渲染**——
// 而这一排的三个失败都只在渲染上：① `wx:if="{{noteImages.length}}"` 写错就永远不出现；
// ② 只定宽不定高会被夹扁（站长踩过那条，"图片盒子被夹扁"）；③ 缩略图排的是服务端给的顺序，
// 点第 2 张要拿第 2 个地址，绑错 data-url 就是"点这张跳出另一张"。
//
// 数据是 setData 喂进去的替身，不是现网读回来的：CLOUD_ENV 还空着（环境 ID 只能从云开发
// 控制台读），所以这一刻真机上不会有 assets 行。这一把验的是"等环境填上、行真的回来了，
// 这三处画成什么样"，不验云端本身。
const automator = require('miniprogram-automator')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 栏名那条要和字典对，不对硬写的中文：这一台工具可能停在英文态（记忆里那条
// "效果图文案必须抄现网字典"同一个道理）。i18n.js 不碰 wx，直接 require 就行。
const { i18n } = require(path.resolve(__dirname, '../../miniprogram/utils/i18n.js'))
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const URLS = ['cloud://env.x/images/7/20261006/aaa.jpg', 'cloud://env.x/images/7/20261006/bbb.jpg', 'cloud://env.x/images/7/20261006/ccc.jpg']
const assets = (n) => URLS.slice(0, n).map((u, i) => ({ id: i + 1, cloud_url: u }))

// 面与位一律问 size()/offset()，不解析 style 字符串：那个返回的是取整后的 px 文本，
// 而 inline-block 的 top/left 根本不在 style 里（第一版把这条写成了 style('top')，
// 量出来全是 null，判据看着"过"其实什么都没比）。返回值可能是数字也可能是带单位的字符串，
// 所以两边都过一遍 num()。
const num = (v) => {
  const m = /(-?\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v))
  return m ? Math.round(parseFloat(m[1])) : null
}
const face = async (el) => {
  const s = await el.size()
  const o = await el.offset()
  return { w: num(s.width), h: num(s.height), top: num(o.top), left: num(o.left) }
}

// data-* 这一层：内置组件（image）不是 CustomElement，没有 `data()` 可用（第一版崩在
// `el.data is not a function`）；`attribute('data-url')` 在不同基础库上给不给这一项也没有保证，
// 所以取 outerWxml 里那串渲染出来的属性——它就是屏上这一格真正带的值。
const dataAttr = async (el, name) => {
  let raw = ''
  try { raw = (await el.attribute(`data-${name}`)) || '' } catch (e) { raw = '' }
  if (raw) return raw
  const w = await el.outerWxml()
  const m = new RegExp(`data-${name}="([^"]*)"`).exec(String(w || ''))
  return m ? m[1] : ''
}

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })

  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上 9431，先跑 cli auto')
  const enter = async (url) => {
    for (let i = 0; i < 5; i++) {
      try { return await mp.reLaunch(url) } catch (e) { console.log(`进 ${url} 第 ${i + 1} 次没成：${e.message}`); await sleep(8000) }
    }
    throw new Error(`进不去 ${url}`)
  }

  /* ================= 一、详情页那一排 ================= */
  const detail = await enter('/pages/detail/detail')
  await sleep(3000)
  // 不进具体一篇（这一台的账号里有什么数据不可控），直接喂这一页要渲染的那份状态。
  await detail.setData({
    loading: false,
    note: { id: 1, title: '替身这一篇', source_type_label: '截图', created_at_label: '今天', tags: [], key_points: [] },
    noteImages: assets(3),
  })
  await sleep(1200)

  const thumbs = await detail.$$('.dt-shot')
  ck('详情页三张配图就画三个方格', thumbs.length === 3, `${thumbs.length} 个`)

  const box = []
  for (const el of thumbs) {
    const f = await face(el)
    box.push({ ...f, url: await dataAttr(el, 'url') })
  }
  ck('每一格定宽又定高（只定宽那条会被夹扁）',
    box.every((b) => b.w > 0 && Math.abs(b.w - b.h) <= 1),
    box.map((b) => `${b.w}x${b.h}`).join(' '))
  ck('第 i 格带的就是第 i 个地址（点第 2 张不许跳出另一张）',
    box.every((b, i) => b.url === URLS[i]), box.map((b) => b.url).join(' '))
  // 栏名从"配图那一栏"里读，不用 `.panel .section-label` 那种会撞到摘要栏的写法
  // （新写类名带页面前缀这条规矩在这里的用处就是这个）。
  const lab = await detail.$('.dt-shots-panel .section-label')
  const label = lab ? await lab.text() : ''
  ck('栏名抄的是字典那一串（中英两种都算对，不硬写"原始图片"）',
    [i18n.zh.shotsLabel, i18n.en.shotsLabel].indexOf(label) >= 0, label)

  // 空态：一行都不该占位（读回来是空数组时不许出现一屏破图）。
  await detail.setData({ noteImages: [] })
  await sleep(800)
  ck('没有配图时那一排整个不占位', (await detail.$$('.dt-shot')).length === 0)

  // 上限态：服务端最多给 9 行，界面不截断也不换行成两排（scroll-x）。
  const nine = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, cloud_url: `cloud://env.x/images/7/n${i}.jpg` }))
  await detail.setData({ noteImages: nine })
  await sleep(800)
  const nineEls = await detail.$$('.dt-shot')
  ck('九张就画九格（上限 9 是同一把尺子，界面不再自己截一刀）', nineEls.length === 9, `${nineEls.length} 个`)
  const nineFace = []
  for (const el of nineEls) nineFace.push(await face(el))
  ck('九格排成一横排、没有折成两行（scroll-x 那一层在起作用）',
    nineFace.every((f) => f.top === nineFace[0].top), nineFace.map((f) => f.top).join(','))
  ck('横向确实排开了（每一格都比前一格更靠右）',
    nineFace.every((f, i) => i === 0 || f.left > nineFace[i - 1].left),
    nineFace.map((f) => f.left).join(','))

  /* ================= 二、分享落地页那一排 ================= */
  const view = await enter('/pages/share/view')
  await sleep(3000)
  await view.setData({
    loading: false,
    error: '',
    share: { token: 'tok', title: '替身这一篇', author_name: '阿麦', key_points: [], assets: assets(2) },
  })
  await sleep(1200)
  const sv = await view.$$('.sv-shot')
  ck('落地页画出分享带着的那两张', sv.length === 2, `${sv.length} 个`)
  const svBox = []
  for (const el of sv) svBox.push(await face(el))
  ck('落地页那两格也是方格（同一个坑不在这重犯一次）',
    svBox.every((b) => b.w > 0 && Math.abs(b.w - b.h) <= 1), svBox.map((b) => `${b.w}x${b.h}`).join(' '))
  await view.setData({ share: { token: 'tok', title: '替身这一篇', assets: [] } })
  await sleep(800)
  ck('这一篇没图时落地页那一排不出现', (await view.$$('.sv-shot')).length === 0)

  /* ================= 三、「我的」那行脚注 ================= */
  const me = await enter('/pages/me/me')
  await sleep(6000)
  // 今天（CLOUD_ENV 空着）这一行必须不出现，而且 onShow 一个配额请求都不该打。
  ck('环境没填时这一行整个不出现', (await me.$$('.me-storage')).length === 0)
  const labels = await me.$$('.menu-label')
  ck('设置那一排仍是五格（新加的脚注不是菜单里的一格，没把那条判据带跑）',
    labels.length === 5, `${labels.length} 格`)

  const TIP1 = '全站已用 93%，满了之后新上传的图会存不下'
  const TIP2 = '全站已用 97%，满了之后新上传的图会存不下'
  await me.setData({ storageWarn: true, storageTip: TIP1 })
  await sleep(900)
  ck('过线之后这一行出现', (await me.$$('.me-storage')).length === 1)
  ck('这一行不是能点进去的门（没有箭头、不带 menu-item）',
    (await me.$$('.menu-item .ico')).length === 5
      && (await me.$$('.me-storage .cv')).length === 0)
  // 这一条原来写成"读出来含 93%"——那 93% 是我自己 setData 喂进去的，等于自己问自己答，
  // 永真。改成钉"数据变它就得变"：证明这行字是吃 storageTip 的，不是界面里写死的。
  const v1 = await me.$('.me-storage-v')
  ck('右边那句就是数据里那句', (await v1.text()) === TIP1, await v1.text())
  await me.setData({ storageTip: TIP2 })
  await sleep(700)
  ck('数据换了这行跟着换（不是硬写在模板里的字）',
    (await (await me.$('.me-storage-v')).text()) === TIP2)
  const lang = await me.data('lang')
  const kLabel = await me.$('.me-storage-k')
  ck('左边那格的名字抄的是现网字典（中英两态都对得上）',
    (await kLabel.text()) === i18n[lang].storageSpace, `${lang} / ${await kLabel.text()}`)

  await me.setData({ storageWarn: false, storageTip: '' })
  await sleep(700)
  ck('回到线下这一行收掉（不是一条永远挂着的灰字）', (await me.$$('.me-storage')).length === 0)

  await mp.close()
  console.log(bad.length ? `\n✗ ${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exit(bad.length ? 1 : 0)
})().catch((e) => { console.error('探针崩了', e); process.exit(2) })
