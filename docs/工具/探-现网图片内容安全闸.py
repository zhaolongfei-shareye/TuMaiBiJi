# 现网探针（10-22）：图片侧那道内容安全闸——真出网、真判定、真拒得下来。
# 跑法（必须换成 ASCII 名，中文路径走 stdin 重定向会散成乱码）：
#   cp docs/工具/探-现网图片内容安全闸.py /tmp/probe60_imgsec.py
#   ssh <服务器> 'cd /home/ubuntu/wtsj-backend && .venv/bin/python - ' < /tmp/probe60_imgsec.py
#
# 只读：不写库、不改任何状态、不出网除微信那两个检查类接口。token 与 openid 只报长度。
#
# 这一把钉得住什么、钉不住什么，先说在前面（钉不住那一格不许混进"验过了"）：
# ✓ 管路：真凭据调得通、回码随上送形状而变（不是常量端点）、命中时真抛得出那一句中文、
#   超上限的图真被压回 1MB 以内再送（不压＝图越大越安全，是一条现成的绕过路径）。
# ✗ **判定能力**：要证"涉黄判得下来"得有一张已知违规的图当正样本。今天没有，也不该自己造
#   （§8.428 同一句），所以这一格只能留给真样本，或上线后拿真流量的统计。
# ✗ 同一条理由，"无法解码但客户端渲染得出来的图"会不会被当成 pass，也证不了——见 ② 末段。
import json
import os

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

print("② 它真在看我们送上去的字节——上送形状不同，回码就不同（不是常量端点）")
# 10-22 实测改的判据：原来这一格写的是"送一段不是图片的字节→微信自己拒"，红了两条。
# 复打出来的平台事实是：**img_sec_check 对小段非图片字节回 errcode 0**（19 字节垃圾、
# 4KB 随机、截断到一半的 PNG、IHDR 吹成 40000×40000 的 PNG，四种一律 pass）。
# 所以"垃圾字节该被拒"这个前提是错的，拿它当判据等于装了牙打在微信不咬的地方。
# 真正会咬的是**大小**那一维：空／1.5MB 非图／2MB 全零，三种形状各回各的码。
r_empty = wechat.probe_img_sec_check(b"")
ck("空体 → unavailable（41005 media data missing：请求真被受理了）",
   r_empty["verdict"] == "unavailable" and r_empty["errcode"] == 41005,
   json.dumps(r_empty, ensure_ascii=False))
r_big_garbage = wechat.probe_img_sec_check(os.urandom(1536 * 1024))
ck("1.5MB 非图片字节 → unavailable（40006 invalid media size）",
   r_big_garbage["verdict"] == "unavailable" and r_big_garbage["errcode"] == 40006,
   json.dumps(r_big_garbage, ensure_ascii=False))
r_zeros = wechat.probe_img_sec_check(b"\0" * (2 * 1024 * 1024))
ck("2MB 全零字节 → unavailable（45002 content size out of limit，与 40006 不同一族）",
   r_zeros["verdict"] == "unavailable" and r_zeros["errcode"] == 45002,
   json.dumps(r_zeros, ensure_ascii=False))
ck("三种形状回码互不相同 ⇒ 回体不是写死的常量",
   len({r_empty["errcode"], r_big_garbage["errcode"], r_zeros["errcode"]}) == 3,
   json.dumps([r_empty["errcode"], r_big_garbage["errcode"], r_zeros["errcode"]]))
r_small_garbage = wechat.probe_img_sec_check(b"not-an-image-at-all")
print("   记下这条平台事实（不当判据）：小段非图片字节回的是",
      json.dumps(r_small_garbage, ensure_ascii=False))
print("   ⇒ 残余口子（未证实也未能排除）：若有一张图客户端渲染得出来而微信解不出来，")
print("     它拿到的就是 pass。我们这边送之前都过一遍 PIL，能解码的已归一化；")
print("     真要判这条，得有一张已知违规的图当正样本——今天仍然没有。")

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
