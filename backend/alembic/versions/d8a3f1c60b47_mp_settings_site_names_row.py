"""mp_settings 补一行 site_names 的空值：「来源站点名」成为第四组（表格栏）的第一栏

Revision ID: d8a3f1c60b47
Revises: b4e7c2a1d0f8
Create Date: 2026-10-29 14:1x

站长 10-29 那句「把目前来源标注的网页文章，改为具体的网站文章…后台提供后台配置，默认AI自动识别，
人工修改」⇒ 后台多出一张「域名 → 站名」的表（`TABLE_KINDS`）。
加栏的规矩与 10-15（`e3a7c91b4f26`）、10-18（`c7d1e4a9f380`）、10-21（`b7f2c4d9a310`）同一条：
**"空"要显式写出来**——上线那一刻后台读到的该是"这一栏存在、当前空着"，
而不是"这一栏不存在"。这一栏空着不是"没有站名可用"：四级链后面还有页面自报、内置词表、AI 那三级
（`services/site_names.py`），所以界面上那句停用话术跟着改口（`KIND_EMPTY_TEXTS`），
判据是 `test_迁移把空值那一行显式建出来`，它数三个闭集的并，少一行就红。

用 `select … where not exists` 而不是裸 `insert`：写口 `setting_row(db, kind, create=True)`
本来就会按需补那一行，"代码先上、他已在后台点过一次保存、行已经在了、迁移后补"这一顺序
完全可能发生，那种顺序下裸 insert 撞主键会把整条 `alembic upgrade head` 崩在半路。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8a3f1c60b47'
down_revision: Union[str, Sequence[str], None] = 'b4e7c2a1d0f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "insert into mp_settings (kind, asset_id, text_value) "
        "select 'site_names', NULL, NULL "
        "where not exists (select 1 from mp_settings where kind = 'site_names')"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from mp_settings where kind = 'site_names'"))
