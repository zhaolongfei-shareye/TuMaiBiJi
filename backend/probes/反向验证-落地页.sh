#!/bin/bash
# 反向验证（落地页那一批）：逐条把实现改坏，确认对应的判据真的会红。
# 每条都用 cp 备份 + cp 还原（全程不碰 git），还原后比 md5 证明没把文件改残。
# 闸门那份公共实现见 probes/反向验证-lib.sh（10-10 之前这一支连 --collect-only 预数都没有，
# 也就是 `-k` 空匹配退出码 5 那类★假绿★的前置检查都没做）。
cd /Users/zlfmac/Documents/TuMaiBiJi/backend || exit 1
source probes/反向验证-lib.sh
rv_init 落地页
L=app/api/routes/landing.py
S=app/services/sharing.py

m_a() { perl -0pi -e 's/    share = active_share_by_token\(db, token\)\n    if share is None:/    share = db.query(Share).filter(Share.token == token, Share.is_active == True).first()  # noqa\n    if share is None:/' "$L"; }
m_b() { perl -0pi -e 's/        return HTMLResponse\(_gone\(lang\), status_code=404, headers=_NO_STORE\)\n    return HTMLResponse\(_page/        return HTMLResponse(_gone(lang) + f"<!--{token}-->", status_code=404, headers=_NO_STORE)\n    return HTMLResponse(_page/' "$L"; }
m_c() { perl -0pi -e 's/<h1>\{_e\(title\)\}<\/h1>/<h1>{title}<\/h1>/' "$L"; }
m_d() { perl -0pi -e 's/    safe = \[u for u in links if u\.lower\(\)\.startswith\(\("https:\/\/", "http:\/\/"\)\)\]/    safe = links/' "$L"; }
m_e() { perl -0pi -e 's/    return HTMLResponse\(_page\(share, lang\), headers=_NO_STORE\)/    return HTMLResponse(_page(share, lang))/' "$L"; }
m_f() { perl -0pi -e 's/        reporter_bucket=_bucket\(request\),/        reporter_bucket=_bucket(request),\n        hidden=True,/' "$L"; }
m_g() { perl -0pi -e 's/\@limiter\.limit\("6\/hour"\)\n//' "$L"; }
m_h() { perl -0pi -e 's/^SNAPSHOT_COLUMNS = \("title", "summary", "tags", "key_links", "key_points", "source_url"\)/SNAPSHOT_COLUMNS = ("title", "summary", "tags", "key_links", "key_points", "source_url", "content")/m' "$S"; }

rv_run A "落地页自己只 filter(is_active)，不再问那唯一一把尺子" "过期那张码" m_a "$L"
rv_run B "失效页带上 token，撤掉与不存在不再同一张纸"            "撤掉的码与不存在的码" m_b "$L"
rv_run C "标题不转义"                                            "尖括号" m_c "$L"
rv_run D "key_links 不做网址白名单"                              "非网址的链接列" m_d "$L"
rv_run E "公开页不带 no-store"                                   "no_store" m_e "$L"
rv_run F "一条举报就把页隐藏"                                    "举报落库一行" m_f "$L"
rv_run G "举报口摘掉限流装饰器"                                  "限流" m_g "$L"
rv_run H "给送检名单加一列而落地页没同步"                        "送检名单里的每一列" m_h "$S"

echo "=== 全部还原后复跑，必须全绿 ==="
.venv/bin/python -m pytest -q tests/test_landing_page.py 2>&1 | tail -1
rv_status
