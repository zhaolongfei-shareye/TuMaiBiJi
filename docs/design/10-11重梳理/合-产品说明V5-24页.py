#!/usr/bin/env python3
# 合并 24 页参赛正本（站长 2026-10-11 拍：1甲 2乙 3甲）
# 输入：比赛/图麦笔记-产品说明-V4-20261011.html（正本，只读不改）
#       docs/design/10-11重梳理/方向稿-V5-六页.html（六页样张，只读不改）
# 输出：比赛/图麦笔记-产品说明-V5-24页-20261012.html
# 做法：V5 样式整份收进 .v5 作用域（两份样式有 12 个类名撞车，不隔离会串改 V4 那些页）；
#       删 V4 的 P23–P27，那五页里四处独有信息按乙折进有余量的页，不动任何既有文字；
#       P21 补一张同语言线描（pt 单位 viewBox）；P6/P22/P23 原先的页脚细条与本页内容重复，撤
import re, pathlib

ROOT = pathlib.Path("/Users/zlfmac/Documents/TuMaiBiJi")
SRC_V4 = ROOT / "比赛/图麦笔记-产品说明-V4-20261011.html"
SRC_V5 = ROOT / "docs/design/10-11重梳理/方向稿-V5-六页.html"
OUT = ROOT / "比赛/图麦笔记-产品说明-V5-24页-20261012.html"

TOTAL = 24          # 29 − 删 5（V4 的 P23–27）；V5 六页 1:1 顶掉六页，18＋6＝24
# r3 箭头：与样张同一枚（6×5 实心三角，userSpaceOnUse 所以不跟笔重缩放）；默认墨色，陶色另开一枚
MARKER_M = ('<marker id="{i}" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            '<polygon points="0 0, 6 2.5, 0 5" fill="#4a4d44"/></marker>')
MARKER_A = ('<marker id="{i}" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" '
            'orient="auto" markerUnits="userSpaceOnUse">'
            '<polygon points="0 0, 6 2.5, 0 5" fill="#D2683F"/></marker>')

v4 = SRC_V4.read_text(encoding="utf-8")
v5 = SRC_V5.read_text(encoding="utf-8")


def style_of(html):
    return re.search(r"<style>(.*?)</style>", html, re.S).group(1)


def pages_of(html):
    """返回 {页号: 该页完整 markup}，base64 原样保留。V4 带 data-page，V5 样张不带、按出现顺序编号。"""
    ms = [(m.start(), int(m.group(1)))
          for m in re.finditer(r'<article class="page[^"]*" data-page="(\d+)"', html)]
    if not ms:
        ms = [(m.start(), i + 1) for i, m in enumerate(re.finditer(r'<article class="page[^"]*">', html))]
    ms.append((len(html), None))
    out = {}
    for i in range(len(ms) - 1):
        s, num = ms[i]
        out[num] = html[s:html.rindex("</article>", s, ms[i + 1][0]) + len("</article>")]
    return out


def scope(css):
    """把 V5 整份样式收进 .v5；@page/* /body 丢掉（V4 已有，且字节一致）。"""
    keep, dropped = [], []
    for sel, body in re.findall(r"([^{}]*?)\{([^{}]*)\}", css, re.S):
        sel = sel.strip()
        if not sel or sel.startswith("@") or sel in ("*", "body"):
            dropped.append(sel)
            continue
        parts = []
        for one in sel.split(","):
            one = one.strip()
            if one == ".page":
                parts.append(".page.v5")            # 样张页自身，不是它的后代
            elif one == ".page:last-child":
                parts.append(".page.v5:last-child")
            else:
                parts.append(".v5 " + one)
        keep.append(",".join(parts) + "{" + body + "}")
    print("  丢掉的全局规则：", [d for d in dropped if d])
    return "\n".join(keep)


def renum(seg, n):
    """改（或补）data-page，并把页脚页码换成「NN / 24」；样张页脚原本是「方向稿 V5 · 02」。"""
    if "data-page=" in seg:
        seg = re.sub(r'data-page="\d+"', f'data-page="{n}"', seg, count=1)
    else:  # 样张页没写 data-page，补上，量溢出和抽页才找得到
        seg = re.sub(r'<article class="page v5">', f'<article class="page v5" data-page="{n}">', seg, count=1)
    seg, k = re.subn(r'<span>\s*(?:\d{1,2}\s*/\s*29|方向稿 V5 · \d{2})\s*</span>',
                     f"<span>{n:02d} / {TOTAL}</span>", seg, count=1)
    assert k == 1, f"第 {n} 页页码没换掉：{seg[-260:]}"
    return seg


def put(seg, anchor, add, page, before=False, after_text=None):
    """在 anchor 之后（或之前）插入 add；anchor 必须在该页里唯一。after_text 用于整段替换。"""
    assert seg.count(anchor) == 1, f"第 {page} 页锚点不是唯一一处（{seg.count(anchor)}）：{anchor[:44]}"
    if after_text is not None:
        return seg.replace(anchor, after_text, 1)
    return seg.replace(anchor, add + anchor if before else anchor + add, 1)


# ---------- 1. 取页面 ----------
P4, P5 = pages_of(v4), pages_of(v5)
assert len(P4) == 29 and len(P5) == 6, (len(P4), len(P5))
for k in P5:
    P5[k] = P5[k].replace('<article class="page">', '<article class="page v5">', 1)

# ---------- 2. 折叠（待拍A 乙；落点按各页实测余量挑，不动任何既有文字） ----------
# ① 发布状态（原 P27 独有）→ P3 业务链路：那页尾句本来就写"只画现网跑通的环节"
FOLD_RELEASE = (
    '<p class="note"><b>产品本身此刻也在线上：</b>2.0.0 已发布并生效于 2026-10-08 09:50:05'
    '（微信公众平台「版本管理」读回）；2.1.8 于 10-11 15:22:11 提交审核，状态审核中；'
    '小程序备案：已备案。发布与提交数以本项目后台与 git 记录为准。</p>'
)
P5[2] = put(P5[2], "不当已解决。</p>", FOLD_RELEASE, 3)

# ② 验证与实测边界（原 P24 独有）→ 接在①后面
FOLD_EVIDENCE = (
    '<p class="note"><b>验证覆盖与边界：</b>用例覆盖采集、模型异常、用户隔离、分享与转存等路径，'
    '并用微信开发者工具与自动化辅助检查；测试文件存在不代表本轮全部通过，模拟器结果也不代替真机与'
    '真实服务验证。本文不报告未经本轮实测的性能、通过率或增长数字。</p>'
)
P5[2] = put(P5[2], "后台与 git 记录为准。</p>", FOLD_EVIDENCE, 3)

# ③ 信任与平台（原 P26 独有）→ P21 技术方案（微信生态那一页），压成一小注
FOLD_TRUST = (
    '<p class="note"><b>服务端把住的几道闸：</b>私密笔记的锁在服务端——不解锁不发正文与概要、'
    '私密不能分享、改为私密时自动关掉那张活码；鉴权走 Bearer Token，openid 不下发客户端，'
    '密钥缺失或仍是占位符时服务启动即失败；内容送检必须发原样 UTF-8 字节体；'
    '图片云备份与名片那四格存在账号上，删笔记时由客户端发起云端删除；'
    '《用户隐私保护指引》现为六项，含「我的 → 我的邮箱」那一格。</p>'
)
P4[21] = put(P4[21], '<p class="note">赠送额度的资格', FOLD_TRUST, 21, before=True)

# ④ AI 辅助研发披露（原 P24 独有；全份只有那一处提到 Qoder）→ P22 开源打底
FOLD_AI = (
    '<p class="note"><b>研发工具披露：</b>开发过程使用 Qoder 等 AI 编程辅助工具做检索、实现草拟、'
    '测试辅助与文案整理；本文场景图与联名视觉也有 AI 辅助生成，均经人工审查与核对。'
    '原创重点是需求判断、交互与工程整合，不把通用能力、基础模型或生成图像说成全部手工原创。</p>'
)
P4[22] = put(P4[22], '<p class="note">“自己写”不经过抓取与 OCR', FOLD_AI, 22, before=True)

# ⑤ 建议评委这样体验四条（原 P24 独有）→ P8 几处有趣的体验（那页实测余量最大）
FOLD_TRY = (
    '<h2 style="margin-top:12pt">建议评委这样体验</h2>'
    '<div class="tryit">'
    '<p><b>从内容开始</b>用一条有权使用的公开文章链接，或一张清晰截图生成笔记；核对标题、摘要、要点与出处。</p>'
    '<p><b>试一次自己的表达</b>自己写一条短笔记，编辑、分类并搜索找回；切换摘句与杂志封面，比较同一内容的表达差异。</p>'
    '<p><b>让卡片走出去再回来</b>保存卡片到相册；选带码版本时，用另一台设备进入公开摘要，再转存为独立笔记。</p>'
    '<p><b>也看一次失败</b>试试没有有效正文的链接与空白图片，检查反馈是否明确，而不是把空结果当成成功。</p>'
    '</div>'
)
P5[6] = put(P5[6], "</main>", FOLD_TRY, 8)

# 修掉会悬空的引用（更新补记那三页已删）
P4[28] = put(
    P4[28],
    "对 09-25 基线的界面、后端与发布增量，见第 21–23 页更新补记，",
    None, 28,
    after_text="对 09-25 基线之后的后端与发布增量，见第 3 页（发布与提审状态）与第 21 页（服务端与平台能力），",
)

# ---------- 3. P21 一张同语言线描（模型调用链；P6/P22/P23 的细条与本页内容重复，撤） ----------
# viewBox 503×46：.band 没有横向内边距，实渲量出来是 503.29pt（量-实渲宽.py 跑的），
# 所以这张按 503 画才是 1 单位＝1pt；482 是 .il（有 10pt 内边距）那一档的宽，别混用。
# 陶色只落 1 处＝云函数与模型之间那道门；无投影；连线只有两条水平箭头，全正交。
BAND_P21 = f"""<div class="band"><svg viewBox="0 0 503 46" role="img" aria-labelledby="p21r3-title p21r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p21r3-title">模型调用只有云函数这一扇门</title>
<desc id="p21r3-desc">四个方框从左到右排成一条链：微信原生小程序、自建后端 FastAPI、云函数、云开发 AI 文本模型。前两框之间是普通箭头；云函数与模型之间立着一道陶色竖线，表示模型只能从云函数这扇门进去。</desc>
<defs>{MARKER_M.format(i="arP21m")}</defs>
<text class="eb" x="0" y="9">概念示意 · 一次模型调用的路径</text>
<text class="eb" x="503" y="9" text-anchor="end">只有这一扇门</text>
<line class="s thin mut" x1="130" y1="27.5" x2="148" y2="27.5" marker-end="url(#arP21m)"/>
<line class="s thin mut" x1="270" y1="27.5" x2="288" y2="27.5" marker-end="url(#arP21m)"/>
<rect class="whitef" x="0" y="14" width="128" height="27" rx="2"/>
<text class="nm" x="8" y="25">微信原生小程序</text>
<text class="al" x="8" y="36">媒体 · 登录 · 画布 · 分享</text>
<rect class="whitef" x="150" y="14" width="118" height="27" rx="2"/>
<text class="nm" x="158" y="25">自建后端 FastAPI</text>
<text class="al" x="158" y="36">身份 · 任务 · 业务数据</text>
<rect class="whitef" x="290" y="14" width="84" height="27" rx="2"/>
<text class="nm" x="298" y="25">云函数</text>
<text class="sl" x="298" y="36">wx-server-sdk</text>
<line class="acc strong" x1="380" y1="10" x2="380" y2="41"/>
<rect class="whitef" x="386" y="14" width="117" height="27" rx="2"/>
<text class="nm" x="394" y="25">云开发 AI 文本模型</text>
<text class="al" x="394" y="36">当前默认</text>
<text class="sl" x="434" y="36">hy3-preview</text>
</svg>
<p class="ilcap">概念示意 · 模型调用只有云函数这一扇门；门内是平台额度，门外是作品自己的服务</p>
</div>"""

P4[21] = put(P4[21], "</main>", BAND_P21, 21)

# ---------- 4. 排 24 页 ----------
ORDER = [
    ("v4", 1), ("v5", 1), ("v5", 2), ("v5", 3), ("v5", 4),
    ("v4", 6), ("v5", 5), ("v5", 6),
    ("v4", 9), ("v4", 10), ("v4", 11), ("v4", 12), ("v4", 13),
    ("v4", 14), ("v4", 15), ("v4", 16), ("v4", 17),
    ("v4", 18), ("v4", 19), ("v4", 20),
    ("v4", 21), ("v4", 22), ("v4", 28), ("v4", 29),
]
assert len(ORDER) == TOTAL, len(ORDER)
kept = [n for src, n in ORDER if src == "v4"]
print(f"V4 留下 {len(kept)} 页：", kept)
print("V4 被 V5 顶掉：", sorted(set(P4) - set(kept) - {23, 24, 25, 26, 27}))
print("V4 真删（待拍A 乙）：", [23, 24, 25, 26, 27])

body = []
for i, (src, n) in enumerate(ORDER, start=1):
    body.append(renum((P5 if src == "v5" else P4)[n], i))

# ---------- 5. 样式与装配 ----------
head, rest = v4.split("<style>", 1)
v4style, tail = rest.split("</style>", 1)
before_body, after = tail.split("<body>", 1)
assert before_body.strip() in ("", "</head>", "</head>\n"), repr(before_body[:80])
close = after[after.rindex("</article>") + len("</article>"):]
assert close.strip() == "</body></html>", repr(close[:80])

# 统一插画语言也要给 V4 那几页用；.il/.band 这些名字 V4 样式里一个都没有，不隔离也不撞
# viewBox 用 pt 单位（1 单位＝纸上 1pt），所以这里的 px 就是纸上的 pt
# r3：与 方向稿-V5-六页.html 里那段同名同值（scope() 会把它收进 .v5，特异度更高，
#     两处必须逐字一致才不会互相打架）；r2 那批 .sh/.cf/.tn/.tm/.tl 已随重画全部作废
language = """
/* ---- r3 统一插画语言（同一套类名，开放给 V4 那几页；V4 原本没有这些名字） ----
   实渲三档（量-实渲宽.py 量的）：.il 整栏 481.79pt、.tile .il 单格 144.92pt、
   .band 通栏 503.29pt、P7 hero 193.0pt（缩放 0.965）。规矩：陶色每图 1–2 处；
   无投影；连接器一律正交；图内中文不小于 9px。 */
.il{background:#FBFAF7;border:.6pt solid #cfccc2;padding:10pt 10pt 7pt;margin:6pt 0 10pt}
.band{border-top:.5pt solid #cfccc2;padding:8pt 0 0;margin:10pt 0 0}
.il svg,.band svg{display:block;width:100%;height:auto}
.il svg text,.band svg text{font-family:'PingFang SC','Helvetica Neue','Noto Sans SC','Microsoft YaHei',sans-serif;fill:#22251f}
.il svg .nm,.band svg .nm{font-size:9.5px;font-weight:600}
.il svg .eb,.band svg .eb{font-size:9px;font-weight:500;fill:rgba(34,37,31,.66)}
.il svg .al,.band svg .al{font-size:9px;font-weight:500;fill:#4a4d44}
.il svg .sl,.band svg .sl{font-family:ui-monospace,Menlo,'Courier New',monospace;font-size:8px;fill:rgba(34,37,31,.66)}
.il svg .s,.band svg .s{stroke:#22251f;fill:none;stroke-width:.8;stroke-linecap:round;stroke-linejoin:round}
.il svg .thin,.band svg .thin{stroke-width:.55}
.il svg .hair,.band svg .hair{stroke-width:.35}
.il svg .strong,.band svg .strong{stroke-width:1.1}
.il svg .mut,.band svg .mut{stroke:#4a4d44}
.il svg .acc,.band svg .acc{stroke:#D2683F}
.il svg .accf,.band svg .accf{fill:#D2683F;stroke:none}
.il svg .inkf,.band svg .inkf{fill:#22251f;stroke:none}
.il svg .greyf,.band svg .greyf{fill:#b9b6ab;stroke:none}
.il svg .mistf,.band svg .mistf{fill:#E7E3D8;stroke:none}
.il svg .whitef,.band svg .whitef{fill:#ffffff;stroke:#22251f;stroke-width:.8}
.il svg .focalf,.band svg .focalf{fill:rgba(210,104,63,.08);stroke:#D2683F;stroke-width:1.1}
.il svg .rule,.band svg .rule{stroke:#cfccc2;fill:none;stroke-width:.35}
.il svg .lane,.band svg .lane{stroke:#cfccc2;fill:none;stroke-width:.8}
.il svg .grey,.band svg .grey{stroke:#b9b6ab;fill:none;stroke-width:.55;stroke-linecap:round}
.il svg .dash,.band svg .dash{stroke-dasharray:5,4}
.il svg .mask,.band svg .mask{fill:#FBFAF7;stroke:none}
.ilcap{font-size:7.4pt;color:rgba(34,37,31,.66);margin:3pt 2pt 0;letter-spacing:.4pt}
.tryit{margin:6pt 0 0}
.tryit p{font-size:9pt;color:#252923;margin:0 0 4pt;padding-left:88pt;text-indent:-88pt}
.tryit b{font-family:'Songti SC',serif;color:#98613c;font-weight:600;display:inline-block;min-width:88pt;text-indent:0}/* text-indent 会继承进 inline-block，不重置会被自己再往左推 88pt；min-width 与 padding-left 必须同值，否则首行与折行不对齐，标签长过 min-width 时还会跟正文粘在一起。88pt 按最长标签「让卡片走出去再回来」9 字×9pt≈81pt 再加 7pt 间距定，十行标签才成一条列 */
"""

# 留白 pass：全局节奏抬一档；仍为负的页在 OPTICAL 里逐页光学校正
rhythm = """
/* ---- 留白 pass：全局节奏抬一档 ---- */
body{line-height:1.8}
p{margin:0 0 10pt}
h2{margin:15pt 0 6pt}
.note{margin-top:12pt}
.callout{margin:16pt 0}
.rows .row{padding:10pt 0}
.eyebrow{margin:20pt 0 9pt}
.mast{padding-bottom:11pt}
.flow{padding:12pt 8pt}
.ledger .lr{padding:9pt 0}
.tiles{gap:16pt}
.tile p{line-height:1.66}
.minis{gap:14pt}
"""

optical = """
/* ---- 逐页光学校正：抬完节奏仍贴页脚的页，单独收回一点 ---- */
article[data-page="2"] .rows .row{padding:8pt 0}
article[data-page="9"] p,article[data-page="10"] p,article[data-page="11"] p,article[data-page="12"] p,article[data-page="13"] p{margin-bottom:8pt}
article[data-page="9"] .note,article[data-page="10"] .note,article[data-page="11"] .note,article[data-page="12"] .note,article[data-page="13"] .note{margin-top:10pt}
article[data-page="21"] .rows .row{padding:8pt 0}
article[data-page="21"] .note{margin-top:10pt}
article[data-page="21"] .band{margin-top:6pt;padding-top:6pt}
"""

merged = (
    "<!--\n"
    "  图麦笔记 · 2026 微信小程序开发大赛 参赛正本（24 页合并版）\n"
    "  生成器：docs/design/10-11重梳理/合-产品说明V5-24页.py —— 别手改生成出来的这一份\n"
    "  来源：V4 正本留 18 页 ＋ 方向稿 V5 六页（18＋6＝24）\n"
    "  V4 的 P23–P27 已删；那五页里四处只出现在它们身上的信息，折进 P3／P8／P21／P22\n"
    "  P21 补一张同语言线描；P6/P22/P23 原先的页脚细条与本页内容重复，撤\n"
    "  配图 r3：13 张 SVG 全部按 docs/design/10-11重梳理/插画规范-24页.md 重画——\n"
    "  pt 单位 viewBox、无衬线中文不小于 9px、连线全正交、陶色每图 1–2 处、无投影、\n"
    "  每张带 role/title/desc/aria-labelledby；留白 pass 见 rhythm/optical\n"
    "-->\n"
    + head + "<style>" + v4style
    + "\n\n/* ---- 统一插画语言（来自方向稿 V5，整份收进 .v5 作用域，不影响 V4 那些页） ---- */\n"
    + scope(style_of(v5)) + language + rhythm + optical
    + "</style>" + before_body + "<body>" + "".join(body) + close
)
OUT.write_text(merged, encoding="utf-8")
print("→", OUT, OUT.stat().st_size, "字节")
print("  marker id（每张图自己一个，全篇不重复）：",
      sorted(set(re.findall(r'<marker id="([^"]+)"', merged))))
