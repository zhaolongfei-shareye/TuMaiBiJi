"""assets 加 note_id 与 backup_status：图片第一次真的跟着一篇笔记留下来

Revision ID: b4e9c2a7f510
Revises: a7d2e5b8c310
Create Date: 2026-10-06 02:20:00.000000

在这条迁移之前，**一篇笔记的图片在库里根本不存在**：截图/拍照进来的字节只活在
`app/api/routes/ingest.py` 的进程内存 staging（TTL 30 分钟），
`app/tasks/ingest_tasks.py` 做完 OCR 把文字写进 `original_content` 就把原图丢了；
`assets` 这张表建好之后全仓零写入（只有注销账号那句 delete 在引用它）。
所以这次不是"把上限从几张改成几张"，是从零把"图留在笔记上"这件事接上。

两列都可空、且默认值都有意义：
- `note_id` 可空是 B 链（压缩+直传）比 A 链（提炼建笔记）慢的正常态——图先传上来，
  拿到 note_id 之后再 bind。这种行要计入配额（对象已经占空间），但不能出现在任何一篇
  笔记的列表里，所以读接口一律带 `note_id IS NOT NULL`。
- `backup_status` 只有 'uploaded' 参与全站配额求和：'failed' 那批在云上没东西，
  算进去会让人看到"用了 4.9GB"其实只有 2GB。

只加列、加索引，不动任何老列、不改老语义——这是 2.0 与线上 1.x 的兼容契约第一条
（见 docs/方案-2.0大版本.md §2 甲）：老包读不到这两列也照样跑得动，因为它根本不看它们。

downgrade 用 batch_alter_table：SQLite 上 DROP COLUMN 要走重建表那条路。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e9c2a7f510'
down_revision: Union[str, Sequence[str], None] = 'a7d2e5b8c310'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('assets', sa.Column('note_id', sa.Integer(), nullable=True))
    op.add_column('assets', sa.Column('backup_status', sa.String(20), nullable=True))
    # add_column 的默认值只管**以后新建的行**，已有行升级后这一格是 NULL（Core Data 那边踩过同一型）。
    # 今天这张表是空的，所以这条 UPDATE 现在影响 0 行——但它把"NULL 一律当 uploaded"这件事
    # 钉在迁移里，而不是留给读接口去猜。
    op.execute("UPDATE assets SET backup_status = 'uploaded' WHERE backup_status IS NULL")
    op.create_index('ix_assets_note_id', 'assets', ['note_id'])
    # backup_status 上**没建索引**：配额那条是 `SUM(file_size) WHERE backup_status != 'failed'`，
    # 不管走不走这个索引都得把 file_size 一行行捞出来，索引省不了回表；而 `test_alembic升级后的
    # 库和模型一字不差` 那条钉的是"模型和库一字不差"——模型里没写的东西，迁移里也不能多。


def downgrade() -> None:
    op.drop_index('ix_assets_note_id', table_name='assets')
    with op.batch_alter_table('assets') as batch_op:
        batch_op.drop_column('backup_status')
        batch_op.drop_column('note_id')
