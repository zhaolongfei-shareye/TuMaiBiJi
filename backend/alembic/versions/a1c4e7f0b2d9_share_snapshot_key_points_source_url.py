"""shares 快照补 key_points / source_url，并把"有效期"换成人能用的那扇门

Revision ID: a1c4e7f0b2d9
Revises: ecba9801b98a
Create Date: 2026-09-24 01:20:11.884320

三件事，都得在同一个迁移里做完，因为它们改的是同一批行的同一列语义：

1. 快照补齐两个字段并回填，老海报扫开来也是完整笔记，不只是摘要。
2. 有效期改语义：码是印在纸上的，不该一周后自己失效。但**只放行当时还没到期的那些**——
   上线当时就已经过期的老码，说明它自己那七天已经走完了，用户没有再点过任何东西；
   如果一并清掉时间戳，等于替他做了一次"重新公开"。这些行改成 is_active=0，明确关掉，
   想再分享就重新生成一张码。真正的"公开/不公开"从此由 shares.is_active 一列说话。
3. 一篇笔记只留一行是开着的，然后上部分唯一索引。去重放在建索引之前，因为老数据里
   确实可能有"过期没删 + 又新建了一张"并存的情况。

"""
from datetime import datetime, timezone
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

logger = logging.getLogger(__name__)

# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f0b2d9'
down_revision: Union[str, Sequence[str], None] = 'ecba9801b98a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _parse_stored(value) -> datetime | None:
    """把库里存的到期时间读成一个不带时区的 UTC 时刻。

    存法不统一是这个函数存在的全部理由：走 SQLAlchemy 写入的是
    '2026-09-08 00:00:00.000000+00:00'，手工修过的数据可能是 '2026-09-08 00:00:00'。
    路由那边判过期时把不带时区的值当 UTC（shares._is_expired），这里跟它同一套口径。
    读不出来的按"已过期"处理——判不了就不偷偷公开，这个方向上宁可保守。
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        raw = str(value).strip().replace("Z", "+00:00").replace("/", "-")
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def upgrade() -> None:
    op.add_column('shares', sa.Column('key_points', sa.JSON(), nullable=True))
    op.add_column('shares', sa.Column('source_url', sa.String(length=1000), nullable=True))

    # 存量分享立刻补齐：不然老海报扫开来仍然只有摘要，等于这次修的东西只对新用户生效。
    # 用相关子查询而不是 UPDATE...FROM，SQLite 老版本没有后一种写法。
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE shares SET key_points = ("
        "  SELECT notes.key_points FROM notes WHERE notes.id = shares.note_id)"
        " WHERE EXISTS (SELECT 1 FROM notes WHERE notes.id = shares.note_id)"
    ))
    conn.execute(sa.text(
        "UPDATE shares SET source_url = ("
        "  SELECT notes.source_url FROM notes WHERE notes.id = shares.note_id)"
        " WHERE EXISTS (SELECT 1 FROM notes WHERE notes.id = shares.note_id)"
    ))

    # 按上线这一刻切两半：还没到期的转成"永久有效，直到用户主动撤掉"；
    # 已经到期的（以及读不出时间的）明确关闭，不借这次上线复活。
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    keep_open, close_off = [], []
    for share_id, expires_at in conn.execute(sa.text(
        "SELECT id, expires_at FROM shares WHERE expires_at IS NOT NULL"
    )):
        when = _parse_stored(expires_at)
        (keep_open if when and when > now else close_off).append(share_id)

    if keep_open:
        conn.execute(
            sa.text("UPDATE shares SET expires_at = NULL WHERE id = :i"),
            [{"i": i} for i in keep_open],
        )
    if close_off:
        conn.execute(
            sa.text("UPDATE shares SET is_active = 0 WHERE id = :i"),
            [{"i": i} for i in close_off],
        )
    logger.info(
        "分享有效期改语义：转永久 %d 条，关闭上线时已过期的 %d 条",
        len(keep_open), len(close_off),
    )

    # 一张笔记只留最新那张开着的码，剩下的关掉留档——建唯一索引前必须先清干净，
    # 否则索引建不上，这次迁移会直接失败。
    conn.execute(sa.text(
        "UPDATE shares SET is_active = 0 "
        "WHERE is_active = 1 AND id < ("
        "  SELECT MAX(s2.id) FROM shares s2 "
        "  WHERE s2.note_id = shares.note_id AND s2.is_active = 1)"
    ))
    op.create_index(
        'ux_shares_one_active_per_note', 'shares', ['note_id'],
        unique=True, sqlite_where=sa.text('is_active = 1'),
    )


def downgrade() -> None:
    op.drop_index('ux_shares_one_active_per_note', table_name='shares')
    # expires_at 清掉的时间和被关掉的旧码都回不来： downgrade 只把两列拿掉。
    # 真要走这条路，先确认现网 shares 行数——这批语义变化没有可逆表达。
    with op.batch_alter_table('shares') as batch_op:
        batch_op.drop_column('source_url')
        batch_op.drop_column('key_points')
