"""现网只读探针：把 `share_reports` 读成一张台账，打印给**人**看。

它存在的理由只有一条：Apple 1.2 要的是"有举报入口**并且有实际处理流程**"，而写入那半
（落地页那张表单）早就上线了，读取那半一直是空的——一张没人能读的表会一直安静地涨，
界面上一个字都不报错。这条探针就是"处理流程"里我们这一侧的眼睛：它不修任何东西，
跑一次给一次读数。

用法（在服务器上跑，那里才读得到 `.env` 与真库）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/读-举报台账.py

**全程只读**：一行不写、一行不删、不建临时行（所以也没有"跑完没清干净"这一类尾账）。
口径全部来自 `app/services/report_ledger.py`，这份脚本只负责排版与"读没读到"这一层。

为什么要看"零条"那一行：这张表上线以来大概率一直是空的，而"空"有两种——真没人举报，
与读不出来（表不在、迁移没跑、查询被异常吞了）。两者打印成 `0 组` 长得一模一样。
所以这一支把**原始行数**与**台账条数**各读一遍再比，并且在 0 的那一档明写一句话，
免得下一次把"我没接上"读成"现网很干净"。

退出码：0 = 读数自洽（包括零条）；1 = 覆盖对不上或有异常，这种台账不许当依据。
"""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import inspect

from app.db.database import SessionLocal
from app.models.share_report import ShareReport
from app.services.report_ledger import SAMPLE_LIMIT, ledger

# 需要人看一眼的门槛：两个人以上举报同一篇。定在 2 是因为一条举报可能是当事人自己手滑，
# 两条来自两个不同指纹才是"有别人也在意"。
ATTENTION_AT = 2

# 展示层的卫生：原话是**公开表单**收回来的自由文本，换行能伪造出台账的下一行
# （一条 `...\n2026-10-10 举报人=甲` 读起来就像一条真记录）。控制字符在这里换成可见符号，
# 数据本身交给 `report_ledger` 原样传递——那是显示层的洞，不该靠改数据来堵。
_CTRL = {"\n": "⏎", "\r": "␍", "\t": "⇥"}


def flat(text: str, limit: int = 120) -> str:
    """把一段外来文本压成一行、限长。非 ASCII（中文原话）照原样留着，只动控制字符。"""
    out = []
    for ch in text:
        mapped = _CTRL.get(ch)
        if mapped is not None:
            out.append(mapped)
        elif 0x20 <= ord(ch) and ord(ch) != 0x7F:
            out.append(ch)
        else:
            out.append(f"<{ord(ch):02x}>")
    return "".join(out)[:limit]


def main() -> int:
    db = SessionLocal()
    try:
        tables = set(inspect(db.bind).get_table_names())
        if "share_reports" not in tables:
            print("✗ 库里没有 share_reports 这张表——迁移没跑或连错了库，下面每一行都没有意义")
            return 1

        raw = db.query(ShareReport).count()
        led = ledger(db)

        print(f"现网举报台账 · 读于 {datetime.now().isoformat(timespec='seconds')}")
        print(f"原始行数 {raw} · 台账条数 {len(led)}")

        # 覆盖一致是这支探针唯一真正的"判据"：台账把每一行都归进了某一组，一行不丢。
        covered = sum(g.total for g in led)
        if covered != raw:
            print(f"✗ 覆盖对不上：台账只归了 {covered} 行，库里有 {raw} 行——这本台账缺一页")
            return 1
        if {g.token for g in led} != {r[0] for r in db.query(ShareReport.token).distinct()}:
            print("✗ 分组的 token 集合与库里的不一致（归组漏了或多算了）")
            return 1

        if raw == 0:
            print("★ 现网零条举报。这句话的意思是「那张表单上没人写过东西」，"
                  "不是「读取侧接上了但没数据」也不是「坏了」——上面那两行都是 0 才叫一致。")
            print("下面每一档都是 0，属于同一条读数的展开，不另计覆盖。")
        else:
            states = {}
            for g in led:
                states[g.page_state] = states.get(g.page_state, 0) + 1
            nulls = db.query(ShareReport).filter(ShareReport.reporter_bucket.is_(None)).count()
            multi = [g for g in led if g.reporters >= ATTENTION_AT]
            print(f"页面状态：" + " · ".join(f"{k} {v}" for k, v in sorted(states.items())))
            print(f"bucket 为 NULL 的行：{nulls}（这一档每行各算一个人，宁可多算不可漏算）")
            print(f"需要人看一眼的（去重人数 ≥ {ATTENTION_AT}）：{len(multi)} 篇")
            print()
            print(f"从上往下读，最上面那篇是去重人数最多的（原话每篇最多 {SAMPLE_LIMIT} 条）：")
            for g in led:
                head = (f"{g.token} · {g.page_state} · 条数 {g.total} · 人数 {g.reporters}"
                        f" · 最近 {g.latest_at.isoformat(timespec='seconds') if g.latest_at else '读空'}")
                print("  " + head)
                reasons = "、".join(f"{flat(k, 32)} {v}" for k, v in sorted(g.reasons.items()))
                if reasons:
                    print(f"    理由：{reasons}")
                for note in g.samples:
                    print(f"    原话：{flat(note)}")
                if len(g.samples) < g.total:
                    print(f"    （另有 {g.total - len(g.samples)} 条没写补充说明，或原话超出上面那 "
                          f"{SAMPLE_LIMIT} 条）")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
