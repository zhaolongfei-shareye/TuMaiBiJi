#!/usr/bin/env python3
# 走 api.github.com 把 TuMaiBiJi-H5 那一记 commit 原样推上去（github.com 这一路此刻连不上：
# 直连与 127.0.0.1:7897 两条都回 000，而 api.github.com 直连 200）。
# 为什么不走 `git push`：这台机器到 github.com:443 连不通（直连与 127.0.0.1:7897 两条都握手失败），
# 而 api.github.com 通 ⇒ 只能从 API 侧把对象一记记垒上去。
# 保证的是**内容**逐字相等（blob／tree 是内容哈希，脚本逐只比过），不是 commit SHA 相等
# （GitHub 建 commit 会规范化时间戳写法，SHA 必然不同）⇒ github.com 通了要 `git push --force`。
# 凭据不进 argv：token 由 `gh` 自己从钥匙串取；内容一律走 --input <临时 json>。
import base64, json, os, subprocess, sys, tempfile

OWNER, REPO = 'zhaolongfei-shareye', 'TuMaiBiJi-H5'
SRC = '/Users/zlfmac/Documents/TuMaiBiJi-H5'
D = tempfile.mkdtemp(prefix='h5push-')
n = [0]


def git(*a):
    return subprocess.run(['git', '-C', SRC, *a], capture_output=True, text=True, check=True).stdout


def api(method, path, payload, soft=False):
    f = os.path.join(D, 'p%d.json' % n[0]); n[0] += 1
    with open(f, 'w') as h:
        json.dump(payload, h)
    url = 'repos/%s/%s' % (OWNER, REPO) + ('/' + path if path else '')
    r = subprocess.run(['gh', 'api', '-X', method, '--input', f, url],
                       capture_output=True, text=True)
    os.remove(f)
    if r.returncode:
        if soft:
            return None
        sys.exit('API 那一发红了：%s %s\n%s' % (method, url, r.stderr[:400]))
    return json.loads(r.stdout)


def repo_empty():
    # size 那一栏对刚建好只有一记 commit 的仓会读成 0，不能当"空"用；只认 ref 在不在。
    return api('GET', 'git/ref/heads/main', {}, soft=True) is None


if repo_empty():
    # 空仓不许凭空造 git 对象（git/blobs 直接 409 "Git Repository is empty"，这是平台规矩）。
    # 先用 contents 口落一枚占位 commit，把 ref 生出来；下面再把 main 强指到本地那一记，
    # 占位那记就此不可达（仓是空的，没有别人的历史会被弄丢）。
    api('PUT', 'contents/README.md', {
        'message': '占位：让空仓长出一个 ref（contents 口是唯一能在空仓写第一记 commit 的口）',
        'content': base64.b64encode('# 图麦笔记安卓版（H5）源码备份\n\n这一记只是占位，随即被强推到本地那一记 commit。\n'.encode()).decode(),
    })
    print('· 空仓已用 contents 口种下占位 commit（下面会强推掉）')

head = git('rev-parse', 'HEAD').strip()
tree_local = git('rev-parse', 'HEAD^{tree}').strip()
meta = git('log', '-1', '--format=%an|%ae|%aI|%cn|%ce|%cI').strip().split('|')
message = git('log', '-1', '--format=%B')
raw = git('ls-tree', '-r', 'HEAD', '--format=%(objectmode) %(path) %(objectname)').strip().split('\n')
entries = []
for line in raw:
    mode, rest = line[:6], line[7:]
    path, sha = rest.rsplit(' ', 1)
    entries.append((mode, path, sha))
print('· 本地这一记：head=%s tree=%s 文件数=%d' % (head[:8], tree_local[:8], len(entries)))

blob_map, bad = {}, []
for mode, path, sha in entries:
    with open(os.path.join(SRC, path), 'rb') as h:
        content = base64.b64encode(h.read()).decode()
    got = api('POST', 'git/blobs', {'content': content, 'encoding': 'base64'})
    blob_map[path] = got['sha']
    if got['sha'] != sha:
        bad.append('%s 本地 %s 远端 %s' % (path, sha[:8], got['sha'][:8]))
print('· 建了 %d 只 blob，逐只与本地 blob SHA 相等＝%s' % (len(entries), '是' if not bad else bad[:3]))
if bad:
    sys.exit('有 blob 不等，停在这儿（远端已建的 blob 不进任何 tree，不伤历史）')

tree = api('POST', 'git/trees', {'tree': [{'path': p, 'mode': m, 'type': 'blob', 'sha': blob_map[p]} for m, p, _ in entries]})
print('· 远端 tree=%s 本地 tree=%s 相等＝%s' % (tree['sha'][:8], tree_local[:8], tree['sha'] == tree_local))
if tree['sha'] != tree_local:
    sys.exit('tree 不等，停在这儿（没建 commit、没建 ref ⇒ 远端仍是一间空仓）')

person_a = {'name': meta[0], 'email': meta[1], 'date': meta[2]}
person_c = {'name': meta[3], 'email': meta[4], 'date': meta[5]}
# 这一记不追求与本地 HEAD 同 SHA（GitHub 建 commit 时会把时间戳那种写法规范化掉一格，
# 逐字复算不出来）。要紧的是上一行那条 **tree 与本地逐字相等**＝blob 是内容哈希，
# tree 相等＝51 只字节全等。远端因此是「同一份内容、另一条历史」，将来 github.com 通了
# 要 `git push --force`（本地那记与远端这两记没有父子关系），这点在文档里写明。
cur = api('GET', 'git/ref/heads/main', {}, soft=True)
parents = [cur['object']['sha']] if cur else []
commit = api('POST', 'git/commits', {'message': message, 'tree': tree['sha'], 'parents': parents,
                                     'author': person_a, 'committer': person_c})
print('· 远端 commit=%s（parent %s）本地 head=%s ⇒ 不同 SHA、同一份 tree' % (
    commit['sha'][:8], [p[:8] for p in parents] or '无', head[:8]))
if parents:
    api('PATCH', 'git/refs/heads/main', {'sha': commit['sha']})
    print('· main 已快进到这一记（不用 force）')
else:
    api('POST', 'git/refs', {'ref': 'refs/heads/main', 'sha': commit['sha']})
    print('· 已建 ref → %s' % commit['sha'][:8])
back = api('GET', 'git/ref/heads/main', {})
print('· 复读 main 指回这一记＝%s' % (back['object']['sha'] == commit['sha']))
files = api('GET', 'git/trees/%s?recursive=1' % back['object']['sha'], {})
blob_remote = {x['path']: x['sha'] for x in files['tree'] if x['type'] == 'blob'}
blob_local = {p: s for _, p, s in entries}
only_remote = sorted(set(blob_remote) - set(blob_local))
diff = sorted(p for p in blob_local if blob_remote.get(p) != blob_local[p])
print('· 远端那记名下文件数=%d（本地 %d）｜逐只 blob 不等=%s｜远端多出=%s' % (
    len(blob_remote), len(blob_local), diff or '0 只', only_remote or '无'))
default = api('GET', '', {})
print('· 现读 default_branch=%s visibility=%s size=%s KB' % (
    default['default_branch'], default['visibility'], default['size']))
