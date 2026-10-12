#!/usr/bin/env python3
# r3 铺开：把方向稿六页里的 12 张 r2 SVG 换成 r3（第 13 张 P21 在生成器里换）。
# 样张-r3.py 是给他挑方向用的冻结证据，本文件是活源；P3 与六格与样张里他看过的那批逐字相同。
# 只写 docs/design/10-11重梳理/方向稿-V5-六页.html，不碰比赛/ 与 miniprogram/。
import re, pathlib

HERE = pathlib.Path(__file__).resolve().parent
DRAFT = HERE / "方向稿-V5-六页.html"

INK, MUTED, SOFT = "#22251f", "#4a4d44", "rgba(34,37,31,.66)"
PAPER, PAPER2, RULE, ACCENT, GREY = "#FBFAF7", "#E7E3D8", "#cfccc2", "#D2683F", "#b9b6ab"
SANS = "'PingFang SC','Helvetica Neue','Noto Sans SC','Microsoft YaHei',sans-serif"

# ---------------------------------------------------------------- P2 从散落到成册 482×148
# 三张散页保留旋转（插画允许），但连线全改成水平直线：旋转的卡片各自对准笔记卡左边的一个 attach 点。
# 图内说明字全部 9px sans；陶色只落一处＝笔记卡里那枚「可出卡」小方块。
P2 = f"""<svg viewBox="0 0 482 148" role="img" aria-labelledby="p2r3-title p2r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p2r3-title">从散落到成册</title>
<desc id="p2r3-desc">左边三张微微歪斜的纸片，分别是在读文章的链接、画面里的截图、冒出的一句想法；三条水平线把它们接进右边一张笔记卡，卡里有标题、摘要、要点、标签四行，和一枚陶色小方块表示可出卡可分享可找回；最右一栏是这段图的说明。</desc>
<defs><marker id="arP2m" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{MUTED}"/></marker></defs>
<line class="s mut" x1="108" y1="28" x2="232" y2="28" marker-end="url(#arP2m)"/>
<line class="s mut" x1="208" y1="56" x2="232" y2="56" marker-end="url(#arP2m)"/>
<line class="s mut" x1="124" y1="90" x2="232" y2="90" marker-end="url(#arP2m)"/>
<g transform="rotate(-4 60 28)"><rect class="whitef" x="12" y="6" width="96" height="44" rx="2"/>
<line class="hair" x1="20" y1="16" x2="76" y2="16" stroke="{GREY}"/><line class="hair" x1="20" y1="24" x2="92" y2="24" stroke="{GREY}"/><line class="hair" x1="20" y1="32" x2="84" y2="32" stroke="{GREY}"/>
<text class="al" x="20" y="44">链接 · 在读的文章</text></g>
<g transform="rotate(3 76 90)"><rect class="whitef" x="28" y="68" width="96" height="44" rx="2"/>
<rect class="mistf" x="36" y="76" width="40" height="18"/><circle cx="45" cy="82" r="2.5" fill="{GREY}"/><path d="M36,94 l11,-8 9,7 7,-6 11,7" fill="none" stroke="{GREY}" stroke-width=".55"/>
<text class="al" x="36" y="106">截图 · 画面里的字</text></g>
<g transform="rotate(-2 160 56)"><rect class="whitef" x="112" y="34" width="96" height="44" rx="2"/>
<path class="s thin grey" d="M120,58 l6,-14 4,10 5,-8 4,12"/>
<text class="al" x="120" y="72">想法 · 冒出一句</text></g>
<rect class="whitef" x="232" y="20" width="140" height="108" rx="4"/>
<text class="nm" x="244" y="36">一条笔记</text><line class="rule" x1="244" y1="42" x2="360" y2="42"/>
<rect class="mistf" x="244" y="50" width="66" height="5"/><text class="al" x="318" y="57">标题</text>
<rect class="mistf" x="244" y="64" width="66" height="12"/><text class="al" x="318" y="73">摘要</text>
<line class="hair" x1="244" y1="86" x2="310" y2="86" stroke="{GREY}"/><line class="hair" x1="244" y1="93" x2="310" y2="93" stroke="{GREY}"/><text class="al" x="318" y="91">要点</text>
<line class="hair" x1="244" y1="102" x2="310" y2="102" stroke="{GREY}"/><text class="al" x="318" y="105">标签</text>
<rect class="accf" x="240" y="110" width="12" height="12" rx="2"/><text class="al" x="258" y="120">可出卡 · 可分享 · 可找回</text>
<line class="rule" x1="384" y1="24" x2="384" y2="124"/>
<text class="al" x="394" y="40">散落在收藏夹、</text>
<text class="al" x="394" y="54">相册与聊天记录里</text>
<text class="al" x="394" y="68">的内容，接到一个</text>
<text class="al" x="394" y="82">轻量小程序里，</text>
<text class="al" x="394" y="96">成为能再次使用</text>
<text class="al" x="394" y="110">的笔记。</text>
</svg>"""

# ---------------------------------------------------------------- P4 六环时间线 482×58
# r2 的六枚陶色短竖线全撤：这张图没有单一焦点，陶色给 0 处比硬挑一处更诚实。
P4 = f"""<svg viewBox="0 0 482 58" role="img" aria-labelledby="p4r3-title p4r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p4r3-title">同一条链路，六处落闸</title>
<desc id="p4r3-desc">一条水平细线上等距排着六个环，依次是录入、出卡、分享、读、转存、商业化；每个环下面垂一小段线接它的名字。</desc>
<text class="eb" x="0" y="12">同一条链路 · 六处落闸</text>
<line class="rule" x1="0" y1="26" x2="482" y2="26"/>
<circle class="whitef" cx="40" cy="26" r="8"/><text class="nm" x="40" y="29.5" text-anchor="middle">①</text><line class="s thin mut" x1="40" y1="34" x2="40" y2="40"/><text class="al" x="40" y="52" text-anchor="middle">录入</text>
<circle class="whitef" cx="114" cy="26" r="8"/><text class="nm" x="114" y="29.5" text-anchor="middle">②</text><line class="s thin mut" x1="114" y1="34" x2="114" y2="40"/><text class="al" x="114" y="52" text-anchor="middle">出卡</text>
<circle class="whitef" cx="187" cy="26" r="8"/><text class="nm" x="187" y="29.5" text-anchor="middle">③</text><line class="s thin mut" x1="187" y1="34" x2="187" y2="40"/><text class="al" x="187" y="52" text-anchor="middle">分享</text>
<circle class="whitef" cx="261" cy="26" r="8"/><text class="nm" x="261" y="29.5" text-anchor="middle">④</text><line class="s thin mut" x1="261" y1="34" x2="261" y2="40"/><text class="al" x="261" y="52" text-anchor="middle">读</text>
<circle class="whitef" cx="334" cy="26" r="8"/><text class="nm" x="334" y="29.5" text-anchor="middle">⑤</text><line class="s thin mut" x1="334" y1="34" x2="334" y2="40"/><text class="al" x="334" y="52" text-anchor="middle">转存</text>
<circle class="whitef" cx="408" cy="26" r="8"/><text class="nm" x="408" y="29.5" text-anchor="middle">⑥</text><line class="s thin mut" x1="408" y1="34" x2="408" y2="40"/><text class="al" x="408" y="52" text-anchor="middle">商业化</text>
</svg>"""

# ---------------------------------------------------------------- P5 四门同室 482×178
# 四条曲线连接器改成「四进一出一排」的正交母线：四扇门先汇到一根竖线，再分四个 attach 点进房间。
# 陶色只给房间本身（focalf），因为这一页要说的就是「同一套结构」。
P5 = f"""<svg viewBox="0 0 482 178" role="img" aria-labelledby="p5r3-title p5r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p5r3-title">四种入口，同一套结构</title>
<desc id="p5r3-desc">左边四扇门：链接、截图或拍照、自己写、转存；四扇门汇到一根竖直母线，再并进中间那张笔记卡，卡里同样是标题、摘要、要点、标签四行；卡片右边接一只盒子，写之后都一样：搜索找回与分类、十套模板出卡、分享与转存。</desc>
<defs><marker id="arP5m" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{MUTED}"/></marker></defs>
<line class="s mut" x1="124" y1="25" x2="160" y2="25"/>
<line class="s mut" x1="124" y1="69" x2="160" y2="69"/>
<line class="s mut" x1="124" y1="113" x2="160" y2="113"/>
<line class="s mut" x1="124" y1="157" x2="160" y2="157"/>
<line class="s mut" x1="160" y1="25" x2="160" y2="157"/>
<line class="s mut" x1="160" y1="62" x2="196" y2="62" marker-end="url(#arP5m)"/>
<line class="s mut" x1="160" y1="80" x2="196" y2="80" marker-end="url(#arP5m)"/>
<line class="s mut" x1="160" y1="98" x2="196" y2="98" marker-end="url(#arP5m)"/>
<line class="s mut" x1="160" y1="116" x2="196" y2="116" marker-end="url(#arP5m)"/>
<rect class="whitef" x="0" y="6" width="124" height="38" rx="4"/><text class="nm" x="12" y="22">链接</text><text class="al" x="12" y="36">接住正在阅读的内容</text>
<rect class="whitef" x="0" y="50" width="124" height="38" rx="4"/><text class="nm" x="12" y="66">截图 / 拍照</text><text class="al" x="12" y="80">让画面里的字可整理</text>
<rect class="whitef" x="0" y="94" width="124" height="38" rx="4"/><text class="nm" x="12" y="110">自己写</text><text class="al" x="12" y="124">把判断留给用户</text>
<rect class="whitef" x="0" y="138" width="124" height="38" rx="4"/><text class="nm" x="12" y="154">转存</text><text class="al" x="12" y="168">好笔记，从这里开始</text>
<rect class="focalf" x="196" y="44" width="150" height="90" rx="4"/>
<text class="nm" x="208" y="60">同一条笔记</text><line class="rule" x1="208" y1="66" x2="334" y2="66"/>
<text class="al" x="208" y="80">标题</text><rect class="mistf" x="240" y="74" width="86" height="5"/>
<text class="al" x="208" y="93">摘要</text><rect class="mistf" x="240" y="84" width="86" height="12"/>
<text class="al" x="208" y="108">要点</text><line class="hair" x1="240" y1="104" x2="326" y2="104" stroke="{GREY}"/><line class="hair" x1="240" y1="111" x2="326" y2="111" stroke="{GREY}"/>
<text class="al" x="208" y="121">标签</text><line class="hair" x1="240" y1="118" x2="326" y2="118" stroke="{GREY}"/>
<line class="s mut" x1="346" y1="89" x2="366" y2="89" marker-end="url(#arP5m)"/>
<rect class="whitef" x="372" y="54" width="106" height="70" rx="4"/>
<text class="nm" x="384" y="72">之后都一样</text>
<text class="al" x="384" y="88">搜索找回 · 分类</text>
<text class="al" x="384" y="102">十套模板出卡</text>
<text class="al" x="384" y="116">分享与转存</text>
</svg>"""

# ---------------------------------------------------------------- P7 hero 200×210（实渲 193pt，缩放 0.965）
# 结构一行不动，只校色到 r3 令牌 + 那行字换 sans 10 单位（印出来 9.65pt）。
P7H = f"""<svg viewBox="0 0 200 210" role="img" aria-labelledby="p7hr3-title p7hr3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p7hr3-title">第一屏概念示意</title>
<desc id="p7hr3-desc">纸色天空下一轮陶色日轮、三层纸山；山前一个墨黑剪影手里摊着一张白纸，右后方一个淡灰剪影；左上角一行字：看到好的，随手记下来。</desc>
<rect x="0" y="0" width="200" height="210" fill="{PAPER2}"/>
<circle cx="150" cy="50" r="15" fill="{ACCENT}"/>
<path d="M0 128 C 34 112 62 134 96 120 S 160 128 200 114 L200 210 L0 210 Z" fill="{RULE}"/>
<path d="M0 156 C 40 140 74 164 112 148 S 178 156 200 144 L200 210 L0 210 Z" fill="{GREY}" opacity=".55"/>
<path d="M0 184 C 46 172 84 190 124 178 S 180 184 200 176 L200 210 L0 210 Z" fill="{GREY}"/>
<g fill="{INK}">
  <circle cx="74" cy="98" r="9.5"/>
  <path d="M62 122 c0 -10 5 -16 12 -16 s12 6 12 16 c0 8 -3 14 -5 20 h-14 c-2 -6 -5 -12 -5 -20 z"/>
</g>
<path d="M60 138 c8 -5 14 -5 14 0 c0 -5 6 -5 14 0 v7 c-8 -4 -14 -4 -14 0 c0 -4 -6 -4 -14 0 z" fill="{PAPER}" stroke="{INK}" stroke-width=".8"/>
<g fill="{GREY}">
  <circle cx="136" cy="112" r="6.5"/>
  <path d="M128 128 c0 -7 3.5 -11 8 -11 s8 4 8 11 c0 6 -2 10 -3.5 14 h-9 c-1.5 -4 -3.5 -8 -3.5 -14 z"/>
</g>
<text x="16" y="28" font-family="{SANS}" font-size="10" font-weight="500" fill="{MUTED}">看到好的，随手记下来</text>
</svg>"""

# ---------------------------------------------------------------- P7 录入面板条 482×67
P7S = f"""<svg viewBox="0 0 482 67" role="img" aria-labelledby="p7sr3-title p7sr3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p7sr3-title">录入面板，贴底那一层</title>
<desc id="p7sr3-desc">一条贴底面板：左边一个输入框（或一横排小图），右边一枚右滑才开始提炼的长条，滑块停在最右；面板外那一行左边是同一条轮播 Tips，右边是返回。</desc>
<text class="eb" x="0" y="10">录入面板 · 贴底那一层</text>
<rect class="whitef" x="0" y="16" width="482" height="34" rx="6"/>
<rect class="mistf" x="12" y="24" width="266" height="17" rx="3"/>
<text class="al" x="20" y="36">输入框 · 或一横排小图</text>
<rect x="290" y="25" width="150" height="13" rx="6.5" fill="{PAPER}" stroke="{RULE}" stroke-width=".55"/>
<text class="al" x="300" y="35">右滑开始提炼</text>
<circle class="accf" cx="433" cy="31.5" r="6"/>
<line class="rule" x1="0" y1="56" x2="482" y2="56"/>
<text class="al" x="0" y="64">框外左 · 与第一屏同一条轮播 Tips</text>
<text class="al" x="482" y="64" text-anchor="end">框外右 · 返回</text>
</svg>"""

# ---------------------------------------------------------------- P3 与六格：与样张里他看过的那批逐字相同
P3 = f"""<svg viewBox="0 0 482 212" role="img" aria-labelledby="p3r3-title p3r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="p3r3-title">一条笔记从作者走到读者的业务链路</title>
<desc id="p3r3-desc">双泳道流程图：作者侧依次是录入与提炼、出卡、分享；读者侧依次是扫码读快照、转存、进入他自己的库。两条泳道之间只有一次交接，靠卡片上的小程序码完成；读者转存之后可以再走一次出卡。</desc>
<defs>
<marker id="arP3m" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{MUTED}"/></marker>
<marker id="arP3a" markerWidth="6" markerHeight="5" refX="5.5" refY="2.5" orient="auto" markerUnits="userSpaceOnUse"><polygon points="0 0, 6 2.5, 0 5" fill="{ACCENT}"/></marker>
</defs>
<line class="s mut" x1="180" y1="32" x2="204" y2="32" marker-end="url(#arP3m)"/>
<line class="s mut" x1="328" y1="32" x2="352" y2="32" marker-end="url(#arP3m)"/>
<line class="s mut" x1="180" y1="148" x2="204" y2="148" marker-end="url(#arP3m)"/>
<line class="s mut" x1="328" y1="148" x2="352" y2="148" marker-end="url(#arP3m)"/>
<path class="s acc strong" d="M412,48 V104 Q412,112 404,112 H124 Q116,112 116,120 V130" marker-end="url(#arP3a)"/>
<path class="s mut dash" d="M412,164 V180 Q412,188 404,188 H272 Q264,188 264,180 V166" marker-end="url(#arP3m)"/>
<line class="lane" x1="0" y1="84" x2="482" y2="84"/>
<text class="eb" x="0" y="36">作者侧</text>
<text class="eb" x="0" y="152">读者侧</text>
<rect class="mask" x="224" y="91" width="80" height="12" rx="2"/>
<text class="al" x="264" y="100" text-anchor="middle">卡片上的小程序码</text>
<rect class="mask" x="270" y="196" width="136" height="12" rx="2"/>
<text class="al" x="338" y="205" text-anchor="middle">转存之后 · 回到 ② 再走一次</text>
<rect class="whitef" x="56" y="16" width="124" height="32" rx="4"/><text class="nm" x="68" y="36">① 录入与提炼</text>
<rect class="whitef" x="204" y="16" width="124" height="32" rx="4"/><text class="nm" x="216" y="36">② 出卡</text>
<rect class="whitef" x="352" y="16" width="124" height="32" rx="4"/><text class="nm" x="364" y="36">③ 分享</text>
<rect class="focalf" x="56" y="132" width="124" height="32" rx="4"/><text class="nm" x="68" y="152">④ 扫码读快照</text>
<rect class="whitef" x="204" y="132" width="124" height="32" rx="4"/><text class="nm" x="216" y="152">⑤ 转存</text>
<rect class="whitef" x="352" y="132" width="124" height="32" rx="4"/><text class="nm" x="364" y="152">⑥ 他自己的库里</text>
</svg>"""

_FR = "".join(
    f'<g><rect x="{x}" y="12" width="26" height="34" rx="2" fill="{PAPER2}"/>'
    f'<path d="M{x},46 L{x + 7},30 L{x + 14},40 L{x + 19},33 L{x + 26},46 Z" fill="{GREY}"/>'
    f'<circle cx="{x + 20}" cy="20" r="3" fill="{GREY}"/>'
    f'<rect x="{x}" y="12" width="26" height="34" rx="2" fill="#ffffff" opacity="{o}"/>'
    f'<rect x="{x}" y="12" width="26" height="34" rx="2" fill="none" stroke="{RULE}" stroke-width=".55"/></g>'
    for x, o in [(5, 0), (39, 0.25), (73, 0.5), (107, 0)]
)
_UNDER = f'<rect x="73" y="52" width="26" height="2" rx="1" fill="{ACCENT}"/>'

T1 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t1r3-title t1r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t1r3-title">换一位主角</title>
<desc id="t1r3-desc">两个人物剪影，前面一个是墨黑实底，右后方一个是淡灰；淡灰那个套着一枚陶色圈，表示点它就当场对调。</desc>
<circle class="greyf" cx="92" cy="22" r="7"/>
<path class="greyf" d="M78,52 Q78,34 92,34 Q106,34 106,52 Z"/>
<circle cx="92" cy="34" r="24" fill="none" stroke="{ACCENT}" stroke-width=".8"/>
<circle class="inkf" cx="48" cy="26" r="9"/>
<path class="inkf" d="M30,60 Q30,38 48,38 Q66,38 66,60 Z"/>
</svg>"""

# 第 2 格走乙（他拍）：同一幅画 + 一排 8pt 等宽数字，绕回纯白那一档一眼读得出来。
T2 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t2r3-title t2r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t2r3-title">调亮度</title>
<desc id="t2r3-desc">四张并排的小画面，罩子透明度依次是零、四分之一、二分之一、再回零；第三张下面有一道陶色短线，每格下面标出透明度数字。</desc>
{_FR}
{_UNDER}
<text class="sl" x="18" y="64" text-anchor="middle">0</text>
<text class="sl" x="52" y="64" text-anchor="middle">25</text>
<text class="sl" x="86" y="64" text-anchor="middle">50</text>
<text class="sl" x="120" y="64" text-anchor="middle">0</text>
</svg>"""

T3 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t3r3-title t3r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t3r3-title">右滑才开始提炼</title>
<desc id="t3r3-desc">一条横向长轨道，滑块已经推到最右端并且变成陶色；左侧三道短线表示它是被推过来的。</desc>
<rect x="16" y="26" width="106" height="17" rx="8" fill="{PAPER2}" stroke="{RULE}" stroke-width=".55"/>
<line class="grey" x1="28" y1="30" x2="44" y2="30"/>
<line class="grey" x1="24" y1="34" x2="48" y2="34"/>
<line class="grey" x1="28" y1="38" x2="44" y2="38"/>
<circle class="accf" cx="112" cy="34" r="9"/>
<path d="M108,34 L112,30 L116,34 M112,30 L112,39" fill="none" stroke="{PAPER}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
</svg>"""

T4 = f"""<svg viewBox="0 0 138 69" role="img" aria-labelledby="t4r3-title t4r3-desc" xmlns="http://www.w3.org/2000/svg">
<title id="t4r3-title">左右滑换模板</title>
<desc id="t4r3-desc">一排六张缩略卡，第三张描边更粗表示当前选中，它下面有一枚陶色圆点；上方两枚反向箭头表示可以左右滑。</desc>
<rect x="11" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{RULE}" stroke-width=".55"/><line class="hair" x1="14" y1="29" x2="24" y2="29" stroke="{GREY}"/><line class="hair" x1="14" y1="34" x2="24" y2="34" stroke="{GREY}"/><line class="hair" x1="14" y1="39" x2="21" y2="39" stroke="{GREY}"/>
<rect x="31" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{RULE}" stroke-width=".55"/><line class="hair" x1="34" y1="29" x2="44" y2="29" stroke="{GREY}"/><line class="hair" x1="34" y1="34" x2="44" y2="34" stroke="{GREY}"/><line class="hair" x1="34" y1="39" x2="41" y2="39" stroke="{GREY}"/>
<rect x="51" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{INK}" stroke-width="1.1"/><line class="hair" x1="54" y1="29" x2="64" y2="29" stroke="{GREY}"/><line class="hair" x1="54" y1="34" x2="64" y2="34" stroke="{GREY}"/><line class="hair" x1="54" y1="39" x2="61" y2="39" stroke="{GREY}"/>
<rect x="71" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{RULE}" stroke-width=".55"/><line class="hair" x1="74" y1="29" x2="84" y2="29" stroke="{GREY}"/><line class="hair" x1="74" y1="34" x2="84" y2="34" stroke="{GREY}"/><line class="hair" x1="74" y1="39" x2="81" y2="39" stroke="{GREY}"/>
<rect x="91" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{RULE}" stroke-width=".55"/><line class="hair" x1="94" y1="29" x2="104" y2="29" stroke="{GREY}"/><line class="hair" x1="94" y1="34" x2="104" y2="34" stroke="{GREY}"/><line class="hair" x1="94" y1="39" x2="101" y2="39" stroke="{GREY}"/>
<rect x="111" y="22" width="16" height="24" rx="2" fill="#ffffff" stroke="{RULE}" stroke-width=".55"/><line class="hair" x1="114" y1="29" x2="124" y2="29" stroke="{GREY}"/><line class="hair" x1="114" y1="34" x2="124" y2="34" stroke="{GREY}"/><line class="hair" x1="114" y1="39" x2="121" y2="39" stroke="{GREY}"/>
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
<rect x="18" y="26" width="34" height="17" rx="8" fill="{PAPER2}" stroke="{RULE}" stroke-width=".55"/>
<circle cx="27" cy="34" r="6.5" fill="#ffffff" stroke="{INK}" stroke-width=".8"/>
<circle class="accf" cx="27" cy="54" r="2.5"/>
<text class="nm" x="76" y="38">EN</text>
<text class="nm" x="106" y="38">中</text>
<line class="rule" x1="66" y1="20" x2="66" y2="49"/>
</svg>"""

# P3 搬进正文的六行（他拍过「只留标题，说明搬到正文」；文字从 r2 节点里逐字搬，一字未改）
P3_TRYIT = (
    '<div class="tryit">'
    '<p><b>① 录入与提炼</b>链接 / 截图 / 手写三档，服务端提炼，用户核对、修改、归类。</p>'
    '<p><b>② 出卡</b>十套模板左右滑着换，端侧先测量再绘制，按内容定高画成一张图。</p>'
    '<p><b>③ 分享</b>微信自己的转发三通道；存到相册后由用户发，产品不替用户发布。</p>'
    '<p><b>④ 扫码读快照</b>卡片上那枚码进公开页，读的是建分享那一刻的快照，不登录也能看。</p>'
    '<p><b>⑤ 转存</b>服务端从快照抄一条新的：标题、摘要、要点、标签、链接、来源。</p>'
    '<p><b>⑥ 他自己的库里</b>来源只读钉住，编辑不掉、只能整条删；可以再编辑、再出卡、再分享。</p>'
    '</div>'
)

CAP_P4_OLD = "<p class=\"ilcap\">陶色短竖线＝每一环故意停下来的位置</p>"
CAP_P4_NEW = "<p class=\"ilcap\">环＝这一环故意停下来的位置；这一版没有陶色，因为这张图没有单一焦点</p>"
ANCHOR_P3 = "<p class=\"ilcap\">业务流程图 · 两条泳道之间只隔着一枚小程序码与一份公开快照</p>"

h = DRAFT.read_text(encoding="utf-8")
spans = [m.span() for m in re.finditer(r'<article class="page">.*?</article>', h, re.S)]
assert len(spans) == 6, len(spans)
pages = [h[s:e] for s, e in spans]

NEW = {1: [P2], 2: [P3], 3: [P4], 4: [P5], 5: [P7H, P7S], 6: [T1, T2, T3, T4, T5, T6]}
out = []
cur = 0
for pi, (s, e) in enumerate(spans, 1):
    pg = pages[pi - 1]
    sv = list(re.finditer(r'<svg.*?</svg>', pg, re.S))
    assert len(sv) == len(NEW[pi]), (pi, len(sv))
    buf, last = [], 0
    for m, rep in zip(sv, NEW[pi]):
        buf.append(pg[last:m.start()]); buf.append(rep); last = m.end()
    buf.append(pg[last:])
    pg = "".join(buf)
    if pi == 2:
        assert pg.count(ANCHOR_P3) == 1
        pg = pg.replace(ANCHOR_P3, ANCHOR_P3 + P3_TRYIT, 1)
    if pi == 3:
        assert pg.count(CAP_P4_OLD) == 1
        pg = pg.replace(CAP_P4_OLD, CAP_P4_NEW, 1)
    out.append(pg)

merged = h[:spans[0][0]] + "</article>\n\n".join(out) + h[spans[-1][1]:]
# 收尾：原文件每页之间就是 </article> 换行换行，join 已补；核对页数与 svg 数
assert merged.count('<article class="page">') == 6
assert len(re.findall(r'<svg', merged)) == 12
ids = re.findall(r'id="([^"]+)"', merged)
dup = {i for i in ids if ids.count(i) > 1}
assert not dup, dup
DRAFT.write_text(merged, encoding="utf-8")
print("→", DRAFT, DRAFT.stat().st_size, "字节；12 张 svg 已换 r3，P3 六行已进正文，P4 图题已更正")
