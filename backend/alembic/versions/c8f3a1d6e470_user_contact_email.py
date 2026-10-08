"""users 加 contact_email：把"用户能填自己的联系邮箱"这项账号能力补上

Revision ID: c8f3a1d6e470
Revises: b4e9c2a7f510
Create Date: 2026-10-08 09:50:00.000000

起因是送审那段描述里写了"新增账号能力：邮箱换址"，而 10-08 核对代码发现**包里根本没有这一项**：
`77a34a0` 那次改的是**开发者自己的反馈邮箱地址**（`utils/contact.js` 那一行），不是用户能填的字段，
`users` 表当时也没有任何邮箱列。站长 10-08 的口径是"把用户账号能力补上"，这一条就是那件事的库面。

只加一列、可空、无默认值——**不填就是 null，界面上那一行显示"未填写"，功能一处都不受影响**。
这条是 2.0 与线上 1.x 兼容契约的第一条（只加列不动老列老语义，见 docs/方案-2.0大版本.md §2 甲）：
老包读不到这一列也照样跑得动，因为它根本不看它。

为什么收这一格：openid 从不下发到客户端、也不给用户看（见 [[wtsj-jwt-auth-architecture]]），
所以用户来信要求查阅/更正/注销时，**没有任何办法把那封来信对上库里哪个账号**。这一格就是那座桥。
它不进任何公开响应（`routes/shares.py` 那份 `LIVE_PUBLIC_FIELDS` 白名单里没有它），
只有带着本人 token 的那两个接口读得到。

downgrade 用 batch_alter_table：SQLite 上 DROP COLUMN 要走重建表那条路。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c8f3a1d6e470'
down_revision: Union[str, Sequence[str], None] = 'b4e9c2a7f510'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('contact_email', sa.String(254), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('contact_email')
