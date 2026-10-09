from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from app.core.config import settings
from app.db.database import Base
from app.models import Note, User, Category, Asset, Job, Share
# ⚠ 这一行不是装饰：alembic 只看得见"这里 import 进来的表"。`app.models` 那个 __init__ 到
# 10-09 还漏着 user_profile，于是 `--autogenerate` 会把库里那张真表当成"多出来的表"，
# 顺手写一条 drop_table('user_profiles') 发出去——整表名片数据没了（10-09 审计严重③）。
# 新加表的同一次提交里要在这里补一行，`tests/test_模型注册齐不齐` 钉着这一条。
from app.models.user_profile import UserProfile  # noqa: F401  只要它把表挂进 Base.metadata
from app.models.generation_seq import GenerationSeq  # noqa: F401  同上（10-10 那张代次水位线表）

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
