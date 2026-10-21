"""10-22 第五十五次部署的现网端到端取证：三把新闸在**跑着的这份代码里**咬不咬得动。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网内容安全三把闸.py
先要在服务器 /tmp 放三张对照图：`qoder-1022-none.png`（无字 179 B）、`qoder-1022-harmless.png`（正常字样）、
`qoder-1022-risky.png`（已知违规字样）。这三张由本机 PIL 画好再 scp，跑完即删（**不进仓库**：
拿已知违规串造出来的样本留在库里，下次谁翻到都得先问一句"这是不是真有人在用"）。

为什么单开一支而不是靠现网 HTTP 打一遍：这三把闸"拦下"那一路只在**真人 openid** 手上才可能咬
（假串微信回 40003＝没检成＝放行），而现网只有站长那一个号是真人 openid。拿它走 HTTP 就得往他名下
写数据；所以这一支只调**函数本体**、一个字都不写库：文字那两把直接调路由里的闸函数，
图片那把直接调 `note_images._guard_image_text`（它只 OCR＋送检，进桶那一步在它外面）。
`check_text` 在本进程里套一层计数器——改的只是这一个一次性进程的内存，盘上一个字没动。
"""
import asyncio
import resource
import sys

from sqlalchemy import func

from app.db.database import SessionLocal
from app.models.user import User
from app.api.routes import categories, profiles
from app.services import note_images

RISKY = "线上赌场 六合彩 特码"
HARMLESS = "图麦笔记内容安全自检 一句话"

ok = bad = 0


def say(cond, label, detail=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  ✓ {label}" + (f"　{detail}" if detail else ""))
    else:
        bad += 1
        print(f"  ✗ {label}" + (f"　{detail}" if detail else ""))


# ---- 计数器：只在本进程里包一层，收尾还原 ----
calls = []
_real_check = note_images.check_text


def _counting_check(openid, text):
    verdict = _real_check(openid, text)
    calls.append((len(text), verdict))
    return verdict


note_images.check_text = _counting_check

db = SessionLocal()
u = db.query(User).filter(func.length(User.openid) == 28).first()
assert u, "现网找不到一个真人 openid 的号，停手（不拿假串验，那必然放行）"
print(f"身份：users.id={u.id}｜openid 长度 {len(u.openid)}（值不打印）｜这一趟对它零写入")

print("\n① 名片那把闸（`profiles._guard_card_text`）")
for field in ("name", "slogan"):
    calls.clear()
    try:
        profiles._guard_card_text(u, {field: RISKY})
        say(False, f"{field}＝已知违规却放过了")
    except Exception as exc:
        code = getattr(exc, "status_code", None)
        say(code == 400, f"{field}＝已知违规被拒", f"{type(exc).__name__} HTTP {code}")
    calls.clear()
    profiles._guard_card_text(u, {field: HARMLESS})
    say(True, f"{field}＝正常字样没被误伤")

print("\n② 分类名那把闸（`categories._guard_category_name`）")
try:
    categories._guard_category_name(u, RISKY)
    say(False, "已知违规却放过了")
except Exception as exc:
    say(getattr(exc, "status_code", None) == 400, "已知违规被拒",
        f"{type(exc).__name__} HTTP {getattr(exc, 'status_code', None)}")
categories._guard_category_name(u, "读书")
say(True, "正常分类名没被误伤")

print("\n③ 贴图那把闸（`note_images._guard_image_text`，三张对照图）")
CASES = [
    ("无字纯色图", "/tmp/qoder-1022-none.png", "不送检、放行"),
    ("正常字样图", "/tmp/qoder-1022-harmless.png", "送检一次、判 pass、放行"),
    ("已知违规字样图", "/tmp/qoder-1022-risky.png", "送检一次、判 risky／review、抛 Blocked"),
]
for label, path, expect in CASES:
    data = open(path, "rb").read()
    calls.clear()
    try:
        asyncio.run(note_images._guard_image_text(u.openid, data, "https://probe.invalid/x.png"))
        raised = None
    except note_images.Blocked as exc:
        raised = "Blocked"
    except Exception as exc:  # 没预期的错要说实话，不许算成"拦住了"
        raised = f"{type(exc).__name__}: {exc}"
    n = len(calls)
    print(f"  · {label}：送检 {n} 趟 {calls} 结果＝{raised or '放行'}")
    if path.endswith("none.png"):
        say(raised is None and n == 0, "无字图一次都不送检且放行", expect)
    elif path.endswith("harmless.png"):
        say(raised is None and n == 1 and calls[0][1] == "pass", "正常字样图送检一次判 pass 并放行", expect)
    else:
        say(raised == "Blocked" and n == 1 and calls[0][1] in ("risky", "review"),
            "已知违规字样图被拦下（Blocked）", expect)
        if raised != "Blocked":
            say(False, "这一张没拦住，先看 OCR 读出多少字",
                f"送检文本长度 {calls[0][0] if calls else '根本没送检'}")

print(f"\n④ 本进程峰值 RSS（含首次加载 OCR 模型）：{resource.getrusage(resource.RUSAGE_SELF).ru_maxrss:,} kB")
print("⑤ 写入账：只 SELECT 取了那一个号；三把闸调用范围内不建笔记、不改名片、不建分类、不进桶")
note_images.check_text = _real_check
db.close()
print(f"\n=== 现网内容安全三把闸：{ok} 过 / {bad} 红 ===")
sys.exit(1 if bad else 0)
