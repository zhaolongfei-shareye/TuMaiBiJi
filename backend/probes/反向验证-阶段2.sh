#!/bin/bash
# 反向验证（阶段2-1 与 2-2 的 openid 那一刀）：逐条把那一批实现改坏，确认对应的判据真的会红。
# 每条都用 cp 备份 + cp 还原（全程不碰 git），还原后比 md5 证明没把文件改残。
#
# 这一批有两条建表路要分开钉：用例走 create_all（读模型），线上走 alembic（读迁移）。
# 所以 C 与 F 是同一条唯一索引的两面：C 改迁移、F 改模型，红的尺子不是同一把。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
AU=app/core/auth.py
SV=app/services/accounts.py
MD=app/models/account.py
MG=alembic/versions/b7d2f4a1c903_accounts_and_account_identities.py
MG2=alembic/versions/d5a3f19bc728_users_openid_nullable.py
UR=app/api/routes/user.py
DE=app/services/deletion.py
# 闸门那份公共实现见 probes/反向验证-lib.sh（10-10 之前这一支没有 --collect-only 预数、
# 没有"改坏之后还编译得通"那道、也没有锁与 trap；本支原有的"突变没落盘"那一道保留在 lib 里）。
source probes/反向验证-lib.sh
rv_init 阶段2

# A：登录那一路不再给每个人立 account
rv_run A "auth.py 里那句 ensure_for_user 摘掉"            "走真登录路由进来的那个人也有account" \
  "perl -0pi -e 's/    accounts\.ensure_for_user\(db, user\)\n//' $AU" "$AU"

# B：幂等那一道撤掉——已有 account 也当没有，第二次登录再建一个
rv_run B "ensure_for_user 不再认已有的 account"           "第二次登录不许再多建一个account" \
  "perl -0pi -e 's/    account = db\.query\(Account\)\.filter\(Account\.id == user\.account_id\)\.first\(\) if user\.account_id else None/    account = None/' $SV" "$SV"

# C：迁移那一道唯一索引降级成普通索引（线上那条路）
#    第一版这里钉的是 compare_metadata 那把尺子，实测★假绿★：alembic 的索引比对看不见 unique
#    属性。所以补了 `test_真迁移建出来的库里同一个人也建不出第二条身份`，改坏迁移要红的是那一条。
rv_run C "迁移里 ux_identity_provider_uid 不再 unique"     "真迁移建出来的库里同一个人也建不出第二条身份" \
  "perl -0pi -e 's/unique=True\)/)/' $MG" "$MG"

# D：回填那句整个不跑
rv_run D "迁移的回填 select 挡死，老用户一个都不建 account"  "每个老用户一个account" \
  "perl -0pi -e 's/where account_id is null order by id/where account_id is null and 1=0 order by id/' $MG" "$MG"

# E：回填建了 account 却不给 verified_at
rv_run E "回填那句把 verified_at 留成 null"               "每个老用户一个account" \
  "perl -0pi -e 's/, CURRENT_TIMESTAMP\)/, NULL)/' $MG" "$MG"

# F：模型这一面——把唯一索引整条摘掉（用例走 create_all 的那条路）
rv_run F "模型里那道唯一索引整条摘掉"                     "同一个平台的同一个人建不出第二条身份" \
  "perl -0pi -e 's/        Index\(\"ux_identity_provider_uid\", \"provider\", \"provider_uid\", unique=True\),\n//' $MD" "$MD"

# G：注销不再连带删 account 与身份
#    ⚠ 这把的模式 10-10 死过一次：原锚是**待拍① 落地之前**那一版注销的形状（`if user.account_id:`），
#    收窄成"名下只剩这一行才带走"之后那句话不在了，perl 跑完 exit 0 却一字未改。
#    旧 `run()` 里有 md5 那道，所以报的是★突变没落盘★（不算红也不算绿）——但**没人回头重跑这一支**，
#    文档里那句"11 条全红"就停在代码搬家之前那一刻。改指 `_account_to_take_along` 的出口。
rv_run G "注销时那条 account 名下的连带删除挡死"                       "注销把account与身份一起删掉" \
  "perl -pi -e 's/^    return None if others is not None else user\\.account_id$/    return None  # 反向验证临时改坏/' $UR" "$UR"

# H：这一条迁移没把 openid 放开（迁移那一路）
rv_run H "迁移里 nullable=True 改回 False"                 "迁移之后两个只有Apple身份的人互不挡住" \
  "perl -0pi -e 's/existing_type=sa\.String\\(100\\), nullable=True/existing_type=sa.String(100), nullable=False/' $MG2" "$MG2"

# I：ensure_for_user 那道新守卫摘掉（只有 Apple 身份的人会拼出 provider_uid=NULL）
rv_run I "ensure_for_user 里 openid 为空那道守卫摘掉"      "只有Apple身份的人走微信那一支要当场响" \
  "perl -0pi -e 's/^    if user\.openid is None:/    if False:  # 反向验证临时改坏/m' $SV" "$SV"

# J：登录主路径上那道并发兜底摘掉（赢家通吃变成整趟 500）
#    ⚠ 10-10 重跑这一支时这把报的是★假绿★：老那条 `后到那一趟…` 用例**走不到 except**——
#    pysqlite 的 SELECT 不开事务，后到那一趟的身份查询发生在赢家提交之后，它从头就幂等返回。
#    补了一条真撞（把开头那一发身份读蒙住一次，见 `test_读不到赢家那一趟要认赢家不许多建一个`），
#    针指两条；蒙一次之后实现里那句 `rollback` 一撤就 IntegrityError，实测红在新那条上。
rv_run J "ensure_for_user 撞索引不再认赢家，直接冒出来"      "后到那一趟不许响也不许多建一个account or 读不到赢家那一趟要认赢家不许多建一个" \
  "perl -pi -e 's/^        db\.rollback\(\)/        raise/' $SV" "$SV"

# K：注销不再清举报行（留下指向已删 token 的孤儿）
#    ⚠ 这一把原来指的是 `routes/user.py`——那段清理 10-10 搬进 `services/deletion.py` 了，
#    所以同样是★突变没落盘★。改成指它现在的家。
rv_run K "注销时的举报连带清理挡死"                     "一次删完七类数据 or 分享过的笔记注销那一趟不能撞外键" \
  "perl -0pi -e 's/^    if share_tokens:/    if False:  # 反向验证临时改坏/m' $DE" "$DE"

echo "=== 全部还原后复跑本批，必须全绿 ==="
rv_recheck tests/test_account_and_identity.py tests/test_account_deletion.py
rv_status
