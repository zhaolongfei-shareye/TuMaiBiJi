"""模型注册齐不齐 —— 10-09 审计严重③那条的守门用例。

库里躺着一张真表，而 alembic 看不见它，会怎样？`alembic revision --autogenerate` 把"库里多出来
的表"当成没人要的，顺手写一条 `drop_table(...)` 发出去。`user_profiles`（2.1 名片那四格的唯一
存放处）当时就是这个状态：`app/models/__init__.py` 挂着 `note_card`，唯独漏了 `user_profile`，
而 `alembic/env.py` 只 `from app.models import ...` 那六个老名字——两边都没 import 它，
`Base.metadata` 里就没有它。

为什么原来那套用例没抓到：`test_user_profiles.py` 自己 `from app.models.user_profile import ...`，
pytest 收集用例时先把那个模块导进来了，`Base.metadata` 于是"顺带"齐了。**一条靠别的文件
碰巧 import 才成立的断言，测的不是那个包，是导入顺序。**

所以这一把不查运行时状态，直接查两处文本：每个模型模块必须被 `__init__.py` 或 `alembic/env.py`
之一挂着（两条路都会把表挂进 `Base.metadata`，autogenerate 才看得见）。
"""
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
MODELS = BACKEND / "app" / "models"
INIT = MODELS / "__init__.py"
ENV = BACKEND / "alembic" / "env.py"


def _model_modules():
    out = []
    for f in sorted(MODELS.glob("*.py")):
        if f.name == "__init__.py":
            continue
        out.append(f.stem)
    return out


def test_每个模型文件都被某个入口挂着():
    """新增一张表 = 新增一个模型文件，而它必须在这里被点名，否则 autogenerate 会 drop 它。"""
    text = INIT.read_text(encoding="utf-8") + "\n" + ENV.read_text(encoding="utf-8")
    missing = [m for m in _model_modules() if f"app.models.{m} import" not in text]
    assert not missing, (
        "这些模型文件既没被 app/models/__init__.py 挂着，也没被 alembic/env.py import："
        f"{missing}。补一处 import（两处任一即可），否则下一次 --autogenerate "
        "会把库里那张真表当成多余的，写一条 drop_table 出去。"
    )


@pytest.mark.parametrize("stem", _model_modules())
def test_单独import那个模型就能把表挂进来(stem):
    """防的是另一种漏：文件在、类也在，但 `__tablename__` 忘了写或没继承 Base。"""
    import importlib

    from app.db.database import Base

    mod = importlib.import_module(f"app.models.{stem}")
    tables = {
        v.__tablename__ for v in vars(mod).values()
        if isinstance(v, type) and getattr(v, "__tablename__", None)
    }
    assert tables, f"app/models/{stem}.py 里没有带 __tablename__ 的模型类"
    assert tables <= set(Base.metadata.tables), f"{stem} 的表没挂进 Base.metadata：{tables}"
