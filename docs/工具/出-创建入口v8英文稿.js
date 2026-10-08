// 生成「创建入口 v8 · 英文版」效果图里的文案与配色两块——**屏上每一串英文、每一枚颜色都不是手抄的**，
// 全部从现网两处真身现读：miniprogram/utils/i18n.js 的 en 字典、miniprogram/utils/palette.js 的色阶。
// 为什么要有这个生成器：站长定过一条规矩「效果图文案必须抄现网字典」，手抄的那一份下一轮必然走样
// （v7 正本里那句 manualDesc 就是例子——字典改了口径，稿子上还写着旧的「写下标题和原文」）。
//
// 跑法：node docs/工具/出-创建入口v8英文稿.js
// 它只做一件事：把 HTML 里 `/*__GEN_BEGIN__*/ … /*__GEN_END__*/` 之间那三行换成重新读出来的值（可反复跑），
// 然后渲一张够高的图、从底部找"最后一行不是背景色"的行号裁切，最后把页面自己量的宽度表打出来。
// 为什么裁切而不是定窗口高：10-08 那份 v7 的 PNG 就是被写死的窗口高静默截掉过两次（图例后半段没了）。
const { execFileSync } = require('child_process')
const os = require('os')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const P = (rel) => path.join(ROOT, 'miniprogram', rel)
const HTML = path.join(ROOT, 'docs/design/创建入口重设计 - 三方向/创建入口-v8-英文版.html')

const i18n = require(P('utils/i18n.js'))
const palette = require(P('utils/palette.js'))
const en = i18n.texts('en')

// 屏上出现过的每一句，都按字典里的键取；键名写出来，图例里也照这份列
const KEYS = ['appName', 'createHeading', 'barIdle', 'chooseMode', 'barCollapse', 'modePhoto', 'modeUrl',
  'modeWrite', 'fromAlbum', 'takePhoto', 'linkDesc', 'manualDesc', 'origTranslate', 'slideExtract',
  'busyExtract', 'extractSucceeded', 'maxShots', 'linkRule', 'needBody', 'permCamera', 'pickFailed', 'taskTimeout']
const EN = {}
KEYS.forEach((k) => {
  if (typeof en[k] !== 'string') throw new Error(`en 字典里没有键 ${k}（这一稿不许凭印象造句子）`)
  EN[k] = en[k]
})
// 日期那一行不是字典键，是 create.js 的 dateLineFor('en') 那套算法——这里同法现算，不抄死
const now = new Date()
const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const W = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
EN._date = `${M[now.getMonth()]} ${now.getDate()}`
EN._week = W[now.getDay()]
// 收起态那行轮播 Tips：六句里挑一句画上去（真机是轮播，稿子只能定格一句）
if (!Array.isArray(en.tips) || !en.tips.length) throw new Error('en.tips 不是一串句子')
EN._tip = en.tips[0]

// 四套壁纸 × 快门/条那两枚：值与对比全从 palette 现读（createSkin() 走的就是 rampFor(2)/rampFor(3)）
const THEMES = palette.THEMES.map((th) => {
  const cam = palette.rampFor(2, th.key)
  const ext = palette.rampFor(3, th.key)
  const ch = palette.chromeOf(th.key)
  return {
    key: th.key, label: palette.themeLabel(th.key),
    cam: cam.bg.toUpperCase(), camInk: cam.ink.toUpperCase(), ext: ext.bg.toUpperCase(),
    crCam: palette.crOf(cam.ink, cam.bg).toFixed(2),
    crExt: palette.crOf('#F2EFE9', ext.bg).toFixed(2),
    // 底栏那一胶囊也是同一支色阶算出来的：换壁纸时它跟着换，所以第四排不许只换两枚按钮
    chromeBg: ch.bg.toUpperCase(), chromeSel: ch.sel.toUpperCase(),
  }
})

// 图例是给人读的判断，不是数据，所以留在这里手写；但里面引用的现网值仍由上面那两份现读拼进去
const LEGEN = [
  '<b>这一稿与 v7 正本的关系（三处不同，先说清）：</b>① <b>只画甲档</b>——正本那张"不透明／淡透明"两档对照里，落地时你拍的是甲（不透明实面板），'
    + '代码里也只有这一档，所以英文稿不再重复画乙；② 一排<b>多一格「0 · 收起态」</b>，那是现网现在跑着的样子，留着当对照；'
    + '其余每一格的位置、层次、行高与正本逐格同构，<b>只换语言</b>——<b>一个例外</b>：多图那两格（本稿第 5、6 格）画的是<b>已落地的排布</b>（一行五枚 100rpx、➕ 钉在本行最右端），'
    + '正本画的是"一行四枚、拉开铺满"那一版，这一处差异正本图例第 11 条 ④ 已经记过，不是本稿另起的结构。'
    + '③ <b>另两处按已落地的代码对齐了</b>：面板两档从正本那一份的 450／585rpx 改成代码里的 '
    + '<b>500／580rpx</b>（450 装不下照片那三枚圈：卡内可用 251.4rpx，那三枚要 250.4）；快门与「右滑提炼」那两枚<b>不再是写死的 #E9723D／#C4541F</b>，'
    + '改成吃当前壁纸色阶第 3、第 4 档——这一稿画的是象牙那一套（' + THEMES[0].cam + '／' + THEMES[0].ext + '）。'
    + '<b>这一条放置是我定的、他没拍过</b>，要改回写死的橙只动 <code>createSkin()</code> 两行。',
  '<b>每一句英文的出处（全是 <code>utils/i18n.js</code> 的 en 键，由生成器现读注入，手改无效）：</b>'
    + KEYS.map((k) => `${k}=<i>${en[k]}</i>`).join('、') + '。日期那一行不是字典键，是 <code>create.js</code> 的 <code>dateLineFor(\'en\')</code> 同法现算（这一稿：'
    + `<i>${EN._date} ${EN._week}</i>）。`,
  '<b>为什么英文这一版不是"待办"：</b>代码里已经生效并且真跑量过——<code>验-统一录入条-真跑</code> H 节五条：条身读的是 <i>'
    + en.barIdle + '</i>、三枚标签 <i>Photo|Link|Text</i>、条上那句 <i>' + en.slideExtract
    + '</i> 字宽 217px／轨道 300px 放得进、框外两枚之间还剩 123px 缝。<b>本稿第五排那张宽度实测表由页面自己量</b>（<code>window.__metrics()</code>），不是我目测。',
  '<b>英文微文案三条要注意的（这一稿已经按现网值画，改的时候别踩）：</b>① 说明行不许写零件清单，要写"这行拿来干嘛"——所以 <i>'
    + en.manualDesc + '</i> 这种"贴进来→出摘要"的因果句是对的，"标题／原文／摘要"三个名词并列那种是清单；'
    + '② 按钮与标签名不许承诺顺带做的事，<i>' + en.slideExtract + '</i> 只说"滑就开始提炼"，没说"提炼并保存"；'
    + '③ <b>折行＝红</b>：快门下面那枚字在中文是两个字「拍照」，英文 <i>' + en.takePhoto
    + '</i> 是六个字符，落点那一列 84px（去掉内缩可用 70），所以这一稿把它按现网字号（--fs-meta 24rpx）画出来量过——放不下会在第五排那张表里报"放不下／折行"。',
  '<b>四套壁纸那一排说明的事：</b>换壁纸时快门与条<b>一起换深浅两档</b>（第 3、第 4 档），两枚的深浅关系、字底对比都不变：'
    + THEMES.map((t) => `${t.label} ${t.cam}／${t.ext}（${t.crCam}、${t.crExt}）`).join('；')
    + '。四套 × 两枚共八组对比全在 WCAG 小字 4.5 以上（数由 <code>palette.crOf</code> 现算）。'
    + '<b>同一排里底栏那一胶囊也跟着换</b>——它跟这两枚是同一支色阶算出来的（<code>palette.chromeOf</code> 的 <code>bg</code>／<code>sel</code>：'
    + THEMES.map((t) => `${t.label} ${t.chromeBg}／${t.chromeSel}`).join('；') + '），只换按钮不换底栏就是稿子内部自相矛盾。'
    + '<b>这一排没跟着换的是背景图与压暗罩</b>：真机换壁纸时那两样也换，但那是「外观」那一档的事，不在创建这一条线里，画进来只会让人以为这一稿在提案。',
  '<b>进度那条仍然要说白：</b>这一枚走的是<b>假进度</b>——服务端任务在 redis 里只有 <code>status</code>（<code>backend/app/services/queue.py</code> 的 <code>set_task_status</code>），没有百分比，客户端 2 秒轮一次。曲线 <code>90×(1−e^(−秒/30))</code> 封顶 90%，接口回来才钉满。要真进度得给任务加 <code>done</code>/<code>total</code> 两个字段并部署（<code>docs/规格-创建入口这一条线.md</code> §11 第三条）。',
  '<b>这一屏的英文与中文共用同一套皮：</b>面板三档暗面（' + '#23252C／#2B2D35／#1A1C21'
    + '）、纸白字与各档 alpha、描边宽度、圆角、行程 456rpx、小图 100rpx 见方一行五格——<b>没有为英文另开一套尺寸</b>；语言只换句子里的字。',
  '<b>"英文会不会撑破框"这一条交给工具，不写在图例里当结论：</b>屏上最容易撑破的是输入框那两句 <i>'
    + en.linkDesc + '</i>／<i>' + en.manualDesc + '</i>，落点是同一个框。下面第五排那张宽度实测表由页面自己量（<code>window.__metrics()</code>：'
    + '字宽用 <code>Range</code> 只圈文字、可用宽用 <code>clientWidth − 左右内缩</code>），生成器把数读回来打印，'
    + '<b>任何一串变成"放不下"脚本就非 0 退出</b>，所以这张表是活的尺子，不是这一稿的插图。'
    + '<b>我早先在别一版量错过一次</b>（当时写成"英文比框宽 22px、要么降字号要么换短句"）：错在拿 <code>scrollWidth</code> 量字——'
    + '它把框自己的左右内缩也算进去，每条虚高约 56px。改成 Range 之后这条不存在：placeholder 照旧吃现网 <code>--fs-body</code> 28rpx，'
    + '不降号、不改字典、不加新句；中文那两句本来就在框里。',
]

const html0 = fs.readFileSync(HTML, 'utf8')
const B = '/*__GEN_BEGIN__*/', E = '/*__GEN_END__*/'
if (!html0.includes(B) || !html0.includes(E)) throw new Error('HTML 里找不到 /*__GEN_BEGIN__*/ … /*__GEN_END__*/ 标记')
const block = 'var EN=' + JSON.stringify(EN) + ';\n'
  + 'var THEMES=' + JSON.stringify(THEMES) + ';\n'
  + 'var LEGEN=' + JSON.stringify(LEGEN) + ';'
const html = html0.slice(0, html0.indexOf(B) + B.length) + '\n' + block + '\n'
  + html0.slice(html0.indexOf(E))
fs.writeFileSync(HTML, html)

console.log(`写入 ${path.relative(ROOT, HTML)}`)
console.log(`　EN ${Object.keys(EN).length} 句（全部来自 en 字典）、THEMES ${THEMES.length} 套、LEGEN ${LEGEN.length} 条`)
KEYS.forEach((k) => console.log(`    ${k.padEnd(17)} ${en[k]}`))
console.log('　四套壁纸：', THEMES.map((t) => `${t.label} ${t.cam}/${t.ext}`).join('  '))

// ---------- 渲图 + 读回页面自己量的宽度表 ----------
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PNG = HTML.replace(/\.html$/, '.png')
// 探针那一趟故意开得比稿子宽（2400×9000）：这样 .sub/.legend 那两大段说明文字先按宽版排好，
// 页面报回来的 scrollWidth/Height 才接近最终画布；然后再照那个数精确开一次
const PROBE = 2400, TALL = 9000
const url = 'file://' + HTML
const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', '--virtual-time-budget=4000']
const dump = execFileSync(CHROME_BIN, [...base, `--window-size=${PROBE},${TALL}`, '--dump-dom', url],
  { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })

// ⚠️ 判"页面有没有报错"要看 <title>，不能 grep 整份 dump：源码里本来就写着 'PAGE-ERROR: ' 那个串（就是它自己负责写的），
// grep 全文会把它当报错——这正是"数源码而不是看产物"那一类假红。
const title = (dump.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
if (/PAGE-ERROR/.test(title)) { console.error('✗ 页面里有 JS 报错，图与宽度表都不可信：' + title); process.exit(1) }
// 画布尺寸由页面自己报（<title> 里那句 DIM 宽x高）——写死窗口高/宽两个方向都会静默截尾
const dim = (/DIM (\d+)x(\d+)/.exec(title) || []).slice(1).map(Number)
if (dim.length !== 2) { console.error('✗ 页面没报画布尺寸（<title> 里没有 DIM 宽x高）：' + title); process.exit(1) }
const [VW2, VH2] = dim
console.log(`　页面自报画布 ${VW2}×${VH2}css（scale 2 ⇒ ${VW2 * 2}×${VH2 * 2}px）`)
const rows = [...dump.matchAll(/<tr><td class="k">([^<]*)<\/td><td class="s">([^<]*)<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><td class="(ok|bad)">([^<]*)<\/td><\/tr>/g)]
  .map((m) => ({ k: m[1], s: m[2], box: m[3], w: m[4], verdict: m[6], bad: m[5] === 'bad' }))
const flag = (dump.match(/METRICS-(OK|BAD)[^<]*/) || ['（页面没写出实测表）'])[0]
// 各段在整张图上的位置由 DOM 报（目验要按段裁，不靠猜像素）；y/h 已 ×2 对上 PNG 的 scale
const geo = (dump.match(/GEO(\[.*?\])<\/pre>/s) || [])[1]
console.log('\n宽度实测（页面自己量，浏览器排版引擎，不是我目测）：' + flag)
rows.forEach((r) => console.log(`  ${r.bad ? '✗' : '✓'} ${r.k.padEnd(17)} ${r.w.padEnd(16)} ${r.box}　「${r.s}」`))

// 内容底部：从最后一行往上找第一行"不是背景色"的行号；找到的行号==图高说明窗口还不够高（那份 v7 就这么被截过）
const shot = '/tmp/v8-raw.png'
execFileSync(CHROME_BIN, [...base, `--window-size=${Math.max(VW2, PROBE)},${Math.max(VH2 + 60, TALL)}`, `--screenshot=${shot}`, url],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const py = `
from PIL import Image
im=Image.open(${JSON.stringify(shot)}).convert('RGB'); w,h=im.size; px=im.load(); bg=px[3,h-3]
last=0
for y in range(h-1,-1,-1):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(0,w,5) for c in range(3)):
        last=y; break
print('图', w, h, '最后一行', last)
if last>=h-2:
    raise SystemExit('仍然顶到底＝窗口还不够高，不能交')
# 左右也验一次：最右一列若整列都是背景色，说明右边没被切；否则说明还有内容超出窗口
right=0
for y in range(0,min(last,h),7):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(w-6,w) for c in range(3)): right+=1
if right>3: raise SystemExit('最右一列有 %d 行带内容＝右边被切了，不能交' % right)
out=im.crop((0,0,w,min(h,last+40))); out.save(${JSON.stringify(PNG)})
print('写入', out.size)
# 按段裁小图给人目验（整张 4800×8000+ 直接看会把字缩糊）
import json
geo=json.loads(${JSON.stringify(geo || '[]')})
for i,g in enumerate(geo):
    y0=max(0,g['y']-16); y1=min(last+40,g['y']+g['h']+16)
    if y1-y0<8: continue
    c=out.crop((0,y0,out.width,y1))
    # 整段宽 4800，直接看会被缩糊；按 1440px 一块横切，目验时挑要看的几块
    for j in range(0,(c.width+1439)//1440):
        c.crop((min(j*1440,c.width-1),0,min((j+1)*1440,c.width),c.height)).save('/tmp/v8-sec-%d-%d.png' % (i,j))
    print('段 %-4s y=%d h=%d w=%d → /tmp/v8-sec-%d-*.png（%d 块，每块 1440 宽）' % (g['t'],g['y'],g['h'],c.width,i,(c.width+1439)//1440))
`
const pyOut = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
console.log('出图：' + PNG + '\n　' + pyOut.trim().replace(/\n/g, '\n　'))
if (!geo) console.log('⚠ 页面没写出 GEO（<pre id=geo> 那段没跑），目验小图这次没生成')
const bad = rows.filter((r) => r.bad)
if (bad.length) {
  console.log('\n✗ 屏上出现的英文串有 ' + bad.length + ' 条放不下：' + bad.map((r) => `${r.k}(${r.w})`).join('、'))
  process.exit(1)
}
console.log(`✓ 屏上出现的 ${rows.length} 串全部放得进（这张表就是尺子：改一句英文或改一处框宽，重跑这条就会红）`)
