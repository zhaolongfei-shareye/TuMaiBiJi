"""来源黑名单：计数、判拦、后台那一栏的读写。规格正本 `docs/规格-来源黑名单.md`。

三条口径先写在这儿，因为代码里每一处都能回到它们（§三）：

1. **只数"站点级确定性失败"**。计入的只有两型：HTTP 4xx／5xx，以及 200 但正文读出 0 字。
   提炼失败、超时连不上、DNS 失败、worker 挂了、单张贴图下载失败**一律不计数**——
   计了就是把我们自己的故障算到网站头上（这台机器上有现成教训：10-13 那次 `.env` 少三行，
   提炼静默降级一整天，那种一天能把所有站刷进黑名单）。**分类不在这一份文件里做**，
   在唯一的调用点 `app/tasks/ingest_tasks.py`——这一枚函数被喂进去什么就记什么，
   它自己不判断"这算不算站点的错"。
2. **主机名原样，不去子域、不合并注册域**。`www.`／`zhuanlan.`／`m.` 各攒各的 3 次。
   宁可拦得慢，也不拿一个子域的实测证据去判整族。
3. **进了名单不自动过期、不自动移出**。要出去只有管理员手工移（§九那条"不做自动放回"）。

一句话给实现：**"在不在名单里"只有一份判据**，就是 `row_is_blocked`。
库里不存布尔位（理由写在 `models/source_blocklist.py` 文件头）。
"""
import logging
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.core.errors import UserError
from app.models.source_blocklist import (
    AUTO_THRESHOLD,
    MAX_HOST_LEN,
    SOURCE_AUTO,
    SOURCE_MANUAL,
    SourceBlocklist,
)

logger = logging.getLogger(__name__)

# 命中之后给用户的那一句。规格 §四：≤30 汉字（toast 只两行），且不承诺"会自动恢复／点这里申诉"。
# 想说得更多的那些话放帮助文档，与「支持来源」清单写在一起。
BLOCKED_HINT = "这个网站读不到内容，已停用"

# 手工那一条的形状校验。为什么要有：主机名是这张表唯一的身份，一个带空格或带斜杠的值
# 存进去之后**永远匹配不上任何真实链接**（`host_of` 取出来的从来不含它们），
# 于是后台里出现一行"看着拉黑了、谁都拦不住"的假条目。宁可当场退回一句人话。
_HOST_RE = re.compile(r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?"
                      r"(?:\.[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?)+$")


def host_of(url: str) -> str:
    """从链接里取主机名，口径与闸门那一套同源（`scraper._validate_url` 用的也是 `urlparse().hostname`）。

    Python 已经把大小写归一下来了、端口不在 `hostname` 里；`rstrip(".")` 处理尾点
    （`www.example.com.` 与 `www.example.com` 是同一个站，留两条行就等于没合并）。
    取不出来回空串——调用方按"这一条不记账"处理，不抛：记账坏一次不该把抓取判死。
    """
    try:
        hostname = urlparse(url).hostname
    except ValueError:
        return ""
    return (hostname or "").strip().lower().rstrip(".")


def clean_host(raw: str) -> str:
    """后台手工加那一格的字 → 规范化主机名；不合格抛 UserError（文案直接进那一页的红话）。

    容忍三种手滑：粘了整条链接（砍掉协议与路径）、带大写字母、前后有空格。
    不接受的：没有点（`localhost`、`127`）、带空格／端口／`@`／通配符。
    """
    host = (raw or "").strip().lower()
    for scheme in ("http://", "https://", "//"):
        if host.startswith(scheme):
            host = host[len(scheme):]
            break
    host = host.split("/")[0].split("?")[0].split("#")[0]
    host = host.strip().rstrip(".")
    if not host:
        raise UserError("要填一个主机名，例如 www.example.com")
    if len(host) > MAX_HOST_LEN:
        raise UserError(f"主机名太长了（最多 {MAX_HOST_LEN} 个字符）")
    if not _HOST_RE.match(host):
        raise UserError("主机名形状不对：要形如 www.example.com，不带端口、路径和空格")
    return host


def row_is_blocked(row: SourceBlocklist | None) -> bool:
    """唯一的一份"拦不拦"判据：手工加的那一行立刻生效，自动那一半要攒够阈值。

    规格 §三③＋§五那两格的合体。查一次读回整行再在这里判，而不是把这条规则写成 SQL——
    同一句规则在 SQL 里再落一遍，就有两处可以改，而改错的那一处是**屏上看不出来的**那一处。
    """
    if row is None:
        return False
    return row.source == SOURCE_MANUAL or row.fail_count >= AUTO_THRESHOLD


def find(db: Session, host: str) -> SourceBlocklist | None:
    if not host:
        return None
    return db.query(SourceBlocklist).filter(SourceBlocklist.host == host).one_or_none()


def is_blocked_url(db: Session, url: str) -> bool:
    """提取入口那一句前置查询：一次按唯一索引读，不出网（规格 §四）。"""
    return row_is_blocked(find(db, host_of(url)))


def note_site_failure(db: Session, url: str, status_code: int | None = None) -> None:
    """记一次站点级确定性失败。够阈值那一次自然就开始拦了——没有"进名单"这个独立动作。

    ⚠ 谁调用它才是重点：只有 `ingest_tasks` 那两个落点（4xx／5xx、200 且正文 0 字）。
    别把它当通用失败记账用，规格 §三① 那四类一旦进来，这台机器就会把我们自己的故障拉黑成站点。
    """
    host = host_of(url)
    if not host:
        logger.warning("来源黑名单：这条链接取不出主机名，这次失败不记账 url=%s", url)
        return
    now = datetime.now(timezone.utc)
    row = find(db, host)
    if row is None:
        row = SourceBlocklist(host=host, fail_count=0, source=SOURCE_AUTO)
        db.add(row)
    row.fail_count = (row.fail_count or 0) + 1
    row.last_status = status_code
    row.last_failed_at = now
    try:
        db.commit()
    except Exception:
        # 两个 worker 同时给同一个新主机名建行时会撞那条唯一索引。撞了就是"已经有人记过了"，
        # 撤回去把那一行读回来再记一次；再找不到才算真坏了（表没建、库锁死），那句话抛给调用方。
        db.rollback()
        row = find(db, host)
        if row is None:
            raise
        row.fail_count = (row.fail_count or 0) + 1
        row.last_status = status_code
        row.last_failed_at = now
        db.commit()
    if row.fail_count == AUTO_THRESHOLD and row.source == SOURCE_AUTO:
        # 这一行只在"刚好跨线"那一次打：它是现网唯一能看出"这个站是被自动拉黑的"时刻的日志。
        logger.warning("来源黑名单：host=%s 累计失败 %s 次，已自动拦下（最后一次 HTTP=%s）",
                       host, row.fail_count, status_code)


def describe(row: SourceBlocklist) -> dict:
    return {
        "id": row.id,
        "host": row.host,
        "fail_count": row.fail_count,
        "last_status": row.last_status,
        "last_failed_at": row.last_failed_at.isoformat() if row.last_failed_at else None,
        "source": row.source,
        "blocked": row_is_blocked(row),
    }


def list_rows(db: Session) -> list[dict]:
    """后台那一栏的全表：还没够阈值的行也要给——"失败次数"那一列的意义就是让人看出阈值真不真。"""
    rows = db.query(SourceBlocklist).order_by(
        SourceBlocklist.fail_count.desc(), SourceBlocklist.host.asc()
    ).all()
    return [describe(r) for r in rows]


def add_manual(db: Session, raw_host: str) -> dict:
    """手工加一条。规格 §六第 5 条：**不要求先攒够 3 次**，否则管理员没法立刻拉黑一个新站。

    已经在表里（自动攒出来的）不新建一行，只把这一行的身份改成手工——
    同一台主机两行是这张表不能存在的状态（唯一索引也不同意），而"我手工确认过"必须盖得住
    那一行原本怎么来的。
    """
    host = clean_host(raw_host)
    row = find(db, host)
    if row is None:
        row = SourceBlocklist(host=host, fail_count=0, source=SOURCE_MANUAL)
        db.add(row)
    else:
        row.source = SOURCE_MANUAL
    db.commit()
    db.refresh(row)
    logger.info("来源黑名单：管理员手工加入 host=%s（此前累计 %s 次）", host, row.fail_count)
    return describe(row)


def remove(db: Session, raw_host: str) -> str:
    """手工移除＝连账一起删（他要的那格就叫"删"）。

    规格 §六第 4 条钉的是反向：**移出之后同一主机必须放行**，不许出现"移出还被拦"。
    所以这里不写"标记成已解禁"、不留一行 `fail_count` 攒着——留着它就还是 blocked，
    或者要再引入一栏布尔，两条都比"下一次从零数"难读。
    """
    host = clean_host(raw_host)
    row = find(db, host)
    if row is None:
        raise UserError(f"黑名单里没有 {host} 这一条")
    # 计数在删之前先抄出来：commit 之后这一枚实例已经是"已删除"状态，再读它的任何一栏
    # 都要回库里取，而那一条已经不在了（SQLAlchemy 在这里抛 ObjectDeletedError，不是给 None）。
    failed = row.fail_count or 0
    db.delete(row)
    db.commit()
    logger.info("来源黑名单：管理员手工移出 host=%s（此前累计 %s 次）", host, failed)
    return host
