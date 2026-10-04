"""配方校验（方案 docs/方案-卡片模板不走发版.md §三 第 3 层那道闸门的服务端半边）。

客户端那份 `posterRecipe.js` 里有一个 `validate()`，这里就是它的 Python 对照：
名单外的一切（op、字段、原语、参数名、算子、步型、令牌名）一律不放行。
**下发前拦一道、客户端渲染前再拦一道**，两道都拦是因为它们会漂移——客户端在用户手机上，
它的名单跟着包版本走；服务器只有一份，写的却是所有版本都要读的东西。

名单为什么在这里抄第二份而不是直接读 `backend/seed/poster_whitelist.json`：
运行期不该依赖一个"要跑一次 node 才生成得出"的文件。漂移由两条检查钉住：
- `backend/tests/test_poster_templates.py` 第一条：这份 Python 名单 == 种子 JSON（两边逐键比）；
- `docs/工具/验-模板配方可执行.js` 里那条：种子 JSON == 现读 `poster.js` 算出来的那份。
两条都在，中间就没有"谁也没看的那一段"。

还有一条上界是真要命的：解释器对"配方有多大"不设防，一条十万步的配方会让出图那一次
主线程卡在测量里。`LIMITS` 那三个数就是给这个的，与客户端那份必须同值——
同上，由 pytest 与那把尺子两头夹。
"""
import json
from typing import Any

# ---------------------------------------------------------------- 闭集名单（与 poster.js / posterRecipe.js 同值）

ARITH: dict[str, int] = {
    "+": -1, "-": -1, "*": -1, "/": 2, "%": 2,
    "min": -1, "max": -1, "round": 1, "floor": 1, "ceil": 1, "abs": 1, "neg": 1,
}
LOGIC: dict[str, int] = {
    "<": 2, "<=": 2, ">": 2, ">=": 2, "==": 2, "!=": 2,
    "and": -1, "or": -1, "not": 1, "len": 1, "truthy": 1,
}
CONV: dict[str, int] = {"str": 1, "padStart": 2, "slice": 3}
STEPS = ("let", "do", "emit", "emitOne", "emitMany", "if", "each")
TERM_FORMS = ("var", "lit", "if", "obj", "prim", "list")
# `emit` 里那些图层对象的字段名，按 op 分组。op 名单本身也从这里读。
OP_KEYS: dict[str, tuple[str, ...]] = {
    "fill": ("x", "y", "w", "h", "color"),
    "grad": ("x", "y", "w", "h", "c1", "c2", "dir", "stops"),
    "radial": ("x", "y", "r0", "r1", "c1", "c2", "box"),
    "rrect": ("x", "y", "w", "h", "r", "fill", "shadow", "shadowBlur", "shadowY", "stroke", "strokeWidth"),
    "circle": ("x", "y", "r", "fill", "stroke", "strokeWidth"),
    "line": ("x1", "y1", "x2", "y2", "w", "color"),
    "dots": ("x", "y", "w", "h", "gap", "r", "color", "oddRowShift"),
    "text": ("x", "y", "lines", "lh", "size", "weight", "color", "align", "fam",
             "alpha", "track", "stroke", "strokeWidth", "vert", "colGap", "vpunct"),
    "image": ("key", "x", "y", "w", "h", "placeholder", "r", "clipCircle", "gray", "tint", "fadeFrom"),
    "avatar": ("x", "y", "d", "ring", "ringColor", "fallback"),
}
PRIM_KEYS: dict[str, tuple[str, ...]] = {
    "i18n": ("key",),
    "blockName": (),
    "sourceLabel": (),
    "quoteText": (),
    "noteDate": (),
    "tagsJoined": ("sep",),
    "paperOf": ("categoryId",),
    "scheme": ("name", "categoryId"),
    "plateColors": ("categoryId",),
    "withAlpha": ("color", "alpha"),
    "mix": ("c1", "c2", "w"),
    "joinNonEmpty": ("sep", "parts"),
    "points": ("limit", "maxW", "size", "bold", "fam"),
    "fitLines": ("text", "maxW", "n", "size", "bold", "fam"),
    "wrapLines": ("text", "maxW", "size", "bold", "fam"),
    "clipLine": ("text", "maxW", "size", "bold", "fam"),
    "clipTrack": ("text", "maxW", "track", "size", "bold", "fam"),
    "trackWidth": ("text", "track", "size", "bold", "fam"),
    "fitSize": ("text", "maxW", "want", "floor"),
    "setFont": ("size", "bold", "fam"),
    "vertCols": ("text", "colH", "step", "maxCols", "size", "bold", "fam"),
    "vertAdv": ("text", "step", "size", "bold", "fam"),
    "maxOf": ("values", "seed"),
    "brandGlyph": (),
    "signRow": ("x", "y", "maxW", "size", "avatarD", "onDark", "hasAvatar"),
    "glyphPlate": ("x", "y", "w", "h", "color"),
    "qrSticker": ("x", "y", "size", "offset", "ink", "label"),
    "qrStickerH": ("size",),
    "footH": ("qrSize",),
    "token": ("name",),
}
TOKENS = ("paper", "ink", "body", "muted", "hard", "warm", "serif", "mono")

# 包内十套实测峰值：最大 6,383 字节（card）、最深 17 层（spec）、最多 691 个节点（card）。
# 这三条留了两三倍余量。最终数值是待拍项（方案 §五），但**两处必须相等**这条现在就能钉：
# 客户端那份 LIMITS 是唯一出处，种子只是搬运，pytest 与那把尺子各查一头。
LIMITS = {"max_bytes": 16384, "max_depth": 24, "max_nodes": 2000}
INTERPRETER_VERSION = 1

_ARITY = {**ARITH, **LOGIC, **CONV}


# ---------------------------------------------------------------- 形状

def _shape(t: Any):
    """返回 (种类, 内容) 或 (None, 错误话)。与 JS 那份 shape() 一一对应。"""
    if t is None or isinstance(t, (bool, int, float, str)):
        return "lit", t
    if not isinstance(t, (dict, list)):
        return None, f"不成形的值（{type(t).__name__}）"
    if isinstance(t, list):
        return "list", t
    if "prim" in t:
        if not isinstance(t["prim"], str):
            return None, "prim 得是个名字"
        extra = [k for k in t if k not in ("prim", "args")]
        if extra:
            return None, f"原语那一项里多了 {'、'.join(extra)}"
        args = t.get("args", {})
        if not isinstance(args, dict):
            return None, f"原语「{t['prim']}」的 args 得是个对象"
        return "prim", (t["prim"], args)
    if "obj" in t:
        extra = [k for k in t if k != "obj"]
        if extra:
            return None, f"obj 那一项里多了 {'、'.join(extra)}"
        if not isinstance(t["obj"], dict):
            return None, "obj 得是个键值对象"
        return "obj", t["obj"]
    if len(t) != 1:
        return None, f"只能有一个键，这里有 {len(t)} 个：{'、'.join(t)}"
    return "op", next(iter(t.items()))


def _step_shape(raw: Any):
    if not isinstance(raw, dict):
        return None, "一步得是个对象"
    if "let" in raw:
        extra = [k for k in raw if k not in ("let", "value")]
        if extra:
            return None, f"let 那一步里多了 {'、'.join(extra)}"
        if not isinstance(raw["let"], str) or not raw["let"]:
            return None, "let 要给一个变量名"
        if "value" not in raw:
            return None, f"let「{raw['let']}」少了 value"
        return "let", (raw["let"], raw["value"])
    if len(raw) != 1:
        return None, f"一步只能有一个键，这里有 {len(raw)} 个：{'、'.join(raw)}"
    kind = next(iter(raw))
    if kind not in STEPS:
        return None, f"不认的步型「{kind}」，能用的是 {'、'.join(STEPS)}"
    return kind, raw[kind]


# ---------------------------------------------------------------- 大小与深度

def canonical_json(v: Any) -> str:
    """按键名排序的紧凑 JSON。字节数上限按这个算，不然同一份配方会因为键序算出两个大小。"""
    return json.dumps(v, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _depth(v: Any) -> int:
    if isinstance(v, list):
        return 1 + max([_depth(x) for x in v], default=0)
    if isinstance(v, dict):
        return 1 + max([_depth(x) for x in v.values()], default=0)
    return 0


def _nodes(v: Any) -> int:
    if isinstance(v, list):
        return len(v) + sum(_nodes(x) for x in v)
    if isinstance(v, dict):
        return len(v) + sum(_nodes(x) for x in v.values())
    return 0


# ---------------------------------------------------------------- 静态检查

def _scan_term(t: Any, bad: list, where: str) -> None:
    kind, payload = _shape(t)
    if kind is None:
        bad.append(f"{where}: {payload}")
        return
    if kind == "lit":
        return
    if kind == "list":
        for i, x in enumerate(payload):
            _scan_term(x, bad, f"{where}[{i}]")
        return
    if kind == "prim":
        name, args = payload
        keys = PRIM_KEYS.get(name)
        if keys is None:
            bad.append(f"{where}: 原语「{name}」不在名单里")
            return
        for k in args:
            if k not in keys:
                bad.append(f"{where}: 原语「{name}」没有参数「{k}」，能用的是 {'、'.join(keys)}")
        for k in args:
            _scan_term(args[k], bad, f"{where} {name}.{k}")
        return
    if kind == "obj":
        for k, v in payload.items():
            _scan_term(v, bad, f"{where} obj.{k}")
        return
    name, a = payload
    if name in ("var", "lit"):
        if name == "var" and (not isinstance(a, str) or not a):
            bad.append(f"{where}: var 得是个名字")
        return
    if name == "if":
        if not isinstance(a, list) or len(a) != 3:
            bad.append(f"{where}: if 要 [条件, 真, 假] 三个参数")
            return
        for i, x in enumerate(a):
            _scan_term(x, bad, f"{where} if[{i}]")
        return
    want = _ARITY.get(name)
    if want is not None:
        args = a if isinstance(a, list) else [a]
        if want >= 0 and len(args) != want:
            bad.append(f"{where}: 算子「{name}」要 {want} 个参数，给了 {len(args)} 个")
        if want < 0 and len(args) < 1:
            bad.append(f"{where}: 算子「{name}」至少要一个参数")
        for i, x in enumerate(args):
            _scan_term(x, bad, f"{where} {name}[{i}]")
        return
    bad.append(f"{where}: 不认的算子「{name}」")


def _scan_steps(steps: Any, bad: list, where: str) -> None:
    if not isinstance(steps, list):
        bad.append(f"{where}: steps 得是个数组")
        return
    for i, raw in enumerate(steps):
        at = f"{where} 第 {i + 1} 步"
        kind, payload = _step_shape(raw)
        if kind is None:
            bad.append(f"{at}: {payload}")
            continue
        if kind == "let":
            _scan_term(payload[1], bad, f"{at} {payload[0]}")
            continue
        if kind == "do":
            _scan_term(payload, bad, f"{at} do")
            continue
        if kind == "emit":
            a = payload
            if not isinstance(a, dict):
                bad.append(f"{at}: emit 要给一个图层对象")
                continue
            op = a.get("k")
            fields = OP_KEYS.get(op if isinstance(op, str) else "")
            if fields is None:
                bad.append(f"{at}: 绘制 op「{op if op is not None else '（没写 k）'}」不在名单里")
                continue
            for k in a:
                if k == "k":
                    continue
                if k not in fields:
                    bad.append(f"{at}: op「{op}」没有字段「{k}」，能用的是 {'、'.join(fields)}")
                    continue
                _scan_term(a[k], bad, f"{at} {op}.{k}")
            continue
        if kind in ("emitOne", "emitMany"):
            _scan_term(payload, bad, f"{at} {kind}")
            continue
        if kind == "if":
            a = payload
            if not isinstance(a, dict):
                bad.append(f"{at}: if 要给 {{cond, then, else}}")
                continue
            _scan_term(a.get("cond"), bad, f"{at} if.cond")
            _scan_steps(a.get("then"), bad, f"{at} if.then")
            if a.get("else") is not None:
                _scan_steps(a["else"], bad, f"{at} if.else")
            for k in a:
                if k not in ("cond", "then", "else"):
                    bad.append(f"{at}: if 项里多了 {k}")
            continue
        # 只剩 each 这一步型了（STEPS 已在 _step_shape 里挡过一遍）
        a = payload
        if not isinstance(a, dict):
            bad.append(f"{at}: each 要给 {{over, as, index, do}}")
            continue
        _scan_term(a.get("over"), bad, f"{at} each.over")
        if not isinstance(a.get("as"), str) or not a["as"]:
            bad.append(f"{at}: each 少了 as")
        _scan_steps(a.get("do"), bad, f"{at} each.do")
        for k in a:
            if k not in ("over", "as", "index", "do"):
                bad.append(f"{at}: each 项里多了 {k}")


def validate_recipe(recipe: Any) -> list[str]:
    """返回错误清单，空列表＝这份配方这一版解释器读得懂。写回前、下发前都过它。

    和客户端那条"整条配方一起丢"的规则是一对：这里放行了而客户端读不懂，
    结果不是少一层，而是整条退回包内那一份——所以宁可在这里就报给写配方的人。
    """
    if not isinstance(recipe, dict):
        return ["配方得是个 JSON 对象"]
    bad: list[str] = []
    if not isinstance(recipe.get("id"), str) or not recipe["id"]:
        bad.append("少了 id")
    mv = recipe.get("min_version")
    if not isinstance(mv, int) or isinstance(mv, bool) or mv < 1:
        bad.append("min_version 得是 ≥1 的整数")
    elif mv > INTERPRETER_VERSION:
        bad.append(f"这份配方要 {mv} 版解释器，现在这份只会读到 {INTERPRETER_VERSION} 版")
    steps = recipe.get("steps")
    if not isinstance(steps, list) or not steps:
        bad.append("steps 得是非空数组")
    else:
        _scan_steps(steps, bad, "steps")
        if not any(isinstance(s, dict) and s.get("let") == "height" for s in steps):
            bad.append("steps 里必须有一步 let 出 height")
    n_bytes = len(canonical_json(recipe).encode("utf-8"))
    if n_bytes > LIMITS["max_bytes"]:
        bad.append(f"整条配方 {n_bytes} 字节，超过上限 {LIMITS['max_bytes']}")
    depth = _depth(recipe)
    if depth > LIMITS["max_depth"]:
        bad.append(f"嵌套 {depth} 层，超过上限 {LIMITS['max_depth']}")
    nodes = _nodes(recipe)
    if nodes > LIMITS["max_nodes"]:
        bad.append(f"{nodes} 个节点，超过上限 {LIMITS['max_nodes']}")
    return bad


def recipe_whitelist() -> dict:
    """这份 Python 名单的导出形态，键名与 docs/工具/出-模板配方种子.js 对齐，给 pytest 比。"""
    return {
        "interpreter_version": INTERPRETER_VERSION,
        "steps": list(STEPS),
        "arith": ARITH,
        "logic": LOGIC,
        "conv": CONV,
        "term_forms": list(TERM_FORMS),
        "op_keys": {k: list(v) for k, v in OP_KEYS.items()},
        "prim_keys": {k: list(v) for k, v in PRIM_KEYS.items()},
        "tokens": list(TOKENS),
        "limits": dict(LIMITS),
    }
