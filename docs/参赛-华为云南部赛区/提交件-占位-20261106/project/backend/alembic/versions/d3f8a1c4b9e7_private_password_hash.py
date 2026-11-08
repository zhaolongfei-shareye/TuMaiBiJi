"""users 加 private_password_hash

Revision ID: d3f8a1c4b9e7
Revises: c9e4b1a7d532
Create Date: 2026-09-29 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3f8a1c4b9e7'
down_revision: Union[str, Sequence[str], None] = 'c9e4b1a7d532'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('private_password_hash', sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('private_password_hash')
