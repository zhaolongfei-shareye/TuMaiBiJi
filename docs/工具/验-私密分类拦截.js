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

  console.log(`\n${bad.length ? '未通过 ' + bad.length + ' 条：' + bad.join(' / ') : '全部通过'}`)
  process.exitCode = bad.length ? 1 : 0
})()
