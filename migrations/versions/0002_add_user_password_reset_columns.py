"""Add user password reset columns and token partial indexes

Revision ID: 0002_user_password_reset
Revises: 0001_initial_hardened
Create Date: 2026-11-14 23:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '0002_user_password_reset'
down_revision = '0001_initial_hardened'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('password_reset_token', sa.String(length=255), nullable=True))
    op.add_column('users', sa.Column('password_reset_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        'ix_users_invitation_token',
        'users',
        ['invitation_token'],
        unique=False,
        postgresql_where=sa.text('invitation_token IS NOT NULL'),
    )
    op.create_index(
        'ix_users_password_reset_token',
        'users',
        ['password_reset_token'],
        unique=False,
        postgresql_where=sa.text('password_reset_token IS NOT NULL'),
    )


def downgrade():
    op.drop_index('ix_users_password_reset_token', table_name='users')
    op.drop_index('ix_users_invitation_token', table_name='users')
    op.drop_column('users', 'password_reset_expires_at')
    op.drop_column('users', 'password_reset_token')
