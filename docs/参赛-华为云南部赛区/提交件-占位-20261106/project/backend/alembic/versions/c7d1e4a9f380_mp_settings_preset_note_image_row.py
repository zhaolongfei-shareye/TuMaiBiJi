"""mp_settings 补一行 preset_note_image 的空值：官方那一篇从此也有「这一栏存在、当前空着」

Revision ID: c7d1e4a9f380
Revises: b4e8a1c7d205
Create Date: 2026-10-18 13:15

站长 10-18 那句「默认笔记，后台也应该支持上传图片」⇒ 图片栏从一栏变两栏。上一份加栏的迁移
（`e3a7c91b4f26`）定下的规矩是**"空"要显式写出来**：新栏目上线那一刻后台读到的就该是
"这一栏存在、当前用的是…"，而不是"这一栏不存在"。这条照同一个规矩补那一行，
判据就是 `test_迁移把空值那一行显式建出来`——它数的是两个闭集的并，少一行就红。

下面为什么用 `select … where not exists` 而不是上一份那种裸 `insert`：这条链的写口
`setting_row(db, kind, create=True)` 本来就会按需把缺的那一行补出来（发布/停用/存文案三处都调它），
所以完全可能"代码先上、站长已经点过一次发布，行已经在了，迁移后补"——
那种顺序下裸 insert 会撞主键、把整条 `alembic upgrade head` 崩在半路，而崩掉的那一趟
会把后面还没跑的迁移一起卡住。`not exists` 让这一句在两种顺序下都只写一次。

downgrade 只删这一行，不动 `mp_assets` 里传上来的那些字节：图还在服务器上、历史还在账上，
重新 upgrade 就又是"这一栏存在、当前空着"。真要留底，删之前自己
`select asset_id from mp_settings where kind='preset_note_image'` 抄一份。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c7d1e4a9f380'
down_revision: Union[str, Sequence[str], None] = 'b4e8a1c7d205'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "insert into mp_settings (kind, asset_id, text_value) "
        "select 'preset_note_image', NULL, NULL "
        "where not exists (select 1 from mp_settings where kind = 'preset_note_image')"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from mp_settings where kind = 'preset_note_image'"))
