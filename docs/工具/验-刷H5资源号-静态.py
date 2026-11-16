# -*- coding: utf-8 -*-
# `刷-H5资源号.py` 的尺子（Z64：号与现盘对不上＋回滚副本只留史上第一份）。
#
# ⚠ 这工具管的是"H5 改了代码他手机上还是旧的"：`index.html` 里每只引用带的 `?v=标签-md5前8位`
# 必须等于那只文件**现盘**的 md5，差一位浏览器就继续吃缓存里的旧字节。上一版的刷号工具自己有两处坏法：
#   ①回滚副本 `if not os.path.exists(bak): os.rename(INDEX, bak)` ——只留史上第一份，
#     第二趟写盘前**没有任何副本**；而且先搬走再写，写失败就只剩 `.bak-hash`；
#   ②工具自己不比对现盘哈希 ⇒ 号没刷上去它照样报"已写"（这一条是 §15.2「工具 0 把」的又一格）。
#
# 跑的是真代码，不是读文本：每把都在 `tempfile` 里搭一棵小 H5 树（真的 index.html＋真的 js），
# 用 `subprocess` 起真进程跑 CLI（判退出码与屏上话），最后一把用 import 打进模块、
# 把 `md5_8` 换成假读数，逼"写完自证不认账"那一支真跑一遍。
#
# 跑法：python3 docs/工具/验-刷H5资源号-静态.py
import hashlib
import importlib.util
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, '刷-H5资源号.py')
PAT = re.compile(r'((?:src|href)=")([^"?]+)(\?)(v|mp)=([0-9a-z]+)(-([0-9a-f]{8}))?(")')

bad = []


def ck(name, ok, got):
    print('%s %s　→ %s' % ('✓' if ok else '✗', name, got))
    if not ok:
        bad.append(name)


def h8(text):
    return hashlib.md5(text).hexdigest()[:8]


def make_fixture(missing=True, no_hash=False):
    """一棵最小 H5 树：index.html + js/{a,b}.js（可选：一只指向不存在文件的引用／一只不带哈希的号）。"""
    root = tempfile.mkdtemp(prefix='z64-')
    os.makedirs(os.path.join(root, 'js'))
    a = b'console.log("a v1")\n'
    b = b'console.log("b v1")\n'
    for name, body in (('js/a.js', a), ('js/b.js', b)):
        with open(os.path.join(root, name), 'wb') as f:
            f.write(body)
    if no_hash:
        os.makedirs(os.path.join(root, 'css'), exist_ok=True)
        with open(os.path.join(root, 'css', 'site.css'), 'wb') as f:
            f.write(b'body{margin:0}\n')
    lines = [
        '<!doctype html><html><body>',
        '<script src="js/a.js?v=1116-%s"></script>' % h8(a),
        '<script src="js/b.js?v=1116-%s"></script>' % h8(b),
    ]
    if missing:
        lines.append('<script src="js/gone.js?v=1116-ffffffff"></script>')
    if no_hash:
        lines.append('<link href="css/site.css?v=1116" rel="stylesheet">')
    lines.append('</body></html>')
    with open(os.path.join(root, 'index.html'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')
    return root


def run(root, *args):
    env = dict(os.environ, H5ROOT=root)
    p = subprocess.run([sys.executable, TOOL] + list(args), capture_output=True, text=True, env=env)
    return p.returncode, (p.stdout + p.stderr).strip()


def index_md5(root):
    with open(os.path.join(root, 'index.html'), 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


def hashes_in(root):
    """现盘 index.html 里每条引用带的号：rel → oldhash（空串＝没带哈希）。"""
    with open(os.path.join(root, 'index.html'), encoding='utf-8') as f:
        return {m.group(2): (m.group(7) or '') for m in PAT.finditer(f.read())}


def backups(root):
    d = os.path.join(root, '_bak-index')
    return sorted(os.listdir(d)) if os.path.isdir(d) else []


def main():
    print('刷-H5资源号.py 的尺子（被测字节：%s）' % TOOL)
    print('每把都现搭一棵最小 H5 树，跑真进程看退出码与屏上话\n')

    # ---------- V：自检（--验）本身有没有牙 ----------
    root = make_fixture()
    rc, out = run(root, '--验')
    ck('V1 号与现盘全对上时：--验 绿、退出码 0（本地读不到的那条不算红）',
       rc == 0 and '绿：每只引用带的号都等于现盘' in out and '⚠ 本地读不到的' in out,
       'rc=%d ／ %s' % (rc, out.replace('\n', ' ｜ ')))

    with open(os.path.join(root, 'js', 'a.js'), 'wb') as f:
        f.write(b'console.log("a v2 changed without restamping")\n')
    rc, out = run(root, '--验')
    ck('V2 改了字节没抬号：--验 当场红、退出码 1、点名到那一只',
       rc == 1 and 'js/a.js' in out and '不一致 1 只' in out,
       'rc=%d ／ %s' % (rc, out.replace('\n', ' ｜ ')))

    # ---------- W：--写 的四件事：刷对号、留得住副本、不留残渣、趟趟留 ----------
    before = index_md5(root)
    rc, out = run(root, '--写')
    ck('W1 --写 把不一致那只刷成新号，写完 --验 转绿',
       rc == 0 and hashes_in(root)['js/a.js'] == h8(open(os.path.join(root, 'js', 'a.js'), 'rb').read()),
       '新号 %s ／ 复验 rc=%d' % (hashes_in(root)['js/a.js'], run(root, '--验')[0]))
    ck('W2 写前副本与写前 index.html 逐字相同（回滚点是真的，不是空壳）',
       len(backups(root)) == 1
       and hashlib.md5(open(os.path.join(root, '_bak-index', backups(root)[0]), 'rb').read()).hexdigest() == before,
       '副本 %s ／ 写前 md5 %s…' % (backups(root), before[:8]))
    ck('W3 原子写：跑完不在树上留 index.html.tmp-hash',
       not os.path.exists(os.path.join(root, 'index.html.tmp-hash')),
       '残留＝%s' % os.path.exists(os.path.join(root, 'index.html.tmp-hash')))

    with open(os.path.join(root, 'js', 'b.js'), 'wb') as f:
        f.write(b'console.log("b v2")\n')
    rc2, _ = run(root, '--写')
    ck('W4 连跑两趟 --写：两枚带戳副本都在（旧版只留史上第一枚，第二趟写盘前无副本）',
       rc2 == 0 and len(backups(root)) == 2, '现读副本 %d 枚：%s' % (len(backups(root)), backups(root)))

    # ---------- S／M：两种边角口径 ----------
    root2 = make_fixture(missing=False, no_hash=True)
    rc, out = run(root2, '--验')
    ck('S1 号只写到标签、没带哈希（?v=1116）：判红（这一条正是"改了文件忘抬号"的原形状）',
       rc == 1 and 'css/site.css' in out and '(无哈希)' in out,
       'rc=%d ／ %s' % (rc, out.replace('\n', ' ｜ '))[:160])
    root3 = make_fixture()
    rc, out = run(root3, '--写')
    ck('M1 --写 之后 gone.js 那条仍带原号（判不了号的不去改它），且屏上单列一栏 ⚠',
       rc == 0 and hashes_in(root3).get('js/gone.js') == 'ffffffff'
       and '本地读不到的' in out,
       '现读 js/gone.js 的号＝%s' % hashes_in(root3).get('js/gone.js'))

    # ---------- F：写完自证不认账 ⇒ 自动回滚（打进模块逼这一支真跑） ----------
    root4 = make_fixture()
    before4 = index_md5(root4)
    spec = importlib.util.spec_from_file_location('shua', TOOL)
    mod = importlib.util.module_from_spec(spec)
    os.environ['H5ROOT'] = root4
    spec.loader.exec_module(mod)
    real = mod.md5_8
    # 只让"写进去的那两枚号"是假读数（盘上现只有 a.js/b.js 两只算得出号），写完自证那一趟回真值
    # ⇒ 盘上的号与重算的对不上，逼出「自证不认账 ⇒ 还原 + 退出码 1」那一支。
    # 整体替换 md5_8 不行：那样连自证一起变瞎，永远绿（这一把我第一版就栽在这）。
    state = {'n': 0}

    def stub(path):
        state['n'] += 1
        return 'deadbeef' if state['n'] <= 2 else real(path)

    mod.md5_8 = stub
    code = None
    try:
        mod.main(write=True)
    except SystemExit as e:
        code = e.code
    finally:
        mod.md5_8 = real
    after4 = index_md5(root4)
    ck('F1 自证不认账那一支：退出码 1，且 index.html 已被副本还原成写前逐字相同',
       code == 1 and after4 == before4,
       '退出码 %s ／ 写前 %s… 现盘 %s…' % (code, before4[:8], after4[:8]))
    rc, out = run(root4, '--验')
    ck('F2 回滚后 --验 转绿：还原的是写前那份"旧但自洽"的账，不是半截写（号被改成 deadbeef 留在盘上）',
       rc == 0 and 'deadbeef' not in open(os.path.join(root4, 'index.html'), encoding='utf-8').read(),
       'rc=%d ／ 盘上仍留 deadbeef＝%s' % (rc, 'deadbeef' in open(os.path.join(root4, 'index.html'), encoding='utf-8').read()))

    print('\n合计：%s' % ('全过' if not bad else '红 %d 条' % len(bad)))
    for n in bad:
        print('  ✗ %s' % n)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
