"""Central metadata only. Browser records must never be added to these models."""
from datetime import datetime, timezone
import uuid
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

def now(): return datetime.now(timezone.utc)
def ident(): return str(uuid.uuid4())

class Base(DeclarativeBase): pass
class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=ident)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(Text)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
class Session(Base):
    __tablename__ = 'user_sessions'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
class Device(Base):
    __tablename__ = 'devices'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=ident)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    display_name: Mapped[str] = mapped_column(String(120))
    operating_system: Mapped[str] = mapped_column(String(32))
    architecture: Mapped[str] = mapped_column(String(32))
    public_key: Mapped[str] = mapped_column(Text)
    scopes: Mapped[str] = mapped_column(Text)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
class Enrollment(Base):
    __tablename__ = 'device_enrollments'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=ident)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True)
    poll_hash: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str] = mapped_column(String(120))
    operating_system: Mapped[str] = mapped_column(String(32))
    architecture: Mapped[str] = mapped_column(String(32))
    public_key: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True)
    scopes: Mapped[str] = mapped_column(Text, default='[]')
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
class AccountToken(Base):
    __tablename__ = 'account_tokens'
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    purpose: Mapped[str] = mapped_column(String(20))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
class Audit(Base):
    __tablename__ = 'security_audit_events'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=ident)
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    action: Mapped[str] = mapped_column(String(64))
    device_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
