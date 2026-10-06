"""把"对外接口长什么样"抄成一份可比对的快照。

为什么要有这一份：2.0 这条线要同时服务**已经发出去的老包**（现网那批 1.9.x 装在别人手机里，
不会因为我们发了新版就更新）。老包里的字段名是抄在代码里的，服务端改一个名字，
那一版小程序在那台手机上就当场读成空。这类破坏只有一种抓法：拿一份基线逐字段对。

口径（`diff()` 里钉死，别在调用方各写一份）：
- **响应字段只增不改**：基线里有的字段必须还在、类型必须还是那一个；新增字段随便加
  （老包读不到它，也就不会因为它崩）。
- **请求必填只能减不能加**：新加一个必填字段，等于让每一个还没更新的老包 422。
  基线里可选的字段，2.0 也不许把它改成必填——同一个理由。
- **路由不许消失**：路径或方法删掉，老包打过来是 404/405，比字段改名更难查。

跑法（生成/刷新基线，一般只在 1.x 线上做这件事）：
    cd backend && .venv/bin/python scripts/dump_api_contract.py --write
校验（2.0 分支上每次改接口之后）：
    cd backend && .venv/bin/python -m pytest tests/test_api_contract_1x.py -q
"""
import json
import os
import sys
from pathlib import Path

# 只要 app.openapi()，不连库、不起服务；这几个环境变量是让 import 阶段不炸（与 tests 同一套）
os.environ.setdefault("DATABASE_URL", "sqlite:////tmp/tumaibiji_contract.db")
os.environ.setdefault("JWT_SECRET_KEY", "contract-dump-not-a-real-secret")
os.environ.setdefault("EXTRACT_PROVIDER", "none")

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
CONTRACT_PATH = BACKEND / "contract" / "1x-response-fields.json"

MAX_DEPTH = 4  # 配方那种嵌套结构到第四层还在展开就停，防止自引用模型绕死


def _ref_name(schema: dict) -> str:
    ref = schema.get("$ref", "")
    return ref.rsplit("/", 1)[-1] if ref else ""


def _unwrap(schema: dict) -> tuple:
    """回 (真正的 schema, 类型字符串)。可空字段摊成 `string?`。

    FastAPI 对 `x: str | None` 发的是 `anyOf: [{type: string}, {type: null}]`，
    直接取 `.type` 会得到 None（快照里那一格就写成 "object"，等于没记）。
    """
    ref = _ref_name(schema)
    if ref:
        return schema, ref
    for alt in schema.get("anyOf") or schema.get("oneOf") or []:
        if alt.get("type") != "null":
            inner, kind = _unwrap(alt)
            return inner, (kind or "object") + "?"
    return schema, schema.get("type") or ("array" if "items" in schema else "object")


def _flatten(schema: dict, components: dict, prefix: str, out: dict, depth: int) -> None:
    """把一个 schema 摊成 {"a.b": "string", "items[].id": "integer", ...}。

    类型写成字符串，比对才稳（比 dict 相等会在多出来的元数据上假红）。
    """
    if not isinstance(schema, dict) or depth > MAX_DEPTH:
        return
    ref = _ref_name(schema)
    if ref:
        _flatten(components.get(ref, {}), components, prefix, out, depth + 1)
        return
    if schema.get("allOf"):  # 组合出来的模型，逐块摊
        for part in schema["allOf"]:
            _flatten(part, components, prefix, out, depth + 1)
        return
    body, kind = _unwrap(schema)
    if kind.startswith("array"):
        items = body.get("items", {})
        inner, item_kind = _unwrap(items)
        out[prefix[:-1] or "[]"] = f"array<{item_kind}>"
        # 数组元素下面的字段带 `[].` 前缀，这样 `assets[].cloud_url` 这种键名一眼能读，
        # 而且"公开页那一列换了类型"这种破坏抓得住。
        _flatten(inner, components, prefix + "[].", out, depth + 1)
        return
    props = body.get("properties")
    if props:
        for name, sub in props.items():
            key = f"{prefix}{name}"
            _, sub_kind = _unwrap(sub)
            out[key] = sub_kind
            _flatten(sub, components, key + ".", out, depth + 1)
    elif kind == "object" and body.get("additionalProperties"):
        out[prefix + "*"] = "object"


def _required_of(schema: dict, components: dict) -> list:
    ref = _ref_name(schema)
    if ref:
        return _required_of(components.get(ref, {}), components)
    return sorted(schema.get("required") or [])


def collect(app) -> dict:
    """{ "GET /api/notes/{note_id}": {"response": {...}, "request_required": [...]}}"""
    spec = app.openapi()
    components = spec.get("components", {}).get("schemas", {})
    out = {}
    for path, ops in spec.get("paths", {}).items():
        for method, op in ops.items():
            if not isinstance(op, dict) or method.upper() in ("HEAD", "OPTIONS"):
                continue
            key = f"{method.upper()} {path}"
            entry = {"response": {}, "request_required": [], "response_required": []}
            body = (op.get("requestBody") or {}).get("content") or {}
            for media in ("application/json", "application/x-www-form-urlencoded"):
                if media in body:
                    schema = body[media].get("schema", {})
                    flat = {}
                    _flatten(schema, components, "", flat, 0)
                    entry["request_required"] = _required_of(schema, components)
                    entry["request"] = flat
                    break
            resp = (op.get("responses") or {}).get("200") or {}
            content = (resp.get("content") or {}).get("application/json", {}).get("schema", {})
            _flatten(content, components, "", entry["response"], 0)
            entry["response_required"] = _required_of(content, components)
            out[key] = {k: v for k, v in entry.items() if v}
    return {k: out[k] for k in sorted(out)}


def load_baseline(path: Path = CONTRACT_PATH) -> dict:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def diff(baseline: dict, current: dict) -> list:
    """回一列表述清楚的破坏点。空表 = 老包打这一版不会读到空字段、不会 422、不会 404。"""
    bad = []
    for key, base in baseline.items():
        cur = current.get(key)
        if cur is None:
            bad.append(f"路由没了：{key}（现网老包打过来是 404/405）")
            continue
        for name, kind in (base.get("response") or {}).items():
            got = (cur.get("response") or {}).get(name)
            if got is None:
                bad.append(f"响应字段没了：{key} 的 {name}（老包里那行读它就成空）")
            elif got != kind:
                bad.append(f"响应字段换了类型：{key} 的 {name} {kind} → {got}")
        added_required = set(cur.get("request_required") or []) - set(base.get("request_required") or [])
        for name in sorted(added_required):
            bad.append(f"请求新加必填：{key} 的 {name}（老包不会发这个字段，直接 422）")
    return bad


def _git_rev() -> str:
    """这份快照是从哪一个提交抄的。必须写进文件里：下一次有人问"基线是哪一版的字段"，
    答案不能靠记忆（本项目已经因为"引外部行号不写 commit"漂过两次）。"""
    try:
        import subprocess

        return subprocess.run(
            ["git", "-C", str(BACKEND), "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def main() -> int:
    if not BACKEND.joinpath("app").exists():
        print("!! 不在 backend 目录下跑不动（要 import app）")
        return 2
    from app.main import app

    data = collect(app)
    if "--check" in sys.argv:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0
    payload = {"_meta": {"source_commit": _git_rev(), "routes": len(data)}, **data}
    CONTRACT_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONTRACT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已写 {CONTRACT_PATH}：{len(data)} 条路由 / 基线 commit {payload['_meta']['source_commit']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
