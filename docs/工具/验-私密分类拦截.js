// 「选私密但没设密码就拦住」这条规则的静态尺子（不联网、不开模拟器）。
// 为什么要有：这条拦截只在"没有私密分类 + 没设密码"那一种账号状态下才看得见，
// 而现网这个账号既没有私密分类、密码也已经设上了，端到端跑不到那一支。
// 所以把判定函数单独量一遍：四种状态各走一次，看放行/拦截和吐司文案。
// 跑法：node docs/工具/验-私密分类拦截.js
const path = require('path')

const apiPath = require.resolve('../../miniprogram/utils/api.js')
const toasts = []
let status = { is_set: false }
let calls = 0

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
  },
}

global.wx = { showToast: (o) => toasts.push(o && o.title) }
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

  const fs = require('fs')
  const idx = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/index/index.js'), 'utf8')
  const write = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/create/create.js'), 'utf8')
  const wr = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/write/write.js'), 'utf8')
  ck('列表页判据已收到同一个函数里（不再各写一遍"私密"）', /isPrivate\(/.test(idx) && !/=== '私密'/.test(idx))
  ck('新建页与编辑页都接了这道拦截', /allowPrivate\(/.test(write) && /allowPrivate\(/.test(wr))

  // ---------- 服务端那道闸在客户端的四条接线 ----------
  // 后端 09-30 起真的会裁字段（backend/app/core/private_access.py）：没解锁时私密笔记的
  // 概要、要点、正文一律 null。这四条任何一条断了，症状都是"笔记看起来是空的"，
  // 而且编辑页那条断了会进一步把空壳存回去、真把概要清掉——所以钉死在这里。
  const apiJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/utils/api.js'), 'utf8')
  const detailJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/detail/detail.js'), 'utf8')
  ck('每个请求都带上解锁凭证（X-Private-Token）', /X-Private-Token/.test(apiJs))
  ck('verify 成功就地存下凭证，不靠各页面自己记得存',
    /unlock_token/.test(apiJs) && /setPrivateUnlock\(r\.unlock_token\)/.test(apiJs))
  ck('设密与重置都清掉本机凭证（服务端那边旧凭证当场作废）',
    (apiJs.match(/clearPrivateUnlock\(\)/g) || []).length >= 2)
  ck('详情页验完密码重取一次（第一份是裁过的空壳）',
    /this\._privateVerified = true[\s\S]{0,400}note = await api\.getNote\(id\)/.test(detailJs))
  ck('列表页验完密码重载列表并按 id 找回行号（不然展开那行是空的）',
    /await this\.loadNotes\(true\)[\s\S]{0,200}notes\.findIndex/.test(idx))
  ck('编辑页没解锁就不进编辑器（PUT 是整份回写，会清掉真概要）',
    /is_private[\s\S]{0,200}hasPrivateUnlock\(\)/.test(wr) && /privateUnlockFirst/.test(wr))
  ck('凭证只存内存不落 storage（杀了重进要重新输）',
    !/setStorageSync\([^)]*[Uu]nlock/.test(apiJs))
  const appJs = fs.readFileSync(path.join(__dirname, '../../miniprogram/app.js'), 'utf8')
  ck('globalData 上有那一格，且 401 重登时跟着清',
    /privateUnlock: null/.test(appJs) && /globalData\.privateUnlock = null/.test(apiJs))

  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})()
