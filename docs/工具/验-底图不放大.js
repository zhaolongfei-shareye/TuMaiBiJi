// 背景图清晰度这一条的自证（站长 10-04 报"底图看上去被拉伸了"）。
//
// 量出来的根因不是宽高比被拉坏，是源件分辨率低于显示分辨率被放大：
// 头部那一段画的是 `width:750rpx`＝整屏宽（他真机那张截图 1116 物理像素），
// 而两处选图口以前都写 `sizeType:['compressed']`——微信那档对竖图实测只给到 750 宽
// （他模拟器里存下来的那张就是 750×1448），750 铺 1116＝放大 1.49 倍。
// 所以这一把钉两件事：
//   ① 静态——选图口改挑原图，落盘前由 poster.mintAvatar 自己缩到 BG_TARGET_W，
//      且那个目标值必须 ≥ 显示下限（从 poster.js 现读，不在这里抄第二份）；
//   ② 运行时——`wx.compressImage` 的 `compressedWidth` 在这个基础库里真的起作用，
//      而且是等比缩（不是拉扁）。这条只能真跑：开发者工具的替身不校验参数名，
//      参数被整个忽略时静态那几条照样绿。
//
// 跑法：docs/工具/跑尺子.sh 9431 验-底图不放大
const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const MP = path.resolve(__dirname, '../../miniprogram')
const read = (rel) => fs.readFileSync(path.join(MP, rel), 'utf8')
const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}
// 显示下限：头部那一段是 width:750rpx＝整屏宽。他真机那张原图 1116 像素宽，
// 3x 高密度安卓机到 1440。低于这个数就是"源件不够、只能放大"。
const PHYS_W_FLOOR = 1116

;(async () => {
  process.on('uncaughtException', (e) => { console.error('探针挂了（未捕获）', e); process.exit(2) })
  let mp
  for (let i = 0; i < 6 && !mp; i++) {
    try { mp = await automator.connect({ wsEndpoint: 'ws://localhost:9431' }) } catch (e) { await sleep(12000) }
  }
  if (!mp) throw new Error('连不上自动化端口，先跑 cli auto')

  // ---------- ① 静态：接线 ----------
  const posterJs = read('utils/poster.js')
  const mTarget = /const BG_TARGET_W = (\d+)/.exec(posterJs)
  const TARGET = mTarget ? Number(mTarget[1]) : 0
  ck('poster.js 里有 BG_TARGET_W 这一个出口，且它 ≥ 屏宽物理下限',
    !!mTarget && TARGET >= PHYS_W_FLOOR, mTarget ? `${TARGET}（下限 ${PHYS_W_FLOOR}）` : '没读到常量')
  ck('mintAvatar 落盘前先过 shrinkForBand（不是把挑来的那份直接 copy）',
    /function shrinkForBand/.test(posterJs)
    && /return shrinkForBand\(tempPath\)[\s\S]{0,120}copyTo\(src, dest\)/.test(posterJs))
  // 微信那一步会把窄图放大回去（运行时下面实测这条就是量它的），所以缩之前必须先读宽度。
  ck('压缩之前先读宽度：窄于 BG_TARGET_W 就不压',
    /wx\.getImageInfo\(\{[\s\S]{0,500}info\.width <= BG_TARGET_W[\s\S]{0,200}compress\(tempPath\)/.test(posterJs))
  // quality 官方范围 0～100（d.ts 原文："数值越小，质量越低，压缩率越高（仅对jpg有效）"）。
  // 0.82 这种写法看着像"82% 质量"，实际是按 100 档取到最低画质，越压越糊——钉死在这个区间里。
  const mQ = /quality:\s*(\d+(?:\.\d+)?)/.exec(posterJs)
  const Q = mQ ? Number(mQ[1]) : 0
  ck('压缩这一步带 quality 与 compressedWidth，且压不动时退回原图',
    !!mQ && Q > 1 && Q <= 100 && /compressedWidth: BG_TARGET_W/.test(posterJs)
    && /fail:\s*\(\)\s*=>\s*resolve\(tempPath\)/.test(posterJs),
    mQ ? `quality=${Q}（须在 1～100）` : '没读到 quality')
  // 选图口不写死文件名：10-08 那一次「首页那层弹窗」整搬进 utils/cardInfo.js，
  // 这一把还硬钉 `pages/index/index.js`，红的是"某个文件里没有 sizeType"这种话，
  // 真话（那层弹窗还在挑原图）反倒要我自己去读代码才确认。所以按调用点捞：
  // 谁调 `poster.mintAvatar(` 谁就是这一路的选图口，将来多一处也跑不出这张名单。
  const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p, out)
      else if (e.name.endsWith('.js')) out.push(p)
    }
    return out
  }
  const picks = walk(MP)
    .filter((p) => /poster\.mintAvatar\(/.test(fs.readFileSync(p, 'utf8')))
    .map((p) => [path.relative(MP, p), fs.readFileSync(p, 'utf8')])
  ck('形象图那一路的选图口全都挑原图（按调用点捞，不写死文件名）',
    picks.length >= 2 && picks.every(([, s]) => /sizeType: \['original'\]/.test(s)),
    `${picks.length} 处：` + picks.map(([f, s]) => `${f}:${/sizeType: \['original'\]/.test(s) ? 'original' : '没改'}`).join(' '))
  const stillCompressed = picks.filter(([, s]) => /sizeType: \['compressed'\]/.test(s)).map(([f]) => f)
  ck('旧的 compressed 那一档每一处都撤净（不留第二套口径）', stillCompressed.length === 0, stillCompressed.join(' '))

  // ---------- ② 运行时：compressedWidth 到底吃不吃 ----------
  const info = (src) => mp.evaluate((p) => new Promise((resolve) => {
    wx.getImageInfo({ src: p, success: (r) => resolve({ w: r.width, h: r.height }), fail: (e) => resolve({ err: (e && e.errMsg) || String(e) }) })
  }), src)
  const probe = await mp.evaluate(() => ({
    has: typeof wx.compressImage === 'function',
    pkg: '/assets/home-bg-portrait.jpg',
  }))
  ck('这个基础库有 wx.compressImage', probe.has)
  const src0 = await info(probe.pkg)
  ck('代码包里那张默认底图能读出尺寸', !src0.err && src0.w > 0, JSON.stringify(src0))
  // 目标故意给一个比源件小的数：只有 compressedWidth 真被 honoring，输出宽才会掉到 400 上下。
  const shrunk = await mp.evaluate((p) => new Promise((resolve) => {
    wx.compressImage({
      src: p, quality: 82, compressedWidth: 400,
      success: (r) => resolve({ out: r.tempFilePath }),
      fail: (e) => resolve({ err: (e && e.errMsg) || String(e) }),
    })
  }), probe.pkg)
  ck('compressImage 调用成功并回一个可读的文件', !!shrunk.out, shrunk.err || shrunk.out)
  const s1 = shrunk.out ? await info(shrunk.out) : {}
  const ratio0 = src0.w / src0.h
  const ratio1 = s1.w / s1.h
  ck(`compressedWidth 真起作用：${src0.w} 宽的源件压到 400 上下（不是被忽略）`,
    !!s1.w && Math.abs(s1.w - 400) <= 40, `${src0.w} → ${s1.w}`)
  ck('是等比缩，不是拉扁（宽高比变化 < 2%）',
    !!s1.w && Math.abs(ratio1 / ratio0 - 1) < 0.02, `${ratio0.toFixed(3)} → ${ratio1.toFixed(3)}`)
  // 反向对照：不给 compressedWidth，只给 quality，输出宽度应当还是源件那个宽度。
  const qOnly = await mp.evaluate((p) => new Promise((resolve) => {
    wx.compressImage({ src: p, quality: 82, success: (r) => resolve({ out: r.tempFilePath }), fail: () => resolve({ err: 'fail' }) })
  }), probe.pkg)
  const s2 = qOnly.out ? await info(qOnly.out) : {}
  ck('反向对照：只给 quality 时宽度不动（说明上一条的红来自 compressedWidth）',
    !!s2.w && Math.abs(s2.w - src0.w) <= 2, `${src0.w} → ${s2.w}`)
  // 用户挑来一张比目标还窄的图会怎样？实测微信那一步会把它**放大**回去
  // （865 宽的源件给 compressedWidth:1440，回来的就是 1440 宽），多不出细节、白占本机配额，
  // 所以 poster.js 里必须先 getImageInfo 读宽、窄于目标就不压。下面这条只报数，
  // 真正的判据是静态那条"先读尺寸再决定压不压"——平台哪天改成不放大了，这里报出来即可。
  const up = await mp.evaluate((p) => new Promise((resolve) => {
    wx.compressImage({
      src: p, quality: 82, compressedWidth: 1440,
      success: (r) => resolve({ out: r.tempFilePath }),
      fail: (e) => resolve({ err: (e && e.errMsg) || String(e) }),
    })
  }), probe.pkg)
  const s3 = up.out ? await info(up.out) : {}
  console.log(`　· 实测：源件 ${src0.w} 宽给目标 1440，回来 ${s3.w} 宽${s3.w > src0.w ? '（被放大，所以代码里要先读尺寸）' : '（没被放大）'}`)
  // 本机那 10MB 配额够不够四个槽：量一份 1440 宽的 JPEG 实际多少字节。
  // 这里用的是包里那张（偏软，压出来偏小），所以这个数是**下界**——真照片只会更大一些，
  // 但四张乘完离 10MB 还差得远，这条钉的是"别哪天一张就吃掉几兆"。
  const big = await mp.evaluate((p) => new Promise((resolve) => {
    wx.compressImage({
      src: p, quality: 82, compressedWidth: 1440,
      success: (r) => resolve({ out: r.tempFilePath }), fail: () => resolve({ err: 'fail' }),
    })
  }), probe.pkg)
  const st = big.out ? await mp.evaluate((p) => {
    try { return { size: wx.getFileSystemManager().statSync(p, false).size } } catch (e) { return { err: String((e && e.errMsg) || e) } }
  }, big.out) : {}
  ck(`1440 宽这一档一张的字节数在配额里放得下四个槽（<1.5MB）`, !!st.size && st.size < 1.5 * 1024 * 1024,
    st.size ? `${(st.size / 1024).toFixed(1)}KB` : (st.err || '没读到'))

  console.log(bad.length ? `\n${bad.length} 条不过：${bad.join(' / ')}` : '\n全过')
  process.exitCode = bad.length ? 1 : 0
  mp.disconnect()
})().catch((e) => { console.error('探针挂了', e); process.exit(1) })
