"""assets.object_key 与 note_cards.object_key 补索引（10-25 第八轮审计 M32）

归属校验（"这一张图属不属于当前账号"）每次都按 `object_key` 反查这两张表，而现网在册索引
现读为 assets〔user_id,id,note_id〕、note_cards〔id,user_id,note_id,ux_note_cards_one_current_per_note〕
——两栏都不在里面 ⇒ 每一趟都是一次全表扫。底数 assets 189／note_cards 32 的今天无感，
这是**将来账**：攒到几万行时它会慢到撞上 M31 那一条（存图网关那一趟本来就已经贴着超时线）。

索引名照 SQLAlchemy `index=True` 的默认命名（`ix_<表>_<列>`）写死，与模型声明逐字对上——
名字不一致会让 `compare_metadata` 那把"模型与库对不上"的尺子长出一条假差异。

不唯一：同一张图的 fileID 理论上可以出现在多行（历史卡片留档就是多行一对象的那种形状），
这一枚只服务"按地址查行"，不带任何约束语义。

⚠ 本仓只有 SQLite。换 MySQL 时这两条要改成前缀索引：`String(500)` 在 utf8mb4 下超过
767 字节的键长上限，原样建会直接报错（同一句话写在 `models/asset.py:36` 旁边，别只记在这里）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4e7c2a1d0f8'
down_revision: Union[str, Sequence[str], None] = 'a7d41f2b9c63'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_assets_object_key', 'assets', ['object_key'], unique=False)
    op.create_index('ix_note_cards_object_key', 'note_cards', ['object_key'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_note_cards_object_key', table_name='note_cards')
    op.drop_index('ix_assets_object_key', table_name='assets')
