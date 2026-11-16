"""Z65 的尺子：灌「来源站名表」那把工具，中途抛异常必须把那一栏退回动手前。

跑法（不连任何真服务、不碰现网）：把工具副本放进临时目录，喂一套桩（httpx / app.* / sqlalchemy），
用环境变量 `FAKE_FAIL` 决定 PUT 之后哪一句崩，量三件事——退出码、屏上有没有走回滚、桩里那份表最终是什么。

旧形状（改前）：PUT 已改了库，之后 `.json()`、裸 get、`resolve()` 任何一句抛 ⇒ 带 traceback 退场、
`fails` 一条红都没记、`if fails:` 那一支压根不跑 ⇒ 现网那一栏停在半截。

崩法五档（`FAKE_FAIL`）：`put-badjson` 回体不是 JSON／`state-raise` 后台读回那一发抛／
`resolve-raise` 第 3 步查表抛／`put-lost` **回体丢了但服务端已提交**／`put-raise` PUT 本身抛。
最后一档服务端压根没收到，库里本来就是动手前那份 ⇒ 它只能被「走了回滚那句」分辨，别把五档读成
五档都有同样区分度；真留在半截的那种（`put-lost`）在下面 G 档被单独量一次。
另两档：`put-500` 服务端整份退回（＝判据红那一路）、`FAKE_ROLLBACK=1` 配 `state-raise`＝回滚自己没成。

反向验证两档：G 把收尾那句 `if attempted and (fails or crashed):` 短路成永不成立，
H 把 `except BaseException` 换成永不匹配的异常类。两档都要看到「库里停在灌进去那几行」，
否则这条兜底是假绿。

⚠ 桩里 `BUILTIN` 六行、动手前那份一行——两把行数必须不同，否则「回到动手前」没有区分度；
⚠ 工具会往 `/tmp/site-names-table-<时刻>.json` 落备份，本尺子按跑前跑后的差集把这一趟新增的删净。
"""
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "灌-后台来源站点名表.py")
BAK_GLOB = "/tmp/site-names-table-*.json"

BUILTIN = (("163.com", "网易", "NetEase"),
           ("csdn.net", "CSDN", "CSDN"),
           ("mp.weixin.qq.com", "公众号", "WeChat"),
           ("sspai.com", "少数派", "SSpai"),
           ("arxiv.org", "arXiv", "arXiv"),
           ("sina.com.cn", "新浪", "Sina"))
BEFORE = [{"domain": "old.example", "zh": "旧站", "en": "Old Site", "note": "动手前就有的一行"}]

fails = []


def ck(name, ok, got=""):
    print(("  ✓ " if ok else "  ✗ ") + name + (f"　→ {got}" if got else ""))
    if not ok:
        fails.append(name)


STUB_HTTPX = r'''
import json
import os


class ConnectError(RuntimeError):
    pass


class Resp:
    def __init__(self, status, payload, bad=False):
        self.status_code = status
        self._payload = payload
        self._bad = bad
        self.text = "not-json" if bad else json.dumps(payload, ensure_ascii=False)

    def json(self):
        if self._bad:
            raise ValueError("回体不是 JSON")
        return self._payload


MODE = os.environ.get("FAKE_FAIL", "")
RB = os.environ.get("FAKE_ROLLBACK", "")


def _load():
    with open("store.json", encoding="utf-8") as f:
        return json.load(f)


def _save(s):
    with open("store.json", "w", encoding="utf-8") as f:
        json.dump(s, f, ensure_ascii=False)


def post(url, json=None, timeout=None):
    return Resp(200, {"session": "S" * 32})


def put(url, json=None, headers=None, timeout=None):  # noqa: A002
    s = _load()
    main = s["puts"] == 0
    s["puts"] += 1
    _save(s)
    if RB and not main:
        raise ConnectionError("回滚这一发也抛")
    if MODE == "put-raise" and main:
        raise ConnectError("PUT 这一发本身抛")
    if MODE == "put-500" and main:
        return Resp(500, {"detail": "网关挂了"})
    s = _load()
    s["current"] = json["value"]
    _save(s)
    if MODE == "put-lost" and main:
        raise ConnectionError("回体丢了，但服务端那半截已经提交")
    if MODE == "put-badjson" and main:
        return Resp(200, None, bad=True)
    return Resp(200, {"current": s["current"]})


def get(url, headers=None, timeout=None):
    if MODE == "state-raise":
        raise ConnectError("后台读回那一发抛")
    return Resp(200, {"tables": [{"kind": "site_names", "current": _load()["current"]}]})
'''

STUB_FILES = {
    "app/__init__.py": "",
    "app/core/__init__.py": "",
    "app/core/config.py": "settings = type('S', (), {'DATABASE_URL': 'sqlite://'})()\n",
    "app/db/__init__.py": "",
    "app/db/database.py": r'''
import json


class _Result:
    def __init__(self, value):
        self._v = value

    def scalar(self):
        return self._v


class _Conn:
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, stmt):
        return _Result(1 if "mp_settings" in getattr(stmt, "q", "") else 7)


class _Engine:
    def connect(self):
        return _Conn()


class _Row:
    @property
    def text_value(self):
        with open("store.json", encoding="utf-8") as f:
            return json.load(f)["current"]


class _Query:
    def filter(self, *a):
        return self

    def first(self):
        return _Row()


class _Session:
    def query(self, model):
        return _Query()


engine = _Engine()


def SessionLocal():
    return _Session()
''',
    "app/models/__init__.py": "",
    "app/models/mp_asset.py": 'KIND_SITE_NAMES = "site_names"\n\n\nclass MpSetting:\n    kind = KIND_SITE_NAMES\n',
    "app/services/__init__.py": "",
    "app/services/mp_assets.py": r'''
import re

MAX_SITE_CHARS = 20
MAX_NOTE_CHARS = 400
_DOMAIN = re.compile(r"^[a-z0-9][a-z0-9.-]*$")
TABLE_SPECS = {"site_names": {"max_rows": 64, "max_site_chars": 20, "max_note_chars": 400}}
''',
    "app/services/site_names.py": r'''
import json
import os

BUILTIN = %r


async def resolve(session, url, meta_site_raw=None):
    if os.environ.get("FAKE_FAIL") == "resolve-raise":
        raise RuntimeError("第 3 步那发查表抛")
    with open("store.json", encoding="utf-8") as f:
        cur = json.load(f)["current"] or []
    host = url.split("//", 1)[1].split("/", 1)[0]
    for r in cur:
        if host == r["domain"] or host.endswith("." + r["domain"]):
            return {"zh": r["zh"], "en": r["en"], "via": "table"}
    if meta_site_raw:
        return {"zh": meta_site_raw, "en": meta_site_raw, "via": "meta"}
    return None
''' % (BUILTIN,),
    "sqlalchemy.py": "class _T:\n    def __init__(self, q):\n        self.q = q\n\n\ndef text(q):\n    return _T(q)\n",
}


def fresh_root(tool_src):
    root = tempfile.mkdtemp(prefix="z65-")
    for rel, body in STUB_FILES.items():
        path = os.path.join(root, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    for name, body in (("httpx.py", STUB_HTTPX), (".env", "ADMIN_TOKEN=abcdefghij1234\n"),
                       ("store.json", json.dumps({"current": BEFORE, "puts": 0}, ensure_ascii=False)),
                       ("tool.py", tool_src)):
        with open(os.path.join(root, name), "w", encoding="utf-8") as f:
            f.write(body)
    return root


def run(tool_src, mode, extra=None):
    """跑一趟工具副本，返回 (退出码, 桩里最终状态, 屏上文本)；这一趟落进 /tmp 的备份删净。"""
    had = set(glob.glob(BAK_GLOB))
    root = fresh_root(tool_src)
    env = dict(os.environ)
    env.update(PYTHONPATH=root, FAKE_FAIL=mode, FAKE_ROLLBACK="",
               NO_PROXY="", no_proxy="", HTTP_PROXY="", http_proxy="")
    env.update(extra or {})
    out = os.path.join(root, "run.log")
    with open(out, "w", encoding="utf-8") as f:
        p = subprocess.run([sys.executable, os.path.join(root, "tool.py")],
                           cwd=root, env=env, stdout=f, stderr=subprocess.STDOUT)
    text = open(out, encoding="utf-8").read()
    store = json.load(open(os.path.join(root, "store.json"), encoding="utf-8"))
    for path in sorted(set(glob.glob(BAK_GLOB)) - had):
        os.remove(path)
    shutil.rmtree(root, ignore_errors=True)
    return p.returncode, store, text


def rows_of(store):
    return json.dumps(store["current"], ensure_ascii=False)[:70]


def mutate(label, old, new):
    ck(f"变体「{label}」的锚点在源码里", old in SRC, "")
    return SRC.replace(old, new, 1)


with open(TOOL, encoding="utf-8") as f:
    SRC = f.read()

print("== 0. 夹具自证＋正常一路 ==")
ck("动手前 1 行、灌进去 6 行 ⇒ 「回到动手前」有区分度",
   len(BEFORE) == 1 and len(BUILTIN) == 6, f"{len(BEFORE)} vs {len(BUILTIN)}")
rc, store, text = run(SRC, "")
ck("桩里跑得起（工具真执行到收尾）", "结果：" in text, f"rc={rc}｜尾 {text[-120:]}")
ck("正常一路：退 0", rc == 0, f"rc={rc}")
ck("正常一路：库里＝刚灌进去的 6 行", len(store["current"] or []) == 6, rows_of(store))
ck("正常一路：PUT 只发一发（成功后不许再多写一发把刚灌的撤掉）",
   store["puts"] == 1, f"{store['puts']} 发")
ck("正常一路：屏上没有「写回去」那句", "写回去" not in text, "")
GREEN = store["current"]

print("\n== 1~5. PUT 之后每一句崩，都要退回动手前 ==")
for mode, label in (("put-badjson", "回体不是 JSON"),
                    ("state-raise", "后台读回那一发抛"),
                    ("resolve-raise", "第 3 步查表抛"),
                    ("put-lost", "回体丢了但服务端已提交"),
                    ("put-raise", "PUT 这一发本身抛")):
    rc, store, text = run(SRC, mode)
    ck(f"{label} ⇒ 退 1", rc == 1, f"rc={rc}")
    ck(f"{label} ⇒ 走了回滚那句", "写回去" in text, "")
    ck(f"{label} ⇒ 库里读回＝动手前那份", store["current"] == BEFORE, rows_of(store))
print("  · 口径提醒：「PUT 这一发本身抛」那一档，桩里服务端根本没收到 ⇒ 库里本来就是动手前那份，"
      "『库里＝动手前』在那一档没有区分度；分辨它的是『走了回滚那句』。真留在半截的是"
      "「回体丢了但服务端已提交」那一档，它在下面 G 档里被单独量了一次。")

print("\n== 5~6. 回滚自己没成 / 服务端退回 500 ==")
rc, store, text = run(SRC, "state-raise", {"FAKE_ROLLBACK": "1"})
ck("回滚这一发也抛 ⇒ 退 1", rc == 1, f"rc={rc}")
ck("回滚这一发也抛 ⇒ 屏上大声说「没成／人工拿备份再灌」",
   "没成" in text and "人工" in text, "")
ck("回滚这一发也抛 ⇒ 库里确实还停在灌进去那 6 行（这条就是后果）",
   store["current"] == GREEN, rows_of(store))
rc, store, text = run(SRC, "put-500")
ck("PUT 回 500（判据红那一路）⇒ 退 1", rc == 1, f"rc={rc}")
ck("PUT 回 500 ⇒ 库里仍是动手前那份", store["current"] == BEFORE, rows_of(store))
ck("PUT 回 500 ⇒ 与崩共用同一个还原口（屏上有「写回去」）", "写回去" in text, "")

print("\n== 7~9. 反向：把兜底拆掉，上面的判据必须转红 ==")
g = mutate("G 收尾那句永不成立", "if attempted and (fails or crashed):", "if False:")
rc, store, text = run(g, "state-raise")
ck("G：崩了但库里停在灌进去那 6 行（＝旧 BUG 的形状）",
   store["current"] == GREEN, rows_of(store))
ck("G：屏上没走回滚那句（这条与第 2 组是同一条判据的反向）", "写回去" not in text, "")
rc, store, text = run(g, "put-lost")
ck("G：回体丢了但服务端已提交那一档，拆掉兜底后真留在半截（这条才有区分度）",
   store["current"] == GREEN, rows_of(store))
h = mutate("H 异常类型永不匹配", "except BaseException as exc:",
           "except _NeverRaised as exc:  # noqa")
rc, store, text = run(h, "state-raise")
ck("H：异常没被接住 ⇒ traceback 退 1（⚠ 退出码不足以分辨，别拿它当判据）",
   rc == 1 and "Traceback" in text, f"rc={rc}")
ck("H：异常没被接住 ⇒ 库里停在灌进去那 6 行", store["current"] == GREEN, rows_of(store))

print(f"\n合计 {len(fails)} 红")
for n in fails:
    print("  ! " + n)
sys.exit(1 if fails else 0)
