#!/bin/bash
# 反向验证（阶段2-2：`/v1` 两种钥匙、苹果验签、一次性短码与合并）：
# 逐条把这一批的实现改坏，确认对应的判据真的会红。全程 cp 备份 + cp 还原，不碰 git。
#
# 判据口径与本仓既有的两条一致：
# - 每条突变先比 md5 证明"改动真在盘上"（10-09 就被"命令 exit 0 却一句没换"骗过一次）。
# - 红了才算数；绿了就是★假绿★，得记进文档而不是悄悄改掉那条判据。
#
# 两条**已知撤了不红**的，写在最后，不在这里冒充测过：
# - `algorithms=["RS256"]`：撤掉之后 HS256 混淆那一条仍然绿，因为 PyJWT 自己就拒绝
#   把非对称密钥当 HMAC 的 secret 用（InvalidKeyError）。这一层是**双层防线**，
#   我们那一行不是唯一挡得住的东西，所以它不许被当成唯一的凭据（详见 §8.172）。
# - `has_notes` 里那个 `str(...)`：撤掉在 SQLite 上看不出来（TEXT 亲和性会自己转），
#   只有 Postgres 会红（`operator does not exist: text = integer`）。所以它靠的是
#   与本仓 routes/user.py 同一口径，不是靠这条尺子。
#
# 另外三条（D / 老的两把 kind 判据）第一轮也是★假绿★，本轮的处理是**给守卫补上能分辨的尺子**，
# 而不是把守卫删掉当成没这回事：
# - D：PyJWT 在没传 audience 时自己就拒（同一发 401），所以"撤掉整句比较"看不出来。
#   补了 D2（把期望值换成别家的）钉正面那一发，才证明比的确实是我们配的那个值。
# - A / B：`int()` 撞类型和"按 sub 查不到那一行"都会给出 401，只比状态码分不出守卫有没有跑。
#   所以两条判据各加一句**报错文案**断言——文案正是这两道守卫唯一多做的那件事。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
AU=app/core/auth.py
AI=app/core/apple_identity.py
LC=app/services/link_codes.py
LK=app/services/linking.py
SV=app/services/accounts.py
VA=app/api/routes/v1_auth.py
T1=tests/test_v1_auth_and_link.py
mkdir -p /tmp/rv-bak3

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  cp "$file" "/tmp/rv-bak3/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过"; cp "/tmp/rv-bak3/$tag" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak3/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if eval "$PY -k '$needle'" >/tmp/rv-out3 2>&1; then
    echo "$tag ★假绿★：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out3 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期）：$desc"
  fi
  cp "/tmp/rv-bak3/$tag" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q /tmp/rv-bak3/$tag)" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# ── 两种钥匙各开各的门 ────────────────────────────────────────────
run A "get_current_user 不再认 kind=account（UUID 掉进 int 冒 500）" "账号钥匙开不了_api_那扇门" \
  "perl -pi -e 's/^    if payload\.get\(\"kind\"\) == \"account\":/    if False:  # rv/' $AU" "$AU"

run A2 "int(sub) 那层 ValueError 兜底整个撤掉（坏 sub 变成 500）" "不是账号也不是用户id的sub" \
  "perl -0pi -e 's/    try:\\n        user_id = int\\(payload\\[\"sub\"\\]\\)\\n    except ValueError:\\n        raise HTTPException\\(status_code=401, detail=\"无效的 Token\"\\)\\n/    user_id = int(payload[\"sub\"])\\n/' $AU" "$AU"

run B "get_current_account 不再拒老钥匙" "用户钥匙开不了_v1_那扇门" \
  "perl -pi -e 's/^    if payload\.get\(\"kind\"\) != \"account\":/    if False:  # rv/' $AU" "$AU"

run C "get_current_account 不比代次" "代次一抬_账号钥匙当场失效" \
  "perl -pi -e 's/^    if account\.generation != payload\.get\(\"gen\", 1\):/    if False:  # rv/' $AU" "$AU"

# ── 苹果验签：每一环都单独撤一次 ─────────────────────────────────
run D "验签不再比 aud（别的 App 的苹果凭证能登进来）" "aud_是别家的_401" \
  "perl -0pi -e 's/            audience=settings\.APPLE_CLIENT_ID,\n//' $AI" "$AI"

# D 这一条**已知撤了不红**：PyJWT 在没给 audience 时自己就拒绝带 aud 的 token（同一发 401），
# 所以"整句比较没了"和"库替你挡了"在这一条判据上长得一样。真正的凭据是 D2：
# 把期望值换成别家的那个，正面登录那一发必须红——那才证明比的确实是我们配的那个值。
run D2 "audience 换成别家的 Service ID（拿别人的期望值比）" "真签名登进来" \
  "perl -pi -e 's/audience=settings\.APPLE_CLIENT_ID,/audience=\"com.other.service.id\",/' $AI" "$AI"

run E "验签不再比 iss" "iss_不是_appleid_401" \
  "perl -0pi -e 's/            issuer=APPLE_ISSUER,\n//' $AI" "$AI"

run F "验签不再要求 exp/iss/aud/sub 都在" "没有_exp_这一格_401" \
  "perl -pi -e 's/options=\{\"require\": \[\"exp\", \"iss\", \"aud\", \"sub\"\]\}/options={}/' $AI" "$AI"

run G "Service ID 没配时不再拒绝服务（退化成拿空 aud 去比）" "service_id_没配是_503_而不是放行" \
  "perl -pi -e 's/^    if not settings\.APPLE_CLIENT_ID:/    if False:  # rv/' $AI" "$AI"

run H "kid 不认识时不再强刷一次 JWKS（撞密钥轮换就把人挡死）" "apple_换了密钥要先重取一次再判" \
  "perl -pi -e 's/^        by_kid = await _jwks_by_kid\(force_refresh=True\)/        pass  # rv/' $AI" "$AI"

run I "验完签顺手给只有苹果身份的人补一行 users（甲的写法回来）" "不建_users_行" \
  "perl -0pi -e 's/^from app\.models\.account import Account\$/from app.models.account import Account\\nfrom app.models.user import User as _RV_User/m; s/    account = accounts\.ensure_for_provider\(db, \"apple\", provider_uid\)\n/    account = accounts.ensure_for_provider(db, \"apple\", provider_uid)\n    db.add(_RV_User(openid=provider_uid, generation=1))\n    db.commit()\n/' $VA" "$VA"

# ── 短码：哈希、一次消费、过期 ───────────────────────────────────
run J "code_hash 从 keyed HMAC 退成裸 sha256（库泄漏后一百万次能跑穿）" "库里那一格是_hmac" \
  "perl -pi -e 's/hmac\.new\(settings\.JWT_SECRET_KEY\.encode\(\), code\.encode\(\), hashlib\.sha256\)\.hexdigest\(\)/hashlib.sha256(code.encode()).hexdigest()/' $LC" "$LC"

run K "mark_used 不再带 used_at 为空这个条件" "并发的两趟" \
  "perl -pi -e 's/\.filter\(LinkCode\.id == row\.id, LinkCode\.used_at\.is_\(None\)\)/.filter(LinkCode.id == row.id)  # rv/' $LC" "$LC"

run L "find_usable 不再看用没用过" "一张码只能消费一次" \
  "perl -pi -e 's/^    if row is None or row\.used_at is not None:/    if row is None:  # rv/' $LC" "$LC"

run M "find_usable 不再看过没过期" "过期的码_400_且不动账" \
  "perl -pi -e 's/^    if datetime\.now\(timezone\.utc\) >= _as_utc\(row\.expires_at\):/    if False:  # rv/' $LC" "$LC"

# ── 合并方向、连带清理与吊销 ─────────────────────────────────────
run N "choose_main 不再认「只有你有笔记就你是主」" "有笔记的那边是主" \
  "perl -pi -e 's/^    if a_notes and not b_notes:/    if False:  # rv/' $LK" "$LK"

run N2 "choose_main 不再认「只有对方有笔记就对方是主」" "只有_iphone_那边有笔记_那边是主" \
  "perl -pi -e 's/^    if b_notes and not a_notes:/    if False:  # rv/' $LK" "$LK"

run O "创建时间比反了（较早创建的那个反而被并掉）" "两边都没笔记_也取较早创建的那个" \
  "perl -pi -e 's/return \(a, b\) if _created_at\(a\) <= _created_at\(b\) else \(b, a\)/return (a, b) if _created_at(a) >= _created_at(b) else (b, a)/' $LK" "$LK"

run P "merge_into 不删被并掉那条 account 名下的码" "合并之后名下短码不留" \
  "perl -0pi -e 's/    db\.query\(LinkCode\)\.filter\(LinkCode\.account_id == absorb\.id\)\.delete\(synchronize_session=False\)\n//' $LK" "$LK"

run Q "bump_generation 只抬 account、不抬名下 users（小程序那把钥匙还活着）" "合并之后两侧钥匙全部失效" \
  "perl -pi -e 's/^        row\.generation = row\.generation \+ 1/        pass  # rv/' $SV" "$SV"

run R "一个 iPhone 只能绑一个微信号那道闸门撤掉" "已经绑过另一个微信的_iphone_409" \
  "perl -pi -e 's/^    if \"wechat\" in identity_providers\(db, target\.id\):/    if False:  # rv/' $LK" "$LK"

run S "解绑不再拦「最后一条登录方式」" "最后一条不许摘" \
  "perl -pi -e 's/^    if total == len\(rows\):/    if False:  # rv/' $LK" "$LK"

run T "创建时间撞平时的平局换人（`<=` 改成 `<`）" "创建时间一模一样_发起那一趟的一方是主" \
  "perl -pi -e 's/_created_at\(a\) <= _created_at\(b\)/_created_at(a) < _created_at(b)/' $LK" "$LK"

echo "=== 全部还原后复跑本批两把尺子，必须全绿 ==="
$PY tests/test_v1_auth_and_link.py tests/test_account_and_identity.py 2>&1 | tail -1
