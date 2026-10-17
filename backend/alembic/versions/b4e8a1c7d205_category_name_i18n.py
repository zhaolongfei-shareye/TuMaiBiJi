"""categories 两列显示值：name_zh / name_en（中／英各一档，都可空）

Revision ID: b4e8a1c7d205
Revises: e3a7c91b4f26
Create Date: 2026-10-17 18:2x

站长 10-17：「分类要支持自动翻译，就是分类名称是中文，切换英文，自动翻译，分类是英文，
切换中文，也是自动翻译。如果翻译不了，就维持原文。」拍定的口径是"词表优先、表外才叫混元"，
实现与三条规矩写在 app/services/category_names.py 的文件头。

两列都可空，**空不是失败**：那一档没译名时客户端回落到 `name`，屏上显示他原来打的字。
所以这里不需要 backfill，也不需要给存量行填默认值——存量格子在下一次被编辑时自然补上。

`name` 那一列一个字节没动：它仍是身份判据（重名、私密那道锁都看它），译文只进这两列。

⚠ downgrade 会丢的是"译名"这一档显示值，不丢他的分类本身（`name` 留着），
所以撤这一列是可逆的：撤完界面全部回显原文，再上回来重新补译即可。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4e8a1c7d205'
down_revision: Union[str, Sequence[str], None] = 'e3a7c91b4f26'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('categories') as batch:
        batch.add_column(sa.Column('name_zh', sa.String(length=100), nullable=True))
        batch.add_column(sa.Column('name_en', sa.String(length=100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('categories') as batch:
        batch.drop_column('name_en')
        batch.drop_column('name_zh')
