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


def test_所有路由文件里的detail字面量都是中文():
    offenders = []
    scanned = 0
    for path in sorted(APP_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for lineno, text in _literal_detail_calls(tree):
            scanned += 1
            problem = _english_problem(text)
            if problem:
                offenders.append(f"{path.relative_to(APP_ROOT.parent)}:{lineno} {problem} → {text!r}")
    assert scanned >= 20, f"只扫到 {scanned} 处 detail，扫描本身可能失效了"
    assert not offenders, "这些 detail 会让用户看到英文：\n  " + "\n  ".join(offenders)


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
