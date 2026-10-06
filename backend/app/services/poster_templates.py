"""模板表的两件事：把包内那十套幂等灌进去（种子），以及按状态读出来（下发）。

**写路径只有这一个函数，没有 HTTP 写接口**。这不是偷懒，是这一批的边界（方案 §七 负面清单）：
"不走发版"要的是站长改一条记录就能看到新卡片，不是给外部一个能改画面的口子。
加一套**新**模板走的是纯数据那条路：往 `seed/poster_extra/` 放一份 JSON → 跑 `docs/工具/跑新模板流程.sh`
（第 0 关 → 注入真跑出图 → 人看图）→ 重新生成种子 → 开闸部署。这条路一行客户端代码都不碰。
只有改**包内那十套**才需要动 `miniprogram/utils/posterRecipes.js`，那是要发版的。详见 docs/流程-加一套卡片模板.md。
"""
import hashlib
import json
import os

from sqlalchemy.orm import Session

from app.models.poster_template import GROUP_KEYS, STATUS_LIVE, PosterTemplate
from app.services.poster_recipe import canonical_json, validate_recipe

SEED_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seed", "poster_templates.json")
# 数据模板那一档的落盘处：一份文件＝一套卡片，由 docs/工具/出-模板配方种子.js 并进上面那份种子。
# 这里只拿来对账（种子的条数对不对得上盘上的文件），读文件拼种子那条路只走生成器，不留第二处。
EXTRA_DIR = os.path.join(os.path.dirname(SEED_PATH), "poster_extra")


def extra_files():
    if not os.path.isdir(EXTRA_DIR):
        return []
    return sorted(f for f in os.listdir(EXTRA_DIR) if f.endswith(".json") and not f.endswith(".example.json"))



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
        # 配方里那个 id 必须就是这一行的 template_id——与客户端 poster.js 的 remoteRowProblems
        # 同一条规则（两边各拦一遍，服务端这道先拦，写配方的人当场就能看到）。
        # 少这一道，"加第 11 套"可以写成把 quote 那份配方贴到新 id 上：每一层都合法、
        # 客户端也收，但列表里多那一格，点进去画的是另一张卡——名字对、内容不对。
        if (row["recipe"] or {}).get("id") != row["template_id"]:
            report["rejected"].append(
                f"{row['template_id']}: 配方自己的 id「{(row['recipe'] or {}).get('id')}」与 template_id 不一致"
            )
            continue
        # 幂等判据查的是**这一行自己那个 status**，不是硬写 live。
        # 差一行写 draft 的种子：查 live 查不着 → 每次都当新行插一遍，部署几次就有几行同 hash 的 draft。
        # 生成器那条路已经只放 live 进来（见 docs/工具/出-模板配方种子.js），这里再挡一道，
        # 因为 seed_poster_templates(db, path) 还能吃手搓的种子文件。
        want_status = row.get("status", STATUS_LIVE)
        existing = (
            db.query(PosterTemplate)
            .filter(
                PosterTemplate.template_id == row["template_id"],
                PosterTemplate.status == want_status,
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
