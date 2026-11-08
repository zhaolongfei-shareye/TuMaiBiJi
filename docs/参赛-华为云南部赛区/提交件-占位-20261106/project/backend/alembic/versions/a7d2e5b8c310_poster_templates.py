"""卡片模板配方表：让"加一套同族模板"不再需要发版

Revision ID: a7d2e5b8c310
Revises: e5a7c1d9b420
Create Date: 2026-10-04 21:50

这张表存在的理由只有一句话（方案 docs/方案-卡片模板不走发版.md §一）：以后补一套卡片模板
不该再走一次发版 + 一次审核。存的是**数据**，不是代码——一份 JSON 配方，客户端那份手工写的
闭集解释器（miniprogram/utils/posterRecipe.js）负责把它翻译成图层。微信《关于禁止小程序
JavaScript 解释器使用规范》禁的就是"下发代码"这条路，所以这里连一个函数、一句字符串形式的
代码都不许出现；写回接口之前要过 app/services/poster_recipe.py 那份名单校验。

这一迁移只建表，不灌种子。种子（现在这十套）由 deploy.sh 的预检调
app/services/poster_templates.seed_poster_templates() 幂等写入，来源是
backend/seed/poster_templates.json —— 那份 JSON 是 docs/工具/出-模板配方种子.js
从客户端现读的名单生成的，不在迁移里抄一遍，是为了避免"改了客户端配方、迁移里那份还是老的"
这种双真相。

那条部分唯一索引 `ux_..._one_live_per_template` 管的是并发之外的另一半：同一 template_id
要是同时有两行 live，客户端按 id 合并时哪条赢取决于查询顺序，画面就成了不确定的。
archived 的历史行不受约束（一个模板会攒下好几版），而且**故意不删**——已经拿到过那份配方的
老包要一直收得住（壁纸那批的教训：旧值必须一直读得懂，所以撤回是改 status、不是删记录）。

downgrade 直接 drop 整张表：这张表里没有用户数据，只有画法配置，回滚点之前的客户端本来就用
包内那十套，删了不会丢任何东西。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a7d2e5b8c310'
down_revision: Union[str, Sequence[str], None] = 'e5a7c1d9b420'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'poster_templates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('template_id', sa.String(length=40), nullable=False),
        sa.Column('label', sa.String(length=40), nullable=False),
        sa.Column('label_en', sa.String(length=60), nullable=False),
        sa.Column('group_key', sa.String(length=20), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False),
        sa.Column('recipe', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('min_app_version', sa.String(length=20), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_poster_templates_id', 'poster_templates', ['id'])
    op.create_index('ix_poster_templates_template_id', 'poster_templates', ['template_id'])
    op.create_index(
        'ux_poster_templates_one_live_per_template',
        'poster_templates',
        ['template_id'],
        unique=True,
        sqlite_where=sa.text("status = 'live'"),
    )


def downgrade() -> None:
    op.drop_index('ux_poster_templates_one_live_per_template', table_name='poster_templates')
    op.drop_index('ix_poster_templates_template_id', table_name='poster_templates')
    op.drop_index('ix_poster_templates_id', table_name='poster_templates')
    op.drop_table('poster_templates')
