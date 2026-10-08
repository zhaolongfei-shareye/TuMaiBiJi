"""note_cards：一篇笔记当前那张卡片的留档，从这台手机搬到服务器

Revision ID: f2b7d4a8c915
Revises: c8f3a1d6e470
Create Date: 2026-10-08 11:20

2.0.1 P0 的第一块地基（方案 docs/方案-卡片留档上服务端.md，成因与实测量在 PRD §8.148）。
一句话：卡片成品图在 2.0.1 之前从来没上过服务器，只是本机 `cardLog` 的一条账加
`${USER_DATA_PATH}/cards/` 下一个 jpg；系统清掉图而账还留着，界面上那一格就退回"从没生成过"，
不报错也不留痕——站长把这定性成"影响现网用户使用的严重问题"。

这张表建"当前那一张"，`ux_note_cards_one_current_per_note` 把 10-03 那条"一篇只留一张"从界面
规矩挪到库上（与 `shares.ux_shares_one_active_per_note`、`poster_templates.ux_..._one_live_per_template`
同一路子：注释管不住并发，索引管得住）。历史行用 `is_current=0` 留着不删——已经拿到过那张图的
老设备要一直读得懂。

`origin` 那一栏不是审计摆设：「这是按你当年选的模板重新出的」和「这张是你刚生成的」在界面上
必须是两句话，靠的就是它。四个取值在 app/models/note_card.py 一处定义。

⚠ downgrade 会丢真东西：这张表里存的是**用户内容的云地址**。删了行，那些 `cloud://` 对象
这台服务器一张都删不掉（没有云开发凭据，对象只有客户端 `wx.cloud.deleteFile` 删得动），
于是它们变成没人记得的孤儿、还占着全站那 5GB。所以要走这条路必须先从库里把 fileID 全量导出、
让老设备挨个删干净，不能只 drop 表。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f2b7d4a8c915'
down_revision: Union[str, Sequence[str], None] = 'c8f3a1d6e470'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'note_cards',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('note_id', sa.Integer(), nullable=False),
        sa.Column('object_key', sa.String(length=500), nullable=False),
        sa.Column('tpl', sa.String(length=50), nullable=False),
        sa.Column('no_qr', sa.Boolean(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('origin', sa.String(length=24), nullable=False),
        sa.Column('is_current', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_note_cards_id', 'note_cards', ['id'])
    op.create_index('ix_note_cards_user_id', 'note_cards', ['user_id'])
    op.create_index('ix_note_cards_note_id', 'note_cards', ['note_id'])
    op.create_index(
        'ux_note_cards_one_current_per_note',
        'note_cards',
        ['note_id'],
        unique=True,
        sqlite_where=sa.text('is_current = 1'),
    )


def downgrade() -> None:
    # 见文件头那条 ⚠：这张表里是用户内容的云地址，先导出再删表，别只 drop。
    op.drop_index('ux_note_cards_one_current_per_note', table_name='note_cards')
    op.drop_index('ix_note_cards_note_id', table_name='note_cards')
    op.drop_index('ix_note_cards_user_id', table_name='note_cards')
    op.drop_index('ix_note_cards_id', table_name='note_cards')
    op.drop_table('note_cards')
