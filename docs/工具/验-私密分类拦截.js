// 「选私密但没设密码就拦住」与「点开私密必须先验一次密码」这两条规则的静态＋行为尺子（不联网、不开模拟器）。
// 为什么要有：这两条都只在"这一篇是锁着的"那一种状态下才看得见，而现网这个账号的私密格里
// 有没有笔记、密码有没有被重置，都不是我能从这里控制的。所以把判定函数单独量一遍：
// 状态各走一次，看放行/拦截、吐司文案、弹了几回框。
// 10-12 站长两条回电（「输入一次后一直能看」＋「重置密码后既不弹框、又只看到标题」）
// 都出自把"问过没有"记在页面上，所以 unlockOn 那一组用例是这轮的根，别当附加项删。
// 跑法：node docs/工具/验-私密分类拦截.js
const path = require('path')

const apiPath = require.resolve('../../miniprogram/utils/api.js')
const toasts = []
let status = { is_set: false }
let calls = 0

// unlockOn 那三条依赖：有没有凭证（本机判过服务端那把）、清凭证清了几次、验密码发过什么。
const unlock = { has: false, clears: 0, verifies: [] }
let verifyFail = null

// 弹窗：每一次 showModal 都记下来，并按 modalReplies 排好的答复回调
// （真机的 success 是异步的，这里同步调＝await 之后才 resolve，不影响用例判定）。
const modals = []
let modalReplies = []
function resetModalReplies(replies) {
  modalReplies = replies.slice()
}

// 把 api.js 换成一个只回固定状态的替身，privateGate 拿到的就是它
require.cache[apiPath] = {
  id: apiPath,
  filename: apiPath,
  loaded: true,
  exports: {
    getPrivatePasswordStatus: async () => {
      calls += 1
      if (status instanceof Error) throw status
      return status
    },
    verifyPrivatePassword: async (pwd) => {
      unlock.verifies.push(pwd)
      if (verifyFail) throw verifyFail
      unlock.has = true
    },
    hasPrivateUnlock: () => unlock.has,
    clearPrivateUnlock: () => { unlock.has = false; unlock.clears += 1 },
  },
}

const switches = []
global.wx = {
  showToast: (o) => toasts.push(o && o.title),
  showModal: (o) => {
    modals.push(o)
    const reply = modalReplies.length > 0 ? modalReplies.shift() : { confirm: false }
    if (o.success) o.success(reply)
  },
  switchTab: (o) => switches.push(o && o.url),
}
global.getApp = () => ({ globalData: {} })

const gate = require('../../miniprogram/utils/privateGate.js')
const { i18n } = require('../../miniprogram/utils/i18n.js')

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}

;(async () => {
  const NEED = i18n.zh.privatePasswordRequired

  toasts.length = 0; calls = 0
  ck('普通分类直接放行，且不去读服务端状态', (await gate.allowPrivate('旅游', 'zh')) === true && calls === 0)
  ck('「未分类」也不算私密', (await gate.allowPrivate('', 'zh')) === true)

  toasts.length = 0; calls = 0; status = { is_set: false }
  ck('没设密码时选私密被拦下', (await gate.allowPrivate('私密', 'zh')) === false)
  ck('拦下时发了吐司，文案就是那句"先去我的里设"', toasts.length === 1 && toasts[0] === NEED, toasts[0])

  toasts.length = 0; calls = 0; status = { is_set: true }
  ck('设过密码后选私密放行', (await gate.allowPrivate('私密', 'zh')) === true && toasts.length === 0)

  toasts.length = 0; calls = 0; status = new Error('网络断了')
  ck('状态读不到时也不放行（宁可让他重试）', (await gate.allowPrivate('私密', 'zh')) === false && toasts.length === 1)

  // ---------- unlockOn：点开一篇私密笔记的那一趟 ----------
  // 10-12 第二刀起，那一层输入面不再是 wx.showModal（系统框没有掩码、六位密码明文上屏，
  // 而且与「我的」设密码那一层两种长相），换成三页共用的六位面板：
  // templates/pwd-sheet.wxml + styles/pwd-sheet.wxss + utils/pwdSheet.js。
  // 所以这里不再编 showModal 的答复，改成**拿真模块按键**：假页面替他敲六格 / 点取消 / 按确定。
  // pwdSheet 用的是真模块（它只碰 wx.showToast 与 page.setData，不碰网络）。
  const pwdSheet = require('../../miniprogram/utils/pwdSheet.js')
  const tick = (ms) => new Promise((r) => setTimeout(r, ms || 25))
  const PRIVATE = { id: 7, is_private: true }
  const OPEN = { id: 7, is_private: false }
  const OTHER = { id: 8, is_private: true }
  // 面板一浮起来就替按的那一下（每个用例自己排）；null = 让他自己点，这一趟由 cancel 收尾。
  let afterOpen = null
  const freshPage = () => {
    const p = {
      data: { lang: 'zh', pwdOpen: false, pwdEntering: false, pwdBuf: '', pwdFocus: false },
      _unlockedNoteId: 0,
      setData(o) {
        Object.assign(p.data, o)
        // 浮起那一刻留一张快照：收场时 hide() 会把 pwdEntering 撤成 false，
        // 之后再读那个键量到的是"关着的样子"，不是"浮起来时画了什么"。
        if (o.pwdOpen === true && !p._snap) {
          p._snap = { name: p.data.pwdName, scene: p.data.pwdScene, tip: p.data.pwdTip,
            entering: p.data.pwdEntering }
        }
        if (o.pwdOpen === true && afterOpen) {
          const fn = afterOpen
          afterOpen = null
          setTimeout(() => fn(p), 0)
        }
      },
    }
    return p
  }
  const type = (v) => (p) => pwdSheet.input(p, { detail: { value: v } })
  const tapOkWith = (v) => (p) => { pwdSheet.input(p, { detail: { value: v } }); pwdSheet.submit(p) }
  const tapCancel = (p) => pwdSheet.cancel(p)
  const before = () => {
    toasts.length = 0; modals.length = 0; switches.length = 0
    unlock.has = false; unlock.clears = 0; unlock.verifies.length = 0
    verifyFail = null; resetModalReplies([]); afterOpen = null
  }

  before(); afterOpen = type('123456')
  let pg = freshPage()
  ck('非私密笔记直接进，连那一层都不浮', (await gate.unlockOn(pg, OPEN)) === true && pg.data.pwdOpen === false && pg._unlockRenewed === false)

  before(); afterOpen = type('123456')
  pg = freshPage()
  ck('私密 + 手上没凭证 → 浮那一层，六位验对了放行',
    (await gate.unlockOn(pg, PRIVATE)) === true && unlock.verifies.join() === '123456' && pg.data.pwdOpen === false)
  ck('真验过这一次要标出来，让详情页知道第一份是空壳、得重取', pg._unlockRenewed === true && pg._unlockedNoteId === PRIVATE.id)
  ck('浮那一层之前先把手上那把作废（留着就是"问了只是形式、正文照旧读出来"）', unlock.clears === 1)
  ck('浮起来那三行字全吃现网字典（功能名 / 用在哪 / 校验提醒），且是"要输"那一态',
    !!pg._snap && pg._snap.name === i18n.zh.privatePassword && pg._snap.scene === i18n.zh.privatePasswordScene
    && pg._snap.tip === i18n.zh.privatePasswordHint && pg._snap.entering === true,
    `${pg._snap && pg._snap.name}｜${pg._snap && pg._snap.tip}`)

  before(); afterOpen = null
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id; unlock.has = true
  ck('同一篇、凭证还活着 → 那一层根本不浮（从编辑那一趟回来那条路）',
    (await gate.unlockOn(pg, PRIVATE)) === true && pg.data.pwdOpen === false && pg._unlockRenewed === false)

  before(); afterOpen = type('123456')
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id; unlock.has = true
  ck('换一篇必重问，哪怕上一把还管用', (await gate.unlockOn(pg, OTHER)) === true && unlock.verifies.length === 1)

  before(); afterOpen = type('123456')
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id
  ck('凭证一没（过期／重置密码）就对同一篇再浮一次——站长 10-12 那条"重置后既不弹框又只见标题"',
    (await gate.unlockOn(pg, PRIVATE)) === true && unlock.verifies.length === 1)

  before(); afterOpen = tapCancel
  pg = freshPage()
  ck('他点取消 → 不放行、不发验密码、那一层收干净',
    (await gate.unlockOn(pg, PRIVATE)) === false && unlock.verifies.length === 0 && pg.data.pwdOpen === false)

  before(); afterOpen = tapOkWith('1234')
  pg = freshPage()
  const shortRun = gate.unlockOn(pg, PRIVATE)
  await tick()
  ck('不满六位交不出去：只把规则讲一遍，不打服务端，那一层也不走',
    unlock.verifies.length === 0 && toasts[0] === i18n.zh.privatePasswordHint && pg.data.pwdOpen === true,
    `verifies=${unlock.verifies.length} toast=${toasts[0]} open=${pg.data.pwdOpen}`)
  pwdSheet.cancel(pg)
  ck('……他点取消才收场，这一趟回 false', (await shortRun) === false)

  // 密码不对那一支：10-12 起照「我的」那一层的错法——吐司一句、六格清空、当场重输，
  // 不是整层消失（他要的就是"和设置密码那个框一样"）。所以这一趟不会自己结掉，
  // 断言完再替他点取消收尾。
  before(); afterOpen = type('111111')
  verifyFail = { statusCode: 403, data: { detail: '私密密码不正确' } }
  pg = freshPage()
  const wrongRun = gate.unlockOn(pg, PRIVATE)
  await tick()
  // C5 甲（站长 10-12）：屏上那句由字典出，**不吃服务端那句 detail**（那是写给日志看的话）。
  // 旧版这条钉的正是"吐司就是服务端那句"，判据跟着这次改口一起换，不拿代码去迁就旧尺子。
  ck('密码不对 → 那一层留着、六格清空、吐司是字典那句而不是服务端原文',
    pg.data.pwdOpen === true && pg.data.pwdBuf === '' && toasts[0] === i18n.zh.privatePasswordWrong && switches.length === 0,
    `open=${pg.data.pwdOpen} buf="${pg.data.pwdBuf}" toast=${toasts[0]}`)
  ck('验失败也不许把凭证当活着（下一次点同一篇还得再问）', unlock.has === false)
  pwdSheet.cancel(pg)
  ck('他在这一步点取消 → 这一趟回 false，窗不开', (await wrongRun) === false)

  before(); afterOpen = type('111111')
  verifyFail = { statusCode: 429, data: { detail: 'Rate limit exceeded: 10 per 1 minute 1' } }
  pg = freshPage()
  const limited = gate.unlockOn(pg, PRIVATE)
  await tick()
  ck('撞上 10/分钟那道限流 → 屏上是「输得太快了」，不是 slowapi 那句英文（C5 甲的正面）',
    pg.data.pwdOpen === true && toasts[0] === i18n.zh.privateRateLimited
    && String(toasts[0]).indexOf('Rate limit') === -1, `toast=${toasts[0]}`)
  pwdSheet.cancel(pg)
  ck('……限流那一趟同样要他点取消才收场，回 false', (await limited) === false)

  // 站长 10-12 报的死路：重置（清空密码列）后输什么都不对，界面上什么都不说、也不给口。
  // 服务端那一句是写给日志的，不是写给人的，所以这一支不许当吐司直发。
  before(); afterOpen = type('111111'); resetModalReplies([{ confirm: true }])
  verifyFail = { data: { detail: '尚未设置私密密码' } }
  pg = freshPage()
  ck('服务端说"还没设密码" → 那一层收掉、改弹一层给去处，绝不把那句当吐司直发',
    (await gate.unlockOn(pg, PRIVATE)) === false && modals.length === 1 && pg.data.pwdOpen === false
    && toasts.indexOf('尚未设置私密密码') === -1, `模态 ${modals.length} 层／吐司 ${toasts.join('、')}`)
  ck('那一层的确定 = 跳「我的」设密码那一格', switches.join() === '/pages/me/me')

  before(); afterOpen = type('111111'); resetModalReplies([{ confirm: false }])
  verifyFail = { data: { detail: '尚未设置私密密码' } }
  pg = freshPage()
  ck('他不点确定 → 就地收住，绝不偷偷跳页',
    (await gate.unlockOn(pg, PRIVATE)) === false && modals.length === 1 && switches.length === 0)

  const fs = require('fs')
  const idx = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')
  const write = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/create/create.js'), 'utf8')
  const wr = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/write/write.js'), 'utf8')
  ck('列表页判据已收到同一个函数里（不再各写一遍"私密"）', /isPrivate\(/.test(idx) && !/=== '私密'/.test(idx))
  // 10-08 创建入口改版：新建页那格分类选择器撤了（标题与归类挪到详情页「编辑」里改），
  // 所以这道闸跟着退到唯一还在挑分类的那一页。闸比选择器多留着 = 有一条打得着的假防线，
  // 少留着 = 挑私密那一格能绕过密码——两头都要看得见，故此处同时钉两边。
  ck('挑分类那一页接了这道拦截（编辑页 write）', /allowPrivate\(/.test(wr))
  ck('新建页不再挑分类，那道闸也跟着撤净（不留打不到的防线）',
    !/allowPrivate|getCategories|categoryNames|catIndex/.test(write) && !/picker/.test(
      fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/create/create.wxml'), 'utf8')))

  // ---------- 服务端那道闸在客户端的四条接线 ----------
  // 后端 09-30 起真的会裁字段（backend/app/core/private_access.py）：没解锁时私密笔记的
  // 概要、要点、正文一律 null。这四条任何一条断了，症状都是"笔记看起来是空的"，
  // 而且编辑页那条断了会进一步把空壳存回去、真把概要清掉——所以钉死在这里。
  const apiJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/api.js'), 'utf8')
  const detailJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/detail/detail.js'), 'utf8')
  const gateJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/privateGate.js'), 'utf8')
  ck('解锁凭证跟着请求头走（X-Private-Token）', /X-Private-Token/.test(apiJs))
  ck('带不带凭证是每一条请求自己说得清的（withUnlock 一开关，默认带）',
    /function _headers\(contentType, extra, withUnlock = true\)/.test(apiJs)
    && /withUnlock \? _unlockToken\(\)/.test(apiJs))
  // 这条是 10-12 那轮新立的闸：列表那一趟带着凭证＝服务端把这一页**所有**私密行的 summary 一起发来，
  // 且全留在 this.data.notes 里。症状是"验过一篇，别的不问就露摘要"。
  ck('列表那一趟永远不带解锁凭证（不输入密码就只能看标题）',
    /getNotes:[\s\S]{0,600}noUnlock: true/.test(apiJs))
  ck('verify 成功就地存下凭证，不靠各页面自己记得存',
    /unlock_token/.test(apiJs) && /setPrivateUnlock\(r\.unlock_token\)/.test(apiJs))
  ck('设密与重置都清掉本机凭证（服务端那边旧凭证当场作废）',
    (apiJs.match(/clearPrivateUnlock\(\)/g) || []).length >= 2)
  // 10-12 起判据不在页面上："这一屏问过没有"换成"服务端认得的那把凭证 + 这一篇的号"。
  // 这两条钉的是新形状：详情页必过 unlockOn，且只在**真验过一次**时才重取那一趟全文
  // （凭证还活着时第一次读回来的就是全文，再打一趟是白要的）。
  ck('详情页进门前过 unlockOn，没验成就不给看（退回上一页）',
    /privateGate\.unlockOn\(this, note\)/.test(detailJs) && /wx\.navigateBack\(\)/.test(detailJs))
  ck('详情页只在真验过那一趟之后重取全文',
    /if \(this\._unlockRenewed\) \{[\s\S]{0,200}note = await api\.getNote\(id\)/.test(detailJs))
  // 首页是常驻 tab，页面实例整个会话都活着——旧 BUG 的一半原因就在这里。所以钉死：
  // 两条通往详情窗的路都要先过 unlockOn；而"验完顺手整表重取"那一步已撤净。
  // 原来这里是一条 `!loadNotes(true) ... _reopenDetail` 的全局否定，结果误伤 onShow 那一趟
  // （从编辑回来整表重取是对的：内容真变了）。所以改成一个函数一个函数地量，
  // 判据落在"验密码那一路"上，不在"整张页有没有重取"上。
  const objBody = (src, name) => (src.match(new RegExp(`${name}\\(([^\\n]*)\\) \\{[\\s\\S]*?\\n  \\},`)) || [''])[0]
  const rowTap = objBody(idx, 'onRowTap')
  const reOpen = objBody(idx, '_reopenDetail')
  const openDetail = objBody(idx, '_openDetail')
  // 10-12 审查严重②：面板浮着的那一段时间人能从底栏切走再回来（底栏是自定义组件、z-index 999
  // 压得过这一层的 100），onShow 那趟会重拉整表、序也变。所以验完必须按 id 找回那一行——
  // 拿点下去那一刻的号开窗＝验的是 A、开的是 B，而 B 是私密也照样开（凭证是全局那一把）。
  ck('首页点那一行：过完 unlockOn 之后按 id 找回行号才开窗',
    /unlockOn\(this, note\)/.test(rowTap)
    && rowTap.indexOf('unlockOn') < rowTap.indexOf('notes.findIndex')
    && rowTap.indexOf('notes.findIndex') < rowTap.indexOf('this._openDetail(at)'))
  ck('不许再用 await 之前那个号直接开窗', !/this\._openDetail\(idx\)/.test(rowTap))
  // 审查严重①：列表那一行的 is_private 是本机按分类名现算的（后端列表响应里压根没这一栏），
  // 分类那一张表没拉到/拉挂的当口一律算成"不私密"⇒ 闸整个跳过 ⇒ 症状还是"不弹密码、只剩标题"。
  // 详情那一份的 is_private 才是服务端钉的，所以开窗那一步要以它为准再走一次同一道闸。
  ck('开窗那一步以详情的 is_private 再走一次闸（列表那份是本机猜的）',
    openDetail.indexOf('full.is_private') >= 0
    && openDetail.indexOf('full.is_private') < openDetail.indexOf('needsUnlock(this, gate)')
    && openDetail.indexOf('needsUnlock(this, gate)') < openDetail.indexOf('unlockOn(this, gate)'))
  // 审计严重④（我上一批自己引进来的）：那一层密码面板的 z-index 是 100，
  // 而首页详情窗 .float-sheet 是 101——先浮面板再收窗，面板就压在窗底下，
  // 人只看见一篇带标题的窗，屏上既没有输入框也没有能关的地方。所以收窗必须排在问之前。
  ck('要问的时候先把详情窗收掉再浮面板（面板 100 压不过 .float-sheet 的 101）',
    openDetail.indexOf('detailOpen: false') >= 0
    && openDetail.indexOf('detailOpen: false') < openDetail.indexOf('unlockOn(this, gate)'))
  ck('验过之后把窗放回来，再按新那一份取全文',
    /if \(askFirst\) this\.setData\(\{ detailOpen: true \}\)/.test(openDetail)
    && /if \(this\._unlockRenewed\) full = await api\.getNote\(row\.id\)/.test(openDetail))
  ck('"要不要问"只有一处判据（首页与 unlockOn 共用 needsUnlock，页面里不许自己算一遍）',
    /function needsUnlock\(page, note\)/.test(gateJs)
    && !/page\._unlockedNoteId === [a-z]+\.id && [a-zA-Z.]*hasPrivateUnlock\(\)/.test(idx)
    && /needsUnlock\(this, gate\)/.test(idx))

  // 审计中等⑥：弱网下给 A 输完密码（verify 还在路上）再点 B，A 的迟到回包不许动 B 那一层。
  before()
  const pA = freshPage()
  let releaseA = null
  afterOpen = (p) => pwdSheet.input(p, { detail: { value: '123456' } })
  const runA = pwdSheet.ask(pA, { lang: 'zh', tryIt: () => new Promise((r) => { releaseA = r }) })
  await tick(20)
  ck('A 那一层已经把六位交出去（tryIt 还挂着）',
    pA.data.pwdBuf === '123456' && typeof releaseA === 'function')
  afterOpen = null
  const runB = pwdSheet.ask(pA, { lang: 'zh', tryIt: async () => true })
  let bDone = false
  runB.then(() => { bDone = true })
  await tick(20)
  ck('换 B 时 A 那一趟先被判掉（不许两个 pending 抢同一次输入）', (await runA) === false)
  releaseA(true)
  await tick(40)
  ck('A 的迟到回包不许把 B 那一层收掉、也不许当"B 验过了"',
    pA.data.pwdOpen === true && bDone === false, `open=${pA.data.pwdOpen} B 已结=${bDone}`)
  pwdSheet.cancel(pA)
  ck('B 自己那一趟仍要人输：取消之后才回 false', (await runB) === false)

  ck('验完密码这一趟不再整表重取（那一步把全表私密摘要留在内存里）',
    rowTap.length > 0 && !/loadNotes/.test(rowTap))
  ck('编辑那趟回来也过 unlockOn，并仍按 id 找回行号',
    /notes\.findIndex/.test(reOpen) && /unlockOn\(this/.test(reOpen))
  // 审查次要①：那一面旗只该由 unlockOn 抬起。原来只在私密那一支里复位，
  // 一篇验过的笔记后来被改成非私密就一直立着，于是每次 onShow 白打两趟详情。
  ck('详情页进门先把那面旗落下（不靠私密那一支替它复位）',
    /this\._unlockRenewed = false[\s\S]{0,40}try \{/.test(detailJs))
  // 审查严重③的那一半能当场堵住的：注销把解锁凭证也带走。globalData 是进程里一份，
  // 换新 token 不会换掉它——留着就是下一个身份不必重输读上一个人的私密正文。
  ck('clearSession 里清解锁凭证（与卡片、名片那两个 signOut 同一口径）',
    /clearSession\(\)[\s\S]{0,900}clearPrivateUnlock\(\)/.test(
      fs.readFileSync(path.join(__dirname, '../../miniprogram/app.js'), 'utf8')))

  ck('解锁状态不记在 data 里（常驻 tab 记一次＝整个会话不再问）',
    !/_privateVerified:/.test(idx) && !/this\._privateVerified\s*=/.test(idx) && !/this\._privateVerified\s*=/.test(detailJs))
  // 一份解锁实现：输入框、判据、服务端那一句的分支，全站只许长一次。
  // 站长 10-12 的两句是一件事的两面：「两个框风格不一致，要统一」＋「输入一次后一直能看」。
  // 根因相同——首页与详情页各自抄了一份"弹个框—发请求—记个布尔"，两份各记各的。
  // 所以这里量的不是样式，是**发起验密码的那一处在几号文件**：多一处就多一份自己的记法。
  const dir = (p) => fs.readdirSync(p, { withFileTypes: true })
    .flatMap((e) => e.isDirectory() ? dir(path.join(p, e.name)) : [path.join(p, e.name)])
  const pageJs = dir(path.join(__dirname, '../../miniprogram/pages'))
    .concat(fs.existsSync(path.join(__dirname, '../../miniprogram/components'))
      ? dir(path.join(__dirname, '../../miniprogram/components')) : [])
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f, src: fs.readFileSync(f, 'utf8') }))
  const verifySites = pageJs.filter((x) => /verifyPrivatePassword\(/.test(x.src)).map((x) => path.basename(x.f))
  ck('验密码那一趟只有 privateGate 一处发起（页面里一处都不许有）', verifySites.length === 0, verifySites.join(' / '))
  ck('页面里那份自写的密码框函数已撤净（不留第二套记法）',
    !pageJs.some((x) => /_promptPrivatePassword/.test(x.src)))
  ck('判据与输入都收在 unlockOn 这一个出口里（两页共用）',
    /unlockOn/.test(gateJs) && /unlockOn\(this/.test(idx) && /unlockOn\(this/.test(detailJs))

  // ---------- 10-12 第二刀：那一层输入面三页共用一份 ----------
  // 他的原话是「看笔记提示输入密码的框，跟设置密码的框风格不一致。要统一」。
  // 统一的是三样：标记（templates/pwd-sheet.wxml）、皮（styles/pwd-sheet.wxss）、
  // 收键那一条（utils/pwdSheet.js）。这里量的不是像不像，是**同一件东西在几份文件里**——
  // 只要页面里还能抄出一份六格，下一次改一处就会漏改另一处，那正是他打的这一条。
  const files = (d, ext) => dir(path.join(__dirname, d)).filter((f) => f.endsWith(ext))
    .map((f) => ({ f, src: fs.readFileSync(f, 'utf8') }))
  const pageWxml = files('../../miniprogram/pages', '.wxml')
  const pageWxss = files('../../miniprogram/pages', '.wxss')
  const tpl = fs.readFileSync(path.join(__dirname, '../../miniprogram/templates/pwd-sheet.wxml'), 'utf8')
  const sheetWxss = fs.readFileSync(path.join(__dirname, '../../miniprogram/styles/pwd-sheet.wxss'), 'utf8')
  const sheetJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/pwdSheet.js'), 'utf8')
  const wxmlOf = (p) => fs.readFileSync(path.join(__dirname, '../../miniprogram/pages', p, p + '.wxml'), 'utf8')
  const wxssOf = (p) => fs.readFileSync(path.join(__dirname, '../../miniprogram/pages', p, p + '.wxss'), 'utf8')

  ck('系统那枚 editable 输入框全站归零（六位密码不许明文上屏，也不许留第二种长相）',
    !/editable: true/.test(gateJs) && !pageJs.some((x) => /editable: true/.test(x.src)))
  ck('解锁走的是这一层面板，不是 showModal', /pwdSheet\.ask\(/.test(gateJs))
  ck('六格那一排的标记只有一处：模板里，页面 wxml 一份都没有',
    /pwd-boxes/.test(tpl) && pageWxml.filter((x) => /pwd-boxes/.test(x.src)).length === 0,
    pageWxml.filter((x) => /pwd-boxes/.test(x.src)).map((x) => path.basename(x.f)).join('、'))
  ck('六格的皮只有一处：那张表里，页内 wxss 一条裸 .pwd 规则都不写',
    /^\.pwd-cell\s*\{/m.test(sheetWxss) && pageWxss.filter((x) => /^\.pwd/m.test(x.src)).length === 0,
    pageWxss.filter((x) => /^\.pwd/m.test(x.src)).map((x) => path.basename(x.f)).join('、'))
  ck('四页都接上了这一层：@import 那张皮 + <import> 那张标记（少了任何一页就是那一屏没皮）',
    ['me', 'index', 'detail', 'write'].every((p) => /@import '[^']*styles\/pwd-sheet\.wxss'/.test(wxssOf(p))
      && /<import src="[^']*templates\/pwd-sheet\.wxml"/.test(wxmlOf(p))))
  ck('首页、详情页、编辑页都挂着那一枚 template（不 import 就不画，判据过了也是白过）',
    ['index', 'detail', 'me', 'write'].every((p) => /<template is="pwdSheet"/.test(wxmlOf(p))))
  ck('模板要的那三枚把手，三页都备好了（名字是模板里写死的，换名＝点不动）',
    ['onPwdBuf', 'onPwdOk', 'onClosePwdPanel'].every((n) => new RegExp(n + '\\s*\\(').test(idx)
      && new RegExp(n + '\\s*\\(').test(detailJs) && new RegExp(n + '\\s*\\(').test(wr)))
  ck('面板上那三行字全从现网字典取（不给已有字段另造叫法）',
    /t\('privatePassword', lang\)/.test(sheetJs) && /t\('privatePasswordScene', lang\)/.test(sheetJs)
    && /t\('privatePasswordHint', lang\)/.test(sheetJs))

  // 站长 10-12 拍 C3 甲：这一页**进门自己问一次**（不再靠"上一屏问过没有"），并且 PUT 只发真动过的栏。
  // 旧的那条判据钉的是「读回来发现没凭证就吐司一句再退走」——那一版已被这次实现替掉，
  // 按「改判据不改代码迁就旧尺子」改钉新的形状：验不成连表单都不铺，铺了就一定有基线。
  ck('编辑页进门自己走一次 unlockOn（不是只看手里有没有凭证）',
    /note\.is_private[\s\S]{0,120}unlockOn\(/.test(wr))
  ck('验不成连表单都不铺：先 return，且退出走 exitOrHome（深链进来时 navigateBack 无处可退）',
    /unlockOn\(this, note\)\)\)\s*\{[\s\S]{0,120}exitOrHome\(\)/.test(wr))
  ck('PUT 只发真动过的那几栏，且一条都没动就不打那一趟（整份 PUT 会拿空壳清掉真概要）',
    /const payload = \{\}/.test(wr) && /if \(now\.title !== base\.title\)/.test(wr)
      && /Object\.keys\(payload\)\.length > 0/.test(wr) && !/payload\.source_type = undefined/.test(wr))
  ck('基线在 setData 那一趟同一处建起来（事后从 data 回读会把他刚敲的字算成改动）',
    /this\._baseline = \{/.test(wr) && /_baseline[\s\S]{0,400}normLines\(note\.key_points\)/.test(wr))
  ck('归一化两头同一把尺：数组与文本框都折成"去掉项目符号的那些行"',
    /const normLines = /.test(wr) && /const normTags = /.test(wr))
  ck('没基线时一个字都不发（宁可存不下，不拿不知道哪来的东西去覆盖）',
    /if \(!base\) \{[\s\S]{0,200}return/.test(wr))

  // C1 甲（站长 10-12：「设了密码的笔记是不能生成卡片的」）。界面原本已经不给私密篇开大图，
  // 这一组钉的是漏掉的两处：**历史遗留**那张（先出卡片、后来才归私密）还在台账里就会被画出来，
  // 以及登记接口原本不判私密。
  const cardsPy = fs.readFileSync(path.join(__dirname, '../../backend/app/api/routes/cards.py'), 'utf8')
  const i18nJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/i18n.js'), 'utf8')
  // 10-17 两屏合一：原来这一条量的是「卡片那一排」(`cells` 里那句 early-return)，
  // 那一排没了。闸没撤，只是换了住的地方——现在它算 `arrange()` 里那一栏 `cover`。
  const idxWxml = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/index/index.wxml'), 'utf8')
  ck('列表那一行右侧的配图：私密的不画，判不准（分类表还没拉回来）的也不画',
    /const hideCover = n\.is_private \|\| !n\.privKnown/.test(idx)
    // 10-18 之后这一栏有三种来源（后台那张官方图／用户自己的云配图／没图），
    // `hideCover` 必须是**第一道**：官方那一张走的也是这同一条闸。写成
    // `cover: official ? official : ...` 就等于给这一类开后门绕过私密。
    && /cover: hideCover \? '' : \(n\.is_preset && official\) \? official : \(!canDrawCloud \? '' : n\.cover_file_id/.test(idx))
  // 没有图就整块不画：画一个空框＝屏上多一块"这块屏坏了吗"的疑点，也是一格占位。
  ck('那一格没图时是**不渲染**，不是渲染一张空框（wx:if 与 src 挂在同一枚 image 上）',
    /<image wx:if="\{\{r\.cover\}\}"[^>]*class="ixl-th"/.test(idxWxml))
  ck('「判得准不准」单独留一栏——isPrivate(undefined) 回 false 是"不知道"，不是"不私密"',
    /n\.privKnown = n\.category_id == null \|\| nameOf\[n\.category_id\] !== undefined/.test(idx))
  ck('登记卡片那一口在服务端判私密（界面挡不住接口，与「私密笔记不能分享」同一形状）',
    /私密笔记不能生成卡片/.test(cardsPy) && /is_private_note\(/.test(cardsPy))
  // C4：验不成去哪儿。原来两处一律 `wx.navigateBack()`，深链／扫码直接落这一页时页面栈只有一层，
  // 那句静默失败，人停在一屏空白。
  ck('退路走 exitOrHome：能退就退，退无可退回首页（三处都问同一个判据）',
    /function exitOrHome/.test(gateJs) && /getCurrentPages\(\)\.length > 1/.test(gateJs)
      && /exitOrHome\(\)/.test(detailJs) && /exitOrHome\(\)/.test(wr))
  // C5 甲：限流那句服务端原文（slowapi 那句英文 "Rate limit exceeded: 10 per 1 minute"）
  // 本来是写给日志看的，原样当吐司发出去读着像乱码。话一律由字典出，中英各一句。
  ck('解锁那一框不再念服务端原文，按状态码分流走字典',
    !/title: \(err\.data && err\.data\.detail\)/.test(gateJs)
      && /t\(err && err\.statusCode === 429 \? 'privateRateLimited' : 'privatePasswordWrong', lang\)/.test(gateJs))
  ck('privateRateLimited 中英都在（缺一边就是那一语种下屏上没字）',
    /privateRateLimited/.test(i18nJs) && (i18nJs.match(/privateRateLimited/g) || []).length >= 2)
  ck('凭证只存内存不落 storage（杀了重进要重新输）',
    !/setStorageSync\([^)]*[Uu]nlock/.test(apiJs))
  const appJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/app.js'), 'utf8')
  ck('globalData 上有那一格，且 401 重登时跟着清',
    /privateUnlock: null/.test(appJs) && /globalData\.privateUnlock = null/.test(apiJs))

  // ---------- 「私密」那一格得跟着密码一起出现（09-30 站长真机撞到的那一步） ----------
  // 他的原话："密码已经设了，但分类看不到私密分类，写笔记时候也看不到可以选私密。"
  // 判据是分类名，可全项目没有一处会造出这一格，只能自己去分类管理手打"私密"两个字。
  // 这一组钉的是后端那两处补齐（设密码时 + 存量账号问状态时自愈），以及"这一格不许被
  // 静默删掉"那道闸——删分类的通用逻辑会把名下笔记的 category_id 置空，对这一格等于解锁。
  const userPy = fs.readFileSync(path.join(__dirname, '../../backend/app/api/routes/user.py'), 'utf8')
  const catsPy = fs.readFileSync(path.join(__dirname, '../../backend/app/api/routes/categories.py'), 'utf8')
  // 每条都截到"下一个空行或文件尾"：delete_category 是这个文件的最后一个函数，
  // 后面没有空行，只写 \n\n 会整段匹配不到、于是那两条红得像是实现没了。
  const body = (src, name) => (src.match(new RegExp(`def ${name}\\([\\s\\S]*?(?:\\n\\n|$)`)) || [''])[0]
  const setPwd = body(userPy, 'set_private_password')
  const getStatus = body(userPy, 'get_private_password_status')
  const delCat = body(catsPy, 'delete_category')
  ck('设完密码就地补出「私密」那一格', /_ensure_private_category\(db, user\)/.test(setPwd))
  ck('存量账号（闸门上线前就设过密码的）问一次状态也补上',
    /private_password_hash is not None[\s\S]{0,120}_ensure_private_category/.test(getStatus))
  ck('补格判据吃那个常量，不再抄第二份"私密"字面量',
    /from app\.core\.private_access import[^\n]*PRIVATE_CATEGORY_NAME/.test(userPy)
    && !/name\s*=\s*["']私密["']/.test(userPy))
  ck('幂等：补之前先查这个用户名下有没有那个名字',
    /def _ensure_private_category[\s\S]{0,600}\.first\(\)[\s\S]{0,80}return False/.test(userPy))
  ck('「私密」格里还有笔记时删不掉（删了就是静默解锁）',
    /PRIVATE_CATEGORY_NAME/.test(delCat) && /status_code\s*=\s*400/.test(delCat))
  ck('空的一格照旧能删，别的分类行为一个字没改',
    /Note\.category_id == category_id[\s\S]{0,120}category_id: None/.test(delCat))
  const catJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/categories/categories.js'), 'utf8')
  ck('删失败时把服务端那句原因报出来，不是只回"删除失败"',
    /err\.data && err\.data\.detail[\s\S]{0,60}deleteFailed/.test(catJs))

  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})()
