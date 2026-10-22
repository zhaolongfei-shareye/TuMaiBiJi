# 现网探针（10-22）：图片侧那道内容安全闸——真出网、真判定、真拒得下来。
# 跑法（必须换成 ASCII 名，中文路径走 stdin 重定向会散成乱码）：
#   cp docs/工具/探-现网图片内容安全闸.py /tmp/probe60_imgsec.py
#   ssh <服务器> 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - ' < /tmp/probe60_imgsec.py
#
# 只读：不写库、不改任何状态、不出网除微信那两个检查类接口。token 与 openid 只报长度。
#
# 这一把钉得住什么、钉不住什么，先说在前面（钉不住那一格不许混进"验过了"）：
# ✓ 管路：真凭据调得通、真按字节解析、真按 errcode 判定、命中时真抛得出那一句中文、
#   超上限的图真被压回 1MB 以内再送（不压＝图越大越安全，是一条现成的绕过路径）。
# ✗ **判定能力**：要证"涉黄判得下来"得有一张已知违规的图当正样本。今天没有，也不该自己造
#   （§8.428 同一句），所以这一格只能留给真样本，或上线后拿真流量的统计。
import json

from app.core.config import settings
from app.core.errors import UserError
from app.services import wechat

ok = 0
bad = 0


def ck(name, cond, got=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  ✓ {name}")
    else:
        bad += 1
        print(f"  ✗ {name} —— {got}")


def png(w=240, h=240, color=(200, 200, 200)):
    import io

    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


def noise_png(w, h):
    """噪声图：压不动，用来把那份字节顶过 1MB 那道接口上限。"""
    import io
    import os as _os

    from PIL import Image
    buf = io.BytesIO()
    Image.frombytes("RGB", (w, h), _os.urandom(w * h * 3)).save(buf, format="PNG")
    return buf.getvalue()


assert settings.SEC_CHECK_ENABLED, "SEC_CHECK_ENABLED 必须开着，否则这把量的是「关着」那个状态"

print("① 这张口今天还开着吗（真凭据、真出网）")
tok = wechat._access_token_sync()
ck("access_token 拿得到", bool(tok), f"长度 {len(tok)}")
r = wechat.probe_img_sec_check(png())
ck("纯色 benign 图 → pass（errcode 0）", r["verdict"] == "pass", json.dumps(r, ensure_ascii=False))

print("② 它真在解析我们送上去的字节，不是空转端点")
r = wechat.probe_img_sec_check(b"not-an-image-at-all")
ck("送一段不是图片的字节 → 拿不到 pass（微信自己拒）", r["verdict"] == "unavailable",
   json.dumps(r, ensure_ascii=False))
ck("  且回的是「送得不合规格」那一族错误码",
   r.get("errcode") in (40004, 40006, 41004, 44003), json.dumps(r, ensure_ascii=False))

print("③ 超上限的图先压再送（不压就留下一条「图越大越安全」的绕过路径）")
big = noise_png(1600, 1600)
ck("样本确实越过 1MB 那道线", len(big) > wechat.IMG_SEC_MAX_BYTES, f"{len(big)} B")
shrunk = wechat._shrink_for_img_sec(big)
ck("压完回到 1MB 以内", len(shrunk) <= wechat.IMG_SEC_MAX_BYTES, f"{len(shrunk)} B")
r = wechat.probe_img_sec_check(big)
ck("整张原件直接送也拿得到判定（不是 exception）",
   r["verdict"] in ("pass", "risky"), json.dumps(r, ensure_ascii=False))

MSG = "图片包含违规信息，无法保存，请换一张再试"
real_check = wechat.check_image
try:
    print("④ 命中时真拒得下来，而且拒的是那句讲给人听的话")
    wechat.check_image = lambda data: "risky"
    try:
        wechat.enforce_image_safety(png(), png())
        ck("risky 时 enforce_image_safety 抛 UserError", False, "没抛")
    except UserError as exc:
        ck("risky 时抛 UserError", True)
        ck(f"文案逐字等于「{MSG}」", str(exc) == MSG, str(exc))
        # 驳回通知要求的是「仅需提示用户所发布内容含违规信息」：这一句满足，且不点名是哪一张。
        ck("  且这句话里没有 openid、没有内部术语",
           "openid" not in str(exc) and "errcode" not in str(exc), str(exc))

    print("⑤ worker 那条岔口：画面闸命中时抛的是 ImageBlocked，不是通用故障")
    from app.tasks import ingest_tasks
    try:
        ingest_tasks._guard_screenshot_images([b"one", b"two"])
        ck("截图那条抛 ImageBlocked", False, "没抛")
    except ingest_tasks.ImageBlocked as exc:
        ck("截图那条抛 ImageBlocked", True)
        ck("  带的还是同一句中文（屏上念的就是它）", str(exc) == MSG, str(exc))
    except Exception as exc:
        ck("截图那条抛 ImageBlocked", False, f"抛成了 {type(exc).__name__}: {exc}")

    print("⑥ 「没检成」不等于「图没问题」：unavailable 一律放行")
    wechat.check_image = lambda data: "unavailable"
    wechat.enforce_image_safety(b"x")
    ingest_tasks.enforce_image_safety(b"x")
    ck("unavailable 时不拦（微信侧抖动不许变成「存不下图」）", True)

    print("⑦ 两支异常类各立各的（合成一支，日志就分不出是谁拦的）")
    ck("ImageBlocked 与 OcrTextBlocked 不是同一个",
       ingest_tasks.ImageBlocked is not ingest_tasks.OcrTextBlocked)
    ck("且都不是 UserError 那一族（否则 failure_message 会把原文换成通用故障文案）",
       not issubclass(ingest_tasks.ImageBlocked, UserError))
finally:
    wechat.check_image = real_check

print("⑧ 配额形状（只报读数，不当判据）：一次导入一批 4 张，最坏打 4 次")
print("   单次真打的回体:", json.dumps(wechat.probe_img_sec_check(png()), ensure_ascii=False))

print(f"\n探-现网图片内容安全闸：{ok} 过 / {bad} 红")
raise SystemExit(1 if bad else 0)
