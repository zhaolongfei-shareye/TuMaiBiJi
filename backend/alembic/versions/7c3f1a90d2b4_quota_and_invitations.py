"""额度与邀请：users 加两列，新建 invitations 表

Revision ID: 7c3f1a90d2b4
Revises: ba59ebc2e110
Create Date: 2026-09-22 23:40:12.118402

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c3f1a90d2b4'
down_revision: Union[str, Sequence[str], None] = 'ba59ebc2e110'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite 的 ADD COLUMN 要求带默认值的那一列不能是 NULL 之外的非常量表达式，
    # 所以这里用 server_default='0'，存量行由数据库补 0，不写 UPDATE。
    op.add_column('users', sa.Column('quota_bonus', sa.Integer(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('invited_by', sa.Integer(), nullable=True))
    op.create_index(op.f('ix_users_invited_by'), 'users', ['invited_by'], unique=False)
    op.create_table('invitations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('inviter_id', sa.Integer(), nullable=False),
    sa.Column('invitee_id', sa.Integer(), nullable=False),
    sa.Column('reward', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('invitee_id', name='uq_invitations_invitee')
    )
    op.create_index(op.f('ix_invitations_id'), 'invitations', ['id'], unique=False)
    op.create_index('ix_invitations_inviter', 'invitations', ['inviter_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_invitations_inviter', table_name='invitations')
    op.drop_index(op.f('ix_invitations_id'), table_name='invitations')
    op.drop_table('invitations')
    op.drop_index(op.f('ix_users_invited_by'), table_name='users')
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('invited_by')
        batch_op.drop_column('quota_bonus')
