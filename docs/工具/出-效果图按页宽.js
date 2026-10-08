// 通用出图：任何一张效果图 html，先让页面自己报画布多大，再照那个数开窗口截，最后裁掉多余的底与右。
// 为什么要这么绕：v7 那份 PNG 被写死的 1095 宽**横向切掉了每排右边几台手机**，同一份又被写死的窗口高
// 纵向切掉过图例——两个方向都会静默截，而截出来的图看着还是完整的一张。所以宽与高都不许手写。
// 用法：node docs/工具/出-效果图按页宽.js "docs/design/…/xxx.html"
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../..')
const rel = process.argv[2]
if (!rel) { console.error('用法：node docs/工具/出-效果图按页宽.js <效果图.html>'); process.exit(2) }
const HTML = path.resolve(ROOT, rel)
if (!fs.existsSync(HTML)) { console.error('✗ 找不到 ' + HTML); process.exit(2) }

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PNG = HTML.replace(/\.html$/, '.png')
const PROBE = 2600, TALL = 9500

// 页面自己没写 DIM 上报的（正本 v7 就没写），临时补一段探针脚本，量完删掉临时件——正本一个字不动
function render(windowW, withProbe) {
  const tmp = path.join(path.dirname(HTML), '.probe-' + path.basename(HTML))
  const target = withProbe ? tmp : HTML
  if (withProbe) {
    const h = fs.readFileSync(HTML, 'utf8')
    // 只问一件事：这个窗口宽下，有没有哪个容器被内容撑出去了（flex 不换行那一排手机就是这么被切掉的）。
    // 不量"内容总宽"：正文那几段是块级，窗口开多宽它就铺多宽，量出来的数会跟着窗口一路涨（第一版就在这儿空转了三轮）
    // 阈值取 8px 不是 1px：字距/半像素会让一批文本容器常年"溢出"4px，那种不是被切，跟着加宽只会空转
    const probe = "<script>window.addEventListener('load',function(){var n=0,x=0;"
      + "document.querySelectorAll('body *').forEach(function(e){var d=e.scrollWidth-e.clientWidth;"
      + "if(d>8){n++;if(d>x)x=d}});"
      + "var d=document.documentElement;"
      + "document.title='OV '+n+'x'+x+' H '+Math.max(d.scrollHeight,document.body.scrollHeight)});</script>"
    fs.writeFileSync(tmp, h.replace('</body>', probe + '</body>'))
  }
  try {
    return execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--virtual-time-budget=6000', `--window-size=${windowW},${TALL}`, '--dump-dom', target],
      { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
  } finally { if (withProbe) fs.unlinkSync(tmp) }
}
function readOv(dump) {
  const t = (dump.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const m = /OV (\d+)x(\d+) H (\d+)/.exec(t)
  return m ? { n: +m[1], over: +m[2], h: +m[3] } : null
}

// 窗口宽从"够宽"起步：先确认这一档没有溢出；有就按最大的那一档溢出量加宽，最多试 6 次
let W = PROBE, H = TALL, prev = 1e9
for (let i = 0; i < 6; i++) {
  const r = readOv(render(W, true))
  if (!r) { console.error('✗ 探针没跑起来（页面整段没执行？）'); process.exit(1) }
  console.log(`　窗口 ${W}css：溢出容器 ${r.n} 个${r.n ? '，最大 ' + r.over + 'px' : ''}，内容高 ${r.h}css`)
  if (r.n === 0) { H = r.h; break }
  if (r.n >= prev) { console.error('✗ 加宽没有让溢出变少（' + r.n + ' 个还在），不是窗口的问题，不能交'); process.exit(1) }
  prev = r.n
  W += r.over + 24
  if (i === 5) { console.error('✗ 加宽到 ' + W + ' 还在溢出，不能交'); process.exit(1) }
}
const WH = Math.max(H + 120, TALL)
console.log(`　出图窗口 ${W}×${WH}css（scale 2 ⇒ 宽 ${W * 2}px）`)
const shot = '/tmp/render-raw.png'
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
  '--virtual-time-budget=6000', `--window-size=${W},${WH}`, `--screenshot=${shot}`, HTML],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })

const py = `
from PIL import Image
Image.MAX_IMAGE_PIXELS=None
im=Image.open(${JSON.stringify(shot)}).convert('RGB'); w,h=im.size; px=im.load(); bg=px[3,h-3]
last=0
for y in range(h-1,-1,-1):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(0,w,5) for c in range(3)):
        last=y; break
print('图', w, h, '最后一行', last)
if last>=h-2: raise SystemExit('顶到底＝窗口还不够高，不能交')
right=0
for y in range(0,min(last,h),7):
    if any(abs(px[x,y][c]-bg[c])>12 for x in range(w-6,w) for c in range(3)): right+=1
if right>3: raise SystemExit('最右一列有 %d 行带内容＝右边被切了，不能交' % right)
out=im.crop((0,0,w,min(h,last+40))); out.save(${JSON.stringify(PNG)})
print('写入', out.size)
`
console.log(execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim().replace(/\n/g, '\n　') + '\n出图：' + PNG)
