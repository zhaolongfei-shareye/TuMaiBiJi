"""后台「卡片模板」那一栏的预览引擎：小程序那份绘制代码在本机的一份只读副本。

这里**没有第二份画法**。界面上那张预览是 `miniprogram/utils/poster.js` 那一族文件在浏览器里
跑出来的，字节与客户端那一份逐字相同——由 `docs/工具/同步-后台预览引擎.py` 复制、
由 `backend/tests/test_admin_poster_preview.py` 逐只比 md5 钉住。源文件改了而副本没跟着同步，
测试就红，所以"后台看着对、真机上不是这张"这种话不会悄悄成立。

为什么非要落一份副本在 `backend/` 里：服务器上只有 `/home/ubuntu/wtsj-backend` 这一个目录，
`miniprogram/` 不在那台机上。

为什么不让服务端自己出图：`方案-cn后台资产管理.md` §六 第 7 条写的是"服务端没有 canvas"，
这条到今天仍然成立——这一份里没有任何一行画代码，画是浏览器画的。

为什么一口吐一整包（而不是九个文件各一口）：一次进这一栏要九只文件，按后台读口 60/分钟
的额度只够刷新六次，而这一栏正是要反复刷的那一栏。合成一口之后一次装载只占一个额度，
`Cache-Control` 也好统一。
"""
import hashlib
import json
import re
from pathlib import Path

ENGINE_DIR = Path(__file__).resolve().parent.parent / "poster_engine"
MANIFEST = ENGINE_DIR / "manifest.json"
# 只放这一种名字进去：单层纯文件名。带 `/`、带 `..` 的、别的扩展名一律不进这一条正则，
# 于是这一口读不到 `poster_engine` 目录之外的任何东西。
NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*\.js$")


def _load() -> dict:
    """名单在导入时读一次。缺文件就整口 503，而不是回一份不完整的引擎——
    半个引擎画出来的图是**假图**，比画不出来更坏。"""
    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"entry": "", "files": {}}
    files = {f["name"]: f for f in data.get("files", []) if NAME_RE.match(f.get("name", ""))}
    return {"entry": data.get("entry", ""), "files": files}


_MANIFEST = _load()


def names() -> list:
    return sorted(_MANIFEST["files"])


def ready() -> bool:
    return bool(_MANIFEST["files"]) and _MANIFEST["entry"] in _MANIFEST["files"]


def source(name: str) -> bytes:
    """按名单取字节，并**当场校验 md5**。

    校验不是多余的：这一份是复制出来的，一次没拷完的部署会留下半只文件，
    而半只 js 往往照样能 parse（少的是尾巴上几个函数），画出来的图缺几笔却不报错。
    md5 对不上就 503——宁可屏上出现"预览引擎没加载成"，也不能出现一张看着像的假图。
    """
    entry = _MANIFEST["files"].get(name)
    if entry is None:
        raise FileNotFoundError(name)
    data = (ENGINE_DIR / name).read_bytes()
    if hashlib.md5(data).hexdigest() != entry["md5"]:
        raise ValueError(f"{name} 与名单里记的那一份对不上（部署没拷全，或副本与源文件已分叉）")
    return data


def bundle() -> tuple:
    """`{"entry": "poster.js", "files": {名字: 源码}}` 这一包 JSON 的字节 + 它的 ETag。

    回体是 JSON 而不是可执行脚本：源码在这里就是**数据**，页面里因此少一次 `eval`，
    只剩装载器那一句 `new Function`。装载器（那个同步的 `require`）写在后台那一页里。

    不缓存这一包：`source()` 里那道 md5 校验就是这一口存在的全部理由，
    把结果 memo 起来等于只在校验第一次——之后副本被动过手也照样吐出去。
    一次进这一栏一口、320KB 现拼，管理页这个量级不用省。
    """
    files = {}
    for n in names():
        files[n] = source(n).decode("utf-8")
    payload = {"entry": _MANIFEST["entry"], "files": files}
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return body, hashlib.md5(body).hexdigest()

