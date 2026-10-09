"""accounts / auth_identities：把「人」从「某个平台的 id」里拆出来

Revision ID: b7d2f4a1c903
Revises: f1b3c8a05d27
Create Date: 2026-10-09 02:40

站长 2026-10-09 拍的「甲」＝落地 `待决策清单-20260927.md` 条目 5 那句
「决定：认。iPhone 只做 SIWA，微信关联放小程序侧、一次性短码互绑」（那条 2026-09-27 就批了）。
这一条是它的第一步：先把「人」这张表立起来，SIWA 那个登录口才有的可插。

为什么现在就动表而不是等 iPhone 那天：`users.openid` 是 `unique=True, nullable=False`。
一个只有 Apple 身份的人填不出这串，硬填等于替别人编一个微信 id；而反过来只要让某个平台的 id
当业务主键往外走，加第二种登录方式时所有历史数据都要搬家。`accounts.id` 是自家 UUID 之后，
多一种登录只是往 `auth_identities` 插一行 —— 这是 `跨端账号与同步长期路线.md` 锚点 1 的原话。

回填那句 `where account_id is null` 让这一步可以重跑：半途失败不会留下
「一半有 account、一半没有」的库，而那种库比整体没迁更难查。
`verified_at` 一起给上 CURRENT_TIMESTAMP：这些人的 openid 本来就是 code2session 换回来的，
属于「平台确认过」；留 null 会把他们显示成绑了没验。

`users.account_id` 故意**不建外键**：给一张有 live 数据的 users 表加带 FK 的列，SQLite 要重建
整张表（这份迁移里的 downgrade 就正在走 batch_alter_table 那条重建路），而这道约束的写口只有一处
（`app/services/accounts.py::ensure_for_user`）。同仓先例：`share_reports.token` 也只挂 token 不建 FK。

downgrade 先删子表再删父表；users 那一列走 batch——与 `c8f3a1d6e470_user_contact_email.py` 同一条理由。
"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7d2f4a1c903'
down_revision: Union[str, Sequence[str], None] = 'f1b3c8a05d27'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'accounts',
        sa.Column('id', sa.String(36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'auth_identities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.String(36), nullable=False),
        sa.Column('provider', sa.String(16), nullable=False),
        sa.Column('provider_uid', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    # 与模型里那几个 index=True 一字不差；`test_alembic升级后的库和模型一字不差` 会逐条数，
    # 它红的后果不是"测试难看"，是"测试全绿而线上第一条写入报 no such column"。
    op.create_index('ix_auth_identities_id', 'auth_identities', ['id'])
    op.create_index('ix_auth_identities_account_id', 'auth_identities', ['account_id'])
    # 命名唯一索引而不是表级 UNIQUE 约束：SQLite 上 ALTER TABLE 加不了后者，
    # 而这条要说的话和 `ux_shares_one_active_per_note` 是同一族。
    op.create_index('ux_identity_provider_uid', 'auth_identities',
                    ['provider', 'provider_uid'], unique=True)

    op.add_column('users', sa.Column('account_id', sa.String(36), nullable=True))
    op.create_index('ix_users_account_id', 'users', ['account_id'])

    conn = op.get_bind()
    for (user_id, openid) in conn.execute(sa.text(
        "select id, openid from users where account_id is null order by id"
    )).fetchall():
        account_id = str(uuid.uuid4())
        conn.execute(sa.text("insert into accounts (id) values (:i)"), {"i": account_id})
        conn.execute(
            sa.text("insert into auth_identities (account_id, provider, provider_uid, verified_at) "
                    "values (:a, 'wechat', :o, CURRENT_TIMESTAMP)"),
            {"a": account_id, "o": openid},
        )
        conn.execute(sa.text("update users set account_id = :a where id = :i"),
                     {"a": account_id, "i": user_id})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from auth_identities"))
    conn.execute(sa.text("delete from accounts"))
    op.drop_index('ix_users_account_id', table_name='users')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('account_id')
    op.drop_index('ux_identity_provider_uid', table_name='auth_identities')
    op.drop_index('ix_auth_identities_account_id', table_name='auth_identities')
    op.drop_index('ix_auth_identities_id', table_name='auth_identities')
    op.drop_table('auth_identities')
    op.drop_table('accounts')
