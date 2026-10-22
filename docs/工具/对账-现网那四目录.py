"""现网与本地那四目录逐只比 md5（10-22 第五十八次那趟立的可复跑尺子，台账 §8.436）。

跑法（两台机器各跑一次，把两份输出拿回本机 join）：
    本机：  python3 docs/工具/对账-现网那四目录.py backend > /tmp/head.txt
    服务器： cat docs/工具/对账-现网那四目录.py | ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - /home/ubuntu/wtsj-backend' > /tmp/live.txt

为什么写这一支：`git status`／时间戳在这条链上都不作证——rsync 与 scp 保留 mtime，
而"现网落后几只"这种事只能逐只比字节（历次部署都栽在拿时间当证据上）。
比之前先做 `git archive HEAD` 出一份干净树再跑本机那一次，否则工作树里另一条线的未提交文件会混进来。

输出第一行是只数、其余每行"md5  ␣␣相对路径"；两台的 sort  locale 不一样，
所以**只在拿回本机之后 join**，别在服务器上比顺序。集合口径写在 DIRS 与 EXCLUDE 里，改口径要连台账一起改。
"""
import hashlib
import os
import sys

DIRS = ("app", "alembic", "tests", "seed")
SKIP_DIRS = {"__pycache__"}
SKIP_SUFFIX = (".pyc",)


def main(root: str) -> None:
    rows = []
    for d in DIRS:
        base = os.path.join(root, d)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in SKIP_DIRS]
            for fn in filenames:
                if fn.endswith(SKIP_SUFFIX):
                    continue
                p = os.path.join(dirpath, fn)
                with open(p, "rb") as f:
                    digest = hashlib.md5(f.read()).hexdigest()
                rows.append(digest + "  " + os.path.relpath(p, root))
    rows.sort()
    print(len(rows))
    print("\n".join(rows))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
