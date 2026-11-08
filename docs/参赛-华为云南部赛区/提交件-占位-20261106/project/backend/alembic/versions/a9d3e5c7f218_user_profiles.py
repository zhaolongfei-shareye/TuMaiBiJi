"""user_profiles：名片（名称/一句话/四格形象图）与背景亮度档从本机搬到服务器

Revision ID: a9d3e5c7f218
Revises: f2b7d4a8c915
Create Date: 2026-10-08 16:20

2.1 第一条。站长把跨端定成"同一个微信号换手机／重置手机后再登录，依旧是自己的笔记"，
实测下来笔记那一路本来就在服务器上，真正会丢的是名片那四格图与背景亮度档——它们到今天
只写 `wx.setStorageSync`，而 `poster.js` 的 `readSlots()` 拿"本机文件在不在"当判据，
文件没了那一格就静默变空。这与 2.0.1 之前卡片那一格是同一个毛病（PRD §8.148），
只是这次还没人报。所以这一张表建的是"人"这一层，不是又一套备份文件。

`slots` 是 JSON 列，形状只在写口校（`routes/profiles.py`），读口不重钉一遍——
现网那次把 JSON 列钉成 `List[str]` 直接打出 500，教训记在 `routes/cards.py` 第 100 行附近。

⚠ downgrade 会丢真东西，与 `note_cards` 那条同理：`slots` 里存的是用户内容的云地址，
删了行那些 `cloud://` 对象这台服务器一张都删不掉（对象只有客户端 `wx.cloud.deleteFile` 删得动），
它们会变成没人记得的孤儿还占着全站那 5GB。要走这条路必须先导出 fileID、让设备挨个删干净。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a9d3e5c7f218'
down_revision: Union[str, Sequence[str], None] = 'f2b7d4a8c915'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=64), nullable=True),
        sa.Column('slogan', sa.String(length=96), nullable=True),
        sa.Column('slots', sa.JSON(), nullable=True),
        sa.Column('tpl', sa.String(length=50), nullable=True),
        sa.Column('bg_dim', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_user_profiles_id', 'user_profiles', ['id'])
    # 一人一份：写口是 upsert，第二行就是 bug，所以这条落在库上而不是注释里。
    op.create_index('ix_user_profiles_user_id', 'user_profiles', ['user_id'], unique=True)


def downgrade() -> None:
    # 见文件头那条 ⚠：这张表里是用户内容的云地址，先导出再删表，别只 drop。
    op.drop_index('ix_user_profiles_user_id', table_name='user_profiles')
    op.drop_index('ix_user_profiles_id', table_name='user_profiles')
    op.drop_table('user_profiles')
