"""模板表的两件事：把包内那十套幂等灌进去（种子），以及按状态读出来（下发）。

**写路径只有这一个函数，没有 HTTP 写接口**。这不是偷懒，是这一批的边界（方案 §七 负面清单）：
"不走发版"要的是站长改一条记录就能看到新卡片，不是给外部一个能改画面的口子。
真要改的时候是：改 `miniprogram/utils/posterRecipes.js`（或直接在库里改一行）→ 跑那两把尺子 →
重新生成种子 → 跑一次这个函数。方案 P1 那一步"服务端加第 11 套"也是走这一条，不新增接口。
"""
import hashlib
import json
import os

from sqlalchemy.orm import Session

from app.models.poster_template import GROUP_KEYS, STATUS_LIVE, PosterTemplate
from app.services.poster_recipe import canonical_json, validate_recipe

SEED_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seed", "poster_templates.json")


def seed_rows(path: str = SEED_PATH):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seed_poster_templates(db: Session, path: str = SEED_PATH) -> dict:
    """幂等灌种子：同 template_id + 同 content_hash 的行不动，内容变了就新增一版并把旧的收档。

    为什么"新增一版"而不是原地 UPDATE：已经下发出去的那份配方，可能正躺在某个用户的本地缓存里。
    原地改会让"同一个 hash 对应两种内容"，那条缓存判据（客户端号没变就不重解析）就成了假的。
    收档的老行留着不删，删行等于把历史抹掉。
    """
    report = {"inserted": 0, "unchanged": 0, "archived": 0, "rejected": []}
    for row in seed_rows(path):
        errors = validate_recipe(row["recipe"])
        if errors:
            # 脏种子一条都不落库：落半份等于把"这张卡画不出来"推给用户去兜。
            report["rejected"].append(f"{row['template_id']}: {'；'.join(errors)}")
            continue
        if row["group_key"] not in GROUP_KEYS:
            report["rejected"].append(f"{row['template_id']}: group_key「{row['group_key']}」不在名单里")
            continue
        existing = (
            db.query(PosterTemplate)
            .filter(
                PosterTemplate.template_id == row["template_id"],
                PosterTemplate.status == STATUS_LIVE,
            )
            .first()
        )
        if existing and existing.content_hash == row["content_hash"]:
            report["unchanged"] += 1
            continue
        if existing:
            existing.status = "archived"
            report["archived"] += 1
        db.add(
            PosterTemplate(
                template_id=row["template_id"],
                label=row["label"],
                label_en=row["label_en"],
                group_key=row["group_key"],
                sort_order=row["sort_order"],
                recipe=row["recipe"],
                status=row.get("status", STATUS_LIVE),
                min_app_version=row.get("min_app_version", "1.0.0"),
                content_hash=row["content_hash"],
                note=row.get("note"),
            )
        )
        report["inserted"] += 1
    db.commit()
    return report


def live_templates(db: Session):
    """只读 live 那几行。draft（还在改的）与 archived（收回去的）都不出场——
    回滚就是改这一个 status 字段，秒级生效，不发版。"""
    return (
        db.query(PosterTemplate)
        .filter(PosterTemplate.status == STATUS_LIVE)
        .order_by(PosterTemplate.sort_order.asc(), PosterTemplate.id.asc())
        .all()
    )


def content_hash_of(recipe) -> str:
    """与 docs/工具/出-模板配方种子.js 那个 hash 同一条口径：键名排序的紧凑 JSON 取 sha256。

    两边算出的串必须一致（test_poster_templates 里钉着），否则客户端"号没变就不重解析"
    那条缓存判据会因为一次服务端重算而全线失效——那种失效是静默的，看起来只是缓存不命中。
    """
    return hashlib.sha256(canonical_json(recipe).encode("utf-8")).hexdigest()
