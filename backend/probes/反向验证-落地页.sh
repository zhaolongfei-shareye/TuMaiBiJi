#!/bin/bash
# 反向验证：逐条把实现改坏，确认对应的判据真的会红。
# 每条都用 cp 备份 + cp 还原（不碰 git），还原后比对 md5 证明没把文件改残。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
PY=".venv/bin/python -m pytest -q"
L=app/api/routes/landing.py
S=app/services/sharing.py
mkdir -p /tmp/rv-bak

run() {  # run <标号> <说明> <应当红的用例关键字> <改动命令>
  local tag="$1" desc="$2" needle="$3" mut="$4"
  cp "$L" /tmp/rv-bak/L; cp "$S" /tmp/rv-bak/S
  if ! eval "$mut"; then echo "$tag 改动命令失败，跳过"; cp /tmp/rv-bak/L "$L"; cp /tmp/rv-bak/S "$S"; return; fi
  if eval "$PY -k '$needle'" >/tmp/rv-out 2>&1; then
    echo "$tag ★假绿★：$desc —— 实现改坏了，但判据 \"$needle\" 仍然通过"
    tail -3 /tmp/rv-out | sed 's/^/      /'
  else
    echo "$tag 红（符合预期）：$desc"
  fi
  cp /tmp/rv-bak/L "$L"; cp /tmp/rv-bak/S "$S"
  if [ "$(md5 -q "$L")" != "$(md5 -q /tmp/rv-bak/L)" ] || [ "$(md5 -q "$S")" != "$(md5 -q /tmp/rv-bak/S)" ]; then
    echo "$tag 还原失败，检查 $L / $S"
  fi
}

m_a() { perl -0pi -e 's/    share = active_share_by_token\(db, token\)\n    if share is None:/    share = db.query(Share).filter(Share.token == token, Share.is_active == True).first()  # noqa\n    if share is None:/' "$L"; }
m_b() { perl -0pi -e 's/        return HTMLResponse\(_gone\(lang\), status_code=404, headers=_NO_STORE\)\n    return HTMLResponse\(_page/        return HTMLResponse(_gone(lang) + f"<!--{token}-->", status_code=404, headers=_NO_STORE)\n    return HTMLResponse(_page/' "$L"; }
m_c() { perl -0pi -e 's/<h1>\{_e\(title\)\}<\/h1>/<h1>{title}<\/h1>/' "$L"; }
m_d() { perl -0pi -e 's/    safe = \[u for u in links if u\.lower\(\)\.startswith\(\("https:\/\/", "http:\/\/"\)\)\]/    safe = links/' "$L"; }
m_e() { perl -0pi -e 's/    return HTMLResponse\(_page\(share, lang\), headers=_NO_STORE\)/    return HTMLResponse(_page(share, lang))/' "$L"; }
m_f() { perl -0pi -e 's/        reporter_bucket=_bucket\(request\),/        reporter_bucket=_bucket(request),\n        hidden=True,/' "$L"; }
m_g() { perl -0pi -e 's/\@limiter\.limit\("6\/hour"\)\n//' "$L"; }
m_h() { perl -0pi -e 's/^SNAPSHOT_COLUMNS = \("title", "summary", "tags", "key_links", "key_points", "source_url"\)/SNAPSHOT_COLUMNS = ("title", "summary", "tags", "key_links", "key_points", "source_url", "content")/m' "$S"; }

run A "落地页自己只 filter(is_active)，不再问那唯一一把尺子" "过期那张码" m_a
run B "失效页带上 token，撤掉与不存在不再同一张纸"            "撤掉的码与不存在的码" m_b
run C "标题不转义"                                            "尖括号" m_c
run D "key_links 不做网址白名单"                              "非网址的链接列" m_d
run E "公开页不带 no-store"                                   "no_store" m_e
run F "一条举报就把页隐藏"                                    "举报落库一行" m_f
run G "举报口摘掉限流装饰器"                                  "限流" m_g
run H "给送检名单加一列而落地页没同步"                        "送检范围" m_h

echo "=== 全部还原后复跑，必须全绿 ==="
$PY tests/test_landing_page.py 2>&1 | tail -1
