from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

_connect_args = {}
_pool_kwargs = {}

if settings.DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False
else:
    _pool_kwargs = {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=_connect_args,
    **_pool_kwargs,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
