"""mp_settings 多一栏 text_value：后台从此也能管一句话，不只管一张图

Revision ID: e3a7c91b4f26
Revises: d8c4a2f6b913
Create Date: 2026-10-15 14:20

站长 10-15 那句「Tips 改为后台配置」。取证之后这一条只做一栏：全站真叫 Tips 的界面文案
只剩新建页首屏那六句轮播（`miniprogram/utils/i18n.js:81`／`:471`，`pages/create/create.js` 的
`tipsFor()` 取），笔记列表页头部那一行 10-04 已经撤净、且被两把尺子钉死不许复活。

为什么不复用 `mp_assets` 那张表：它每一列都是**图片账**（`width`/`height`/`file_size`/
`media_type`/`object_path` 全 `nullable=False`），一句文案在里面没有地方放，硬塞就要把那些列
改成可空——那是为了让两张语义不同的表共用一个名字，去削弱另一张表的约束。
所以文案落在 `mp_settings` 上（它本来就是"这一栏当前生效的是什么"，与生效值是不是字节无关），
kind 走另一个闭集 `TEXT_KINDS`：图片写口只认 `KINDS`，文案写口只认 `TEXT_KINDS`，
两条校验各自关门，后台就不会出现"给文案上传一张 JPEG"那种点得动、存进库、屏上永远读不到的格子。

下面那句 `insert` 与上一份迁移里那句同型，也干同一件事（方案锚点 A1）：
**"空"要显式写出来**。补一行 `tips`、两栏都 NULL，后台从上线那一刻起读到的就是
"这一栏存在、当前用的是包里那六句"，而不是"这一栏不存在"。

downgrade 把 tips 那一行删掉再 drop 那一栏。`text_value` 里存的是站长自己写的公开提示语，
**没有任何用户内容**，删了不涉隐私；但删完包内那六句就是唯一真相，改过的句子会丢——
真要留底，downgrade 之前自己把 `select text_value from mp_settings where kind='tips'` 抄一份。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e3a7c91b4f26'
down_revision: Union[str, Sequence[str], None] = 'd8c4a2f6b913'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('mp_settings', sa.Column('text_value', sa.JSON(), nullable=True))
    conn = op.get_bind()
    conn.execute(
        sa.text("insert into mp_settings (kind, asset_id, text_value) values ('tips', NULL, NULL)"),
    )


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("delete from mp_settings where kind = 'tips'"))
    # SQLite 上 DROP COLUMN 要走重建表那条路（与 `b4e9c2a7f510`、`a1c4e7f0b2d9` 同一个写法）。
    with op.batch_alter_table('mp_settings') as batch_op:
        batch_op.drop_column('text_value')
