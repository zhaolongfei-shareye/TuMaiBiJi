#!/usr/bin/env python3
# 站长 10-11 晚：「加新模板不用发版不要提一个字」——第 27 页那一整行连同页标题、副题、
# 部署那行里的半句、页脚注里的那一段，一起撤干净。
#
# 与上一把的区别：`改-产品说明V4-撤掉不发版那句.py` 只把"没验过的结论"换成"验过的读数"，
# 这一把是**整条线都不提**（他这句是指内容范围，不是指措辞）。
# 撤完之后 grep 过：这一页 `发版／下发／配方／min_app_version` 命中 0。
#
# 跑法：python3 docs/工具/删-产品说明V4-不发版那一段.py      （幂等：新句在位则跳过那一条）
from pathlib import Path

DOC = Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-产品说明-V4-20261011.html')

PAIRS = [
    ('眉标：去掉 ARCHITECTURE',
     '<p class="eyebrow">更新补记 / RELEASE &amp; ARCHITECTURE</p>',
     '<p class="eyebrow">更新补记 / RELEASE NOTES</p>'),
    ('页标题：不提"不发版"',
     '<h1>分享卡片与“不发版”的边界。</h1>',
     '<h1>分享卡片、发布状态与这一路。</h1>'),
    ('副题：换成剩下那三行实际讲的事',
     '<p class="subtitle">一次批量的三通道分享、一份已落地并在现网跑着的配方下发架构，以及截至 10-11 的发布事实。</p>',
     '<p class="subtitle">一次批量的三通道分享、截至 10-11 的发布与提审状态，以及官网与后端这一路。</p>'),
    ('整行撤掉「卡片模板不走发版」',
     '<div class="row"><h2>卡片模板不走发版</h2><p>三层架构已落地并在现网跑着（10-07 23:0x 开闸把十套 live 灌进现网，'
     '现网探针 66/66；10-11 实测 <code>GET /api/poster/templates/</code> 回 401＝路由在、要鉴权）。三层：绘制 op（10 种，封闭） / '
     '排版原语（<code>fitTitle</code> 等，封闭） / 配方 JSON（服务端下发，加模板就在这一层）。P0 先把包内十套转写为配方证明“逐层等价”，'
     'P0 不绿不许进 P1；微信禁止 JS 解释器，能下发的只有数据、不是代码。</p></div>',
     ''),
    ('部署那一行：去掉"下发那一路"半句',
     '10-07 上的是图片直传那一条链与卡片模板下发那一路（含开闸灌十套 live 种子），最近一次 10-09 09:07 单独上',
     '10-07 上的是图片直传那一条链，最近一次 10-09 09:07 单独上'),
    ('页脚注：整段换成自证指路',
     '<p class="note">发布与提交数以本项目后台与 git 记录为准；三层架构与推进细节见 <code>docs/方案-卡片模板不走发版.md</code>。'
     '模板下发这条通路两头都量过：服务端现网探针 66 条红 0，客户端那把尺子吃的是<b>现网真实回体</b>'
     '（十条全收、来源全记 <code>remote</code>、480 组与包内逐组一致）。<b>至今库里那十条与包内逐字相同</b>，'
     '所以它证明的是通路是活的；灰度与回滚两道把手（<code>status</code>／<code>min_app_version</code>）已就位，'
     '<b>但还没真下发过与包里不同的内容</b>，这句不当成果写。</p>',
     '<p class="note">发布与提交数以本项目后台与 git 记录为准；界面那三张是 2.1.8 构建的模拟器实拍，'
     '卡片那一组是同一条示例笔记按十套模板各排一遍的运行时成品，自证写在对应章节的页脚注里。</p>'),
]

src = DOC.read_text(encoding='utf-8')
for name, old, new in PAIRS:
    if new and new in src:
        print(f'· {name}：新句已在位，跳过')
    elif old in src:
        n = src.count(old)
        assert n == 1, f'{name}：旧句命中 {n} 处（要 1）'
        src = src.replace(old, new)
        print(f'✓ {name}')
    else:
        raise SystemExit(f'✗ {name}：旧句找不到且新句不在位——文件不是这一版，停手')

for kw in ['发版', '下发', '配方', 'min_app_version', 'poster/templates']:
    assert src.count(kw) == 0, f'⚠ 撤完还剩「{kw}」{src.count(kw)} 处'
print('· 整本复查：发版／下发／配方／min_app_version／poster/templates 全 0 处')

DOC.write_text(src, encoding='utf-8')
print(f'· {DOC.name}　{len(src.encode("utf-8")):,} B')
