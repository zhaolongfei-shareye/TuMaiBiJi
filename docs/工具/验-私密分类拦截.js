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
  // 每换一个用例都把三个全局计数归零，否则上一条留下的框数/吐司会伪装成这一条的证据。
  const PRIVATE = { id: 7, is_private: true }
  const OPEN = { id: 7, is_private: false }
  const OTHER = { id: 8, is_private: true }
  const freshPage = () => ({ data: { lang: 'zh' }, _unlockedNoteId: 0 })
  const before = () => {
    toasts.length = 0; modals.length = 0; switches.length = 0
    unlock.has = false; unlock.clears = 0; unlock.verifies.length = 0
    verifyFail = null; resetModalReplies([])
  }

  before(); resetModalReplies([{ confirm: true, content: '123456' }])
  let pg = freshPage()
  ck('非私密笔记直接进，连密码框都不弹', (await gate.unlockOn(pg, OPEN)) === true && modals.length === 0 && pg._unlockRenewed === false)

  before(); resetModalReplies([{ confirm: true, content: '123456' }])
  pg = freshPage()
  ck('私密 + 手上没凭证 → 弹框，验对了放行', (await gate.unlockOn(pg, PRIVATE)) === true && modals.length === 1 && unlock.verifies.join() === '123456')
  ck('真验过这一次要标出来，让详情页知道第一份是空壳、得重取', pg._unlockRenewed === true && pg._unlockedNoteId === PRIVATE.id)
  ck('弹框之前先把手上那把作废（留着就是"问了只是形式、正文照旧读出来"）', unlock.clears === 1)

  before(); resetModalReplies([])
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id; unlock.has = true
  ck('同一篇、凭证还活着 → 不重复问（从编辑那一趟回来那条路）', (await gate.unlockOn(pg, PRIVATE)) === true && modals.length === 0 && pg._unlockRenewed === false)

  before(); resetModalReplies([{ confirm: true, content: '123456' }])
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id; unlock.has = true
  ck('换一篇必重问，哪怕上一把还管用', (await gate.unlockOn(pg, OTHER)) === true && modals.length === 1 && unlock.has === true)

  before(); resetModalReplies([{ confirm: true, content: '123456' }])
  pg = freshPage(); pg._unlockedNoteId = PRIVATE.id
  ck('凭证一没（过期／重置密码）就对同一篇再弹一次——站长 10-12 那条"重置后既不弹框又只见标题"', (await gate.unlockOn(pg, PRIVATE)) === true && modals.length === 1)

  before(); resetModalReplies([{ confirm: false }])
  pg = freshPage()
  ck('他取消 → 不放行，也不发验密码请求', (await gate.unlockOn(pg, PRIVATE)) === false && unlock.verifies.length === 0)

  before(); resetModalReplies([{ confirm: true, content: '1234' }])
  pg = freshPage()
  ck('不满六位不发服务端（省一次必败的验密）', (await gate.unlockOn(pg, PRIVATE)) === false && unlock.verifies.length === 0 && toasts.length === 1)

  before(); resetModalReplies([{ confirm: true, content: '111111' }])
  verifyFail = { data: { detail: '私密密码不正确' } }
  pg = freshPage()
  ck('密码不对 → 不放行，吐司就是服务端那句', (await gate.unlockOn(pg, PRIVATE)) === false && toasts.length === 1 && toasts[0] === '私密密码不正确' && switches.length === 0)

  // 站长 10-12 报的死路：重置（清空密码列）后输什么都不对，界面上什么都不说、也不给口。
  // 服务端那一句是写给日志的，不是写给人的，所以这一支不许当吐司直发。
  before(); resetModalReplies([{ confirm: true, content: '111111' }, { confirm: true }])
  verifyFail = { data: { detail: '尚未设置私密密码' } }
  pg = freshPage()
  ck('服务端说"还没设密码" → 不直接吐司那句话，改弹一层给去处', (await gate.unlockOn(pg, PRIVATE)) === false && modals.length === 2 && toasts.indexOf('尚未设置私密密码') === -1)
  ck('那一层的确定 = 跳「我的」设密码那一格', switches.join() === '/pages/me/me')

  before(); resetModalReplies([{ confirm: true, content: '111111' }, { confirm: false }])
  verifyFail = { data: { detail: '尚未设置私密密码' } }
  pg = freshPage()
  ck('他不点确定 → 就地收住，绝不偷偷跳页',
    (await gate.unlockOn(pg, PRIVATE)) === false && modals.length === 2 && switches.length === 0)

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
  ck('首页点那一行：先过 unlockOn、再开窗', /unlockOn\(this, note\)/.test(rowTap)
    && rowTap.indexOf('unlockOn') < rowTap.indexOf('_openDetail(idx)'))
  ck('验完密码这一趟不再整表重取（那一步把全表私密摘要留在内存里）',
    rowTap.length > 0 && !/loadNotes/.test(rowTap))
  ck('编辑那趟回来也过 unlockOn，并仍按 id 找回行号',
    /notes\.findIndex/.test(reOpen) && /unlockOn\(this/.test(reOpen))
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

  ck('编辑页没解锁就不进编辑器（PUT 是整份回写，会清掉真概要）',
    /is_private[\s\S]{0,200}hasPrivateUnlock\(\)/.test(wr) && /privateUnlockFirst/.test(wr))
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
