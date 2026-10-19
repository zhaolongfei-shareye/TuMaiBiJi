// 详情窗抬头那一块**在屏上画成什么样**（站长 10-18 凌晨「跑真机预览看看效果」这一句的自证）。
// 跑法：docs/工具/跑尺子.sh 9431 验-详情窗抬头那一块-真跑
//
// 静态那把（验-详情窗抬头那一块.js）查的是源码里有没有这几样；查不到的是**渲染**：
// ① 通栏——`.ds-fig` 的宽在 CSS 里写 100% 谁都会写，真机上是它到底等于窗宽还是等于净宽；
// ② 定高——10-17 那轮在效果图上就栽过一次：往 flex 列里塞定高块，写了 395rpx 量回来 137.83，
//    源码里那行数看着是对的，屏上被压扁。所以这一把量的必须是**面**，不是 style 字符串；
// ③ 数字与那一排点跟着 `dsFigAt` 走——换一档，文字与"哪一枚是横杠"两处都要跟着换；
// ④ 没配图那一整块不占位（不是藏起来留个空档）。
//
// ⚠ 数据这一条要说实话：这一屏的配图是 `detailImages`，正常由 `_loadDetailImages` 从
// `/api/notes/{id}/assets` 读回来。这一台 IDE 登录的账号有没有带配图的篇，跑之前不知道，
// 所以**读到真数据就用真数据，读不到就 setData 喂三张替身地址**并在屏上标出来——
// 替身只够验"画成什么样"，不够验"云端有没有那条"（后者归 验-配图三处渲染-真跑 与探针）。
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const ROOT = path.resolve(__dirname, '../..')
const SHOT = path.join(ROOT, 'docs/design/10-18详情窗抬头色块')
const SRC_VERSION = /const VERSION = '([\d.]+)'/.exec(fs.readFileSync(path.join(ROOT, 'miniprogram/utils/appInfo.js'), 'utf8'))[1]
// 屏上那几档 rpx 换成 px 要看设备宽；模拟器是 375pt ⇒ 1rpx = 0.5px，但别写死，跑起来读窗宽
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
const num = (v) => { const m = /(-?\d+(?:\.\d+)?)/.exec(String(v == null ? '' : v)); return m ? parseFloat(m[1]) : null }

const FAKE = ['cloud://fake/env/a.jpg', 'cloud://fake/env/b.jpg', 'cloud://fake/env/c.jpg']
  .map((u, i) => ({ id: i + 1, cloud_url: u }))

automator.connect({ wsEndpoint: 'ws://localhost:9431' }).then(async (mp) => {
  try {
    /* ---------- 〇、先确认连上的是这一条线的包 ---------- */
    // ⚠ automator 那几个导航接口收的是**字符串**（`switchTab(url: string)`），不是 `{url}`：
    // 第一版照 wx.switchTab 的写法传了对象，devtools 回了一包解析不了的错误，
    // 报出来是 `Uncaught [object Object]`（Connection.onMessage 里），看着像环境崩了其实是调用签名错。
    const meP = await mp.switchTab('/pages/me/me')
    await sleep(1800)
    const screenVersion = (await meP.data()).version
    ck(`IDE 里开的是这一条线（「我的」那格＝源码那格）`, String(screenVersion) === SRC_VERSION,
      `屏上 v${screenVersion}／源码 v${SRC_VERSION}`)

    const page = await mp.reLaunch('/pages/index/index')
    await sleep(2500)
    const d0 = await page.data()
    const notes = (d0.notes || []).filter((n) => n && !n.is_private)
    ck('列表里有可开的非私密笔记（这一把不验私密那一态，那一条归私密那批尺子）', notes.length > 0, `${notes.length} 篇`)
    if (!notes.length) throw new Error('一篇可开的都没有，后面量不了')
    const pick = (d0.notes || []).findIndex((n) => n && n.id === notes[0].id)

    await page.callMethod('_openDetail', pick)
    await sleep(2500)
    let d = await page.data()
    const real = (d.detailImages || []).length > 0
    if (!real) {
      await page.setData({ detailImages: FAKE, dsFigAt: 0 })
      await sleep(1200)
      d = await page.data()
    }
    console.log(`  这一屏的配图：${real ? '真数据（服务端读回来的）' : '替身三张（这一台账号没读到带配图的篇）'}`)
    const N = (d.detailImages || []).length
    const IMGS = d.detailImages || []   // 第五节要清空再画回来，画回来用的是这一份，不是重新造
    const sheet = await page.$('.float-sheet')
    const fig = await page.$('.ds-fig')
    ck('屏上真的画出了那一块图区（不是只有源码里有）', !!fig)
    if (!fig) throw new Error('没有 .ds-fig，后面量不了')
    const fsz = await fig.size(), ssz = await sheet.size()
    const fo = await fig.offset()
    // 通栏＝图区宽等于窗那一层的宽，而且左沿与窗左沿对齐（净宽 317 那一档是内缩后的，别混）
    ck('通栏：图区宽＝窗宽、左沿与窗左沿齐（左右那 34rpx 内缩没把它让出去）',
      Math.abs(num(fsz.width) - num(ssz.width)) < 1.5 && Math.abs(fo.left - (await sheet.offset()).left) < 1.5,
      `图区 ${num(fsz.width)}×${num(fsz.height)}｜窗 ${num(ssz.width)}`)
    const perRpx = num(fsz.width) / 702
    ck('定高没被压扁：图区高＝395rpx 换算过来的那一个（±2）',
      Math.abs(num(fsz.height) - 395 * perRpx) <= 2, `高 ${num(fsz.height)}px／这一档 1rpx=${perRpx.toFixed(4)}px`)
    const img = await page.$('.ds-fig-img')
    const isz = await img.size()
    ck('图与盒子同高同宽（不等就是撑破或底下留缝）',
      Math.abs(num(isz.width) - num(fsz.width)) < 1.5 && Math.abs(num(isz.height) - num(fsz.height)) < 1.5,
      `${num(isz.width)}×${num(isz.height)}`)

    /* ---------- 二b、两层（10-19「图片展示不全，改为按比例缩小，其他部分空间用同照片毛玻璃铺满」）----------
       上面那条只证明**盒子**还是那么大；aspectFit 的"整张放进来、两边留白"与毛玻璃铺满都发生在盒子内部，
       量盒子量不出来。所以这里钉两层的**面**：底那张必须每张都有一枚、且比图区大一圈
       （外挪是为了把模糊自带的渐隐圈推到边外）。留白里到底画没画出糊图，看第六节那两张截图。 */
    const bgs = await page.$$('.ds-fig-bg')
    ck('底那一层每张配图都有一枚（不是只给当前那张铺了底）', bgs.length === N, `${bgs.length} 枚／配图 ${N} 张`)
    if (bgs.length) {
      const bsz = await bgs[0].size()
      const bof = await bgs[0].offset()
      ck('底比图区大一圈、且左上往外挪（四边不露那条模糊渐隐的脏边）',
        num(bsz.width) > num(fsz.width) * 1.04 && num(bsz.height) > num(fsz.height) * 1.04
        && bof.left < fo.left - 1 && bof.top < fo.top - 1,
        `底 ${num(bsz.width)}×${num(bsz.height)}@${Math.round(bof.left)},${Math.round(bof.top)}`
        + `｜图区 ${num(fsz.width)}×${num(fsz.height)}@${Math.round(fo.left)},${Math.round(fo.top)}`)
      ck('上面那张还压在第一层（点它才拉全屏大图，底不许盖在它上面）',
        num(isz.width) <= num(bsz.width) && num(isz.height) <= num(bsz.height),
        `上 ${num(isz.width)}×${num(isz.height)}／底 ${num(bsz.width)}×${num(bsz.height)}`)
    }

    /* ---------- 三、数字与那一排点跟着游标走 ---------- */
    const cnt = await page.$('.ds-cnt')
    const dots = await page.$$('.ds-dots .ds-dot')
    if (N > 1) {
      ck(`共 ${N} 张时数字那枚在、写的是 1/${N}`, !!cnt && (await cnt.text()).trim() === `1/${N}`, cnt ? (await cnt.text()).trim() : '没这枚')
      ck('那一排点跟着张数画', dots.length === N, `${dots.length} 枚`)
      const ws = []
      for (const el of dots) ws.push(num(await (await el.size()).width))
      ck('当前那枚是横杠（比其余宽），其余是圆点', ws[0] > ws[ws.length - 1], ws.join('｜'))
      await page.setData({ dsFigAt: N - 1 }); await sleep(900)
      const cnt2 = await page.$('.ds-cnt')
      ck(`换到最后一张，数字跟着换成 ${N}/${N}`, (await cnt2.text()).trim() === `${N}/${N}`, await cnt2.text())
      const ws2 = []
      for (const el of await page.$$('.ds-dots .ds-dot')) ws2.push(num(await (await el.size()).width))
      ck('横杠挪到最后一枚（不是永远钉在第一枚上）',
        ws2[ws2.length - 1] > ws2[0], ws2.join('｜'))
      await page.setData({ dsFigAt: 0 }); await sleep(700)
    } else {
      ck('只有一张：数字与那一排点都不画', !cnt && (await page.$$('.ds-dots .ds-dot')).length === 0)
    }

    /* ---------- 四、标题摊满整宽 ---------- */
    const h2 = await page.$('.ds-h2')
    const hw = num((await h2.size()).width)
    ck('标题摊满：那一行的宽＝窗内净宽（右边不再留给卡片那一格）',
      Math.abs(hw - (num(ssz.width) - 2 * 34 * perRpx)) < 3, `标题 ${hw}px／窗 ${num(ssz.width)}px`)
    ck('右上那一格（这篇留过的卡片）在屏上真的没有了', (await page.$$('.ds-rt')).length === 0)

    /* ---------- 五、没配图那一整块不占位 ---------- */
    // 这一屏往下顶到哪一行，看的是"摘要那一排"的落点：那一篇没有摘要时这一排压根不画，
    // 所以取第一个真在屏上的（`.ds-lab` 或 `.ds-para`），两个都没有就只报"三样都不在"这一条。
    const anchor = async () => {
      for (const sel of ['.ds-lab', '.ds-para', '.ds-pt']) { const el = await page.$(sel); if (el) return num((await el.offset()).top) }
      return null
    }
    const before = await anchor()
    await page.setData({ detailImages: [] }); await sleep(900)
    ck('撤掉配图之后：图区／数字／那一排点三样在屏上一个都不剩',
      (await page.$$('.ds-fig')).length === 0 && (await page.$$('.ds-cnt')).length === 0 && (await page.$$('.ds-dots')).length === 0)
    const after = await anchor()
    ck('而且不留空档：摘要那一排往上顶到了图区原来该在的位置',
      before !== null && after !== null && before - after > 60,
      before === null || after === null ? '这一篇没有摘要那一排，量不到落点（跳过）' : `顶上来 ${Math.round(before - after)}px`)

    /* ---------- 六、拍两张回去看 ---------- */
    const shot = async (name) => {
      const p = path.join(SHOT, name)
      const t0 = fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0
      await mp.screenshot({ path: p })
      for (let i = 0; i < 30; i += 1) { if (fs.existsSync(p) && fs.statSync(p).mtimeMs > t0) return p; await sleep(500) }
      throw new Error(`拍完没落盘：${name}`)
    }
    await page.setData({ detailImages: real ? IMGS : FAKE, dsFigAt: 1 }); await sleep(1200)
    const a = await shot('真跑-1-有配图那一屏.png')
    await page.setData({ detailImages: [] }); await sleep(900)
    const b = await shot('真跑-2-没有配图那一屏.png')
    console.log(`  截图：${path.relative(ROOT, a)}｜${path.relative(ROOT, b)}`)

    await page.callMethod('onCloseDetail')
    console.log(bad.length ? `\n✗ ${bad.length} 条红：\n  · ${bad.join('\n  · ')}` : '\n✓ 全绿')
  } catch (e) {
    console.error('✗ 跑挂了：', e && (e.stack || e.message || e))
    bad.push('异常')
  } finally {
    mp.close && mp.close()
    process.exit(bad.length ? 1 : 0)
  }
}).catch((e) => { console.error('✗ 连不上 9431（连接红，不是判据红）：', e.message); process.exit(1) })
