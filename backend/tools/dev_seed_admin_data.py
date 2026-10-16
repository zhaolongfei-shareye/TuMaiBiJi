"""一次性：给后台「数据」那一屏编一份**数字已知**的本机库（只跑在本机，现网碰不到）。

存在的理由：`验-后台数据屏分类与图片.mjs` 要在真浏览器里量 A4／A9 那两张卡，
它得知道"屏上那个数应该是几"。所以这里的每一档都在文件末尾原样打印出来，
尺子读那份输出当判据，不在两处各写一遍常数（写两遍迟早对不上）。

跑法（本机）：DATABASE_URL=sqlite:////tmp/xxx.db .venv/bin/python tools/dev_seed_admin_data.py
"""
import json
import sys

sys.path.insert(0, ".")

from sqlalchemy import text  # noqa: E402

from app.db.database import Base, SessionLocal, engine  # noqa: E402
from app.models.asset import Asset  # noqa: E402
from app.models.category import Category  # noqa: E402
from app.models.note import Note  # noqa: E402
from app.models.user import User  # noqa: E402
from app.core.private_access import PRIVATE_CATEGORY_NAME  # noqa: E402
from app.services.preset_note import PRESET_SOURCE_TYPE  # noqa: E402

# 用户自己写的分类名：这一串**一个字都不许上到那一屏**（规格 §5），尺子就是照着它判红的。
USER_CATEGORY_NAME = "住院记录-编号7301"

EXPECTED = {
    "categories": {"authored": 6, "uncategorized": 3, "categorized": 3, "private": 1, "slots": 2},
    "assets": {"total": 4, "uploaded": 3, "failed": 1, "bytes_uploaded": 3500, "size_unknown": 1},
}


def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    for t in (Asset, Note, Category, User):
        db.query(t).delete()
    db.commit()

    users = [User(openid=f"admin-view-{i}", nickname=f"甲{i}") for i in range(3)]
    db.add_all(users)
    db.commit()
    u0 = str(users[0].id)

    priv = Category(user_id=u0, name=PRIVATE_CATEGORY_NAME)
    own = Category(user_id=u0, name=USER_CATEGORY_NAME)
    db.add_all([priv, own])
    db.commit()

    def note(cid, st="manual"):
        db.add(Note(user_id=u0, title="标题", source_type=st, category_id=cid))
        db.commit()

    note(priv.id)                                        # 私密那一格：1
    note(own.id)                                         # 用户自己的分类：2 篇
    note(own.id)
    note(None)                                           # 未分类：3 篇
    note(None)
    note(None)
    note(None, PRESET_SOURCE_TYPE)                       # 预置 2 篇：哪一档都不许进
    note(None, PRESET_SOURCE_TYPE)

    db.add_all([
        Asset(user_id=u0, object_key="cloud://v1", file_size=1000, backup_status="uploaded"),
        Asset(user_id=u0, object_key="cloud://v2", file_size=2500),
        Asset(user_id=u0, object_key="cloud://v3"),
        Asset(user_id=u0, object_key="cloud://v4", file_size=9999, backup_status="failed"),
    ])
    db.commit()
    # 那两行的 NULL 必须像迁移那样用 SQL 写：`backup_status` 上有 Python 端 default="uploaded"，
    # ORM 传 None 会被填成 'uploaded'，这一栏要量的那件事当场就没了。
    db.execute(text(
        "update assets set backup_status = null where object_key in ('cloud://v2','cloud://v3')"))
    db.commit()

    nulls = db.execute(text("select count(*) from assets where backup_status is null")).scalar()
    assert nulls == 2, f"样本没造出 NULL 行（{nulls}），这份库不能给尺子用"
    db.close()
    print(json.dumps(EXPECTED))


if __name__ == "__main__":
    main()
