"""notes.share_copy_key：给「同一人对同一篇只留一份」那道闸补一层数据库兜底

10-25 第八轮审计 M6。原来那道闸（`routes/notes.py` 的 `_find_share_import_copy`）是先查后写：
两个请求真同时进来（同步路由跑在线程池里，确实会并发），各自都在对方落库前查了一遍"存过没有"、
都查不到，于是都往下建 ⇒ 名下同一篇多一行、外加最多九行重复配图，而那正是站长这句话要挡的冗余。

索引做成**部分唯一**、吃的是一枚新写的字符串栏，两条理由都是硬的：

1. 现网存量里已经有一对"同一人同一篇两行"（那道闸 10-25 13:40 才上线，上线之前实测就是每点一次
   `+1` 行）。把唯一索引直接建在 `imported_from` 的 JSON 路径上会**当场建不上**，这次迁移就失败——
   而迁移失败的那一趟部署会把整站挡在 `alembic upgrade head` 那一步。
2. 把那些行删掉属于"删用户的笔记"，不是这一趟该顺手做的事（要删得单独过他一句，走备份→逐行→复量，
   与 §8.466 那一次清洗同一个走法）。

所以老行在这一栏留 NULL（不进索引、一行都不动），从这一趟起写的每一行都带着键、由索引兜住。
判"同一篇"的口径与闸同一处：都认**原笔记 id**，不认 `share_token`（作者撤回再分享会换新码）。

⚠ 与既有那两枚唯一索引的分工：`invitations.ux_invitations_import_once_per_pair` 管的是"分只结一次"，
这一枚管的是"副本只留一份"。缺这一枚时，前者只能保证分数不许多，挡不住笔记多。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd3a86f1c75b4'
down_revision: Union[str, Sequence[str], None] = 'c9f2a6d4e831'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('notes', sa.Column('share_copy_key', sa.String(length=120), nullable=True))
    op.create_index(
        'ux_notes_one_share_copy_per_user',
        'notes',
        ['share_copy_key'],
        unique=True,
        sqlite_where=sa.text('share_copy_key IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('ux_notes_one_share_copy_per_user', table_name='notes')
    # 这一栏是从 `imported_from` 里搬出来的一个判据，删掉不丢任何一份笔记内容；
    # 但老行那批 NULL 从来就没被写过键，回滚后与建索引前一字不差。
    with op.batch_alter_table('notes') as batch:
        batch.drop_column('share_copy_key')
