"""第五十六次部署的现网取证：截图那条内容安全闸在**跑着的这份代码里**咬不咬得动。

跑法（凭据不出那台机器，也不进 argv）：
    ssh agentsbin 'cd /home/ubuntu/wtsj-backend && .venv/bin/python -' < docs/工具/探-现网截图内容安全闸.py

为什么只能这么打：这道闸"拦下"那一路**只在真人 openid 手上才可能咬**——假串微信回 40003＝没检成＝放行，
拿探针号 `deploy-test` 走 HTTP 一定绿（假绿）。而现网只有站长那一个号是真人 openid，
用它走 HTTP 就得往他名下写数据。所以这一支只调函数本体 `_guard_screenshot_text`：
它自己只 SELECT 一枚 openid ＋ 出网问微信，**不建笔记、不改任何一行、也不跑 OCR**（这条路喂给它的是已经认出来的字）。

`check_text` 在本进程里套一层计数器——改的只是一个一次性进程的内存，盘上一个字没动。
"""
import sys

from sqlalchemy import func

from app.db.database import SessionLocal
from app.models.user import User
from app.services import wechat
from app.tasks import ingest_tasks as T

RISKY = "线上赌场 六合彩 特码"
HARMLESS = "图麦笔记截图内容安全自检 一句话"

ok = bad = 0


def say(cond, label, detail=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  ✓ {label}" + (f"　{detail}" if detail else ""))
    else:
        bad += 1
        print(f"  ✗ {label}" + (f"　{detail}" if detail else ""))


# ---- 计数器：真打、只是把趟数与判定记下来 ----
calls = []
_real_check = wechat.check_text


def _counting_check(openid, content):
    verdict = _real_check(openid, content)
    calls.append((len(content), verdict))
    return verdict


wechat.check_text = _counting_check


def run(user_id, text):
    """返回 (抛出的异常名或 None, 屏上会看到的那句, 本趟送检记录副本)。"""
    calls.clear()
    try:
        T._guard_screenshot_text(str(user_id), text)
        return None, "", list(calls)
    except T.OcrTextBlocked as exc:
        return "OcrTextBlocked", str(exc), list(calls)
    except Exception as exc:  # 没预期的错要说实话，不许算成"拦住了"
        return type(exc).__name__, f"{exc}", list(calls)


db = SessionLocal()
real = db.query(User).filter(func.length(User.openid) == 28).first()
assert real, "现网找不到一个真人 openid 的号，停手（不拿假串验，那必然放行）"
print(f"身份：users.id={real.id}｜openid 长度 28（值不打印）｜这一趟对它零写入")

print("\n① 正常字样（真人 openid）")
raised, msg, c = run(real.id, HARMLESS)
print(f"  · 送检 {len(c)} 趟 {c}　结果＝{raised or '放行'}")
say(raised is None and len(c) == 1 and c[0][1] == "pass", "正常字样放行且只送一趟")

print("\n② 已知违规字样（真人 openid）")
raised, msg, c = run(real.id, RISKY)
print(f"  · 送检 {len(c)} 趟 {c}　抛＝{raised}　屏上那句＝{msg}")
say(raised == "OcrTextBlocked" and len(c) >= 1 and any(v in ("risky", "review") for _, v in c),
    "已知违规被判下来并抛 OcrTextBlocked")
say(msg == "内容包含违规信息，无法保存，请修改后再试", "给用户那句是现成那句中文（不是通用故障话）", msg)

print("\n③ 空白文本（认不出字那种）")
raised, msg, c = run(real.id, "   \n  ")
say(raised is None and len(c) == 0, "空白一个都不送检、放行", f"送检 {len(c)} 趟")

print("\n④ 超窗口那一条边界（真人 openid，20,000 字）")
long_text = ("截图内容安全自检长文本 " * 2000)[:20000]
raised, msg, c = run(real.id, long_text)
total = sum(n for n, _ in c)
print(f"  · 送检 {len(c)} 趟，各趟字数 {[n for n, _ in c]}，合计 {total} 字　结果＝{raised or '放行'}")
say(len(c) == 8 and total == 16000, "一次最多检 16,000 字（2000×8），多出来的 4,000 字没送检")
say(all(n <= 2000 for n, _ in c), "每段都不超过 2,000 字")

print("\n⑤ 号不存在（注销／删号那种）")
max_id = db.query(func.max(User.id)).scalar()
raised, msg, c = run(max_id + 1, RISKY)
say(raised is None and len(c) == 0, "查不到号时不送检、也不炸", f"用的 id＝{max_id + 1}")

print("\n⑥ 假串账号（deploy-test）——fail-open 的真形态")
fake = db.query(User).filter(User.openid == "deploy-test").first()
if fake is None:
    say(True, "现网已无 deploy-test 这个号，这一档跳过（不写结论）")
else:
    raised, msg, c = run(fake.id, RISKY)
    print(f"  · 送检 {len(c)} 趟 {c}　结果＝{raised or '放行'}")
    say(raised is None and len(c) >= 1 and all(v == "unavailable" for _, v in c),
        "假 openid 报 40003＝没检成＝放行（**这不是「这段字没问题」**）")

print("\n⑦ 真人 openid 缺失那一档在现网有没有样本")
n_noid = db.query(func.count(User.id)).filter(
    (User.openid.is_(None)) | (User.openid == "")).scalar()
print(f"  · 现读 openid 为 NULL 或空串的账号：{n_noid} 名")
if n_noid:
    nooid = db.query(User).filter((User.openid.is_(None)) | (User.openid == "")).first()
    raised, msg, c = run(noid.id, RISKY)
    say(raised is None and len(c) == 0, "没有可用 openid 时放行并留 WARNING（现网真号走过一趟）")
else:
    say(True, "现网无此类账号 ⇒ 这一档只有本地用例钉着，**不许说成现网验过**")

print(f"\n⑧ 本进程峰值 RSS（这一条链不加载 OCR 模型，纯文本＋HTTP）："
      f"{__import__('resource').getrusage(__import__('resource').RUSAGE_SELF).ru_maxrss:,} kB")
print("⑨ 写入账：全程只 SELECT；未建笔记、未改名片、未建分类、未进桶、未跑 OCR")

wechat.check_text = _real_check
db.close()
print(f"\n=== 现网截图内容安全闸：{ok} 过 / {bad} 红 ===")
sys.exit(1 if bad else 0)
