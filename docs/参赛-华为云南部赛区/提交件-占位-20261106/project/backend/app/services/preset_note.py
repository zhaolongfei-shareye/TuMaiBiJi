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

它**不是**一种新笔记类型：库里就是一行普通的 `notes`，唯一的痕迹是 `source_type == "preset"`——
那本来只是为了让"他动笔的第一篇"和"他名下已经有几篇"这两句判据还能分得开。10-18 起这一条痕迹
成了**这一类的身份**：屏上念「帮助文档」，官方写的、用户改不了。

**10-18 站长把这一类的规矩整批改了**（「官方预置，变成"帮助文档"，然后这类笔记，不能编辑（按钮置灰），
不能分享，允许删除。然后后台更新后，要新旧用户全量刷新」），四条各自落点：
- **允许删除**——10-14 那句「默认的不能删除」作废，`delete_note` 与 `drop_note_card` 那两道闸都撤了。
  撤闸不能顺带撤掉另一条：**删了不许复活**（§8.232 判据 2）仍然成立，播种只挂在建号那一个分支上，
  全量刷新只改**还留着的那几行**，绝不替删掉的人补一行（他这一句选的是"删了就没了"）。
- **不许编辑／不许分享／不许生成卡片**——闸写在服务端（见下面那三句话术与三个调用点），
  界面上按钮置灰只是表现：老包还在外面跑，接口不挡就等于没挡。
- **后台一发布就全量刷新**——`resync_all` 按当前生效那份重写所有 `preset` 行的五栏，新旧账号一起刷。
  他选的是"无脑全覆盖"：这一类从此没人能编辑，所以不存在覆盖掉用户自己写的东西那种风险。
  停用那一栏也算一次更新（生效值换回包里那份），所以两条路都跟着刷。

**10-18 起这份内容归后台管**（站长「默认笔记请在管理后台配置，我可以编辑修改，日后更新不需要发版」）：
生效值存在 `mp_settings` 那一行（kind=`preset_note`），播种读的是**库里那一份**，库里没有或停用了
才落回 `seed/preset_note.json`。这条链从来在服务器上，所以"改它要不要发版"分两档说清楚：
**小程序本来就不用发版**（包里没有这份文案），改文件那一档要的是后端部署，改后台那一档连部署也不用。
"""
import json
import os

from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.mp_asset import KIND_PRESET_NOTE
from app.models.note import Note
from app.services import mp_assets
from app.services.sharing import close_shares

SEED_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "seed", "preset_note.json")
PRESET_SOURCE_TYPE = "preset"

# 站长 10-18 那一改之后，这一类只剩三句"不许"，每句只活在这一处，三个口各引一次。
# （10-14 那两句「删不掉」的提示随那两道闸一起删了，别在别处再写第四份。）
PRESET_EDIT_MSG = "帮助文档是官方写的那一篇，内容改不了"
PRESET_SHARE_MSG = "帮助文档是官方写的那一篇，不能分享"
PRESET_CARD_MSG = "帮助文档是官方写的那一篇，不生成卡片"

# 编辑那一道闸挡的是"改内容"这八栏。**不挡分类与置顶**：他这句说的是"不能编辑"，
# 而把自己名下的一篇归到哪一格、要不要钉在顶上，那是他整理自己的库，不是改官方那份内容。
# 这一条我没问过他，判据里单独钉着，要连分类一起挡就说一句。
# ⚠ 这一份清单必须跟着 `routes/notes.py` 的 `NoteUpdate` 走齐（10-18 全量审查抓出来的就是漏栏——
#    一次漏了两栏），由 `tests/test_preset_note.py::test_闸的字段清单必须跟着编辑那道口走齐`
#    拿模型现读钉着：少一栏等于那一栏可以从这一道口改官方那一篇，而 `resync_all` 只刷下面那六栏、
#    刷不到它——改完连管理员在后台重发一次都纠不回来。
#    `key_links` 还在公开快照清单里（`services/sharing.SNAPSHOT_COLUMNS`），不是装饰。
#    `source_url` 同罪：官方那一篇虽然分享不出去，但详情窗与独立详情页都会把「来源链接」那一行
#    画出来、还给一枚能点的门——往官方那一篇上挂一条来路不明的链接，等于改了它显示的内容。
CONTENT_FIELDS = ("title", "summary", "tags", "key_points", "key_links", "content",
                  "original_content", "source_url")


def is_help_doc(note) -> bool:
    """这一篇是不是官方那一篇。判据只有播种时那个 `source_type`，
    不靠"名下第一篇"或标题猜（那种写法会误伤用户自己写的笔记）。"""
    return getattr(note, "source_type", None) == PRESET_SOURCE_TYPE


def touches_content(fields) -> bool:
    """这一次 PUT 里有没有内容那八栏（清单只在上头那一个出处）。"""
    return bool(set(fields) & set(CONTENT_FIELDS))


def seed_row(path: str = SEED_PATH) -> dict:
    with open(path, encoding="utf-8") as f:
        row = json.load(f)
    for key in ("title", "summary", "tags", "key_points", "content"):
        if not row.get(key):
            raise ValueError(f"预置笔记种子缺 {key}：{path}")
    if row.get("source_type") != PRESET_SOURCE_TYPE:
        raise ValueError(f"种子的 source_type 必须是 {PRESET_SOURCE_TYPE}，读到 {row.get('source_type')!r}")
    return row


# 后台那一格能填的五个字段与它们的尺。
# 标题／摘要那两枚不是从 `routes/notes.py` 那组常量抄的，是**客户端那一屏的尺**：
# `pages/write/write.wxml:13` 的标题框 `maxlength="100"`、`:24` 的摘要框 `maxlength="500"`。
# 后台放行 500 字的标题，症状是"存进去了，但用户点开编辑再保存，标题被那一栏截回 100 字"——
# 那是拿一份合法数据去撞一道更严的闸，比直接拒难查得多。`tests/test_preset_note.py` 里有一条
# 静态判据在钉这两个数与 wxml 里那两个 `maxlength` 相等，改了任何一头都会红。
MAX_SEED_TITLE = 100
MAX_SEED_SUMMARY = 500
# 要点／标签／正文那三枚与建笔记那道口同源同数（`routes/notes.py:47-52` 的 MAX_BODY／
# MAX_ITEM_LEN／MAX_LIST_ITEMS）。这里不 import 那三个名字：`core/auth.py` 已经 import 本模块，
# 而 `routes/notes.py` import `core/auth.py`，从这一头反向 import 会绕成一个环。
# 所以这三枚写死＋由用例反查那三枚，改一边就红。
MAX_SEED_CONTENT = 16_000
MAX_SEED_ITEM_LEN = 200
MAX_SEED_ITEMS = 50
SEED_FIELDS = ("title", "summary", "tags", "key_points", "content")


def _clean_str(value, label, limit, required):
    if value is None:
        text = ""
    elif isinstance(value, str):
        text = value.strip()
    else:
        raise UserError(f"{label}要填文字")
    if required and not text:
        raise UserError(f"{label}不能空着")
    if len(text) > limit:
        raise UserError(f"{label}超过 {limit} 字（现在 {len(text)} 字）")
    return text


def _clean_list(value, label, limit):
    """一行一串送进来（后台那个框就是这么读的），空行丢掉——手打都会留个尾换行，那不算一条。"""
    if isinstance(value, str):
        items = value.splitlines()
    elif isinstance(value, list):
        items = value
    else:
        raise UserError(f"{label}要一行一条")
    out = []
    for raw in items:
        if not isinstance(raw, str):
            raise UserError(f"{label}里有不是文字的行")
        one = raw.strip()
        if not one:
            continue
        if len(one) > limit:
            raise UserError(f"{label}有一条超过 {limit} 字：{one[:12]}…")
        out.append(one)
    if len(out) > MAX_SEED_ITEMS:
        raise UserError(f"{label}最多 {MAX_SEED_ITEMS} 条（现在 {len(out)} 条）")
    return out


def clean_seed(value) -> dict:
    """把后台送来的那份洗成唯一形状；任何一项不合格整份退回，不收半份（与 `clean_text` 同一条纪律）。

    只**标题与正文**必填：摘要、要点、标签在用户自建那几篇里本来就可以空，
    把这三样也钉成必填，等于在后台里禁掉"只给一句正文"这种写法。
    文件里那份（`seed_row`）反过来五样都要——那是出厂兜底，缺一样是构建错误，不是用户选择。
    """
    if not isinstance(value, dict):
        raise UserError("这一栏要按五个字段一起给")
    return {
        "title": _clean_str(value.get("title"), "标题", MAX_SEED_TITLE, required=True),
        "summary": _clean_str(value.get("summary"), "摘要", MAX_SEED_SUMMARY, required=False),
        "tags": _clean_list(value.get("tags"), "标签", MAX_SEED_ITEM_LEN),
        "key_points": _clean_list(value.get("key_points"), "要点", MAX_SEED_ITEM_LEN),
        "content": _clean_str(value.get("content"), "正文", MAX_SEED_CONTENT, required=True),
    }


def resync_all(db: Session) -> dict:
    """按当前生效那一份重写库里所有 `preset` 行——站长 10-18「后台更新后，要新旧用户全量刷新」。

    三件事钉死在这一处，别分头写：
    1. **只改还留着的那几行**（他选的是"删了就没了"）：删掉的人**不会**在这里被补一篇，
       新号那一路归 `seed_note_for_new_user` 管，两条路各管各的，混在一起就变成"删不掉的官方内容"。
    2. **无脑全覆盖五栏**（他选的那条）＋ `original_content` 跟着正文走（播种时两处同一份，这里也同一份）。
    3. 这一类从此不能分享，所以**顺手把它名下还开着的分享码关掉**——不关的话公开落地页继续供正文，
       而界面上那一枚分享钮已经灰了，用户再没有第二个入口能收回它。（`notes.py` 里"改成私密顺手关码"
       就是同一条理由，照它做。）
    """
    row = live_seed(db)
    notes = db.query(Note).filter(Note.source_type == PRESET_SOURCE_TYPE).all()
    closed = 0
    for note in notes:
        note.title = row["title"]
        note.summary = row["summary"]
        note.tags = row["tags"]
        note.key_points = row["key_points"]
        note.content = row["content"]
        note.original_content = row["content"]
        closed += close_shares(db, note.id)
    db.commit()
    return {"refreshed": len(notes), "closed_shares": closed}


def save_seed(db: Session, value) -> dict:
    """存生效值，**并顺手把存量刷一遍**（刷新绑在写入上，不绑在某个路由上：多开一个写入口也不会漏刷）。"""
    payload = clean_seed(value)
    row = mp_assets.setting_row(db, KIND_PRESET_NOTE, create=True)
    row.text_value = payload
    # 与文案栏同一条：这一栏永远不指图片行，免得"两半都填了一点"那种状态在库里存在。
    row.asset_id = None
    db.commit()
    return resync_all(db)


def clear_seed(db: Session) -> dict:
    """停用＝写回 NULL，下一个新号落回包里那份 JSON。留行不留值，与 `clear_text` 同一条口径。
    停用也是一次"生效值变了"，所以存量照样跟着刷回包里那一份。"""
    row = mp_assets.setting_row(db, KIND_PRESET_NOTE, create=True)
    row.text_value = None
    db.commit()
    return resync_all(db)


def seed_row_from_db(db: Session) -> dict | None:
    """库里那份；读不到或形状不完整就返回 None，让调用方落回文件。

    这里再走一次 `clean_seed` 而不是直接信库里那一份：库里存的可能是更早一版写进去的、
    也可能是人工改过的，而"播种出来的那一篇字段超限"是要在**建号那一刻**红在日志里的事，
    不该等到用户打开详情才发现标题被截了。
    """
    row = mp_assets.setting_row(db, KIND_PRESET_NOTE)
    if row is None or not isinstance(row.text_value, dict):
        return None
    try:
        return clean_seed(row.text_value)
    except UserError:
        return None


def live_seed(db: Session) -> dict:
    """播种真正用的那一份：库里那份优先，没有或坏了落回文件。"""
    from_db = seed_row_from_db(db)
    return from_db if from_db is not None else seed_row()


def admin_seed_state(db: Session) -> dict:
    """给后台那一页的读数：当前生效的是哪一份、填回去的形状、三把尺。

    ⚠ 包里那一份读不出来时不许把整栏打成 500（N14）：库里那份是好的，操作者正需要看一眼
    "现在生效的是哪一份"。所以这里把读包那一步挡下来，回 `fallback=None` 加一句实话；
    两头都没有（库里也没有）才是真的没东西可看，那时响一句中文，别响一片英文堆栈。
    """
    row = mp_assets.setting_row(db, KIND_PRESET_NOTE)
    from_db = seed_row_from_db(db)
    fallback_error = None
    try:
        fallback = seed_row()
    except (OSError, ValueError) as e:
        fallback = None
        fallback_error = f"包里那份读不出来：{e}"
    if fallback is None and from_db is None:
        raise UserError(f"帮助文档这一篇库里没有、包里那份也坏了（{fallback_error}），先修包再进这一栏")
    return {
        "kind": KIND_PRESET_NOTE,
        "label": mp_assets.KIND_LABELS.get(KIND_PRESET_NOTE, KIND_PRESET_NOTE),
        "registered": row is not None,
        "source": "库里" if from_db is not None else "包里",
        "current": from_db if from_db is not None else fallback,
        "fallback": fallback,
        "fallback_error": fallback_error,
        "fields": list(SEED_FIELDS),
        "limits": {
            "title": MAX_SEED_TITLE,
            "summary": MAX_SEED_SUMMARY,
            "content": MAX_SEED_CONTENT,
            "item": MAX_SEED_ITEM_LEN,
            "items": MAX_SEED_ITEMS,
        },
    }


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
    row = live_seed(db)
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
