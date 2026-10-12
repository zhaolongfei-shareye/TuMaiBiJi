#!/usr/bin/env python3
# 样张生成器：把 r2（从成品 HTML 里原样取出）与 r3（按新规范重画）并排渲在一份 A4 里，
# 真 pt 尺度、与正式稿同一套页边距，好让他直接判方向。
# 用法：python3 样张-r3.py
# 产物：样张-r3.html（同目录）
import pathlib, re, sys

HERE = pathlib.Path(__file__).resolve().parent
# r2 基线必须钉在回滚副本上：本生成器从 SRC 现抽「r2 原样」那半做对照，
# 而 比赛/ 里那份成品已经升到 r3——指过去会把 r3 当 r2 抽，对照页变成两张一样的图、id 全撞。
# 2026-10-12 真踩过一次：重跑后 p3r3/t1r3 各出现两遍，断言拦下，样张还原。
SRC = HERE / "回滚点-24页r2" / "图麦笔记-产品说明-V5-24页-20261012.html"
OUT = HERE / "样张-r3.html"

INK, MUTED, SOFT = "#22251f", "#4a4d44", "rgba(34,37,31,.66)"
PAPER, PAPER2, RULE_SOLID = "#FBFAF7", "#E7E3D8", "#cfccc2"
ACCENT, ACCENT_INK, ACCENT_TINT = "#D2683F", "#98613c", "rgba(210,104,63,.08)"
GREY = "#b9b6ab"
SANS = "'PingFang SC','Helvetica Neue','Noto Sans SC','Microsoft YaHei',sans-serif"
MONO = "ui-monospace,Menlo,'Courier New',monospace"
SERIF = "'Songti SC',STSong,'Noto Serif SC',serif"


def page(n):
    h = SRC.read_text(encoding="utf-8")
    m = re.search(r'<article[^>]*data-page="%d".*?</article>' % n, h, re.S)
    assert m, n
    return m.group(0)


def svgs(n):
    return re.findall(r"<svg.*?</svg>", page(n), re.S)


# ---------------------------------------------------------------- r2 原样搬过来
R2_CSS = """
.r2box{background:#FBFAF7;border:.6pt solid #cfccc2;padding:10pt 10pt 7pt}
.r2box svg{display:block;width:100%;height:auto}
.r2box svg .s{stroke:#22251f;fill:none;stroke-width:.8;stroke-linecap:round;stroke-linejoin:round}
.r2box svg .thin{stroke-width:.55}
.r2box svg .hair{stroke-width:.35}
.r2box svg .a{stroke:#D2683F}
.r2box svg .af{fill:#D2683F;stroke:none}
.r2box svg .cf{fill:#FBFAF7;stroke:#22251f;stroke-width:.8}
.r2box svg .pf{fill:#ffffff;stroke:#22251f;stroke-width:.8}
.r2box svg .gf{fill:#E7E3D8;stroke:none}
.r2box svg .sh{fill:#22251f;stroke:none;opacity:.07}
.r2box svg .ink{fill:#22251f;stroke:none}
.r2box svg .mist{fill:#b9b6ab;stroke:none}
.r2box svg .dash{stroke-dasharray:3 3}
.r2box svg text{font-family:'Songti SC',STSong,serif;fill:#22251f}
.r2box svg .tt{font-size:8.5px;font-weight:600}
.r2box svg .num{font-size:7px;font-weight:600}
.r2box svg .tn{font-size:7.2px;fill:#4a4d44}
.r2box svg .tl{font-size:6.6px;letter-spacing:1px;fill:#98613c}
.r2box svg .tm{font-size:6.6px;fill:#8a8b80}
"""

# ---------------------------------------------------------------- r3 新规范
R3_CSS = f"""
.r3box{{background:{PAPER};border:.6pt solid {RULE_SOLID};padding:10pt 10pt 7pt}}
.r3box svg{{display:block;width:100%;height:auto}}
.r3box svg text{{font-family:{SANS};fill:{INK}}}
.r3box svg .nm{{font-size:9.5px;font-weight:600}}          /* node-name */
.r3box svg .eb{{font-size:9px;font-weight:500;fill:{SOFT}}}  /* eyebrow，中文换档：不大写不加字距 */
.r3box svg .al{{font-size:9px;font-weight:500;fill:{MUTED}}} /* arrow-label */
.r3box svg .sl{{font-family:{MONO};font-size:8px;fill:{SOFT}}}/* sublabel，只放拉丁技术值 */
.r3box svg .s{{stroke:{INK};fill:none;stroke-width:.8;stroke-linecap:round;stroke-linejoin:round}}
.r3box svg .thin{{stroke-width:.55}}
.r3box svg .hair{{stroke-width:.35}}
.r3box svg .strong{{stroke-width:1.1}}
.r3box svg .mut{{stroke:{MUTED}}}
.r3box svg .acc{{stroke:{ACCENT}}}
.r3box svg .accf{{fill:{ACCENT};stroke:none}}
.r3box svg .inkf{{fill:{INK};stroke:none}}
.r3box svg .greyf{{fill:{GREY};stroke:none}}
.r3box svg .mistf{{fill:{PAPER2};stroke:none}}
.r3box svg .whitef{{fill:#ffffff;stroke:{INK};stroke-width:.8}}
.r3box svg .focalf{{fill:{ACCENT_TINT};stroke:{ACCENT};stroke-width:1.1}}
.r3box svg .rule{{stroke:{RULE_SOLID};fill:none;stroke-width:.35}}
.r3box svg .lane{{stroke:{RULE_SOLID};fill:none;stroke-width:.8}}
.r3box svg .grey{{stroke:{GREY};fill:none;stroke-width:.55;stroke-linecap:round}}
.r3box svg .dash{{stroke-dasharray:5,4}}
.r3box svg .mask{{fill:{PAPER};stroke:none}}
"""

# ================================================================ r3 · P3 双泳道
# viewBox 482×212。节点只留标题（说明搬正文，已拍）。陶色只落 2 处：跨泳道那条交接箭头 + 接手的节点④。
# 连线全正交、肘弯 r=8；箭头标签带不透明遮罩、离线 8–9pt；同一条边上的线各占自己的 attach 点。
# 图例整条撤掉：r2 那 3 项里，「实线·现网已跑通」正文已说两遍、「陶色虚线·第二次循环」与
# 「撤回只关"公开"这扇门」都已被图上的箭头标签与本页 callout 覆盖——按「最高级的手法通常是删」全撤。
NODES_L1 = [
    (56, "① 录入与提炼"),
    (204, "② 出卡"),
    (352, "③ 分享"),
]
NODES_L2 = [
    (56, "④ 扫码读快照"),
    (204, "⑤ 转存"),
    (352, "⑥ 他自己的库里"),
]


def node(x, y, label, focal=False, tid=""):
    cls = "focalf" if focal else "whitef"
    return (
        f'<rect class="{cls}" x="{x}" y="{y}" width="124" height="32" rx="4"/>'
        f'<text class="nm" x="{x + 12}" y="{y + 20}">{label}</text>'
    )


P3_R3 = f"""<svg viewBox="0 0 482 212" role="img" aria-labelledby="p3r3-title p3r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p3r3-title">一条笔记从作者走到读者的业务链路</title>
<desc id="p3r3-desc">双泳道流程图：作者侧依次是录入与提炼、出卡、分享；读者侧依次是扫码读快照、转存、进入他自己的库。两条泳道之间只有一次交接，靠卡片上的小程序码完成；读者转存之后可以再走一次出卡。</desc>
<defs>
<marker id="arP3m" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{MUTED}"/></marker>
<marker id="arP3a" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{ACCENT}"/></marker>
</defs>
<!-- 连线先画，压在节点下面 -->
<line class="s mut" x1="180" y1="32" x2="204" y2="32" marker-end="url(#arP3m)"/>
<line class="s mut" x1="328" y1="32" x2="352" y2="32" marker-end="url(#arP3m)"/>
<line class="s mut" x1="180" y1="148" x2="204" y2="148" marker-end="url(#arP3m)"/>
<line class="s mut" x1="328" y1="148" x2="352" y2="148" marker-end="url(#arP3m)"/>
<path class="s acc strong" d="M412,48 V104 Q412,112 404,112 H124 Q116,112 116,120 V130" marker-end="url(#arP3a)"/>
<path class="s mut dash" d="M412,164 V180 Q412,188 404,188 H272 Q264,188 264,180 V166" marker-end="url(#arP3m)"/>
<!-- 泳道分隔 -->
<line class="lane" x1="0" y1="84" x2="482" y2="84"/>
<text class="eb" x="0" y="36">作者侧</text>
<text class="eb" x="0" y="152">读者侧</text>
<!-- 箭头标签：遮罩 + 离线 8–9pt -->
<rect class="mask" x="224" y="91" width="80" height="12" rx="2"/>
<text class="al" x="264" y="100" text-anchor="middle">卡片上的小程序码</text>
<rect class="mask" x="270" y="196" width="136" height="12" rx="2"/>
<text class="al" x="338" y="205" text-anchor="middle">转存之后 · 回到 ② 再走一次</text>
<!-- 节点 -->
{node(56, 16, "① 录入与提炼")}
{node(204, 16, "② 出卡")}
{node(352, 16, "③ 分享")}
{node(56, 132, "④ 扫码读快照", focal=True)}
{node(204, 132, "⑤ 转存")}
{node(352, 132, "⑥ 他自己的库里")}
</svg>"""

# ================================================================ r3 · P8 六格
# viewBox 138×69。图内小字全撤（已拍），插画占满整格；文字交给格子下方他自己的正文。
# 每格只允许一处陶色＝这一格想让你看的那一处。禁止任何投影。

# 四格小画面：纸底 + 远山 + 日轮 + 一层白罩子（透明度就是「亮度档」），最后一道细描边收口。
T2_FRAMES = "".join(
    f'<g><rect x="{5 + i * 34}" y="12" width="26" height="34" rx="2" fill="{PAPER2}"/>'
    f'<path d="M{5 + i * 34},46 L{12 + i * 34},30 L{19 + i * 34},40 L{24 + i * 34},33 L{31 + i * 34},46 Z" fill="{GREY}"/>'
    f'<circle cx="{25 + i * 34}" cy="20" r="3" fill="{GREY}"/>'
    f'<rect x="{5 + i * 34}" y="12" width="26" height="34" rx="2" fill="#ffffff" opacity="{o}"/>'
    f'<rect x="{5 + i * 34}" y="12" width="26" height="34" rx="2" fill="none" stroke="{RULE_SOLID}" stroke-width=".55"/></g>'
    for i, o in enumerate([0, 0.25, 0.5, 0])
)

T1 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t1r3-title t1r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t1r3-title">换一位主角</title>
<desc id="t1r3-desc">两个人物剪影，前面一个是墨黑实底，右后方一个是淡灰；淡灰那个套着一枚陶色圈，表示点它就当场对调。</desc>
<circle class="greyf" cx="92" cy="22" r="7"/>
<path class="greyf" d="M78,52 Q78,34 92,34 Q106,34 106,52 Z"/>
<circle cx="92" cy="34" r="24" fill="none" stroke="{ACCENT}" stroke-width=".8"/>
<circle class="inkf" cx="48" cy="26" r="9"/>
<path class="inkf" d="M30,60 Q30,38 48,38 Q66,38 66,60 Z"/>
</svg>"""

T2 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t2r3-title t2r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t2r3-title">调亮度</title>
<desc id="t2r3-desc">四张并排的小画面，罩子透明度依次是零、四分之一、二分之一、再回零；第三张下面有一道陶色短线，表示默认停在这一档。</desc>
{T2_FRAMES}
<rect x="{5 + 2 * 34}" y="52" width="26" height="2" rx="1" fill="{ACCENT}"/>
</svg>"""

# 变体 B：同一幅画 + 一排 8pt 等宽数字。数字属于「拉丁技术值」，规范允许（下限 6pt）；
# 但按已拍的「图内小字全撤」默认不给，只作为备选摆出来让他挑。
T2B = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t2b-title t2b-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t2b-title">调亮度（带档位数字的备选）</title>
<desc id="t2b-desc">同上，但每格下面标出罩子透明度的百分比数字。</desc>
{T2_FRAMES}
<rect x="{5 + 2 * 34}" y="52" width="26" height="2" rx="1" fill="{ACCENT}"/>
<text class="sl" x="18" y="64" text-anchor="middle">0</text>
<text class="sl" x="52" y="64" text-anchor="middle">25</text>
<text class="sl" x="86" y="64" text-anchor="middle">50</text>
<text class="sl" x="120" y="64" text-anchor="middle">0</text>
</svg>"""

T3 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t3r3-title t3r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t3r3-title">右滑才开始提炼</title>
<desc id="t3r3-desc">一条横向长轨道，滑块已经推到最右端并且变成陶色；左侧三道短线表示它是被推过来的。</desc>
<rect x="16" y="26" width="106" height="17" rx="8" fill="{PAPER2}" stroke="{RULE_SOLID}" stroke-width=".55"/>
<line class="grey" x1="28" y1="30" x2="44" y2="30"/>
<line class="grey" x1="24" y1="34" x2="48" y2="34"/>
<line class="grey" x1="28" y1="38" x2="44" y2="38"/>
<circle class="accf" cx="112" cy="34" r="9"/>
<path d="M108,34 L112,30 L116,34 M112,30 L112,39" fill="none" stroke="{PAPER}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>"""

T4 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t4r3-title t4r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t4r3-title">左右滑换模板</title>
<desc id="t4r3-desc">一排六张缩略卡，第三张描边更粗表示当前选中，它下面有一枚陶色圆点；上方两枚反向箭头表示可以左右滑。</desc>
{"".join(
    f'<rect x="{11 + i * 20}" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{INK if i == 2 else RULE_SOLID}" stroke-width="{1.1 if i == 2 else .55}"/>'
    f'<line class="hair" x1="{14 + i * 20}" y1="29" x2="{24 + i * 20}" y2="29" stroke="{GREY}"/>'
    f'<line class="hair" x1="{14 + i * 20}" y1="34" x2="{24 + i * 20}" y2="34" stroke="{GREY}"/>'
    f'<line class="hair" x1="{14 + i * 20}" y1="39" x2="{21 + i * 20}" y2="39" stroke="{GREY}"/>'
    for i in range(6)
)}
<circle class="accf" cx="59" cy="54" r="2.5"/>
<path class="s thin mut" d="M56,12 H30 M36,8 L30,12 L36,16"/>
<path class="s thin mut" d="M82,12 H108 M102,8 L108,12 L102,16"/>
</svg>"""

T5 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t5r3-title t5r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t5r3-title">换笔记头像</title>
<desc id="t5r3-desc">左边是二乘二的四格母题，其中一格是陶色；右边是一张卡片，卡片左下角署着同一套四格的小号版本，表示两处用的是同一套图。</desc>
<rect class="inkf" x="16" y="16" width="15" height="15" rx="2"/>
<rect class="greyf" x="34" y="16" width="15" height="15" rx="2"/>
<rect x="16" y="34" width="15" height="15" rx="2" fill="{PAPER2}"/>
<rect class="accf" x="34" y="34" width="15" height="15" rx="2"/>
<rect x="66" y="12" width="60" height="45" rx="4" fill="#ffffff" stroke="{INK}" stroke-width=".8"/>
<line class="hair" x1="74" y1="24" x2="112" y2="24" stroke="{GREY}"/>
<line class="hair" x1="74" y1="31" x2="118" y2="31" stroke="{GREY}"/>
<line class="hair" x1="74" y1="38" x2="104" y2="38" stroke="{GREY}"/>
<rect class="inkf" x="74" y="45" width="4" height="4"/>
<rect class="greyf" x="80" y="45" width="4" height="4"/>
<rect x="74" y="51" width="4" height="4" fill="{PAPER2}"/>
<rect class="accf" x="80" y="51" width="4" height="4"/>
</svg>"""

T6 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t6r3-title t6r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t6r3-title">控制提炼的语言</title>
<desc id="t6r3-desc">一枚开关停在左边关闭位置，右边并排两个字样 EN 与 中；开关下方有一枚陶色圆点，表示默认停在关闭这一侧。</desc>
<rect x="18" y="26" width="34" height="17" rx="8" fill="{PAPER2}" stroke="{RULE_SOLID}" stroke-width=".55"/>
<circle cx="27" cy="34" r="6.5" fill="#ffffff" stroke="{INK}" stroke-width=".8"/>
<circle class="accf" cx="27" cy="54" r="2.5"/>
<text class="nm" x="76" y="38">EN</text>
<text class="nm" x="106" y="38">中</text>
<line class="rule" x1="66" y1="20" x2="66" y2="49"/>
</svg>"""

TILES_R3 = [T1, T2, T3, T4, T5, T6]

# ================================================================ 装配
SHEET_CSS = f"""
@page{{size:A4;margin:0}}
*{{box-sizing:border-box}}
body{{margin:0;color:#252923;background:{PAPER};font:10pt/1.78 {SANS};
     -webkit-print-color-adjust:exact;print-color-adjust:exact}}
.page{{width:595.28pt;height:841.89pt;padding:39pt 46pt 62pt;position:relative;overflow:hidden;page-break-after:always}}
.page:last-child{{page-break-after:auto}}
h1{{font-family:{SERIF};font-size:17pt;font-weight:600;margin:0 0 4pt;letter-spacing:.5pt}}
h2{{font-family:{SERIF};font-size:12.5pt;font-weight:600;margin:0 0 6pt}}
.lead{{font-size:9.5pt;color:{MUTED};margin:0 0 14pt}}
.lab{{font-size:8.5pt;font-weight:600;color:{ACCENT_INK};letter-spacing:.4pt;margin:14pt 0 5pt}}
.lab.first{{margin-top:0}}
.note{{font-size:8.5pt;color:{MUTED};margin:6pt 0 0;line-height:1.7}}
.tiles{{display:grid;grid-template-columns:repeat(3,1fr);gap:14pt}}
.rule{{height:.6pt;background:{RULE_SOLID};margin:16pt 0}}
table{{border-collapse:collapse;width:100%;font-size:8.5pt}}
th,td{{text-align:left;padding:5pt 6pt;border-bottom:.5pt solid rgba(34,37,31,.12);vertical-align:top;line-height:1.6}}
th{{font-weight:600;color:{MUTED};font-size:8pt}}
td.bad{{color:{ACCENT_INK};font-weight:600}}
ol{{margin:0;padding-left:16pt;font-size:9pt;line-height:1.75}}
ol li{{margin-bottom:5pt}}
b{{font-weight:600}}
/* ---- 下面这四行是从成品 HTML 里原样抄的 .tryit，用来真尺度量「六段说明搬进正文」要吃掉多少版面 ---- */
.tryit{{margin:6pt 0 0}}
.tryit p{{font-size:9pt;color:#252923;margin:0 0 4pt;padding-left:66pt;text-indent:-66pt;line-height:1.8}}
.tryit b{{font-family:{SERIF};color:{ACCENT_INK};font-weight:600;display:inline-block;min-width:56pt;text-indent:0}}
.footer{{position:absolute;left:46pt;right:46pt;bottom:25pt;display:flex;justify-content:space-between;
        font-size:7.5pt;color:{GREY};border-top:.5pt solid {RULE_SOLID};padding-top:5pt}}
"""

# 节点里撤出来的六段说明，原样搬进 P3 正文；用成品里已有的 .tryit 悬挂缩进（P8 已在用），不新造类名。
P3_PROSE = [
    ("① 录入与提炼", "链接 / 截图 / 手写三档，服务端提炼，用户核对、修改、归类。"),
    ("② 出卡", "十套模板左右滑着换，端侧先测量再绘制，按内容定高画成一张图。"),
    ("③ 分享", "微信自己的转发三通道；存到相册后由用户发，产品不替用户发布。"),
    ("④ 扫码读快照", "卡片上那枚码进公开页，读的是建分享那一刻的快照，不登录也能看。"),
    ("⑤ 转存", "服务端从快照抄一条新的：标题、摘要、要点、标签、链接、来源。"),
    ("⑥ 他自己的库里", "来源只读钉住，编辑不掉、只能整条删；可以再编辑、再出卡、再分享。"),
]
P3_PROSE_HTML = '<div class="tryit">' + "".join(
    f"<p><b>{k}</b>{v}</p>" for k, v in P3_PROSE
) + "</div>"

r2_p3 = svgs(3)[0]
r2_p8 = svgs(8)[:6]
assert len(r2_p8) == 6, len(r2_p8)


def reid(svg, old, new):
    """同一张图在样张里出现两次时改 id 前缀，避免 id 撞车（aria-labelledby 与 url(#..) 一起改）。"""
    return svg.replace(old + "-", new + "-")


T2_JIA = reid(T2, "t2r3", "t2jia")
T2_YI = reid(T2B, "t2b", "t2yi")
assert T2_JIA != T2 and "t2jia-title" in T2_JIA and "t2yi-title" in T2_YI


def r2tiles():
    return "".join(f'<div class="r2box">{s}</div>' for s in r2_p8)


def r3tiles():
    return "".join(f'<div class="r3box">{s}</div>' for s in TILES_R3)


HTML = f"""<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>r3 样张 · P3 双泳道 + P8 六格 · r2/r3 对照</title>
<style>{SHEET_CSS}{R2_CSS}{R3_CSS}</style></head><body>

<article class="page" data-page="1">
<h1>r3 样张 · 一：P3 双泳道，r2 与 r3 对照</h1>
<p class="lead">上＝现在交付件里的 r2 原样（SVG 与它那套 CSS 直接从成品 HTML 里取出，看到的就是印出来的样子）；
下＝按新规范重画的 r3。两张都是真实尺度：整栏图框内实渲宽 482pt。</p>

<div class="lab first">r2（现在这一版）· 实占 <span class="m" id="m-r2">?</span></div>
<div class="r2box" id="box-r2">{r2_p3}</div>

<div class="lab">r3（新规范）· 实占 <span class="m" id="m-r3">?</span></div>
<div class="r3box" id="box-r3">{P3_R3}</div>

<p class="note"><b>先看这五条量得出来的差别：</b>
图内中文字号 6.32pt 衬线 → <b>9–9.5pt sans</b>（正文那支 PingFang SC）；
偏移投影矩形 7 个 → <b>0 个</b>（层次改由「填充＋描边」承担）；
陶色元素 17 处 → <b>2 处</b>；
曲线连接器 2 条 → <b>0 条</b>（全部改成正交肘弯，半径 8）；
竖排箭头标签 1 条 → <b>0 条</b>（那条「转存之后 · 回到 ② 再走一次」原来被 <code>rotate(-90)</code> 竖着排在图右边）；
图高 <span class="m" id="m-h2">?</span> → <span class="m" id="m-h3">?</span>，
省出来的正好贴给搬进正文的那六行说明。逐条理由在下一页。</p>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>01 / 08</span></footer>
</article>

<article class="page" data-page="2">
<h1>r3 样张 · 二：P3 改动逐条 + 搬进正文的六行</h1>
<p class="lead">他已拍的口径是「节点只留标题，说明搬到正文」。下面这六行就是搬过去的样子，真尺度渲染。</p>

<div class="lab first">从节点里撤出来的六段说明 · 实占 <span class="m" id="m-prose">?</span></div>
<div id="box-prose">{P3_PROSE_HTML}</div>
<p class="note">用的是成品里已有的 <code>.tryit</code> 悬挂缩进（P8「建议评委这样体验」那一块就是它），不新造类名。
六段文字<b>一字未改</b>，是从 r2 那六个节点里逐字搬出来的。<br>
版面账：这一段实占 <span class="m" id="m-prose2">?</span>；图从 <span class="m" id="m-r2b">?</span> 压到 <span class="m" id="m-r3b">?</span>，
省下 <span class="m" id="m-save">?</span>；相抵之后还要 P3 现有余量出 <span class="m" id="m-need">?</span>。
P3 现在实测余量 <b>127px ≈ 95pt</b>（DOM 溢出尺读数 −127；这把尺有 ±5px 抖动，所以余量按 91–99pt 这个区间看）。
<b>结论：装得下，还有富余，不必压行距也不必删字。</b>
这一步会动到 P3 的正文，动手前这六行就是给他看的原文。</p>

<h2>逐条改了什么（1/3）· 每一条都是从 r2 的 SVG 源码里数出来的，不是观感</h2>
<ol>
<li><b>字号与字体。</b>图内中文从 6.32pt（整栏）／6.13pt（六格）的 Songti SC 衬线，抬到 9–9.5pt 的 PingFang SC——
和正文同一支字体。规范里中文字号下限定 9pt，理由就是这两组实测数。</li>
<li><b>投影全删。</b>r2 全篇 24 个偏移投影矩形（<code>class="sh"</code>，墨色 7% 透明度、右下各偏 2 单位），
这一张里 <b>7 个</b>。新规范写死「禁止任何投影」，层次改由填充色阶＋描边承担。
这条不是审美偏好，是插件规范原文：<i>Shadows are out. Borders are in.</i></li>
<li><b>陶色从 17 处收到 2 处。</b>r2 这一张里陶色落在 17 个元素上：3 处陶色文字（两条泳道标签＋那条竖排箭头标签）、
7 个小方块（节点④里那枚码的 3 个＋图中那枚码的 7 个里的一部分）、2 条虚线、1 条图例线、1 个箭头填充。
规范的焦点规则是每图 1–2 个，r3 只剩跨泳道那条交接箭头与接手的节点④。</li>
<li><b>陶色的语义换了。</b>r2 把陶色给了「第二次循环」那条虚线，r3 给了跨泳道那一次交接。
按 swimlane 的规矩，陶色应该落在「引入最多耦合或延迟的那一次交接」上；而且本页图题自己就写着
「两条泳道之间只隔着一枚小程序码」——那才是这一页的主角。第二次循环改成墨灰虚线
（虚线在箭头语法里本来就表示 return，不需要再借颜色）。</li>
</ol>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>02 / 08</span></footer>
</article>

<article class="page" data-page="3">
<h1>r3 样张 · 三：P3 逐条改了什么（2/3）</h1>
<p class="lead">接着上一页。下面这四条是连线与标签层面的，也是「看起来幼稚」最直接的技术来源。</p>
<ol start="5">
<li><b>曲线连接器 2 条改成 0 条。</b>r2 那条交接是 <code>M408 86 C 408 131 94 131 94 178</code>——一条三次贝塞尔，
从右上一路弯到左下；那条循环是 <code>M479 209 C 495 209 495 13 251 13</code>，从右下贴着画布右边缘
（x=495，画布只有 503 宽）一路扫到画布最顶端 y=13，再横穿整个图回到节点②上方。
规范第一条连线规则是<b>只允许正交</b>，斜的与弯的都判不合格；r3 改成两段直线加半径 8 的圆角肘弯。
（全篇这样数下来一共 9 条：P2 三条、P3 两条、P5 四条。）</li>
<li><b>竖排箭头标签 1 条改成 0 条。</b>r2 把「转存之后 · 回到 ② 再走一次」用
<code>transform="rotate(-90 477 124)"</code> 竖着排在画布右边缘，字号 6.6px（印出来 6.32pt）、陶色、还带 1px 字距。
这一条同时踩了三个反模式：竖排箭头文字、陶色做文字（3.47:1 不够）、箭头标签没有遮罩。
r3 把它改成横排、9pt、墨灰、底下一块不透明遮罩、离线 8pt。</li>
<li><b>节点里的小图标全撤。</b>r2 每个节点标题左边都画了一枚 8–9 单位大的小图标
（①是一个平行四边形加一撇、③是一个纸飞机、⑤是一支箭头、图例第三项是一把 9×7 的挂锁），
印出来只有 7–8pt 见方，笔画 2–3 段。<b>「幼稚」这个评价最可能就是指这批东西。</b>
r3 节点只留标题——按已拍的口径，说明搬正文，图标一起撤。</li>
<li><b>泳道标签从「药丸里的陶色小字」改成普通墨灰字。</b>r2 是 <code>rx=5</code> 的 32×10 药丸描边框
套 6.32pt 陶色字；规范写的是「矩形态标签用 rx=2，不要药丸」，而且陶色不够做文字。
r3 直接排 9pt 的 <code>soft</code>（墨色 66%，对比度 4.98:1），不加框。</li>
</ol>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>03 / 08</span></footer>
</article>

<article class="page" data-page="4">
<h1>r3 样张 · 四：P3 逐条改了什么（3/3）</h1>
<p class="lead">最后五条是删减与坐标系层面的。</p>
<ol start="9">
<li><b>节点只留标题</b>，六段说明搬进正文（就是第 2 页那六行）。</li>
<li><b>图例整条撤掉</b>，不是从 3 项减到 2 项。r2 那 3 项逐条对下来全是重复：
「实线 · 现网已跑通」本页副标题与注脚已各说一遍；
「陶色虚线 · 同一条笔记的第二次循环」图上那条箭头自带标签「转存之后 · 回到 ② 再走一次」；
「撤回只关"公开"这扇门，不抹掉读者已转存的那条」与本页 callout「撤回只关"公开"这一扇门。」是同一句话。</li>
<li><b>viewBox 从 503 改成 482。</b>r2 写 503，但图框 <code>.il</code> 自带 10pt 内边距与 0.6pt 描边，
实际缩到 0.958，字比名义小 4%。r3 的规矩：<b>viewBox 宽度必须等于纸上实渲宽度</b>。</li>
<li><b>箭头标签一律带不透明遮罩。</b>r2 两条横排标签（「公开快照 · 不登录也能读」「卡片上的小程序码」）
都是裸文字直接压在线上；r3 每条标签底下先铺一块纸白遮罩，离线 8–9pt。</li>
<li><b>连线先画、节点后画。</b>r3 的 SVG 里所有 line/path 都在 rect 之前，所以线不会压在框上。
另外 r2 那条交接曲线是从图中那枚「小程序码」方框<b>背后</b>穿过去的（方框后画，把线盖住了一段）；
r3 不画那枚码，交接线走在两条泳道之间的空白带里，不穿任何东西。</li>
</ol>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>04 / 08</span></footer>
</article>

<article class="page" data-page="5">
<h1>r3 样张 · 五：P8 六格，r2 与 r3 对照</h1>
<p class="lead">六格实渲宽 144.9pt（3 列 × 2 行，格框约 158.4pt 减去 .tile .il 的 6pt 内边距与描边；
早先写的 137.8pt 是把整栏的 10pt 内边距套错容器心算出来的，已从 r2 成品复量更正）。
按已拍的口径，图内小字全撤，插画占满整格，字交给格子下方他自己的正文。</p>

<div class="lab first">r2（现在这一版）</div>
<div class="tiles">{r2tiles()}</div>

<div class="lab">r3（新规范）</div>
<div class="tiles">{r3tiles()}</div>

<p class="note"><b>为什么图内小字必须撤：</b>r2 那六条小字印出来是 <b>6.13pt</b>，正压在 A4 脚注下限上；
按新的 9pt 中文下限，一行只装得下 16 个全角字，而 r2 有一条是 17 字（「同一套图铺第一屏、也署名在卡片角落」），
9pt 下要 153pt，格子只有 144.9pt，<b>装不下</b>（r2 那版它甚至越出了 viewBox）。
再逐条对他自己的正文，六条里四条是近似重复——
「推到底才提交」对「长条往右推到底才提交」；
「十套缩略排成一排」对「十套缩略排成一排，滑着换」（一字不差）；
「同一套图铺第一屏、也署名在卡片角落」对「同一套图既铺第一屏、也署名在卡片角落」；
「默认关 · 关跟原文语言」对「开关默认关：关＝摘要跟原文语言走」。
第五条「四格 · 存在账号里」是半重复（「四格」这个名字正文没有，但画出来就是四格）。
只有第二条「纯白 → 25% → 50% → 回纯白」是真互补，所以它单独拎出来做成下一页那道甲／乙。</p>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>05 / 08</span></footer>
</article>

<article class="page" data-page="6">
<h1>r3 样张 · 六：一道待你挑（第 2 格「调亮度」）</h1>
<p class="lead">六格里唯一一处「图说不清、他正文里也没有」的信息，就是三个亮度档位的具体数值。</p>

<div class="tiles" style="grid-template-columns:1fr 1fr;gap:20pt">
  <div><div class="lab first">甲（默认，按已拍的「图内小字全撤」）</div>
  <div class="r3box">{T2_JIA}</div>
  <p class="note" style="margin-top:6pt">一个字不留。<b>代价：</b>第 1 格与第 4 格看起来一模一样（都是纯白），
  「压到 50% 之后会绕回纯白」这件事只能靠读者自己推。</p></div>
  <div><div class="lab first">乙（备选）</div>
  <div class="r3box">{T2_YI}</div>
  <p class="note" style="margin-top:6pt">同一幅画，下面加一排 8pt 等宽数字 0 / 25 / 50 / 0。
  数字属于规范允许的「拉丁技术值」（下限 6pt），不算中文小字；绕回纯白那一档一眼就读出来。
  <b>代价：</b>这一格破一次「图内不放字」的例。</p></div>
</div>

<p class="note"><b>我倾向乙</b>，理由只有一条：他的正文写的是「压的是罩子透明度，不是重画一张图；背景再深也不把数字压没」，
三个档位值在正文里一个都没出现过，撤掉就是净丢一条卖点，而「不许悄悄砍卖点」是他自己定的规矩。
但「图内小字全撤」也是他拍的，所以两条口径在这里撞上了——先按甲摆着，等他挑。<br><br>
<b>六格共用的那批件：</b>纸片（圆角 2 的矩形＋远山＋日轮）、控件轨道（圆角 8 的胶囊）、缩略卡、
人物剪影（实底、无五官、头身比约 1:6.5）、二乘二四格母题。笔重只有 0.55 / 0.8 / 1.1pt 三档，
每格陶色只落一处，就是这一格想让你看的那一处。<br>
唯一的例外是第 5 格，陶色落在两处：那一格要说的就是「同一套四格图，既铺第一屏也署名在卡片角落」，
大格与卡片角上那枚小号的必须是同一套，少一处这句话就不成立。<br>
第 3 页那张 P3 图，带陶色的元素数出来是 2 个：跨泳道那条连线＋接手的那个节点④
（它自己箭头的那枚陶色填充在 <code>&lt;defs&gt;</code> 里，是这条线的一部分，不单独算一个焦点）。
规范上限是每图 1–2 个。<br><br>
第 6 格保留的「EN / 中」不是图内小字，是被画出来的那个开关上的字（r2 那格也有），撤了这格就看不出在切什么。</p>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>06 / 08</span></footer>
</article>

<article class="page" data-page="7">
<h1>r3 样张 · 七：判据（一）· r2 量出来的硬伤</h1>
<p class="lead">这一页与下一页都不画图，只把能量化的东西摊开。</p>

<h2>一、r2 量出来的七条硬伤</h2>
<table>
<tr><th>项</th><th>r2 实测（源码里数出来的 / 从成品 PDF 上量的）</th><th>规范下限或原文</th></tr>
<tr><td>图内中文字号</td><td class="bad">整栏图最小 6.32pt；P8 六格最小 6.13pt</td><td>中文 9pt；任何文字 6pt</td></tr>
<tr><td>图内中文字体</td><td class="bad">Songti SC 衬线（正文是 PingFang SC）</td><td>名字用 sans，衬线只留给标题与 callout</td></tr>
<tr><td>投影</td><td class="bad">24 个偏移投影矩形</td><td>0 —— <i>Shadows are out. Borders are in.</i></td></tr>
<tr><td>陶色用量</td><td class="bad">全篇 62 个元素带陶色，其中 11 处是陶色文字</td><td>每图 1–2 个焦点元素；陶色 3.47:1 不够做文字</td></tr>
<tr><td>曲线／斜线连接器</td><td class="bad">9 条（P2 三、P3 两、P5 四）</td><td>0 —— 连线规则一：<i>Orthogonal only</i>，肘弯半径 8</td></tr>
<tr><td>竖排箭头标签</td><td class="bad">1 条，<code>rotate(-90)</code>，6.32pt 陶色、无遮罩</td><td>0 —— 反模式表里点名：<i>Vertical text on arrows → Unreadable</i></td></tr>
<tr><td>无障碍标记</td><td class="bad">插件自带的 self_check.py 判 r2 那 7 张<b>全不合格</b>：
没有 <code>role="img"</code>、没有 <code>&lt;title&gt;</code>／<code>&lt;desc&gt;</code>、没有 <code>aria-labelledby</code></td>
<td>9 张 r3 图全部通过同一个检查器（读屏软件与评审的辅助技术要靠它）</td></tr>
</table>
<p class="note">self_check.py 是插件安装包里自带的，跑在这份样张上：16 个 svg 里判不合格的正好是 1、3、4、5、6、7、8 号——
按样张里的顺序，那就是 r2 的 P3 与 r2 的六格，一个不漏；r3 的 9 张（2 号、9–16 号）全过。
这不是我自己给自己打分，是插件自己的判据。</p>
<p class="note">对比度手算（WCAG 2.x）：陶色 #D2683F 在纸白上 3.47:1 → 够做线条标记，不够做文字；
在雾灰 #E7E3D8 上只有 2.83:1 → 连标记都不够；r2 图题用的 #8a8b80 是 3.31:1 → 文字不合格；
同色相压暗的 #98613c 是 4.90:1 → 合格，这就是陶色文字该用的值。</p>
<p class="note"><b>站长说的「幼稚」，落到源码上最可能是这三样：</b>
① 每个节点标题左边那枚 8–9 单位（印出来 7–8pt 见方）、只用 2–3 段笔画勾出来的小图标——
一个平行四边形加一撇当「录入」、一个纸飞机当「分享」、一把 9×7 的挂锁当「撤回」；
② 那条从画布右下角贴着右边缘（x=495，画布只有 503 宽）一路扫到最顶端 y=13、再横穿整幅图回到节点②上方的循环曲线；
③ 竖排在右边缘的 6.32pt 陶色小字。r3 把这三样全撤了。</p>

<h2>二、他挑完之后我才动的</h2>
<ol>
<li>13 个 SVG 全部按新规范重画（P7 那两张 CSS 图只校色、不动结构）。</li>
<li>重跑两把尺子：DOM 溢出尺 + pymupdf 页框外词扫描；页数与页脚 NN / 24 不许变；封面那个假红照旧、不追。</li>
<li>重渲 PDF、逐页眼看、更新交付说明（含上面第 1、4、5 条更正）。</li>
<li>然后才问他要不要把 比赛/ 提交到 git（那里有一份 25MB 的授权书 PDF，只能按文件名 add）。</li>
</ol>
<footer class="footer"><span>图麦笔记 · r3 样张</span><span>07 / 08</span></footer>
</article>

<article class="page" data-page="8">
<h1>r3 样张 · 八：账（接着上一页）</h1>
<h2>三、viewBox 那条更正（r2 的账算错了）</h2>
<table>
<tr><th>位置</th><th>r2 viewBox 宽</th><th>纸上实渲宽</th><th>缩放</th></tr>
<tr><td>整栏图（P2/P3/P4/P5/P7条）</td><td>503</td><td class="bad">482.0pt</td><td>0.958</td></tr>
<tr><td>P8 六格</td><td>156</td><td class="bad">144.94pt</td><td>0.929</td></tr>
<tr><td>P21 通栏条</td><td>503</td><td>503.3pt</td><td>1.001</td></tr>
</table>
<p class="note">所以 r2 说的「viewBox 用 pt 单位、1 单位＝纸上 1pt」其实没成立——图框 .il 自带 10pt 内边距 + 0.6pt 描边。
六格那行早先写成 137.8pt／0.883 是错的：那是把整栏的 10pt 内边距套到 <b>.tile .il</b>（实际 6pt）上心算出来的，
从 r2 的成品上复量是 144.94pt／0.929；6.13pt 那个结论是直接量的、没受影响。P21 在 .band 里、没有左右内边距，
从来就不属于 0.958 那一组。
r3 的规矩改成：<b>viewBox 宽度必须等于纸上实渲宽度</b>，整栏图 482，六格 138，通栏条 503；
出图后复量四种容器比值 0.9996／1.0502／1.0006／0.965（hero），六格与 hero 不是 1:1 但方向安全，钉进插画规范第二节。</p>

<h2>四、铺开 13 张之前要说清的账</h2>
<ol>
<li><b>成品里是 13 个内联 SVG，不是 16 张。</b>外加 P7 上 2 个纯 CSS 画的图（亮度四档、面板两档），
合计 15 个图形单元，分布在 7 页（P2、P3、P4、P5、P7×2＋2CSS、P8×6、P21）。r2 交付说明里的「16 张」会按这个读数改。</li>
<li><b>P3 的版面账已经算过、量过，装得下。</b>见第 2 页：六行实占 <span class="m" id="m-prose3">?</span>，
图省下 <span class="m" id="m-save2">?</span>，还需余量 <span class="m" id="m-need2">?</span>，而 P3 实测余量 91–99pt。
上一版说的「还差约 4pt」是按带图例的 252 高算的，图例撤掉之后这个缺口没有了。</li>
<li><b>连线规则里有两条没有机器判据。</b>插件安装包里只有 self_check.py，verify-geometry.py 只在仓库 checkout 里有。
所以「禁斜线」与「遮罩不许压后画的节点」这两条只能手工核，交付时会写明是手工核的，不冒充机器验过。
（第 4 格里那两枚滑动箭头有斜线段，那是箭头本身的尖，不是节点之间的连线，规则一管的是后者。）</li>
<li><b>溢出尺本身有 ±5px 抖动。</b>同一份文件连跑两次，P2 分别读到 −6px 与 −11px。
所以「最紧的那一页差多少」要给区间，不能给单点数字。r2 交付说明里写的是 −11px，两次读数都在噪声里。</li>
<li><b>溢出尺在封面上会报一个假红。</b>刚才这一趟它报「溢出 1 页」，红的是 P1，差 +83px，最靠下是 <code>img.cover-art</code>。
量过封面 CSS：<code>.cover{{padding:0}}</code>、<code>.cover .content{{width:100%;height:100%}}</code>、
<code>.cover-art{{width:100%;height:100%;object-fit:contain}}</code>——图正好一页大，没有真溢出。
报红是因为 <code>.cover .footer{{display:none}}</code>，尺子找不到页脚就退回「页底减 62pt」当线，
而封面是满版出血、本来就没有那条线。<b>这一条不要去「修」。</b></li>
</ol>

<footer class="footer"><span>图麦笔记 · r3 样张</span><span>08 / 08</span></footer>
</article>

</body></html>
"""

# ------------------------------------------------------------------ 量一遍再把数字填回去
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROBE = """<script>
(function(){
  function h(id){var e=document.getElementById(id);return e?Math.round(e.getBoundingClientRect().height*10)/10:-1;}
  var r2=h("box-r2"),r3=h("box-r3"),pr=h("box-prose");
  var out={r2:r2,r3:r3,prose:pr,save:Math.round((r2-r3)*10)/10,need:Math.round((pr-(r2-r3))*10)/10};
  var pre=document.createElement("pre");pre.id="mm";pre.textContent=JSON.stringify(out);
  document.body.appendChild(pre);
})();
</script>"""

import json, subprocess, tempfile

OUT.write_text(HTML, encoding="utf-8")
tmp = pathlib.Path(tempfile.mkdtemp()) / "probe.html"
tmp.write_text(HTML.replace("</body>", PROBE + "</body>"), encoding="utf-8")
r = subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-first-run",
                    "--window-size=1000,1400", "--virtual-time-budget=25000",
                    "--dump-dom", f"file://{tmp}"], capture_output=True, text=True)
mm = re.search(r'<pre id="mm">(.*?)</pre>', r.stdout, re.S)
if not mm:
    print("量不到高度，chrome 退出码", r.returncode, r.stderr[-300:])
    print("样张里的数字会留成 ?，交付前必须补量。")
else:
    d = json.loads(mm.group(1).replace("&quot;", '"'))
    print("量到的高度（px，1pt = 96/72 px）：", d)
    pt = lambda v: f"{v * 72 / 96:.1f}pt"
    fill = {
        'id="m-r2">?': f'id="m-r2">{pt(d["r2"])}',
        'id="m-r3">?': f'id="m-r3">{pt(d["r3"])}',
        'id="m-h2">?': f'id="m-h2">{pt(d["r2"])}',
        'id="m-h3">?': f'id="m-h3">{pt(d["r3"])}',
        'id="m-prose">?': f'id="m-prose">{pt(d["prose"])}',
        'id="m-prose2">?': f'id="m-prose2">{pt(d["prose"])}',
        'id="m-prose3">?': f'id="m-prose3">{pt(d["prose"])}',
        'id="m-r2b">?': f'id="m-r2b">{pt(d["r2"])}',
        'id="m-r3b">?': f'id="m-r3b">{pt(d["r3"])}',
        'id="m-save">?': f'id="m-save">{pt(d["save"])}',
        'id="m-save2">?': f'id="m-save2">{pt(d["save"])}',
        'id="m-need">?': f'id="m-need">{pt(d["need"])}',
        'id="m-need2">?': f'id="m-need2">{pt(d["need"])}',
    }
    for k, v in fill.items():
        assert k in HTML, k
        HTML = HTML.replace(k, v)
    OUT.write_text(HTML, encoding="utf-8")
    print(f"账：六行实占 {pt(d['prose'])}，图省下 {pt(d['save'])}，还需余量 {pt(d['need'])}；"
          f"合并稿 P3 现余量 41px≈30.8pt（±5px 抖动；六行说明搬进正文后从 127px 吃到 41px）")
    if d["need"] * 72 / 96 > 91:
        print("⚠ 富余不够，需要压行距或缩图")
    else:
        print("✓ 装得下")

print("写出", OUT, OUT.stat().st_size, "字节")

# ------------------------------------------------------------------ 自查
bad = []
FIGS = [("P3", P3_R3)] + [(f"T{i}", t) for i, t in enumerate(TILES_R3, 1)] + [("T2B", T2B)]
for name, s in FIGS:
    for sz in re.findall(r"font-size:\s*([\d.]+)px", s):
        if float(sz) < 6:
            bad.append((name, "字号", sz))
    for cls in re.findall(r'class="([^"]*)"', s):
        if "sh" in cls.split():
            bad.append((name, "投影", cls))
    ids = set(re.findall(r'\bid="([^"]+)"', s))
    for ref in re.findall(r'aria-labelledby="([^"]+)"', s):
        for one in ref.split():
            if one not in ids:
                bad.append((name, "aria 引用不存在的 id", one))
    for u in re.findall(r"url\(#([^)]+)\)", s):
        if u not in ids:
            bad.append((name, "marker 引用不存在", u))
print("r3 自查（字号 < 6pt / 投影 / aria / marker）：", bad or "全过")

CLAY_CLASSES = {"acc", "accf", "focalf"}


def clay_count(s):
    """数「带陶色的元素」：类名里有 acc/accf/focalf，或属性里直接写了陶色十六进制。
    <defs> 里的不算——箭头填充是那条连线自己的头，不是第二个焦点元素。"""
    s = re.sub(r"<defs>.*?</defs>", "", s, flags=re.S)
    n = 0
    for tag, at in re.findall(r"<(\w+)([^>]*)>", s):
        if tag in ("svg", "defs", "style", "title", "desc"):
            continue
        cls = re.search(r'class="([^"]*)"', at)
        cls = set(cls.group(1).split()) if cls else set()
        if (cls & CLAY_CLASSES) or re.search(re.escape(ACCENT) + r"|rgba\(210,104,63", at, re.I):
            n += 1
    return n


print("r3 陶色用量（带陶色的元素个数；规范上限是每图 1–2 个焦点元素）：")
for name, s in FIGS:
    print(f"  {name:4} = {clay_count(s)} 处")

ids = re.findall(r'\bid="([^"]+)"', HTML)
dup = sorted({x for x in ids if ids.count(x) > 1})
print("整份样张里重复的 id：", dup or "无")
assert not dup, dup

