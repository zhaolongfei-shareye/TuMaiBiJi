"""link_codes：一次性 6 位短码

Revision ID: c54bfb242620
Revises: e8c1a47b2d35
Create Date: 2026-10-09 10:36:27.325840

契约 §二 那四步关联（iPhone 生成 6 位码 → 用户去小程序念 → 服务端把两条 identity 归到
一个 account → 两侧 token 全部作废）里，短码是**唯一**能在两端之间传的一句话，所以它
必须满足三件事：短（人能敲）、只有效一次、库里看不出原文。DDL 本身不表达这三条，
它们全部落在 `app/services/link_codes.py`：`code_hash` 存 HMAC-SHA256（为什么不是裸哈希，
见 `app/models/link_code.py`）、`used_at` 用一道条件 UPDATE 占住、过期时间在 Python 里比。

这一份是 `alembic revision --autogenerate` 生成的原样 DDL，只改了 docstring 与说明。
保持原样是有原因的：`tests/test_quota_and_invite.py::test_alembic升级后的库和模型一字不差`
那条尺子比的是"两边对得上"，而 `code_hash` 上那道 `unique=True` 恰好是 autogen 从模型的
`Column(unique=True, index=True)` 翻出来的**一条具名唯一索引**——手写很容易写成表级
UNIQUE 约束，那种形状 SQLite 事后加不了、比也比不出来（10-09 这一轮就为这事红过一次）。

`account_id` 不建外键，`users.account_id` 那张先例同上：写口只有一处。删账号那一路
（`DELETE /v1/account`，下一批）负责把死账号留下的码一起带走；`services/linking.merge_into`
已经在合并时删掉被并掉那条 account 的码，不让它还能被 redeem 第二次。

downgrade 直接删表：这张表里的行全是十几分钟就作废的一次性凭证，没有一样是别人推不出来的。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c54bfb242620'
down_revision: Union[str, Sequence[str], None] = 'e8c1a47b2d35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('link_codes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code_hash', sa.String(length=64), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_link_codes_account_id'), 'link_codes', ['account_id'], unique=False)
    op.create_index(op.f('ix_link_codes_code_hash'), 'link_codes', ['code_hash'], unique=True)
    op.create_index(op.f('ix_link_codes_id'), 'link_codes', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_link_codes_id'), table_name='link_codes')
    op.drop_index(op.f('ix_link_codes_code_hash'), table_name='link_codes')
    op.drop_index(op.f('ix_link_codes_account_id'), table_name='link_codes')
    op.drop_table('link_codes')
