"""assets 加 sort_order（一篇之内那几张配图的先后）

Revision ID: a4d7e2b91c58
Revises: f0a3b9c6d172
Create Date: 2026-10-19 21:40:11.204871

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a4d7e2b91c58'
down_revision: Union[str, Sequence[str], None] = 'f0a3b9c6d172'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='0' 是 SQLite 的硬要求（ADD COLUMN 的默认值必须是常量表达式），
    # 而 0 这一档本身有含义：**从没手动排过**。存量行全落 0 ⇒ 排序第一档处处相等
    # ⇒ 退回 `id` 升序＝这一刀之前的样子，老笔记的头图一张都不会换。
    # 不写 server_default 的话老行是 NULL，而 `NULL` 在 ORDER BY 里排最前（SQLite）／最后（MySQL），
    # 等于给每一篇老笔记随机换头图——`not_failed()` 那份注释钉的就是同一型坑（NULL 不是"和别人一样"）。
    op.add_column(
        'assets',
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    with op.batch_alter_table('assets') as batch_op:
        batch_op.drop_column('sort_order')
