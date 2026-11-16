// Z54（第十轮审计）的守门尺子 —— 盯的是"部署脚本这两刀到底有没有牙"，不是"文件里有没有那行字"。
//
// 为什么单开一把：§15.2 那一格写的是「部署脚本 0 把」——`upload.sh`／`deploy.sh` 是所有部署的
// 前置，而它们自己一条判据都没有。Z54 给它们加的两件事恰好都属于"平时看不出、出事才发现"：
// ① `upload.sh` 在 scp **之前**给现网代码树拍一份快照，作为覆盖的唯一退路；
//    它必须①排在覆盖之前、②排除掉库/凭据/.venv（否则拿到的是撕裂的半份库＋密钥进归档）、
//    ③拍不出来就当场停（此时服务器一个字节都还没动）、④别把盘吃满（只留最近 5 份）。
// ② `deploy.sh` 任何非零退出都要把那条还原命令念出来（用 EXIT trap：全文 4 处 `exit 1`
//    ＋末尾一道 `exit "$RC"`，逐个分支加句子必漏）。
// 外加 §8 那一格四条链路的闸门自检（短信／邮箱／存图／站名第 4 级）：调的是代码里已有的四句闸，
// 不是 .env 键表——那些凭据优先读后台「密钥配置」那张表，只看 .env 会把"库里配好了"念成"没配"。
//
// 假树照 11-16 现网 `/home/ubuntu/wtsj-backend` 现读的那份顶层清单搭（含 app.db 一只 0 字节遗留、
// 顶层 uvicorn.log／worker.log 两只单文件日志、deploy-backup/ 8.7 MB 历史代码 tar、var/mp-assets）。
// 跑法：node docs/工具/验-部署脚本代码回滚点-静态.js
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const BACKEND = path.join(ROOT, 'backend')
const UPLOAD = path.join(BACKEND, 'upload.sh')
const DEPLOY = path.join(BACKEND, 'deploy.sh')
const WORK = '/tmp/z54-ruler'

const bad = []
const ck = (name, ok, got) => {
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : ' → ' + got}`)
  if (!ok) bad.push(name)
}
const read = (p) => fs.readFileSync(p, 'utf8')
const lines = (p) => read(p).split('\n')
const bash = (src) => spawnSync('bash', ['-c', src], { encoding: 'utf8' })

/* ---------- 提取：按标记找边界，不写死行号（行号会随上面加注释漂）---------- */
// upload.sh 里那段远程快照体：`SNAP=$(ssh agentsbin 'set -e` 之后到配对的 `')` 之前。
function remoteSnapshotBody() {
  const ls = lines(UPLOAD)
  const start = ls.findIndex((l) => l.startsWith("SNAP=$(ssh agentsbin 'set -e"))
  if (start < 0) throw new Error('upload.sh 里找不到快照那一句（SNAP=$(ssh agentsbin …）')
  let end = -1
  for (let i = start + 1; i < ls.length; i++) if (ls[i] === "')") { end = i; break }
  if (end < 0) throw new Error('快照那一句没有配对的收尾')
  return {
    body: ls.slice(start + 1, end).join('\n'),
    start,
    scp: ls.findIndex((l) => l.startsWith('scp ')),
    untar: ls.findIndex((l) => l.includes('tar xzf /tmp/tumaibiji-backend.tar.gz')),
  }
}

// deploy.sh §0.5：`CODE_STORE=` 那一行到 `trap on_exit EXIT`。
function rollbackSection() {
  const ls = lines(DEPLOY)
  const start = ls.findIndex((l) => l.startsWith('CODE_STORE='))
  const end = ls.findIndex((l) => l === 'trap on_exit EXIT')
  if (start < 0 || end < 0 || end < start) throw new Error('deploy.sh 里 §0.5 那段边界找不出来')
  return ls.slice(start, end + 1).join('\n')
}

// deploy.sh §8 那段配置自检：往上找最近的 `python <<'PY'`，往下找配对的 `PY`。
function configSelfCheck() {
  const ls = lines(DEPLOY)
  const hit = ls.findIndex((l) => l.includes('四条按配置开关的链路'))
  if (hit < 0) throw new Error('deploy.sh §8 里找不到四条链路那一格')
  let start = -1
  for (let i = hit; i >= 0; i--) if (ls[i] === "python <<'PY'") { start = i; break }
  let end = -1
  for (let i = hit; i < ls.length; i++) if (ls[i] === 'PY') { end = i; break }
  if (start < 0 || end < 0) throw new Error('四条链路那一格不在某段 python heredoc 里')
  return ls.slice(start + 1, end).join('\n')
}

/* ---------- 现网形状的假树 ---------- */
function fakeTree(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
  const mk = (rel, txt = 'x') => {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, txt)
  }
  mk('app/main.py', 'code')
  mk('app/services/sms.py', 'code')
  mk('deploy.sh', 'code')
  mk('worker.py', 'code')
  mk('.venv/bin/python', 'y'.repeat(200))
  mk('wtsj.db', 'DB')
  mk('wtsj.db-wal', 'WAL')
  mk('wtsj.db-shm', 'SHM')
  mk('app.db', '')
  mk('uvicorn.log', 'log')
  mk('worker.log', 'log')
  mk('logs/old.log', 'log')
  mk('.env', 'SECRET=1')
  mk('.env.bak-20261013', 'SECRET=0')
  mk('keys/wechat.pem', 'PEM')
  mk('__pycache__/main.pyc', 'pyc')
  mk('deploy-backup/backend-code-20260922.tar.gz', 'OLD-SNAP')
  mk('ops_backups/sms.py.bak-1115', 'BAK')
  mk('var/mp-assets/a.png', 'ASSET')
}

// 把快照体里那两行服务器路径换成假树，跑一次；返回 {status, stdout, stderr, snap, listing}。
// srcDir 不存在时故意不做假树 ⇒ 跑出来的就是"现网代码树读不出"那一档（第 8 条反向验证）。
function runSnapshot(srcDir, storeDir) {
  const src2 = path.join(WORK, 'run-src')
  fs.rmSync(src2, { recursive: true, force: true })
  if (fs.existsSync(srcDir)) fs.cpSync(srcDir, src2, { recursive: true })
  fs.mkdirSync(storeDir, { recursive: true })
  const script = rs.body
    .replace(/^SRC=.*$/m, `SRC=${src2}`)
    .replace(/^STORE=.*$/m, `STORE=${storeDir}`)
  const r = spawnSync('bash', ['-c', `set -e\n${script}`], { encoding: 'utf8' })
  const snap = (r.stdout || '').trim().split('\n').filter(Boolean).pop() || ''
  const listing = snap && fs.existsSync(snap)
    ? spawnSync('tar', ['tzf', snap], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
    : []
  return { ...r, snap, listing }
}
const archivesIn = (dir) => fs.readdirSync(dir).filter((f) => /^code-.*\.tar\.gz$/.test(f))

console.log('=== Z54：部署脚本的代码回滚点与四条链路自检 ===\n')

/* 1. 语法 */
for (const f of ['upload.sh', 'deploy.sh']) {
  const r = spawnSync('bash', ['-n', path.join(BACKEND, f)], { encoding: 'utf8' })
  ck(`bash -n ${f}`, r.status === 0, r.stderr.trim())
}

/* 2~3. 快照真跑 */
const rs = remoteSnapshotBody()
const SRC = path.join(WORK, 'src')
fakeTree(SRC)
const STORE = path.join(WORK, 'store')
fs.rmSync(STORE, { recursive: true, force: true })
const r2 = runSnapshot(SRC, STORE)
ck('快照跑成功并把归档路径打到 stdout', r2.status === 0 && /\.tar\.gz$/.test(r2.snap),
  `退出 ${r2.status} ${r2.snap || (r2.stderr || '').trim()}`)

// 排除名逐族点名（tar 默认非锚定匹配，判的是"路径里出现即命中"）。
// 假树故意不放名字里含 "log" 的代码文件（现网 find 现读：maxdepth 2 内零命中），
// 否则这一族会变成永远命中不了的死判据。
const LEAK = [
  ['.venv', /\.venv/],
  ['SQLite 库', /\.db($|-wal$|-shm$)/],
  ['日志', /(^|\/)logs?(\/|$)|\.log$/],
  ['凭据 .env', /\.env($|\.)/],
  ['keys', /(^|\/)keys\//],
  ['字节码', /__pycache__|\.pyc$/],
  ['历史快照 deploy-backup', /deploy-backup/],
  ['刀留档 ops_backups', /ops_backups/],
  ['数据 var', /(^|\/)var\//],
]
const leaks = LEAK.filter(([, re]) => r2.listing.some((n) => re.test(n))).map(([n]) => n)
ck('归档里没有库／凭据／.venv／日志／上一份快照', r2.listing.length > 0 && leaks.length === 0,
  r2.listing.length ? `${r2.listing.length} 条${leaks.length ? '，漏：' + leaks.join('、') : ''}` : '归档读不出')
const MUST = ['app/main.py', 'app/services/sms.py', 'worker.py', 'deploy.sh']
const gone = MUST.filter((f) => !r2.listing.some((n) => n.endsWith(f)))
ck('归档里代码本体齐全（缺了退不回）', gone.length === 0, gone.length ? '缺 ' + gone.join('、') : `${MUST.length} 个关键路径都在`)

/* 4~6. 修剪：留最新 5 份，且"最新"按 mtime 不是字典序 */
const STORE4 = path.join(WORK, 'store-prune')
fs.rmSync(STORE4, { recursive: true, force: true })
fs.mkdirSync(STORE4, { recursive: true })
const mtimeDayOf = {}          // 文件名 → 那文件的 mtime 是几号
for (let d = 1; d <= 8; d++) {
  // 名字与 mtime 故意反着编：10 月 8 号那一份的文件名是 …10-01…
  // ⇒ 只按字典序留 5 份的实现会留下 …10-01..04 之外的（名字 05~08），在这一格必红。
  const name = `code-202611${String(9 - d).padStart(2, '0')}-000000.tar.gz`
  const p = path.join(STORE4, name)
  fs.writeFileSync(p, 'old')
  const t = new Date(2026, 9, d, 0, 0, 0)
  fs.utimesSync(p, t, t)
  mtimeDayOf[name] = d
}
const r4 = runSnapshot(SRC, STORE4)
const left = archivesIn(STORE4)
const keptOld = left.filter((f) => f !== path.basename(r4.snap)).sort()
const newest4 = Object.entries(mtimeDayOf).filter(([, d]) => d >= 5).map(([n]) => n).sort()
ck('只留最近 5 份（8 份旧件＋这一趟 = 9 → 5）', r4.status === 0 && left.length === 5, `剩 ${left.length} 份`)
ck('留的是 mtime 最新的 4 份旧件（按字典序留的实现在这一格红）',
  keptOld.length === 4 && JSON.stringify(keptOld) === JSON.stringify(newest4),
  `留了 ${keptOld.map((f) => `${f.slice(5, 15)}＝mtime 10-${String(mtimeDayOf[f]).padStart(2, '0')}`).join('、')}`)
const ptr = path.join(STORE4, 'code-latest')
ck('code-latest 指向这一趟新做的那份', fs.existsSync(ptr) && read(ptr).trim() === r4.snap,
  fs.existsSync(ptr) ? read(ptr).trim() : '没有 code-latest')
ck('code-latest 本身不计进 5 份上限', fs.existsSync(ptr) && !left.includes('code-latest'))

/* 7. 首次部署那一趟：store 里只有 backup.sh 的库快照，一份 code-* 都没有 */
const STORE7 = path.join(WORK, 'store-first')
fs.rmSync(STORE7, { recursive: true, force: true })
fs.mkdirSync(STORE7, { recursive: true })
fs.writeFileSync(path.join(STORE7, 'wtsj-backup-20261101.sql.gz'), 'DB-BACKUP')
const r7 = runSnapshot(SRC, STORE7)
ck('store 里没有旧代码快照时照样成功（首次部署）', r7.status === 0 && archivesIn(STORE7).length === 1,
  `退出 ${r7.status}${(r7.stderr || '').trim() ? ' ' + r7.stderr.trim() : ''}`)

/* 8. 反向验证：源码树不存在 ⇒ 必须非零，否则"拍不出来就当场停"是假话 */
const r8 = runSnapshot(path.join(WORK, 'nope-not-here'), path.join(WORK, 'store-missing-src'))
ck('源码树读不出时快照当场失败（upload.sh 的 set -e 停在 scp 之前）', r8.status !== 0, `退出 ${r8.status}`)
ck('upload.sh 开着 set -e', /^set -e$/m.test(read(UPLOAD)))

/* 9. 顺序：快照必须在 scp 与服务器解压之前 */
ck('快照排在 scp 与服务器解压之前', rs.start >= 0 && rs.start < rs.scp && rs.scp < rs.untar,
  `快照 ${rs.start + 1} 行 / scp ${rs.scp + 1} 行 / 解压 ${rs.untar + 1} 行`)

/* 10~14. deploy.sh §0.5 真跑 */
const sec = rollbackSection()
const prelude = 'PROJECT_DIR=/home/ubuntu/wtsj-backend\nUNITS=(wtsj-api wtsj-worker)\n'
const runSec = (store, tail) => bash(`${prelude}${sec.replace(/^CODE_STORE=.*$/m, `CODE_STORE=${store}`)}\n${tail}`)
const DS = path.join(WORK, 'dstore')
fs.rmSync(DS, { recursive: true, force: true }); fs.mkdirSync(DS, { recursive: true })
const snapD = path.join(DS, 'code-20261116-000000.tar.gz')
fs.writeFileSync(snapD, 'snap'); fs.writeFileSync(path.join(DS, 'code-latest'), snapD + '\n')
const DE = path.join(WORK, 'dstore-empty')
fs.rmSync(DE, { recursive: true, force: true }); fs.mkdirSync(DE, { recursive: true })

const o10 = runSec(DS, 'echo MARKER')
ck('有快照时开头念出那份路径', o10.stdout.includes('代码回滚点：') && o10.stdout.includes(snapD) && o10.stdout.includes('MARKER'),
  o10.stdout.split('\n').filter(Boolean)[0])
const o11 = runSec(DE, 'echo MARKER')
ck('没快照时念警告但不判红', o11.stdout.includes('没有可用的代码回滚点') && !o11.stdout.includes('✗') && o11.stdout.includes('MARKER'),
  o11.stdout.split('\n').filter(Boolean)[0])
const f12 = runSec(DS, 'exit 1')
ck('非零退出打出那条还原命令（tar xzf ＋两个 unit）',
  f12.status === 1 && f12.stdout.includes(`tar xzf ${snapD}`) && f12.stdout.includes('wtsj-api wtsj-worker'),
  `退出 ${f12.status}`)
ck('还原命令仍带"退不了库"那一句', f12.stdout.includes('退不了数据库') && f12.stdout.includes('alembic'))
const f13 = runSec(DE, 'exit 1')
ck('没快照又失败时直说没有快照可退', f13.status === 1 && f13.stdout.includes('没有代码快照可退'), `退出 ${f13.status}`)
const o14 = runSec(DS, 'exit 0')
ck('成功那一趟不念还原命令', o14.status === 0 && !o14.stdout.includes('tar xzf'), `退出 ${o14.status}`)
ck('§0.5 用 EXIT trap（不是逐个失败分支加句子）', /trap on_exit EXIT/.test(sec) && /local code=\$\?/.test(sec))

/* 15~17. §8 四条链路闸门自检：用仓库那份 venv 真跑 */
const venv = path.join(BACKEND, '.venv', 'bin', 'python')
const py = fs.existsSync(venv) ? venv : 'python3'
const selfCheckSrc = configSelfCheck()
// 与 deploy.sh 同一形状（heredoc ⇒ 代码走 stdin、cwd 决定 `import app` 成不成立），
// 落成 .py 文件跑会把 sys.path[0] 变成 /tmp，读到的是"没有 app 模块"那种假红。
const r15 = spawnSync(py, ['-'], {
  cwd: BACKEND, encoding: 'utf8', input: selfCheckSrc,
  env: { ...process.env, NO_PROXY: '', no_proxy: '' },   // 本机 python 探针一律抹掉代理白名单
})
const out15 = (r15.stdout || '') + (r15.stderr || '')
const FAM = ['短信验证码登录', '邮箱验证码发信', '外链贴图存云开发', '来源站名第 4 级']
const missFam = FAM.filter((n) => !out15.includes(n))
ck(`§8 四条链路真跑通（${path.basename(py)}）`, r15.status === 0 && missFam.length === 0,
  `退出 ${r15.status}${missFam.length ? '，缺：' + missFam.join('、') : ''}${/Traceback/.test(out15) ? '，有 traceback' : ''}`)
ck('§8 那一格调的是代码里那四句闸，不是 .env 键表',
  /_sms_ready\(/.test(selfCheckSrc) && /_email_ready\(/.test(selfCheckSrc) && /channel_ready\(/.test(selfCheckSrc) && /site_channel_ready\(/.test(selfCheckSrc))
ck('§8 那一格不打印任何凭据值', !/print\([^)]*(SMS_|EMAIL_|IMAGE_STORE_|SITE_NAME_)\w*(VALUE|KEY|SECRET|TOKEN|PASSWORD)/.test(selfCheckSrc))

/* 18. 尺子的牙指向实现：那四句闸必须还在代码里 */
for (const [f, re, name] of [
  ['app/services/sms.py', /def _sms_ready/, 'sms._sms_ready'],
  ['app/services/email.py', /def _email_ready/, 'email._email_ready'],
  ['app/services/note_images.py', /def channel_ready/, 'note_images.channel_ready'],
  ['app/services/llm.py', /async def site_channel_ready/, 'llm.site_channel_ready'],
]) {
  const p = path.join(BACKEND, f)
  ck(`${name} 仍在代码里`, fs.existsSync(p) && re.test(read(p)), fs.existsSync(p) ? '' : '文件不在')
}

/* 19. upload.sh 尾巴上那两句实话要在（退库退不了、新增文件删不掉） */
const up = read(UPLOAD)
ck('upload.sh 打完快照就念还原命令与两条限制',
  up.includes('tar xzf $SNAP') && up.includes('退不了数据库') && up.includes('新增的文件'))

console.log('')
console.log(bad.length ? `=== 红 ${bad.length} 条 ===\n${bad.map((b) => '  · ' + b).join('\n')}` : '=== 全绿 ===')
process.exit(bad.length ? 1 : 0)
