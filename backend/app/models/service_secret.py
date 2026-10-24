"""后台那一页存的凭据（密钥配置）。一行 = 一个名字当前生效的那一份值。

这张表存在的理由只有一句：**换一把凭据不该等于改 `.env` + 重启服务**。
改 `.env` 那条路要求人能上服务器，而站长自己拍的是「我自己去加」——他在后台填一次就生效，
不必把口令交出来、也不必等一次部署。

它是 `.env` 之上的**一层显式覆盖**，不是第二套配置系统，边界写死在三处：

1. 只有 `app/services/service_secrets.py:resolve()` 那一条读法会看这张表，
   今天真看它的名字全部登记在同文件的 `CONSUMED_NAMES` 里。存一个没人读的名字，
   值就只是躺在库里（后台那一页会照 `consumed` 把这句说出来，不假装生效）。
2. 删掉一行 = 那个名字立刻回到 `.env` 的值。所以"撤回一次改动"不需要知道旧值是什么，
   这一条是它比直接编辑 `.env` 安全的地方，也是它敢上现网的前提。
3. `value` 存明文（`.env` 里也是明文，这台机器上没有任何一层加密能假装保护它），
   代价是**读的一侧绝不能把值交出去**：接口只回长度与指纹，那一页 HTML 由服务端拼，
   服务端手里就没有可回的东西。这不是防外人是防"顺手 `console.log` 一下"和
   journald——见 `service_secrets.describe` 与 `routes/admin_ops.py` 那两个口。

主键直接用名字而不是自增 id：这一张表没有历史（改一次覆盖一次，历史上只留最后一次的时间），
`kind` 那一栏在 `mp_settings` 里同样是字符串主键，两条同型。不写 `ForeignKey()`、
不写 `Column(unique=True)`——SQLite 上后加列加不了外键，而 `unique` 索引
`compare_metadata` 反射不出来（`models/mp_asset.py:44-51` 记的就是这两条坑）。
"""
from sqlalchemy import Column, DateTime, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class ServiceSecret(Base):
    __tablename__ = "service_secrets"

    # 规范化后的大写名字，形如 `DEEPSEEK_API_KEY`。判据与规范化的唯一个出处在
    # `services/service_secrets.py:check_name`，这里不重复写一份。
    name = Column(String(64), primary_key=True)
    value = Column(Text, nullable=False)
    # 操作者自己写的一句话（"DeepSeek 后台 2026-10 新建的那把"）。没有它，
    # 两把同名不同用途的 key 换来换去时分不清库里这一行是谁。
    note = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
