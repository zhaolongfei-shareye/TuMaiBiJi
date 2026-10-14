"""§8.232：新用户名下的那一篇预置笔记。

三件事决定这一份实现长这样，都不是即兴：

1. **只在"这个账号是这一次登录才建出来的"那一次写。**
   判据不靠"他名下没笔记"这种现算的状态——那种写法挂在每次 `_doLogin` 上，
   用户把预置这篇删掉、退出、下次冷启，它又回来了（§8.232 判据 2 要钉的就是这一条）。
   挂在建号那一个分支上，"删了不许复活"是结构成立，不是靠哪一处记得清标记。
2. **排在邀请归因之后。**
   `quota.attribute_inviter` 那条不认的判据是"名下已经有笔记"。先播种再归因，
   每个新用户出生就有一篇，归因这条路对他永久关闭，那笔 +10 MIND 就凭空没了。
   （归因与"动笔首篇"两处现在都改读 `authored_count`，见 quota.py 那两条注释；
   这一行的先后是第二道保险，不是唯一的闸。）
3. **正文不走模型。**
   四字段全从 `backend/seed/preset_note.json` 抄来（那份又是 `出-预置笔记种子.js`
   从现网 appInfo.js / about.js 抄的），所以这一条既不吃提炼那次静默降级，
   也不在注册链路上多烧一次混元调用。

它**不是**一种新笔记类型：库里就是一行普通的 `notes`，能改、能设私密、能分享，
读写那几条链都不为它开分支。唯一的痕迹是 `source_type == "preset"`——
那本来只是为了让"他动笔的第一篇"和"他名下已经有几篇"这两句判据还能分得开。

**10-14 起多一个例外：那一篇删不掉，它名下那张卡片也撤不掉**（站长「默认的不能删除」）。
闸挂在下面那两个常量上，由 `delete_note` 与 `drop_note_card` 两个口各引一次；
除这两处之外它和用户自建笔记一模一样（§8.232 判据 4 里"能删"那半句从他改口那天起作废）。
"""
import json
import os

from sqlalchemy.orm import Session

from app.models.note import Note

SEED_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seed", "preset_note.json")
PRESET_SOURCE_TYPE = "preset"

# 站长 10-14：「默认笔记，和默认卡片有没有做……然后默认的不能删除」。
# 那两句要说给用户听的话只活在这一处：删笔记与撤卡片两个口共用，两处各写一遍迟早一边改了另一边没改。
# 判据就是播种时那个 `source_type == "preset"`——不另起一列，也不靠"名下第一篇"猜（那种写法会
# 因为他改过标题、换过分类而误伤别人的笔记）。
PRESET_NOTE_KEEP_MSG = "自带那一篇是产品说明，删不掉；要改内容可以直接编辑"
PRESET_CARD_KEEP_MSG = "自带那一篇的卡片删不掉"


def seed_row(path: str = SEED_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        row = json.load(f)
    for key in ("title", "summary", "tags", "key_points", "content"):
        if not row.get(key):
            raise ValueError(f"预置笔记种子缺 {key}：{path}")
    if row.get("source_type") != PRESET_SOURCE_TYPE:
        raise ValueError(f"种子的 source_type 必须是 {PRESET_SOURCE_TYPE}，读到 {row.get('source_type')!r}")
    return row


def authored_count(db: Session, user_id) -> int:
    """他自己动笔存下的那几篇——预置那一篇不算。

    传的是 `users.id`（不是 User 对象）：`quota.used_count` 那边收的是对象，
    这一条两个调用点（归因、动笔首篇）手上都只有 id，不为了对齐签名再造一个 User 参数。
    与 `quota.used_count` 必须是两条口径：页头那一列「笔记」照实算（§8.232 口径 6，
    新用户看到的是 1 不是 0），而结钱与归因那两处判的是"这个人自己写过东西没有"。
    """
    return (
        db.query(Note)
        .filter(Note.user_id == str(user_id), Note.source_type != PRESET_SOURCE_TYPE)
        .count()
    )


def seed_note_for_new_user(db: Session, user) -> Note | None:
    """给刚建出来的这个账号播种那一篇。返回那一行；已经有预置篇则返回 None（不重复种）。

    故意不叫"确保"：它只在 `login_or_register` 建号那一个分支里被调一次，
    幂等那半是防线（同一 openid 因为并发或人工重放第二次走到建号分支时不叠加），
    不是主逻辑——主逻辑是"这一次登录真的生出了一个新账号"。
    """
    already = (
        db.query(Note)
        .filter(Note.user_id == str(user.id), Note.source_type == PRESET_SOURCE_TYPE)
        .first()
    )
    if already:
        return None
    row = seed_row()
    note = Note(
        user_id=str(user.id),
        title=row["title"],
        summary=row["summary"],
        tags=row["tags"],
        key_points=row["key_points"],
        content=row["content"],
        # 预置这篇没有"抓下来的原文"那一层：正文本身就是原文，两处同一份，
        # 免得详情窗里那栏空着读起来像缺了东西。
        original_content=row["content"],
        source_type=PRESET_SOURCE_TYPE,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
