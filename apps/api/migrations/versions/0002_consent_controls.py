"""Immutable enrollment ceiling and explicit monitoring pause."""

import sqlalchemy as sa
from alembic import op

revision = "0002_consent_controls"
down_revision = "0001_metadata"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("devices", sa.Column("enrolled_scopes", sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE devices SET enrolled_scopes=scopes"))
    with op.batch_alter_table("devices") as batch:
        batch.alter_column("enrolled_scopes", existing_type=sa.Text(), nullable=False)
    op.add_column(
        "devices",
        sa.Column(
            "monitoring_paused", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade():
    with op.batch_alter_table("devices") as batch:
        batch.drop_column("monitoring_paused")
        batch.drop_column("enrolled_scopes")
