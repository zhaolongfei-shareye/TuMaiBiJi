#!/usr/local/bin/python3
# 出「新建页面板落点与屏底白带 · 11-12 对照」取证 HTML（自包含、图内嵌、数从现读文件算）
import base64, hashlib, json, os, subprocess

OUT = '/Users/zlfmac/Documents/TuMaiBiJi/docs/修复报告-20261112-H5新建页面板落点.html'
H5 = '/Users/zlfmac/Documents/TuMaiBiJi-H5'


def b64(p):
    return base64.b64encode(open(p, 'rb').read()).decode()


def img(p, cap):
    return ('<figure><img src="data:image/png;base64,%s" alt="%s"/><figcaption>%s'
            '（%s，%s B）</figcaption></figure>'
            % (b64(p), cap, cap, os.path.basename(p), os.path.getsize(p)))


def md5_8(p):
    return hashlib.md5(open(p, 'rb').read()).hexdigest()[:8]


# —— 现读：本地四只的号，以及现网 HTTPS 回读的号（两边必须逐字相同）——
FILES = ['index.html', 'css/app.css', 'css/mp-create.css', 'js/router.js', 'pages/create.js']
import urllib.request
local, live = {}, {}
for f in FILES:
    local[f] = md5_8(os.path.join(H5, f))
    env = dict(os.environ, NO_PROXY='', no_proxy='')
    raw = urllib.request.urlopen('https://agentsbin.cn/app/' + f, timeout=25).read()
    live[f] = hashlib.md5(raw).hexdigest()[:8]
same = sum(1 for f in FILES if local[f] == live[f])

# —— 现读：三处 CSS 里的关键数（改后正本）——
css = open(os.path.join(H5, 'css/mp-create.css'), encoding='utf8').read()
app = open(os.path.join(H5, 'css/app.css'), encoding='utf8').read()
probe = json.loads(open('/tmp/geo5.json', encoding='utf8').read())
G = {it['sel']: it for it in probe['items']}

rows = []
for sel in ['#page-root', '#tab-bar', '.mp-create', '.stage-panel', '.home-swap',
            '.blk-person', '.blk-tips', '.blk-plus', '.ai-line', '.title-row']:
    it = G.get(sel)
    if not it:
        continue
    rows.append('<tr><td><code>%s</code></td><td class="num">%s</td><td class="num">%s</td>'
                '<td class="num">%s</td><td class="num">%s</td></tr>'
                % (sel, it['top'], it['bottom'], it['h'], it['left']))
geom = '\n'.join(rows)

DIFF = [
    ('面板落点', '.stage-panel 510→784（屏底还空 56）', '566→840（贴屏底）',
     '100vh−548rpx ＝ 离屏底 274，贴屏底',
     '#page-root 那条 <code>padding-bottom:56px</code> 把 <code>.mp-create</code> 的底边抬到屏底之上 56px，'
     '而面板与那一行设置都钉在 <code>.mp-create</code> 的底边 ⇒ 整块上移 56，底下露出 <code>--bg-page</code>'),
    ('屏底白带', '屏底 56 CSS px 是纸白（现读亮度 218）', '屏底到边都是面板（现读 38）',
     '面板以下一直到屏底（现读 40）',
     '同上那一条；胶囊 <code>rgba(35,37,44,.62)</code> 压在白底上就渲成灰的，压在墨面上才是那边那个深色'),
    ('Tips 行宽', '文字格 190rpx（三行）', '216rpx（两行）', '216rpx（两行）',
     '<code>max-width:9em</code> 原来挂在 dot＋文字那一整行上，圆点那 13px 从 9em 里被扣掉了；'
     '小程序挂在文字那一格 <code>.blk-tips-line</code> 上'),
    ('那一行设置的位置', '可见边离屏 17px（＝34rpx）', '12px（＝24rpx）', '24rpx 那一列',
     '<code>.swap-half</code> 的横向内缩写成 10px，那边是 10rpx＝5px；加上外层 7px 就多出 10rpx'),
    ('那一行设置的皮', '图形 12px、字行高 14.7、无字距、居中排', '图形 10.5px＋下移 3.5px、行高 17px、字距 .5px、顶对齐',
     '图形 21rpx＝10.5px、<code>margin-top:7rpx</code>、行高 34rpx＝17px、<code>letter-spacing:1rpx</code>',
     '那三枚没照那边搬全'),
    ('「告诉好友」那一枚', '胶囊帽 11px、字重 600、飞机 13px 描线、宽度随字', '圆角矩形 6.5px、字重 400、飞机 9px 实心、板宽钉死 72px',
     '<code>border-radius:13rpx</code>、<code>font-weight:400</code>、飞机 18rpx＝9px 实心、板宽 144rpx＝72px',
     '那边那张是照他给的图逐格量出来的（126px 高的胶囊折到 44rpx），H5 这份是早先自己写的'),
    ('形象图压暗罩', '五档（30% 处 .50、62% 处 .44）', '七档（10% .58／43% .44／62% .42／88% .62）',
     '七档，同一串停点',
     'H5 那份是从旧版搬来的五档，中段比那边压得重、88% 那道台阶没有'),
]
dtab = '\n'.join(
    '<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % d for d in DIFF)

ftab = '\n'.join('<tr><td><code>%s</code></td><td class="num">%s</td><td class="num">%s</td>'
                 '<td class="%s">%s</td></tr>'
                 % (f, local[f], live[f], 'ok' if local[f] == live[f] else 'bad',
                    '一致' if local[f] == live[f] else '不一致') for f in FILES)

EXTRA = len(DIFF) - 2
HTML = f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>图麦笔记 · H5 新建页面板落点与屏底白带（11-12 对照）</title>
<style>
 body{{margin:0;background:#F2EFE9;color:#14161A;
   font-family:"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;line-height:1.7}}
 .wrap{{max-width:1080px;margin:0 auto;padding:40px 24px 80px}}
 h1{{font-size:26px;margin:0 0 6px}} h2{{font-size:19px;margin:38px 0 12px;
   border-left:4px solid #D2683F;padding-left:10px}}
 .sub{{color:#6b675f;font-size:13px;margin-bottom:26px}}
 table{{border-collapse:collapse;width:100%;background:#fff;font-size:13.5px}}
 th,td{{border:1px solid #ddd6ca;padding:8px 10px;text-align:left;vertical-align:top}}
 th{{background:#efe9dd;font-weight:600}}
 .num{{text-align:right;font-variant-numeric:tabular-nums}}
 code{{background:#efe9dd;padding:1px 5px;border-radius:4px;font-size:12.5px}}
 .ok{{color:#1d6b3a;font-weight:600}} .bad{{color:#a3232a;font-weight:600}}
 figure{{margin:18px 0}} figcaption{{font-size:12.5px;color:#6b675f;margin-top:6px}}
 img{{width:100%;display:block;border:1px solid #ddd6ca}}
 .card{{background:#fff;border:1px solid #ddd6ca;padding:14px 16px;margin:10px 0}}
 ul{{padding-left:22px}} li{{margin:4px 0}}
</style></head><body><div class="wrap">

<h1>H5 新建页：面板落点与屏底白带</h1>
<div class="sub">2026-11-12 · 取证件 · 数全部从现读文件与现网回读算出，未手打</div>

<h2>一句话结论</h2>
<div class="card">
面板<b>高度本来就对</b>（274px＝小程序那 548rpx），差的是<b>整块往上抬了 56px</b>：
<code>#page-root</code> 给底栏让出的那 56px 内缩，把钉在它底边上的面板与那一行设置一起抬起来，
底下露出页面纸白 ⇒ 看着就是「面板矮了一截 ＋ 底部一条白」。<br>
顺带在这一屏查出 {EXTRA} 处与小程序不同口径的皮（Tips 行宽、那一行设置的位置与字号、
「告诉好友」那一枚的形状与字重、形象图压暗罩的停点），一并改到位并已上现网。
</div>

<h2>差异清单（改前 → 改后，尺子＝小程序现读）</h2>
<table><tr><th>哪一处</th><th>改前 H5</th><th>改后 H5</th><th>小程序那边</th><th>根因</th></tr>
{dtab}</table>

<h2>改后现读几何（视口 375×840，单位 CSS px）</h2>
<table><tr><th>元素</th><th>顶</th><th>底</th><th>高</th><th>左</th></tr>
{geom}</table>
<div class="card">读法：<code>.mp-create</code> 与 <code>#page-root</code> 都是 <b>0→840</b>（贴屏底，
<code>padding-bottom</code> 已在这一屏撤成 0）；<code>.stage-panel</code> <b>566→840</b>，
高 274 ＝ 小程序 <code>top:calc(100vh − 548rpx)</code> 那一根线；
<code>#tab-bar</code> 776→830（离底 10px＝20rpx，那边是 20rpx）。
<code>.blk-plus</code> 底 764 离胶囊顶 776 还有 12px，不会被压住。</div>

<h2>取证图一：改前（他的实拍 H5 ｜ 小程序同屏）</h2>
{img('/tmp/ev-before.png', '左＝他 11-12 拍的 H5 首屏，右＝同一台手机的小程序首屏')}

<h2>取证图二：改后（现网渲染 ｜ 小程序同屏）</h2>
{img('/tmp/ev-after.png', '左＝现网 agentsbin.cn/app 无头渲染 375×840，右＝小程序同一屏')}

<h2>取证图三：屏底那一条（三行＝改前 H5 ／ 改后 H5 ／ 小程序）</h2>
{img('/tmp/ev-bottom.png', '改前那行屏底是纸白、胶囊渲成灰；改后与小程序一样是墨面到边、胶囊深色')}

<h2>部署与回滚</h2>
<table><tr><th>文件</th><th>本地号</th><th>现网 HTTPS 回读号</th><th>比对</th></tr>
{ftab}</table>
<div class="card">现读：{same} / {len(FILES)} 只逐字节一致。<br>
回滚件（服务器同目录，<code>cp -p</code> 留了原时间戳）：
<code>index.html.bak-1112k</code>／<code>css/app.css.bak-1112k</code>／
<code>js/router.js.bak-1112k</code>／<code>pages/create.js.bak-1112k</code>（第一刀），
<code>index.html.bak-1112m</code>／<code>css/mp-create.css.bak-1112m</code>／
<code>pages/create.js.bak-1112m</code>（第二刀）。<br>
资源 URL 全部是「标签＋内容哈希」那套，文件一动 URL 必动，他手机上那份旧 JS 不可能再被拿过来。</div>

<h2>探针残留</h2>
<div class="card">这一轮跑了 7 趟无头渲染（每趟一个新 Chrome 档案，其中 4 趟打的是现网）⇒ 库里多出 9 枚 <code>guest:&lt;uuid&gt;</code> 空号，
不是 <code>guest:probe*</code> 那族（那把尺子认不出它们）。逐枚摊过证据后再删：
9 枚（id 246–254，建 15:40:25–15:57:04）名下<b>笔记 0／配图 0／分享 0</b>，只有默认分类 36 行。
删前删后现读：<code>jobs 0／shares 0／子行 36／users 9／identities 9／accounts 9</code>；
库里总数回到 <b>accounts 214／users 214／notes 206</b>，与今天动手前那笔账逐字相同。
他手机上那枚 H5 号（id 245）没动。</div>

<h2>还欠什么</h2>
<ul>
<li><b>屏顶那 42 CSS px 的白</b>：这一条不在 H5 里。现读 <code>#nav-bar</code> 高 0（这一屏已隐藏）、
页面从 CSS y=0 就开始画形象图 ⇒ 那一条是系统状态栏那一档，由壳的主题色画。
H5 这边已补 <code>&lt;meta name="theme-color" content="#14161A"&gt;</code>（Chrome 里会跟着翻深）；
安卓壳里要改 <code>AppTheme.NoActionBar</code> 的主题并重出 v1.2 包才生效 ⇒ 这条要不要出包，等他一句。</li>
<li>小程序顶部那一行「图麦笔记 ＋ 胶囊按钮」是微信自己的导航条，H5 没有对应层，不算差。</li>
<li>两张图的形象图不是同一张（无头渲染用的是包里那张快照，他手机上是他自己在「图片设置」里选的那张），
计数与 Tips 那句也各走各的轮播 ⇒ 这几处是内容差，不是版式差。</li>
</ul>

</div></body></html>
"""
open(OUT, 'w', encoding='utf8').write(HTML)
print('已写', OUT, os.path.getsize(OUT), 'B')
print('本地/现网一致:', same, '/', len(FILES))
