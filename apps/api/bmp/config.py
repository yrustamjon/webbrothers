import os
from dataclasses import dataclass
@dataclass
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'postgresql+psycopg://bmp@localhost/bmp')
    secure_cookies: bool = os.getenv('BMP_DEVELOPMENT', '') != '1'
    public_origin: str = os.getenv('PUBLIC_ORIGIN', 'https://localhost')
    auto_create: bool = os.getenv('BMP_AUTO_CREATE', '') == '1'
    query_timeout: float = 30
    smtp_host: str = os.getenv('SMTP_HOST', '')
    smtp_port: int = int(os.getenv('SMTP_PORT', '587'))
    smtp_user: str = os.getenv('SMTP_USER', '')
    smtp_password: str = os.getenv('SMTP_PASSWORD', '')
    smtp_from: str = os.getenv('SMTP_FROM', 'noreply@localhost')
    release_directory: str = os.getenv('AGENT_RELEASE_DIRECTORY', '')
    release_public_key: str = os.getenv('AGENT_RELEASE_PUBLIC_KEY', '')
