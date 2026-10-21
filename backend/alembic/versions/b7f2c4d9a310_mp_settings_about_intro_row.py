"""mp_settings 补一行 about_intro 的空值：「关于那一段介绍」从此也是一栏文案

Revision ID: b7f2c4d9a310
Revises: a4d7e2b91c58
Create Date: 2026-10-21 21:3x

站长 10-21 夜那句「关于里面，图麦笔记的介绍，放在后台配置」⇒ 文案栏从一栏变两栏
（`TEXT_KINDS` ＝ tips ＋ about_intro）。加栏的规矩与 10-15 那份（`e3a7c91b4f26`）、
10-18 那份（`c7d1e4a9f380`）同一条：**"空"要显式写出来**——上线那一刻后台读到的该是
"这一栏存在、当前空着"，而不是"这一栏不存在"，那两句话在界面上不是一回事。
判据就是 `test_迁移把空值那一行显式建出来`，它数两个闭集的并，少一行就红。

用 `select … where not exists` 而不是裸 `insert`，同 10-18 那份的理由：
写口 `setting_row(db, kind, create=True)` 本来就会按需补那一行，所以"代码先上、
他已经在后台点过一次发布、行已经在了、迁移后补"这种顺序完全可能发生——
那种顺序下裸 insert 撞主键会把整条 `alembic upgrade head` 崩在半路，
连带把后面还没跑的迁移一起卡住。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7f2c4d9a310'
down_revision: Union[str, Sequence[str], None] = 'a4d7e2b91c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "insert into mp_settings (kind, asset_id, text_value) "
        "select 'about_intro', NULL, NULL "
        "where not exists (select 1 from mp_settings where kind = 'about_intro')"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from mp_settings where kind = 'about_intro'"))
