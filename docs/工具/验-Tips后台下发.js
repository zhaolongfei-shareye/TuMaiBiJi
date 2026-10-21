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
ck('两份闭集真的分开：文案那一栏里不许出现图片 kind，图片那一栏里不许出现任何文案 kind',
  // 10-21 文案栏合法地有了第二栏（关于那一段），所以原来那句"TEXT_KINDS 里只有 KIND_TIPS"过期了。
  // 守的还是同一件事：两个闭集不许互相串——串进去不报错，只会让后台画出一格点得动、
  // 存进库、屏上永远读不到的口子（模型那段注释写的就是这个坏法）。
  /TEXT_KINDS\s*=\s*\(\s*KIND_TIPS\s*,\s*KIND_ABOUT_INTRO\s*\)/.test(MODEL)
    // 10-18 图片栏合法地加了第二栏（官方那一篇的配图），所以原来那句"图片栏一个字都没加"过期了。
    // 这一条真正要守的是**别把文案混进图片栏**——混进去不会报错，只会让后台画出一格
    // "给一句话上传一张 JPEG"的口子，点下去存进库而屏上永远读不到（模型里那段注释就是这个）。
    && /KINDS\s*=\s*\(\s*KIND_HOME_BG\s*,\s*KIND_PRESET_NOTE_IMAGE\s*\)/.test(MODEL)
    // 锚点要认行首：`KINDS` 是 `TEXT_KINDS`／`NOTE_KINDS` 的后缀，不带 `^` 会把那两栏自己也扫进来，
    // 于是一条写对了的负向判据恒红（10-18 这条就是这么红的）。
    && !/^KINDS\s*=\s*\([^)]*(KIND_TIPS|KIND_ABOUT_INTRO)/m.test(MODEL),
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
// 这条是 10-15 浏览器实测撞出来的真缺陷钉成的判据：上限当时定 40，而**自家包里的英文文案有 43 字**，
// 等于他打开后台想原样填回自己现在那六句，会被自家闸门挡在门外（还是整份退回、零提示的那种）。
// 上限与包内文案分属两个仓库文件，谁改了另一边不知道就是这条要红的时候。
const CAP = Number(/MAX_TIP_CHARS\s*=\s*(\d+)/.exec(SVC)[1])
const ITEMS = Number(/MAX_TIPS_ITEMS\s*=\s*(\d+)/.exec(SVC)[1])
const I18N_T = require('../../miniprogram/utils/i18n.js')
const PACK = { zh: I18N_T.t('tips', 'zh'), en: I18N_T.t('tips', 'en') }
ck(`包里那六句（中英两份）逐句都放得进上限 ${CAP} 字（改短文案或抬上限都要看这条，别让它再倒挂）`,
  CAP >= Math.max(...PACK.zh.concat(PACK.en).map((s) => s.length)),
  `中文最长 ${Math.max(...PACK.zh.map((s) => s.length))}／英文最长 ${Math.max(...PACK.en.map((s) => s.length))}｜上限 ${CAP}`)
ck('包里那六句的句数也放得进句数上限（后台一次发一份，条数不能超）',
  PACK.zh.length <= ITEMS && PACK.en.length <= ITEMS,
  `zh ${PACK.zh.length} 句／en ${PACK.en.length} 句｜上限 ${ITEMS}`)
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
  // ⚠ 10-21 键名按 kind 拼（两栏文案共用同一段落账代码），所以那句 `setStorageSync(TEXT_KEY, …)`
  //   换成了 `setStorageSync(key, …)`。守的两件事一条没减：判重只看服务端那个时间戳、账里没有哈希格。
  /cached\.updatedAt === entry\.updated_at/.test(ASSETS)
    && /wx\.setStorageSync\(key, \{ zh: entry\.zh, en: entry\.en, updatedAt: entry\.updated_at \}\)/.test(ASSETS)
    && !/MP_TEXT_KEY_\$\{kind\}.*contentHash/.test(ASSETS))
ck('老包那条"没 content_hash 就不下载"仍在（这一句是兼容性本身，删了线上包就会拿文案当图下载）',
  // 10-18 这一句从一行 `continue` 长成了一段（服务端回 null 时要给官方那张撤账），
  // 守的还是同一件事：**没有 content_hash 的那一条绝不允许走到 `_download`**。
  // 所以判的是"在这个 if 的块里、在 _download 之前先 continue"，不是那句字面还在。
  /if \(!entry \|\| !entry\.content_hash\) \{[\s\S]*?\n\s*continue\s*\n[\s\S]*?_download\(kind, entry\.url\)/.test(ASSETS))

// ---------------- ⑤ 客户端读法：兜底顺序不许倒 ----------------
ck('mpAssets 把文案单独一条分支落账，不挤进图片那个 kind 循环',
  /function _saveTexts/.test(ASSETS) && /_saveTexts\(config\)/.test(ASSETS))
ck('服务端回 null（停用）时把本机账一起撤掉——只回 null 不撤账，这台机永远显示旧那份',
  // 撤的是"这一栏自己那把键"，不是全部文案键：一栏停用不许把另一栏的账一起清掉。
  /function _saveTexts[\s\S]*?removeStorageSync\(key\)/.test(ASSETS)
    && /TEXT_KINDS\.forEach/.test(ASSETS))
ck('serverTips 认得"数组是空也算没有"（空数组会让那一行整条消失）',
  /function serverTips[\s\S]*?Array\.isArray\(arr\) && arr\.length/.test(ASSETS))
ck('pull / serverBgPath / serverPresetImage / serverTips / serverIntro / introText 六个都出了口',
  /module\.exports = \{ pull, serverBgPath, serverPresetImage, serverTips, serverIntro, introText \}/.test(ASSETS))
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


// ---------------- ⑧ 第二格文案栏：关于那一段介绍（站长 10-21「放在后台配置」） ----------------
ck('模型里注册了 about_intro：闭集、界面名、停用话术三处一起有（少一处就是后台画得出、屏上读不到）',
  /KIND_ABOUT_INTRO\s*=\s*"about_intro"/.test(MODEL)
    && /KIND_LABELS[\s\S]*?KIND_ABOUT_INTRO: "关于那一段介绍"/.test(MODEL)
    && /KIND_EMPTY_TEXTS[\s\S]*?KIND_ABOUT_INTRO: "关于那一屏用包里那段介绍"/.test(MODEL))
ck('服务端形状按栏分：TEXT_SPECS 一栏一条，整段那格是 paragraph 不是句子列表',
  /TEXT_SPECS\s*=\s*\{[\s\S]*?KIND_TIPS:\s*\{\s*"shape":\s*"lines"/.test(SVC)
    && /KIND_ABOUT_INTRO:\s*\{\s*"shape":\s*"paragraph"/.test(SVC)
    && /def clean_text\(kind: str, value\)/.test(SVC) && /clean_text\(kind, value\)/.test(SVC))
ck('两栏的上限各归各：整段那格不许共用 Tips 那个 48 字（共用＝他填自家那段被自家闸门挡在门外）',
  /MAX_INTRO_CHARS\s*=\s*\d+/.test(SVC)
    && Number((SVC.match(/MAX_INTRO_CHARS\s*=\s*(\d+)/) || [])[1]) >
       Number((SVC.match(/MAX_TIP_CHARS\s*=\s*(\d+)/) || [])[1]))
ck('加栏配了专门的迁移补那一行空值（不靠 setting_row 懒建，否则后台念成"这一栏不存在"）',
  fs.readdirSync(path.join(ROOT, 'backend/alembic/versions')).some((f) => f.includes('about_intro_row')))
ck('页面两种形状两套编解码都在：整段那格走 trim、绝不按换行切成一排短句',
  /t\.shape === 'paragraph'/.test(PAGE) && /areas\[lang\]\.value\.trim\(\)/.test(PAGE)
    && /'text:about_intro'/.test(PAGE))
ck('客户端那串文案 kind 名单与服务端闭集逐条同序（少一条＝新栏永远落不了账）',
  (() => {
    const clientList = (ASSETS.match(/const TEXT_KINDS = \[([^\]]*)\]/) || ['', ''])[1]
      .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    const serverList = (MODEL.match(/TEXT_KINDS = \(([^)]*)\)/) || ['', ''])[1]
      .split(',').map((x) => x.trim()).filter(Boolean)
      .map((name) => (name.match(/"([^"]+)"/) ? RegExp.$1 : (MODEL.match(new RegExp(name + '\\s*=\\s*"([^"]+)"')) || [])[1]))
    return clientList.length >= 2 && clientList.join() === serverList.filter(Boolean).join()
  })(), `客户端 ${JSON.stringify((ASSETS.match(/const TEXT_KINDS = \[[^\]]*\]/) || [''])[0])}`)
ck('整段那格落账认形状：是串才收、按数组给一律不收（收了就排成"一句一段"）',
  /function _textShapeOk[\s\S]*?kind === 'about_intro'[\s\S]*?typeof entry\.zh === 'string'[\s\S]*?Array\.isArray\(entry\.zh\)/.test(ASSETS))
ck('兜底顺序：缓存那段优先、包里那段兜底（写反＝后台怎么发都不生效，而且一句错都不报）',
  /function introText\(lang\) \{ return serverIntro\(lang\) \|\| introLead\(lang\) \}/.test(ASSETS))
ck('两处消费者都走同一枚 introText（「我的」里那一块与 pages/about；各写一遍就会两屏念两套）',
  /introLead: mpAssets\.introText\('zh'\)/.test(read('miniprogram/pages/me/me.js'))
    && /introLead: mpAssets\.introText\(lang\)/.test(read('miniprogram/pages/me/me.js'))
    && /introLead: mpAssets\.introText\(lang\)/.test(read('miniprogram/pages/about/about.js')))
ck('反向：两屏都不许再直接 import 包里那段当唯一出处（那样后台改了也读不到）',
  !/introLead: introLead\(/.test(read('miniprogram/pages/me/me.js'))
    && !/introLead: introLead\(/.test(read('miniprogram/pages/about/about.js')))
ck('客户端不抄上限那枚数（抄一份就是两边各有一个数，改一边静默放过脏数据）',
  !/MAX_INTRO_CHARS|MAX_TIP_CHARS/.test(ASSETS))
// 探针那三支钉子（10-21 准备跑它时查出来的：`tips` 那栏此刻装着站长亲手填的七句真文案，
// 而旧版收尾 `put({zh: BEFORE, en: BEFORE})` 只抄了 zh——跑一趟就把他那份英文顶成中文）。
ck('现网探针的写口只指向 about_intro：全脚本不许出现指向 tips 的那条 PUT（那是真人正在看的那一份）',
  !/mp\/texts\/tips/.test(read('docs/工具/探-现网Tips后台下发.py'))
    && /KIND = "about_intro"/.test(read('docs/工具/探-现网Tips后台下发.py')))
ck('探针收尾放回的是"进来时那一份"整体，不许再写成只抄 zh 那排（两份内容不同时会顶掉另一份）',
  /r = put\(BEFORE\)/.test(read('docs/工具/探-现网Tips后台下发.py'))
    && !/zh: BEFORE/.test(read('docs/工具/探-现网Tips后台下发.py')))
ck('探针打哪一台由 PROBE_BASE 决定（改过这一支要先在本地彩排，与 poster 那支同一条规矩）',
  /os\.environ\.get\("PROBE_BASE"/.test(read('docs/工具/探-现网Tips后台下发.py')))

  console.log(`\nTips 后台下发（静态）：通过 ${n - bad.length} / ${n}`)
  if (bad.length) {
    bad.forEach((b) => console.log('  ✗ ' + b))
    console.log('')
    process.exit(1)
  }
})()
