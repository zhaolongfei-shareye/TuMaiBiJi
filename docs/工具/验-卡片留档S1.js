// 卡片留档上服务端 · S1 的接线尺子（静态，不打网络）。
//
// S1 只有四件事：一张表、一条迁移、四个口、删除连带。能静态钉住的就是"这四件事在不在
// 同一个口径上"，跑真库的那部分在 backend/tests/test_note_cards.py（21 条）。
//
// 最贵的一条是**配额口径**（站长 10-08 定：一张卡片按 ≤200KB 的上界**入账**，是估算不是
// 实测）。它必须同时出现在四个地方——模型常量、测试、方案 §四.4、PRD §8.149——少一处就是
// 下一个人会改错的地方；而它**绝不许**当写口的拒收线，所以这里还反向钉一条"把 200KB 当闸门"
// 的变异，那条必须红。
// 跑法：node docs/工具/验-卡片留档S1.js
const fs = require('fs')
const path = require('path')

const R = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')

const MODEL = 'backend/app/models/note_card.py'
const ROUTES = 'backend/app/api/routes/cards.py'
const MAIN = 'backend/app/main.py'
const NOTES = 'backend/app/api/routes/notes.py'
const USER = 'backend/app/api/routes/user.py'
const MIG = 'backend/alembic/versions/f2b7d4a8c915_note_cards.py'
const TESTS = 'backend/tests/test_note_cards.py'
const PLAN = 'docs/方案-卡片留档上服务端.md'
const PRD = 'docs/产品需求.md'

function 判(src) {
  const bad = []
  const ck = (name, ok, got) => {
    console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
    if (!ok) bad.push(name)
  }
  const m = src[MODEL], r = src[ROUTES], main = src[MAIN], notes = src[NOTES]
  const user = src[USER], mig = src[MIG], t = src[TESTS], plan = src[PLAN], prd = src[PRD]

  // —— ① 配额口径：200KB 是**入账**上界，四处置必须相等 ——
  ck('模型里那一个源头 = 200 * 1024', /CARD_ACCOUNT_BYTES\s*=\s*200\s*\*\s*1024/.test(m))
  ck('测试钉住了同一个数', /CARD_ACCOUNT_BYTES\s*==\s*200\s*\*\s*1024/.test(t))
  ck('方案 §四.4 写了 ≤200KB 入账', /200KB/.test(plan) && /入账/.test(plan))
  ck('PRD 记了这条口径（§8.149）', /8\.149/.test(prd) && /200KB/.test(prd))
  ck('口径写明"估算、不是实测"', /估算/.test(m) && /不是实测/.test(m))
  // 挡人的那道线是另一个数：云开发单文件上限 20MB。两个数一旦相等，症状就是"用户的卡片存不上"。
  ck('写口那道线是 20MB，不是 200KB', /MAX_CARD_UPLOAD_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/.test(r))
  ck('size 字段吃的是 20MB 那道线', /size:.*le=MAX_CARD_UPLOAD_BYTES/.test(r))
  ck('测试钉住"比 200KB 大的照样登记得进"', /big\s*=\s*300\s*\*\s*1024/.test(t))

  // —— ② 一篇只留一张：界面上的规矩这次落在库上 ——
  ck('模型有那条部分唯一索引（只圈 is_current=1）',
    /ux_note_cards_one_current_per_note/.test(m) && /is_current\s*=\s*1/.test(m))
  ck('迁移里也建了同一条索引（模型有、迁移没有＝升级后的库挡不住）',
    /ux_note_cards_one_current_per_note/.test(mig) && /is_current\s*=\s*1/.test(mig))
  ck('迁移头接在 contact_email 那条后面', /down_revision[^\n]*=\s*['"]c8f3a1d6e470['"]/.test(mig))
  ck('测试用 IntegrityError 亲量这道索引', /pytest\.raises\(IntegrityError\)/.test(t))
  ck('读口不用 .one()（多一行当前就整篇详情页 500）',
    /\.order_by\(NoteCard\.id\.desc\(\)\)\s*\.first\(\)/.test(r) && !/NoteCard[^\n]*\.one\(\)/.test(r))

  // —— ③ 四个口：写 / 读一篇 / 批量读 / 都要鉴权 ——
  ck('POST /api/notes/{note_id}/card', /@router\.post\("\/api\/notes\/\{note_id\}\/card"/.test(r))
  ck('GET  /api/notes/{note_id}/card', /@router\.get\("\/api\/notes\/\{note_id\}\/card"/.test(r))
  ck('GET  /api/user/cards（列表页一次拿全）', /@router\.get\("\/api\/user\/cards"/.test(r))
  const 每个口都挂鉴权 = ['put_note_card', 'read_note_card', 'list_cards'].every((fn) => {
    const i = r.indexOf('def ' + fn)
    return i >= 0 && /get_current_user/.test(r.slice(i, i + 400))
  })
  ck('三个口都吃 get_current_user（少一个就是任何人可读别人的卡片地址）', 每个口都挂鉴权)
  ck('路由挂进 app', /include_router\(cards\.router/.test(main))
  ck('归属越权回 404 不回 403（否则就是试 id 的探测器）',
    /_owned_note_or_404/.test(r) && !/status_code=403/.test(r))

  // —— ④ 删除连带走**同一个** file_ids 键 ——
  // 注：`card_file_ids` 这个词在后端**是允许出现的**，只允许出现在注释里那句"不另起这个键"
  // 的理由里。所以判之前先把整行注释剥掉——不剥的话这条永远红，而红判据看多了，真漏键那天就没人看了。
  const 去注释 = (s) => s.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  ck('删一篇把卡片地址并进同一个 file_ids', /file_ids\s*\+=\s*\[[\s\S]{0,140}?NoteCard/.test(notes))
  ck('删一篇的回体只有 file_ids 这一个清单键',
    /return \{"message": "Note deleted", "file_ids": file_ids\}/.test(notes))
  ck('注销同样带走（也是同一个键）',
    /asset_ids\s*\+=\s*\[[\s\S]{0,140}?NoteCard/.test(user) && /"file_ids": asset_ids/.test(user))
  ck('剥掉注释后，后端代码里没有 card_file_ids 这个键',
    !/card_file_ids/.test(去注释(notes) + 去注释(user) + 去注释(r)))

  // —— ⑤ 模板名不卡白名单：卡了就等于把"卡片模板不走发版"作废 ——
  ck('写口没有拿 tpl 去比名单', !/payload\.tpl\s+in\s/.test(r) && !/TPL_(WHITELIST|IDS)/.test(r))
  ck('测试钉住"下发一个新 id 也登记得进"', /brandNewIdFrom下发/.test(t))
  ck('origin 是闭集且四档齐全（界面对应四句话）',
    ['ORIGIN_LIVE', 'ORIGIN_BACKFILLED', 'ORIGIN_RE_RENDERED', 'ORIGIN_FROM_SHARE_SNAPSHOT']
      .every((k) => m.includes(k)))

  return bad
}

const src = {}
for (const f of [MODEL, ROUTES, MAIN, NOTES, USER, MIG, TESTS, PLAN, PRD]) src[f] = R(f)

console.log('———— 正例：现在这份代码 ————')
const bad = 判(src)

console.log('\n———— 反向钉①：把 200KB 那道估算线当写口拒收线 ————')
const m1 = Object.assign({}, src)
m1[ROUTES] = src[ROUTES].replace(/MAX_CARD_UPLOAD_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/,
  'MAX_CARD_UPLOAD_BYTES = CARD_ACCOUNT_BYTES')
if (m1[ROUTES] === src[ROUTES]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b1 = 判(m1)

console.log('\n———— 反向钉②：删除连带另起一个 card_file_ids 键 ————')
const m2 = Object.assign({}, src)
m2[NOTES] = src[NOTES].replace(/return \{"message": "Note deleted", "file_ids": file_ids\}/,
  'return {"message": "Note deleted", "file_ids": file_ids, "card_file_ids": card_ids}')
if (m2[NOTES] === src[NOTES]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b2 = 判(m2)

console.log('\n———— 反向钉③：只改代码，方案与 PRD 里那句 200KB 撤掉 ————')
const m3 = Object.assign({}, src)
m3[PLAN] = src[PLAN].replace(/200KB/g, '一个还没量的数')
const b3 = 判(m3)

const 红1 = b1.some((x) => x.includes('写口那道线是 20MB'))
const 红2 = b2.some((x) => x.includes('回体只有 file_ids')) && b2.some((x) => x.includes('card_file_ids 这个键'))
const 红3 = b3.some((x) => x.includes('方案 §四.4'))

console.log(`\n正例 ${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
console.log(`反向①拿估算线当闸门 ${红1 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向②另起一个键 ${红2 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向③只改代码不改文档 ${红3 ? '红在对的地方' : '没红＝这条判据是假的'}`)
process.exit(bad.length || !红1 || !红2 || !红3 ? 1 : 0)
