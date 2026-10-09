#!/bin/bash
# 反向验证（阶段2-2b：`DELETE /v1/account` 与抽出来的公共 `services/deletion.purge`）：
# 逐条把这一批的实现改坏，确认对应的判据真的会红。全程 cp 备份 + cp 还原，不碰 git。
#
# 判据口径与 `反向验证-阶段2-2.sh` 完全一致，那两条前置检查都带着：
# - 每条突变先 `--collect-only` 数这根针覆盖几条用例。`pytest -k` **空匹配的退出码是 5**，
#   少了这一步，脚本会自己造★假绿★（10-09 那批真出过：针指着一条被丢掉的用例）。
# - 每条突变再比 md5 证明改动真在盘上（"命令 exit 0 却一句没换"骗过一次）。
# - 红了才算数；绿了就是★假绿★，记进文档而不是悄悄改掉那条判据。
#
# 这一批特别要验的是**抽公共函数有没有把现网那条改掉**：`/api/user/deactivate` 是被十几把
# 尺子钉着的已上线行为，所以每条"范围/连带清理"的判据都在**两个口**上各钉一遍（needle 里
# 那句 `or` 就是这个意思），只钉一边等于另一半没人看。
#
# 10-09 独立审之后加的六条（J～O）钉的都是那批回执里"嘴上说了、尺子没钉"的东西：
# 按值删而不是按对象删（J）、表在外层而不是人在外层（K）、少清一张表要能逐键发现（L、N、O）、
# 认不出 user_id 的那两张表少清了也要响（M）。O 那一刀专门证明 P1-3 那条改值的判据不是装饰：
# 旧的 `sum(...) >= 5` 跨七张表比总数，少清一张它照样绿。
# ⚠ 这一批的针全部跟着实现改过一遍名：`account` 那个对象参数换成了 `account_id`，
# `/api` 那条从 `只删自己那一行登录行` 改名为 `实际范围是整条_account`。留着旧针的突变
# 不会红，只会★突变没落盘★或★针没扎到用例★——那两种都不是"判据有效"。
# ⚠ 10-10 那次改名同理再走一遍：站长拍甲把 `/api` 收窄之后，`实际范围是整条_account` 那条
# 判据被拆成 `名下只剩这一行时带走整条_account` ＋ `名下还有第二行时_account_与那一行都不许动`
# 两条（`routes/user.py:_account_to_take_along`），H 刀的针与突变式都跟着换了；旧的 `purge(db, [user],
# user.account_id)` 那一行在盘上已经不存在，H 刀要是还照旧式写，报的会是★突变没落盘★而不是红。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
DE=app/services/deletion.py
VB=app/api/routes/v1_account.py
UR=app/api/routes/user.py
mkdir -p /tmp/rv-bak4

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits
  hits=$(eval "$PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    return
  fi
  cp "$file" "/tmp/rv-bak4/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过（不算红也不算绿）"; cp "/tmp/rv-bak4/$tag" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak4/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if eval "$PY -k '$needle'" >/tmp/rv-out4 2>&1; then
    echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out4 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期，针覆盖 $hits 条）：$desc"
  fi
  cp "/tmp/rv-bak4/$tag" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q /tmp/rv-bak4/$tag)" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# ── confirm 那道闸 ────────────────────────────────────────────────
run A "删账号那道 confirm 闸整个摘掉（一个 DELETE 就把人删了）" "没确认时一行都不许少" \
  "perl -pi -e 's/^    if not confirm:/    if False:  # rv/' $VB" "$VB"

# ── 回体形状 ─────────────────────────────────────────────────────
run B "回体里那些键不再预先摆平（只有 Apple 身份的人拿到的是空字典）" "回体里每张挂_user_id_的表一律在场" \
  "perl -pi -e 's/^    deleted: dict\[str, int\] = \{key: 0 for key, _ in _BUSINESS_TABLES\}/    deleted: dict[str, int] = {}/' $DE" "$DE"

# ── 连带清理：两个口都钉 ─────────────────────────────────────────
run C "死账号名下的短码不再一起删" "短码一起带走 or 不留死账号名下的码" \
  "perl -0pi -e 's/        deleted\[\"link_codes\"\] = \(\n            db\\.query\\(LinkCode\\)\\.filter\\(LinkCode\\.account_id == account_id\\)\\.delete\\(\)\n        \\)\n//' $DE" "$DE"

run D "举报行不再用删 shares 之前抄的那份清单来清" "收到的举报跟着那份公开一起消失" \
  "perl -pi -e 's/^    if share_tokens:/    if False:  # rv/' $DE" "$DE"

run E "file_ids 不去重（同一张图在客户端被删两次）" "file_ids_带回三处对象并去重保序" \
  "perl -pi -e 's/list\\(dict\\.fromkeys\\(asset_ids\\)\\)/asset_ids/' $DE" "$DE"

# ── 范围：两个口各自的那一半 ─────────────────────────────────────
run F "users 行整个不删（账号删了、登录行还挂着）" "每张挂_user_id_的表都不许留下这个人行" \
  "perl -pi -e 's/^        db\\.delete\\(user\\)/        pass  # rv/' $DE" "$DE"

run G "邀请奖励不再回退（刷奖励那条循环重新敞开）" "注销之后邀请人那笔_bonus_退回" \
  "perl -pi -e 's/^        _release_invitations\\(db, user\\)/        pass  # rv/' $DE" "$DE"

run H "小程序那一路把范围放大成整条 account 名下所有行（删过了界）" "名下还有第二行时_account_与那一行都不许动" \
  "perl -pi -e 's/deletion\\.purge\\(db, \\[user\\], _account_to_take_along\\(db, user\\)\\)/deletion.purge(db, db.query(User).filter(User.account_id == (user.account_id or \"\")).all(), user.account_id)  # rv/' $UR" "$UR"

run I "iPhone 那一路只删带 openid 的行（苹果自己那行留在死账号上）" "v1_那一路删的是整条_account_名下所有登录行" \
  "perl -pi -e 's/^    rows = db\\.query\\(User\\)\\.filter\\(User\\.account_id == account\\.id\\)\\.all\\(\\)/    rows = linking.users_of(db, account.id)  # rv/' $VB" "$VB"

# ── 10-09 独立审之后补的四条 ─────────────────────────────────────
run J "把'按那一格的值删'换回'按查得到的对象删'（撤掉半截账那一次自愈）" "注销要连带摘掉占着openid的身份行" \
  "perl -pi -e 's/^    if account_id is not None:/    if account_id is not None and db.query(Account).filter(Account.id == account_id).first():  # rv/' $DE" "$DE"

run K "循环换回'人在外层'（第二个人的 shares\/jobs 排到第一个人的 notes 之后）" "两张引用notes的表在v1这一路都不许挡路" \
  "perl -0pi -e 's/    if uids:\\n        for key, model in _BUSINESS_TABLES:\\n            deleted\\[key\\] = \\(\\n                db\\.query\\(model\\)\\.filter\\(model\\.user_id\\.in_\\(uids\\)\\)\\.delete\\(\\)\\n            \\)\\n/    for _u in uids:\\n        for key, model in _BUSINESS_TABLES:\\n            deleted[key] = deleted.get(key, 0) + db.query(model).filter(model.user_id == _u).delete()\\n/' $DE" "$DE"

run L "七张表里悄悄撤掉 assets 那张（少清一张）" "每张挂_user_id_的表都不许留下这个人行 or 回体里每张挂_user_id_的表一律在场" \
  "perl -0pi -e 's/    \\(\"assets\", Asset\\),\\n//' $DE" "$DE"

run M "邀请台账不再清（认不出 user_id 的那张表漏了没人说）" "删净之后连认不出_user_id" \
  "perl -pi -e 's/\\(Invitation\\.invitee_id == user\\.id\\) \\| \\(Invitation\\.inviter_id == user\\.id\\)/(Invitation.invitee_id == -777) | (Invitation.inviter_id == -777)/' $DE" "$DE"

run N "先子后父里 jobs 那一半撤掉（老那把外键尺子只看 shares，看不出这一半）" "两张引用notes的表在v1这一路都不许挡路" \
  "perl -0pi -e 's/    \\(\"jobs\", Job\\),\\n//' $DE" "$DE"

run O "400 那一趟先把 assets 那一张清掉并提交（独立审 P1-3 的那句：旧判据跨七张表比总数，少清一张它照样绿）" "没确认时一行都不许少" \
  "perl -0pi -e 's/    if not confirm:\\n        raise HTTPException\\(status_code=400/    from app.models.asset import Asset as _A  # rv\\n    db.query(_A).filter(_A.user_id.in_([str(r.id) for r in db.query(User).filter(User.account_id == account.id).all()])).delete()\\n    db.commit()  # rv：少了这一句不成——HTTPException 一路抛出去时 get_db 的 finally 把会话 close 掉，未提交的删除跟着回滚，那一刀根本落不到库上\\n    if not confirm:\\n        raise HTTPException(status_code=400/' $VB" "$VB"

echo "=== 全部还原后复跑这一批的尺子，必须全绿 ==="
$PY tests/test_v1_account_deletion.py tests/test_account_deletion.py 2>&1 | tail -1
