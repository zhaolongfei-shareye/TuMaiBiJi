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
#   python3 docs/工具/刷-H5资源号.py --写        # 真把 index.html 改过来
import hashlib
import os
import re
import sys

ROOT = os.environ.get('H5ROOT', '/Users/zlfmac/Documents/TuMaiBiJi-H5')
INDEX = os.path.join(ROOT, 'index.html')
PAT = re.compile(r'((?:src|href)=")([^"?]+)(\?)(v|mp)=([0-9a-z]+)(-([0-9a-f]{8}))?(")')


def md5_8(path):
    with open(path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


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
    bak = INDEX + '.bak-hash'
    if not os.path.exists(bak):
        os.rename(INDEX, bak)
        print('留了第一份回滚副本：', bak)
    with open(INDEX, 'w', encoding='utf-8') as f:
        f.write(out)
    print('已写', INDEX, os.path.getsize(INDEX), 'B')


if __name__ == '__main__':
    main('--写' in sys.argv or '-w' in sys.argv)
