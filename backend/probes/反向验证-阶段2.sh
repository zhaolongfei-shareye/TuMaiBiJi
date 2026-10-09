#!/bin/bash
# 反向验证（阶段2-1）：逐条把那一批实现改坏，确认对应的判据真的会红。
# 每条都用 cp 备份 + cp 还原（全程不碰 git），还原后比 md5 证明没把文件改残。
#
# 这一批有两条建表路要分开钉：用例走 create_all（读模型），线上走 alembic（读迁移）。
# 所以 C 与 F 是同一条唯一索引的两面：C 改迁移、F 改模型，红的尺子不是同一把。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
AU=app/core/auth.py
SV=app/services/accounts.py
MD=app/models/account.py
MG=alembic/versions/b7d2f4a1c903_accounts_and_account_identities.py
UR=app/api/routes/user.py
mkdir -p /tmp/rv-bak2

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  cp "$file" "/tmp/rv-bak2/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过"; cp "/tmp/rv-bak2/$tag" "$file"; return; fi
  # 先证突变真在盘上：改动命令 exit 0 但一句没换（正则没匹配上）时，判据当然还是绿的，
  # 那会被记成"这条判据是假的"——实际是这条突变根本没发生。10-09 就被这一句骗过一次。
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak2/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 改动命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if eval "$PY -k '$needle'" >/tmp/rv-out2 2>&1; then
    echo "$tag ★假绿★：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out2 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期）：$desc"
  fi
  cp "/tmp/rv-bak2/$tag" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q /tmp/rv-bak2/$tag)" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# A：登录那一路不再给每个人立 account
run A "auth.py 里那句 ensure_for_user 摘掉"            "走真登录路由进来的那个人也有account" \
  "perl -0pi -e 's/    accounts\.ensure_for_user\(db, user\)\n//' $AU" "$AU"

# B：幂等那一道撤掉——已有 account 也当没有，第二次登录再建一个
run B "ensure_for_user 不再认已有的 account"           "第二次登录不许再多建一个account" \
  "perl -0pi -e 's/    account = db\.query\(Account\)\.filter\(Account\.id == user\.account_id\)\.first\(\) if user\.account_id else None/    account = None/' $SV" "$SV"

# C：迁移那一道唯一索引降级成普通索引（线上那条路）
#    第一版这里钉的是 compare_metadata 那把尺子，实测★假绿★：alembic 的索引比对看不见 unique
#    属性。所以补了 `test_真迁移建出来的库里同一个人也建不出第二条身份`，改坏迁移要红的是那一条。
run C "迁移里 ux_identity_provider_uid 不再 unique"     "真迁移建出来的库里同一个人也建不出第二条身份" \
  "perl -0pi -e 's/unique=True\)/)/' $MG" "$MG"

# D：回填那句整个不跑
run D "迁移的回填 select 挡死，老用户一个都不建 account"  "每个老用户一个account" \
  "perl -0pi -e 's/where account_id is null order by id/where account_id is null and 1=0 order by id/' $MG" "$MG"

# E：回填建了 account 却不给 verified_at
run E "回填那句把 verified_at 留成 null"               "每个老用户一个account" \
  "perl -0pi -e 's/, CURRENT_TIMESTAMP\)/, NULL)/' $MG" "$MG"

# F：模型这一面——把唯一索引整条摘掉（用例走 create_all 的那条路）
run F "模型里那道唯一索引整条摘掉"                     "同一个平台的同一个人建不出第二条身份" \
  "perl -0pi -e 's/        Index\(\"ux_identity_provider_uid\", \"provider\", \"provider_uid\", unique=True\),\n//' $MD" "$MD"

# G：注销不再连带删 account 与身份
run G "注销那一段的连带删除挡死"                       "注销把account与身份一起删掉" \
  "perl -0pi -e 's/^    if user\.account_id:/    if False:  # 反向验证临时改坏/m' $UR" "$UR"

echo "=== 全部还原后复跑本批，必须全绿 ==="
$PY tests/test_account_and_identity.py tests/test_account_deletion.py 2>&1 | tail -1
