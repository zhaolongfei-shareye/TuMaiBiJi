"""source_blocklist：把"这个站点我们读不到"从一句临时话变成一条能攒数的账

Revision ID: f0a3b9c6d172
Revises: c7d1e4a9f380
Create Date: 2026-10-18 23:40

规格正本 `docs/规格-来源黑名单.md`（站长 10-18 那条：提取失败 3 次以上自动进黑名单，
管理员可看可手工增删，提取前先查）。这张表非建不可的理由在规格 §二，两条现网事实：
失败今天完全不落库（任务态只在 Redis、`TASK_TTL = 3600`），而 `jobs` 表全仓零写入。

⚠ **这一条挂在曾经没跑的 `c7d1e4a9f380` 之后**，而那条又挂在 `b4e8a1c7d205` 之后。
Alembic 只能顺着链走，所以"只跑我自己这条"做不到不带上那两条。部署这一刀怎么切是规格 §七 那三选一，
**站长 10-18 点的是丙＝只落码不部署**；10-19 00:3x 他一句「先跑那三笔迁移」⇒
**这三笔（含本条）已在现网跑掉，`current` ＝ `f0a3b9c6d172`**（台账 §8.320：回退点
`wtsj-20261019-003049.sqlite.gz`、恢复演练通过、九张表行数与两枚 categories 索引逐条对齐）。
⚠ 但**跑掉的只是库**：读这张表的那八份代码当天还没部署，所以这条功能今天仍未生效——
"表在现网"与"这条链上线"是两件事，不许拿前者当后者。
代码那边也备好了反过来的那一格：worker 查黑名单读不出来时按"没拦"处理、只大声记日志
（见 `app/tasks/ingest_tasks.py` 里 `_blocked()`）——这一条链坏掉不该让所有链接提取一起失败。

`fail_count` 给了 `server_default='0'`（照 `7c3f1a90d2b4` 给 `quota_bonus` 那一刀的同一种写法）：
计数这一栏最不该出现的状态是"空"，SQLite 里 `NULL + 1` 还是 `NULL`，一次静默就把这台机器的
累计能力抹掉了。`source` 反过来**不给** server_default：每一次写入都在服务层、值总是显式给的，
而字符串 DEFAULT 反射回来的引号写法与元数据对不对得上是另一回事（仓里没有任何字符串栏用它）。

downgrade 只删表：这张表里没有任何用户内容，也没有任何不可再生成的东西——
账没了就是重新从零数，这正是"撤掉这个功能"的字面意思。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f0a3b9c6d172'
down_revision: Union[str, Sequence[str], None] = 'c7d1e4a9f380'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'source_blocklist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('host', sa.String(length=253), nullable=False),
        sa.Column('fail_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('last_status', sa.Integer(), nullable=True),
        sa.Column('last_failed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source', sa.String(length=8), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_source_blocklist_id', 'source_blocklist', ['id'])
    # 与模型里 `Index("ux_source_blocklist_host", "host", unique=True)` 一字不差：
    # 一台主机一行是这张表的全部身份，两个同名行等于"累计 3 次"这件事没有定义。
    op.create_index('ux_source_blocklist_host', 'source_blocklist', ['host'], unique=True)


def downgrade() -> None:
    op.drop_index('ux_source_blocklist_host', table_name='source_blocklist')
    op.drop_index('ix_source_blocklist_id', table_name='source_blocklist')
    op.drop_table('source_blocklist')
