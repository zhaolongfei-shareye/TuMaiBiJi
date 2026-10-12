#!/usr/bin/env python3
# 看某一页里"最靠下"的几个元素各是什么、底边多少 —— P2 那种 10px 的红要定位到元素。
# 用法：python3 看-页底元素.py <html> <页号> [页号...]
import json, re, subprocess, sys, pathlib, tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
src = pathlib.Path(sys.argv[1]).resolve()
want = {int(x) for x in sys.argv[2:]}
html = src.read_text(encoding="utf-8")

probe = """<script>
(function(){
  var out=[];
  document.querySelectorAll("article.page").forEach(function(p){
    var n=+p.getAttribute("data-page");
    var f=p.querySelector("footer.footer");
    var vis=f&&f.offsetHeight>0;
    var limit=vis?f.getBoundingClientRect().top:p.getBoundingClientRect().bottom-62*96/72;
    var rows=[];
    p.querySelectorAll("*").forEach(function(e){
      if(!vis&&(e===f||(f&&f.contains(e))))return;
      var r=e.getBoundingClientRect();
      if(r.height===0&&r.width===0)return;
      rows.push({t:e.tagName.toLowerCase(),c:String(e.className||"").slice(0,26),
                 top:Math.round(r.top-limit),bot:Math.round(r.bottom-limit),h:Math.round(r.height)});
    });
    rows.sort(function(a,b){return b.bot-a.bot});
    out.push({page:n,limit:Math.round(limit),top:Math.round(p.getBoundingClientRect().top),
              worst:rows.slice(0,8),text:(p.innerText||"").length});
  });
  var pre=document.createElement("pre");pre.id="ovf";
  pre.textContent=JSON.stringify(out);document.body.appendChild(pre);
})();
</script>"""
tmp = pathlib.Path(tempfile.mkdtemp()) / (src.stem + ".dbg.html")
tmp.write_text(html.replace("</body>", probe + "</body>"), encoding="utf-8")
r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
                    "--window-size=1000,1400", "--virtual-time-budget=25000",
                    "--dump-dom", f"file://{tmp}"], capture_output=True, text=True)
m = re.search(r'<pre id="ovf">(.*?)</pre>', r.stdout, re.S)
data = json.loads(m.group(1).replace("&quot;", '"'))
for d in data:
    if d["page"] not in want:
        continue
    print(f"### 第 {d['page']} 页（相对页脚上边为 0；正数＝压过页脚线）")
    for w in d["worst"]:
        print(f"   bot {w['bot']:>5}  top {w['top']:>5}  h {w['h']:>4}  {w['t']}.{w['c']}")
