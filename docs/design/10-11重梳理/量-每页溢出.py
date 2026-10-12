#!/usr/bin/env python3
# 量每一页的溢出：用 headless Chrome 跑 DOM，拿每页内容最低边 vs 该页页脚上边。
# 用法：python3 量-每页溢出.py <html 绝对路径>
# 为什么不用 PDF 数：PDF 里被 .page{overflow:hidden} 裁掉的东西是"看不见"，不是"少一页"，
# 只看页数会判不出截断；DOM 里元素的下边还在，能量出超了多少。
import json, re, subprocess, sys, pathlib, tempfile

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
src = pathlib.Path(sys.argv[1]).resolve()
html = src.read_text(encoding="utf-8")

probe = """<script>
(function(){
  var out=[];
  document.querySelectorAll("article.page").forEach(function(p,i){
    var pr=p.getBoundingClientRect();
    var f=p.querySelector("footer.footer");
    var vis=f&&f.offsetHeight>0;               // 封面那页 .cover .footer{display:none}，不能拿它的 rect 当线
    var limit=vis?f.getBoundingClientRect().top:pr.bottom-62*96/72;
    var low=-1e9, worst="";
    p.querySelectorAll("*").forEach(function(e){
      // 页脚绝对定位、压在 padding 里，永远不算内容；main 的下边只多吃了末段留白
      if(e===f||(f&&f.contains(e))||e.tagName==="MAIN")return;
      var r=e.getBoundingClientRect();
      if(r.height===0&&r.width===0)return;
      if(r.bottom>low){low=r.bottom;worst=e.tagName.toLowerCase()+"."+(e.className||"").toString().split(" ")[0];}
    });
    out.push({page:p.getAttribute("data-page")||String(i+1),bottom:Math.round(low),limit:Math.round(limit),
              over:Math.round(low-limit),worst:worst});
  });
  var pre=document.createElement("pre");
  pre.id="ovf";pre.textContent=JSON.stringify(out);
  document.body.appendChild(pre);
})();
</script>"""
tmp = pathlib.Path(tempfile.mkdtemp()) / (src.stem + ".probe.html")
tmp.write_text(html.replace("</body>", probe + "</body>"), encoding="utf-8")

r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
                    "--window-size=1000,1400", "--virtual-time-budget=25000",
                    "--dump-dom", f"file://{tmp}"], capture_output=True, text=True)
m = re.search(r'<pre id="ovf">(.*?)</pre>', r.stdout, re.S)
if not m:
    print("拿不到探针输出，chrome 退出码", r.returncode, r.stderr[-400:])
    sys.exit(1)
rows = json.loads(m.group(1).replace("&quot;", '"'))
red = [x for x in rows if x["over"] > 1]
print(f"共 {len(rows)} 页，溢出 {len(red)} 页（>1px 算红）")
for x in rows:
    flag = "红" if x["over"] > 1 else "  "
    print(f" {flag} P{int(x['page']):>2}  内容底 {x['bottom']:>5}  页脚上 {x['limit']:>5}  差 {x['over']:>4}  最靠下 {x['worst']}")
if red:
    sys.exit(2)
