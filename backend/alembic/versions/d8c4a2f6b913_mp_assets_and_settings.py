"""mp_assets + mp_settings：运营图从"包里的一个文件"变成"后台能换的一张"

Revision ID: d8c4a2f6b913
Revises: b71f4e0c9d52
Create Date: 2026-10-12 03:10

方案 `docs/方案-cn后台资产管理.md` P0-a。成因站长 10-11 那句话：「在.cn 后台增加一个管理背景图
和笔记模板的管理页面，可以根据需要上传图片，实现全量更新」——而默认背景图今天是
`miniprogram/assets/home-bg-portrait.jpg` 这个包内文件，路径写死在 `utils/poster.js:217`，
换一张必须发版。

两张表不是一个：`mp_assets` 记账（一份不可变字节 = 一行），`mp_settings` 记"这一栏现在生效的是
哪一行"。理由和字段口径写在 `app/models/mp_asset.py` 的文件头，锚点 A1 那一条。

下面那句 `insert` 是这一份迁移里唯一容易被当成多余的东西，它干的是 A1 的正事：
**"空"要显式写出来，不能靠"没这一行"表达**。同一个坑在名片那条链上造成过不可逆删图
（`profileCloud.js:13-15、111-117`）。给每一已知 kind 先补一行 `asset_id = NULL`，
从此后台读到的是"这一栏存在、当前停用"，而不是"这一栏不存在"——将来加灰度、加排期
只往这张表加栏，两种状态的读法不会糊在一起。

⚠ downgrade 只删表，不动 `var/mp-assets/` 里那些文件：删表之后那些字节就没有账本指着了，
而**这张表里没有任何用户内容**（运营图是站长自己上传的公开图），所以留下的代价只是磁盘，
不是隐私。真要清干净得手动删目录，别指望这条 downgrade 替你做。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd8c4a2f6b913'
down_revision: Union[str, Sequence[str], None] = 'b71f4e0c9d52'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mp_assets',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('token', sa.String(length=40), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('object_path', sa.String(length=120), nullable=False),
        sa.Column('media_type', sa.String(length=16), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=False),
        sa.Column('height', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_mp_assets_id', 'mp_assets', ['id'])
    op.create_index('ix_mp_assets_kind', 'mp_assets', ['kind'])
    op.create_index('ix_mp_assets_content_hash', 'mp_assets', ['content_hash'])
    # 与模型里 `Index("ux_mp_assets_token", ..., unique=True)` 同一形状：发图端点按这一栏查，
    # 撞了两个 token 就等于回滚时分不清哪张是当前。
    op.create_index('ux_mp_assets_token', 'mp_assets', ['token'], unique=True)
    # 同一栏不存两份一样的字节（服务层查重 + 这一道索引，并发下索引才是那句话的落地）。
    op.create_index('ux_mp_assets_kind_hash', 'mp_assets', ['kind', 'content_hash'], unique=True)

    op.create_table(
        'mp_settings',
        sa.Column('kind', sa.String(length=24), nullable=False),
        sa.Column('asset_id', sa.Integer(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('kind'),
    )
    # 见文件头：这一句不是"顺手初始化"，是把 A1 那两种状态里的第一种先钉上。
    conn = op.get_bind()
    for kind in ('home_bg',):
        conn.execute(
            sa.text("insert into mp_settings (kind, asset_id) values (:k, NULL)"),
            {"k": kind},
        )


def downgrade() -> None:
    op.drop_table('mp_settings')
    op.drop_index('ux_mp_assets_kind_hash', table_name='mp_assets')
    op.drop_index('ux_mp_assets_token', table_name='mp_assets')
    op.drop_index('ix_mp_assets_content_hash', table_name='mp_assets')
    op.drop_index('ix_mp_assets_kind', table_name='mp_assets')
    op.drop_index('ix_mp_assets_id', table_name='mp_assets')
    op.drop_table('mp_assets')
