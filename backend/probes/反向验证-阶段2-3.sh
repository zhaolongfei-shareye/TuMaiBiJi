#!/bin/bash
# 反向验证（阶段2-3：待拍②代次水位线 ＋ 待拍①`/api` 注销范围那道闸；站长 2026-10-10"按你建议"那三条里的两条）：
# 逐条把这一批的实现改坏，确认对应的判据真的会红。全程 cp 备份 + cp 还原，不碰 git。
#
# A～F 是水位线那半（`services/generation` ＋ 迁移 `b71f4e0c9d52` 那一格的初值），
# G～J 是那道闸那半（`routes/user.py:_account_to_take_along` ＋ 回体键集合），
# K～R 是错误码那半（`core/error_codes.py` ＋ `main.py` 那行注册 ＋ 429 那一格）。
# K～N 是 10-10 凌晨那批自己写的；O～R 是同一晚**代码审计那轮**补的，四刀打的都是
# "改坏之后现网没有任何症状"的那一类（`root_path`、`/v1x` 过匹配、204/304 的 body 闸门、
# 那句"今天 /v1 发不出 403"），审计报告的原文与逐条核实记在 docs §8.189。
#
# ⚠ 这个脚本自己的**说明文字里不许出现反引号**：`run` 用 `eval` 跑，那会被当成命令替换。
# 10-10 就栽过一次（K、M 两条的日志里冒出 `line 111: /api: No such file or directory`），
# 改干净重跑才算数。
#
# 判据口径与前两批完全一致（`反向验证-阶段2-2.sh`、`反向验证-阶段2-2b.sh`）：
# - 每条突变先 `--collect-only` 数这根针覆盖几条用例。`pytest -k` 空匹配的退出码是 5，
#   少了这一步，脚本会自己造★假绿★。
# - 每条突变再比 md5 证明改动真在盘上。
# - 红了才算数；绿了就是★假绿★，记进文档，不悄悄改掉那条判据。
#
# 这一批特别要验的是**"防线是不是只写在注释里"**：水位线坏掉之后，今天在册的人一个都感觉不到
# （`allocate` 有 live-max 兜底），要等 `users` 被删空一次才咬人。所以除了
# `tests/test_persistent_generation.py` 那七条，deploy.sh 那道 schema 闸门还各查了两面
# （表不在 / 那一格落后于库里代次）——那两面的红是 10-10 把那段真代码抽出来对着一次性库跑的，
# 读数记在 docs 那一节，不在这里重复。
#
# 一条**没做**的突变，写在这里而不是假装做过：把 `app/models/__init__.py` 里
# `from app.models.generation_seq import GenerationSeq` 那行删掉。`tests/test_模型注册齐不齐.py`
# 判的是"__init__ 与 alembic/env.py **任一**挂着就行"，而这一批两处都挂了，所以只删一处它本来就该绿
# ——那是设计如此，不是针没扎到。要验它得两处一起删，那种双文件突变这一套 run() 不做。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
AU=app/core/auth.py
AC=app/services/accounts.py
GE=app/services/generation.py
MI=alembic/versions/b71f4e0c9d52_generation_seq.py
mkdir -p /tmp/rv-bak5

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令> <被改的文件>
  local tag="$1" desc="$2" needle="$3" mut="$4" file="$5"
  local hits
  hits=$(eval "$PY --collect-only -p no:warnings -k '$needle'" 2>/dev/null | grep -c '::')
  if [ "$hits" -eq 0 ]; then
    echo "$tag ★针没扎到用例★：\"$needle\" 在改坏之前就一条都没匹配到 —— 这条不算数"
    return
  fi
  cp "$file" "/tmp/rv-bak5/$tag"
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过（不算红也不算绿）"; cp "/tmp/rv-bak5/$tag" "$file"; return; fi
  if [ "$(md5 -q "$file")" = "$(md5 -q /tmp/rv-bak5/$tag)" ]; then
    echo "$tag ★突变没落盘★：$desc —— 命令跑完了但文件一字未改，这条不算数"
    return
  fi
  if eval "$PY -k '$needle'" >/tmp/rv-out5 2>&1; then
    echo "$tag ★假绿★（针覆盖 $hits 条）：$desc —— 实现改坏了，但判 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out5 | sed 's/^/      /'
  else
    echo "$tag 红（符合预期，针覆盖 $hits 条）：$desc"
  fi
  cp "/tmp/rv-bak5/$tag" "$file"
  if [ "$(md5 -q "$file")" != "$(md5 -q /tmp/rv-bak5/$tag)" ]; then
    echo "$tag 还原失败，检查 $file"
  fi
}

# ── 取号：`core/auth.login_or_register` 那一处 ─────────────────────
run A "取号退回老那句『数全表 max + 1』（users 被删空就回到 1）" \
  "被删那人那把旧钥匙不许开新人的门 or 删空之后中间每一代发过的旧钥匙都开不了新人的门" \
  "perl -pi -e 's/generation=generation\\.allocate\\(db\\)/generation=(max([u.generation for u in db.query(User).all()] or [0]) + 1)  # rv/' $AU" "$AU"

run B "allocate 里那层 live-max floor 撤掉（只信库里那一格）" \
  "库里有人号比水位线高时" \
  "perl -pi -e 's/^    row\\.value = max\\(row\\.value, _live_max\\(db\\)\\) \\+ 1/    row.value = row.value + 1  # rv/' $GE" "$GE"

run C "取号那一趟顺手把全表 generation 一起抬（活人全被踢下线）" \
  "新人注册不许把活人的钥匙抬废" \
  "perl -pi -e 's/generation=generation\\.allocate\\(db\\)\\)/generation=generation.allocate(db))  # rv 占位\n        db.query(User).update({\"generation\": User.generation + 1})/' $AU" "$AU"

# ── 记账：`services/accounts.bump_generation` 那一处 ───────────────
run D "bump 抬完不再把新号记回水位线（只在注册一处喂＝假防线）" \
  "bump那一刀把水位线一起喂进去 or 删空之后中间每一代发过的旧钥匙都开不了新人的门" \
  "perl -0pi -e 's/    if rows:\\n        generation\\.note\\(db, max\\(row\\.generation for row in rows\\)\\)\\n//' $AC" "$AC"

run E "note 里那句比较撤掉（无条件赋值＝水位线会被一次低代次的抬回）" \
  "水位线只许往上走" \
  "perl -0pi -e 's/    if value > row\\.value:\\n        row\\.value = value/    row.value = value  # rv/' $GE" "$GE"

# ── 迁移那一格 ────────────────────────────────────────────────────
run F "迁移把那一格的初值写成 0（现网旧 token 的发号史就此失忆）" \
  "初值是当时的最高代次" \
  "perl -pi -e 's/\\{\"v\": int\\(live_max or 0\\)\\}/{\"v\": 0}  # rv/' $MI" "$MI"

# ── 待拍①：`/api` 注销范围那道闸（同一天站长拍甲，与上面那一批一起落）───────────
UR=app/api/routes/user.py
DE=app/services/deletion.py

run G "把那道闸整个撤掉（回退成无条件带走整条 account——名下还有第二行时也带走）" \
  "名下还有第二行时_account_与那一行都不许动" \
  "perl -pi -e 's/^    return None if others is not None else user\\.account_id/    return user.account_id  # rv/' $UR" "$UR"

run H "把那道闸做过头（连\"名下只剩这一行\"也不带走 account）" \
  "名下只剩这一行时带走整条_account" \
  "perl -pi -e 's/^    return None if others is not None else user\\.account_id/    return None  # rv/' $UR" "$UR"

run I "撤掉\"account 那一行本来就不在\"那支例外（孤儿 openid 不再被摘掉，那个人下次登录撞 RuntimeError）" \
  "注销要连带摘掉占着openid的身份行" \
  "perl -0pi -e 's/    if alive is None:\\n        return user\\.account_id/    if alive is None:\\n        return None  # rv/' $UR" "$UR"

run J "回体里那三格不再预先摆平（键集合重新随\"这一路带不带 account\"变形）" \
  "一次删完七类数据并回报条数" \
  "perl -0pi -e 's/    deleted\\.update\\(\\{\"identities\": 0, \"link_codes\": 0, \"account\": 0\\}\\)\\n//' $DE" "$DE"

# ── 待拍③／#171：`/v1` 错误体那个 code（`core/error_codes.py` ＋ 两处注册）──────────
EC=app/core/error_codes.py
MN=app/main.py
RL=app/core/rate_limit.py
LK=app/services/linking.py

run K "撤掉那句路径判断（/api 那一侧也开始带 code——已上线回体被改动）" \
  "同一条_401_在_api_上不带_code" \
  "perl -pi -e 's|^    if not is_v1_path\\(path\\):|    if False:  # rv|' $EC" "$EC"

run L "给 400 现场编一个名字（站长那条\"没核实过的名字不许写进契约\"就是挡这一手）" \
  "400_不带_code" \
  "perl -pi -e 's/^CODE_BY_STATUS = \\{$/CODE_BY_STATUS = {  # rv\n    400: \"bad_request\",/' $EC" "$EC"

run M "全局 handler 那行注册撤掉（/v1 的 code 从此没人发，而 /api 一个字没变、看不出坏了）" \
  "401_带_unauthorized" \
  "perl -pi -e 's/^app\\.add_exception_handler\\(StarletteHTTPException, http_exception_handler\\)/# rv app.add_exception_handler(StarletteHTTPException, http_exception_handler)/' $MN" "$MN"

run N "把 429 那一格从名单里删掉（限流那一路不再报名字）" \
  "限流那一支注册的就是会翻名字的函数" \
  "perl -0pi -e 's/    429: \"rate_limited\",\\n//' $EC" "$EC"

# O～R 是 10-10 代码审计那轮补的四刀。共同点：**改坏之后现网没有任何症状**（旧门照旧、
# 新门只是少一个键或多一个不该有的键），所以只有刀能证明那四条判据不是装饰。
run O "body 闸门那三行撤掉（204/304 开始带 JSON body，/api 一样中）" \
  "body_必须是空的" \
  "perl -pi -e 's|^    if not is_body_allowed_for_status_code\\(exc\\.status_code\\):|    if False:  # rv|' $EC" "$EC"

run P "路径判断退回 request.url.path（nginx 换成带前缀那种写法之后 /v1 静默不再带 code）" \
  "带_root_path_的前缀路径仍然算_v1" \
  "perl -pi -e 's/^    return get_route_path\\(request\\.scope\\)/    return request.scope[\"path\"]  # rv/' $EC" "$EC"

run Q "is_v1_path 退回成只 startswith（/v1x 这类路径也拿到 code）" \
  "看着像_v1_而不是_v1_的路径不许带_code" \
  "perl -pi -e 's|^    return path == \"/v1\" or path\\.startswith\\(\"/v1/\"\\)|    return path.startswith(\"/v1\")  # rv|' $EC" "$EC"

run R "服务层默认状态码改成 403（error_codes 顶部那句\"v1 发不出 403\"当场变假话）" \
  "v1_那一路今天发不出_403" \
  "perl -pi -e 's/status_code: int = 400\\):/status_code: int = 403):/' $LK" "$LK"

echo "=== 全部还原后复跑这三批的尺子，必须全绿 ==="
$PY tests/test_persistent_generation.py tests/test_v1_account_deletion.py tests/test_account_deletion.py tests/test_v1_error_codes.py 2>&1 | tail -1
