"""account_passwords：口令登录（零外部付费依赖的那一条）

Revision ID: a3c9e7f1b482
Revises: d8a3f1c60b47
Create Date: 2026-11-13 20:00:11.775358

站长 11-12「去搞登录吧，免费的技术方案」。为什么是口令而不是把短信/邮件那两枝修通：
现网 `.env` 里 `SMS_*` 与 `EMAIL_*` 两组凭据一行都没有，短信要钱、邮件要发信域名与送达率。
口令这一路零外部依赖、零新增 pip 包（scrypt 在标准库里），今天就能登进去。

这张表挂 **account** 而不是 `users`：口令是账号的登录方式，不是某一行登录行的属性。
`account_id` 上那道**唯一**索引 = 一个账号最多一枚口令；它同时是"死账号不许占着登录名"
那条判据的落点（`services/deletion.purge` 必须把这一行一起带走，否则同一个人拿同一个
登录名重新注册时 `passwords.create` 当场 IntegrityError）。

`recovery_hash` 存 HMAC-SHA256 而不是裸哈希，理由与 `link_codes.code_hash` 同型但更要紧：
这一路没有发信通道，恢复码是忘记密码之后**唯一**的入口，所以它是长期有效的 80 位随机串，
不是 15 分钟就作废的 6 位短码。裸哈希遇到库泄漏就能离线跑穿。

`failed_count` / `locked_until` 是按账号的失败闸（10 次连错锁 15 分钟）。落在库里而不是
Redis：它必须跟着账号走，且进程重启不能清零。

DDL 是 `alembic revision --autogenerate` 生成的原样，只改了 docstring 与说明——
`tests/test_quota_and_invite.py::test_alembic升级后的库和模型一字不差` 比的是"两边对得上"，
而 `account_id` 上那道 unique=True 恰好是 autogen 从模型的 `Column(unique=True, index=True)`
翻出来的一条**具名唯一索引**；手写成表级 UNIQUE 约束那种形状 SQLite 事后加不了、也比不出来。

downgrade 直接删表：删掉之后口令登录这一路整体失效，但微信/游客/手机号那几枝一个字都不受影响
（它们不读这张表），所以回滚不需要搬数据。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3c9e7f1b482'
down_revision: Union[str, Sequence[str], None] = 'd8a3f1c60b47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('account_passwords',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('account_id', sa.String(length=36), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('recovery_hash', sa.String(length=64), nullable=False),
    sa.Column('failed_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_account_passwords_account_id'), 'account_passwords', ['account_id'], unique=True)
    op.create_index(op.f('ix_account_passwords_id'), 'account_passwords', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_account_passwords_id'), table_name='account_passwords')
    op.drop_index(op.f('ix_account_passwords_account_id'), table_name='account_passwords')
    op.drop_table('account_passwords')
