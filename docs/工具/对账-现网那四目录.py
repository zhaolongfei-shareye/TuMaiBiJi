"""现网与仓库逐只比 md5，并把两份输出真正比到底（10-22 第五十八次立的尺子，台账 §8.436；
10-25 第八轮审计 M25② 这一刀扩口径＋补比对模式，见 §8.490／§8.492 那两格的跑法与教训）。

为什么原来的口径不够用：`DIRS` 只有 app／alembic／tests／seed 四目录，而
① 现网真在跑 `probes/share_live_probe.py`（第六十五／六十八／六十九次每次都手动补比 md5，
   §8.492 那句"这把尺子看不见 deploy.sh 与两只中文命名的新用例"就是同一件事）；
② 部署脚本与 `worker.py` 就躺在 backend 根上，一只都不在口径里；
③ `cloudfunctions/` 整个不在任何对账口径里（M11），而云上那份比仓库 HEAD 新是发生过的事实。

为什么"两台各跑一次、拿回本机再 join"这句话以前是空的：默认 `join` 只留两边都有的行，
于是"现网有、仓库没有"与"仓库有、现网没有"两个方向**零判据**——正是 M25 说的那个洞。
现在这一支自己带 `--compare`，两个方向都算出来，且"现网独有的非副本文件"非空即红、退出码非 0。

跑法（这一台机器上的标准跑法，两条命令各产出一份文本，再比）：
    ① 本机——先从 HEAD 打一份**干净树**（工作树里另一条线的未提交文件会混进来，§8.490）：
        rm -rf /tmp/head-tree && mkdir -p /tmp/head-tree \\
          && git archive HEAD | tar -x -C /tmp/head-tree
        python3 docs/工具/对账-现网那四目录.py /tmp/head-tree/backend > /tmp/repo.txt
    ② 现网——脚本走标准输入递过去，盘上不留副本（本仓对现网工具的固定规矩）：
        ssh agentsbin "cd /home/ubuntu/wtsj-backend && .venv/bin/python - /home/ubuntu/wtsj-backend" \\
          < docs/工具/对账-现网那四目录.py > /tmp/live.txt
    ③ 比两份（第一个参数＝仓库那份，第二个＝现网那份）：
        python3 docs/工具/对账-现网那四目录.py --compare /tmp/repo.txt /tmp/live.txt

输出（列出模式）第一行是只数、其余每行"md5␣␣相对路径"。两台的 sort locale 不一样，
所以**只在拿回本机之后比**，别在服务器上比顺序；本支的 compare 模式按路径建字典，与顺序无关。

两个方向的判据不对称，是故意的：
· 现网独有（非历次部署副本）＝**红**。现网多出一只仓库里没有的文件，只能是"就地写的"
  或"没提交就传上去的"，两种都会让下一次部署把它当旧的撤掉（§8.490 那只 `note_images.py`
  就是这一族，代价是"拿对仓库不等当理由去传，会把现网已有的修复撤掉"）。
· md5 不等／仓库独有＝**只念，不判红**。现网与仓库不等是常态：另一条路现在就有 8 只文件
  故意没上现网（§8.492 收尾对账那一格），把它们算成红会把这把尺子用废。
"""
import hashlib
import os
import sys

# 目录口径（相对 backend 根）。probes/tools/scripts/contract 是 10-25 M25② 补的；
# cloudfunctions 不在 backend 里，按 root 的兄弟目录找（见 CLOUDFUNCTIONS_NAME）。
DIRS = ("app", "alembic", "tests", "seed", "probes", "tools", "scripts", "contract")
# 根级脚本：这一支以前完全看不见 deploy.sh／upload.sh／backup.sh／worker.py，
# 而 deploy.sh 正是"每次部署都跑的那一只文件"（§8.492 那趟单独 md5sum 比的就是它）。
ROOT_SUFFIXES = (".py", ".sh")
# `cloudfunctions/` 在仓库根（backend 的上一级）；服务器上没有这一只目录，
# 找不到就整段跳过——跳过会在清单里出声，不静默。
CLOUDFUNCTIONS_NAME = "cloudfunctions"
SKIP_DIRS = {"__pycache__", "node_modules", ".pytest_cache", ".venv", "logs", "var"}
SKIP_SUFFIX = (".pyc",)


def is_deploy_copy(relpath: str) -> bool:
    """历次部署就地留下的回滚副本——现网那 40 多只（§8.492："40 只 .bak-*＋1 只 ROLLBACK-*.txt"）。

    这些名字不是猜的，是服务器上的实际命名（每条后面都跟着现网出处）：
    · `*.bak-<批次>-<时间戳>`  逐只 scp 前的回滚副本，如 `.bak-m69-20261025-154505`、
      `.bak-star64-20261023-003356`、`.bak-tests58-20261022-101926`、`.bak-urlguard59-…`
    · `*.bak.<日期>` / `*.bak.withsecrets.<时间戳>`  更早那两族的写法
    · 目录形态的副本（`.bak-imgsec60b-20261022-123705/` 整目录）——所以逐段判，不只判文件名
    · `ROLLBACK*`  回滚点清单（`ROLLBACK.txt`／`ROLLBACK-md5.txt`／`ROLLBACK-quota-…`）
    · `.probebak`／`.knifebak`  探针与反向刀在**源文件旁边**落的就地备份
      （`docs/工具/量-无图态字色-真跑.js`／`刀-第一屏三块反向.js`）
    · `._*`  macOS AppleDouble：上传漏 `COPYFILE_DISABLE=1` 时整批落进生产代码树，
      §8.492 那一趟现网 `app/poster_engine/` 落了 23 只；它还会被 compileall 判成语法错
    · `*.BAD-cp-clobber`  写坏那一条 `cp -a 源 源` 后改名留证的整目录 tar（§8.490）
    排除它们只为了"别把红刷屏"，**清单里仍出声数一遍**（下面 count_copies）：
    副本只数本身是要看的账——它涨了就说明又一趟就地动过现网。
    """
    parts = relpath.replace(os.sep, "/").split("/")
    for p in parts:
        low = p.lower()
        if low.startswith("._") or low == ".ds_store":
            return True
        if ".bak-" in low or ".bak." in low or low.endswith(".bak"):
            return True
        if low.endswith((".probebak", ".knifebak")):
            return True
        if low.startswith("rollback") or "bad-cp-clobber" in low:
            return True
    return False


def digest(path: str) -> str:
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def collect(root: str):
    """返回 (相对路径 -> md5) 与一段口径说明（说明只在列出模式的注释行里出声）。"""
    rows = {}
    notes = []
    for d in DIRS:
        base = os.path.join(root, d)
        if not os.path.isdir(base):
            notes.append(f"# 口径内没有这一只目录：{d}/")
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for fn in filenames:
                if fn.endswith(SKIP_SUFFIX):
                    continue
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, root)
                if is_deploy_copy(rel):
                    continue
                rows[rel] = digest(p)
    # 根级脚本：只数这一层（不递归，递归会把 var/、logs/ 那一堆卷进来）。
    for fn in sorted(os.listdir(root)):
        p = os.path.join(root, fn)
        if not os.path.isfile(p) or not fn.endswith(ROOT_SUFFIXES):
            continue
        rel = os.path.relpath(p, root)
        if is_deploy_copy(rel):
            continue
        rows[rel] = digest(p)
    # cloudfunctions 在 backend 的兄弟位置；服务器侧通常没有，缺了必须出声（别让人以为比过了）。
    cf = os.path.join(root, os.pardir, CLOUDFUNCTIONS_NAME)
    if os.path.isdir(cf):
        for dirpath, dirnames, filenames in os.walk(cf):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for fn in filenames:
                if fn.endswith(SKIP_SUFFIX):
                    continue
                p = os.path.join(dirpath, fn)
                rel = os.path.relpath(p, os.path.join(root, os.pardir))
                if is_deploy_copy(rel):
                    continue
                rows[rel] = digest(p)
    else:
        notes.append(f"# 没找到 {CLOUDFUNCTIONS_NAME}/（{os.path.normpath(cf)}）——这一路没比进去")
    return rows, notes


def count_copies(root: str) -> int:
    """数一遍被排除的历次部署副本：红刷屏避开了，但只数必须看得见。"""
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root)
        if is_deploy_copy(rel_dir):
            dirnames[:] = []
            continue
        dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS and not is_deploy_copy(x)]
        for fn in filenames:
            if is_deploy_copy(os.path.join(rel_dir, fn)):
                n += 1
    return n


def cmd_list(root: str) -> int:
    rows, notes = collect(root)
    lines = sorted(f"{md5}  {rel}" for rel, md5 in rows.items())
    print(len(rows))
    for note in notes:
        print(note)
    print("# 历次部署副本（.bak-*/ROLLBACK*/.probebak/.knifebak/._*）已排除，只数 %d" % count_copies(root))
    print("\n".join(lines))
    return 0


def load_snapshot(path: str):
    """读一份列出模式的输出。只认"md5␣␣路径"那一条格式，其余（只数行／# 注释）忽略——
    所以两份文件里混进过 ssh 的告警行也不影响判据。"""
    rows = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.rstrip("\n")
            head, sep, rel = line.partition("  ")
            if not sep or len(head) != 32:
                continue
            try:
                int(head, 16)
            except ValueError:
                continue
            rows[rel.strip()] = head
    return rows


def cmd_compare(repo_file: str, live_file: str) -> int:
    repo, live = load_snapshot(repo_file), load_snapshot(live_file)
    if not repo or not live:
        # 空清单九成是"跑错了／拿的是 ssh 的报错页"，不是"真的零只"。这种必须出声，
        # 否则两边都空 → 三类全零 → 退出 0 = 一把假绿（本仓 §8.492 那三条"测法不对"同型）。
        print(f"!! 清单是空的：仓库 {len(repo)} 只／现网 {len(live)} 只——先确认两份文件真是脚本的输出")
        return 2
    only_live = sorted(set(live) - set(repo))
    only_repo = sorted(set(repo) - set(live))
    diff = sorted(p for p in set(repo) & set(live) if repo[p] != live[p])
    live_red = [p for p in only_live if not is_deploy_copy(p)]

    print(f"仓库 {len(repo)} 只 ／ 现网 {len(live)} 只")
    print(f"md5 不等 {len(diff)} 只 —— 不判红（现网与仓库不等是常态，另一条路那 8 只故意没上）")
    for p in diff:
        print(f"  ~ {p}  仓库 {repo[p][:8]} / 现网 {live[p][:8]}")
    print(f"仓库独有 {len(only_repo)} 只 —— 不判红（可能是没传，也可能是路径口径两边不同）")
    for p in only_repo:
        print(f"  - {p}")
    print(f"现网独有 {len(only_live)} 只，其中历次部署副本 {len(only_live) - len(live_red)} 只")
    for p in only_live:
        print(f"  {'!' if p in live_red else '·'} {p}")
    if live_red:
        print(f"!! 红：现网有 {len(live_red)} 只非副本文件不在仓库里 —— 要么就地写的，要么没 commit 就传了")
        return 1
    print("✓ 现网没有仓库外的非副本文件")
    return 0


def main(argv):
    if len(argv) >= 2 and argv[1] == "--compare":
        if len(argv) != 4:
            print("用法：--compare <仓库那份.txt> <现网那份.txt>", file=sys.stderr)
            return 2
        return cmd_compare(argv[2], argv[3])
    return cmd_list(argv[1] if len(argv) > 1 else ".")


if __name__ == "__main__":
    sys.exit(main(sys.argv))
