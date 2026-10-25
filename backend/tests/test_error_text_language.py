"""用户可见的报错文案必须是中文——这条以前"修完过"，结果又漏了 9 处。

前端是 `(err.data && err.data.detail) || t('saveFailed')`，detail 会原样进 toast 或
errLine。所以只要服务端写了英文，用户就看到英文：删掉的笔记再点开是 "Note not found"，
旧版本客户端选了个已下线的壁纸是 "Invalid wallpaper. Options: [...]"。

用 AST 静态扫而不是逐个打接口：接口要凑齐鉴权、数据、参数组合才能触发到每一个分支，
漏一个就等于没扫。静态扫还能管住以后新增的路由——再写一句英文 detail，这条就红。

只扫**字面量** detail。`detail=str(e)` 这类动态值扫不到，但那几条走的是 UserError，
文案本身在别处已经是中文（见 test_scraper_ssrf / test_sec_check）。
"""
import ast
import os
import pathlib
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

APP_ROOT = pathlib.Path(__file__).resolve().parents[1] / "app"

# 允许夹在中文句子里的拉丁词：计量单位和专有名词。别的英文一律算没翻译。
ALLOWED_LATIN = {"MB", "KB", "GB", "Token", "token", "HTTP", "URL", "OCR"}

_CJK = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RUN = re.compile(r"[A-Za-z]+")


def _literal_detail_calls(tree):
    """挑出所有 HTTPException(...) 里 detail= 是字符串字面量（含 f-string 的字面部分）的调用。"""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        name = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
        if name not in ("HTTPException", "JSONResponse"):
            continue
        for kw in node.keywords:
            if kw.arg != "detail":
                continue
            value = kw.value
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                yield node.lineno, value.value
            elif isinstance(value, ast.JoinedStr):
                text = "".join(
                    v.value for v in value.values if isinstance(v, ast.Constant) and isinstance(v.value, str)
                )
                yield node.lineno, text


def _english_problem(text):
    """返回这条文案的问题；没问题返回 None。

    两条判据：整句一个汉字都没有（纯英文，用户直接看不懂），或者夹了不在白名单里的
    英文单词（半翻译，"Invalid wallpaper" 这种）。只查"有没有 ASCII 字母"会误伤
    "图片超过 10MB 限制" 和 "Token 已失效" 这类正常写法。
    """
    if not text.strip():
        return None
    if not _CJK.search(text):
        return "整句没有中文"
    stray = [w for w in _LATIN_RUN.findall(text) if w not in ALLOWED_LATIN]
    if stray:
        return "夹了未翻译的英文：" + ", ".join(sorted(set(stray)))
    return None


# 例外按**文件**放，不按词放。RoamMark 那一组口（`/api/roammark/*`）的用户界面是英文的、面向全球，
# 而这条尺子钉的是图麦笔记那一侧"屏上不许出现英文"——两句都成立，所以只能分开钉。
# ⚠ 不许把 `RoamMark`、`AI` 这类词加进 `ALLOWED_LATIN` 来"过尺子"：那等于给全站稀释判据，
#   以后任何一句英文都过得去。反面那一条见下面 `test_RoamMark那一路的句子必须真是英文`，
#   它和这一条共用同一个名单，所以名单里多一个文件就必须同时多写一条反面尺子。
OTHER_PRODUCT_FILES = {"app/api/routes/roammark.py", "app/services/spot_draft.py"}


def _rel(path) -> str:
    return str(path.relative_to(APP_ROOT.parent)).replace("\\", "/")


def test_所有路由文件里的detail字面量都是中文():
    offenders = []
    scanned = 0
    for path in sorted(APP_ROOT.rglob("*.py")):
        if _rel(path) in OTHER_PRODUCT_FILES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for lineno, text in _literal_detail_calls(tree):
            scanned += 1
            problem = _english_problem(text)
            if problem:
                offenders.append(f"{path.relative_to(APP_ROOT.parent)}:{lineno} {problem} → {text!r}")
    assert scanned >= 20, f"只扫到 {scanned} 处 detail，扫描本身可能失效了"
    assert not offenders, "这些 detail 会让用户看到英文：\n  " + "\n  ".join(offenders)


def test_RoamMark那一路的句子必须真是英文():
    """上面那条放行了这两个文件，这一条就是它的反面：这两个文件里的用户句子必须是英文。

    钉的形状：`_fail(状态, code, 句子)` 的第三个参数、以及 `UserError(...)` / `NotConfigured(...)`
    的字面参数。判据与那条中文尺子同一条、方向相反（有汉字＝红，因为海外包上没人看得懂）。
    """
    checked = []
    for name in sorted(OTHER_PRODUCT_FILES):
        path = APP_ROOT.parent / name
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            fname = func.id if isinstance(func, ast.Name) else getattr(func, "attr", "")
            if fname == "_fail" and len(node.args) >= 3:
                texts = [node.args[2]]
            elif fname in ("UserError", "NotConfigured") and node.args:
                texts = [node.args[0]]
            else:
                continue
            for value in texts:
                if isinstance(value, ast.JoinedStr):
                    text = "".join(v.value for v in value.values if isinstance(v, ast.Constant) and isinstance(v.value, str))
                elif isinstance(value, ast.Constant) and isinstance(value.value, str):
                    text = value.value
                else:
                    continue
                if text.strip():
                    checked.append((f"{name}:{value.lineno}", text))
    assert len(checked) >= 10, f"只扫到 {len(checked)} 句，这一条尺子本身可能失效了"
    backslash = [f"{where} → {text!r}" for where, text in checked if _CJK.search(text)]
    assert not backslash, "这两个文件是 RoamMark（英文界面）那一路，屏上句子回中文了：\n  " + "\n  ".join(backslash)


def test_扫描器自己没瞎():
    """上面那条如果判据写错了，会安安静静地全绿。这条是它的自检。"""
    bad = [
        'raise HTTPException(status_code=404, detail="Note not found")',
        'raise HTTPException(status_code=400, detail=f"Invalid wallpaper. Options: {OPTIONS}")',
        'raise HTTPException(status_code=400, detail="分类 not found")',
    ]
    for src in bad:
        found = list(_literal_detail_calls(ast.parse(src)))
        assert found, f"没扫到 detail：{src}"
        assert _english_problem(found[0][1]), f"该判为英文却放过了：{src}"

    good = [
        'raise HTTPException(status_code=404, detail="笔记不存在或已删除")',
        'raise HTTPException(status_code=400, detail=f"图片超过 {MAX_IMAGE_BYTES // 1048576}MB 限制")',
        'raise HTTPException(status_code=401, detail="Token 已失效，请重新登录")',
    ]
    for src in good:
        found = list(_literal_detail_calls(ast.parse(src)))
        assert found, f"没扫到 detail：{src}"
        assert _english_problem(found[0][1]) is None, f"正常中文被误判：{src}"


def test_422校验错误的detail也是中文():
    """长度上限是这一轮加的，撞上它的是正常用户（粘贴长文当标题），文案同样要可读。

    端到端的形状断言在 test_input_limits.py；这里只钉 main 里那个处理器确实挂上了——
    少了它，Pydantic 会返回英文报错数组，前端塞进 errLine 显示成 [object Object]。
    """
    from fastapi.exceptions import RequestValidationError

    from app.main import app

    handlers = getattr(app, "exception_handlers", {})
    assert RequestValidationError in handlers, "RequestValidationError 没有自定义处理器，422 会是英文数组"
