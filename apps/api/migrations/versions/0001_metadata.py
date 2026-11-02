"""Only user/device/security metadata; no browser records."""
from alembic import op
from bmp.models import Base
revision='0001_metadata'
down_revision=None
branch_labels=None
depends_on=None
def upgrade(): Base.metadata.create_all(op.get_bind())
def downgrade(): Base.metadata.drop_all(op.get_bind())
