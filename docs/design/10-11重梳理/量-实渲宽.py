#!/usr/bin/env python3
"""实渲染量尺：把成品 HTML 用 headless Chrome 打开，逐张 svg 量出
  ① 实渲宽度（pt）与 viewBox 宽之比 —— 判「1 单位是不是 1pt」
  ② 每个 <text> 的 getComputedTextLength()（换算成纸上 pt）
  ③ 每个 <text> 是否越出自己所在方框 / 整个 viewBox
用法：python3 量-实渲宽.py <html 路径> [页号…]
产物：stdout 一张表 + 越界清单
"""
import json, pathlib, re, subprocess, sys, tempfile

CHROME = ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
PROBE = r"""
<script>
addEventListener('load', () => {
  const pt = px => px * 72 / 96;
  const out = [];
  document.querySelectorAll('article.page').forEach(pg => {
    const n = pg.getAttribute('data-page');
    pg.querySelectorAll('svg').forEach((svg, k) => {
      const vb = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
      const r = svg.getBoundingClientRect();
      const scale = vb[2] ? r.width / vb[2] : 1;   // css px per user unit
      const bad = [];
      svg.querySelectorAll('text').forEach(t => {
        let L = 0;
        try { L = t.getComputedTextLength(); } catch (e) { return; }
        const bb = t.getBBox();
        const anchor = t.getAttribute('text-anchor') || 'start';
        const x = parseFloat(t.getAttribute('x') || bb.x);
        let x0 = x, x1 = x + L;
        if (anchor === 'middle') { x0 = x - L / 2; x1 = x + L / 2; }
        if (anchor === 'end')    { x0 = x - L;     x1 = x; }
        const cls = t.getAttribute('class') || '';
        const txt = t.textContent.trim().slice(0, 26);
        if (x0 < -0.5 || x1 > vb[2] + 0.5) bad.push({ txt, cls, x0: +x0.toFixed(1), x1: +x1.toFixed(1) });
        out.push({ p: n, k, cls, txt, u: +L.toFixed(1), pt: +(L * scale * 72 / 96).toFixed(2) });
      });
      out.push({ p: n, k, META: true, vbw: vb[2], vbh: vb[3],
                 cssw: +r.width.toFixed(2), ptw: +pt(r.width).toFixed(2),
                 scale: +scale.toFixed(4), ratio: +(pt(r.width) / vb[2]).toFixed(4),
                 fontPt: {}, bad });
    });
  });
  document.title = 'PROBE' + JSON.stringify(out);
});
</script>
"""


def probe(path):
    html = pathlib.Path(path).read_text(encoding="utf-8")
    assert "</body>" in html
    html = html.replace("</body>", PROBE + "</body>", 1)
    tmp = pathlib.Path(tempfile.mkdtemp()) / "probe.html"
    tmp.write_text(html, encoding="utf-8")
    dom = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
                          "--virtual-time-budget=25000", "--dump-dom", tmp.as_uri()],
                         capture_output=True, text=True, timeout=240).stdout
    m = re.search(r"<title>PROBE(.*?)</title>", dom, re.S)
    assert m, "探针没写回 title；chrome 输出前 400 字：" + dom[:400]
    return json.loads(m.group(1))


if __name__ == "__main__":
    src = sys.argv[1]
    want = {int(a) for a in sys.argv[2:]}
    rows = probe(src)
    metas = [r for r in rows if r.get("META")]
    texts = [r for r in rows if not r.get("META")]
    print(f"{src}\n共 {len(metas)} 张 svg，{len(texts)} 个 <text>\n")
    print("页  #  viewBox宽   实渲pt   pt/单位   判读")
    for m in metas:
        if want and int(m["p"]) not in want:
            continue
        ok = "1:1" if abs(m["ratio"] - 1) < 0.01 else f"缩放 {m['ratio']}"
        print(f"P{m['p']:>2} {m['k']}  {m['vbw']:>7}×{m['vbh']:<4} {m['ptw']:>8}  {m['ratio']:>8}   {ok}")
        for b in m["bad"]:
            print(f"        ⚠ 越出 viewBox：「{b['txt']}」class={b['cls']} x {b['x0']}..{b['x1']}")
    if want:
        print("\n--- 指定页的字号实渲（纸上 pt）---")
        for t in texts:
            if int(t["p"]) in want:
                print(f"P{t['p']:>2}#{t['k']} .{t['cls']:<10} {t['pt']:>5}pt  宽{t['u']:>6}u  「{t['txt']}」")
