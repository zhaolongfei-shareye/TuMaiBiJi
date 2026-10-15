// Tips 搬后台这一刀的形状判据（静态那一层）。站长 10-15 原话「Tips 改为后台配置」。
//
// 这一把只判"两份实现有没有各写一套规矩"，不判通路通不通——通路那两层在：
// `验-Tips下发收得进.js`（客户端读法与兜底顺序，替身）与 `验-Tips现网收到-真跑.js`
// （模拟器里读现网真实回体，中↔EN 两门）。分层的理由与卡片模板那条一样：
// 服务端放行 ≠ 客户端收得进，两头各自钉死才算通路钉死。
// 本文件末尾第 ⑦ 节是第三个问题：**回体多一个键，老那一份包会不会出事**——那是现网真实用户，
// 不是新包，所以那一条拿 `02ef33b` 那份真代码跑，不许靠"老包不读这个口"这种推理。
//
// 跑法：NODE_PATH=$HOME/.mpauto/node_modules node docs/工具/验-Tips后台下发.js
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const NC = (s) => s.replace(/\s+/g, '')

const bad = []
let n = 0
const ck = (name, ok, got) => {
  n++
  console.log(`${ok ? '✓' : '✗'} ${name}${got === undefined || got === '' ? '' : `　→ ${got}`}`)
  if (!ok) bad.push(name)
}

const MODEL = read('backend/app/models/mp_asset.py')
const SVC = read('backend/app/services/mp_assets.py')
const ROUTE = read('backend/app/api/routes/admin_ops.py')
const PAGE = read('backend/app/api/routes/ops_page.py')
const MIG = fs.readdirSync(path.join(ROOT, 'backend/alembic/versions'))
  .find((f) => f.includes('mp_settings_text_value'))
const ASSETS = read('miniprogram/utils/mpAssets.js')
const CREATE = read('miniprogram/pages/create/create.js')

// ---------------- ① 两个 kind 闭集必须真的分开 ----------------
ck('模型里文案栏是独立闭集（TEXT_KINDS），图片栏那个 KINDS 一个字都没加',
  /TEXT_KINDS\s*=\s*\(\s*KIND_TIPS\s*,?\s*\)/.test(MODEL)
    && /KINDS\s*=\s*\(\s*KIND_HOME_BG\s*,?\s*\)/.test(MODEL),
  '两份闭集')
ck('KIND_LABELS 两栏都有中文名（页面标题只从这一处读，不许网页自己写一份）',
  /KIND_LABELS\s*=\s*\{[^}]*KIND_HOME_BG[^}]*KIND_TIPS/s.test(MODEL))
ck('mp_settings 多的是 text_value 一栏，而且是 JSON 不是拼串',
  /text_value\s*=\s*Column\(JSON/.test(MODEL) && /from sqlalchemy import[^)]*JSON/.test(MODEL))
ck('文案写口只认文案栏、图片写口只认图片栏（两道门各自关，不是一把钥匙开两扇门）',
  /def check_text_kind[\s\S]*?if kind not in TEXT_KINDS/.test(SVC)
    && /def check_kind[\s\S]*?if kind not in KINDS/.test(SVC))

// ---------------- ② 迁移：加栏＋那一行空值都在这份文件里 ----------------
ck('有一份专门加 text_value 的迁移（不是手改库）', !!MIG, MIG || '(找不到那个文件)')
if (MIG) {
  const m = read(`backend/alembic/versions/${MIG}`)
  ck('迁移真的 add_column 那一栏，并给 tips 显式插一行空值（A1 那句"空要写出来"）',
    /add_column\(\s*'mp_settings',\s*sa\.Column\(\s*'text_value'/.test(m)
      && /values\s*\('tips',\s*NULL,\s*NULL\)/.test(m))
  ck('downgrade 先删那一行再走 batch 删栏（SQLite 上 DROP COLUMN 只能重建表）',
    /delete from mp_settings where kind = 'tips'/.test(m)
      && /batch_alter_table\('mp_settings'\)/.test(m) && /drop_column\('text_value'\)/.test(m))
  ck('新迁移接在运营图那份之后，不是另起一条链',
    /down_revision[^\n]*= 'd8c4a2f6b913'/.test(m))
}

// ---------------- ③ 整份退回，不收半份 ----------------
ck('校验句数与单句字数上限，且两处都读那两枚常量（不在别处再写一遍数字）',
  /MAX_TIPS_ITEMS\s*=\s*(\d+)/.test(SVC) && /MAX_TIP_CHARS\s*=\s*(\d+)/.test(SVC)
    && (NC(SVC).match(/MAX_TIPS_ITEMS/g) || []).length >= 2
    && (NC(SVC).match(/MAX_TIP_CHARS/g) || []).length >= 2)
ck('两份语言都要给，缺一整份退回（切过去读到空数组＝那一行整条消失）',
  /TIP_LANGS\s*=\s*\(\s*"zh",\s*"en"\s*\)/.test(SVC)
    && /for lang in TIP_LANGS/.test(SVC))
ck('set_text 把 asset_id 一起写成 None（"两栏都填一半"在库里无法存在）',
  /def set_text[\s\S]*?row\.asset_id = None/.test(SVC))
// Python 的三引号文档串整段剥掉再判：这条钉的是"声明里不收形状"，
// 而上一版把它打在原文上，结果被我自己那句 docstring（里面就写着 `list[str]`）判红——
// 判据若连注释一起扫，写的就是"谁哪天解释一下这件事，这条就红"的假尺子。
const pyCode = (s) => s.replace(/"""[\s\S]*?"""/g, '')
ck('路由不再自己声明句子形状（形状唯一出处是服务层）',
  /class TextIn\(BaseModel\)[\s\S]{0,40}value: dict \| None = None/.test(pyCode(ROUTE))
    && !/list\[str\]/.test(pyCode(ROUTE)))

// ---------------- ④ 回体形状：老包读了不会动 ----------------
ck('下发把图片栏与文案栏一起遍历（少一边＝那一边永远拉不到）',
  /for kind in KINDS/.test(SVC) && /for kind in TEXT_KINDS/.test(SVC))
ck('冻结闸打开时两边一律回空（提审期挡的是整条运营改动，不只挡图）',
  /MP_ASSETS_FREEZE[\s\S]{0,160}?for kind in \(\*KINDS, \*TEXT_KINDS\)/.test(SVC))
ck('客户端判重用 updated_at、落账只落 zh/en/updatedAt（没有 content_hash 那一格，也不许自己造一份）',
  /cached\.updatedAt === entry\.updated_at/.test(ASSETS)
    && /wx\.setStorageSync\(TEXT_KEY, \{ zh: entry\.zh, en: entry\.en, updatedAt: entry\.updated_at \}\)/.test(ASSETS))
ck('老包那条"没 content_hash 就 continue"仍在（这一句是兼容性本身，删了线上包就会拿文案当图下载）',
  /if \(!entry \|\| !entry\.content_hash\) continue/.test(ASSETS))

// ---------------- ⑤ 客户端读法：兜底顺序不许倒 ----------------
ck('mpAssets 把文案单独一条分支落账，不挤进图片那个 kind 循环',
  /function _saveTexts/.test(ASSETS) && /_saveTexts\(config\)/.test(ASSETS))
ck('服务端回 null（停用）时把本机账一起撤掉——只回 null 不撤账，这台机永远显示旧那份',
  /function _saveTexts[\s\S]*?removeStorageSync\(TEXT_KEY\)/.test(ASSETS))
ck('serverTips 认得"数组是空也算没有"（空数组会让那一行整条消失）',
  /function serverTips[\s\S]*?Array\.isArray\(arr\) && arr\.length/.test(ASSETS))
ck('pull / serverBgPath / serverTips 三个都出了口',
  /module\.exports = \{ pull, serverBgPath, serverTips \}/.test(ASSETS))
ck('tipsFor 是「下发优先、包里兜底」，顺序不许反过来写',
  /const remote = mpAssets\.serverTips\(lang\)[\s\S]*?const arr = remote \|\| t\('tips', lang\)/.test(CREATE))
// 反向那一条是真会红的：把上一句的顺序写反（`t('tips', lang) || remote`），后台就永远改不动屏上那行字。
ck('反向：不许拿 i18n 当第一选择（那样后台怎么发都不生效，而且一句错都不报）',
  !NC(CREATE).includes("constarr=t('tips',lang)||remote"))
ck('create.js 真的 require 了 mpAssets（不 require 上面那一句是死代码）',
  /require\('\.\.\/\.\.\/utils\/mpAssets\.js'\)/.test(CREATE))

// ---------------- ⑥ 后台那一页 ----------------
ck('页面用 textarea 编文案、走的是那个新口',
  /createElement\('textarea'\)/.test(PAGE) && /api\/admin\/mp\/texts\//.test(PAGE))
ck('页面渲染真的把文案那一组挂上去了（后端全对而 render 少一行，屏上仍是包里那六句、零报错）',
  /state\.texts/.test(PAGE) && /textCardFor/.test(PAGE))
ck('文案上限从回体读，不在 HTML 里再写一份数字',
  /t\.max_items/.test(PAGE) && /t\.max_chars/.test(PAGE))
ck('这一页仍然只用 textContent / .value，没有开拼 HTML 那扇门',
  !NC(PAGE.split('_PAGE', 2)[1]).includes('innerHTML')
    && !NC(PAGE.split('_PAGE', 2)[1]).includes('document.write'))

// ---------------- ⑦ 老那一份包，拿新回体真跑一遍 ----------------
// 这一节是 10-15 部署当天被现网日志逼出来的：我先前说"线上那个包不读 /api/mp/config，所以多一个键
// 碰不到它"，而 nginx 访问日志里有 32 条**不是 devtools** 的调用（UA 是 MicroMessenger/8.0.79，
// referrer `servicewechat.com/wx4416…/9/page-frame.html`，安卓与 iPhone 都有，来自多个公网 IP）
// ⇒ 真实客户端确实在打这个口，那个键它们收得到。包是 `cli upload` 从工作树打的、不是从 commit 打的，
// 所以"线上那份代码长什么样"git 里没法完全还原；这里取的是能拿到的最近一份实物——`02ef33b`
// （mpAssets.js 第一次进仓库，提交话写明「送审那个包的补记回滚点」），把新回体喂给它跑。
// 跑的是那份真代码本身，不是我重抄一遍的那三行。
const { execSync } = require('child_process')
const os = require('os')
let OLD = ''
try {
  OLD = execSync('git show 02ef33b:miniprogram/utils/mpAssets.js', { cwd: ROOT, encoding: 'utf8' })
} catch (e) {
  console.error(`✗ 取不到 02ef33b 那份 mpAssets.js：${e.message}`)
}
ck('老那一份取得出来，且它确实【不认识】文案（没有 serverTips、没出这个口）',
  OLD.includes('if (!entry || !entry.content_hash) continue')
    && !OLD.includes('serverTips')
    && /module\.exports = \{ pull, serverBgPath \}/.test(OLD))

// 形状照现网回体（服务端那份由本文件 ③ 节钉着，两处合起来才是"喂进去的是真形状"）。
const NEW_CFG = {
  home_bg: { url: '/api/mp/a/tk-probe', content_hash: 'deadbeef', updated_at: '2026-10-12T16:04:20Z' },
  tips: { zh: ['探针第一句（现网）', '探针第二句（现网）'], en: ['probe line one', 'probe line two'],
    updated_at: '2026-10-15T05:18:52Z' },
}

;(async () => {
  const scratch = path.join(os.tmpdir(), `old-mpassets-${process.pid}`)
  fs.mkdirSync(scratch, { recursive: true })
  // 那份老代码里 `require('./api.js')` 是按它自己那层目录解析的，这里就地给一个替身。
  fs.writeFileSync(path.join(scratch, 'api.js'),
    'module.exports = { request: async () => global.__CFG }\n')
  const oldFile = path.join(scratch, 'mpAssets.js')
  fs.writeFileSync(oldFile, OLD)

  const runOld = async (cfg) => {
    const store = {}
    const urls = []
    let threw = null
    global.__CFG = cfg
    global.wx = {
      env: { USER_DATA_PATH: '/u' },
      getStorageSync: (k) => (store[k] === undefined ? '' : store[k]),
      setStorageSync: (k, v) => { store[k] = v },
      removeStorageSync: (k) => { delete store[k] },
      getFileSystemManager: () => ({
        accessSync() {}, mkdirSync() {}, unlinkSync() {},
        saveFile: (o) => o.success && o.success({ savedFilePath: '/u/x' }),
      }),
      downloadFile: (o) => {
        urls.push(o.url)
        // 老那份把 url 直接拼在域名后面（`${API_BASE}${url}`），所以文案那条（没有 url）
        // 拼出来是一个尾巴写着 undefined 的假地址。替身照现实判它失败，不许让它"成功"。
        const bogus = typeof o.url !== 'string' || !o.url.length || /undefined|null/.test(o.url)
        if (bogus) { o.fail && o.fail({ errMsg: `downloadFile:bad url ${o.url}` }); return }
        o.success && o.success({ statusCode: 200, tempFilePath: '/tmp/t' })
      },
    }
    const warns = []
    const w = console.warn
    console.warn = (...a) => { warns.push(a.map(String).join(' ')) }
    try {
      delete require.cache[oldFile]
      const mod = require(oldFile)
      await mod.pull()
    } catch (e) {
      threw = e
    }
    console.warn = w
    try { fs.rmSync(scratch, { recursive: true, force: true }) } catch (_) {}
    return { store, urls, threw, warns }
  }

  const r1 = await runOld(NEW_CFG)
  ck('老那份收到新回体不抛异常（它要是崩了，现网那些设备上的首屏就白一块）',
    r1.threw === null, r1.threw && String(r1.threw.message || r1.threw))
  ck('老那份【跳过】了文案那一条：账上只多一条图的，没有文案键',
    Object.keys(r1.store).join() === 'MP_ASSET_KEY_home_bg', `账上：${JSON.stringify(Object.keys(r1.store))}`)
  ck('图那一条照旧走通（多出来的键没把已经在用的那条带歪）',
    r1.urls.length === 1 && r1.urls[0].endsWith('/api/mp/a/tk-probe'), JSON.stringify(r1.urls))

  // 反向那一条：把闸门那句抽掉才看得见它真的在起作用——给文案也配上一枚 content_hash，
  // 老那份就会把它当一张图去下载（url 是 undefined ⇒ 我的替身按失败收），仍然不崩、只是多一句 warn。
  const r2 = await runOld(Object.assign({}, NEW_CFG, {
    tips: Object.assign({}, NEW_CFG.tips, { content_hash: 'if-server-ever-sends-this' }),
  }))
  ck('反向：闸门就是 `content_hash` 那一句，不是键名白名单（配上哈希它真会去下载文案那条）',
    r2.urls.length === 2 && /undefined/.test(String(r2.urls[1])), JSON.stringify(r2.urls))
  ck('反向那一条也只是不出声地跳过：文案那份不会被当成图存进账',
    Object.keys(r2.store).join() === 'MP_ASSET_KEY_home_bg', `账上：${JSON.stringify(Object.keys(r2.store))}`)
  ck('两条一起：现网用户那侧最坏的读法也就是"这一栏没生效"，不是崩',
    r2.threw === null, r2.threw && String(r2.threw.message || r2.threw))

  console.log(`\nTips 后台下发（静态）：通过 ${n - bad.length} / ${n}`)
  if (bad.length) {
    bad.forEach((b) => console.log('  ✗ ' + b))
    console.log('')
    process.exit(1)
  }
})()
