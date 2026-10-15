// Tips 搬后台这一刀的形状判据（静态那一层）。站长 10-15 原话「Tips 改为后台配置」。
//
// 这一把只判"两份实现有没有各写一套规矩"，不判通路通不通——通路归
// `验-Tips后台下发-真跑.js`（那边在模拟器里从 wx.request 端一批假文案进去，看屏上那行字换不换）。
// 分两层的理由与卡片模板那条一样：服务端放行 ≠ 客户端收得进，两头各自钉死才算通路钉死。
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

console.log(`\nTips 后台下发（静态）：通过 ${n - bad.length} / ${n}`)
if (bad.length) {
  bad.forEach((b) => console.log('  ✗ ' + b))
  console.log('')
  process.exit(1)
}
