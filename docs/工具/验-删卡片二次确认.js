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
//   ③ 两支各自咬住：取消 → 台账与位图都不动、弹窗不收；确定 → 台账整条撤、位图 unlink、弹窗收；
//   ④ 全程零网络写——确认文案那句「已分享的依旧有效」必须是真话。
//   反向对照：把 HEAD 那版（还没有确认框的旧函数体）落成同目录探针再跑，它必须"一次弹窗都没打、
//   当场就删"。这一条要是也绿，说明上面三层是虚的。
const path = require('path')
const fs = require('fs')
const cp = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const MP = path.join(ROOT, 'miniprogram')
const INDEX = path.join(MP, 'pages/index/index.js')
const PROBE = path.join(MP, 'pages/index/.probe-before-index.js')

const NOTE_ID = 77
const CARD_FILE = 'wxfile://usr/cards/77-card-1.jpg'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

// —— 本机存储／文件系统／网络的替身 ——
// 台账那一本账不是替身：读写走的都是产品自己那份 cardLog.js 的读法（getStorageSync('cardLog')）。
const makeEnv = () => {
  const env = { modals: [], unlinked: [], network: [], page: null, store: {} }
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
    showToast: () => {},
    hideToast: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    request: (o) => { env.network.push('request'); o.fail && o.fail({ errMsg: 'stub' }) },
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

const runCase = (label, file, lang, expectOld) => {
  delete require.cache[require.resolve(file)]
  const env = makeEnv()
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
  ck(`${label}③｜取消这一支：台账不动、位图不删、弹窗不收`,
    has() && env.unlinked.length === 0 && !ctx.__closed,
    `unlink ${env.unlinked.length} 次 / closed=${!!ctx.__closed}`)

  o.success && o.success({ confirm: true, cancel: false })
  ck(`${label}③｜确定这一支：台账整条撤、位图 unlink、弹窗收掉`,
    !has() && env.unlinked.length === 1 && env.unlinked[0] === CARD_FILE && !!ctx.__closed,
    `unlink=${JSON.stringify(env.unlinked)} closed=${!!ctx.__closed}`)
  ck(`${label}④｜这一路零网络写（「已分享的依旧有效」是真话）`,
    env.network.length === 0, `网络调用 ${env.network.length} 次`)
}

;(async () => {
  runCase('zh', INDEX, 'zh', false)
  runCase('en', INDEX, 'en', false)

  try {
    const old = cp.execFileSync('git', ['show', 'HEAD:miniprogram/pages/index/index.js'], { cwd: ROOT }).toString()
    const seg = (old.split('onDropCard()')[1] || '').slice(0, 320)
    const looksOld = /cardLog\.dropNote\(note\.id\)/.test(seg) && !/showModal/.test(seg)
    if (!looksOld) {
      ck('反向对照的样本确实是「没确认那一版」', false, '抽出来的 HEAD 版本不像旧版，这一段先别信')
    } else {
      fs.writeFileSync(PROBE, old)
      runCase('旧版', PROBE, 'zh', true)
    }
  } finally {
    if (fs.existsSync(PROBE)) fs.unlinkSync(PROBE)
  }

  console.log(`\n${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}（退出码 ${bad.length ? 1 : 0}）`)
  process.exit(bad.length ? 1 : 0)
})()
