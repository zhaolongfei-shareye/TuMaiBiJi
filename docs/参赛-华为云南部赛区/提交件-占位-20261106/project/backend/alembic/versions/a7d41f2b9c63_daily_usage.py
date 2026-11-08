"""daily_usage：每人每天的花费计数（10-25 第八轮审计 M33）

一句话：这一条链上一天花多少钱，此前屏上没有任何一个数，而分钟闸挡不住"一天里陆陆续续打满"。
站长拍的档位＝提炼每人每天 50 条、内容检查每人每天 200 次；计数必须**落库**，因为本服务是
api＋worker 两只 unit、多进程，进程内的 dict 在两只进程里各记一半，谁都不知道总数。

三栏的口径、为什么用东八区日历日、为什么超了是拒不是放行，全写在
`app/models/daily_usage.py` 与 `app/services/daily_budget.py` 的文件头，这里不重复一份。

唯一索引 `ux_daily_usage_user_day_kind` 是 `services/daily_budget.py:_upsert` 那句
`INSERT … ON CONFLICT DO UPDATE` 的依赖：索引不在，那条 upsert 就退化成"每次都插新行"，
限额**形同不存在而不报错**。所以本文件的 downgrade 只删表，upgrade 里索引与表一起建，
`deploy.sh` 迁移后的列自检之外，`tests/test_日量闸.py` 里钉了一条"这枚索引真在库里"。

老数据：这张表没有历史包袱（新表），也不参与任何既有查询，删用户时不清它也不影响正确性。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7d41f2b9c63'
down_revision: Union[str, Sequence[str], None] = 'd3a86f1c75b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'daily_usage',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('day', sa.String(length=10), nullable=False),
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('count', sa.Integer(), server_default=sa.text('0'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_daily_usage_id', 'daily_usage', ['id'], unique=False)
    op.create_index(
        'ux_daily_usage_user_day_kind',
        'daily_usage',
        ['user_id', 'day', 'kind'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('ux_daily_usage_user_day_kind', table_name='daily_usage')
    op.drop_index('ix_daily_usage_id', table_name='daily_usage')
    op.drop_table('daily_usage')
