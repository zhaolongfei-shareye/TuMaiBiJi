"""分享带上作者昵称，转存进来的笔记钉住来源

Revision ID: b7d2f4a9c316
Revises: a1c4e7f0b2d9
Create Date: 2026-09-24 15:20:04.118027

两列都是"加列 + 可为空"，没有回填也没有语义翻转：老行读出来就是没有作者、
不是转存来的，前端遇到空值就不显示那一行，这是唯一正确的降级方向。

- `shares.author_name`：分享者在「分享形象」里填的名字。它此前只存在他自己手机的
  storage 里，服务器一无所知；现在在他主动建分享的那一刻，作为公开快照的一部分上服务器。
  所以它和 title/summary 同性质——是用户自己选择公开的内容，不是我们采集的账号资料。
- `notes.imported_from`：从别人分享页转存进来的那条笔记的来源信息。路由那边
  NoteCreate / NoteUpdate 两个模型都不含这一列，所以编辑接口碰不到它，转存之后
  来源改不掉；原分享被撤掉或删掉也不影响这一份副本。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7d2f4a9c316'
down_revision: Union[str, Sequence[str], None] = 'a1c4e7f0b2d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('shares', sa.Column('author_name', sa.String(length=32), nullable=True))
    op.add_column('notes', sa.Column('imported_from', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('notes') as batch:
        batch.drop_column('imported_from')
    with op.batch_alter_table('shares') as batch:
        batch.drop_column('author_name')
