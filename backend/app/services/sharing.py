"""分享这条链上"公开可见"的口径，收在这一个文件里。

三份定义被创建分享和编辑笔记两条路共用，而它们必须是同一份：
- `SNAPSHOT_COLUMNS`：公开页真正显示的字段。笔记里这几列一变，快照就得跟着同步，
  并且要重新过一次公开那道闸。
- `public_fields`：会因为一次分享而对外可见的全部内容，也就是送检范围。
- `sync_snapshot` / `snapshot_matches`：快照是冗余存的，公开页读的是它而不是笔记本身。
  笔记一改就得跟着同步，否则用户把隐私内容改掉之后，已经发出去的那张卡片仍然挂着旧内容。

字段清单曾经漏掉过 key_links：它客户端可写、又显示在公开页上，却一次都没进过
msgSecCheck。所以下面这几个函数都从常量取字段，不再各写一份元组。
"""
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.share import Share

# 公开页上真正显示的那几列（= ShareResponse 除 token/created_at 之外的全部字段）。
# 原来只有 title/summary/tags/key_links，缺了 key_points 和 source_url——扫码的人
# 只能看到一段摘要，既读不到要点，也拿不到原文链接，观感上就是"看不到原文"。
SNAPSHOT_COLUMNS = ("title", "summary", "tags", "key_links", "key_points", "source_url")


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

    不 commit——调用方决定这一笔和它自己的改动是不是一次提交。编辑笔记时如果送检
    没过，回滚要连这次同步一起回滚，否则会出现"公开页拿到了没过审的新内容"。
    """
    shares = active_shares(db, note.id)
    for share in shares:
        for column, value in visible_fields(note).items():
            setattr(share, column, value)
    if shares:
        db.flush()
    return len(shares)
