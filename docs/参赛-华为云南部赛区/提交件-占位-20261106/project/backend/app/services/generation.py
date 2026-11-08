"""`users.generation` 的取号与记账——除了这一支文件，没有别的地方能让代次变大。

要防的那件事很具体：SQLite 上 `users.id` 就是 rowid，删掉最大的那几行之后**它会被还给下一个人**。
现网实测（2026-10-09 只读查 `/home/ubuntu/wtsj-backend/wtsj.db`）：35 行、id 到 41、建表语句里没有
`AUTOINCREMENT`、连 `sqlite_sequence` 那张表都不存在——所以这一句不是"哪天换了引擎可能有问题"，
是这台机器今天的样子。老 `/api` 那把钥匙认的是 `sub`(=`users.id`) ＋ `gen` 两格，两格**同时**撞回
去才出事，于是安全的条件只有一句：**新人拿到的代次，必须比这个 id 上辈子发出去过的每一个代次都大。**

原来那句 `max(users.generation) + 1` 只在表非空时成立。表被删空过一次之后 max 回 NULL，下一个人
拿 1，而 1 恰恰是第一个人在世时用过、且现网那批 token 有效期 7 天的值。这一格持久的高水位线就是把
"表空了之后还记得"从内存搬进库里。

⚠ 水位线必须由**每一个**写 `users.generation` 的地方喂养，否则它是假防线。今天有两处：注册取号
（`allocate`）与合并/解绑那一刀（`app/services/accounts.bump_generation`）。后一处更要紧——一个人
被合来合去，`generation` 可以从 5 一路涨到 15，这中间每一个值都真的随 token 发出去过；只在注册
那一处抬水位线的话，删空之后新人照样会撞上其中某一个值。所以 `bump_generation` 抬完必须调 `note`，
而反向验证里有一刀专门抽掉那一句（`probes/反向验证-阶段2-3.sh`）。

迁移 `b71f4e0c9d52` 给现网插的那一行初值是**当时的 `max(users.generation)`**，不是 0：那一格是
"这张表发过哪些号"唯一的记忆，而现在这批人的旧 token 还在 7 天有效期内。

两处都不 commit——代次的取号与记账必须跟着引发它的那次写（建号、改归属）在同一个事务里落地，
口径同 `bump_generation`。
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.generation_seq import GenerationSeq
from app.models.user import User

KEY = "users"


def _row(db: Session) -> GenerationSeq:
    row = db.query(GenerationSeq).filter(GenerationSeq.key == KEY).first()
    if row is None:
        # 迁移给现网插了这一行，所以今天走得到这一支的只有"库是 `create_all` 建出来的"那些
        # 场合（测试那一路）。初值 0 不危险：下面 `allocate` 还会按 live max 兜一层。
        row = GenerationSeq(key=KEY, value=0)
        db.add(row)
        db.flush()
    return row


def _live_max(db: Session) -> int:
    """库里**当前**还活着的人最高用到了几。空表上是 0。"""
    return db.query(func.coalesce(func.max(User.generation), 0)).scalar() or 0


def allocate(db: Session) -> int:
    """给一个新注册的人取下一个代次。严格大于「水位线」与「库里在用的号」两者。"""
    row = _row(db)
    row.value = max(row.value, _live_max(db)) + 1
    return row.value


def note(db: Session, value: int) -> None:
    """把一格已经发出去的代次记回水位线。只在 `value` 更大时写。"""
    row = _row(db)
    if value > row.value:
        row.value = value
