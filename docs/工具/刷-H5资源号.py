# H5 资源号刷成「标签＋内容哈希」——治的是"改了代码他手机上还是旧的"。
#
# 为什么要这一把（11-12 现撞）：`index.html` 里那串 `?v=1112b` 是我手抬的标签，改文件的人
# 抬了文件、忘了抬标签，nginx 又没发 `Cache-Control` ⇒ 浏览器按 `Last-Modified` 猜一个新鲜期
# （现网 `js/detailSheet.js` 那条猜出约两小时），同一个 URL 就把两小时前的旧字节继续用。
# 站长 13:29 那一篇：库里 assets 有行、桶里对象 curl 回 200/190,046 B，屏上仍是 `--accent-soft`
# 那块灰——因为他加载的是 `detailSheet.js?v=1112b` 那枚旧副本（`bak-1112b` 里 `_imgSrc` 出现 0 次）。
#
# 规矩：标签照旧抬（回滚时认得出哪一趟），后面拼一枚内容哈希；文件一动 URL 必动，
# 浏览器那份旧缓存自然就成了另一个 URL 的东西，不可能再被拿过来。
#
# 跑法（在仓库根或任意目录都行，路径写死在本机 H5 树）：
#   python3 docs/工具/刷-H5资源号.py            # 只报哪几只的号要变
#   python3 docs/工具/刷-H5资源号.py --写        # 真把 index.html 改过来（每次先留带戳副本，写完自证，不认账就自动回滚）
#   python3 docs/工具/刷-H5资源号.py --验        # 只比对不写：现盘 index.html 的号 == 每只文件的 md5 前 8 位？不等则退出码 1
#
# Z64 那一刀（11-16）改的两件事：①回滚副本原来是 `if not os.path.exists(bak): os.rename(INDEX, bak)`
# ——只留史上第一份，第二趟起写盘前**没有任何副本**，且"先搬走再写"中途失败就只剩 `.bak-hash`；
# 现在每次写前把当时那份整个复制进 `_bak-index/`（`.gitignore` 里 `_bak*/` 那行，不进仓），
# 写盘走临时文件 + `os.replace`（原子，不会再出现"搬走了没写回来"）。
# ②加自检：写完立刻从盘上读回来逐条比号，对不上就用刚留的那份副本还原——
# 这一条治的是"代码落了、号没落 ⇒ 屏上仍是旧字节"这种最难查的坏法。
import hashlib
import os
import re
import shutil
import sys
import time

ROOT = os.environ.get('H5ROOT', '/Users/zlfmac/Documents/TuMaiBiJi-H5')
INDEX = os.path.join(ROOT, 'index.html')
BAK_DIR = os.path.join(ROOT, '_bak-index')
PAT = re.compile(r'((?:src|href)=")([^"?]+)(\?)(v|mp)=([0-9a-z]+)(-([0-9a-f]{8}))?(")')


def md5_8(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def audit(html):
    """现盘账：号 ≠ 本地那只文件 md5 前 8 位的一律列出来；本地读不到的单独一栏（算不出号，不进红）。"""
    stale, missing = [], []
    for m in PAT.finditer(html):
        rel, kind, label, oldhash = m.group(2), m.group(4), m.group(5), m.group(7) or ''
        local = os.path.join(ROOT, rel)
        if not os.path.exists(local):
            missing.append(rel)
            continue
        h = md5_8(local)
        if h != oldhash:
            stale.append((rel, kind, label, oldhash, h))
    return stale, missing


def verify():
    stale, missing = audit(open(INDEX, encoding='utf-8').read())
    for rel, kind, label, oldhash, h in stale:
        print('%-30s %s=%s  号 %s ≠ 现盘 %s' % (rel, kind, label, oldhash or '(无哈希)', h))
    total = len(PAT.findall(open(INDEX, encoding='utf-8').read()))
    print('引用总数 %d 处：不一致 %d 只' % (total, len(stale)))
    if missing:
        print('⚠ 本地读不到的（判不了号，自己核是不是名单少了一只）：', ', '.join(missing))
    if stale:
        print('红：%d 只的号与现盘对不上 ⇒ 浏览器吃的就是缓存里那份旧字节' % len(stale))
        return 1
    print('绿：每只引用带的号都等于现盘 md5 前 8 位')
    return 0


def main(write=False):
    html = open(INDEX, encoding='utf-8').read()
    changed, missing = [], []

    def sub(m):
        rel, kind, label, oldhash = m.group(2), m.group(4), m.group(5), m.group(7) or ''
        local = os.path.join(ROOT, rel)
        if not os.path.exists(local):
            missing.append(rel)
            return m.group(0)
        h = md5_8(local)
        new = '%s-%s' % (label, h)
        if new != '%s%s' % (label, ('-' + oldhash) if oldhash else ''):
            changed.append((rel, kind, label, oldhash, h))
        return m.group(1) + rel + m.group(3) + kind + '=' + new + m.group(8)

    out = PAT.sub(sub, html)
    for rel, kind, label, oldhash, h in changed:
        print('%-30s %s=%s  %s → %s' % (rel, kind, label, oldhash or '(无哈希)', h))
    if missing:
        print('本地读不到的（跳过，不动它的号）：', ', '.join(missing))
    print('要换号的 %d 只；引用总数 %d 处' % (len(changed), len(PAT.findall(html))))
    if not write:
        print('（没写盘，加 --写 才改 index.html）')
        return
    if not changed:
        print('index.html 原样不动')
        return
    os.makedirs(BAK_DIR, exist_ok=True)
    stamp = time.strftime('%y%m%d-%H%M%S')
    bak = os.path.join(BAK_DIR, 'index.html.bak-' + stamp)
    seq = 2
    while os.path.exists(bak):
        # 同一秒里连跑两趟不许把上一枚回滚点覆盖掉（Z64 治的就是"只留一份"）
        bak = os.path.join(BAK_DIR, 'index.html.bak-%s-%d' % (stamp, seq))
        seq += 1
    shutil.copy2(INDEX, bak)
    print('写前先留副本（当刻原样）：', bak)
    tmp = INDEX + '.tmp-hash'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(out)
    os.replace(tmp, INDEX)
    stale, _ = audit(open(INDEX, encoding='utf-8').read())
    if stale:
        shutil.copy2(bak, INDEX)
        print('✗ 写完自证不认账（仍 %d 只不一致）⇒ 已用刚那份副本还原，退出码 1' % len(stale))
        for rel, kind, label, oldhash, h in stale:
            print('    %s：%s=%s 号 %s ≠ 现盘 %s' % (rel, kind, label, oldhash or '(无哈希)', h))
        sys.exit(1)
    print('已写', INDEX, os.path.getsize(INDEX), 'B；自证：%d 条引用逐条等于现盘 md5 前 8 位'
          % len(PAT.findall(open(INDEX, encoding='utf-8').read())))


if __name__ == '__main__':
    if '--验' in sys.argv or '-V' in sys.argv:
        sys.exit(verify())
    main('--写' in sys.argv or '-w' in sys.argv)
