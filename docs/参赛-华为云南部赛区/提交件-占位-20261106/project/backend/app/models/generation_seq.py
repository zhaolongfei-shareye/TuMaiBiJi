from sqlalchemy import Column, Integer, String

from app.db.database import Base


class GenerationSeq(Base):
    """`users.generation` 的水位线：整张表只有一行，记"史上最高代次"。

    为什么要单独一张表而不是就地数 `max(users.generation)`：`users` 会被删空
    （`DELETE /v1/account` 删的是整条 account 名下所有行，最后一个人走完就是空表），
    空表上的 max 是 NULL，于是"这张表历史上发过哪些代次"这件事没有任何地方记得。
    为什么不能拿 `accounts.generation` 当那份记忆：只有 Apple 身份的人根本没有 `users` 行，
    而一条 account 名下的行可以被删干净——两张表都会一起归零。

    形状故意最小：`key` 是主键而不是自增 id，这样"取那一行"是一句按主键的读，
    不需要再为"表里可能有多行"发明规则。今天只有 `"users"` 这一个 key。

    读写只允许走 `app/services/generation.py`（`allocate` / `note`），这里不写业务口径。
    """

    __tablename__ = "generation_seq"

    key = Column(String(16), primary_key=True)
    value = Column(Integer, nullable=False, default=0, server_default="0")
