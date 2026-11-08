"""MIND 改口径：笔记不限量，转存加分从"一篇一次"改成"这篇 × 这个人一次"

Revision ID: e5a7c1d9b420
Revises: d3f8a1c4b9e7
Create Date: 2026-10-01 01:10:04

口径（2026-10-01 站长改定，原话"拆掉后端100篇，不同用户转存都加分，但同一个用户只算一次。
其他的照常。积分规则，可以在官网公布，小程序不需要"）：
- 100 篇那道硬闸门撤掉，笔记不限量；100 变成 MIND 的起始值。
  闸门本身在应用层（`quota.ensure_room` 和它的三个入口依赖），这次一起删掉，
  所以这一迁移只动台账的约束。
- 动笔首篇 +10 不变：一个人一辈子只成就一次。
- 转存改成 **+1，且不同用户各算一次**。原来是"同一篇笔记一辈子只挣一次"，
  那样一篇热门笔记发给一百个人转存作者只得 1 分，跟"不同用户转存都加分"这句话
  对不上；所以唯一约束从 `source_note_id` 单列换成 `(source_note_id, invitee_id)` 复合。
  同时转存那条不再要求对方是新用户。

约束怎么换：老规矩 `invitee_id` 上那条全局 UNIQUE 会把"同一个人先动笔、后来又替别人
转存"这种行挡掉（他名下已经有一行台账了），所以拆成两条部分唯一索引，按
`source_note_id` 空不空分界——空行只管动笔、非空行只管转存。

历史行不用回填：动笔那一路本来就留空、转存那一路本来就非空，两条新索引读到的
就是原来那两拨行；而且老约束比新约束更严（全局唯一 ⊂ 空行唯一，单列唯一 ⊂ 复合唯一），
所以现存数据不可能撞新索引。

downgrade 会把老约束装回去，但如果这段时间已经产生了"同一个人两笔账"或"同一篇多个
人来转存"，那一步会直接失败——这是有意的：口径退回去本来就要先清掉多出来的那些行。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e5a7c1d9b420'
down_revision: Union[str, Sequence[str], None] = 'd3f8a1c4b9e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ux_invitations_one_reward_per_source_note', table_name='invitations')
    # SQLite 不能直接 ALTER 掉表级 UNIQUE，batch 模式会反射整张表、重建一份不带这条约束的
    with op.batch_alter_table('invitations') as batch:
        batch.drop_constraint('uq_invitations_invitee', type_='unique')
    op.create_index(
        'ux_invitations_first_note_per_invitee',
        'invitations',
        ['invitee_id'],
        unique=True,
        sqlite_where=sa.text('source_note_id IS NULL'),
    )
    op.create_index(
        'ux_invitations_import_once_per_pair',
        'invitations',
        ['source_note_id', 'invitee_id'],
        unique=True,
        sqlite_where=sa.text('source_note_id IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ux_invitations_import_once_per_pair', table_name='invitations')
    op.drop_index('ux_invitations_first_note_per_invitee', table_name='invitations')
    with op.batch_alter_table('invitations') as batch:
        batch.create_unique_constraint('uq_invitations_invitee', ['invitee_id'])
    op.create_index(
        'ux_invitations_one_reward_per_source_note',
        'invitations',
        ['source_note_id'],
        unique=True,
        sqlite_where=sa.text('source_note_id IS NOT NULL'),
    )
