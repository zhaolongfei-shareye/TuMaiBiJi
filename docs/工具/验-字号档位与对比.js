// 一次性探针（不是常驻尺子）：量"来源／标题／分类"三档字号在每一屏里到底是几个数，
// 并把来源那一档的字色对着它真正落在的底（浅面 rgba(255,255,255,.72) 压在卡底 #F3F3F1 上）算对比度。
// 为什么单独跑：他 10-17 那句「来源和笔记标题要明显区分」要的是一个比值，看图说不出比值；
// 而且字一压小，对比度会跟着掉，光看稿子读不出"掉到 AA 以下"。
// 跑法：node docs/工具/验-字号档位与对比.js
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const ROOT = path.resolve(__dirname, '../..')
const HTML = path.join(ROOT, 'docs/design/10-17列表合一/列表合一-效果图.html')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const js = `(function(){
  try{
  var phs=[].slice.call(document.querySelectorAll('.ph'));
  function num(s){ return Math.round(parseFloat(s)*100)/100 }
  function rgba(c){ var m=/rgba?\\(([^)]+)\\)/.exec(c); if(!m) return null;
    var p=m[1].split(',').map(function(x){return parseFloat(x)});
    return [p[0],p[1],p[2], p.length>3?p[3]:1] }
  // 往上爬，把每一层 background-color 按 alpha 合成到一个实色（稿子里行底是半透明白，直接读会读成 rgba）
  function over(el){
    var out=[255,255,255,1], stack=[];
    for(var n=el;n && n!==document.documentElement;n=n.parentElement){
      var c=rgba(getComputedStyle(n).backgroundColor);
      if(c && c[3]>0) stack.push(c);
      if(n.classList && n.classList.contains('phone')) break;
    }
    for(var i=stack.length-1;i>=0;i--){ var s=stack[i];
      out=[0,1,2].map(function(k){ return s[k]*s[3] + out[k]*(1-s[3]) }); out[3]=1 }
    return out;
  }
  function lin(v){ var c=v/255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055, 2.4) }
  function L(rgb){ return 0.2126*lin(rgb[0]) + 0.7152*lin(rgb[1]) + 0.0722*lin(rgb[2]) }
  function cr(fg,bg){ var a=L(fg),b=L(bg); return Math.round(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05))*100)/100 }
  var rows=[];
  phs.forEach(function(ph){
    var cap=(ph.querySelector('.cap')||{textContent:''}).textContent.trim().slice(0,14);
    var p=ph.querySelector('.phone'); if(!p) return;
    function g(sel){ var e=p.querySelector(sel); if(!e) return null;
      var cs=getComputedStyle(e); return {px:num(cs.fontSize), w:cs.fontWeight,
        col:cs.color, on: sel==='.row'? over(e) : over(e.parentNode||e)} }
    rows.push({cap:cap, cats:g('.cats'), src:g('.src'), tt:g('.tt'), lt:g('.lt'), ls:g('.ls'), gut:g('.gut b')});
  });
  document.title=JSON.stringify(rows);
  }catch(err){document.title='ERR '+err.message}
})()`

const probe = `<script>window.addEventListener('load',function(){${js}});</script>`
const tmp = path.join(path.dirname(HTML), '.probe-字号.html')
fs.writeFileSync(tmp, fs.readFileSync(HTML, 'utf8').replace('</body>', probe + '</body>'))
let dump
try {
  dump = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=2600,9500', '--virtual-time-budget=6000',
    '--dump-dom', tmp], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] })
} finally {
  fs.unlinkSync(tmp)
}
const t = (dump.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
if (t.startsWith('ERR')) { console.error('✗ 探针没跑起来：' + t); process.exit(1) }
const rows = JSON.parse(t.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

const px2rpx = (v) => Math.round(v * 2 * 10) / 10
const cell = (e) => (e ? `${e.px}px(${px2rpx(e.px)}rpx) ${e.w}` : '—')
const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const Lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
const cr = (fg, bg) => { const a = Lum(fg), b = Lum(bg); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 }
// 字色本身带 alpha（稿子里是 rgba(35,37,44,.68)），先合成到它真正落的那块底上再算
const onAlpha = (e, a) => {
  const bg = e.on
  const p = /rgba?\(([^)]+)\)/.exec(e.col)
  const c = p ? p[1].split(',').map(parseFloat) : [35, 37, 44]
  const alpha = a !== undefined ? a : (c.length > 3 ? c[3] : 1)
  const ink = a !== undefined ? [35, 37, 44] : c.slice(0, 3)
  return cr([0, 1, 2].map((k) => ink[k] * alpha + bg[k] * (1 - alpha)), bg) + ':1'
}
const contrast = (e) => (e ? onAlpha(e) : '—')
// console.log 的 %s 不吃宽度补齐，自己 padEnd（中文按两格宽算，不然竖线对不齐）
const pad = (s, n) => {
  let w = 0
  for (const ch of String(s)) w += /[\u2e80-\uffff]/.test(ch) ? 2 : 1
  return String(s) + ' '.repeat(Math.max(1, n - w))
}
console.log(pad('屏（按屏上标题认）', 36) + pad('分类行', 18) + pad('来源', 18) + pad('标题', 18) + '来源对比')
rows.forEach((r) => console.log(pad(r.cap, 36) + pad(cell(r.cats), 18) + pad(cell(r.src), 18) +
  pad(cell(r.tt), 18) + contrast(r.src)))

const b = rows.find((r) => /^乙·优化版/.test(r.cap))
const live = rows.find((r) => /^⓪ 现网对照/.test(r.cap))
if (!b || !live) { console.error('✗ 没找到乙／现网对照那两屏，比值不作数'); process.exit(1) }
console.log('\n判：')
// 第一判：令牌值（rpx）除以 2 必须等于屏上算出来的 px。不等就是那条声明在 Chrome 里根本没生效
// （rpx 不是合法长度 ⇒ invalid-at-computed-value，整条退回继承值，图上看不出来）。10-17 就栽在这一条上。
const WANT = { cats: { merged: 24, sm: 21 }, src: 18, tt: 28, lt: 28, ls: 24 }
const bad = []
rows.forEach((r) => {
  const live = /^⓪/.test(r.cap)
  const checks = [
    ['分类行', r.cats, (live ? WANT.cats.merged : WANT.cats.sm) / 2],
    ['来源', r.src, WANT.src / 2],
    ['标题', r.tt, WANT.tt / 2],
    ['现网标题', r.lt, WANT.lt / 2],
    ['现网摘要', r.ls, WANT.ls / 2],
  ]
  checks.forEach(([tag, e, px]) => {
    if (!e) return
    if (Math.abs(e.px - px) > 0.02) bad.push(`${r.cap}… 的${tag}：令牌要 ${px}px，屏上实是 ${e.px}px`)
  })
})
console.log(bad.length ? '  ✗ 有 ' + bad.length + ' 处令牌字号没上屏：\n    ' + bad.join('\n    ')
  : '  ✓ 每一档"令牌值／2"都等于屏上算出来的 px ⇒ 字号真画上去了')
console.log('  乙那一屏 来源 : 标题 ＝ 1 : ' + (b.tt.px / b.src.px).toFixed(2) +
  '（上一版 21rpx 对 28rpx ＝ 1 : ' + (28 / 21).toFixed(2) + '）')
console.log('  乙那一屏 分类行 ' + b.cats.px + 'px，现网对照 ' + live.cats.px + 'px ⇒ 差 ' +
  (live.cats.px - b.cats.px).toFixed(1) + 'px' +
  (Math.abs(live.cats.px - b.cats.px) > 0.4 ? '：只压了合一之后那几屏，尺子那一格没跟着动' : '：两格一样，没压下去'))
console.log('  来源对比 现版（α .68）' + contrast(b.src) + '，同一块底上换成上一版那档 α .55 ＝ ' +
  onAlpha(b.src, 0.55) + '（AA 小字线 4.5）')


