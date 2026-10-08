// 卡片留档上服务端 · S1 的接线尺子（静态，不打网络）。
//
// S1 只有四件事：一张表、一条迁移、四个口、删除连带。能静态钉住的就是"这四件事在不在
// 同一个口径上"，跑真库的那部分在 backend/tests/test_note_cards.py（21 条）。
//
// 最贵的一条一直是**配额口径**。站长 10-08 定的是"没量到实测之前按 ≤200KB 上界估算入账"（PRD §8.149），
// 10-09 审计把它换成**真实字节**：S2 起每一行登记都带 `file_size`，估算的替身该退场，而那一口
// 当时只 SUM 配图，卡片一个字节都没进账（PRD §8.161）。
// 现在这一把钉的是新口径的四处一致：`assets._sum_bytes` 两张表都算、那个估算常量**不许回来**、
// 测试钉行为不钉常量、方案 §四.4 与 PRD 跟着改。挡人的那道线仍然是云开发 20MB——
// 入账的数与挡人的数永远是两个数，混成一个的那天就是"用户的卡片存不上"的那天。
// 跑法：node docs/工具/验-卡片留档S1.js
const fs = require('fs')
const path = require('path')

const R = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')

const MODEL = 'backend/app/models/note_card.py'
const ASSETS = 'backend/app/api/routes/assets.py'
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
  const m = src[MODEL], assets = src[ASSETS], r = src[ROUTES], main = src[MAIN], notes = src[NOTES]
  const user = src[USER], mig = src[MIG], t = src[TESTS], plan = src[PLAN], prd = src[PRD]

  // —— ① 配额口径：SUM 两张表的**真实字节**（10-09 审计换的，四处一起改）——
  ck('配额 SUM 的是配图 + 卡片两张表的 file_size',
    /func\.sum\(Asset\.file_size\)/.test(assets) && /func\.sum\(NoteCard\.file_size\)/.test(assets)
      && /return int\(q1\.scalar\(\) or 0\) \+ int\(q2\.scalar\(\) or 0\)/.test(assets))
  // 注释里提一嘴"这个数退休了"是有用的，所以钉的是"它不再是一个定义／不再被 import"，
  // 不是"这个字符串不许出现"——后者会把说明性注释也判红，那是尺子挡人。
  // 整行注释先剔掉再找赋值：`# 这里原来有一栏 CARD_ACCOUNT_BYTES = 200 * 1024` 那句是说明，
  // 拿它当"定义又回来了"会把人往回赶（反向④注入的那行不带 #，照样红得住）。
  const m无注 = m.split('\n').filter((x) => !/^\s*#/.test(x)).join('\n')
  ck('那个估算常量已经退休：不许再有定义、测试不许再 import 它',
    !/^\s*CARD_ACCOUNT_BYTES\s*=/m.test(m无注) && !/import[^\n]*CARD_ACCOUNT_BYTES/.test(t))
  ck('测试钉的是行为（登记一张 → 配额涨那么多字节），不是常量等于字面量',
    /def test_卡片字节进配额/.test(t) && /q\(\) - before == 204800/.test(t)
      && !/CARD_ACCOUNT_BYTES == 200/.test(t))
  ck('字节进账、张数不进账，两条口径各有一条用例',
    /def test_张数那一栏不跟着卡片涨/.test(t))
  ck('方案 §四.4 跟着换成真实字节', /真实字节/.test(plan) || /真实 file_size/.test(plan))
  ck('PRD 记了这次改口径（§8.161），估算那段史留在 §8.149 不抹',
    /8\.161/.test(prd) && /8\.149/.test(prd))
  // 挡人的那道线是另一个数：云开发单文件上限 20MB。两个数一旦相等，症状就是"用户的卡片存不上"。
  ck('写口那道线还是 20MB，与入账口径是两个数', /MAX_CARD_UPLOAD_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/.test(r))
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
  // 这三条量的是"回体里那几个键"，不是"那一行字面长什么样"。10-08 给回体加了去重
  // （`"file_ids": list(dict.fromkeys(file_ids))`），钉字面量的那版当场漂红。把行里的键名
  // 读出来再数，值那一侧怎么写都不影响，而"多一个清单键"照样红——判据本身也跟着变强了。
  const 清单键 = (s, 头) => {
    const line = (s.match(new RegExp('return \\{' + 头 + '[^\\n]*')) || [''])[0]
    return (line.match(/"([a-z_]+)"\s*:/g) || [])
      .map((k) => k.match(/"([a-z_]+)"/)[1])
      .filter((k) => /_ids$/.test(k))
  }
  ck('删一篇把卡片地址并进同一个 file_ids', /file_ids\s*\+=\s*\[[\s\S]{0,140}?NoteCard/.test(notes))
  ck('删一篇的回体只有 file_ids 这一个清单键',
    清单键(notes, '"message": "Note deleted"').join() === 'file_ids',
    `读到 [${清单键(notes, '"message": "Note deleted"').join('、')}]`)
  ck('注销同样带走（也是同一个键）',
    /asset_ids\s*\+=\s*\[[\s\S]{0,140}?NoteCard/.test(user)
    && 清单键(user, '"message": "账号已注销"').join() === 'file_ids',
    `读到 [${清单键(user, '"message": "账号已注销"').join('、')}]`)
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
for (const f of [MODEL, ASSETS, ROUTES, MAIN, NOTES, USER, MIG, TESTS, PLAN, PRD]) src[f] = R(f)

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
// 变异注入的是"多一个键"这个形状，不是某一行字面——所以它跟着判据一起换了写法：
// 匹配到那行 return 之后，在收尾的 `}` 前追加一个清单键。
m2[NOTES] = src[NOTES].replace(/return \{"message": "Note deleted", [^\n]*?\}/,
  (s) => s.slice(0, -1) + ', "card_file_ids": card_ids}')
m2[USER] = src[USER].replace(/return \{"message": "账号已注销", [^\n]*?\}/,
  (s) => s.slice(0, -1) + ', "card_file_ids": card_ids}')
if (m2[NOTES] === src[NOTES] || m2[USER] === src[USER]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b2 = 判(m2)

console.log('\n———— 反向钉③：配额改回只 SUM 配图（10-09 之前那个样子） ————')
const m3 = Object.assign({}, src)
m3[ASSETS] = src[ASSETS].replace('    return int(q1.scalar() or 0) + int(q2.scalar() or 0)',
                                '    return int(q1.scalar() or 0)')
if (m3[ASSETS] === src[ASSETS]) { console.log('✗ 变异没打上（锚点漂了）'); process.exit(2) }
const b3 = 判(m3)

console.log('\n———— 反向钉④：把那个估算常量请回来（四处又变成两份真相） ————')
const m4 = Object.assign({}, src)
m4[MODEL] = src[MODEL] + '\nCARD_ACCOUNT_BYTES = 200 * 1024\n'
m4[TESTS] = src[TESTS] + '\nassert CARD_ACCOUNT_BYTES == 200 * 1024\n'
const b4 = 判(m4)

const 红1 = b1.some((x) => x.includes('写口那道线还是 20MB'))
const 红2 = b2.some((x) => x.includes('回体只有 file_ids'))
  && b2.some((x) => x.includes('注销同样带走'))
  && b2.some((x) => x.includes('card_file_ids 这个键'))
const 红3 = b3.some((x) => x.includes('两张表的 file_size'))
const 红4 = b4.some((x) => x.includes('那个估算常量已经退休'))

console.log(`\n正例 ${bad.length ? '红 ' + bad.length + ' 条：' + bad.join('、') : '全绿'}`)
console.log(`反向①拿估算线当闸门 ${红1 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向②另起一个键 ${红2 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向③配额改回只 SUM 配图 ${红3 ? '红在对的地方' : '没红＝这条判据是假的'}`)
console.log(`反向④把估算常量请回来 ${红4 ? '红在对的地方' : '没红＝这条判据是假的'}`)
process.exit(bad.length || !红1 || !红2 || !红3 || !红4 ? 1 : 0)
