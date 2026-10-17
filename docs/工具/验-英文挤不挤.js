// 一次性探针（不是常驻尺子）：量"英文标题长到吃省略号那一档，右端那枚小标与配图会不会被挤走"。
// 为什么单独跑：出图器那道"溢出容器"守卫分不清"被切半截的一排手机"与"故意省略号的一行字"，
// 所以稿子里那几条英文是压着可写宽挑的（不靠稿子证明挤不挤）。这件事要一个数，就得当场灌一条超长的进去量。
// 跑法：node docs/工具/验-英文挤不挤.js
const path = require('path')
const { execFileSync } = require('child_process')
const ROOT = path.resolve(__dirname, '../..')
const HTML = path.join(ROOT, 'docs/design/10-17列表合一/列表合一-效果图.html')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const js = `(function(){
  try{
  // EN 那一屏按屏上的标题认，不数第几块（加一屏少一屏都会数错）
  var phs=[].slice.call(document.querySelectorAll('.ph'));
  var host=phs.filter(function(e){var c=e.querySelector('.cap');return c && /^EN/.test(c.textContent)})[0];
  if(!host) throw new Error('稿子里没有 EN 那一屏');
  var p=host.querySelector('.phone');
  var rows=[].slice.call(p.querySelectorAll('.row'));
  if(!rows.length) throw new Error('EN 那一屏里没有一行');
  function snap(tag){
    return rows.map(function(r,i){
      var tt=r.querySelector('.tt'), th=r.querySelector('.th'), cm=r.querySelector('.cmark');
      var pr=r.getBoundingClientRect();
      function rel(e){ if(!e) return null; var b=e.getBoundingClientRect();
        return {l:+(b.left-pr.left).toFixed(1), r:+(b.right-pr.left).toFixed(1), w:+b.width.toFixed(1)} }
      return {i:i, tag:tag, ttW:tt?+(tt.getBoundingClientRect().width).toFixed(1):null,
              ttFull:tt?+(tt.scrollWidth).toFixed(1):null,
              th:rel(th), cm:rel(cm), ell: tt? tt.scrollWidth>tt.clientWidth+1 : false};
    })
  }
  var short=snap('短（稿子里这一版）');
  rows.forEach(function(r){ var t=r.querySelector('.tt'); if(t) t.textContent='The harbour on the west side is genuinely worth walking twice before dusk'; });
  var long=snap('长（灌一条 78 字符的）');
  document.title=JSON.stringify({avail:+(rows[0].querySelector('.tt').clientWidth).toFixed(1),short:short,long:long});
  }catch(err){document.title='ERR '+err.message}
})()`

const probe = `<script>window.addEventListener('load',function(){${js}});</script>`
const fs = require('fs')
const tmp = '/tmp/squeeze.html'
fs.writeFileSync(tmp, fs.readFileSync(HTML, 'utf8').replace('</body>', probe + '</body>'))
const dump = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', '--window-size=2600,9500', '--virtual-time-budget=6000',
  '--dump-dom', tmp], { encoding: 'utf8', maxBuffer: 1 << 28 })
const t = (dump.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
if (t.startsWith('ERR')) { console.error('✗ 探针没跑起来：' + t); process.exit(1) }
const r = JSON.parse(t.replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
console.log('行内标题可写宽（EN 那一屏第一行）：' + r.avail + 'px')
for (const [tag, snap] of [['稿子里这一版', r.short], ['灌一条 78 字符', r.long]]) {
  console.log('\n【' + tag + '】')
  snap.forEach((s) => console.log('  第 %d 行  标题框 %s  需要 %s  省略号 %s  配图 %j  小标 %j',
    s.i, s.ttW, s.ttFull, s.ell ? '吃' : '不吃', s.th && { l: s.th.l, r: s.th.r }, s.cm && { l: s.cm.l, r: s.cm.r }))
}
const pos = (s) => [s.th && s.th.l, s.th && s.th.r, s.cm && s.cm.l, s.cm && s.cm.r]
const withTh = (a) => a.filter((s) => s.th)
const moved = withTh(r.short).some((s, k) => {
  const l = withTh(r.long)[k]
  if (!l) return true
  const a = pos(s), b = pos(l)
  return a.some((v, i) => (v === null) !== (b[i] === null) || (v !== null && b[i] !== null && Math.abs(v - b[i]) > 0.5))
})
console.log('\n判：把标题灌到 78 字符之后，右端配图与小标的落点' + (moved ? '动了 ⇒ 会被挤，这一版不成立' : '一个数没动 ⇒ flex:none 守住了，省略号只吃标题自己'))
