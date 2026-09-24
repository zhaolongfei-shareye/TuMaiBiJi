"""shares 快照补 key_points / source_url，并取消已发出去的码的过期时间

Revision ID: a1c4e7f0b2d9
Revises: ecba9801b98a
Create Date: 2026-09-24 01:20:11.884320

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c4e7f0b2d9'
down_revision: Union[str, Sequence[str], None] = 'ecba9801b98a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    # 码是印在纸上的，一周后失效没道理。旧行上那个 7 天时间戳一并清掉。
    conn.execute(sa.text("UPDATE shares SET expires_at = NULL WHERE expires_at IS NOT NULL"))


def downgrade() -> None:
    # expires_at 清掉的数据回不来，这里只把列拿掉；旧值本来就是"会失效"，不是要保的东西。
    with op.batch_alter_table('shares') as batch_op:
        batch_op.drop_column('source_url')
        batch_op.drop_column('key_points')
