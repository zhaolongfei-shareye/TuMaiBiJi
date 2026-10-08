// 卡片留档上服务端 · S2 的接线尺子（静态，不打网络、不起模拟器）。
//
// S2 干的事只有一句：**"这篇有没有卡片"从此不问这台手机的文件目录，问服务器那一行**。
// 所以这把尺子盯四件事：
// ① 三处判据（首页那一格、详情页那一格、笔记卡片页那道闸）都走 `cardCloud` 那一个出处，
//    页面里再出现 `accessSync`／`aliveFor`／`forNote` 就是退回"更新之后卡片不见了"那个根；
// ② 出图那一刻真的往云上送（`cardLog.record` 里那一趟），而且**任何失败都不许冒到主流程**；
// ③ 送不成有地方落（待补登记队列 + 待删队列 + 回前台补），三个族各自一个键、互不串；
// ④ 「删除」那一枚两半都撤，顺序是"先撤服务器 → 撤成了才清本机"。顺序反了有两种症状：
//    只清本机 = 那一格删不掉；只撤服务器 = 本机留一块没人认领的位图。
// 反向钉四条，每条都对应一个真会写出来的错法。
// 跑法：node docs/工具/验-卡片留档S2.js
const fs = require('fs')
const path = require('path')

const R = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')
const APP = 'miniprogram/app.js'
const CARD_LOG = 'miniprogram/utils/cardLog.js'
const CARD_CLOUD = 'miniprogram/utils/cardCloud.js'
const CARD_QUEUE = 'miniprogram/utils/cardQueue.js'
const ASSET_Q = 'miniprogram/utils/assetQueue.js'
const PURGE = 'miniprogram/utils/assetPurge.js'
const CLOUD_UP = 'miniprogram/utils/cloudUpload.js'
const API = 'miniprogram/utils/api.js'
const INDEX = 'miniprogram/pages/index/index.js'
const DETAIL = 'miniprogram/pages/detail/detail.js'
const SHARE = 'miniprogram/pages/share/share.js'
const BACK = 'backend/app/api/routes/cards.py'

function 判(src) {
  const bad = []
  const ck = (name, ok, got) => {
    console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
    if (!ok) bad.push(name)
  }
  const app = src[APP], log = src[CARD_LOG], cloud = src[CARD_CLOUD]
  const queue = src[CARD_QUEUE], up = src[CLOUD_UP]
  const api = src[API], idx = src[INDEX], det = src[DETAIL], sh = src[SHARE], back = src[BACK]
  const three = idx + det + sh

  // —— ① 判据那一个出处 ——
  ck('首页那一格吃 cardCloud.cellFor', /_cardsOf\(noteId\)\s*\{\s*return cardCloud\.cellFor\(noteId\)/.test(idx))
  ck('详情页那一格吃 cardCloud.cellFor（loadNote 先画本机那份，loadCard 再从服务器补）',
    /detailCards: cardCloud\.cellFor\(note\.id\)/.test(det) && /cardCloud\.refreshOne\(noteId\)/.test(det))
  ck('笔记卡片页那道闸吃 cardCloud.hasCard', /if \(cardCloud\.hasCard\(noteId\)\)/.test(sh))
  ck('三个页面里没有一个还自己 accessSync、或直接吃本机那半本账',
    !/accessSync/.test(three) && !/cardLog\.aliveFor\(/.test(three) && !/cardLog\.forNote\(/.test(three))
  ck('名单从服务器一次读全（首页整表重载时 refresh，翻页不重复打）',
    /cardCloud\.refresh\(\)/.test(idx) && /if \(reset \|\| !cardCloud\.isLoaded\(\)\)/.test(idx))
  ck('读不回来时不许说"没有卡片"：那一份数没读过就是没读过（isLoaded 挡着）',
    /let serverLoaded = false/.test(cloud) && /function isLoaded\(\)/.test(cloud))
  ck('云上那一份画得出来靠的是 cloud:// 直接进 image src（与配图那一路同一个用法）',
    /p: cloud,/.test(cloud) && /const cloud = \(s && s\.cloud_url\)/.test(cloud) && /cloud_url/.test(det))

  // —— ② 出图那一刻真的送 ——
  // 判的是 copyIn 那个 success 块**内部**的顺序：先落本机账、再送云上。
  // 不拿 indexOf 在全文件里比——`_archive(noteId, entry)` 这串在函数定义处就出现一次，
  // 比 copyIn 还早，那样红的是尺子不是代码（10-08 就这么红过一回）。
  const succ = (log.split('success: () => {')[1] || '').split('\n      },')[0]
  ck('本机账落好之后才送（copyIn 那个 success 块里，write(map) 在 _archive 那一趟之前）',
    succ.indexOf('write(map)') >= 0 && succ.indexOf('_archive(noteId, entry)') > succ.indexOf('write(map)'),
    `write@${succ.indexOf('write(map)')} archive@${succ.indexOf('_archive(noteId, entry)')}`)
  ck('那一趟不 await、包在 try 里（留档是附属品，不许把分享带回错误提示）',
    /try \{\s*const r = require\('\.\/cardCloud\.js'\)\.archive\(noteId, entry\)/.test(log)
    && !/await .*cardCloud/.test(log))
  ck('上传拿不到 fileID 就返回 skipped，不抛', /if \(!up \|\| !up\.fileID\) return \{ skipped: true, reason: 'upload' \}/.test(cloud))
  ck('登记失败落待补队列（不是就地忘掉）', /catch \(e\) \{\s*cardQueue\.push\(noteId, item\)/.test(cloud))
  ck('字节这一栏尽力取——它就是"一张卡片到底多少字节"那个实测数的来源',
    /size: _bytes\(entry\.p\)/.test(cloud) && /function _bytes|const _bytes =/.test(cloud))
  ck('origin 靠默认值是 live，补传／重渲那几档必须显式带进来',
    /origin: entry\.origin \|\| 'live'/.test(cloud))

  // —— ③ 三个队列各一个键，回前台都补 ——
  ck('三个队列各一个键，互不串（待补绑 / 待删对象 / 待补登记）',
    /const KEY = 'pendingNoteCards'/.test(queue)
    && /const KEY = 'pendingNoteAssets'/.test(src[ASSET_Q])
    && /const KEY = 'pendingCloudPurge'/.test(src[PURGE]))
  ck('一篇在队列里只留最新那一条（新的顶掉旧的，服务端那条唯一索引才不会被队列顺序决胜）',
    /take\(\)\.filter\(\(x\) => !\(x && x\.noteId === noteId\)\)/.test(queue))
  ck('上限 50、超了丢最旧的并留一句日志', /MAX_QUEUE = 50/.test(queue) && /丢掉最旧的/.test(queue))
  ck('4xx 不再重试、其余留着下次（与待补绑同一条纪律）',
    /code >= 400 && code < 500/.test(queue))
  ck('回前台三族一起补：待补绑、待删对象、待补登记',
    /assetQueue\.flush\(apiModule\)/.test(app) && /cloudUpload\.flushPurge\(\)/.test(app) && /cardCloud\.flush\(\)/.test(app))
  ck('换身份时卡片这一族两个头一起收（队列 + 那份名单），收在 cardCloud.signOut 一个出处',
    /cardCloud\.signOut\(\)/.test(app) && /function signOut\(\)/.test(cloud))
  ck('对象删不成就进待删队列（这一条吃的是已上线那条链，不另写一份）',
    /purge\.push\(ids\)/.test(up))

  // —— ④ 撤掉那一格 ——
  ck('先撤服务器、撤成了才清本机：dropServer 在 forget 之前，forget 在收窗之前',
    (() => {
      const f = (idx.split('onDropCard() {')[1] || '').split('\n  },')[0].replace(/^\s*\/\/.*$/gm, '')
      const a = f.indexOf('cardCloud.dropServer(note.id)'), b = f.indexOf('cardCloud.forget(note.id)'), c = f.indexOf('this._closeTemplate()')
      return a >= 0 && b > a && c > b
    })())
  ck('撤不成时给一句实话（cardDropOffline 上屏，不是静默）',
    /cardDropOffline/.test(idx) && /cardDropOffline: '这会儿连不上服务器，那张卡片还留着'/.test(src['miniprogram/utils/i18n.js']))
  ck('后端那一个撤档口在，且回体只有 file_ids 这一个清单键',
    /@router\.delete\("\/api\/notes\/\{note_id\}\/card"/.test(back) && /return \{"file_ids": ids\}/.test(back))
  ck('客户端那三个口与后端路径一字不差',
    /putNoteCard: \(id, card\) => request\(`\/api\/notes\/\$\{id\}\/card`, 'POST', card\)/.test(api)
    && /getNoteCard: \(id\) => request\(`\/api\/notes\/\$\{id\}\/card`\)/.test(api)
    && /deleteNoteCard: \(id\) => request\(`\/api\/notes\/\$\{id\}\/card`, 'DELETE'\)/.test(api)
    && /getMyCards: \(\) => request\('\/api\/user\/cards'\)/.test(api))
  ck('卡片对象走 cards/ 这一层，且注释里留着那次实测（换前缀必须先量）',
    /const CARD_KIND = 'cards'/.test(cloud) && /APREFIX=cards/.test(cloud) && /status: 0/.test(cloud))
  ck('uploadImage 认这个前缀参数（默认仍是 images，配图那一路不受影响）',
    /async function uploadImage\(tempPath, userId, kind\)/.test(up) && /prefix === 'cards'|kind === 'cards'/.test(up))

  return bad
}

const FILES = [APP, CARD_LOG, CARD_CLOUD, CARD_QUEUE, ASSET_Q, PURGE, CLOUD_UP, API, INDEX, DETAIL, SHARE, BACK,
  'miniprogram/utils/i18n.js']
const src = {}
for (const f of FILES) src[f] = R(f)

console.log('———— 正例：现在这份代码 ————')
const bad = 判(src)

console.log('\n———— 反向①：「删除」那一枚改回只清本机（S2 之前的样子） ————')
const m1 = Object.assign({}, src)
m1[INDEX] = src[INDEX].replace('const dropped = await cardCloud.dropServer(note.id)', 'const dropped = true')
if (m1[INDEX] === src[INDEX]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b1 = 判(m1)

console.log('\n———— 反向②：登记失败就地忘掉，不落待补队列 ————')
const m2 = Object.assign({}, src)
m2[CARD_CLOUD] = src[CARD_CLOUD].replace('      cardQueue.push(noteId, item)\n', '')
if (m2[CARD_CLOUD] === src[CARD_CLOUD]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b2 = 判(m2)

console.log('\n———— 反向③：把卡片换成一个没量过的前缀 misc/ ————')
const m3 = Object.assign({}, src)
m3[CARD_CLOUD] = src[CARD_CLOUD].replace(/const CARD_KIND = 'cards'/, "const CARD_KIND = 'misc'")
const b3 = 判(m3)

console.log('\n———— 反向④：回前台忘了补卡片那一族 ————')
const m4 = Object.assign({}, src)
m4[APP] = src[APP].replace(/cardCloud\.flush\(\)/, 'assetQueue.flush(apiModule)')
if (m4[APP] === src[APP]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b4 = 判(m4)

const 红1 = b1.some((x) => x.includes('先撤服务器'))
const 红2 = b2.some((x) => x.includes('落待补队列'))
const 红3 = b3.some((x) => x.includes('cards/ 这一层'))
const 红4 = b4.some((x) => x.includes('三族一起补'))

console.log(`\n正例 ${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
console.log(`反向①只清本机 ${红1 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向②不落队列 ${红2 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向③没量过的前缀 ${红3 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向④漏补一族 ${红4 ? '红在对的地方' : '没红＝这条判据是假的'}`)
process.exit(bad.length || !红1 || !红2 || !红3 || !红4 ? 1 : 0)
