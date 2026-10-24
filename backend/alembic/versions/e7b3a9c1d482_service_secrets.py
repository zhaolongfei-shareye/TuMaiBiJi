"""service_secrets：把"换一把凭据 = 改 .env + 重启"变成"后台填一次就生效"

Revision ID: e7b3a9c1d482
Revises: d8c4a2f6b913
Create Date: 2026-10-25 00:40

成因站长 10-24 那两句：「密钥配置功能请加到cn的官网后台，我自己去加」、「配置功能放错地方了，
你放在图麦克，应该放在图麦笔记下面进行配置」。字段口径与三条纪律（值只进不出 / 库里只是覆盖层 /
读侧不许抛）写在 `app/models/service_secret.py` 与 `app/services/service_secrets.py` 的文件头。

这张表**一行都不预建**（与 `mp_settings` 相反）：那一页要区分「发布过、现在停用」和
「还没登记过」，所以必须显式补空行；而这里"没这一行"与"这一行是空的"是同一件事
——都等于"用 .env 的值"，`resolve()` 对两者的行为一字不差。预建一批空行只会多出第二份真相。

⚠ downgrade 删表之前先想清楚：删掉的是"覆盖层"，`.env` 里那几行还在，服务照旧起得来。
但如果有人已经只用后台在管凭据、`.env` 里留的是旧值，删表的那一刻线上就会退回旧值——
真要回退，先手工把 `.env` 核对一遍再跑这条 downgrade。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e7b3a9c1d482'
down_revision: Union[str, Sequence[str], None] = 'd8c4a2f6b913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'service_secrets',
        sa.Column('name', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('note', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('name'),
    )


def downgrade() -> None:
    op.drop_table('service_secrets')
