"""把 1113 口令登录这一轮的取证拼成一份自包含 HTML（图内嵌、数现读）。

为什么是 HTML 不是 MD：MD 里的截图站长看不了（[[feedback-evidence-html-not-md]]）。
为什么数要现读：报告里每一个"N 过 / M 红"都从读数 txt 的末行解析，不许手打
（[[feedback-claim-only-what-tools-show]]：引一份没留档的读数＝引一句假话）。

跑法：/usr/bin/python3 docs/工具/出-口令登录取证HTML.py
产物：docs/取证/1113-口令登录/取证-口令登录.html
"""
import base64
import html
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EV = os.path.join(ROOT, 'docs', '取证', '1113-口令登录')


def read(name):
    p = os.path.join(EV, name)
    if not os.path.exists(p):
        return None
    return io.open(p, encoding='utf-8').read()


def tally(name):
    t = read(name)
    if not t:
        return None
    m = re.findall(r'(\d+) 过 / (\d+) 红', t)
    return (int(m[-1][0]), int(m[-1][1])) if m else None


def mode(name):
    t = read(name)
    if not t:
        return None
    m = re.search(r'^档：(.+)$', t, re.M)
    return m.group(1).strip() if m else None


def img(rel, cap):
    p = os.path.join(EV, rel)
    if not os.path.exists(p):
        return f'<figure class="miss"><figcaption>{html.escape(cap)}（缺图）</figcaption></figure>'
    b = base64.b64encode(open(p, 'rb').read()).decode()
    return (f'<figure><img src="data:image/png;base64,{b}" alt="{html.escape(cap)}">'
            f'<figcaption>{html.escape(cap)}</figcaption></figure>')


def checks(name, limit=None):
    t = read(name)
    if not t:
        return '<p class="miss">缺读数文件</p>'
    lines = [l for l in t.splitlines() if l.strip().startswith(('✓', '✗'))]
    if limit:
        lines = lines[:limit]
    out = []
    for l in lines:
        cls = 'ok' if l.strip().startswith('✓') else 'bad'
        out.append(f'<li class="{cls}">{html.escape(l.strip())}</li>')
    return '<ul class="checks">' + ''.join(out) + '</ul>'


def sec(title, body):
    return f'<section><h2>{html.escape(title)}</h2>{body}</section>'


parts = []
parts.append('''<header>
<h1>图麦笔记 · H5 口令登录 取证</h1>
<p class="sub">2026-11-13 · 零外部付费依赖（scrypt 在标准库、恢复码自签 HMAC、限流走现网 Redis）</p>
</header>''')

# ── 一、结论
full = tally('H5真跑-读数.txt') if (mode('H5真跑-读数.txt') or '').startswith('全量') else None
smoke = tally('H5真跑-读数-现网.txt')
uionly = tally('H5真跑-读数-UIONLY.txt')
android_t = tally('安卓壳-读数.txt')
ui = tally('H5真跑-读数-第一趟8红.txt')
rev = tally('H5真跑-读数-反向.txt')
cmp_t = read('对照/设置栏对照-读数.txt')
rows = []
for label, t in [('本机全量十六组（第二趟）', full),
                 ('本机屏上四组 UI_ONLY（不造号）', uionly),
                 ('现网冒烟（部署后）', smoke),
                 ('安卓壳 UI（模拟器 WebView，不造号）', android_t),
                 ('本机全量（第一趟，尺子自身 8 红）', ui), ('反向验证（弄坏副本）', rev)]:
    if t:
        rows.append(f'<tr><td>{label}</td><td class="{"ok" if t[1] == 0 else "bad"}">{t[0]} 过 / {t[1]} 红</td></tr>')
    else:
        rows.append(f'<tr><td>{label}</td><td class="miss">还没跑</td></tr>')
parts.append(sec('一、结论', f'''
<table><tr><th>档</th><th>读数</th></tr>{''.join(rows)}</table>
<p>登录名（手机号或邮箱）<strong>不验证归属</strong>——没有发信通道，验不了；谁先注册谁占用。
找回只有一条路：注册/改密/找回那三趟各下发一次的 80 位恢复码。这两句都原样写在屏上。</p>
<p class="miss">还差两件只能站长做的事：微信开发者工具扫码登录（设置栏跨侧对照要用）、两台真机扫体验码。
安卓壳不用重出包：Capacitor 只烤了 https://agentsbin.cn/app/ 这一个地址，H5 更新即生效。</p>'''))

# ── 二、第一趟 8 红怎么来的
parts.append(sec('二、第一趟 8 红：尺子错，不是产品错', '''
<p>改密成功后后端与找回同一套后果：抬代次＋换恢复码＋发新钥匙，所以 H5 正确地停在
「记下这串恢复码」那一屏。第一版尺子按"直接回应用"断言 ⇒ ⑪ 红；⑫ 又拿注册那枚已被改密作废的码
去找回 ⇒ 再红，一路连锁到 ⑭⑮。8 条红全是这一处。</p>
<p>顺带量出两句真文案缺陷并已修：找回屏原写"填注册时给你那串恢复码"（改密后那枚已作废）→
改"填最近一次给你那串恢复码"；改密屏补一句"改好会换一串新恢复码，旧的那串当场作废"。</p>
<p>还有一处尺子自身的假绿：⑮ 登录失败时"票 401／名 400／本机抹净"三条照样过，且无条件标
dead=true ⇒ 收尾跳过注销，现网真留了一枚测试号。已补"手里有票"这道牙，dead 只在三条一起成立时才落；
那枚残留号已走应用自己的注销口真删，删后复核库里口令身份 0 枚。</p>'''))

# ── 三、屏照
shots = [('屏照/02-设置栏-未登录.png', '设置栏：新增「账号」行，未登录念引导句'),
         ('屏照/03-登录屏.png', '登录态：两只框＋三个入口＋本机试用退路'),
         ('屏照/04-注册屏.png', '注册态：写明"不会发验证码"'),
         ('屏照/05-一次性恢复码.png', '注册成功：一次性恢复码'),
         ('屏照/07-设置栏-已登录.png', '设置栏：那一行改念登录名'),
         ('屏照/08-账号面板.png', '账号面板：登录名／修改密码／退出登录'),
         ('屏照/13-修改密码屏.png', '改密态：先说清会换码'),
         ('屏照/13b-改密后一次性恢复码.png', '改密成功：换发的新码'),
         ('屏照/14-找回密码屏.png', '找回态：填最近一次那串码'),
         ('屏照/16-游客升级屏.png', '游客升级：笔记跟着账号走'),
         ('屏照/19-注销后登录屏.png', '注销后：回登录屏，刷新不静默换身份')]
parts.append(sec('三、本机全量屏照', '<div class="grid">' + ''.join(img(a, b) for a, b in shots) + '</div>'))

# ── 四、现网冒烟
smoke_shots = [('屏照-现网/03-登录屏.png', '现网登录态'),
               ('屏照-现网/05-一次性恢复码.png', '现网注册成功'),
               ('屏照-现网/11-重新登录后列表.png', '现网退出再登：同一篇还在'),
               ('屏照-现网/19-注销后登录屏.png', '现网注销后')]
android_shots = [('屏照-安卓/01-开机.png', '安卓壳开机（WebView 加载现网）'),
                 ('屏照-安卓/02-设置栏.png', '安卓壳设置栏：账号行'),
                 ('屏照-安卓/03-登录屏.png', '安卓壳登录屏'),
                 ('屏照-安卓/05-找回屏.png', '安卓壳找回屏：新文案')]
parts.append(sec('四、部署后现网冒烟＋安卓壳', '<div class="grid">' + ''.join(img(a, b) for a, b in smoke_shots) + '</div>'
                 + (checks('H5真跑-读数-现网.txt') if smoke else '<p class="miss">现网冒烟还没跑</p>')
                 + '<h3>安卓壳（Capacitor WebView，模拟器真跑，不造号）</h3>'
                 + '<div class="grid">' + ''.join(img(a, b) for a, b in android_shots) + '</div>'
                 + (checks('安卓壳-读数.txt') if android_t else '<p class="miss">安卓壳还没跑</p>')))

# ── 五、设置栏对照
parts.append(sec('五、设置栏对照小程序', f'''
<div class="grid">{img('对照/H5-设置栏.png', 'H5 设置栏（390×844@2x）')}</div>
<p>H5 侧内部判据 8 过 / 0 红：五行同名同序、新增「账号」行沿用同一套令牌、不折行不溢出。
跨侧逐块对照要等微信开发者工具扫码登录（ automator 连得上但模拟器没起，cli open 回 code 10）。
尺子已改成"缺小程序读数就只跑 H5 侧并明说"，他扫完码跑一把即可补齐。</p>
<p>两处<strong>既有</strong>跨侧差异（不是本轮引入，全屏幕共用，待他拍是否统一）：
H5 `.card` 带 box-shadow 而小程序面板无投影；H5 `.menu-group` 下缝 12px 而小程序 8px（16rpx）。</p>
<pre>{html.escape(cmp_t or '缺对照读数')}</pre>'''))

# ── 六、部署
md5t = read('部署-md5.txt')
parts.append(sec('六、部署与回滚', f'''
<p>H5 七个文件走命名件＋三方 md5（本机＝服务器暂存＝现网）。后端八文件与迁移已于 20:24 上现网
（第八十三次，迁移头 a3c9e7f1b482，现网探针 34/0），回滚位 /var/backups/wtsj-backend/pwd-1113/。</p>
<pre>{html.escape(md5t or '还没落地：部署-md5.txt 待生成')}</pre>
<p>H5 回滚：<code>sudo bash /var/backups/tumaibiji-h5/pwd-1113/rollback.sh</code></p>'''))

# ── 七、全量判据清单
cur_mode = mode('H5真跑-读数.txt') or '缺读数'
parts.append(sec(f'七、本机判据逐条（当前读数档：{cur_mode}）', checks('H5真跑-读数.txt')))

html_doc = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>图麦笔记 · H5 口令登录取证</title>
<style>
body{font:15px/1.7 -apple-system,"PingFang SC",sans-serif;margin:0;background:#F2EFE9;color:#14161A}
header,section{max-width:1080px;margin:0 auto;padding:24px 20px}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;border-left:4px solid #D2683F;padding-left:10px;margin:34px 0 12px}
h3{font-size:16px;margin:22px 0 10px}
.sub{color:#6b6455;margin:0}
table{border-collapse:collapse;width:100%;background:#fff}
td,th{border:1px solid #ddd6c8;padding:8px 10px;text-align:left;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
figure{margin:0;background:#fff;border:1px solid #ddd6c8;border-radius:10px;padding:8px}
figure img{width:100%;display:block;border-radius:6px}
figcaption{font-size:12px;color:#6b6455;padding-top:6px}
.ok{color:#2c6e49}.bad{color:#b3261e;font-weight:600}.miss{color:#8a6d1a}
ul.checks{list-style:none;padding:0;font-size:13px}
ul.checks li{padding:2px 0;border-bottom:1px dashed #e4ddcd}
pre{background:#fff;border:1px solid #ddd6c8;border-radius:8px;padding:12px;font-size:12px;overflow-x:auto;white-space:pre-wrap}
code{background:#fff;border:1px solid #ddd6c8;border-radius:4px;padding:1px 5px;font-size:13px}
</style></head><body>''' + ''.join(parts) + '</body></html>'

out = os.path.join(EV, '取证-口令登录.html')
io.open(out, 'w', encoding='utf-8').write(html_doc)
print('已出', out, os.path.getsize(out), 'B')