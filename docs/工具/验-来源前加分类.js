/**
 * 一把静态尺子（不连模拟器）：钉站长 10-18 这一刀的形状。
 * 原话：「然后详情页顶部，来源前面加 |「分类 」 如果是私密，字体标红。列表页也同样加上。」
 * 排布他拍的丙：`「未分类」· 公众号文章 · 10月18日` —— 分类在最左，**不要竖线**。
 * 红字范围他还没答（甲＝只红分类那一段／乙＝整行红），现在落的是甲，这一把把甲钉住；
 * 他要是选乙，改判据与那一枚类挂的位置一起改，不许只改一边留一句假话。
 *
 * 这一把最要紧的是三条反向钉：
 *  ① 那对引号不许拼进 `category_name` 本身——海报那行小字吃的就是这一栏，拼进去卡片上就长出引号；
 *  ② 那一支红不许有第二个出处（页面里写死 hex 就是第二个出处，换档时必然漂）；
 *  ③ 三个落点里除分类那一段以外，谁也不许挂 `cat-priv`（挂到整行＝悄悄替他把甲改成乙）。
 * 跑法：node docs/工具/验-来源前加分类.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const read = (rel) => fs.readFileSync(P(rel), 'utf8')
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

let pass = 0
const fails = []
function ok(name, cond, extra) {
  if (cond) { pass += 1; return }
  fails.push(name + (extra ? ' —— ' + extra : ''))
}

// 取一条规则的本体（到第一个右花括号为止；注释里不许出现花括号，这是 app.wxss 那条老规矩）。
function rule(src, sel) {
  const at = src.indexOf(sel + ' {')
  if (at < 0) return null
  const end = src.indexOf('}', at)
  return end < 0 ? null : src.slice(at + sel.length + 2, end)
}

const idxW = read('pages/index/index.wxml')
const detW = read('pages/detail/detail.wxml')
const idxJs = read('pages/index/index.js')
const detJs = read('pages/detail/detail.js')
const catTxt = read('utils/catText.js')
const appWxss = read('app.wxss')
const idxWxss = read('pages/index/index.wxss')
const detWxss = read('pages/detail/detail.wxss')

// ---------- ① 三处都画那一档，且用点号分隔、没有竖线 ----------
ok('列表那一行：分类段就住在 `.ixl-src` 里（不新起一行），带 `r.cat` 与私密那一枚红类',
  /class="ixl-cat \{\{r\.priv \? 'cat-priv' : ''\}\}">\{\{r\.cat\}\}·<\/text>/.test(idxW)
  && /<view class="ixl-src">\s*<text wx:if="\{\{r\.cat\}\}"/.test(idxW))
ok('详情窗那一行：`.ds-cat` 挂 `detailNote.catSeg`，私密时挂 `cat-priv`',
  /class="ds-cat \{\{detailNote\.is_private \? 'cat-priv' : ''\}\}">\{\{detailNote\.catSeg\}\}·<\/text>/.test(idxW))
ok('独立详情页那一行：`.hero-cat` 挂 `note.catSeg`，私密时挂 `cat-priv`',
  /class="hero-cat \{\{note\.is_private \? 'cat-priv' : ''\}\}">\{\{note\.catSeg\}\}·<\/text>/.test(detW))
// 丙＝不要竖线。竖线一旦回来（不管是半角还是全角），他挑的那一版就废了。
const PIPE = /[|｜]/
ok('三处那一行里一根竖线都没有（丙：`「分类」· 来源 · 时间`，不是 `「分类」｜来源`）',
  !PIPE.test(idxW.match(/<view class="ixl-src">[\s\S]*?<\/view>/)[0]
    + idxW.match(/<view class="ds-meta">[\s\S]*?<\/view>/)[0]
    + detW.match(/<view class="hero-meta">[\s\S]*?<\/view>/)[0]))
ok('三处那段前面都留了 `wx:if`：分类还不知道的时候整段不画（不留「·」孤零零打头）',
  /wx:if="\{\{r\.cat\}\}"/.test(idxW) && /wx:if="\{\{detailNote\.catSeg\}\}"/.test(idxW)
  && /wx:if="\{\{note\.catSeg\}\}"/.test(detW))

// ---------- ② 数据：那一档从字典与分类表来，两页同一个口径 ----------
ok('首页 `skin()` 现算 `category_name`／`catSeg`：分类表没回来 ⇒ 念空串，不猜',
  /n\.category_name = n\.category_id == null\s*\?\s*t\('noCategory', lang\)/.test(idxJs)
  && /n\.catSeg = bracketOf\(n\.category_name, lang\)/.test(idxJs))
ok('列表行把这一档带出去了（`arrange()` 那一枚行对象里有 `cat`）',
  /cat: n\.catSeg \|\| ''/.test(idxJs))
ok('独立详情页同一条口径：查不到分类才回落到字典那一句「未分类」',
  /note\.category_name = categoryName \|\| \(note\.category_id == null \? this\.data\.t\.noCategory : ''\)/.test(detJs)
  && /note\.catSeg = bracketOf\(note\.category_name, lang\)/.test(detJs))
ok('两页都不许把「未分类」写死在代码里（那一句话只住在 i18n 字典）',
  !/'未分类'/.test(strip(idxJs) + strip(detJs)))

// ---------- ③ 那对引号：只有 catText 一份，且中英两档不一样 ----------
ok('引号那一档收在 utils/catText.js 的 `bracketOf`（两页三处共用，不在 wxml 里各写一遍）',
  /function bracketOf\(name, lang\) \{/.test(catTxt)
  && !/「\{\{r\.cat\}\}」|「\{\{detailNote|「\{\{note\./.test(idxW + detW))
ok('中英两档各一套：中文直角引号、英文直排双引号（现网英文表里一句直角引号都没有）',
  /lang === 'zh' \? `「\$\{name\}」` : `"\$\{name\}"`/.test(catTxt))
ok('空名字不裹壳（否则屏上是一对空引号后面跟个点）',
  /if \(!name\) return ''/.test(catTxt))

// ---------- ④ 反向：引号不许拼进数据栏（海报吃的是原样那一份） ----------
ok('`category_name` 那几处赋值都不许出现 bracketOf／引号：拼进去卡片那行小字就长出引号',
  !/category_name = [^\n]*(bracketOf|「|”|")/.test(idxJs + detJs + read('pages/share/share.js')))
ok('海报那一行小字仍吃原样的 `note.category_name`，且 `catSeg` 根本不出现在 poster 里',
  /firstTag \|\| note\.category_name \|\|/.test(read('utils/poster.js'))
  && !/catSeg/.test(read('utils/poster.js') + read('utils/posterRecipes.js')))

// ---------- ⑤ 红：一支令牌、一条规则、只挂分类那一段 ----------
ok('红值只有一枚令牌，且写在 app.wxss（页面里不许各存一支红）',
  (appWxss.match(/--priv-ink:/g) || []).length === 1
  && /--priv-ink: #A83224;/.test(strip(appWxss)))
ok('用色的规则只有一条 `.cat-priv { color: var(--priv-ink) }`，本体除这一句一个字不多',
  (strip(appWxss).match(/var\(--priv-ink\)/g) || []).length === 1
  && /^[\s]*color: var\(--priv-ink\);[\s]*$/.test(rule(strip(appWxss), '.cat-priv') || ''))
ok('三个落点自己的类不写 color：颜色只有全局那一枚出口（写了就是第二次决定）',
  !/color:/.test(rule(idxWxss, '.ixl-cat') || '') && !/color:/.test(rule(idxWxss, '.ds-cat') || '')
  && !/color:/.test(rule(detWxss, '.hero-cat') || ''))
// ⚠ 这一条是"甲"的钉子：整行红＝把 `cat-priv` 挂到容器上，那一眼就能看出来，但那是他还没拍的另一档。
ok('`cat-priv` 全站只出现在三处、且一律挂在分类那一段那个 `<text>` 上（不挂整行）',
  (idxW.match(/cat-priv/g) || []).length === 2 && (detW.match(/cat-priv/g) || []).length === 1
  && !/class="(ixl-src|ds-meta|hero-meta) [^"]*cat-priv/.test(idxW + detW))
ok('除 app.wxss 那枚令牌外，全站 wxss 里没有第二处写死这一支红',
  (() => {
    const hit = []
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const f = path.join(dir, e.name)
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(f); return }
      if (!/\.wxss$/.test(e.name) || f === P('app.wxss')) return
      if (/#A83224/i.test(fs.readFileSync(f, 'utf8'))) hit.push(path.relative(ROOT, f))
    })
    walk(P(''))
    return hit.length === 0
  })(), '那些页面把红写死了')

console.log(`${pass}/${pass + fails.length} 过${fails.length ? '　红：\n  - ' + fails.join('\n  - ') : ''}`)
process.exit(fails.length ? 1 : 0)
