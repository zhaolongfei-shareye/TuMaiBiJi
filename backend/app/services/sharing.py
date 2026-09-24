"""分享这条链上"公开可见"的口径，收在这一个文件里。

三份定义被创建分享和编辑笔记两条路共用，而它们必须是同一份：
- `SNAPSHOT_COLUMNS`：公开页真正显示的字段。笔记里这几列一变，快照就得跟着同步，
  并且要重新过一次公开那道闸。
- `public_fields`：会因为一次分享而对外可见的全部内容，也就是送检范围。
- `sync_snapshot` / `snapshot_matches`：快照是冗余存的，公开页读的是它而不是笔记本身。
  笔记一改就得跟着同步，否则用户把隐私内容改掉之后，已经发出去的那张卡片仍然挂着旧内容。
- `close_shares`：公开/不公开只由 `shares.is_active` 这一列说话。海报上的码不设过期，
  所以"关掉这扇门"是用户能做的唯一下线动作——它必须存在，否则发出去就再也收不回来。

字段清单曾经漏掉过 key_links：它客户端可写、又显示在公开页上，却一次都没进过
msgSecCheck。所以下面这几个函数都从常量取字段，不再各写一份元组。
"""
from datetime import datetime, timezone

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.share import Share

# 公开页上真正显示的那几列（= ShareResponse 除 token/created_at 之外的全部字段）。
# 原来只有 title/summary/tags/key_links，缺了 key_points 和 source_url——扫码的人
# 只能看到一段摘要，既读不到要点，也拿不到原文链接，观感上就是"看不到原文"。
SNAPSHOT_COLUMNS = ("title", "summary", "tags", "key_links", "key_points", "source_url")

# 公开页上显示、但**不是**从笔记搬过来的字段。目前只有分享者昵称：它来自「分享形象」，
# 不进 SNAPSHOT_COLUMNS（那几列会被 sync_snapshot 从笔记覆盖，昵称不该被笔记内容带跑），
# 但它和快照字段一样是"因为这一次分享才对外可见"的内容，所以必须进送检。
# 加这一列而不是一句注释，是为了让用例能拿它和 ShareResponse 的字段集对账。
NON_NOTE_PUBLIC_COLUMNS = ("author_name",)


def public_fields(note: Note) -> tuple:
    """建分享时送检的全部字段。顺序即送检顺序，创建与编辑两条路共用这一份。

    必须**覆盖** `SNAPSHOT_COLUMNS`：公开页会显示而没送检的字段，就是一条绕过内容安全
    直接上公开页的路（key_links 当初就是这么漏的）。正文和外部原文不在公开页上，
    但建分享时一并看住更稳妥——多检不漏检。
    """
    return (
        note.title,
        note.summary,
        note.tags,
        note.key_points,
        note.key_links,
        note.source_url,
        note.content,
        note.original_content,
    )


def public_check_fields(note: Note, author_name: str | None = None) -> tuple:
    """建分享这一次真正送检的全部字段：笔记那几列 + 分享者昵称。

    公开页上出现而没进这道闸的字段，就是一条绕过内容安全直接上公开页的路
    （key_links 当初就是这么漏的）。所以新增 NON_NOTE_PUBLIC_COLUMNS 里的任何一列，
    都必须从这里出去，而不是在调用方各写一份参数列表。
    """
    return (*public_fields(note), author_name)


def visible_fields(note: Note) -> dict:
    """快照里真正会出现在公开页上的那几列（ShareResponse 的字段集）。"""
    return {col: getattr(note, col) for col in SNAPSHOT_COLUMNS}


def active_shares(db: Session, note_id: int) -> list[Share]:
    return (
        db.query(Share)
        .filter(Share.note_id == note_id, Share.is_active == True)  # noqa: E712
        .all()
    )


def snapshot_matches(share: Share, note: Note) -> bool:
    """公开页上那几列是否已经和笔记当前内容一模一样。

    只比 visible_fields 而不是整条笔记：正文变了但公开页看不出变化时，重复建分享
    确实没必要再打一次 msgSecCheck。
    """
    return all(getattr(share, col) == value for col, value in visible_fields(note).items())


def sync_snapshot(db: Session, note: Note) -> int:
    """把这条笔记名下所有仍然有效的分享快照刷成当前内容，返回刷了几条。

    不 commit——调用方决定这一笔和它自己的改动是一次提交。编辑笔记时如果送检
    没过，回滚要连这次同步一起回滚，否则会出现"公开页拿到了没过审的新内容"。
    """
    shares = active_shares(db, note.id)
    for share in shares:
        for column, value in visible_fields(note).items():
            setattr(share, column, value)
    if shares:
        db.flush()
    return len(shares)


def close_shares(db: Session, note_id: int) -> int:
    """把这篇笔记名下还开着的分享全关掉，返回关掉几条。撤回分享走的就是这里。

    关而不删：token 留着，哪张海报上的码被谁扫过还能对账（回 404"分享已关闭"），
    而 is_active 是唯一那扇"用户愿不愿意让别人看"的门——有效期已经不当这个用了。
    不 commit，和调用方的其它改动同一次提交。
    """
    return (
        db.query(Share)
        .filter(Share.note_id == note_id, Share.is_active == True)  # noqa: E712
        .update({"is_active": False}, synchronize_session=False)
    )


def is_expired(share: Share) -> bool:
    """这张码按它自己那个过期时间算死了没有。

    只有上线前建的那批带 `expires_at`，新建的一律为 None（= 不过期）。判过期时间的
    口径必须只有一份：库里存过 '…+00:00' 和不带时区两种写法，不带时区的按 UTC 读，
    和公开页那侧的行为一致。
    """
    if not share.expires_at:
        return False
    expires = share.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) >= expires


def active_share_by_token(db: Session, token: str) -> Share | None:
    """按 token 找到那张**此刻真的还对外开着**的码，找不到或已过期都返回 None。

    公开页读分享、把分享转存成别人的笔记，两条路问的是同一个问题，所以这个判断
    只能有一个出处——否则很容易出现"落地页显示 404 但转存接口照样抄走内容"。
    """
    share = db.query(Share).filter(Share.token == token, Share.is_active == True).first()  # noqa: E712
    if not share or is_expired(share):
        return None
    return share
