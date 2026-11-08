"""转存也能激活邀请奖励，于是台账要记清是哪篇笔记带来的

Revision ID: c9e4b1a7d532
Revises: b7d2f4a9c316
Create Date: 2026-09-24 22:20:11

口径（2026-09-24 定，站长原话"100篇基础+分享好友，好友发一篇即可激活，基础增加10篇"
"其他朋友如果是新用户，只要转存你的笔记也可以加10篇，但每篇笔记只能加一次"）：
- 每人 100 篇基础，通过分享带来一个新写作者给 +10，**不限带来几个人**；
- 新写作者既可以是自己动笔写下第一篇，也可以是直接把别人那篇转存进自己库里；
- 走转存这一条时，同一篇笔记只给作者挣一次。

所以 `invitations` 要能回答"这笔账是哪篇笔记带来的"。加一列可空的
`source_note_id` + 一个只钉住非空行的部分唯一索引：动笔那一路没有"哪篇笔记"可指，
留空、不受约束；转存那一路重复第二次插同一篇时由数据库直接挡下，不靠应用层记得住。

历史行（包括 09-24 那段"不限量"窗口里 reward=0 记下的）不回填：那些行没有源笔记，
读出来就是 null，与动笔那一路同形。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c9e4b1a7d532'
down_revision: Union[str, Sequence[str], None] = 'b7d2f4a9c316'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('invitations', sa.Column('source_note_id', sa.Integer(), nullable=True))
    op.create_index(
        'ux_invitations_one_reward_per_source_note',
        'invitations',
        ['source_note_id'],
        unique=True,
        sqlite_where=sa.text('source_note_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ux_invitations_one_reward_per_source_note', table_name='invitations')
    with op.batch_alter_table('invitations') as batch:
        batch.drop_column('source_note_id')
