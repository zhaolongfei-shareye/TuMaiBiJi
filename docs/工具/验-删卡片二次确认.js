// 站长 10-05：「我发现删除笔记，没有二次确认，你看下是否漏了。」
// 查出来漏的是卡片成品弹窗底排那枚「删除」＝ `index.js:onDropCard`（1.9.19 `d868b79` 诞生时就没写
// 确认，不是后来被撤的）。另外三处删除（详情窗 dock／独立详情页／外观设置删图片槽）一直都有。
//
// 这把尺子证的是**函数体的行为**。绑定那半条他这次已经用误删替我们证过了：点了那枚确实当场删掉，
// 说明 `bindtap="onDropCard"` 是通的。
//
// 跑法（第 0 关，node，几秒钟，不碰模拟器也不碰现网）：
//   node docs/工具/验-删卡片二次确认.js
//
// 三层判据 + 一段反向对照：
//   ① 按下去先弹确认框，**此刻本机台账里那篇必须还在**（不许当场删）；
//   ② 弹窗那两句吃的是现成字典串（zh／en 各跑一遍，串从 i18n.js 现读，尺子里不抄第二份真相）；
//   ③ 两支各自咬住：取消 → 台账与位图都不动、弹窗不收、一个请求都不发；
//      确定 → 台账整条撤、位图 unlink、弹窗收；
//   ④ 这一路**只碰卡片留档那一个口**（`DELETE /api/notes/77/card`），一次都不碰 shares 那张活码
//      ——「已分享的依旧有效」到 2.0.1 仍是真话。⚠ 这一条 10-08 改过：原来钉的是"全程零网络写"，
//      那是"卡片只存在这台手机上"那期的口径；S2 把判据挪到服务器之后，删这一格**必须**打服务器，
//      不然症状是那一格删不掉（本机清了、下一次进详情页又从云上读回来）。
//   ⑤ 服务器回体里那个对象要落进待删队列——云上那份没删成不许就地忘掉。
//   ⑥ 服务器撤不成（离线）时：台账、位图、弹窗三样都不许动，并给一句实话。
//   反向对照：把线上那一版 `f58cdb8`（还没有确认框的旧函数体）落成同目录探针再跑，它必须"一次弹窗都没打、
//   当场就删"。这一条要是也绿，说明上面几层是虚的。
const path = require('path')
const fs = require('fs')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const MP = path.join(ROOT, 'miniprogram')
const INDEX = path.join(MP, 'pages/index/index.js')
const PROBE = path.join(MP, 'pages/index/.probe-before-index.js')

const NOTE_ID = 77
const CARD_FILE = 'wxfile://usr/cards/77-card-1.jpg'
// 服务器上那一行指向的那个对象。回体里带回来的是它，进了待删队列的也必须是它。
const CLOUD_FILE = 'cloud://cloudbase-d6gzh0i0tff02943a.636c-x/cards/77-card-1.jpg'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
// 确定那一支现在是 async 的（要先撤服务器那一行）。一个宏任务足够把整条 await 链跑完：
// 替身里没有一个真请求，每一跳都是立刻 resolve。
const flush = () => new Promise((r) => setTimeout(r, 0))

// —— 本机存储／文件系统／网络的替身 ——
// 台账那一本账不是替身：读写走的都是产品自己那份 cardLog.js 的读法（getStorageSync('cardLog')）。
const makeEnv = () => {
  const env = { modals: [], unlinked: [], network: [], page: null, store: {}, failNext: false, dropRes: [], toast: '' }
  global.wx = {
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getStorageSync: (k) => (k in env.store ? env.store[k] : ''),
    setStorageSync: (k, v) => { env.store[k] = v },
    removeStorageSync: (k) => { delete env.store[k] },
    getFileSystemManager: () => ({
      unlinkSync: (p) => { env.unlinked.push(p) },
      mkdirSync: () => {},
      accessSync: () => {},
      copyFileSync: () => {},
    }),
    showModal: (o) => { env.modals.push(o) },
    showToast: (o) => { env.toast = (o && o.title) || '' },
    hideToast: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    // 2.0.1 S2 起这一路**要打服务器**（撤的是 `note_cards` 那一行），所以替身要能成、
    // 也要能故意不成：`env.failNext` 决定下一次 request 走 fail 还是走 success。
    // 记的是"方法 + 路径"，④那条判据要看的就是这一路到底碰了哪些口。
    request: (o) => {
      env.network.push(`${(o.method || 'GET').toUpperCase()} ${String(o.url).replace(/^.*\/wtsj/, '')}`)
      if (env.failNext) { o.fail && o.fail({ errMsg: 'stub offline' }); return }
      o.success && o.success({ statusCode: 200, data: { file_ids: env.dropRes || [] } })
    },
    uploadFile: () => { env.network.push('uploadFile') },
    downloadFile: () => { env.network.push('downloadFile') },
    createSelectorQuery: () => ({
      select: () => ({ boundingClientRect: () => ({ exec: (cb) => cb([null]) }), exec: (cb) => cb([null]) }),
      selectAll: () => ({ boundingClientRect: () => ({ exec: (cb) => cb([]) }), exec: (cb) => cb([]) }),
      exec: (cb) => cb([]),
    }),
    getSetting: (o) => o.success && o.success({ authSetting: {} }),
    authorize: () => {},
    getImageInfo: () => {},
    canvasGetImageData: () => {},
    createInnerAudioContext: () => ({ onCanPlay: () => {}, onPlay: () => {}, play: () => {}, destroy: () => {} }),
    getWindowInfo: () => ({ windowWidth: 375, screenHeight: 812, safeArea: { bottom: 812 } }),
    getSystemInfoSync: () => ({ windowWidth: 375, platform: 'devtools' }),
    onWindowResize: () => {},
    navigateTo: () => {},
    redirectTo: () => {},
    setClipboardData: () => {},
  }
  global.getApp = () => ({ globalData: {}, onShow: () => {}, onHide: () => {} })
  global.Page = (cfg) => { env.page = cfg }
  global.Component = () => {}
  return env
}

const runCase = async (label, file, lang, expectOld, opts) => {
  delete require.cache[require.resolve(file)]
  const env = makeEnv()
  // 服务器那一行撤得成吗？回体里带回来的是哪个对象？两样都由这一把的用例定。
  env.dropRes = [CLOUD_FILE]
  env.failNext = !!(opts && opts.serverFails)
  const cardLog = require(path.join(MP, 'utils/cardLog.js'))
  const has = () => cardLog.forNote(NOTE_ID).length > 0

  // 预置成"这一篇已经有卡片"（已生成态），用的还是产品自己那本账的写法
  env.store.cardLog = { [NOTE_ID]: [{ p: CARD_FILE, tpl: 'card', at: Date.now(), noQr: false }] }
  require(file)
  const ctx = {
    data: { posterNote: { id: NOTE_ID }, lang, notes: [{ id: NOTE_ID }], templateOpen: true },
    setData() {},
    arrange() { return {} },
    loadNotes() {},
    loadQuota() {},
    _closeTemplate() { ctx.__closed = true },
  }
  const pre = has()
  env.page.onDropCard.call(ctx)

  if (expectOld) {
    ck(`${label}｜反向对照：旧版一次弹窗都没打、当场就删`,
      pre && env.modals.length === 0 && !has(),
      `弹窗 ${env.modals.length} 次 / 台账还在=${has()}`)
    return
  }

  ck(`${label}①｜按下去先弹确认框，台账此刻还在`,
    pre && env.modals.length === 1 && has(),
    `弹窗 ${env.modals.length} 次 / 台账还在=${has()}`)

  const o = env.modals[0] || {}
  // 走页面自己那把读法：texts(lang) 是 zh 打底、lang 覆盖（en 缺的键会回退到 zh），
  // 与界面 {{t.xxx}} 上屏的那一份同源，尺子里不另抄一份字典。
  const dict = require(path.join(MP, 'utils/i18n.js')).texts(lang)
  ck(`${label}②｜标题吃的是字典里那句（现读）`, o.title === dict.confirmDelete, JSON.stringify(o.title))
  ck(`${label}②｜正文说的确实是卡片、不是笔记`, o.content === dict.cardDropHint, JSON.stringify(o.content))
  ck(`${label}②｜按钮走系统默认那对（不自己填就不会撞 showModal 4 字上限）`,
    o.confirmText === undefined && o.cancelText === undefined,
    `confirmText=${JSON.stringify(o.confirmText)} cancelText=${JSON.stringify(o.cancelText)}`)

  o.success && o.success({ confirm: false, cancel: true })
  await flush()
  ck(`${label}③｜取消这一支：台账不动、位图不删、弹窗不收、一个请求都不发`,
    has() && env.unlinked.length === 0 && !ctx.__closed && env.network.length === 0,
    `unlink ${env.unlinked.length} 次 / closed=${!!ctx.__closed} / 网络 ${JSON.stringify(env.network)}`)

  o.success && o.success({ confirm: true, cancel: false })
  await flush()

  if (opts && opts.serverFails) {
    // S2 新加的那道顺序：服务器那一行没撤掉，本机这一半就**不许先清**。
    // 反过来做（先清本机）的症状是"看着删掉了，下一次进详情页又从云上读回来画上去"，
    // 而云上那个对象再没人记得要去删——对象只有客户端删得动。
    ck(`${label}｜反向⑥：服务器撤不成时，台账、位图、弹窗三样都不许动`,
      has() && env.unlinked.length === 0 && !ctx.__closed,
      `台账还在=${has()} unlink=${JSON.stringify(env.unlinked)} closed=${!!ctx.__closed}`)
    ck(`${label}｜反向⑥：这时候要给的是那句实话，不是静默`,
      env.toast && env.toast.indexOf('还留着') >= 0, JSON.stringify(env.toast))
    return
  }

  ck(`${label}③｜确定这一支：台账整条撤、位图 unlink、弹窗收掉`,
    !has() && env.unlinked.length === 1 && env.unlinked[0] === CARD_FILE && !!ctx.__closed,
    `unlink=${JSON.stringify(env.unlinked)} closed=${!!ctx.__closed}`)
  ck(`${label}④｜这一路只碰卡片留档那一个口，一次都不碰 shares 那张活码（「已分享的依旧有效」是真话）`,
    env.network.length === 1 && /^DELETE \/api\/notes\/77\/card$/.test(env.network[0]),
    JSON.stringify(env.network))
  ck(`${label}④｜服务器回体里那个对象进了待删队列（云上那份没删成不许就地忘掉）`,
    JSON.stringify(env.store).indexOf(CLOUD_FILE) >= 0,
    `storage 键 ${Object.keys(env.store).join('、')}`)
}

;(async () => {
  await runCase('zh', INDEX, 'zh', false)
  await runCase('en', INDEX, 'en', false)
  // 服务器撤不成那一支（S2 新加的顺序判据）：本机这一半必须原地不动
  await runCase('离线', INDEX, 'zh', false, { serverFails: true })

  try {
    // 反向对照的样本钉 **线上那一版 `f58cdb8`**，不钉 HEAD：HEAD 会随每次提交漂，
    // 10-05 第一次提交完这条就自己失效了（报的是"样本不像旧版"，不是代码坏了）。
    // 钉 f58cdb8 还多证一件事：用户手机上现在跑的那一版确实没有这道确认框。
    const old = cp.execFileSync('git', ['show', 'f58cdb8:miniprogram/pages/index/index.js'], { cwd: ROOT }).toString()
    const seg = (old.split('onDropCard()')[1] || '').slice(0, 320)
    const looksOld = /cardLog\.dropNote\(note\.id\)/.test(seg) && !/showModal/.test(seg)
    if (!looksOld) {
      ck('反向对照的样本确实是「没确认那一版」', false, '抽出来的 f58cdb8 版本不像旧版，这一段先别信')
    } else {
      fs.writeFileSync(PROBE, old)
      await runCase('旧版', PROBE, 'zh', true)
    }
  } finally {
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE)
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}（退出码 ${bad.length ? 1 : 0}）`)
  process.exit(bad.length ? 1 : 0)
})()
