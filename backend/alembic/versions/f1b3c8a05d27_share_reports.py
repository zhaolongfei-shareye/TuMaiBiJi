"""share_reports：落地页「举报这篇」的落库表

Revision ID: f1b3c8a05d27
Revises: a9d3e5c7f218
Create Date: 2026-10-08 21:55

公开分享一上线，Apple 审核指南 1.2 那句"App 能把内容公开分发给其他用户，就必须提供
举报、屏蔽、内容过滤，并且有实际处理流程"就从"我们没这个功能所以不适用"变成必须兑现的承诺。
"有入口"的证据是一张能按类型计数、能排序处理先后的表，不是页面上一个 `mailto:` 链接——
所以这张表必须存在，而且 reason 是固定四选一的短列（spam / abuse / infringement / other），
自由文本另开一列。

只挂 token、不建外键：撤掉的码也要收得到举报。撤掉之后才涌进来的举报恰恰说明"撤晚了"，
那种时候把行删了等于把证据也删了。

`hidden` 这一列先建出来但**不由第一份举报自动置真**：任何人点一次就能让别人的公开页消失，
那是把审核权发给了全体访客。置真的动作留给人工（或将来一条阈值规则），列在这里是为了
让"先隐藏待核、不是先删"这句话有一个落点。

`reporter_bucket` 存的是按天轮换的加盐哈希，不是 IP 明文：够防同一个人反复刷同一篇，
又不至于让一张举报表单变成收集访客地址的地方。

downgrade 直接 drop：这张表里没有用户内容，只有举报记录，回滚点之前根本没有公开页，
不会有东西在等它。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f1b3c8a05d27'
down_revision: Union[str, Sequence[str], None] = 'a9d3e5c7f218'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'share_reports',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('token', sa.String(100), nullable=False),
        sa.Column('reason', sa.String(32), nullable=False),
        sa.Column('detail', sa.Text(), nullable=True),
        sa.Column('reporter_bucket', sa.String(64), nullable=True),
        sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # 三条索引与模型里那三个 index=True 一字不差。`test_alembic升级后的库和模型一字不差`
    # 会把"用例走 create_all、线上走 alembic"这两条路对着数一遍，差一个索引它就红——
    # 而它红的那个后果是"测试全绿、线上第一条写入报 no such column"。
    op.create_index('ix_share_reports_id', 'share_reports', ['id'])
    op.create_index('ix_share_reports_token', 'share_reports', ['token'])
    op.create_index('ix_share_reports_reason', 'share_reports', ['reason'])


def downgrade() -> None:
    op.drop_index('ix_share_reports_reason', table_name='share_reports')
    op.drop_index('ix_share_reports_token', table_name='share_reports')
    op.drop_index('ix_share_reports_id', table_name='share_reports')
    op.drop_table('share_reports')
