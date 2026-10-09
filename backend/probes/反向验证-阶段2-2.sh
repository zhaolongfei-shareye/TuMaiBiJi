#!/bin/bash
# 反向验证（阶段2-2：`/v1` 两种钥匙、苹果验签、一次性短码与合并）：
# 逐条把这一批的实现改坏，确认对应的判据真的会红。全程 cp 备份 + cp 还原，不碰 git。
#
# 判据口径与本仓既有的两条一致：
# - 每条突变先 `--collect-only` 问一句"这根针到底覆盖几条用例"（0 条就直接作废，别往下跑）。
#   少了这一步，脚本会**自己造★假绿★**：`pytest -k` 空匹配的退出码是 5，被 `if eval` 读成"红"。
#   10-09 那批就出过一次——针指着一份文件重写时被丢掉的用例。
# - 每条突变再比 md5 证明"改动真在盘上"（10-09 就被"命令 exit 0 却一句没换"骗过一次）。
# - 红了才算数；绿了就是★假绿★，得记进文档而不是悄悄改掉那条判据。
#
# 四条**已知撤了不红**的，写在最后，不在这里冒充测过：
# - D `algorithms=["RS256"]` 之外的 `audience=`：撤掉之后 HS256 混淆那一条仍然绿，因为 PyJWT 自己就拒绝
#   把非对称密钥当 HMAC 的 secret 用（InvalidKeyError）。这一层是**双层防线**，
#   我们那一行不是唯一挡得住的东西，所以它不许被当成唯一的凭据（详见产品需求.md「阶段2-2 落成」那一节，现编号 §8.174）。
# - `has_notes` 里那个 `str(...)`：撤掉在 SQLite 上看不出来（TEXT 亲和性会自己转），
#   只有 Postgres 会红（`operator does not exist: text = integer`）。所以它靠的是
#   与本仓 routes/user.py 同一口径，不是靠这条尺子。
# - U「JWKS 里筛掉 kty != RSA」：撤掉仍然 401、不冒 500，因为下面那圈 except 接住了
#   `InvalidKeyError` / `ValueError`。这一对是**故意留的两层**（U 与 U2 各自单独撤：
#   撤 U2 必红、撤 U 不红），所以 U 这条红不了不代表筛选没用——它只是不唯一。
# - S3「解绑时先抬代次、再摘登录行」这两句的顺序：调过来仍然全绿。实测原因是
#   `SessionLocal(autoflush=False)`——`detach_users_of` 只改内存对象，`bump_generation`
#   那句 SELECT 打到库上时 `account_id` 还是旧值，那一行照样被抬。顺序是**买将来的保险**，
#   不是今天的行为差异；`linking.unbind` 那段注释按这个口径改过，不再写"反过来就会留在原地"。
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
VB=app/api/routes/v1_account.py
mkdir -p /tmp/rv-bak3

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  # 先问"这根针到底扎不扎得到用例"，再去改坏实现。少了这一步，脚本会**自己造★假绿★**：
  # `pytest -k` 一条都没匹配到时退出码是 5，`if eval ...` 读成"非零 = 红 = 符合预期"，
  # 于是一条根本不存在的判据被记成"改坏了、它红了、所以它有效"。10-09 那批里真出过一次
  # （针指着一份文件重写时被我丢掉的那条用例）。
  local hits
  hits=$(eval "$PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    return
  fi
  cp "$file" "/tmp/rv-bak3/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过"; cp "/tmp/rv-bak3/$tag" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak3/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if eval "$PY -k '$needle'" >/tmp/rv-out3 2>&1; then
    echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out3 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期，针覆盖 $hits 条）：$desc"
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
  "perl -pi -e 's/^    if account\.generation != payload\[\"gen\"\]:/    if False:  # rv/' $AU" "$AU"

run C2 "get_current_account 不再要求 gen 在场（缺字段当成代次 1）" "账号钥匙少了_gen_那一格开不了门" \
  "perl -pi -e 's/^    if \"gen\" not in payload:/    if False:  # rv/' $AU" "$AU"

run C3 "_decode_token 不再要求 exp 与 jti 在场" "解码器认不了缺_exp_或缺_jti" \
  "perl -pi -e 's/options=\{\"require\": \[\"sub\", \"exp\", \"jti\"\]\}/options={}/' $AU" "$AU"

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

run R "闸门只剩「看身份行」那一半" "已经绑过另一个微信的_iphone_409" \
  "perl -pi -e 's/^    if \"wechat\" in identity_providers\\(db, target\\.id\\) or users_of\\(db, target\\.id\\):/    if users_of(db, target.id):  # rv/' $LK" "$LK"

run R2 "闸门只剩「看登录行」那一半（P0-1 那一刀）" "身份行没了而登录行还挂着_闸门也要挡住" \
  "perl -pi -e 's/^    if \"wechat\" in identity_providers\\(db, target\\.id\\) or users_of\\(db, target\\.id\\):/    if \"wechat\" in identity_providers(db, target.id):  # rv/' $LK" "$LK"

run R3 "users_of 不再只认带 openid 的行（把 iPhone 自己的行当成微信绑定）" "两边都有笔记_取较早创建的那个" \
  "perl -0pi -e 's/    return db\.query\(User\)\.filter\(\n        User\.account_id == account_id,\n        User\.openid\.isnot\(None\),\n    \)\.all\(\)/    return db.query(User).filter(User.account_id == account_id).all()/' $LK" "$LK"

run S "解绑不再拦「最后一条登录方式」" "最后一条不许摘" \
  "perl -pi -e 's/^    if total == len\(rows\):/    if False:  # rv/' $LK" "$LK"

run S2 "解绑微信时不摘登录行（P0-1 的实现那一半）" "解绑微信那一条会把登录行一起摘掉" \
  "perl -pi -e 's/^    if provider == \"wechat\":/    if False:  # rv/' $LK" "$LK"

run S3 "解绑时先摘人再抬代次（那个人手里那把旧钥匙抬不到）" "解绑微信那一条会把登录行一起摘掉" \
  "perl -0pi -e 's/    accounts\.bump_generation\(db, account\)\n    if provider == \"wechat\":\n        detach_users_of\(db, account\.id\)\n/    if provider == \"wechat\":\n        detach_users_of(db, account.id)\n    accounts.bump_generation(db, account)\n/' $LK" "$LK"

run S4 "创建时间缺失那道守卫摘掉（NULL 当成可比值）" "创建时间缺失要响不许当成_1970" \
  "perl -pi -e 's/^    if account\.created_at is None:/    if False:  # rv/' $LK" "$LK"

# ── 10-09 审计回执新增的那几道守卫 ───────────────────────────────
run U "JWKS 不再筛 kty=RSA（一枚 EC 密钥把登录打成 500）" "密钥端点里的非_rsa_密钥不许把登录打成_500" \
  "perl -pi -e 's/ and k\.get\(\"kty\"\) == \"RSA\"//' $AI" "$AI"

run U2 "验签那段的 except 退回只接 InvalidTokenError" "密钥端点里的非_rsa_密钥不许把登录打成_500" \
  "perl -pi -e 's/except \(jwt\.InvalidTokenError, jwt\.InvalidKeyError, ValueError\) as exc:/except jwt.InvalidTokenError as exc:/' $AI" "$AI"

run V "/v1 微信登录改回按身份行认人（P0-2 那一刀）" "分家状态下两条门给的是同一条_account" \
  "perl -pi -e 's/^    account = accounts\.ensure_for_user\(db, user\)/    account = accounts.ensure_for_provider(db, \"wechat\", user.openid)  # rv/' $VA" "$VA"

run W "生成短码那道门不再限流" "四道门都在注册表里" \
  "perl -0pi -e 's/\@limiter\.limit\(\"5\/minute\"\)\ndef create_link_code\(/def create_link_code(/' $VB" "$VB"

run W2 "苹果登录那道门不再限流" "四道门都在注册表里" \
  "perl -0pi -e 's/\@limiter\.limit\(\"5\/minute\"\)\nasync def apple_login\(/async def apple_login(/' $VA" "$VA"


run T "创建时间撞平时的平局换人（把小于等于改成严格小于）" "创建时间一模一样_发起那一趟的一方是主" \
  "perl -pi -e 's/_created_at\(a\) <= _created_at\(b\)/_created_at(a) < _created_at(b)/' $LK" "$LK"

echo "=== 全部还原后复跑本批两把尺子，必须全绿 ==="
$PY tests/test_v1_auth_and_link.py tests/test_account_and_identity.py 2>&1 | tail -1
