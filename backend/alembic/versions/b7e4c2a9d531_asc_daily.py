"""asc_daily：Apple App Store Connect 每日读数（「iPhone 数据」那一栏）

Revision ID: b7e4c2a9d531
Revises: a3c9e7f1b482
Create Date: 2026-11-16

站长 11-16「你帮我做到后台，你开工吧」——把 ASC 的日报（下载/安装删除/会话设备/收入）
拉进我们自己的库、后台那一栏直接读表，不再依赖打开 ASC 网页看数。

这张表是**拉的账**，不是业务数据：Apple 是"有数才有行"，所以全部数字列 nullable
（缺数念"—"不补 0）；`ux_asc_daily_report_date` 一天一行，重复拉同一遍按它幂等 upsert。

downgrade 直接删表：删掉后那一栏回到"没数"，Apple 那头的原始数据随时可以重拉回来
（analytics 实例 35 天内、sales 30 天内都在），所以回滚不需要搬任何真东西。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e4c2a9d531'
down_revision: Union[str, Sequence[str], None] = 'a3c9e7f1b482'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'asc_daily',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('report_date', sa.String(length=10), nullable=False),
        sa.Column('downloads', sa.Integer(), nullable=True),
        sa.Column('updates', sa.Integer(), nullable=True),
        sa.Column('redownloads', sa.Integer(), nullable=True),
        sa.Column('installs', sa.Integer(), nullable=True),
        sa.Column('deletes', sa.Integer(), nullable=True),
        sa.Column('sessions', sa.Integer(), nullable=True),
        sa.Column('unique_devices', sa.Integer(), nullable=True),
        sa.Column('proceeds_usd', sa.Float(), nullable=True),
        sa.Column('proceeds_currency', sa.String(length=8), nullable=True),
        sa.Column('payload', sa.Text(), nullable=True),
        sa.Column('sales_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('analytics_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_asc_daily_id', 'asc_daily', ['id'])
    op.create_index('ux_asc_daily_report_date', 'asc_daily', ['report_date'], unique=True)


def downgrade() -> None:
    op.drop_index('ux_asc_daily_report_date', table_name='asc_daily')
    op.drop_index('ix_asc_daily_id', table_name='asc_daily')
    op.drop_table('asc_daily')
