"""accounts.generation：把 `/v1` 那把钥匙的吊销开关装在"人"那张表上

Revision ID: e8c1a47b2d35
Revises: d5a3f19bc728
Create Date: 2026-10-09 10:30:00.000000

站长 10-09 拍的乙：只有 Apple 身份的人**不给 `users` 行**，`/v1` 直接发以 `accounts.id`
为 `sub` 的登录态。契约 §二 本来就把 `generation` 写在 `accounts` 上——现在这一列不再是
"照着契约先立着"，而是真的有一把钥匙在它上面：那条 token 能不能用，比的就是这一格。

`users.generation` **不动、不删、不搬**：现网那批 7 天有效期的微信 token 里 `sub` 是
`users.id`、比的是 `users.generation`，撤掉它等于把所有小程序用户当场踢下线。于是同一个人
最多有两格代次，唯一的写入点是 `app/services/accounts.bump_generation`（一次抬两格），
理由和钉它的尺子都写在那支函数的 docstring 里。

不从 `users.generation` 回填初始值：`accounts.id` 是服务端 `uuid4`，**永不被重用**，所以
`users.generation` 当初为"SQLite 复用自增 id"设的那层防线在这一张表上没有对应的敌人；
这一列现在的唯一用途是主动吊销，而主动吊销只看"变更之后有没有人拿着变更之前发的 token"。
所有人都从 1 起，老 token 本来就不存在。

downgrade 只删列：这一列不承载任何别处推不出来的信息（代次高了也只是多几个失效 token），
退回去不需要搬数据。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8c1a47b2d35'
down_revision: Union[str, Sequence[str], None] = 'd5a3f19bc728'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('accounts', sa.Column('generation', sa.Integer(),
                                        server_default='1', nullable=False))


def downgrade() -> None:
    op.drop_column('accounts', 'generation')
