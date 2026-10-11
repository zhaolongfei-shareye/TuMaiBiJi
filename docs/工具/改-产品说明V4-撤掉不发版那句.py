#!/usr/bin/env python3
# 撤掉 V4 第 27 页那句没验过的断言：「加新模板不再需要走一次小程序发版与审核」。
#
# 站长 10-11 原话：「然后不发版的事情不要放在这里说，哪个还没验证过，别给自己挖坑。」
# 那句写在新加的「业务链路」章之外（第 27 页发布补记），但同一条断言、同一个坑，一起收。
#
# 事实边界（三条都有出处，不是我的判断）：
#   · 10-07 23:0x 开闸灌十套 live 进现网，服务端探针 66 条红 0；
#     ——`docs/方案-卡片模板不走发版.md` §八 那条 10-07 现状
#   · 客户端另有一把尺子吃**现网真实回体**：十条全收、`recipeSource` 全 remote、480 组逐组与基线一致，
#     反向两条（改数值要变／抬 `min_app_version` 到 9.9.9 要拒）10-07 深夜跑过，10 条红 0；
#     ——同节 + `docs/规格-笔记卡片这一条线.md` 那行跑法
#   · **但库里那十条与包内 `posterRecipes.js` 规范化后逐字相同**，所以它只证明"通路是活的"；
#     方案里明写：「在第一次下发与包里不同的内容之前，不许说"卡片模板可以热更新"」——P1 那两套候选配方拍了不收。
#   ⇒ 所以能对外说的是"通路两头验过 + 两道把手就位"，不能说"加新模板不用发版"。
#
# 跑法：python3 docs/工具/改-产品说明V4-撤掉不发版那句.py
# 幂等：新句已在位时退 0 不重复改。只改 V4 那一份，V3 不动。
from pathlib import Path

DOC = Path('/Users/zlfmac/Documents/TuMaiBiJi/比赛/图麦笔记-产品说明-V4-20261011.html')

OLD = ('闸门已开、十套 live 配方已在现网，所以从这一版起<b>加新模板不再需要走一次小程序发版与审核</b>'
       '——改一条 <code>status</code> 秒级收得回来。')
NEW = ('模板下发这条通路两头都量过：服务端现网探针 66 条红 0，客户端那把尺子吃的是<b>现网真实回体</b>'
       '（十条全收、来源全记 <code>remote</code>、480 组与包内逐组一致）。'
       '<b>至今库里那十条与包内逐字相同</b>，所以它证明的是通路是活的；'
       '灰度与回滚两道把手（<code>status</code>／<code>min_app_version</code>）已就位，'
       '<b>但还没真下发过与包里不同的内容</b>，这句不当成果写。')

src = DOC.read_text(encoding='utf-8')

if NEW in src:
    print('· 新句已在位，不重复改')
elif OLD in src:
    n = src.count(OLD)
    assert n == 1, f'旧句命中 {n} 处（要 1）'
    DOC.write_text(src.replace(OLD, NEW), encoding='utf-8')
    print('✓ 旧句换成只说验过的部分')
else:
    raise SystemExit('✗ 旧句与新句都找不到——文件不是这一版，停手')

after = DOC.read_text(encoding='utf-8')
print('· 残留断言检查：', '干净' if '不再需要走一次小程序发版' not in after else '还有')
print(f'· {DOC.name}　{len(after):,} B')
