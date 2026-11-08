"""generation_seq：把"这张代表发过哪些代次"从内存搬进库里

Revision ID: b71f4e0c9d52
Revises: c54bfb242620
Create Date: 2026-10-10 00:52:00.000000

要修的那一条洞是实测出来的，不是推演的。现网只读查 `wtsj.db`（2026-10-09 23:44）：35 行 `users`、
`min(id)=1 / max(id)=41`、`min(generation)=1 / max(generation)=39`，建表语句是 `id INTEGER NOT NULL`
（**没有 AUTOINCREMENT**，`sqlite_sequence` 那张表根本不存在）——也就是说 SQLite 会把删掉的行号
**还给下一个人**。而 `login_or_register` 原来给新人取的号是 `max(users.generation) + 1`：`users` 被
`DELETE /v1/account` 删空过一次之后 max 回 NULL，新人拿 1，而 1 正是头一个人当年用过、且现网那批
token 还在 7 天有效期内的值。`sub` 与 `gen` 两格同时撞回去 = 被删那人的旧钥匙开得了新人的门。

这一张表只有一个 key、一行，记的是**史上最高代次**。取号与记账的唯一入口是
`app/services/generation.py`（`allocate` / `note`），那里的注释写清了为什么 `bump_generation`
也必须喂养它——只在注册一处抬水位线是假防线。

**那一行的初值必须是当时 `max(users.generation)`，不能是 0**：这批人里有人被合并/解绑抬过代次
（实测最高 39），他们手里旧 token 还没过期；而"表被删空之后水位线是唯一的记忆"这句话现在就要成立，
不能等到第一次真删空了才想起来补。测试那一路走 `create_all`、不经这份迁移，`services.generation._row`
会当场补一行 0，那种库是空的、没有旧 token，0 是安全的。

downgrade 只删表：这一格是防线不是数据，退回去等于把防线撤掉，不需要搬任何东西。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b71f4e0c9d52'
down_revision: Union[str, Sequence[str], None] = 'c54bfb242620'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('generation_seq',
    sa.Column('key', sa.String(length=16), nullable=False),
    sa.Column('value', sa.Integer(), server_default='0', nullable=False),
    sa.PrimaryKeyConstraint('key')
    )
    conn = op.get_bind()
    live_max = conn.execute(sa.text("select coalesce(max(generation), 0) from users")).scalar()
    conn.execute(
        sa.text("insert into generation_seq (key, value) values ('users', :v)"),
        {"v": int(live_max or 0)},
    )


def downgrade() -> None:
    op.drop_table('generation_seq')
