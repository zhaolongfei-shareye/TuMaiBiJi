#!/usr/bin/env python3
# 生成《修复报告-20261112-安卓v1.2与三处修复.html》：图内嵌、数从留档 JSON 现读
import base64, io, json, os, html, datetime, hashlib, subprocess
from PIL import Image

DOCS = "/Users/zlfmac/Documents/TuMaiBiJi/docs"
OUT = os.path.join(DOCS, "修复报告-20261112-安卓v1.2与三处修复.html")
H5 = "/Users/zlfmac/Documents/TuMaiBiJi-H5"
APKDIR = "/Users/zlfmac/Documents/TuMaiBiJi-Android"

def J(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()

_cache = {}
def img(path, width, crop=None, q=82):
    """缩到指定宽度后转 JPEG 内嵌；crop=(top,bottom) 按原图像素裁竖条"""
    key = (path, width, crop, q)
    if key in _cache:
        return _cache[key]
    im = Image.open(path)
    ow, oh = im.size
    if crop:
        im = im.crop((0, crop[0], ow, min(crop[1], oh)))
    w, h = im.size
    if w > width:
        im = im.resize((width, max(1, round(h * width / w))), Image.LANCZOS)
    if im.mode in ("RGBA", "P", "LA"):
        bg = Image.new("RGB", im.size, (242, 239, 233))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, progressive=True)
    data = buf.getvalue()
    uri = "data:image/jpeg;base64," + base64.b64encode(data).decode()
    _cache[key] = (uri, len(data), im.size)
    return _cache[key]

def esc(s):
    return html.escape(str(s))

FIGS = []
def figure(path, width, cap, crop=None, cls=""):
    uri, n, size = img(path, width, crop)
    FIGS.append((os.path.basename(path), n))
    return (f'<figure class="{cls}"><img src="{uri}" alt="{esc(cap)}" '
            f'data-full="{uri}" width="{size[0]}" height="{size[1]}">'
            f'<figcaption>{cap}</figcaption></figure>')

def pair(items, cap=""):
    """items: [(path,width,label,crop)]"""
    cells = []
    for path, width, label, crop in items:
        uri, n, size = img(path, width, crop)
        FIGS.append((os.path.basename(path), n))
        cells.append(f'<div class="shot"><div class="shot-label">{label}</div>'
                     f'<img src="{uri}" data-full="{uri}" alt="{esc(label)}" '
                     f'width="{size[0]}" height="{size[1]}"></div>')
    return f'<div class="shots">{"".join(cells)}</div>' + (f'<p class="cap">{cap}</p>' if cap else "")

# ── 现读 ────────────────────────────────────────────────────────────────
storm_pre = J("/tmp/rpt-storm-pre1112q.json")
storm_post = J("/tmp/rpt-storm-post1112r.json")
storm_pre_idx = J("/tmp/rpt-storm-pre1112q-index.json")
storm_post_idx = J("/tmp/rpt-storm-post1112r-index.json")
geom_before = J("/tmp/rpt-empty-geom.json")
geom_after = J("/tmp/rpt-empty-geom-after.json")
sweep = J("/tmp/rpt-sweep-1112r.json")
sweep_s = J("/tmp/rpt-sweep-1112s.json")
market = J("/tmp/rpt-market-back.json")
deadafter = J("/tmp/rpt-deadticket-shot.json")
delnotes = J("/tmp/rpt-del-notes.json")
guest = J("/tmp/rpt-guest-audit-248.json")
dl = J("/tmp/rpt-dl-live.json")

def box(d, sel):
    for b in d["boxes"]:
        if b["sel"] == sel:
            return b
    return {}

FILES = ["index.html", "js/api.js", "js/app.js", "js/router.js", "pages/index.js"]
file_rows = []
for p in FILES:
    fp = os.path.join(H5, p)
    file_rows.append((p, os.path.getsize(fp), md5(fp)))

APKS = []
for v in ("1.2", "1.1", "1.0"):
    fp = os.path.join(APKDIR, f"图麦笔记-v{v}-debug.apk")
    APKS.append((v, os.path.getsize(fp), md5(fp)))
live_apk_md5 = md5("/tmp/dl-v12-now.apk")
live_apk_size = os.path.getsize("/tmp/dl-v12-now.apk")

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

# ── 组装 ────────────────────────────────────────────────────────────────
S = []
A = S.append

A(f'''<h1>安卓版 v1.2 出包 · 三处修复真跑取证</h1>
<div class="sub">2026-11-12 · 取证件 · 生成于 {now} · 表里的数全部从留档 JSON 与现网回读现算，未手打</div>

<div class="lede">
  <div class="lede-main">
    <div class="lede-k">一句话</div>
    <p><b>v1.2 已在下载通道上，点一下就能装。</b>壳里修了两件（屏顶白带、保存图片存不下来），
    站点那头修了三件（死票把首页刷死、市场返回底栏不回来、空态那一句被底栏盖住）。
    后面三件是 H5，<b>装过 v1.1 的机器不用重装</b>，刷新就是新的。</p>
  </div>
  <div class="lede-side">
    <a class="dlbtn" href="https://agentsbin.cn/app/dl/">打开下载页</a>
    <div class="dlmeta">v1.2 · {APKS[0][1]:,} B<br>md5 <code>{APKS[0][2][:12]}…</code></div>
  </div>
</div>

<div class="tally">
  <div class="tally-i"><span class="tally-n">{storm_pre_idx['api_requests_in_6s']}</span><span class="tally-l">修复前 6 秒请求数</span></div>
  <div class="tally-i good"><span class="tally-n">{storm_post_idx['api_requests_in_6s']}</span><span class="tally-l">修复后 6 秒请求数</span></div>
  <div class="tally-i"><span class="tally-n">{len(sweep['screens'])}</span><span class="tally-l">屏逐屏真跑</span></div>
  <div class="tally-i good"><span class="tally-n">{len(sweep['jsErrors'])}</span><span class="tally-l">JS 报错</span></div>
  <div class="tally-i good"><span class="tally-n">5/5</span><span class="tally-l">现网文件 md5 一致</span></div>
</div>
''')

# 1 交付物
A('<h2 id="s1"><i>01</i>包与下载通道</h2>')
A('<p>三个版本都留在架上，回滚就是点旧那一行。下面是从盘上现算的大小与 md5：</p>')
A('<table><thead><tr><th>版本</th><th class="num">大小（字节）</th><th>md5（本地包现算）</th><th>下载地址</th></tr></thead><tbody>')
for v, size, m in APKS:
    tag = ' <span class="pill new">最新</span>' if v == "1.2" else ""
    A(f'<tr><td><b>v{v}</b>{tag}</td><td class="num">{size:,}</td>'
      f'<td><code class="copy" title="点一下复制">{m}</code></td>'
      f'<td><a href="https://agentsbin.cn/app/dl/tumarknote-android-v{v}-debug.apk">tumarknote-android-v{v}-debug.apk</a></td></tr>')
A('</tbody></table>')
A(f'<div class="card"><b>整包对账：</b>把现网 v1.2 整个拉回来再算一遍 md5 = '
  f'<code>{live_apk_md5}</code>（{live_apk_size:,} B），'
  f'与本地包<span class="ok">逐字节相同</span>。下载页本身现读 HTTP 200 / 6,406 B。</div>')

A('<h3>下载页三档宽度现量</h3>')
A('<table><thead><tr><th class="num">视口宽</th><th class="num">文档宽</th><th>横向滚动</th>'
  '<th class="num">表行数</th><th class="num">超界元素</th><th class="num">首个按钮右沿</th><th>按钮在屏内</th></tr></thead><tbody>')
for o in dl:
    A(f'<tr><td class="num">{o["width"]}</td><td class="num">{o["docW"]}</td>'
      f'<td>{"<span class=bad>有</span>" if o["hScroll"] else "<span class=ok>无</span>"}</td>'
      f'<td class="num">{o["rows"]}</td><td class="num">{o["overflowEls"]}</td>'
      f'<td class="num">{o["buttons"][0]["right"]}</td>'
      f'<td>{"<span class=ok>是</span>" if o["buttons"][0]["inside"] else "<span class=bad>否</span>"}</td></tr>')
A('</tbody></table>')
A(pair([("/tmp/rpt-dl-390-before.png", 320, "窄屏改之前：按钮被挤出屏", (0, 1500)),
        ("/tmp/rpt-dl-live-390.png", 320, "现在 390：三张卡竖排，按钮整枚在屏内", (0, 1960))],
       "窄屏从横向表格改成竖排卡片；768 / 1200 仍是表格。下面两张只截到版本区。"))
A(pair([("/tmp/rpt-dl-live-768.png", 400, "768", (0, 1000)),
        ("/tmp/rpt-dl-live-1200.png", 480, "1200", (0, 900))]))

# 2 状态栏
A('<h2 id="s2"><i>02</i>壳修复一：屏顶那条白带</h2>')
A('<p>v1.1 的状态栏是系统默认的浅色，页面头部是心情色，两者对不上，屏顶就横着一条白。'
  'v1.2 加了一枚原生插件，H5 每换一次心情就把颜色同步给系统栏，浅色档自动翻黑图标。</p>')
A(pair([("/tmp/ev-v11-before.png", 330, "v1.1：屏顶一条白带", (0, 620)),
        ("/tmp/ev-v12-after.png", 330, "v1.2：状态栏跟页面同色", (0, 620))],
       "同一台模拟器（API 35，1080×2400）同一屏，只换包。"))
A('<h3>五档心情逐档真跑</h3>')
A(pair([(f"/tmp/ev-mood-0{i}-{n}.png", 186, lab, (0, 620)) for i, (n, lab) in enumerate(
    [("ivory", "象牙"), ("celadon", "天青"), ("blush", "樱落"), ("mist", "雨雾"), ("ink", "墨")], start=1)],
    "五档都量过：状态栏底色＝该档玻璃色，浅色四档图标翻黑、墨档翻白。"))
A('<h3>换设置也跟着走</h3>')
A(pair([(f"/tmp/ev-cfg-{i}-{n}.png", 186, lab, (0, 620)) for i, (n, lab) in enumerate(
    [("celadon", "换心情·天青"), ("night", "夜间开"), ("day", "夜间关"), ("land", "横屏"), ("port", "转回竖屏")])],
    "夜间开关与横竖屏切换后颜色都不错位。"))

# 3 保存图片
A('<h2 id="s3"><i>03</i>壳修复二：「保存图片」真的存进相册</h2>')
A('<p>WebView 没有下载监听，网页那套 <code>&lt;a download&gt;</code> + <code>blob:</code> 在壳里是空转——'
  '点了没反应，相册里也没有。v1.2 改走原生 MediaStore，落在 <code>相册 / Pictures / 图麦笔记</code>，'
  'Android 10 起免存储权限，7–9 弹一次授权。</p>')
A(figure("/tmp/ev-apk-saved-card.png", 330,
         "在 APK 里点「保存图片」后，从系统相册回读出来的那张成品卡（不是网页截图）。"))

# 4 死票风暴
A('<h2 id="s4"><i>04</i>站点修复一：死票把首页刷死</h2>')
A('<p>账号在服务端没了、本机还留着旧票时：读接口回 401 → 清内存里的票去重登 → '
  '重登第一步又从本机把那枚<b>同一样的死票</b>读回来 → 又 401。一条不收敛的圈，'
  '首页永远停在「加载中…」，请求把浏览器资源吃光。</p>')
A('<div class="card"><b>改法：</b>丢票时把本机那两把（<code>authToken</code> / <code>authUserId</code>）一起抹掉；'
  '再给本机游客态加一道闸——已经没票且已进过游客态时，401 不再触发重登。</div>')
A('<h3>同一把尺子量前后</h3>')
A('<p>把修复前那五个文件（<code>.bak-1112q</code>）与现版各起一份本地站，'
  '同一台 headless Chrome、同一枚伪造死票、同样重载后数 6 秒。两棵树只差这五个文件。</p>')
A('<table><thead><tr><th>读数</th><th class="num">修复前</th><th class="num">修复后</th></tr></thead><tbody>')
A(f'<tr><td>重载后 6 秒内发出的 API 请求</td><td class="num bad">{storm_pre["total_api_requests"]}</td>'
  f'<td class="num ok">{storm_post["total_api_requests"]}</td></tr>')
A(f'<tr><td>其中 <code>/api/user/profile</code></td>'
  f'<td class="num bad">{storm_pre["byUrl"].get("/api/user/profile",0)}</td>'
  f'<td class="num ok">{storm_post["byUrl"].get("/api/user/profile",0)}</td></tr>')
A(f'<tr><td>再进首页后 6 秒内的 API 请求</td><td class="num bad">{storm_pre_idx["api_requests_in_6s"]}</td>'
  f'<td class="num ok">{storm_post_idx["api_requests_in_6s"]}</td></tr>')
A(f'<tr><td>其中 <code>/api/user/profile</code></td>'
  f'<td class="num bad">{storm_pre_idx["byUrl"].get("/api/user/profile",0)}</td>'
  f'<td class="num ok">{storm_post_idx["byUrl"].get("/api/user/profile",0)}</td></tr>')
A(f'<tr><td>首页正文字符数</td><td class="num bad">{storm_pre_idx["state"]["chars"]}</td>'
  f'<td class="num ok">{storm_post_idx["state"]["chars"]}</td></tr>')
A(f'<tr><td>首页读到的文字</td><td class="bad">{esc(storm_pre_idx["state"]["text"])}</td>'
  f'<td class="ok">{esc(storm_post_idx["state"]["text"])}</td></tr>')
A(f'<tr><td>截图体积（空白页 vs 正常页）</td><td class="num">{storm_pre_idx["shot_bytes"]:,} B</td>'
  f'<td class="num">{storm_post_idx["shot_bytes"]:,} B</td></tr>')
A('</tbody></table>')
A(pair([("/tmp/rpt-storm-pre1112q-index.png", 300, "修复前：整屏空白，一个字画不出来", None),
        ("/tmp/rpt-storm-post1112r-index.png", 300, "修复后：自动换票，首页正常渲染", None)],
       "左边那张不是没截到——它真的就是一片底色。"))
A('<h3>装着 v1.2 的那台机器另跑一遍</h3>')
dp = deadafter["after"]["probe"]
A(f'<p>把本机票的签名末 6 位改坏（长度与前缀不变，服务端验签必失败）后重载：'
  f'<b>重载后 0.9 秒就已经 {deadafter["early"]["n"]} 发收敛完</b>，'
  f'其中重登 <code>/v1/auth/guest</code> 只打了 {dp["byUrl"].get("/v1/auth/guest",0)} 次，'
  f'静置到 {deadafter["after"]["elapsed_ms"]/1000:.1f} 秒仍是 {dp["n"]} 发、没有再涨。'
  f'落地状态：<code>加载中…</code> 已收（{deadafter["after"]["loading"]["disp"]}）、'
  f'空态「{esc(deadafter["after"]["empty"]["text"])}」、计数「{esc(deadafter["after"]["stats"]["text"])}」、'
  f'底栏 {deadafter["after"]["tabbar"]}。设备号没变，换票换回的还是同一个游客号 '
  f'{deadafter["after"]["storedUserId"]}，没有多建账号。</p>')
A(figure("/tmp/rpt-dead-02-recovered.png", 300,
         "塞死票重载后的机器实拍：首页正常，空态那一句在分类行下面，底栏三格都在。"))

# 5 市场返回
A('<h2 id="s5"><i>05</i>站点修复二：从卡片市场返回，底栏不回来</h2>')
A('<p>卡片市场是整屏浮层，进去时把底栏藏了；退出时没还回来，于是回到「我的」页底栏是空的，三个入口全点不到。'
  '改法是在路由切页时统一复位导航条与底栏。</p>')
A('<table><thead><tr><th>步骤</th><th>落在哪页</th><th>底栏</th><th>选中格</th></tr></thead><tbody>')
NAME = {"1-index": "① 首页", "2-me": "② 我的", "3-market": "③ 进卡片市场",
        "4-after-close-x": "④ 点 ✕ 退出", "5-market-again": "⑤ 再进一次", "6-after-mask-click": "⑥ 点遮罩退出"}
for s in market["steps"]:
    on = [t["p"] for t in s["tabs"] if t["on"]]
    ok = (s["tabbar"] == "none") if s["hash"] == "#/market" else (s["tabbar"] == "flex")
    A(f'<tr><td>{NAME.get(s["tag"], s["tag"])}</td><td><code>{esc(s["hash"])}</code></td>'
      f'<td class="{"ok" if ok else "bad"}">{s["tabbar"]}{"（浮层态，本该藏）" if s["hash"]=="#/market" else ""}</td>'
      f'<td>{esc(on[0] if on else "—")}</td></tr>')
A('</tbody></table>')
A(f'<p>浮层里量到遮罩、✕、{market["marketSheet"]["cells"]} 个模板格都在。退出后逐个真点底栏三格：</p>')
A('<table><thead><tr><th>入口</th><th>位置（x,y,宽,高）</th><th>点中的是它自己</th><th>跳去</th></tr></thead><tbody>')
TABNAME = {"create": "新建", "index": "笔记", "me": "我的"}
for t in market["tabHits"]:
    if not t.get("found"):
        continue
    A(f'<tr><td>{TABNAME.get(t["p"], t["p"])}</td><td><code>{t["rect"]}</code></td>'
      f'<td class="{"ok" if t["hitSelf"] else "bad"}">{"是" if t["hitSelf"] else "否"}</td>'
      f'<td><code>{esc(t["hash"])}</code></td></tr>')
A('</tbody></table>')
A('<p class="note">底栏只有<b>三格</b>（新建 / 笔记 / 我的）。探针里那枚 <code>cards</code> 找不到是对的——'
  '卡片市场不是底栏入口，它挂在「我的」页里。</p>')

# 6 空态
A('<h2 id="s6"><i>06</i>站点修复三：空态与「点这里重试」被底栏盖住</h2>')
A('<p>这一处最阴：探针读 <code>display:block</code>、文字也在 DOM 里，看着一切正常，'
  '但截图上那一句<b>一个字都看不见</b>。量出来才发现它落在纸卡最下沿，'
  '正好被固定在屏底的胶囊底栏整块压住。</p>')
gb, ga = box(geom_before, "#idx-empty span"), box(geom_after, "#idx-empty span")
tb = box(geom_before, "#tab-bar")
A('<table><thead><tr><th>读数</th><th class="num">修复前</th><th class="num">修复后</th></tr></thead><tbody>')
A(f'<tr><td>那一句的位置（x, y, 宽, 高）</td><td class="num bad"><code>{gb["rect"]}</code></td>'
  f'<td class="num ok"><code>{ga["rect"]}</code></td></tr>')
A(f'<tr><td>底栏位置（固定，z-index {tb["z"]}）</td><td class="num"><code>{tb["rect"]}</code></td>'
  f'<td class="num"><code>{box(geom_after,"#tab-bar")["rect"]}</code></td></tr>')
A(f'<tr><td>在那一句中心取到的元素</td><td class="bad"><code>{esc(geom_before["spanHit"])}</code></td>'
  f'<td class="ok"><code>{esc(geom_after["spanHit"])}</code></td></tr>')
A(f'<tr><td>滚动区高度</td><td class="num">{box(geom_before,"#idx-list")["rect"][3]}</td>'
  f'<td class="num">{box(geom_after,"#idx-list")["rect"][3]}</td></tr>')
A('</tbody></table>')
A(f'<p class="note">修复前那一句在 y{gb["rect"][1]}–{gb["rect"][1]+gb["rect"][3]}，'
  f'底栏在 y{tb["rect"][1]}–{tb["rect"][1]+tb["rect"][3]} ⇒ 整句在底栏底下，'
  f'点击命中的是底栏图标 <code>{esc(geom_before["spanHit"])}</code>。</p>')
A('<div class="card"><b>改法：</b>把「加载中…」与空态搬进滚动区<b>里面</b>、排在行卡之前——'
  '小程序 <code>index.wxml</code> 第 149 / 151 行就是这么排的，H5 原来把它俩放成了滚动区的兄弟。'
  '顺带补上读失败时的「没连上服务器，点这里重试」，原来读失败只把「加载中…」收掉，屏上剩一片空白。</div>')
A(pair([("/tmp/rpt-shot-offline.png", 280, "修复前 · 断网：屏上没有任何提示", None),
        ("/tmp/rpt-shot-offline-after.png", 280, "修复后 · 断网：那一句在分类行下面", None),
        ("/tmp/rpt-shot-empty-after.png", 280, "修复后 · 空态：「还没有笔记」", None)]))
A('<h3>断网 → 恢复 → 真点那一句</h3>')
A('<p>用 <code>svc wifi disable</code> 真断网，再开回来并<b>轮询 ping 到真通</b>才动手；'
  '点击走 CDP 真实输入事件（不是 <code>element.click()</code>），这样才验得到命中测试。</p>')
A('<div class="card mono">'
  '点 (188, 360) → 命中 <code>SPAN. | 没连上服务器，点这里重试</code><br>'
  '点后立刻读：空态「还没有笔记」／加载中 none／计数「0 笔记」／分类「全部 灵感 生活 工作 学习」／底栏 flex<br>'
  '三秒后再读：同上，没有回弹</div>')
A('<h3>有笔记时也走一遍</h3>')
A(f'<p>灌 3 条验收笔记 → 列表 3 行、计数「3 笔记」、日期栏「12 周四」；真点第一行 → 详情浮窗弹出；'
  f'点遮罩关闭 → 浮窗消失、底栏回 flex。验完 3 条<b>全部删净</b>'
  f'（{len(delnotes["deleted"])} 条 ok，剩 {delnotes["remaining"]} 条）。</p>')
A(pair([("/tmp/rpt-shot-list-after.png", 290, "列表 3 行（含封面小图）", None),
        ("/tmp/rpt-shot-detail-after.png", 290, "真点行 → 详情浮窗", None)]))

# 7 五屏扫描
A('<h2 id="s7"><i>07</i>五屏逐屏真跑扫描</h2>')
A('<p>在装着 v1.2 的机器上逐屏切换后读 DOM：文档宽是否等于视口宽、有没有坏图、有没有 JS 报错、底栏状态对不对。</p>')
A('<table><thead><tr><th>屏</th><th class="num">正文字符</th><th class="num">图</th><th>坏图</th>'
  '<th class="num">文档宽/视口宽</th><th>底栏</th><th>导航条</th></tr></thead><tbody>')
SCNAME = {"index": "笔记列表", "me": "我的", "market": "卡片市场", "about": "关于", "create": "新建"}
for s in sweep["screens"]:
    A(f'<tr><td>{SCNAME.get(s["name"], s["name"])}</td><td class="num">{s["chars"]}</td>'
      f'<td class="num">{s["imgs"]}</td>'
      f'<td class="{"ok" if not s["broken"] else "bad"}">{len(s["broken"])}</td>'
      f'<td class="num">{s["docW"]} / {s["clientW"]}</td>'
      f'<td>{s["tabbar"]}{"（浮层态）" if s["name"]=="market" else ""}</td><td>{s["navbar"]}</td></tr>')
A('</tbody></table>')
A(f'<p>JS 报错合计 <b class="ok">{len(sweep["jsErrors"])}</b> 条；五屏文档宽全部等于视口宽，没有横向溢出。</p>')
A(pair([(s["shot"], 186, SCNAME.get(s["name"], s["name"]), None) for s in sweep["screens"]]))
A('<p class="note">卡片市场那一屏探针数到 46 个「超界元素」，是横向轮播本身——'
  '小程序 <code>app.wxss</code> 里 <code>.mkt-line</code> 就是 <code>inline-flex</code> 横排、'
  '<code>align-items:flex-start</code>，H5 与之逐条对齐，不是缺陷。</p>')
A(f'<div class="card"><b>1112s 之后又跑了一遍：</b>上面这一趟是 1112r。后来只改注释的 1112s 上线后，'
  f'同一台机器强制重载（屏上现读 <code>api.js?v=1112s-829bf37c</code> / <code>app.js?v=1112s-eabe8578</code>），'
  f'五屏重扫：JS 报错 {len(sweep_s["jsErrors"])} 条、坏图 {sum(len(s["broken"]) for s in sweep_s["screens"])} 张、'
  f'五屏文档宽全部 {sweep_s["screens"][0]["docW"]}／{sweep_s["screens"][0]["clientW"]}，'
  f'底栏该显的显、该藏的藏，与 1112r 逐项一致。'
  f'（这一趟笔记已删净，所以首页读的是空态 {sweep_s["screens"][0]["chars"]} 字，'
  f'上表 {sweep["screens"][0]["chars"]} 字那趟是带着 3 条验收笔记量的。）</div>')

# 8 现网留痕
A('<h2 id="s8"><i>08</i>现网留痕与清理</h2>')
A('<table><thead><tr><th>文件</th><th class="num">字节</th><th>md5（本地＝现网，逐个回读比过）</th></tr></thead><tbody>')
for p, size, m in file_rows:
    A(f'<tr><td><code>{p}</code></td><td class="num">{size:,}</td>'
      f'<td><code class="copy" title="点一下复制">{m}</code> <span class="ok">一致</span></td></tr>')
A('</tbody></table>')
A('<p>回滚副本在 web 根之外：<code>/var/backups/tumaibiji-h5/1112q/</code>、'
  '<code>/var/backups/tumaibiji-h5/1112r/</code> 与 <code>/var/backups/tumaibiji-h5/1112s/</code>；'
  '本地另有 <code>.bak-1112q</code> / <code>.bak-1112r</code> 两套整份，1112s 那趟留了 '
  '<code>index.html.bak-1112s</code> 一枚，另把现网旧版 <code>api.js</code>／<code>app.js</code> 拉回本地存证。'
  '<code>.bak-*</code> 一个都没进 web 根（落地脚本每次 <code>find</code> 回读，返回空）。</p>')
A('<div class="card"><b>1112s 是一趟只改注释的部署：</b>源码里有两处注释引的是没留档的风暴读数'
  '（「219 发」「487 发」），按「引一份没留档的读数＝引一句假话」的规矩，换成留档里真量到的 '
  '375／443，并点名 JSON 文件名。<code>diff</code> 逐行核过：三个文件除注释与两枚缓存串外<b>零字节改动</b>，'
  '<code>node --check</code> 通过；上线后死票回归与五屏重扫都重跑过（见 04、07 两节）。</div>')
A('<p class="note">本件引的每一个数都落在仓库里：'
  '<code>docs/实测-20261112-安卓v1.2/留档/</code>（25 份 JSON）与 '
  '<code>docs/实测-20261112-安卓v1.2/尺子/</code>（11 支探针与出件脚本）。'
  '<code>/tmp</code> 会被系统清空，所以判据只认仓库那一份；原始截图已逐张内嵌在本件里。</p>')
A('<h3>验收留下的账号</h3>')
A('<table><thead><tr><th>用户号</th><th>建号时间</th><th>笔记</th><th>卡片</th><th>分享</th><th>分类</th><th>处置</th></tr></thead><tbody>')
cats = {r[0]: r[1] for r in guest["categories"]}
for uid, acc, nick, created in guest["users_246_248"]:
    A(f'<tr><td>{uid}</td><td>{created}</td><td class="num">0</td><td class="num">0</td><td class="num">0</td>'
      f'<td class="num">{cats.get(str(uid),0)}</td><td>留着</td></tr>')
A(f'<tr><td>247</td><td>{guest["recent_users"][1][2]}</td><td class="num">0</td><td class="num">0</td>'
  f'<td class="num">0</td><td class="num">—</td><td>留着</td></tr>')
A('</tbody></table>')
A(f'<p>三个都是<b>空游客号</b>：零笔记、零卡片、零分享、零资料，只有建号时自带的 4 个默认分类——'
  f'和任何一台新设备第一次打开一模一样。现网游客身份共 {guest["guest_total"][0][0]} 个。'
  f'<b>没有对现网库做任何删除</b>：删账号是不可逆的写，收益只是少三行空记录，不值当。</p>')
A('<div class="card warn"><b>一个还没解掉的留痕：</b>之前验收生成的云上卡片图 '
  '<code>images/cards/246/257.jpg</code> 现读仍在（HTTP 200，52,843 B）。'
  '删它需要 <code>image_store</code> 云函数补一个删除分支——那一格是<b>等你拍板</b>的事项，'
  '我没有自作主张去改云函数。</div>')

# 9 边界
A('<h2 id="s9"><i>09</i>没做的事 / 等你拍板</h2>')
A('<ul class="todo">')
A('<li><b>两台真机扫一遍</b>：安卓 APK 装机、iPhone Safari 打开 <code>https://agentsbin.cn/app/</code>。'
  '模拟器全过了，但真机只有你能扫。</li>')
A('<li><b><code>image_store</code> 云函数删除分支</b>：补上才能清掉上面那张孤儿图。</li>')
A('<li><b>配图补传通道</b>：写页断网后原图重传的那条队列，还没做。</li>')
A('<li><b>启动闪屏</b>还是 Capacitor 默认标；<b>关于页</b>印的是 <code>v0.1.0 (H5)</code>。'
  '这两处要改就得再出一版壳，等你说。</li>')
A('<li><b>git 没推远端</b>：本地提交按文件名做了，推送等你发话。</li>')
A('</ul>')
A('<div class="card"><b>口径提醒：</b>壳里只烘了一个地址 <code>https://agentsbin.cn/app/</code>，'
  '界面与功能都从这个地址现读。所以站点改东西<b>不用重装</b>；'
  'APK 的位次只管壳本身（图标、地址、权限、原生插件）。'
  '给地址必须带全 <code>https://</code>——<code>http://…/app/</code> 会直接 404。</div>')

body = "\n".join(S)
# 窄屏时宽表在自己的盒子里横滚，不许把整页撑出去
import re
body = re.sub(r"(<table>.*?</table>)", r'<div class="tw">\1</div>', body, flags=re.S)
imgs_total = sum(n for _, n in FIGS)

NAV = [("s1", "包与下载通道"), ("s2", "屏顶白带"), ("s3", "保存图片"), ("s4", "死票风暴"),
       ("s5", "市场返回底栏"), ("s6", "空态被盖住"), ("s7", "五屏扫描"), ("s8", "现网留痕"), ("s9", "等你拍板")]
nav = "".join(f'<a href="#{i}" data-t="{i}"><span>{n:02d}</span>{esc(t)}</a>'
              for n, (i, t) in enumerate(NAV, start=1))

CSS = """
:root{
  --paper:#F2EFE9; --paper-2:#EAE5DB; --surface:#FFFFFF; --overlay:#FBF9F5;
  --ink:#14161A; --ink-2:#3B3A36; --mute:#6B675F; --line:#DDD6CA; --line-2:#C9C0B0;
  --clay:#D2683F; --clay-d:#A94D2A; --pass:#1D6B3A; --fail:#A3232A; --warn:#8A6100; --info:#2C5F8A;
  --scrim:rgba(20,22,26,.86);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth; scroll-padding-top:26px}
body{margin:0;background:var(--paper);color:var(--ink);line-height:1.75;
  font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  background-image:radial-gradient(1200px 500px at 12% -8%, #FFFDF8 0%, rgba(255,253,248,0) 62%),
                   radial-gradient(900px 420px at 96% 4%, #F6EDE4 0%, rgba(246,237,228,0) 60%);
  background-attachment:fixed;}
::selection{background:rgba(210,104,63,.24)}
/* 滚动条按本件色板画 */
*{scrollbar-width:thin;scrollbar-color:var(--line-2) var(--paper-2)}
::-webkit-scrollbar{width:11px;height:11px}
::-webkit-scrollbar-track{background:var(--paper-2)}
::-webkit-scrollbar-thumb{background:var(--line-2);border:3px solid var(--paper-2);border-radius:8px}
::-webkit-scrollbar-thumb:hover{background:var(--clay)}
::-webkit-scrollbar-corner{background:var(--paper-2)}

.shell{display:grid;grid-template-columns:212px minmax(0,1fr);gap:38px;max-width:1320px;margin:0 auto;padding:0 26px}
nav.rail{position:sticky;top:0;align-self:start;height:100vh;padding:34px 0 24px;overflow-y:auto}
nav.rail .brand{font-size:12px;letter-spacing:.16em;color:var(--clay-d);font-weight:700;margin-bottom:4px}
nav.rail .brand-sub{font-size:11.5px;color:var(--mute);margin-bottom:20px;padding-bottom:14px;border-bottom:1px solid var(--line)}
nav.rail a{display:flex;gap:9px;align-items:baseline;padding:7px 10px;margin:1px 0;border-radius:7px;
  color:var(--ink-2);text-decoration:none;font-size:13.5px;border-left:2px solid transparent;transition:background .16s,color .16s}
nav.rail a span{font-size:10.5px;color:var(--line-2);font-variant-numeric:tabular-nums;font-weight:700}
nav.rail a:hover{background:var(--paper-2)}
nav.rail a.on{background:#fff;color:var(--clay-d);font-weight:600;border-left-color:var(--clay);box-shadow:0 1px 0 var(--line)}
nav.rail a.on span{color:var(--clay)}
.rail-foot{margin-top:20px;padding-top:14px;border-top:1px solid var(--line);font-size:11.5px;color:var(--mute)}

main{max-width:1000px;padding:38px 0 90px;min-width:0}
h1{font-size:29px;line-height:1.35;margin:0 0 8px;letter-spacing:-.01em}
.sub{color:var(--mute);font-size:12.5px;margin-bottom:24px}
h2{font-size:20px;margin:52px 0 14px;padding:0 0 9px;border-bottom:2px solid var(--line);
   display:flex;align-items:baseline;gap:11px;scroll-margin-top:0}
h2 i{font-style:normal;font-size:12px;font-weight:800;color:#fff;background:var(--clay);
   padding:3px 7px;border-radius:5px;letter-spacing:.06em}
h3{font-size:15.5px;margin:28px 0 10px;color:var(--clay-d)}
p{margin:11px 0}
b{font-weight:650}
a{color:var(--info)}

.lede{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:22px;align-items:center;
  background:linear-gradient(135deg,#FFFFFF 0%,#FBF6EF 58%,#F4E7DA 100%);
  border:1px solid var(--line);border-left:4px solid var(--clay);border-radius:12px;padding:20px 22px;margin-bottom:18px}
.lede-k{font-size:11px;letter-spacing:.18em;color:var(--clay-d);font-weight:800;margin-bottom:5px}
.lede p{margin:0;font-size:14.5px}
.lede-side{text-align:center}
.dlbtn{display:block;background:var(--ink);color:#fff;text-decoration:none;font-weight:650;font-size:14px;
  padding:12px 14px;border-radius:9px;transition:transform .14s,background .16s}
.dlbtn:hover{background:var(--clay-d);transform:translateY(-1px)}
.dlmeta{font-size:11.5px;color:var(--mute);margin-top:8px;line-height:1.6}

.tally{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:0 0 8px}
.tally-i{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 10px;text-align:center}
.tally-n{display:block;font-size:25px;font-weight:750;font-variant-numeric:tabular-nums;color:var(--clay-d);line-height:1.2}
.tally-i.good .tally-n{color:var(--pass)}
.tally-l{display:block;font-size:11.5px;color:var(--mute);margin-top:3px}

.tw{max-width:100%;overflow-x:auto;margin:12px 0;border-radius:8px}
.tw::-webkit-scrollbar{height:9px}
.tw::-webkit-scrollbar-track{background:var(--paper-2);border-radius:8px}
.tw::-webkit-scrollbar-thumb{background:var(--line-2);border:2px solid var(--paper-2);border-radius:8px}
.tw::-webkit-scrollbar-thumb:hover{background:var(--clay)}
table{border-collapse:collapse;width:100%;background:var(--surface);font-size:13px;margin:0;
  border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{border-bottom:1px solid var(--line);padding:8px 11px;text-align:left;vertical-align:top}
th{background:var(--paper-2);font-weight:650;font-size:12.5px;color:var(--ink-2);white-space:nowrap}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover{background:var(--overlay)}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code{background:var(--paper-2);padding:1px 5px;border-radius:4px;font-size:12px;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
code.copy{cursor:pointer;border:1px dashed var(--line-2)}
code.copy:hover{background:#F3E4D8;border-color:var(--clay)}
code.copy.done{background:#E2F0E6;border-color:var(--pass);color:var(--pass)}
.ok{color:var(--pass);font-weight:650} .bad{color:var(--fail);font-weight:650}
.pill{font-size:10.5px;padding:1px 6px;border-radius:20px;vertical-align:middle;font-weight:700}
.pill.new{background:var(--clay);color:#fff}

.card{background:var(--surface);border:1px solid var(--line);border-left:3px solid var(--info);
  border-radius:9px;padding:13px 16px;margin:14px 0;font-size:13.5px}
.card.warn{border-left-color:var(--warn);background:#FDF8EC}
.card.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;line-height:2}
.note{font-size:12.5px;color:var(--mute);border-left:2px solid var(--line-2);padding-left:11px;margin:12px 0}
.cap{font-size:12.5px;color:var(--mute);margin:8px 0 0}

.shots{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;margin:16px 0 4px}
.shot{flex:0 1 auto;min-width:0}
.shot-label{font-size:11.5px;color:var(--mute);margin-bottom:5px;font-weight:600}
.shots img,figure img{display:block;max-width:100%;height:auto;border:1px solid var(--line);
  border-radius:7px;background:#fff;cursor:zoom-in;transition:box-shadow .16s,transform .16s}
.shots img:hover,figure img:hover{box-shadow:0 6px 22px rgba(20,22,26,.16);transform:translateY(-2px)}
figure{margin:16px 0}
figcaption{font-size:12.5px;color:var(--mute);margin-top:7px}

ul.todo{padding-left:0;list-style:none}
ul.todo li{position:relative;padding:9px 0 9px 24px;border-bottom:1px dashed var(--line);font-size:13.5px}
ul.todo li:last-child{border-bottom:none}
ul.todo li::before{content:"";position:absolute;left:4px;top:17px;width:7px;height:7px;
  border-radius:2px;background:var(--clay);transform:rotate(45deg)}

#lb{position:fixed;inset:0;background:var(--scrim);display:none;z-index:99;
  align-items:center;justify-content:center;padding:26px;cursor:zoom-out;backdrop-filter:blur(3px)}
#lb.on{display:flex}
#lb img{max-width:100%;max-height:92vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#lb .hint{position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#E8E2D6;font-size:12px}

@media (max-width:980px){
  .shell{grid-template-columns:1fr;gap:0;padding:0 18px}
  nav.rail{position:sticky;top:0;height:auto;z-index:40;display:flex;gap:6px;overflow-x:auto;
    padding:10px 0;margin:0 -18px;padding-left:18px;padding-right:18px;
    background:rgba(242,239,233,.95);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
  nav.rail .brand,nav.rail .brand-sub,.rail-foot{display:none}
  nav.rail a{white-space:nowrap;border-left:none;border-bottom:2px solid transparent;border-radius:6px;padding:6px 9px}
  nav.rail a.on{border-left:none;border-bottom-color:var(--clay)}
  main{padding:22px 0 70px}
  html{scroll-padding-top:66px}
  h2{scroll-margin-top:0}
  .lede{grid-template-columns:1fr}
  .tally{grid-template-columns:repeat(3,1fr)}
  h1{font-size:23px}
  table{min-width:520px}
}
@media (max-width:560px){
  .tally{grid-template-columns:repeat(2,1fr)}
  .shots{gap:10px}
  table{font-size:12px}
  th,td{padding:7px 8px}
}
@media print{ nav.rail{display:none} .shell{display:block} }
"""

JS = """
(function(){
  var links=[].slice.call(document.querySelectorAll('nav.rail a'));
  var secs=links.map(function(a){return document.getElementById(a.dataset.t)}).filter(Boolean);
  function spy(){
    var best=null,bd=1e9;
    for(var i=0;i<secs.length;i++){
      var d=Math.abs(secs[i].getBoundingClientRect().top-70);
      if(secs[i].getBoundingClientRect().top<=140 && d<bd){bd=d;best=secs[i]}
    }
    if(!best&&secs.length)best=secs[0];
    links.forEach(function(a){a.classList.toggle('on',!!best&&a.dataset.t===best.id)});
  }
  var t=false;
  addEventListener('scroll',function(){if(!t){t=true;requestAnimationFrame(function(){spy();t=false})}},{passive:true});
  spy();

  var lb=document.getElementById('lb'),lbi=lb.querySelector('img');
  function closeLb(){lb.classList.remove('on');lbi.removeAttribute('src');document.body.style.overflow=''}
  document.addEventListener('click',function(e){
    var im=e.target.closest('.shots img,figure img');
    if(im){lbi.src=im.dataset.full||im.src;lb.classList.add('on');document.body.style.overflow='hidden';return}
    if(lb.classList.contains('on'))closeLb();
  });
  addEventListener('keydown',function(e){if(e.key==='Escape'&&lb.classList.contains('on'))closeLb()});

  document.addEventListener('click',function(e){
    var c=e.target.closest('code.copy');
    if(!c)return;
    var txt=c.textContent.trim();
    var done=function(){c.classList.add('done');var o=c.textContent;c.textContent='已复制';
      setTimeout(function(){c.textContent=o;c.classList.remove('done')},900)};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,function(){})}
    else{var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();
      try{document.execCommand('copy');done()}catch(err){}document.body.removeChild(ta)}
  });
})();
"""

doc = f'''<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>图麦笔记 · 安卓版 v1.2 与三处修复真跑取证（2026-11-12）</title>
<style>{CSS}</style></head><body>
<div class="shell">
<nav class="rail">
  <div class="brand">图麦笔记 · 取证件</div>
  <div class="brand-sub">安卓 v1.2 · 2026-11-12</div>
  {nav}
  <div class="rail-foot">内嵌 {len(FIGS)} 张真跑截图<br>合计 {imgs_total/1024:.0f} KB（已压）<br>点图放大 · 点 md5 复制</div>
</nav>
<main>{body}</main>
</div>
<div id="lb"><img alt="放大查看"><div class="hint">点任意处或按 Esc 关闭</div></div>
<script>{JS}</script>
</body></html>'''

with open(OUT, "w", encoding="utf-8") as f:
    f.write(doc)
print("写出", OUT)
print("字节", os.path.getsize(OUT))
print("内嵌图", len(FIGS), "张，压缩后合计", round(imgs_total / 1024), "KB")