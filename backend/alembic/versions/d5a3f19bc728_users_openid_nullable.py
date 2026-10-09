"""users.openid 放开可空：让只有 Apple 身份的那个人能存在

Revision ID: d5a3f19bc728
Revises: b7d2f4a1c903
Create Date: 2026-10-09 09:30:00.000000

`跨端接口契约-v1.md` §二 要的是"一个 account，多种登录方式"，而 §十一 第 2 条同时禁止
"把 openid 或 Apple user identifier 当业务主键"。这两句合起来对库面的要求就是这一条：
一个只有 SIWA 的人，`users.openid` 那一格**填不出来**。原来它是 `nullable=False`，
唯一能填的办法是替他编一串微信 openid —— 那正是契约禁的冒名，也是这份迁移要堵掉的路。

`unique` 保留不动：它是"同一个微信号开不出两个账号"的落点。放开可空不会把这道闸门一起放开，
因为 SQL 里 NULL 与 NULL 本来就不相等，两条只有 Apple 身份的行不会互相挡住，而两条同一个
微信号的行照样撞。（正反两条钉在 tests/test_account_and_identity.py::Test没有微信的那个人。）

为什么用 batch_alter_table：SQLite 没有"改列的 NOT NULL"这条路，alembic 的 batch 模式会
把表重建成 `CREATE TABLE new_users (...)` + 拷数据 + 改名。**重建会不会把 openid 上那道唯一
约束一起丢掉，是要验的，不是要猜的**——10-09 实测两份 DDL：重建前是
`openid VARCHAR(100) NOT NULL` + `CREATE UNIQUE INDEX ix_users_openid`（SQLAlchemy 那个
`unique=True` 落在这张表上是一条具名唯一索引，不是表级 unnamed 约束），重建后 NOT NULL 没了、
那条 `ix_users_openid` 还在。所以闸门活着，而这一点由
`tests/test_account_and_identity.py::Test没有微信的那个人` 两条正反用例钉住，不靠我读 DDL 读得对。
（本机只验了 SQLite 这一条路；现网那套如果真是 Postgres，batch 模式发的是别的语句，
本文件没有为它写过一句"我验过了"。）

downgrade 恢复 NOT NULL：库里只要已经有一条只有 Apple 身份的行就**必然失败**（NULL 填不回
非空列）。这不是这份迁移的疏漏，是那条人已经存在这个事实本身——真要退回去只能先删掉那些人，
所以这里选择让它在有 Apple 行时响，而不是悄悄把那些行删掉。

⚠ **同一天晚些时候的更正（2026-10-09，产品需求.md「阶段2-2 落成」那一节，现编号 §8.174）**：站长拍乙之后，"只有 Apple 身份的人"
**不再有 `users` 行**（他只在 `accounts` + `account_identities(apple)` 上存在），所以这一刀
当初的理由——"那种人填不出 openid"——按乙的路线已经走不到了。这一列**不回退**：回退要给一张
有 live 数据的 `users` 表再发一次重建，而放宽这一约束不挡任何人；真正拦着"拿这行冒充微信用户"的
是 `ensure_for_user` 里 openid 为空那道 RuntimeError，那条有尺子。当前口径写在
`app/models/user.py` 那一列的注释上。**这一刀在本仓库里从未上过现网（零部署）。**
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd5a3f19bc728'
down_revision: Union[str, Sequence[str], None] = 'b7d2f4a1c903'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column(
            'openid', existing_type=sa.String(100), nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.alter_column(
            'openid', existing_type=sa.String(100), nullable=False,
        )
