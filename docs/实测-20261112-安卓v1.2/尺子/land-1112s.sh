#!/bin/bash
# 1112s：只改注释（把两处没留档的风暴读数换成留档里的真数）＋ index.html 两枚缓存串
set -e
ROOT=/var/www/tumaibiji-h5
IN=/tmp/h5in-1112s
BK=/var/backups/tumaibiji-h5/1112s
mkdir -p "$BK/js"
for f in index.html js/api.js js/app.js; do
  cp -p "$ROOT/$f" "$BK/$f"
done
install -o www-data -g www-data -m 644 "$IN/index.html" "$ROOT/index.html"
install -o www-data -g www-data -m 644 "$IN/api.js"     "$ROOT/js/api.js"
install -o www-data -g www-data -m 644 "$IN/app.js"     "$ROOT/js/app.js"
echo "--- 落地后回读 ---"
md5sum "$ROOT/index.html" "$ROOT/js/api.js" "$ROOT/js/app.js"
echo "--- 回滚副本 ---"
md5sum "$BK/index.html" "$BK/js/api.js" "$BK/js/app.js"
echo "--- web 根里不许有 .bak ---"
find "$ROOT" -name '*.bak*' -print | head