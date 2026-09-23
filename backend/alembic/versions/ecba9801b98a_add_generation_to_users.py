"""users 加 generation（账号代数）

Revision ID: ecba9801b98a
Revises: 7c3f1a90d2b4
Create Date: 2026-09-22 23:10:44.334232

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ecba9801b98a'
down_revision: Union[str, Sequence[str], None] = '7c3f1a90d2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default='1' 是 SQLite 的硬要求：ADD COLUMN 的默认值必须是常量表达式。
    # 存量用户全部落到第 1 代，和登录时 _create_token(user.id, user.generation) 对得上，
    # 已经发出去的 token 里没有 gen 字段、按 1 处理，所以这次上线不会逼人重新登录。
    op.add_column('users', sa.Column('generation', sa.Integer(), nullable=False, server_default='1'))


def downgrade() -> None:
    # SQLite 不支持 DROP COLUMN，alembic 要靠 batch_alter_table 重建表——和 7c3f1a90d2b4 一个写法。
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('generation')
